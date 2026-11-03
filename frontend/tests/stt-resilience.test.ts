import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BrowserSpeechToText } from '../src/services/speech/browserSTT';
import { STTChainManager, parseConfiguredProviderChain } from '../src/services/speech/sttChainManager';
import { mapSpeechRecognitionError } from '../src/services/speech/speechErrors';

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

describe('B3: STT Network-Error Resilience & Provider Chain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockSpeechRecognition.instances = [];

    // Reset shared recognition instance
    (BrowserSpeechToText as any).sharedRecognitionInstance = null;

    const mockWindow = {
      SpeechRecognition: MockSpeechRecognition,
      webkitSpeechRecognition: MockSpeechRecognition,
      AudioContext: vi.fn(),
      webkitAudioContext: vi.fn(),
      localStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    };

    (globalThis as any).window = mockWindow;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        onLine: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      },
      configurable: true,
      writable: true,
    });
    (globalThis as any).SpeechRecognition = MockSpeechRecognition;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('1. Single Recognizer Instance & Debounce Guard', () => {
    it('reuses a single shared SpeechRecognition instance across multiple BrowserSpeechToText objects', () => {
      const stt1 = new BrowserSpeechToText();
      const stt2 = new BrowserSpeechToText();

      expect(MockSpeechRecognition.instances.length).toBe(1);
      expect((stt1 as any).recognition).toBe((stt2 as any).recognition);
    });

    it('enforces >= 300ms debounce between stop and start', async () => {
      const stt = new BrowserSpeechToText();
      const mockInstance = MockSpeechRecognition.instances[0];

      stt.start();
      expect(mockInstance.startMock).toHaveBeenCalledTimes(1);

      stt.stop();
      expect(mockInstance.stopMock).toHaveBeenCalledTimes(1);

      // Immediately call start again (< 300ms elapsed)
      stt.start();
      // Should not have started immediately
      expect(mockInstance.startMock).toHaveBeenCalledTimes(1);

      // Advance by 200ms (total 200ms < 300ms)
      await vi.advanceTimersByTimeAsync(200);
      expect(mockInstance.startMock).toHaveBeenCalledTimes(1);

      // Advance remaining 150ms (total > 300ms)
      await vi.advanceTimersByTimeAsync(150);
      expect(mockInstance.startMock).toHaveBeenCalledTimes(2);
    });

    it('backs off by 2.5s when rapid restart loop (>= 3 restarts in 5s) occurs', async () => {
      const stt = new BrowserSpeechToText();
      const mockInstance = MockSpeechRecognition.instances[0];

      // Simulate 3 starts in rapid succession
      stt.start(); // #1
      await vi.advanceTimersByTimeAsync(350);
      stt.stop();

      await vi.advanceTimersByTimeAsync(350);
      stt.start(); // #2
      await vi.advanceTimersByTimeAsync(350);
      stt.stop();

      await vi.advanceTimersByTimeAsync(350);
      stt.start(); // #3
      await vi.advanceTimersByTimeAsync(350);
      stt.stop();

      // Trigger 4th restart within 5s window
      await vi.advanceTimersByTimeAsync(350);
      stt.start();

      // At 500ms, start should not have executed because 2.5s backoff is active
      await vi.advanceTimersByTimeAsync(500);
      const callCountBeforeBackoff = mockInstance.startMock.mock.calls.length;

      // Advance 2100ms more (total > 2500ms)
      await vi.advanceTimersByTimeAsync(2100);
      expect(mockInstance.startMock.mock.calls.length).toBeGreaterThan(callCountBeforeBackoff);
    });
  });

  describe('2. Silent Error Handling', () => {
    it('silently restarts on "no-speech" without dispatching fatal error to listeners', async () => {
      const stt = new BrowserSpeechToText();
      const mockInstance = MockSpeechRecognition.instances[0];
      const errorSpy = vi.fn();
      stt.onError(errorSpy);

      stt.start();
      mockInstance.simulateError('no-speech');

      // Error listener must NOT have been called for no-speech
      expect(errorSpy).not.toHaveBeenCalled();

      // Should automatically schedule restart after 300ms
      await vi.advanceTimersByTimeAsync(350);
      expect(mockInstance.startMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('silently ignores "aborted" without user notification', async () => {
      const stt = new BrowserSpeechToText();
      const mockInstance = MockSpeechRecognition.instances[0];
      const errorSpy = vi.fn();
      stt.onError(errorSpy);

      stt.start();
      mockInstance.simulateError('aborted');

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('dispatches fatal error immediately for microphone hardware or permission denial', () => {
      const stt = new BrowserSpeechToText();
      const mockInstance = MockSpeechRecognition.instances[0];
      const errorSpy = vi.fn();
      stt.onError(errorSpy);

      stt.start();
      mockInstance.simulateError('not-allowed');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'not-allowed',
          isFatal: true,
        })
      );
    });
  });

  describe('3. STTChainManager Network Retry Backoffs & Provider Fallback', () => {
    it('applies exponential backoff (300ms, 800ms, 1500ms) and reports reconnecting status on network errors', async () => {
      const chain = new STTChainManager({
        chain: ['browser', 'typed'],
        retryBackoffsMs: [300, 800, 1500],
        maxRetryAttempts: 3,
      });

      const statusHistory: any[] = [];
      chain.onChainStatusChange((status) => statusHistory.push({ ...status }));

      chain.start();
      const mockInstance = MockSpeechRecognition.instances[0];

      // Error 1: network
      mockInstance.simulateError('network');
      let status = chain.getChainStatus();
      expect(status.isReconnecting).toBe(true);
      expect(status.reconnectAttempt).toBe(1);
      expect(status.statusNotice).toContain('attempt 1/3');

      // Wait 350ms -> attempt 1 fires
      await vi.advanceTimersByTimeAsync(350);

      // Error 2: network
      mockInstance.simulateError('network');
      status = chain.getChainStatus();
      expect(status.isReconnecting).toBe(true);
      expect(status.reconnectAttempt).toBe(2);
      expect(status.statusNotice).toContain('attempt 2/3');

      // Wait 850ms -> attempt 2 fires
      await vi.advanceTimersByTimeAsync(850);

      // Error 3: network
      mockInstance.simulateError('network');
      status = chain.getChainStatus();
      expect(status.isReconnecting).toBe(true);
      expect(status.reconnectAttempt).toBe(3);
      expect(status.statusNotice).toContain('attempt 3/3');
    });

    it('recovers seamlessly and clears reconnecting status if speech transcript arrives during retry', async () => {
      const chain = new STTChainManager({
        chain: ['browser', 'typed'],
      });

      chain.start();
      const mockInstance = MockSpeechRecognition.instances[0];

      // Network blip occurs
      mockInstance.simulateError('network');
      expect(chain.getChainStatus().isReconnecting).toBe(true);

      // Candidate speaks and transcript arrives
      mockInstance.simulateTranscript('Hello world', true);

      // Should automatically recover!
      const status = chain.getChainStatus();
      expect(status.isReconnecting).toBe(false);
      expect(status.reconnectAttempt).toBe(0);
      expect(status.statusNotice).toBeNull();
    });

    it('falls back to typed answer when 3 network retries are exhausted and alternative voice service is unavailable', async () => {
      const chain = new STTChainManager({
        chain: ['browser', 'typed'],
        retryBackoffsMs: [100, 100, 100],
        maxRetryAttempts: 3,
      });

      const errorSpy = vi.fn();
      chain.onError(errorSpy);

      chain.start();
      const mockInstance = MockSpeechRecognition.instances[0];

      // 3 successive network errors
      mockInstance.simulateError('network');
      await vi.advanceTimersByTimeAsync(150);

      mockInstance.simulateError('network');
      await vi.advanceTimersByTimeAsync(150);

      mockInstance.simulateError('network');
      await vi.advanceTimersByTimeAsync(150);

      // 4th error triggers chain advance
      mockInstance.simulateError('network');
      await vi.advanceTimersByTimeAsync(150);

      const status = chain.getChainStatus();
      expect(status.activeProvider).toBe('typed');
      expect(status.isExhausted).toBe(true);
      expect(status.isReconnecting).toBe(false);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'network',
          isFatal: true,
        })
      );
    });

    it('resets chain and re-engages browser STT when retry() is called', async () => {
      const chain = new STTChainManager({
        chain: ['browser', 'typed'],
        retryBackoffsMs: [100, 100, 100],
        maxRetryAttempts: 1,
      });

      chain.start();
      const mockInstance = MockSpeechRecognition.instances[0];

      // Exhaust retries to switch to typed
      mockInstance.simulateError('network');
      await vi.advanceTimersByTimeAsync(150);
      mockInstance.simulateError('network');
      await vi.advanceTimersByTimeAsync(150);

      expect(chain.getChainStatus().activeProvider).toBe('typed');

      // Candidate clicks "Try Again"
      chain.retry();

      const status = chain.getChainStatus();
      expect(status.activeProvider).toBe('browser');
      expect(status.isExhausted).toBe(false);
      expect(status.reconnectAttempt).toBe(0);
    });
  });

  describe('4. Error Mapping & WCAG AA Contrast', () => {
    it('maps "network" error to actionable explanation with retry recommendation', () => {
      const mapped = mapSpeechRecognitionError('network');
      expect(mapped.title).toContain('Network Error');
      expect(mapped.explanation).toContain('internet connection');
      expect(mapped.recoveryStep).toContain('Try Again');
    });

    it('parses STT_PROVIDER_CHAIN correctly from default', () => {
      const parsed = parseConfiguredProviderChain();
      expect(parsed).toEqual(['browser', 'nemotron', 'typed']);
    });
  });
});
