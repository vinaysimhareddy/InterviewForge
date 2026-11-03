/**
 * Resilient STT Provider Chain Manager (§B3)
 *
 * Implements a multi-stage speech-to-text fallback chain:
 *   1. 'browser': Browser-native Web Speech API (low latency, zero compute cost).
 *   2. 'nemotron': Cache-Aware Streaming Neural ASR on port 8001 (if healthy and running).
 *   3. 'typed': Candidate typed textarea fallback (last resort when network/speech APIs fail).
 *
 * Resilience policies:
 *   - Auto-retry network errors with exponential backoff (300ms, 800ms, 1500ms, 3000ms).
 *   - Non-blocking "Reconnecting voice…" status notice during retry window.
 *   - Automatic provider switch after 3 failed network retries.
 *   - Silent restart on 'no-speech' and 'aborted' without user disruption.
 *   - Fatal mic permission errors ('not-allowed', 'audio-capture') bypass retry loop to show permission prompt.
 */

import { SpeechToText, TranscriptEvent, SpeechError, STTState } from './types';
import { BrowserSpeechToText } from './browserSTT';
import { NemotronStreamingSTT, NemotronSTTOptions } from './nemotronSTT';
import { checkNemotronHealth } from './sttFactory';

export type STTProviderMode = 'browser' | 'nemotron' | 'typed';

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
  onChainStatusChange?: (status: STTChainStatus) => void;
}

const DEFAULT_RETRY_BACKOFFS = [300, 800, 1500, 3000];
const DEFAULT_MAX_ATTEMPTS = 3;

export function parseConfiguredProviderChain(): STTProviderMode[] {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
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

  return ['browser', 'nemotron', 'typed'];
}

export class STTChainManager implements SpeechToText {
  private chain: STTProviderMode[];
  private activeProviderIndex: number = 0;
  private currentSTT: SpeechToText | null = null;
  private options: STTChainManagerOptions;

  private isReconnecting: boolean = false;
  private reconnectAttempt: number = 0;
  private maxAttempts: number;
  private retryBackoffsMs: number[];
  private statusNotice: string | null = null;
  private isExhausted: boolean = false;
  private retryTimer: any = null;
  private clearNoticeTimer: any = null;

  private desiredListening: boolean = false;
  private currentFullTranscript: string = '';

  private transcriptListeners: Array<(event: TranscriptEvent) => void> = [];
  private errorListeners: Array<(err: SpeechError) => void> = [];
  private stateListeners: Array<(state: STTState) => void> = [];
  private chainStatusListeners: Array<(status: STTChainStatus) => void> = [];

  // Subscription cleanups for the active STT instance
  private currentSTTUnsubs: Array<() => void> = [];

  constructor(options: STTChainManagerOptions = {}) {
    this.options = options;
    this.chain = options.chain && options.chain.length > 0 ? options.chain : parseConfiguredProviderChain();
    this.maxAttempts = options.maxRetryAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBackoffsMs = options.retryBackoffsMs ?? DEFAULT_RETRY_BACKOFFS;

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

    if (providerType === 'nemotron') {
      this.currentSTT = new NemotronStreamingSTT({
        ...this.options,
        autoFallback: false,
      });
    } else {
      // Default: 'browser'
      this.currentSTT = new BrowserSpeechToText();
    }

    // Attach listeners
    const unsubTranscript = this.currentSTT.onTranscript((event) => {
      if (this.isReconnecting) {
        // Recovery confirmed! We are successfully receiving transcripts again.
        this.clearRetry();
      }
      this.currentFullTranscript = event.fullTranscript;
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

  private handleProviderError(err: SpeechError): void {
    const errName = err.error;

    // 1. Silent errors: no-speech / aborted should never trigger user alerts or retry counters
    if (errName === 'no-speech' || errName === 'aborted') {
      return;
    }

    // 2. Hardware / mic permission fatal errors: do NOT retry network, notify immediately
    if (errName === 'not-allowed' || errName === 'audio-capture' || errName === 'service-not-allowed') {
      this.clearRetry();
      this.emitError(err);
      return;
    }

    // 3. Network or transient service error: trigger auto-retry with backoff
    if (errName === 'network' || !navigator.onLine) {
      if (this.reconnectAttempt < this.maxAttempts) {
        this.reconnectAttempt += 1;
        this.isReconnecting = true;
        this.statusNotice = `Reconnecting voice recognition… (attempt ${this.reconnectAttempt}/${this.maxAttempts})`;
        this.notifyChainStatus();

        const delay = this.retryBackoffsMs[this.reconnectAttempt - 1] ?? 1500;

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

      // Max retry attempts reached for this provider -> advance to next provider in chain
      console.warn(`[STTChainManager] ${this.activeProvider} exceeded ${this.maxAttempts} network retries. Advancing chain.`);
      void this.advanceProviderChain();
      return;
    }

    // Other unexpected errors: emit to listeners
    this.emitError(err);
  }

  private async advanceProviderChain(): Promise<void> {
    this.clearRetry();

    let nextIndex = this.activeProviderIndex + 1;

    while (nextIndex < this.chain.length) {
      const candidate = this.chain[nextIndex];

      if (candidate === 'nemotron') {
        const isNemotronHealthy = await checkNemotronHealth(1200);
        if (isNemotronHealthy) {
          this.activeProviderIndex = nextIndex;
          this.statusNotice = 'Switched to Nemotron Streaming ASR';
          this.initActiveProvider();
          if (this.desiredListening && this.currentSTT) {
            this.currentSTT.start();
          }
          this.scheduleClearNotice(3000);
          return;
        } else {
          // Nemotron is offline or unhealthy, continue down chain
          nextIndex += 1;
          continue;
        }
      }

      if (candidate === 'typed') {
        this.activeProviderIndex = nextIndex;
        this.isExhausted = true;
        this.statusNotice = null;
        this.initActiveProvider();
        this.emitError({
          error: 'network',
          message: 'All voice providers exhausted after connection retries. Switched to typed answer fallback.',
          isFatal: true,
        });
        return;
      }

      // Any other candidate
      this.activeProviderIndex = nextIndex;
      this.initActiveProvider();
      if (this.desiredListening && this.currentSTT) {
        this.currentSTT.start();
      }
      return;
    }

    // End of chain reached with no voice providers left
    this.isExhausted = true;
    this.statusNotice = null;
    this.notifyChainStatus();
    this.emitError({
      error: 'network',
      message: 'All speech recognition providers failed. Please use the typed answer fallback.',
      isFatal: true,
    });
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
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
    this.clearRetry();
    if (this.currentSTT) {
      this.currentSTT.stop();
    }
  }

  public abort(): void {
    this.desiredListening = false;
    this.clearRetry();
    if (this.currentSTT) {
      this.currentSTT.abort();
    }
  }

  public resetTranscript(): void {
    this.currentFullTranscript = '';
    if (this.currentSTT) {
      this.currentSTT.resetTranscript();
    }
  }

  public getFullTranscript(): string {
    return this.currentSTT ? this.currentSTT.getFullTranscript() : this.currentFullTranscript;
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
