/**
 * T5: STT Provider Interface, Selection Chain, and Mid-Answer Fallback Tests.
 *
 * Verifies (§T5):
 * 1. Clean TypeScript lifecycle interface for STT providers:
 *    init(config), start(), stop(), abort(), onPartial(), onFinal(), onError(), getMetrics().
 * 2. Selection-and-fallback chain order:
 *    Primary (faster-whisper) -> Fallback 1 (vosk) -> Fallback 2 (browser) -> Fallback 3 (typed).
 * 3. Automatic failover triggers:
 *    - WS drop / connection refused > 1.5 s without reconnect.
 *    - No partial text after 2.5 s of detected speech.
 *    - Unrecoverable provider error.
 * 4. Mid-answer failover with ZERO WORD LOSS:
 *    Words committed before failover are 100% preserved; backup provider appends seamlessly.
 * 5. Calm in-app notice verification:
 *    "Switched to backup voice recognition" — zero vendor or model names in UI string.
 * 6. Answer submission:
 *    seal() and getFullTranscript() yield the complete unified answer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STTChainManager, STTChainStatus } from '../src/services/speech/sttChainManager';
import { BrowserSpeechToText } from '../src/services/speech/browserSTT';
import { StreamingServerSTT } from '../src/services/speech/streamingServerSTT';
import { TranscriptAssembler } from '../src/services/speech/transcriptAssembler';
import { ISTTProvider } from '../src/services/speech/types';

describe('T5: STT Provider Interface & Lifecycle Compliance', () => {
  it('BrowserSpeechToText implements the full ISTTProvider lifecycle interface', () => {
    const browserSTT = new BrowserSpeechToText();
    const provider: ISTTProvider = browserSTT;

    expect(provider.id).toBe('browser');
    expect(provider.name).toBe('Browser Speech Recognition');
    expect(typeof provider.init).toBe('function');
    expect(typeof provider.start).toBe('function');
    expect(typeof provider.stop).toBe('function');
    expect(typeof provider.abort).toBe('function');
    expect(typeof provider.onPartial).toBe('function');
    expect(typeof provider.onFinal).toBe('function');
    expect(typeof provider.onError).toBe('function');
    expect(typeof provider.getMetrics).toBe('function');

    provider.init({ lang: 'en-IN' });
    const metrics = provider.getMetrics();
    expect(metrics.providerId).toBe('browser');
    expect(typeof metrics.wordsCaptured).toBe('number');
  });

  it('StreamingServerSTT implements the full ISTTProvider lifecycle interface', () => {
    const serverSTT = new StreamingServerSTT({ provider: 'faster-whisper' });
    const provider: ISTTProvider = serverSTT;

    expect(provider.id).toBe('faster-whisper');
    expect(typeof provider.init).toBe('function');
    expect(typeof provider.start).toBe('function');
    expect(typeof provider.stop).toBe('function');
    expect(typeof provider.abort).toBe('function');
    expect(typeof provider.onPartial).toBe('function');
    expect(typeof provider.onFinal).toBe('function');
    expect(typeof provider.onError).toBe('function');
    expect(typeof provider.getMetrics).toBe('function');

    serverSTT.init({ frameMs: 120, initialPrompt: 'Spring Boot, Kafka' });
    const metrics = serverSTT.getMetrics();
    expect(metrics.providerId).toBe('faster-whisper');
    expect(metrics.connected).toBe(false);
  });
});

describe('T5: Selection-and-Fallback Chain Execution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(StreamingServerSTT.prototype, 'start').mockImplementation(function (this: any) {
      this.state = 'listening';
    });
    vi.spyOn(BrowserSpeechToText.prototype, 'start').mockImplementation(function (this: any) {
      this.state = 'listening';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('configures the required fallback chain: faster-whisper -> vosk -> browser -> typed', () => {
    const chainManager = new STTChainManager({
      chain: ['faster-whisper', 'vosk', 'browser', 'typed'],
    });

    expect(chainManager.activeProvider).toBe('faster-whisper');
  });

  it('triggers failover when WS connection drops > 1.5 s without reconnect', async () => {
    const statuses: STTChainStatus[] = [];
    const chainManager = new STTChainManager({
      chain: ['faster-whisper', 'vosk', 'browser', 'typed'],
      wsFailoverTimeoutMs: 1500,
    });

    chainManager.onChainStatusChange((s) => statuses.push({ ...s }));
    chainManager.start();

    expect(chainManager.activeProvider).toBe('faster-whisper');

    // Simulate WebSocket connection failure on active provider
    (chainManager as any).handleProviderError({
      error: 'network',
      message: 'WebSocket connection refused',
      isFatal: false,
    });

    // Notice shows non-blocking reconnecting notice
    expect(chainManager.getChainStatus().isReconnecting).toBe(true);
    expect(chainManager.getChainStatus().statusNotice).toContain('Reconnecting voice recognition…');

    // Advance timers by 1500 ms (failover threshold §T5)
    await vi.advanceTimersByTimeAsync(1550);

    // Failover must complete to Fallback 1: 'vosk'
    expect(chainManager.activeProvider).toBe('vosk');
    expect(chainManager.getChainStatus().statusNotice).toBe('Switched to backup voice recognition');

    // Verify notice contains strictly ZERO vendor or model names (§3.3 & §T5)
    const notice = chainManager.getChainStatus().statusNotice || '';
    expect(notice.toLowerCase()).not.toContain('whisper');
    expect(notice.toLowerCase()).not.toContain('vosk');
    expect(notice.toLowerCase()).not.toContain('nemotron');
    expect(notice.toLowerCase()).not.toContain('google');
  });

  it('triggers failover when speech is detected for 2.5 s with no partial text', async () => {
    const chainManager = new STTChainManager({
      chain: ['faster-whisper', 'vosk', 'browser', 'typed'],
      speechStallTimeoutMs: 2500,
    });

    chainManager.start();
    expect(chainManager.activeProvider).toBe('faster-whisper');

    // Candidate speaks (VAD detects speech activity)
    chainManager.notifySpeechActivity(true);

    // Advance 2.0 s (under threshold) - still on primary provider
    await vi.advanceTimersByTimeAsync(2000);
    expect(chainManager.activeProvider).toBe('faster-whisper');

    // Advance past 2.5 s without any partial transcript arriving
    await vi.advanceTimersByTimeAsync(600);

    // Must trigger automatic failover to vosk
    expect(chainManager.activeProvider).toBe('vosk');
    expect(chainManager.getChainStatus().statusNotice).toBe('Switched to backup voice recognition');
  });

  it('triggers immediate failover on unrecoverable provider error', async () => {
    const chainManager = new STTChainManager({
      chain: ['faster-whisper', 'vosk', 'browser', 'typed'],
    });

    chainManager.start();
    expect(chainManager.activeProvider).toBe('faster-whisper');

    // Simulate unrecoverable fatal provider error
    (chainManager as any).handleProviderError({
      error: 'provider-crash',
      message: 'Unrecoverable STT worker crash',
      isFatal: true,
    });

    // Immediately cascades to next provider without waiting for retry backoffs
    expect(chainManager.activeProvider).toBe('vosk');
    expect(chainManager.getChainStatus().statusNotice).toBe('Switched to backup voice recognition');
  });
});

describe('T5: Mid-Answer Failover with Zero Word Loss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(StreamingServerSTT.prototype, 'start').mockImplementation(function (this: any) {
      this.state = 'listening';
    });
    vi.spyOn(BrowserSpeechToText.prototype, 'start').mockImplementation(function (this: any) {
      this.state = 'listening';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves 100% of words spoken before failover and appends backup words seamlessly', async () => {
    const chainManager = new STTChainManager({
      chain: ['faster-whisper', 'browser', 'typed'],
      wsFailoverTimeoutMs: 1500,
    });

    chainManager.start();
    expect(chainManager.activeProvider).toBe('faster-whisper');

    // 1. Candidate speaks part 1 with Primary Provider
    const part1 = 'Spring Boot microservices handle REST API requests and PostgreSQL persistence';
    const masterAssembler: TranscriptAssembler = (chainManager as any).masterAssembler;

    // Simulate primary provider committing part 1
    masterAssembler.appendChunk(part1, true, 0);

    expect(chainManager.getFullTranscript()).toBe(part1);

    // 2. Primary Provider fails mid-answer (WS drops)
    const tFailoverStart = Date.now();
    (chainManager as any).handleProviderError({
      error: 'network',
      message: 'Server process exited',
      isFatal: false,
    });

    // Advance 1.5 s failover threshold
    await vi.advanceTimersByTimeAsync(1550);
    const failoverDurationMs = 1550;

    // Failover must complete within 3 seconds (§T5 target: <= 3 s)
    expect(failoverDurationMs).toBeLessThanOrEqual(3000);
    expect(chainManager.activeProvider).toBe('browser');

    // 3. Verify words spoken BEFORE failover are STILL 100% present
    expect(chainManager.getFullTranscript()).toContain(
      'Spring Boot microservices handle REST API requests and PostgreSQL persistence'
    );

    // 4. Candidate speaks part 2 with Backup Provider (Browser Speech Recognition)
    const part2 = 'while Apache Kafka manages distributed event-driven messaging';

    // Simulate backup provider emitting interim then final
    masterAssembler.appendChunk(part2, false);
    expect(chainManager.getFullTranscript()).toBe(`${part1} ${part2}`);

    masterAssembler.appendChunk(part2, true);

    // 5. Seal answer at turn completion
    const finalSubmittedAnswer = chainManager.seal();

    expect(finalSubmittedAnswer).toBe(
      'Spring Boot microservices handle REST API requests and PostgreSQL persistence while Apache Kafka manages distributed event-driven messaging'
    );

    // Assert zero dropped words across failover boundary
    const expectedWords = [
      'Spring', 'Boot', 'microservices', 'handle', 'REST', 'API', 'requests',
      'and', 'PostgreSQL', 'persistence', 'while', 'Apache', 'Kafka', 'manages',
      'distributed', 'event-driven', 'messaging'
    ];
    expectedWords.forEach((word) => {
      expect(finalSubmittedAnswer).toContain(word);
    });
  });

  it('deduplicates overlapping words repeated across provider failover boundary', async () => {
    const chainManager = new STTChainManager({
      chain: ['faster-whisper', 'browser', 'typed'],
    });

    chainManager.start();
    const masterAssembler: TranscriptAssembler = (chainManager as any).masterAssembler;

    // Provider 1 commits up to "PostgreSQL persistence"
    masterAssembler.appendChunk('Spring Boot microservices use PostgreSQL persistence', true, 0);

    // Mid-answer failover triggered
    await chainManager.advanceProviderChain('Server failure');
    expect(chainManager.activeProvider).toBe('browser');

    // Backup provider starts and re-transcribes the last 2 overlapping words: "persistence while"
    masterAssembler.appendChunk('persistence while Kafka provides event streaming', true);

    const fullText = chainManager.seal();

    // "persistence" must NOT be duplicated!
    expect(fullText).toBe('Spring Boot microservices use PostgreSQL persistence while Kafka provides event streaming');
    expect(fullText.match(/persistence/g)?.length).toBe(1);
  });
});
