/**
 * Nemotron Streaming STT Provider
 *
 * Implements the SpeechToText interface using a dedicated WebSocket streaming
 * service on port 8001 (NVIDIA NeMo / Nemotron Cache-Aware Streaming ASR).
 *
 * Captures 16 kHz mono 16-bit linear PCM frames via AudioWorklet (80-160 ms chunks).
 * Handles partial and final transcript messages, server-side VAD, and provides
 * seamless auto-fallback to BrowserSpeechToText if the service is unreachable.
 */

import { SpeechToText, TranscriptEvent, SpeechError, STTState } from './types';
import { TranscriptStitcher } from './transcriptStitcher';
import { BrowserSpeechToText } from './browserSTT';

export interface NemotronSTTOptions {
  wsUrl?: string;
  frameMs?: number; // 80 - 160 ms (default: 100 ms)
  attContextSize?: [number, number]; // default: [70, 1]
  audioStream?: MediaStream | null;
  autoFallback?: boolean;
}

// Inline fallback code for AudioWorklet if pcm-worklet.js cannot be fetched
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
registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);
`;

export class NemotronStreamingSTT implements SpeechToText {
  private wsUrl: string;
  private frameMs: number;
  private attContextSize: [number, number];
  private autoFallback: boolean;

  private state: STTState = 'idle';
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stitcher: TranscriptStitcher = new TranscriptStitcher();

  private fallbackProvider: BrowserSpeechToText | null = null;
  private isUsingFallback: boolean = false;

  private transcriptListeners: Array<(event: TranscriptEvent) => void> = [];
  private errorListeners: Array<(err: SpeechError) => void> = [];
  private stateListeners: Array<(state: STTState) => void> = [];

  constructor(options: NemotronSTTOptions = {}) {
    const defaultWsUrl =
      import.meta.env.VITE_NEMOTRON_STT_WS_URL || 'ws://127.0.0.1:8001/ws/stt';
    this.wsUrl = options.wsUrl || defaultWsUrl;
    this.frameMs = options.frameMs || 100; // 100 ms = 1600 samples
    this.attContextSize = options.attContextSize || [70, 1];
    this.mediaStream = options.audioStream || null;
    this.autoFallback = options.autoFallback !== false;
  }

  public get isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasAudioWorklet = Boolean(window.AudioContext && 'audioWorklet' in window.AudioContext.prototype);
    return Boolean(window.WebSocket && hasAudioWorklet);
  }

  public get isListening(): boolean {
    if (this.isUsingFallback && this.fallbackProvider) {
      return this.fallbackProvider.isListening;
    }
    return this.state === 'listening';
  }

  public setAudioStream(stream: MediaStream | null): void {
    this.mediaStream = stream;
  }

  public start(): void {
    if (this.isUsingFallback && this.fallbackProvider) {
      this.fallbackProvider.start();
      return;
    }

    if (!this.isSupported) {
      this.handleFallback('AudioWorklet or WebSocket is not supported in this browser environment.');
      return;
    }

    this.setState('listening');
    this.connectWebSocketAndWorklet();
  }

  public stop(): void {
    if (this.isUsingFallback && this.fallbackProvider) {
      this.fallbackProvider.stop();
      return;
    }

    this.teardownAudio();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'stop' }));
      } catch {}
      this.ws.close();
      this.ws = null;
    }
    this.setState('idle');
  }

  public abort(): void {
    if (this.isUsingFallback && this.fallbackProvider) {
      this.fallbackProvider.abort();
      return;
    }
    this.stop();
  }

  public resetTranscript(): void {
    if (this.isUsingFallback && this.fallbackProvider) {
      this.fallbackProvider.resetTranscript();
      return;
    }
    this.stitcher.reset();
  }

  public getFullTranscript(): string {
    if (this.isUsingFallback && this.fallbackProvider) {
      return this.fallbackProvider.getFullTranscript();
    }
    return this.stitcher.getFullTranscript();
  }

  public onTranscript(callback: (event: TranscriptEvent) => void): () => void {
    this.transcriptListeners.push(callback);
    if (this.fallbackProvider) {
      this.fallbackProvider.onTranscript(callback);
    }
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (err: SpeechError) => void): () => void {
    this.errorListeners.push(callback);
    if (this.fallbackProvider) {
      this.fallbackProvider.onError(callback);
    }
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public onStateChange(callback: (state: STTState) => void): () => void {
    this.stateListeners.push(callback);
    if (this.fallbackProvider) {
      this.fallbackProvider.onStateChange(callback);
    }
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  private setState(newState: STTState): void {
    this.state = newState;
    this.stateListeners.forEach((cb) => cb(newState));
  }

  private emitTranscript(event: TranscriptEvent): void {
    this.transcriptListeners.forEach((cb) => cb(event));
  }

  private emitError(err: SpeechError): void {
    this.errorListeners.forEach((cb) => cb(err));
  }

  private async connectWebSocketAndWorklet(): Promise<void> {
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = async () => {
        if (import.meta.env.DEV) {
          console.debug('[Nemotron STT] Connected to streaming server on port 8001');
        }

        // Send initial handshake configuration with att_context_size
        this.ws?.send(
          JSON.stringify({
            type: 'start',
            sample_rate: 16000,
            att_context_size: this.attContextSize,
            frame_ms: this.frameMs,
          })
        );

        // Start AudioWorklet processing once socket is established
        await this.startAudioWorklet();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript') {
              const text = data.text || '';
              const isFinal = Boolean(data.is_final);
              const { fullTranscript } = this.stitcher.append(text, isFinal);

              this.emitTranscript({
                text: text.trim(),
                isFinal,
                timestamp: data.timestamp || Date.now(),
                fullTranscript,
              });
            }
          }
        } catch (parseErr) {
          console.warn('[Nemotron STT] Malformed message received:', parseErr);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[Nemotron STT] WebSocket connection error:', err);
        // If 8001 failed, attempt fallback port 8002 before switching to browser speech
        if (this.wsUrl.includes('8001')) {
          this.wsUrl = this.wsUrl.replace('8001', '8002');
          console.info('[Nemotron STT] Retrying streaming connection on fallback port 8002...');
          this.connectWebSocketAndWorklet();
          return;
        }

        if (this.autoFallback && !this.isUsingFallback) {
          this.handleFallback('Nemotron STT service unavailable. Falling back to Browser Speech.');
        } else {
          this.setState('error');
          this.emitError({
            error: 'network',
            message: 'Nemotron STT streaming service connection failed.',
            isFatal: false,
          });
        }
      };

      this.ws.onclose = () => {
        if (this.state === 'listening' && !this.isUsingFallback) {
          if (this.autoFallback) {
            this.handleFallback('Nemotron STT streaming service disconnected.');
          } else {
            this.setState('idle');
          }
        }
      };
    } catch (exc: unknown) {
      const msg = exc instanceof Error ? exc.message : String(exc);
      this.handleFallback(`Failed to initialize Nemotron WebSocket: ${msg}`);
    }
  }

  private async startAudioWorklet(): Promise<void> {
    try {
      // 1. Acquire audio stream if not already supplied
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      }

      // 2. Initialize AudioContext
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();

      // 3. Load PCM AudioWorklet Processor (attempt external file first, then inline Blob URL)
      try {
        await this.audioContext.audioWorklet.addModule('/pcm-worklet.js');
      } catch {
        const blob = new Blob([INLINE_WORKLET_CODE], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        await this.audioContext.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);
      }

      // 4. Instantiate Worklet Node and connect MediaStream source
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-worklet-processor', {
        processorOptions: { frameMs: this.frameMs },
      });

      // 5. Send raw 16 kHz 16-bit PCM frames to WebSocket
      this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Zero audio storage: stream memory buffer immediately over socket
          this.ws.send(event.data);
        }
      };

      this.sourceNode.connect(this.workletNode);
      // Connect to destination to keep pipeline alive if needed, or leave disconnected
    } catch (workletErr) {
      console.warn('[Nemotron STT] AudioWorklet init failed, falling back:', workletErr);
      this.handleFallback('Could not initialize AudioWorklet PCM processor.');
    }
  }

  private teardownAudio(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  private handleFallback(reason: string): void {
    if (import.meta.env.DEV) {
      console.info(`[Nemotron STT] Switching to Browser Speech API: ${reason}`);
    }

    this.teardownAudio();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.isUsingFallback = true;
    this.fallbackProvider = new BrowserSpeechToText();

    // Reattach registered listeners to the fallback provider
    this.transcriptListeners.forEach((cb) => this.fallbackProvider?.onTranscript(cb));
    this.errorListeners.forEach((cb) => this.fallbackProvider?.onError(cb));
    this.stateListeners.forEach((cb) => this.fallbackProvider?.onStateChange(cb));

    // If we were supposed to be listening, start the fallback
    if (this.state === 'listening') {
      this.fallbackProvider.start();
    }
  }
}
