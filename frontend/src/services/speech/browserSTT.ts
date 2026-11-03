/**
 * Browser-native SpeechToText implementation using Web Speech API.
 * Features single-instance reuse, debounced restarts (>= 300ms), rapid restart loop guards,
 * silent handling of benign errors ('no-speech', 'aborted'), and seamless transcript stitching.
 */

import { SpeechToText, TranscriptEvent, SpeechError, STTState } from './types';
import { TranscriptStitcher } from './transcriptStitcher';

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export class BrowserSpeechToText implements SpeechToText {
  // Shared underlying SpeechRecognition instance across instances and turns to avoid instance leak
  private static sharedRecognitionInstance: any = null;

  private recognition: any = null;
  private stitcher: TranscriptStitcher = new TranscriptStitcher();
  private state: STTState = 'idle';
  private desiredListening: boolean = false;
  private restartTimeout: any = null;
  private lastStopTime: number = 0;
  private lastStartTime: number = 0;
  private restartHistory: number[] = [];

  private transcriptListeners: Array<(event: TranscriptEvent) => void> = [];
  private errorListeners: Array<(err: SpeechError) => void> = [];
  private stateListeners: Array<(state: STTState) => void> = [];

  constructor() {
    this.initRecognition();
  }

  public get isSupported(): boolean {
    return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public get isListening(): boolean {
    return this.state === 'listening';
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
      BrowserSpeechToText.sharedRecognitionInstance.lang = 'en-US';
      BrowserSpeechToText.sharedRecognitionInstance.maxAlternatives = 1;
    }

    this.recognition = BrowserSpeechToText.sharedRecognitionInstance;

    this.recognition.onstart = () => {
      this.setState('listening');
      this.lastStartTime = Date.now();
    };

    this.recognition.onresult = (event: any) => {
      let interimChunk = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        const text = item[0]?.transcript || '';
        if (item.isFinal) {
          finalChunk += text;
        } else {
          interimChunk += text;
        }
      }

      if (finalChunk) {
        const { fullTranscript } = this.stitcher.append(finalChunk, true);
        this.emitTranscript({
          text: finalChunk.trim(),
          isFinal: true,
          timestamp: Date.now(),
          fullTranscript,
        });
      } else if (interimChunk) {
        const { fullTranscript } = this.stitcher.append(interimChunk, false);
        this.emitTranscript({
          text: interimChunk.trim(),
          isFinal: false,
          timestamp: Date.now(),
          fullTranscript,
        });
      }
    };

    this.recognition.onerror = (event: any) => {
      const errName = event.error || 'unknown';

      // 'no-speech' and 'aborted': silent restart, no user alert, do not count as errors
      if (errName === 'no-speech' || errName === 'aborted') {
        if (this.desiredListening && this.isSupported) {
          this.scheduleRestart(300);
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
      // If we still want to be listening (e.g. Chrome 60s timeout occurred), auto-restart seamlessly
      if (this.desiredListening && this.isSupported) {
        this.scheduleRestart(300);
      } else {
        this.setState('idle');
      }
    };
  }

  private scheduleRestart(minDelay = 300): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    const now = Date.now();
    // Prune restart history older than 5 seconds
    this.restartHistory = this.restartHistory.filter((t) => now - t < 5000);

    // If 3 restarts in 5s occurred, enforce a backoff to prevent Chrome spam blocking
    let delay = minDelay;
    if (this.restartHistory.length >= 3) {
      console.warn('[BrowserSTT] 3 restarts failed within 5s. Applying exponential backoff delay.');
      this.restartHistory = [];
      delay = Math.max(delay, 2500);
    }

    this.restartHistory.push(now);

    this.restartTimeout = setTimeout(() => {
      if (this.desiredListening && this.recognition) {
        try {
          this.recognition.start();
        } catch {
          // If already active or failed, retry gently
          this.scheduleRestart(minDelay + 200);
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
      this.recognition.start();
    } catch {
      // If recognition is already started, ignore error
    }
  }

  public stop(): void {
    this.desiredListening = false;
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
    this.stitcher.reset();
  }

  public getFullTranscript(): string {
    return this.stitcher.getFullTranscript();
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
