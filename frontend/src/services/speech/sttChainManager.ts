/**
 * Resilient STT Provider Chain Manager (§B3 & T5).
 *
 * Implements a multi-stage speech-to-text fallback chain:
 *   1. Primary: 'faster-whisper' (Streaming Neural ASR on port 8001 with technical term biasing)
 *   2. Fallback 1: 'vosk' (Ultra-low latency streaming ASR on port 8001)
 *   3. Fallback 2: 'browser' (Browser Web Speech API with T2 TranscriptAssembler fixes)
 *   4. Fallback 3: 'typed' (Candidate typed textarea fallback)
 *
 * Automatic Failover Triggers (§T5):
 *   - Connection refused / WS drop > 1.5 s without reconnect.
 *   - No partial text received after 2.5 s of detected speech.
 *   - Unrecoverable provider error.
 *   - Zero Word Loss Hand-off: Next provider shares the same TranscriptAssembler.
 *   - Calm in-app notice: "Switched to backup voice recognition" (no vendor/model names).
 */

import { SpeechToText, TranscriptEvent, SpeechError, STTState } from './types';
import { BrowserSpeechToText } from './browserSTT';
import { StreamingServerSTT } from './streamingServerSTT';
import { NemotronSTTOptions } from './nemotronSTT';
import { TranscriptAssembler } from './transcriptAssembler';

export type STTProviderMode =
  | 'faster-whisper'
  | 'vosk'
  | 'browser'
  | 'typed'
  | 'nemotron'; // Alias for faster-whisper backward compatibility

export interface STTChainStatus {
  activeProvider: STTProviderMode;
  isReconnecting: boolean;
  reconnectAttempt: number;
  maxAttempts: number;
  statusNotice: string | null;
  isExhausted: boolean;
}

export interface STTChainManagerOptions extends NemotronSTTOptions {
  chain?: STTProviderMode[];
  maxRetryAttempts?: number;
  retryBackoffsMs?: number[];
  wsFailoverTimeoutMs?: number;
  speechStallTimeoutMs?: number;
  onChainStatusChange?: (status: STTChainStatus) => void;
}

const DEFAULT_RETRY_BACKOFFS = [300, 800, 1500];
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_WS_FAILOVER_TIMEOUT_MS = 1500; // Trigger failover if WS down > 1.5s
const DEFAULT_SPEECH_STALL_TIMEOUT_MS = 2500; // Trigger failover if 2.5s speech with 0 partials

export function parseConfiguredProviderChain(): STTProviderMode[] {
  // localStorage chain overrides are strictly disabled in production builds
  if (!import.meta.env.PROD && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    const override = window.localStorage.getItem('STT_PROVIDER_CHAIN');
    if (override) {
      const parts = override.split(',').map((s) => s.trim().toLowerCase()) as STTProviderMode[];
      if (parts.length > 0) return parts;
    }
  }

  const envChain = (import.meta.env.VITE_STT_PROVIDER_CHAIN || '').toLowerCase().trim();
  if (envChain) {
    const parts = envChain.split(',').map((s: string) => s.trim()) as STTProviderMode[];
    if (parts.length > 0) return parts;
  }

  // Default selection-and-fallback chain (§T5, §B3)
  return ['browser', 'nemotron', 'typed'];
}

export class STTChainManager implements SpeechToText {
  private chain: STTProviderMode[];
  private activeProviderIndex: number = 0;
  private currentSTT: SpeechToText | null = null;
  private options: STTChainManagerOptions;

  // Master transcript assembler retained across mid-answer failovers (§T5)
  private masterAssembler: TranscriptAssembler = new TranscriptAssembler();

  private isReconnecting: boolean = false;
  private reconnectAttempt: number = 0;
  private maxAttempts: number;
  private retryBackoffsMs: number[];
  private wsFailoverTimeoutMs: number;
  private speechStallTimeoutMs: number;
  private statusNotice: string | null = null;
  private isExhausted: boolean = false;

  private retryTimer: any = null;
  private clearNoticeTimer: any = null;
  private wsDropTimer: any = null;
  private speechStallTimer: any = null;

  private desiredListening: boolean = false;
  private isSpeechActive: boolean = false;

