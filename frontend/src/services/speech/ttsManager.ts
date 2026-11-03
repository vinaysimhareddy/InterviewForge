/**
 * Robust Text-to-Speech Manager for AI Interviewer.
 * Addresses Chromium GC bug, voice loading race conditions, long sentence cutoff bugs,
 * speech synthesis engine deadlocks, tab backgrounding, and user-gesture autoplay restrictions.
 */

import { TextToSpeech, TTSOptions, TTSState } from './types';

// Module-level Set to maintain strong references to active utterances,
// preventing Chromium's V8 garbage collector from prematurely collecting them mid-speech.
export const activeUtterances = new Set<SpeechSynthesisUtterance>();

/**
 * Splits text into readable chunks respecting sentence and clause boundaries.
 * Keeps each utterance <= maxLen (default 180 chars) to prevent Chrome's 15s audio cutoff bug.
 */
export function chunkSpeechText(text: string, maxLen: number = 180): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  // 1. Split on sentence boundaries ([.!?] followed by whitespace or end)
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
  const rawSentences = trimmed.match(sentenceRegex) || [trimmed];

  const chunks: string[] = [];
  let currentChunk = '';

  for (const rawSentence of rawSentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length <= maxLen) {
      if (currentChunk && (currentChunk.length + sentence.length + 1) <= maxLen) {
        currentChunk += ' ' + sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = sentence;
      }
    } else {
      // Sentence itself exceeds maxLen -> split on clause boundaries (, ; : -) or words
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      const subParts = sentence.split(/(?<=[,;:])\s+|\s+/);
      let subChunk = '';
      for (const part of subParts) {
        if (!part) continue;
        if (subChunk && (subChunk.length + part.length + 1) > maxLen) {
          chunks.push(subChunk.trim());
          subChunk = part;
        } else {
          subChunk = subChunk ? `${subChunk} ${part}` : part;
        }
      }
      if (subChunk.trim()) {
        chunks.push(subChunk.trim());
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [trimmed];
}

export class TTSManager implements TextToSpeech {
  private state: TTSState = 'idle';
  private selectedVoiceURI: string | null = null;
  private defaultRate: number = 1.0;
  private voices: SpeechSynthesisVoice[] = [];
  private stateListeners: Array<(state: TTSState) => void> = [];
  private voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null;
  private lastSpokenText: string = '';
  private abortController: AbortController | null = null;
  private visibilityListenerAttached: boolean = false;

  constructor() {
    this.initVoices();
    this.setupVisibilityListener();
  }

  public get isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public get isSpeaking(): boolean {
    return this.state === 'speaking';
  }

  public getAudioState(): TTSState {
    return this.state;
  }

  public getLastSpokenText(): string {
    return this.lastSpokenText;
  }

  /**
   * Initializes voice list with voiceschanged event listener and a 2-second timeout fallback.
   * Caches available voices and preselects the best natural English voice.
   */
  public initVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!this.isSupported) {
      return Promise.resolve([]);
    }
    if (this.voicesReadyPromise) {
      return this.voicesReadyPromise;
    }

    this.voicesReadyPromise = new Promise((resolve) => {
      const existing = window.speechSynthesis.getVoices();
      if (existing && existing.length > 0) {
        this.voices = existing;
        this.selectDefaultVoice();
        resolve(this.voices);
        return;
      }

      let resolved = false;
      const finish = (loadedVoices: SpeechSynthesisVoice[]) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimeout);
        this.voices = loadedVoices;
        this.selectDefaultVoice();
        resolve(this.voices);
      };

      const onVoicesChanged = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) {
          finish(v);
        }
      };

      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = onVoicesChanged;
      }
      try {
        (window.speechSynthesis as unknown as EventTarget).addEventListener?.('voiceschanged', onVoicesChanged);
      } catch {}

      // 2-second fallback timeout
      const fallbackTimeout = setTimeout(() => {
        const v = window.speechSynthesis.getVoices();
        finish(v && v.length > 0 ? v : []);
      }, 2000);
    });

    return this.voicesReadyPromise;
  }

  private selectDefaultVoice(): void {
    if (this.selectedVoiceURI || this.voices.length === 0) return;

    // Prefer high-quality, natural-sounding English voices
    const preferred = this.voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Daniel') ||
          v.name.includes('Karen') ||
          v.name.includes('Arthur'))
    );
    const englishFallback = this.voices.find((v) => v.lang.startsWith('en')) || this.voices[0];
    this.selectedVoiceURI = (preferred || englishFallback)?.voiceURI || null;
  }

  private setupVisibilityListener(): void {
    if (typeof document === 'undefined' || this.visibilityListenerAttached) return;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'speaking') {
          this.pause();
        }
      } else {
        if (this.state === 'paused') {
          this.resume();
        }
      }
    });
    this.visibilityListenerAttached = true;
  }

  /**
   * User-gesture audio unlock: Plays a microscopic silent utterance to unlock
   * browser autoplay policies on candidate's initial click ("Start Interview").
   */
  public unlockAudio(): void {
    if (!this.isSupported) return;
    try {
      window.speechSynthesis.resume();
      const unlockUtterance = new SpeechSynthesisUtterance(' ');
      unlockUtterance.volume = 0.01;
      unlockUtterance.rate = 2.0;

      activeUtterances.add(unlockUtterance);
      unlockUtterance.onend = () => activeUtterances.delete(unlockUtterance);
      unlockUtterance.onerror = () => activeUtterances.delete(unlockUtterance);

      window.speechSynthesis.speak(unlockUtterance);
    } catch (err) {
      console.warn('[TTSManager] Audio unlock warning:', err);
    }
  }

  /**
   * Chromium freeze recovery: cancels stuck audio, pauses briefly, and resumes synthesis.
   */
  public async recoverEngine(): Promise<void> {
    if (!this.isSupported) return;
    try {
      window.speechSynthesis.cancel();
      activeUtterances.clear();
      await new Promise((r) => setTimeout(r, 50));
      window.speechSynthesis.resume();
    } catch (err) {
      console.warn('[TTSManager] Freeze recovery warning:', err);
    }
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.isSupported) {
      this.voices = window.speechSynthesis.getVoices();
      this.selectDefaultVoice();
    }
    return this.voices;
  }

  public setVoice(voiceURI: string): void {
    this.selectedVoiceURI = voiceURI;
  }

  public setRate(rate: number): void {
    this.defaultRate = Math.max(0.5, Math.min(2.0, rate));
  }

  /**
   * Replays the specified question or the last spoken question.
   */
  public async replayQuestion(text?: string, options: TTSOptions = {}): Promise<void> {
    const textToPlay = text || this.lastSpokenText;
    if (!textToPlay.trim()) return;
    await this.speak(textToPlay, options);
  }

  /**
   * Speaks the provided text sentence-by-sentence using watchdog monitoring,
   * chunking for long texts, and automatic caption-only fallback on failure.
   */
  public async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.isSupported || !text.trim()) {
      this.setState('idle');
      return;
    }

    this.lastSpokenText = text;
    this.stop(); // Stop any pending speech

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Ensure voices are initialized
    if (this.voices.length === 0) {
      await this.initVoices();
    }

    // Split text into chunks <= 180 chars to avoid the Chrome cutoff bug
    const chunks = chunkSpeechText(text, 180);

    for (let i = 0; i < chunks.length; i++) {
      if (signal.aborted) break;

      const chunk = chunks[i];
      const success = await this.speakChunkWithWatchdog(chunk, options, signal);

      if (!success) {
        // If speaking failed and retry also timed out, transition to silent-fallback
        console.warn(`[TTSManager] TTS failed for chunk "${chunk.slice(0, 30)}...". Falling back to captions.`);
        this.setState('silent-fallback');
        // Do not hang the interview; return so turn can proceed with visual captions
        return;
      }
    }

    if (!signal.aborted) {
      this.setState('idle');
    }
  }

  /**
   * Speaks an individual chunk with a 1.5s onstart watchdog and 1 automatic retry.
   */
  private speakChunkWithWatchdog(
    chunk: string,
    options: TTSOptions,
    signal: AbortSignal,
    retryCount = 0
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve(false);
        return;
      }

      let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
      let hasStarted = false;
      let hasFinished = false;

      const cleanup = (utterance?: SpeechSynthesisUtterance) => {
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
        if (utterance) {
          activeUtterances.delete(utterance);
        }
      };

      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = options.rate ?? this.defaultRate;
      utterance.pitch = options.pitch ?? 1.0;
      utterance.volume = options.volume ?? 1.0;

      const targetVoiceURI = options.voiceURI || this.selectedVoiceURI;
      if (targetVoiceURI) {
        const found = this.voices.find((v) => v.voiceURI === targetVoiceURI);
        if (found) utterance.voice = found;
      }

      // UTTERANCE RETENTION: Retain in module-level Set to prevent V8 GC bug
      activeUtterances.add(utterance);

      // 1.5s WATCHDOG: If onstart does not fire within 1500 ms, recover and retry once
      watchdogTimer = setTimeout(async () => {
        if (!hasStarted && !hasFinished && !signal.aborted) {
          console.warn(`[TTSManager] Watchdog: onstart did not fire within 1.5s for chunk (retryCount=${retryCount})`);
          cleanup(utterance);
          await this.recoverEngine();

          if (retryCount < 1 && !signal.aborted) {
            // Retry once
            const retrySuccess = await this.speakChunkWithWatchdog(chunk, options, signal, retryCount + 1);
            resolve(retrySuccess);
          } else {
            // Failed twice: mark failed for this turn and fall back to caption-only display
            hasFinished = true;
            resolve(false);
          }
        }
      }, 1500);

      utterance.onstart = () => {
        hasStarted = true;
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
        this.setState('speaking');
        try {
          options.onStart?.();
        } catch {}
      };

      utterance.onend = () => {
        if (hasFinished) return;
        hasFinished = true;
        cleanup(utterance);
        resolve(true);
      };

      utterance.onerror = async (event) => {
        if (hasFinished) return;
        cleanup(utterance);

        // Cancelled / interrupted due to intentional stop
        if (event.error === 'interrupted' || event.error === 'canceled' || signal.aborted) {
          hasFinished = true;
          resolve(false);
          return;
        }

        console.warn('[TTSManager] Utterance error:', event.error);
        if (retryCount < 1 && !signal.aborted) {
          await this.recoverEngine();
          const retrySuccess = await this.speakChunkWithWatchdog(chunk, options, signal, retryCount + 1);
          resolve(retrySuccess);
        } else {
          hasFinished = true;
          resolve(false);
        }
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[TTSManager] speechSynthesis.speak exception:', err);
        cleanup(utterance);
        hasFinished = true;
        resolve(false);
      }
    });
  }

  public stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.isSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      activeUtterances.clear();
    }
    this.setState('idle');
  }

  public pause(): void {
    if (this.isSupported && this.state === 'speaking') {
      try {
        window.speechSynthesis.pause();
        this.setState('paused');
      } catch {}
    }
  }

  public resume(): void {
    if (this.isSupported && this.state === 'paused') {
      try {
        window.speechSynthesis.resume();
        this.setState('speaking');
      } catch {}
    }
  }

  public onStateChange(callback: (state: TTSState) => void): () => void {
    this.stateListeners.push(callback);
    callback(this.state);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  private setState(state: TTSState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateListeners.forEach((cb) => cb(state));
  }
}

// Global singleton instance for easy app-wide sharing
export const ttsManager = new TTSManager();
