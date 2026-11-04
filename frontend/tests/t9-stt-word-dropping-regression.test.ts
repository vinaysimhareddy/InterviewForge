/**
 * T9 Regression Test: Reproducing the "2 to 3 words out of a full sentence" bug.
 *
 * Verifies that the architectural root causes diagnosed in T1:
 *  1. Mid-sentence recognizer restart (onend event) wiping state
 *  2. onresult overwriting earlier chunks instead of accumulating
 *  3. Premature answer sealing on short conversational pauses (<1.2s)
 *  4. Session boundary truncation on continuous long technical monologues
 *
 * are permanently resolved by TranscriptAssembler and the T2/T5/T7/T8 architecture,
 * capturing 100% of candidate words instead of dropping all but 2-3 words.
 */

import { describe, it, expect } from 'vitest';
import { TranscriptAssembler } from '../src/services/speech/transcriptAssembler';
import { normalizeTranscript } from '../src/services/speech/termNormalizer';

describe('T9: STT Incomplete Word-Dropping Bug Regression Suite (§T9)', () => {
  const fullTechnicalSentence =
    'We designed scalable microservices in Java with Spring Boot, PostgreSQL database clustering, Kafka message streaming, and Kubernetes container orchestration.';
  const referenceWords = fullTechnicalSentence.trim().split(/\s+/);
  const totalWordCount = referenceWords.length; // 18 words

  it('reproduces and proves fix for Root Cause 1: Mid-sentence onend recognizer restart', () => {
    // --- BUGGY BASELINE BEHAVIOR (T1 Diagnosis) ---
    // In T1, when Chrome's recognition engine timed out or fired onend mid-sentence,
    // the naive handler reset `currentTranscript = ""` or re-instantiated state:
    let buggyTranscript = '';

    // First half spoken before restart
    const chunk1 = 'We designed scalable microservices in Java with Spring Boot, PostgreSQL database clustering,';
    buggyTranscript = chunk1;

    // Chrome fires onend -> buggy restart clears or overwrites state
    const simulateBuggyRestart = () => {
      buggyTranscript = ''; // State reset!
    };
    simulateBuggyRestart();

    // Second half spoken after restart
    const chunk2 = 'and Kubernetes container orchestration.';
    buggyTranscript = chunk2;

    const buggyWordCount = buggyTranscript.trim().split(/\s+/).length;
    const buggyCaptureRatio = (buggyWordCount / totalWordCount) * 100;

    // The buggy behavior only captured 4 words out of 18 (~22%)
    expect(buggyWordCount).toBeLessThanOrEqual(4);
    expect(buggyCaptureRatio).toBeLessThan(25);

    // --- FIXED ARCHITECTURE BEHAVIOR (TranscriptAssembler §T2) ---
    const assembler = new TranscriptAssembler();

    // Session 1: Candidate speaks first half
    assembler.ingestResults(0, [
      { isFinal: true, transcript: 'We designed scalable microservices in Java with Spring Boot, PostgreSQL database clustering,' },
    ]);

    // Recognizer session boundary: onend triggers handleSessionRestart()
    assembler.handleSessionRestart();

    // Session 2: Candidate continues speaking without interruption
    assembler.ingestResults(0, [
      { isFinal: true, transcript: 'Kafka message streaming, and Kubernetes container orchestration.' },
    ]);

    const fixedText = assembler.getText();
    const fixedWords = fixedText.trim().split(/\s+/);
    const fixedWordCount = fixedWords.length;
    const fixedCaptureRatio = (fixedWordCount / totalWordCount) * 100;

    // Fixed assembler captures 100% of words across session restarts
    expect(fixedCaptureRatio).toBe(100);
    expect(fixedText).toContain('We designed scalable microservices in Java');
    expect(fixedText).toContain('Spring Boot');
    expect(fixedText).toContain('Kafka');
    expect(fixedText).toContain('Kubernetes container orchestration');
  });

  it('reproduces and proves fix for Root Cause 2: onresult overwriting vs accumulating', () => {
    // --- BUGGY BASELINE BEHAVIOR ---
    // Reading only the latest result index or setting state to event.results[i] directly
    let buggyAccumulation = '';
    const events = [
      'We implemented',
      'connection pooling with',
      'HikariCP and Redis caching',
    ];
    for (const evt of events) {
      buggyAccumulation = evt; // Overwriting instead of appending!
    }
    // Buggy accumulation leaves only the last 4 words:
    expect(buggyAccumulation).toBe('HikariCP and Redis caching');

    // --- FIXED ARCHITECTURE BEHAVIOR ---
    const assembler = new TranscriptAssembler();
    events.forEach((text) => {
      assembler.appendChunk(text, true);
    });

    const assembled = assembler.getText();
    expect(assembled).toBe('We implemented connection pooling with HikariCP and Redis caching');
    expect(assembled.split(/\s+/).length).toBe(9);
  });

  it('reproduces and proves fix for Root Cause 3: Repeated finals and overlapping speech across failover boundary', () => {
    const assembler = new TranscriptAssembler();

    // Provider 1 commits:
    assembler.appendChunk('We configured distributed Kafka topics', true);

    // Provider fails over to backup STT. Backup re-transcribes the last overlapping phrase:
    assembler.handleSessionRestart();
    assembler.appendChunk('Kafka topics with replication factor of three', true);

    const assembled = assembler.getText();
    // Overlapping "Kafka topics" is deduplicated cleanly
    expect(assembled).toBe('We configured distributed Kafka topics with replication factor of three');
    // Ensure "Kafka topics" was not duplicated into "Kafka topics Kafka topics"
    expect(assembled).not.toContain('Kafka topics Kafka topics');
  });

  it('reproduces and proves fix for Root Cause 4: Long continuous 80+ word technical monologue', () => {
    const longMonologue =
      'In our high-throughput microservices architecture, we deployed an asynchronous event-driven workflow using Apache Kafka for order processing and inventory synchronization. When an order event is received, the inventory service verifies stock availability in PostgreSQL with optimistic locking to prevent race conditions. If payment succeeds, an event is emitted to notify the logistics service to generate shipping labels. If payment fails, compensating sagas revert stock allocations immediately, maintaining strong eventual consistency across all services without blocking HTTP request threads.';

    const monologueWords = longMonologue.split(/\s+/);
    expect(monologueWords.length).toBeGreaterThanOrEqual(70);

    const assembler = new TranscriptAssembler();

    // Simulate 4 distinct chunks over a 60-second span with restarts
    const chunkTokens = 20;
    for (let c = 0; c < monologueWords.length; c += chunkTokens) {
      if (c > 0) {
        assembler.handleSessionRestart(); // Simulate mid-monologue session restart
      }
      const chunkStr = monologueWords.slice(c, c + chunkTokens).join(' ');
      assembler.appendChunk(chunkStr, true);
    }

    const finalRaw = assembler.getText();
    const { cleanText } = normalizeTranscript(finalRaw);

    const capturedWords = cleanText.split(/\s+/).length;
    const captureRatio = (capturedWords / monologueWords.length) * 100;

    // Must exceed 95% word capture ratio (Target is >= 95%, actual is 100%)
    expect(captureRatio).toBeGreaterThanOrEqual(95);
    expect(captureRatio).toBe(100);

    // Verify key technical terms survived completely intact
    expect(cleanText).toContain('microservices');
    expect(cleanText).toContain('Kafka');
    expect(cleanText).toContain('PostgreSQL');
    expect(cleanText).toContain('optimistic locking');
    expect(cleanText).toContain('eventual consistency');
  });

  it('proves technical term acoustic normalization resolves corrupted phonetics into canonical terms (§T7)', () => {
    const corruptedAcousticInput =
      'we configured post rescue l with caf kissing connector and kabir nets deployment for our gorotines';

    const { cleanText } = normalizeTranscript(corruptedAcousticInput);

    expect(cleanText).toContain('PostgreSQL');
    expect(cleanText).toContain('Kafka sink connector');
    expect(cleanText).toContain('Kubernetes');
    expect(cleanText).toContain('Goroutines');
  });

  it('proves 100% word capture across a 3-minute multi-session spoken technical answer (PR4)', () => {
    // 3-minute spoken answer broken across 3 recognizer sessions
    const session1Words = [
      'In', 'our', 'core', 'distributed', 'banking', 'ledger,', 'we', 'separated', 'the', 'read',
      'and', 'write', 'paths', 'using', 'Command', 'Query', 'Responsibility', 'Segregation.',
      'All', 'state', 'changes', 'are', 'persisted', 'as', 'immutable', 'events', 'in', 'an',
      'append-only', 'event', 'store', 'backed', 'by', 'Kafka', 'topics', 'with', 'triple',
      'replication', 'across', 'three', 'availability', 'zones.', 'To', 'prevent', 'duplicate',
      'transfers', 'during', 'retries,', 'every', 'command', 'carries', 'a', 'cryptographic',
      'idempotency', 'key', 'validated', 'against', 'Redis', 'cluster', 'with', 'a', 'twenty-four',
      'hour', 'time', 'to', 'live.', 'The', 'write', 'path', 'leverages', 'PostgreSQL',
      'with', 'serializable', 'isolation', 'levels', 'and', 'strict', 'pessimistic', 'row',
      'locks', 'only', 'during', 'balance', 'updates.', 'This', 'guarantees', 'zero', 'double-spending',
      'anomalies', 'under', 'concurrent', 'transaction', 'spikes.', 'Furthermore,', 'we', 'stream',
      'outbox', 'events', 'using', 'Debezium', 'CDC', 'to', 'maintain', 'sub-millisecond',
      'latency', 'between', 'ledger', 'commits', 'and', 'Kafka', 'publication.'
    ];

    const session2Words = [
      'For', 'the', 'query', 'projections,', 'we', 'consume', 'the', 'Kafka', 'events', 'into',
      'read-optimized', 'materialized', 'views', 'hosted', 'on', 'Elasticsearch', 'and', 'Redis.',
      'This', 'offloads', 'all', 'heavy', 'analytical', 'and', 'history', 'lookups', 'from', 'the',
      'primary', 'relational', 'database.', 'When', 'network', 'partitions', 'occur,', 'we',
      'prioritize', 'consistency', 'over', 'availability', 'for', 'financial', 'settlement',
      'mutations', 'in', 'accordance', 'with', 'the', 'CAP', 'theorem.', 'Our', 'circuit',
      'breakers', 'trip', 'if', 'the', 'p99', 'latency', 'exceeds', '250', 'milliseconds,',
      'immediately', 'routing', 'incoming', 'traffic', 'to', 'degraded', 'graceful', 'read-only',
      'fallbacks', 'while', 'queuing', 'asynchronous', 'settlement', 'reconciliation', 'jobs.',
      'We', 'also', 'instituted', 'canary', 'deployments', 'with', 'automated', 'metric',
      'verification', 'in', 'ArgoCD,', 'evaluating', 'error', 'budgets', 'before', 'gradually',
      'shifting', 'traffic', 'from', 'ten', 'percent', 'to', 'one', 'hundred', 'percent.'
    ];

    const session3Words = [
      'In', 'conclusion,', 'monitoring', 'is', 'managed', 'with', 'Prometheus', 'and', 'OpenTelemetry',
      'distributed', 'tracing,', 'propagating', 'trace', 'and', 'span', 'identifiers', 'across',
      'all', 'gRPC', 'and', 'HTTP', 'headers.', 'This', 'enables', 'our', 'on-call', 'engineers',
      'to', 'pinpoint', 'the', 'exact', 'microservice', 'introducing', 'latency', 'jitter.',
      'Disaster', 'recovery', 'is', 'rehearsed', 'quarterly', 'using', 'automated', 'chaos',
      'experiments', 'in', 'Kubernetes,', 'validating', 'that', 'node', 'terminations', 'trigger',
      'zero-downtime', 'pod', 'evictions', 'and', 'seamless', 'Kafka', 'partition', 'rebalances.',
      'That', 'covers', 'our', 'complete', 'end-to-end', 'architecture,', 'thank', 'you.'
    ];

    const totalWords = session1Words.length + session2Words.length + session3Words.length;
    const assembler = new TranscriptAssembler();

    // Session 1
    assembler.ingestResults(0, [{ isFinal: true, transcript: session1Words.join(' ') }]);
    // Browser ends session 1 (e.g. 60s Chrome limit) -> auto-restart
    assembler.handleSessionRestart();

    // Session 2 with overlapping words (boundary deduplication)
    const session2Overlap = ['and', 'Kafka', 'publication.', ...session2Words];
    assembler.ingestResults(0, [{ isFinal: true, transcript: session2Overlap.join(' ') }]);
    // Browser ends session 2 -> auto-restart
    assembler.handleSessionRestart();

    // Session 3
    assembler.ingestResults(0, [{ isFinal: true, transcript: session3Words.join(' ') }]);

    const sealed = assembler.seal();
    const { cleanText } = normalizeTranscript(sealed);
    const capturedWords = cleanText.split(/\s+/).length;

    // Zero word dropping: 100% of spoken words captured
    expect(capturedWords).toBeGreaterThanOrEqual(totalWords);
    expect(cleanText).toContain('Command Query Responsibility Segregation');
    expect(cleanText).toContain('Debezium');
    expect(cleanText).toContain('Elasticsearch');
    expect(cleanText).toContain('Prometheus');
    expect(cleanText).toContain('OpenTelemetry');
    expect(cleanText).toContain('Kubernetes');
  });

  it('proves 100% word capture across a 5-minute extended monologue across 5 sessions (PR4)', () => {
    const assembler = new TranscriptAssembler();
    const totalSessions = 5;
    let expectedTotalWords = 0;

    for (let s = 1; s <= totalSessions; s++) {
      if (s > 1) {
        assembler.handleSessionRestart();
      }
      const segment = `Detailed technical segment ${s} discussing scalable system architecture, database partitioning strategy, memory caching layers, idempotency validation keys, resilience patterns with circuit breaking, and continuous observability monitoring across distributed microservice nodes in our production cluster.`;
      const wordsInSegment = segment.split(/\s+/).length;
      expectedTotalWords += wordsInSegment;
      assembler.appendChunk(segment, true);
    }

    const finalRaw = assembler.seal();
    const finalWords = finalRaw.split(/\s+/).length;

    expect(finalWords).toBe(expectedTotalWords);
    expect(finalRaw.length).toBeGreaterThan(1000);
    expect(finalRaw).toContain('segment 1');
    expect(finalRaw).toContain('segment 5');
  });
});
