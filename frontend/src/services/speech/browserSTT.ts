/**
 * Browser-native SpeechToText implementation using Web Speech API.
 * Features single-instance reuse, debounced restarts (>= 300ms), rapid restart loop guards,
 * silent handling of benign errors ('no-speech', 'aborted'), and seamless transcript stitching.
 */

import {
  SpeechToText,
  TranscriptEvent,
  SpeechError,
  STTState,
  ISTTProvider,
  STTProviderConfig,
  STTProviderMetrics,
} from './types';
import { TranscriptAssembler } from './transcriptAssembler';

export const SUPPORTED_SPEECH_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-AU', label: 'English (Australia)' },
] as const;

export type SupportedSpeechLangCode = (typeof SUPPORTED_SPEECH_LANGS)[number]['code'];

const STORAGE_LANG_KEY = 'interview_speech_lang';
const DEFAULT_SPEECH_LANG: SupportedSpeechLangCode = 'en-IN';
let inMemoryLang: string = DEFAULT_SPEECH_LANG;

export function getSpeechRecognitionLang(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_LANG_KEY);
      if (saved && SUPPORTED_SPEECH_LANGS.some((l) => l.code === saved)) {
        return saved;
      }
    } else if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      const saved = (globalThis as any).localStorage.getItem(STORAGE_LANG_KEY);
      if (saved && SUPPORTED_SPEECH_LANGS.some((l) => l.code === saved)) {
        return saved;
      }
    }
  } catch {
    // Fall back to inMemoryLang
  }
  return inMemoryLang || DEFAULT_SPEECH_LANG;
}

