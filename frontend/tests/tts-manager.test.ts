import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  TTSManager,
  chunkSpeechText,
  activeUtterances,
} from '../src/services/speech/ttsManager';

describe('B2: TTSManager Reliability & Diagnostics', () => {
  let mockSynth: {
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    getVoices: ReturnType<typeof vi.fn>;
    speaking: boolean;
    paused: boolean;
    pending: boolean;
    onvoiceschanged?: () => void;
  };

  let visibilityListeners: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    activeUtterances.clear();
    visibilityListeners = [];

    mockSynth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn().mockReturnValue([
        {
          name: 'Google US English Natural',
          lang: 'en-US',
          voiceURI: 'urn:voice:google-en-us',
          default: true,
          localService: true,
        },
      ]),
      speaking: false,
      paused: false,
      pending: false,
    };

    // Mock Utterance
    class MockUtterance {
      public text: string;
      public rate = 1.0;
      public pitch = 1.0;
      public volume = 1.0;
      public voice: any = null;
      public onstart: (() => void) | null = null;
      public onend: (() => void) | null = null;
      public onerror: ((e: any) => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    const mockDocument = {
      hidden: false,
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === 'visibilitychange') {
          visibilityListeners.push(cb);
        }
      }),
      removeEventListener: vi.fn(),
    };

    const mockWindow = {
      speechSynthesis: mockSynth,
      SpeechSynthesisUtterance: MockUtterance,
    };

    (globalThis as any).window = mockWindow;
    (globalThis as any).document = mockDocument;
    (globalThis as any).SpeechSynthesisUtterance = MockUtterance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Text Chunking for Long Sentences', () => {
    it('returns empty array for whitespace text', () => {
      expect(chunkSpeechText('')).toEqual([]);
      expect(chunkSpeechText('   ')).toEqual([]);
    });

    it('keeps short text under 180 chars intact in a single chunk', () => {
      const text = 'How would you design a scalable notification service?';
      const chunks = chunkSpeechText(text, 180);
      expect(chunks).toEqual([text]);
      expect(chunks[0].length).toBeLessThanOrEqual(180);
    });

    it('splits long text (> 180 chars) on sentence boundaries', () => {
      const text =
        'Can you explain how React handles state updates under the hood? What happens during a render pass, and how does concurrent mode change this behavior? Please walk us through the reconciliation lifecycle and fiber trees.';
      expect(text.length).toBeGreaterThan(180);

      const chunks = chunkSpeechText(text, 180);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(180);
      }
    });

    it('splits a massive sentence without punctuation on word boundaries to stay <= 180 chars', () => {
      const word = 'distributed';
      const massiveSentence = Array(30).fill(word).join(' '); // 30 * 12 = 360 chars
      expect(massiveSentence.length).toBeGreaterThan(180);

      const chunks = chunkSpeechText(massiveSentence, 180);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(180);
      }
    });
  });

  describe('2. Voice Initialization and Fallback', () => {
    it('initializes voices and selects natural English voice when available', async () => {
      const manager = new TTSManager();
      const voices = await manager.initVoices();
      expect(voices.length).toBe(1);
      expect(voices[0].name).toBe('Google US English Natural');
    });

    it('falls back gracefully after 2 seconds if voiceschanged never fires', async () => {
      mockSynth.getVoices.mockReturnValue([]);
      const manager = new TTSManager();

      const voicesPromise = manager.initVoices();
      // Fast forward past 2-second timeout
      await vi.advanceTimersByTimeAsync(2100);

      const voices = await voicesPromise;
      expect(voices).toEqual([]);
      expect(manager.isSupported).toBe(true);
    });
  });

  describe('3. Utterance Retention in Active Set (Anti-GC Bug)', () => {
    it('adds utterance to activeUtterances during speak and cleans up on completion', async () => {
      mockSynth.speak.mockImplementation((utterance: any) => {
        // Trigger onstart then onend asynchronously
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          setTimeout(() => {
            if (utterance.onend) utterance.onend();
          }, 100);
        }, 50);
      });

      const manager = new TTSManager();
      const speakPromise = manager.speak('Hello world');

      // Utterance should be in activeUtterances immediately
      expect(activeUtterances.size).toBe(1);

      // Advance timers to trigger onstart and onend
      await vi.advanceTimersByTimeAsync(200);
      await speakPromise;

      // Upon completion, utterance must be removed from activeUtterances
      expect(activeUtterances.size).toBe(0);
      expect(manager.getAudioState()).toBe('idle');
    });
  });

  describe('4. Watchdog & Automatic Recovery', () => {
    it('triggers watchdog after 1.5s if onstart does not fire and retries', async () => {
      let callCount = 0;
      mockSynth.speak.mockImplementation((utterance: any) => {
        callCount++;
        if (callCount === 1) {
          // First attempt: simulate frozen onstart (never fires)
        } else {
          // Second attempt (retry): fires onstart and onend normally
          setTimeout(() => {
            if (utterance.onstart) utterance.onstart();
            setTimeout(() => {
              if (utterance.onend) utterance.onend();
            }, 100);
          }, 50);
        }
      });

      const manager = new TTSManager();
      const speakPromise = manager.speak('Testing watchdog retry mechanism');

      // 1. First call happens
      expect(callCount).toBe(1);

      // 2. Advance 1.6s + 60ms for recovery -> triggers watchdog & recovery & retry
      await vi.advanceTimersByTimeAsync(1660);

      // 3. Engine recovery was called
      expect(mockSynth.cancel).toHaveBeenCalled();

      // 4. Retry was called
      expect(callCount).toBe(2);

      // 5. Complete retry
      await vi.advanceTimersByTimeAsync(200);
      await speakPromise;

      expect(manager.getAudioState()).toBe('idle');
    });

    it('transitions to silent-fallback and does not hang if retry also times out', async () => {
      // Both attempts stall (onstart never fires)
      mockSynth.speak.mockImplementation(() => {});

      const manager = new TTSManager();
      const speakPromise = manager.speak('Unresponsive audio device text');

      // Advance 1.6s + 60ms (Attempt 1 timeout & recovery)
      await vi.advanceTimersByTimeAsync(1660);

      // Advance 1.6s + 60ms (Attempt 2 timeout & recovery)
      await vi.advanceTimersByTimeAsync(1660);
      await speakPromise;

      // Must have gracefully transitioned to silent-fallback without hanging!
      expect(manager.getAudioState()).toBe('silent-fallback');
    });
  });

  describe('5. Audio Gesture Unlock & Tab Backgrounding', () => {
    it('unlockAudio speaks a micro-utterance to satisfy browser autoplay policies', () => {
      const manager = new TTSManager();
      manager.unlockAudio();

      expect(mockSynth.speak).toHaveBeenCalled();
      const lastCall = mockSynth.speak.mock.calls[0][0];
      expect(lastCall.volume).toBeLessThanOrEqual(0.05);
    });

    it('pauses and resumes on visibilitychange', () => {
      const manager = new TTSManager();
      // Simulate state speaking
      (manager as any).state = 'speaking';

      // Tab hidden
      (globalThis as any).document.hidden = true;
      visibilityListeners.forEach((cb) => cb());
      expect(mockSynth.pause).toHaveBeenCalled();
      expect(manager.getAudioState()).toBe('paused');

      // Tab visible
      (globalThis as any).document.hidden = false;
      visibilityListeners.forEach((cb) => cb());
      expect(mockSynth.resume).toHaveBeenCalled();
      expect(manager.getAudioState()).toBe('speaking');
    });

    it('replays question accurately', async () => {
      mockSynth.speak.mockImplementation((utterance: any) => {
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          if (utterance.onend) utterance.onend();
        }, 10);
      });

      const manager = new TTSManager();
      const firstSpeak = manager.speak('What is eventual consistency?');
      await vi.advanceTimersByTimeAsync(50);
      await firstSpeak;

      expect(manager.getLastSpokenText()).toBe('What is eventual consistency?');

      const replayPromise = manager.replayQuestion();
      await vi.advanceTimersByTimeAsync(50);
      await replayPromise;

      expect(mockSynth.speak).toHaveBeenCalledTimes(2);
    });
  });
});