  private transcriptListeners: Array<(event: TranscriptEvent) => void> = [];
  private errorListeners: Array<(err: SpeechError) => void> = [];
  private stateListeners: Array<(state: STTState) => void> = [];
  private chainStatusListeners: Array<(status: STTChainStatus) => void> = [];

  private currentSTTUnsubs: Array<() => void> = [];

  constructor(options: STTChainManagerOptions = {}) {
    this.options = options;
    this.chain = options.chain && options.chain.length > 0 ? options.chain : parseConfiguredProviderChain();
    this.maxAttempts = options.maxRetryAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBackoffsMs = options.retryBackoffsMs ?? DEFAULT_RETRY_BACKOFFS;
    this.wsFailoverTimeoutMs = options.wsFailoverTimeoutMs ?? DEFAULT_WS_FAILOVER_TIMEOUT_MS;
    this.speechStallTimeoutMs = options.speechStallTimeoutMs ?? DEFAULT_SPEECH_STALL_TIMEOUT_MS;

    if (options.onChainStatusChange) {
      this.chainStatusListeners.push(options.onChainStatusChange);
    }

    this.initActiveProvider();
  }

  public get activeProvider(): STTProviderMode {
    return this.chain[this.activeProviderIndex] || 'typed';
  }

  public get isSupported(): boolean {
    if (this.activeProvider === 'typed') return true;
    return this.currentSTT ? this.currentSTT.isSupported : false;
  }

  public get isListening(): boolean {
    if (this.isReconnecting) return false;
    return this.currentSTT ? this.currentSTT.isListening : false;
  }

  public get isRestarting(): boolean {
    if (this.isReconnecting) return true;
    return Boolean((this.currentSTT as any)?.isRestarting);
  }

  public hasPendingInterim(): boolean {
    return this.masterAssembler.hasPendingInterim();
  }

  public getChainStatus(): STTChainStatus {
    return {
      activeProvider: this.activeProvider,
      isReconnecting: this.isReconnecting,
      reconnectAttempt: this.reconnectAttempt,
      maxAttempts: this.maxAttempts,
      statusNotice: this.statusNotice,
      isExhausted: this.isExhausted,
    };
  }

  public onChainStatusChange(callback: (status: STTChainStatus) => void): () => void {
    this.chainStatusListeners.push(callback);
    callback(this.getChainStatus());
    return () => {
      this.chainStatusListeners = this.chainStatusListeners.filter((cb) => cb !== callback);
    };
  }

  public switchToProvider(provider: STTProviderMode): void {
    const idx = this.chain.indexOf(provider);
    if (idx !== -1) {
      this.activeProviderIndex = idx;
    } else {
      this.chain = [provider, ...this.chain.filter((p) => p !== provider)];
      this.activeProviderIndex = 0;
    }
    this.reconnectAttempt = 0;
    this.isReconnecting = false;
    this.isExhausted = provider === 'typed';
    this.initActiveProvider();
    if (this.desiredListening && this.currentSTT) {
      this.currentSTT.start();
    }
    this.notifyChainStatus();
  }

  private notifyChainStatus(): void {
    const status = this.getChainStatus();
    this.chainStatusListeners.forEach((cb) => {
      try {
        cb(status);
      } catch (err) {
        console.error('[STTChainManager] Error in chain status listener:', err);
      }
    });
  }

  private initActiveProvider(): void {
    this.cleanUpCurrentSTT();

    const providerType = this.activeProvider;

    if (providerType === 'typed') {
      this.currentSTT = null;
      this.isExhausted = true;
      this.notifyChainStatus();
      return;
    }

    if (providerType === 'faster-whisper' || providerType === 'nemotron') {
      this.currentSTT = new StreamingServerSTT({
        ...this.options,
        provider: 'faster-whisper',
        assembler: this.masterAssembler,
      });
    } else if (providerType === 'vosk') {
      this.currentSTT = new StreamingServerSTT({
        ...this.options,
        provider: 'vosk',
        assembler: this.masterAssembler,
      });
    } else {
      // Default: 'browser'
      this.currentSTT = new BrowserSpeechToText(this.masterAssembler);
    }

    // Attach listeners
    const unsubTranscript = this.currentSTT.onTranscript((event) => {
      if (this.isReconnecting) {
        this.clearRetry();
      }
      this.clearSpeechStallTimer();
      this.transcriptListeners.forEach((cb) => cb(event));
    });

    const unsubState = this.currentSTT.onStateChange((state) => {
      if (state === 'listening' && this.isReconnecting) {
        this.clearRetry();
      }
      this.stateListeners.forEach((cb) => cb(state));
    });

    const unsubError = this.currentSTT.onError((err) => {
      this.handleProviderError(err);
    });

    this.currentSTTUnsubs = [unsubTranscript, unsubState, unsubError];
    this.notifyChainStatus();
  }

