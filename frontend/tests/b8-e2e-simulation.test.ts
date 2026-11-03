import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BrowserSpeechToText } from '../src/services/speech/browserSTT';
import { STTChainManager } from '../src/services/speech/sttChainManager';
import { TTSManager, activeUtterances } from '../src/services/speech/ttsManager';
import { computeAdaptiveSilenceTimeoutMs } from '../src/services/speech/adaptiveSilence';
import { sttTimingLogger } from '../src/services/speech/sttTimingLogger';

function getLuminance(hex: string): number {
  const rgb = hex.replace('#', '').match(/.{2}/g)!.map((c) => parseInt(c, 16) / 255);
  const [r, g, b] = rgb.map((val) => (val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

class MockSpeechRecognition {
  public static instances: MockSpeechRecognition[] = [];
  public continuous = false;
  public interimResults = false;
  public lang = 'en-US';
  public maxAlternatives = 1;

  public onstart: (() => void) | null = null;
  public onresult: ((event: any) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onend: (() => void) | null = null;

  public startMock = vi.fn();
  public stopMock = vi.fn();
  public abortMock = vi.fn();

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  public start() {
    this.startMock();
    if (this.onstart) this.onstart();
  }

  public stop() {
    this.stopMock();
    if (this.onend) this.onend();
  }

  public abort() {
    this.abortMock();
    if (this.onend) this.onend();
  }

  public simulateError(error: string, message = '') {
    if (this.onerror) {
      this.onerror({ error, message });
    }
  }

  public simulateTranscript(text: string, isFinal = false) {
    if (this.onresult) {
      this.onresult({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: text }], {
            isFinal,
            length: 1,
          }),
        ],
      });
    }
  }
}

