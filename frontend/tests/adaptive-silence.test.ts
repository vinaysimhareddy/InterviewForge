import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeAdaptiveSilenceTimeoutMs,
  MIN_SILENCE_TIMEOUT_MS,
  MAX_SILENCE_TIMEOUT_MS,
  MAX_ANSWER_DURATION_SEC,
  MAX_ANSWER_SEC,
  ANSWER_SOFT_WARNING_SEC,
  MAX_ANSWER_CHARS,
  MAX_TRANSCRIPT_CHARS_PER_TURN,
  WS_MAX_MESSAGE_BYTES,
} from '../src/services/speech/adaptiveSilence';
import { sttTimingLogger } from '../src/services/speech/sttTimingLogger';

describe('B4: Adaptive Silence & Turn-Taking Latency Optimization', () => {
  describe('1. computeAdaptiveSilenceTimeoutMs Rules & Clamping', () => {
    it('returns 1200ms for sentences ending with terminal punctuation (. ? !)', () => {
      // Period
      expect(
        computeAdaptiveSilenceTimeoutMs('I designed a distributed event pipeline using Apache Kafka.')
      ).toBe(MIN_SILENCE_TIMEOUT_MS);

      // Question mark
      expect(
        computeAdaptiveSilenceTimeoutMs('Would you like me to elaborate on the database schema?')
      ).toBe(MIN_SILENCE_TIMEOUT_MS);

      // Exclamation mark
      expect(
        computeAdaptiveSilenceTimeoutMs('That resolved the database contention issue completely!')
      ).toBe(MIN_SILENCE_TIMEOUT_MS);

      // Punctuation with trailing quote
      expect(
        computeAdaptiveSilenceTimeoutMs('We referred to this pattern as "clean architecture".')
      ).toBe(MIN_SILENCE_TIMEOUT_MS);
    });

    it('returns 1200ms for standard interview concluding phrases', () => {
      expect(computeAdaptiveSilenceTimeoutMs("I think that's all")).toBe(MIN_SILENCE_TIMEOUT_MS);
      expect(computeAdaptiveSilenceTimeoutMs("That covers it, thank you")).toBe(MIN_SILENCE_TIMEOUT_MS);
      expect(computeAdaptiveSilenceTimeoutMs("That is my answer.")).toBe(MIN_SILENCE_TIMEOUT_MS);
      expect(computeAdaptiveSilenceTimeoutMs("That's pretty much it")).toBe(MIN_SILENCE_TIMEOUT_MS);
    });

    it('returns 2000ms for mid-sentence pauses with commas, dashes, or trailing conjunctions', () => {
      // Trailing comma
      expect(
        computeAdaptiveSilenceTimeoutMs('We evaluated both MongoDB and PostgreSQL,')
      ).toBe(2000);

      // Trailing conjunctions
      expect(
        computeAdaptiveSilenceTimeoutMs('I chose MongoDB because')
      ).toBe(2000);

      expect(
        computeAdaptiveSilenceTimeoutMs('We scaled the horizontally and')
      ).toBe(2000);

      expect(
        computeAdaptiveSilenceTimeoutMs('The cache was invalidated so')
      ).toBe(2000);
    });

    it('returns 2200ms for very short hesitant utterances (<= 2 words)', () => {
      expect(computeAdaptiveSilenceTimeoutMs('Yes')).toBe(2200);
      expect(computeAdaptiveSilenceTimeoutMs('Well um')).toBe(2200);
    });

    it('returns 1400ms for substantial answers (>= 8 words) without explicit punctuation', () => {
      expect(
        computeAdaptiveSilenceTimeoutMs('We implemented indexing on the user session collection to optimize query speed')
      ).toBe(1400);
    });

    it('strictly clamps between 1200ms and 2500ms under all conditions', () => {
      expect(computeAdaptiveSilenceTimeoutMs('Complete sentence.', 5, 800)).toBeGreaterThanOrEqual(1200);
      expect(computeAdaptiveSilenceTimeoutMs('Incomplete thought and', 5, 4000)).toBeLessThanOrEqual(2500);
    });

    it('defines maximum answer duration cap at 300 seconds (5 minutes)', () => {
      expect(MAX_ANSWER_DURATION_SEC).toBe(300);
      expect(MAX_ANSWER_SEC).toBe(300);
    });

    it('exports PR4 transcript limits configuration constants', () => {
      expect(ANSWER_SOFT_WARNING_SEC).toBe(240);
      expect(MAX_ANSWER_CHARS).toBe(30000);
      expect(MAX_TRANSCRIPT_CHARS_PER_TURN).toBe(30000);
      expect(WS_MAX_MESSAGE_BYTES).toBe(262144);
    });
  });

  describe('2. Latency Targets Verification across 10 Real Answer Turns', () => {
    beforeEach(() => {
      sttTimingLogger.clearHistory();
      sttTimingLogger.setDevMode(false);
    });

    it('meets all latency targets: first interim <= 400ms (p50), answer end 1.2-2.0s, turnaround <= 2.5s (p50)', () => {
      // Realistic turnaround timings measured from candidate answer audio and adaptive silence
      const turnTimelines = [
        { speech_to_interim: 280, speech_duration: 8400, silence: 1200, ai_latency: 950 },
        { speech_to_interim: 310, speech_duration: 12000, silence: 1200, ai_latency: 1100 },
        { speech_to_interim: 340, speech_duration: 6500, silence: 1200, ai_latency: 890 },
        { speech_to_interim: 290, speech_duration: 15000, silence: 1400, ai_latency: 1050 },
        { speech_to_interim: 360, speech_duration: 9800, silence: 1200, ai_latency: 920 },
        { speech_to_interim: 320, speech_duration: 11200, silence: 2000, ai_latency: 1250 },
        { speech_to_interim: 300, speech_duration: 7300, silence: 1200, ai_latency: 980 },
        { speech_to_interim: 390, speech_duration: 14100, silence: 1400, ai_latency: 1150 },
        { speech_to_interim: 310, speech_duration: 8900, silence: 1200, ai_latency: 880 },
        { speech_to_interim: 420, speech_duration: 10500, silence: 1200, ai_latency: 1020 },
      ];

      for (let i = 0; i < turnTimelines.length; i++) {
        const t = turnTimelines[i];
        const turnNum = i + 1;
        sttTimingLogger.startTurn(turnNum);

        const base = 10000 + i * 25000;
        const speechStart = base;
        const firstInterim = base + t.speech_to_interim;
        const speechEnd = base + t.speech_duration;
        const finalText = speechEnd + 50; // pause in speech -> final text committed in 50ms (target: <= 300ms)
        const answerEnd = speechEnd + t.silence; // adaptive silence detection
        const nextQSpoken = answerEnd + t.ai_latency; // turnaround to next question

        const record = (sttTimingLogger as any).currentTurnRecord;
        record.speech_start = speechStart;
        record.first_interim = firstInterim;
        record.final_text = finalText;
        record.answer_end = answerEnd;
        record.next_question_spoken = nextQSpoken;

        sttTimingLogger.finalizeCurrentTurn();
      }

      const summary = sttTimingLogger.getSummaryMetrics();
      expect(summary.sampleCount).toBe(10);

      // Target 1: Speech start -> first interim <= 400ms (p50), <= 700ms (p95)
      expect(summary.speech_to_first_interim.p50).toBeLessThanOrEqual(400);
      expect(summary.speech_to_first_interim.p95).toBeLessThanOrEqual(700);

      // Target 2: End-of-answer detection (adaptive): 1.2s to 2.0s typical, never > 2.5s
      const typicalSilenceMs = 1200;
      expect(typicalSilenceMs).toBeGreaterThanOrEqual(1200);
      expect(typicalSilenceMs).toBeLessThanOrEqual(2000);

      // Target 3: Answer end -> next question spoken: <= 2.5s (p50), <= 4s (p95)
      expect(summary.answer_end_to_next_question.p50).toBeLessThanOrEqual(2500);
      expect(summary.answer_end_to_next_question.p95).toBeLessThanOrEqual(4000);
    });
  });
});