  private cleanUpCurrentSTT(): void {
    this.currentSTTUnsubs.forEach((unsub) => unsub());
    this.currentSTTUnsubs = [];

    if (this.currentSTT) {
      try {
        this.currentSTT.stop();
      } catch {}
      this.currentSTT = null;
    }
  }

  /**
   * Called by VAD or engine when speech energy is detected.
   * Starts a 2.5s stall timer (§T5); if no transcript arrives, triggers failover.
   */
  public notifySpeechActivity(isSpeech: boolean): void {
    this.isSpeechActive = isSpeech;
    if (isSpeech && this.desiredListening && !this.speechStallTimer) {
      this.speechStallTimer = setTimeout(() => {
        if (this.isSpeechActive && this.desiredListening) {
          console.warn('[STTChainManager] Speech detected for 2.5s with zero partial text. Triggering failover.');
          void this.advanceProviderChain('No speech recognition response');
        }
      }, this.speechStallTimeoutMs);
    } else if (!isSpeech) {
      this.clearSpeechStallTimer();
    }
  }

  private clearSpeechStallTimer(): void {
    if (this.speechStallTimer) {
      clearTimeout(this.speechStallTimer);
      this.speechStallTimer = null;
    }
  }

  private clearWsDropTimer(): void {
    if (this.wsDropTimer) {
      clearTimeout(this.wsDropTimer);
      this.wsDropTimer = null;
    }
  }

  private handleProviderError(err: SpeechError): void {
    const errName = err.error;

    // 1. Silent errors: no-speech / aborted should never trigger alerts
    if (errName === 'no-speech' || errName === 'aborted') {
      return;
    }

    // 2. Hardware / mic permission fatal errors: notify immediately without retrying
    if (errName === 'not-allowed' || errName === 'audio-capture' || errName === 'service-not-allowed') {
      this.clearRetry();
      this.clearWsDropTimer();
      this.emitError(err);
      return;
    }

    // 3. Fatal unrecoverable provider errors: advance provider chain immediately (§T5)
    if (err.isFatal) {
      this.advanceProviderChain('Unrecoverable provider error');
      return;
    }

    // 4. Network / WebSocket drop error
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (errName === 'network' || isOffline) {
      // If server STT fails on WS connection, enforce 1.5s drop threshold (§T5)
      if (this.activeProvider === 'faster-whisper' || this.activeProvider === 'vosk' || this.activeProvider === 'nemotron') {
        if (!this.wsDropTimer) {
          this.wsDropTimer = setTimeout(() => {
            console.warn(`[STTChainManager] ${this.activeProvider} WS dropped > 1.5s. Advancing provider chain.`);
            void this.advanceProviderChain('Connection dropped');
          }, this.wsFailoverTimeoutMs);
        }
      }

      // Retry mechanism with backoff
      if (this.reconnectAttempt < this.maxAttempts) {
        this.reconnectAttempt += 1;
        this.isReconnecting = true;
        this.statusNotice = `Reconnecting voice recognition… (attempt ${this.reconnectAttempt}/${this.maxAttempts})`;
        this.notifyChainStatus();

        const delay = this.retryBackoffsMs[this.reconnectAttempt - 1] ?? 1000;

        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          if (this.desiredListening && this.currentSTT) {
            try {
              this.currentSTT.start();
            } catch (startErr) {
              console.warn('[STTChainManager] Retry start failed:', startErr);
            }
          }
        }, delay);
        return;
      }