export function setSpeechRecognitionLang(lang: string): void {
  inMemoryLang = lang;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_LANG_KEY, lang);
    } else if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      (globalThis as any).localStorage.setItem(STORAGE_LANG_KEY, lang);
    }
  } catch {
    // Ignore
  }
  if (BrowserSpeechToText.sharedRecognitionInstance) {
    BrowserSpeechToText.sharedRecognitionInstance.lang = lang;
  }
}

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export class BrowserSpeechToText implements SpeechToText, ISTTProvider {
  public readonly id = 'browser';
  public readonly name = 'Browser Speech Recognition';

  // Shared underlying SpeechRecognition instance across instances and turns to avoid instance leak
  public static sharedRecognitionInstance: any = null;

  private recognition: any = null;
  private assembler: TranscriptAssembler;
  private state: STTState = 'idle';
  private desiredListening: boolean = false;
  private _isRestarting: boolean = false;
  private restartTimeout: any = null;
  private lastStopTime: number = 0;
  private lastStartTime: number = 0;
  private restartHistory: number[] = [];
  private firstPartialLatencyMs: number | null = null;
  private speechStartTime: number | null = null;
  private errorCount: number = 0;

  private transcriptListeners: Array<(event: TranscriptEvent) => void> = [];
  private errorListeners: Array<(err: SpeechError) => void> = [];
  private stateListeners: Array<(state: STTState) => void> = [];
  private partialListeners: Array<(text: string, timestamp: number) => void> = [];
  private finalListeners: Array<(text: string, timestamp: number) => void> = [];

  constructor(assembler?: TranscriptAssembler) {
    this.assembler = assembler || new TranscriptAssembler();
    this.initRecognition();
  }

  public setAssembler(assembler: TranscriptAssembler): void {
    this.assembler = assembler;
  }

  public getAssembler(): TranscriptAssembler {
    return this.assembler;
  }

  public init(config?: STTProviderConfig): void {
    if (config?.lang) {
      setSpeechRecognitionLang(config.lang);
    }
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

  public getMetrics(): STTProviderMetrics {
    const fullText = this.assembler.getText();
    const words = fullText.split(/\s+/).filter(Boolean).length;
    return {
      providerId: this.id,
      providerName: this.name,
      firstPartialLatencyMs: this.firstPartialLatencyMs ?? undefined,
      wordsCaptured: words,
      connected: this.isListening,
      errorCount: this.errorCount,
    };
  }

  public get isSupported(): boolean {
    return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public get isListening(): boolean {
    return this.state === 'listening';
  }

  public get isRestarting(): boolean {
    return this._isRestarting;
  }

  public hasPendingInterim(): boolean {
    return Boolean(this.assembler.getInterimText().trim());
  }

  public get uptimeMs(): number {
    return this.lastStartTime ? Date.now() - this.lastStartTime : 0;
  }

  private initRecognition(): void {
    if (!this.isSupported) return;

    if (!BrowserSpeechToText.sharedRecognitionInstance) {
      const SpeechRecClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      BrowserSpeechToText.sharedRecognitionInstance = new SpeechRecClass();
      BrowserSpeechToText.sharedRecognitionInstance.continuous = true;
      BrowserSpeechToText.sharedRecognitionInstance.interimResults = true;
      BrowserSpeechToText.sharedRecognitionInstance.lang = getSpeechRecognitionLang();
      BrowserSpeechToText.sharedRecognitionInstance.maxAlternatives = 1;
    }

    this.recognition = BrowserSpeechToText.sharedRecognitionInstance;

    this.recognition.onaudiostart = () => {
      if (import.meta.env.DEV) {
        console.log(`[BrowserSTT][RawEvent] onaudiostart @ ${performance.now().toFixed(1)}ms`);
      }
    };

    this.recognition.onspeechstart = () => {
      if (import.meta.env.DEV) {
        console.log(`[BrowserSTT][RawEvent] onspeechstart @ ${performance.now().toFixed(1)}ms`);
      }
    };

    this.recognition.onspeechend = () => {
      if (import.meta.env.DEV) {
        console.log(`[BrowserSTT][RawEvent] onspeechend @ ${performance.now().toFixed(1)}ms`);
      }
    };

    this.recognition.onaudioend = () => {
      if (import.meta.env.DEV) {
        console.log(`[BrowserSTT][RawEvent] onaudioend @ ${performance.now().toFixed(1)}ms`);
      }
    };

    this.recognition.onstart = () => {
      this._isRestarting = false;
      this.speechStartTime = Date.now();
      if (import.meta.env.DEV) {
        console.log(`[BrowserSTT][RawEvent] onstart @ ${performance.now().toFixed(1)}ms (lang: ${this.recognition?.lang})`);
      }
      this.setState('listening');
      this.lastStartTime = Date.now();
    };

    this.recognition.onresult = (event: any) => {
      const parsedResults: Array<{ isFinal: boolean; transcript: string }> = [];
      let hasFinalInBatch = false;
      let finalBatchText = '';

      for (let i = 0; i < event.results.length; ++i) {
        const isItemFinal = Boolean(event.results[i].isFinal);
        const itemTranscript = event.results[i][0]?.transcript || '';
        parsedResults.push({
          isFinal: isItemFinal,
          transcript: itemTranscript,
        });

        if (i >= event.resultIndex && isItemFinal) {
          hasFinalInBatch = true;
          finalBatchText += (finalBatchText ? ' ' : '') + itemTranscript.trim();
        }
      }

      if (import.meta.env.DEV) {
        console.log(
          `[BrowserSTT][RawEvent] onresult @ ${performance.now().toFixed(1)}ms | resultIndex=${event.resultIndex}, count=${event.results.length}:`,
          parsedResults
        );
      }

      const state = this.assembler.ingestResults(event.resultIndex, parsedResults);

      const now = Date.now();
      if (!this.firstPartialLatencyMs && this.speechStartTime) {
        this.firstPartialLatencyMs = now - this.speechStartTime;
      }

      if (hasFinalInBatch) {
        this.finalListeners.forEach((cb) => cb(finalBatchText, now));
      } else if (state.interimText) {
        this.partialListeners.forEach((cb) => cb(state.interimText, now));
      }

      const emittedText = hasFinalInBatch ? finalBatchText : state.interimText;

      this.emitTranscript({
        text: emittedText.trim(),
        isFinal: hasFinalInBatch,
        timestamp: now,
        fullTranscript: state.fullText,
      });
    };

    this.recognition.onerror = (event: any) => {
      const errName = event.error || 'unknown';
      if (import.meta.env.DEV) {
        console.warn(`[BrowserSTT][RawEvent] onerror @ ${performance.now().toFixed(1)}ms: error="${errName}", message="${event.message}"`);
      }

      // 'no-speech' and 'aborted': silent restart, no user alert, do not count as errors
      if (errName === 'no-speech' || errName === 'aborted') {
        if (this.desiredListening && this.isSupported) {
          this.scheduleRestart(80);
        }
        return;
      }

      const isFatal = errName === 'not-allowed' || errName === 'audio-capture' || errName === 'service-not-allowed';
      if (isFatal) {
        this.desiredListening = false;
        this.setState('error');
      }

      this.emitError({
        error: errName,
        message: event.message,
        isFatal,
      });
    };

    this.recognition.onend = () => {
      if (import.meta.env.DEV) {
        console.log(`[BrowserSTT][RawEvent] onend @ ${performance.now().toFixed(1)}ms, desiredListening=${this.desiredListening}`);
      }
      // Never discard committed history on session boundary; consolidate across restarts (§T2)
      this.assembler.handleSessionRestart();

      // If we still want to be listening (e.g. Chrome timeout occurred), auto-restart within 100ms
      if (this.desiredListening && this.isSupported) {
        this._isRestarting = true;
        this.scheduleRestart(80);
      } else {
        this._isRestarting = false;
        this.setState('idle');
      }
    };
  }

  private scheduleRestart(minDelay = 80): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    const now = Date.now();
    // Prune restart history older than 5 seconds
    this.restartHistory = this.restartHistory.filter((t) => now - t < 5000);

    // If 4 restarts in 5s occurred, enforce a backoff to prevent Chrome spam blocking
    let delay = minDelay;
    if (this.restartHistory.length >= 4) {
      console.warn('[BrowserSTT] 4 restarts within 5s. Applying exponential backoff delay.');
      this.restartHistory = [];
      delay = Math.max(delay, 2000);
    }

    this.restartHistory.push(now);

    this.restartTimeout = setTimeout(() => {
      if (this.desiredListening && this.recognition) {
        try {
          this.recognition.start();
        } catch {
          // If already active or failed, retry gently
          this.scheduleRestart(minDelay + 100);
        }
      }
    }, delay);
  }

  public start(): void {
    if (!this.isSupported) {
      this.emitError({
        error: 'unsupported',
        message: 'SpeechRecognition API is not supported in this browser.',
        isFatal: true,
      });
      return;
    }

    this.desiredListening = true;
    this._isRestarting = false;

    // Enforce >= 300ms debounce between stop and start
    const now = Date.now();
    const timeSinceStop = now - this.lastStopTime;
    const minDebounceMs = 300;

    if (timeSinceStop < minDebounceMs) {
      const remainingDelay = minDebounceMs - timeSinceStop;
      if (this.restartTimeout) clearTimeout(this.restartTimeout);
      this.restartTimeout = setTimeout(() => this.executeStart(), remainingDelay);
      return;
    }

    this.executeStart();
  }

  private executeStart(): void {
    if (!this.desiredListening || !this.recognition) return;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    const now = Date.now();
    // Check restart loop history (>= 3 restarts within 5s)
    this.restartHistory = this.restartHistory.filter((t) => now - t < 5000);
    if (this.restartHistory.length >= 3) {
      console.warn('[BrowserSTT] Rapid start/stop loop detected. Backing off 2.5s...');
      this.restartHistory = [];
      this.restartTimeout = setTimeout(() => this.executeStart(), 2500);
      return;
    }
    this.restartHistory.push(now);

    try {
      this.recognition.lang = getSpeechRecognitionLang();
      this.recognition.start();
    } catch {
      // If recognition is already started, ignore error
    }
  }

  public stop(): void {
    this.desiredListening = false;
    this._isRestarting = false;
    this.lastStopTime = Date.now();

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.setState('idle');
  }

  public abort(): void {
    this.desiredListening = false;
    this._isRestarting = false;
    this.lastStopTime = Date.now();

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
    }
    this.setState('idle');
  }

  public resetTranscript(): void {
    this.assembler.reset();
  }

  public getFullTranscript(): string {
    return this.assembler.getText();
  }

  public seal(): string {
    return this.assembler.seal();
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
    callback(this.state);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  private setState(state: STTState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateListeners.forEach((cb) => cb(state));
  }

  private emitTranscript(event: TranscriptEvent): void {
    this.transcriptListeners.forEach((cb) => cb(event));
  }

  private emitError(err: SpeechError): void {
    this.errorListeners.forEach((cb) => cb(err));
  }
}
