/**
 * Streaming Server STT Provider (§2, T4, T5).
 * Connects to port 8001 microservice over WebSocket for faster-whisper or Vosk.
 * Implements ISTTProvider and SpeechToText lifecycle.
 */

import {
  ISTTProvider,
  SpeechToText,
  SpeechError,
  STTProviderConfig,
  STTProviderMetrics,
  STTState,
  TranscriptEvent,
} from './types';
import { TranscriptAssembler } from './transcriptAssembler';

export type StreamingServerProviderType = 'faster-whisper' | 'vosk';

export interface StreamingServerSTTOptions extends STTProviderConfig {
  provider?: StreamingServerProviderType;
  assembler?: TranscriptAssembler;
}

const INLINE_WORKLET_CODE = `
class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = 16000;
    this.sourceSampleRate = sampleRate;
    this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;
    const frameMs = (options && options.processorOptions && options.processorOptions.frameMs) || 100;
    this.targetFrameSize = Math.round((this.targetSampleRate * frameMs) / 1000);
    this.buffer = new Float32Array(this.targetFrameSize * 2);
    this.bufferIndex = 0;
    this.resampleCounter = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    if (this.resampleRatio === 1) {
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];
        if (this.bufferIndex >= this.targetFrameSize) this.flushFrame();
      }
    } else {
      for (let i = 0; i < channelData.length; i++) {
        this.resampleCounter += 1;
        if (this.resampleCounter >= this.resampleRatio) {
          this.resampleCounter -= this.resampleRatio;
          this.buffer[this.bufferIndex++] = channelData[i];
          if (this.bufferIndex >= this.targetFrameSize) this.flushFrame();
        }
      }
    }
    return true;
  }
  flushFrame() {
    const pcm16 = new Int16Array(this.targetFrameSize);
    for (let i = 0; i < this.targetFrameSize; i++) {
      const sample = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    const rem = this.bufferIndex - this.targetFrameSize;
    if (rem > 0) {
      this.buffer.copyWithin(0, this.targetFrameSize, this.bufferIndex);
      this.bufferIndex = rem;
    } else {
      this.bufferIndex = 0;
    }
  }
}
registerProcessor('pcm-server-worklet', PCMWorkletProcessor);
`;

export class StreamingServerSTT implements ISTTProvider, SpeechToText {
  public readonly id: string;
  public readonly name: string;

  private providerType: StreamingServerProviderType;
  private wsUrl: string;
  private frameMs: number;
  private initialPrompt: string;
  private audioStream: MediaStream | null = null;
  private assembler: TranscriptAssembler;

  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private state: STTState = 'idle';
  private desiredListening: boolean = false;
  private speechStartTime: number | null = null;
  private firstPartialLatencyMs: number | null = null;
  private errorCount: number = 0;
  private wordsCaptured: number = 0;
  private isConnected: boolean = false;

  private partialListeners: Array<(text: string, timestamp: number) => void> = [];
  private finalListeners: Array<(text: string, timestamp: number) => void> = [];
  private errorListeners: Array<(err: SpeechError) => void> = [];
  private transcriptListeners: Array<(event: TranscriptEvent) => void> = [];
  private stateListeners: Array<(state: STTState) => void> = [];

  constructor(options: StreamingServerSTTOptions = {}) {
    this.providerType = options.provider || 'faster-whisper';
    this.id = this.providerType;
    this.name = this.providerType === 'faster-whisper' ? 'Streaming Neural STT' : 'Streaming Vosk STT';
    this.frameMs = options.frameMs || 100;
    this.initialPrompt = options.initialPrompt || '';
    this.audioStream = options.audioStream || null;
    this.assembler = options.assembler || new TranscriptAssembler();

    const defaultBaseWs = import.meta.env.VITE_STT_SERVICE_WS_URL || 'ws://127.0.0.1:8001/ws/stt';
    this.wsUrl = options.wsUrl || `${defaultBaseWs}?provider=${this.providerType}`;
  }

