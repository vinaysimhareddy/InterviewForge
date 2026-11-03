import { describe, it, expect, beforeEach } from 'vitest';
import { sttTimingLogger } from '../src/services/speech/sttTimingLogger';

describe('STT Timing Logger (§1)', () => {
  beforeEach(() => {
    sttTimingLogger.clearHistory();
    sttTimingLogger.setDevMode(false); // keep test runs quiet
  });

  it('records all 5 milestones and computes all 4 latency gaps accurately', () => {
    sttTimingLogger.startTurn(1);

    // Simulate turn timeline
    sttTimingLogger.recordEvent('speech_start', 1);
    sttTimingLogger.recordEvent('first_interim', 1);
    sttTimingLogger.recordEvent('final_text', 1);
    sttTimingLogger.recordEvent('answer_end', 1);
    sttTimingLogger.recordEvent('next_question_spoken', 1);

    const history = sttTimingLogger.getHistory();
    expect(history.length).toBe(1);

    const record = history[0];
    expect(record.turnIndex).toBe(1);
    expect(record.timestamps.speech_start).toBeDefined();
    expect(record.timestamps.first_interim).toBeDefined();
    expect(record.timestamps.final_text).toBeDefined();
    expect(record.timestamps.answer_end).toBeDefined();
    expect(record.timestamps.next_question_spoken).toBeDefined();

    expect(typeof record.gaps.speech_to_first_interim_ms).toBe('number');
    expect(typeof record.gaps.interim_to_final_text_ms).toBe('number');
    expect(typeof record.gaps.speech_to_answer_end_ms).toBe('number');
    expect(typeof record.gaps.answer_end_to_next_question_ms).toBe('number');
  });

  it('computes p50 and p95 metrics accurately over 10 test answers', () => {
    // Simulate 10 realistic interview turn answers with known incremental delays
    for (let i = 1; i <= 10; i++) {
      sttTimingLogger.startTurn(i);

      // We use synthetic timestamps to verify percentile calculation deterministically
      const base = 1000 * i;
      const turnRecord = (sttTimingLogger as any).currentTurnRecord;

      turnRecord.speech_start = base;
      turnRecord.first_interim = base + 150 + i * 10;          // 160ms -> 250ms
      turnRecord.final_text = base + 3000 + i * 50;           // ~3050ms -> 3500ms
      turnRecord.answer_end = base + 4200 + i * 100;          // ~4300ms -> 5200ms
      turnRecord.next_question_spoken = base + 5400 + i * 80; // ~5480ms -> 6200ms

      sttTimingLogger.finalizeCurrentTurn();
    }

    const summary = sttTimingLogger.getSummaryMetrics();
    expect(summary.sampleCount).toBe(10);

    // Gap 1: speech_start -> first_interim (160 to 250)
    expect(summary.speech_to_first_interim.p50).toBeGreaterThanOrEqual(190);
    expect(summary.speech_to_first_interim.p50).toBeLessThanOrEqual(220);
    expect(summary.speech_to_first_interim.p95).toBeGreaterThan(summary.speech_to_first_interim.p50);

    // Gap 2: first_interim -> final_text
    expect(summary.interim_to_final_text.p50).toBeGreaterThanOrEqual(2800);
    expect(summary.interim_to_final_text.p95).toBeGreaterThanOrEqual(summary.interim_to_final_text.p50);

    // Gap 3: speech_start -> answer_end
    expect(summary.speech_to_answer_end.p50).toBeGreaterThanOrEqual(4500);
    expect(summary.speech_to_answer_end.p95).toBeGreaterThanOrEqual(summary.speech_to_answer_end.p50);

    // Gap 4: answer_end -> next_question_spoken
    expect(summary.answer_end_to_next_question.p50).toBeGreaterThanOrEqual(1000);
    expect(summary.answer_end_to_next_question.p95).toBeGreaterThanOrEqual(summary.answer_end_to_next_question.p50);
  });
});