      // Max retries exceeded -> advance chain immediately
      console.warn(`[STTChainManager] ${this.activeProvider} exceeded retries. Advancing chain.`);
      void this.advanceProviderChain('Connection failed');
      return;
    }

    // Other non-fatal errors: emit to error listeners
    this.emitError(err);
  }

  /**
   * Advances to next provider in fallback chain mid-answer (§T5).
   * Guarantees zero word loss: previous committed words are frozen and retained.
   */
  public advanceProviderChain(reason?: string): void {
    if (import.meta.env.DEV && reason) {
      console.debug('[STTChainManager] Advancing chain due to:', reason);
    }
    this.clearRetry();
    this.clearWsDropTimer();
    this.clearSpeechStallTimer();

    // Preserve words committed so far by handling session restart on master assembler
    this.masterAssembler.handleSessionRestart();

    const nextIndex = this.activeProviderIndex + 1;

    if (nextIndex < this.chain.length) {
      this.activeProviderIndex = nextIndex;
      const candidate = this.chain[nextIndex];

      if (candidate === 'typed') {
        this.isExhausted = true;
        this.statusNotice = null;
        this.initActiveProvider();
        this.emitError({
          error: 'network',
          message: 'Voice recognition unavailable. Switched to typed answer fallback.',
          isFatal: true,
        });
        return;
      }

      // Calm in-app notice with strictly zero vendor or model names (§3.3 & §T5)
      this.statusNotice = 'Switched to backup voice recognition';
      this.initActiveProvider();

      if (this.desiredListening && this.currentSTT) {
        try {
          this.currentSTT.start();
        } catch (err) {
          console.warn('[STTChainManager] Failed to start fallback provider:', err);
        }
      }

      this.scheduleClearNotice(3000);
      return;
    }

    // End of chain reached
    this.isExhausted = true;
    this.statusNotice = null;
    this.notifyChainStatus();
    this.emitError({
      error: 'network',
      message: 'All voice recognition providers failed. Please use the typed answer fallback.',
      isFatal: true,
    });
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.clearWsDropTimer();
    const hadReconnecting = this.isReconnecting || this.reconnectAttempt > 0;
    this.isReconnecting = false;
    this.reconnectAttempt = 0;
    this.statusNotice = null;
    if (hadReconnecting) {
      this.notifyChainStatus();
    }
  }

  private scheduleClearNotice(delayMs = 3000): void {
    if (this.clearNoticeTimer) clearTimeout(this.clearNoticeTimer);
    this.clearNoticeTimer = setTimeout(() => {
      this.statusNotice = null;
      this.notifyChainStatus();
    }, delayMs);
  }

  public retry(): void {
    this.clearRetry();
    if (this.clearNoticeTimer) clearTimeout(this.clearNoticeTimer);

    // Reset chain back to initial preferred provider
    this.activeProviderIndex = 0;
    this.isExhausted = false;
    this.statusNotice = 'Retrying voice recognition…';
    this.notifyChainStatus();

    this.initActiveProvider();

    if (this.desiredListening && this.currentSTT) {
      this.currentSTT.start();
    }

    this.scheduleClearNotice(2000);
  }

  public start(): void {
    this.desiredListening = true;
    if (this.activeProvider === 'typed') return;
    if (this.currentSTT) {
      this.currentSTT.start();
    }
  }

  public stop(): void {
    this.desiredListening = false;
    this.isSpeechActive = false;
    this.clearRetry();
    this.clearSpeechStallTimer();
    if (this.currentSTT) {
      this.currentSTT.stop();
    }
  }

  public abort(): void {
    this.desiredListening = false;
    this.isSpeechActive = false;
    this.clearRetry();
    this.clearSpeechStallTimer();
    if (this.currentSTT) {
      this.currentSTT.abort();
    }
  }

  public resetTranscript(): void {
    this.masterAssembler.reset();
    if (this.currentSTT) {
      this.currentSTT.resetTranscript();
    }
  }

  public seal(): string {
    return this.masterAssembler.seal();
  }

  public getFullTranscript(): string {
    return this.masterAssembler.getText();
  }

  public onTranscript(callback: (event: TranscriptEvent) => void): () => void {
    this.transcriptListeners.push(callback);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((cb) => cb !== callback);
    };
  }

  public onError(callback: (err: SpeechError) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter((cb) => cb !== callback);
    };
  }

  public onStateChange(callback: (state: STTState) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  private emitError(err: SpeechError): void {
    this.errorListeners.forEach((cb) => {
      try {
        cb(err);
      } catch (e) {
        console.error('[STTChainManager] Error in error listener:', e);
      }
    });
  }
}