  public get isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasAudioWorklet = Boolean(window.AudioContext && 'audioWorklet' in window.AudioContext.prototype);
    return Boolean(window.WebSocket && hasAudioWorklet);
  }

  public get isListening(): boolean {
    return this.state === 'listening';
  }

  public setAssembler(assembler: TranscriptAssembler): void {
    this.assembler = assembler;
  }

  public getAssembler(): TranscriptAssembler {
    return this.assembler;
  }

  public init(config?: STTProviderConfig): void {
    if (config) {
      if (config.frameMs) this.frameMs = config.frameMs;
      if (config.wsUrl) this.wsUrl = config.wsUrl;
      if (config.initialPrompt) this.initialPrompt = config.initialPrompt;
      if (config.audioStream !== undefined) this.audioStream = config.audioStream;
    }
  }

  public start(): void {
    if (!this.isSupported) {
      this.emitError({
        error: 'not-supported',
        message: 'AudioWorklet or WebSocket is not supported in this browser.',
        isFatal: true,
      });
      return;
    }

    this.desiredListening = true;
    this.setState('listening');
    this.speechStartTime = Date.now();
    this.connect();
  }

  public stop(): void {
    this.desiredListening = false;
    this.teardownAudio();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'stop' }));
      } catch {}
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.setState('idle');
  }

  public abort(): void {
    this.stop();
  }

  public resetTranscript(): void {
    this.assembler.reset();
    this.firstPartialLatencyMs = null;
    this.wordsCaptured = 0;
  }

  public seal(): string {
    return this.assembler.seal();
  }

  public hasPendingInterim(): boolean {
    return this.assembler.hasPendingInterim();
  }

  public getFullTranscript(): string {
    return this.assembler.getText();
  }

  public onPartial(callback: (text: string, timestamp: number) => void): () => void {
    this.partialListeners.push(callback);
    return () => {
      this.partialListeners = this.partialListeners.filter((cb) => cb !== callback);
    };
  }

  public onFinal(callback: (text: string, timestamp: number) => void): () => void {
    this.finalListeners.push(callback);
    return () => {
      this.finalListeners = this.finalListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (err: SpeechError) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public onTranscript(callback: (event: TranscriptEvent) => void): () => void {
    this.transcriptListeners.push(callback);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((cb) => cb !== callback);
    };
  }

  public onStateChange(callback: (state: STTState) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  public getMetrics(): STTProviderMetrics {
    return {
      providerId: this.id,
      providerName: this.name,
      firstPartialLatencyMs: this.firstPartialLatencyMs ?? undefined,
      wordsCaptured: this.wordsCaptured,
      connected: this.isConnected,
      errorCount: this.errorCount,
    };
  }

  private setState(newState: STTState): void {
    this.state = newState;
    this.stateListeners.forEach((cb) => cb(newState));
  }

  private emitError(err: SpeechError): void {
    this.errorCount += 1;
    this.errorListeners.forEach((cb) => cb(err));
  }

  private async fetchTicket(): Promise<string | null> {
    try {
      const ticketUrl = import.meta.env.VITE_STT_TICKET_URL || 'http://127.0.0.1:8001/api/v1/stt/ticket';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(ticketUrl, { method: 'POST', signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return data.ticket || null;
      }
    } catch {
      // Dev mode fallback
    }
    return 'dev-stt-ticket';
  }

  private async connect(): Promise<void> {
    try {
      const ticket = await this.fetchTicket();
      let connectionUrl = this.wsUrl;
      const delimiter = connectionUrl.includes('?') ? '&' : '?';
      if (ticket) {
        connectionUrl = `${connectionUrl}${delimiter}ticket=${encodeURIComponent(ticket)}`;
      }

      this.ws = new WebSocket(connectionUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = async () => {
        this.isConnected = true;
        this.ws?.send(
          JSON.stringify({
            type: 'start',
            sample_rate: 16000,
            frame_ms: this.frameMs,
            initial_prompt: this.initialPrompt,
          })
        );
        await this.startAudioWorklet();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript') {
              const text = (data.text || '').trim();
              const isFinal = Boolean(data.is_final);
              const ts = data.timestamp || Date.now();

              if (text) {
                if (!this.firstPartialLatencyMs && this.speechStartTime) {
                  this.firstPartialLatencyMs = Date.now() - this.speechStartTime;
                }

                // Update assembler with streaming chunk (auto-keys sequential final chunks)
                this.assembler.appendChunk(text, isFinal);
                const fullText = this.assembler.getText();
                this.wordsCaptured = fullText.split(/\s+/).filter(Boolean).length;

                if (isFinal) {
                  this.finalListeners.forEach((cb) => cb(text, ts));
                } else {
                  this.partialListeners.forEach((cb) => cb(text, ts));
                }

                this.transcriptListeners.forEach((cb) =>
                  cb({
                    text,
                    isFinal,
                    timestamp: ts,
                    fullTranscript: fullText,
                  })
                );
              }
            }
          }
        } catch (err) {
          console.warn('[StreamingServerSTT] Message parse error:', err);
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.emitError({
          error: 'network',
          message: 'WebSocket connection refused or dropped.',
          isFatal: false,
        });
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.desiredListening && this.state === 'listening') {
          this.emitError({
            error: 'network',
            message: 'WebSocket closed unexpectedly.',
            isFatal: false,
          });
        }
      };
    } catch (exc: unknown) {
      const msg = exc instanceof Error ? exc.message : String(exc);
      this.emitError({
        error: 'network',
        message: `WebSocket initialization error: ${msg}`,
        isFatal: false,
      });
    }
  }

  private async startAudioWorklet(): Promise<void> {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });

      let blobUrl = '';
      try {
        const blob = new Blob([INLINE_WORKLET_CODE], { type: 'application/javascript' });
        blobUrl = URL.createObjectURL(blob);
        await this.audioContext.audioWorklet.addModule(blobUrl);
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }

      let stream = this.audioStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-server-worklet', {
        processorOptions: { frameMs: this.frameMs },
      });

      this.workletNode.port.onmessage = (event: MessageEvent) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && event.data instanceof ArrayBuffer) {
          this.ws.send(event.data);
        }
      };

      this.sourceNode.connect(this.workletNode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitError({
        error: 'audio-capture',
        message: `Audio capture error: ${msg}`,
        isFatal: true,
      });
    }
  }

  private teardownAudio(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