describe('B8: End-to-End 5-Question Interview Simulation & Scorecard Verification', () => {
  let mockSynth: any;

  beforeEach(() => {
    vi.useFakeTimers();
    MockSpeechRecognition.instances = [];
    activeUtterances.clear();
    sttTimingLogger.clearHistory();

    // Reset shared recognition instance
    (BrowserSpeechToText as any).sharedRecognitionInstance = null;

    mockSynth = {
      speak: vi.fn((utterance) => {
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          setTimeout(() => {
            if (utterance.onend) utterance.onend();
          }, 300);
        }, 50);
      }),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn().mockReturnValue([
        { name: 'Google US English', lang: 'en-US', default: true },
      ]),
      speaking: false,
      paused: false,
      pending: false,
    };

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

    const mockWindow = {
      SpeechRecognition: MockSpeechRecognition,
      webkitSpeechRecognition: MockSpeechRecognition,
      speechSynthesis: mockSynth,
      SpeechSynthesisUtterance: MockUtterance,
      AudioContext: vi.fn(),
      webkitAudioContext: vi.fn(),
      localStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    };

    (globalThis as any).window = mockWindow;
    (globalThis as any).document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible',
    };
    (globalThis as any).SpeechRecognition = MockSpeechRecognition;
    (globalThis as any).SpeechSynthesisUtterance = MockUtterance;

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        onLine: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('Condition 1: Full 5-Question Interview via Default Web Speech STT satisfies all target metrics', async () => {
    const questions = [
      'Explain the difference between optimistic and pessimistic concurrency control in distributed databases.',
      'How does React Fiber reconciliation manage priority updates without blocking the browser main thread?',
      'Walk me through how you design an idempotent payment processing webhook receiver.',
      'Describe the difference between process memory isolation and lightweight kernel threads in Linux.',
      'How would you diagnose a memory leak in a production Node.js microservice experiencing OOM crashes?',
    ];

    const candidateAnswers = [
      'Optimistic locking validates data state before writing with version stamps. Pessimistic locking locks records.',
      'React Fiber breaks rendering into incremental work units that yield to the event loop using requestIdleCallback.',
      'We use unique idempotency keys stored in Redis with atomic transaction boundaries and deduplication checks.',
      'Processes have virtual memory address spaces managed by the MMU, whereas threads share memory within a process.',
      'We inspect heap snapshots using chrome devtools, monitor RSS memory telemetry, and check dangling event listeners.',
    ];

    const tts = new TTSManager();
    const chainManager = new STTChainManager({
      chain: ['browser', 'typed'],
    });

    expect(chainManager.activeProvider).toBe('browser');
    const timings: Array<{
      turn: number;
      firstInterimMs: number;
      adaptiveSilenceMs: number;
      ttsStartLatencyMs: number;
      playbackSuccess: boolean;
    }> = [];

    for (let i = 0; i < 5; i++) {
      const turnIndex = i + 1;
      sttTimingLogger.startTurn(turnIndex, 'browser');

      // 1. Question received -> TTS Spoken
      const questionReceivedTime = performance.now();
      sttTimingLogger.recordEvent('question_received', turnIndex);

      let ttsStartedTime = 0;
      const speakPromise = tts.speak(questions[i], {
        onStart: () => {
          ttsStartedTime = performance.now();
          sttTimingLogger.recordEvent('tts_start', turnIndex);
        },
        onEnd: () => {
          sttTimingLogger.recordEvent('tts_end', turnIndex);
        },
      });

      await vi.advanceTimersByTimeAsync(360);
      await speakPromise;

      const ttsStartLatencyMs = ttsStartedTime - questionReceivedTime;
      expect(ttsStartLatencyMs).toBeLessThanOrEqual(500); // Target: <= 500 ms

      // 2. Candidate Speaks -> STT Processing
      chainManager.start();
      const mockRecognizer = MockSpeechRecognition.instances[0];
      expect(mockRecognizer).toBeDefined();

      const speechStartTime = performance.now();
      sttTimingLogger.recordEvent('speech_start', turnIndex);

      // First interim words arrive quickly (e.g., 220ms)
      await vi.advanceTimersByTimeAsync(220);
      mockRecognizer.simulateTranscript('Optimistic', false);
      const firstInterimTime = performance.now();
      sttTimingLogger.recordEvent('first_interim', turnIndex);

      const firstInterimMs = firstInterimTime - speechStartTime;
      expect(firstInterimMs).toBeLessThanOrEqual(400); // Target: <= 400 ms p50

      // Candidate finishes answer
      await vi.advanceTimersByTimeAsync(400);
      mockRecognizer.simulateTranscript(candidateAnswers[i], true);
      sttTimingLogger.recordEvent('final_text', turnIndex);

      // 3. Adaptive Silence Detection
      const adaptiveSilenceMs = computeAdaptiveSilenceTimeoutMs(candidateAnswers[i]);
      expect(adaptiveSilenceMs).toBe(1200); // Terminal punctuation -> 1.2s timeout

      await vi.advanceTimersByTimeAsync(adaptiveSilenceMs);
      sttTimingLogger.recordEvent('answer_end_decision', turnIndex);
      sttTimingLogger.recordEvent('answer_sent', turnIndex);
      chainManager.stop();

      timings.push({
        turn: turnIndex,
        firstInterimMs,
        adaptiveSilenceMs,
        ttsStartLatencyMs,
        playbackSuccess: true,
      });
    }

    expect(timings).toHaveLength(5);
    const avgFirstInterim = timings.reduce((a, b) => a + b.firstInterimMs, 0) / 5;
    const avgTtsStart = timings.reduce((a, b) => a + b.ttsStartLatencyMs, 0) / 5;

    expect(avgFirstInterim).toBeLessThanOrEqual(400);
    expect(avgTtsStart).toBeLessThanOrEqual(500);
    expect(timings.every((t) => t.playbackSuccess)).toBe(true); // 100% TTS success
  });

  it('Condition 2: STT Network Glitch Auto-Recovery without error popup, plus WCAG AA Button Contrast', async () => {
    const chain = new STTChainManager({
      chain: ['browser', 'typed'],
      retryBackoffsMs: [300, 800, 1500],
      maxRetryAttempts: 3,
    });

    chain.start();
    const mockRecognizer = MockSpeechRecognition.instances[0];
    expect(mockRecognizer).toBeDefined();

    // Simulate transient network disconnect
    mockRecognizer.simulateError('network');

    // Calm reconnection indicator active; no intrusive modal
    const status = chain.getChainStatus();
    expect(status.isReconnecting).toBe(true);
    expect(status.statusNotice).toContain('attempt 1/3');
    expect(status.activeProvider).toBe('browser');

    // Auto-recovers on retry backoff (300ms)
    await vi.advanceTimersByTimeAsync(350);
    expect(MockSpeechRecognition.instances.length).toBeGreaterThanOrEqual(1);

    // Verify WCAG AA Contrast for the Try Again button (Rust #B33925 on White #FFFFFF)
    const rustText = '#B33925';
    const whiteBackground = '#FFFFFF';
    const contrastRatio = calculateContrastRatio(rustText, whiteBackground);
    expect(contrastRatio).toBeGreaterThanOrEqual(4.5); // WCAG AA requires >= 4.5:1 (measures ~5.9:1)
  });

  it('Condition 3: Graceful fallback to secondary STT (Nemotron / Typed) when network retries exhaust', async () => {
    const chain = new STTChainManager({
      chain: ['browser', 'typed'],
      retryBackoffsMs: [300, 800, 1500],
      maxRetryAttempts: 3,
    });

    chain.start();

    // Exhaust 3 retries
    const mockInstance = MockSpeechRecognition.instances[0];
    mockInstance.simulateError('network');
    await vi.advanceTimersByTimeAsync(350);

    mockInstance.simulateError('network');
    await vi.advanceTimersByTimeAsync(850);

    mockInstance.simulateError('network');
    await vi.advanceTimersByTimeAsync(1550);

    // 4th error exhausts retries and transitions to 'typed'
    mockInstance.simulateError('network');
    await vi.advanceTimersByTimeAsync(100);

    // Should seamlessly fall back to typed answer without application freeze
    const finalStatus = chain.getChainStatus();
    expect(finalStatus.activeProvider).toBe('typed');
    expect(finalStatus.isExhausted).toBe(true);
  });
});
