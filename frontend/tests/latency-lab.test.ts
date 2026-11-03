import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sttTimingLogger,
  LATENCY_BUDGETS,
  TurnTimingRecord,
} from '../src/services/speech/sttTimingLogger';
import { STTChainManager } from '../src/services/speech/sttChainManager';

describe('B7: Observability & Dev Latency Lab', () => {
  beforeEach(() => {
    sttTimingLogger.clearHistory();
    sttTimingLogger.setDevMode(false);
  });

  describe('1. Turn Timing Milestones & Sequence Recording', () => {
    it('records sequential turn milestones and computes gaps', () => {
      sttTimingLogger.startTurn(1, 'browser');

      // Mock performance.now timestamps by recording events
      sttTimingLogger.recordEvent('speech_start', 1);
      sttTimingLogger.recordEvent('first_interim', 1);
      sttTimingLogger.recordEvent('last_interim', 1);
      sttTimingLogger.recordEvent('final_text', 1);
      sttTimingLogger.recordEvent('answer_end_decision', 1);
      sttTimingLogger.recordEvent('answer_sent', 1);
      sttTimingLogger.recordEvent('question_received', 1);
      sttTimingLogger.recordEvent('tts_start', 1);
      sttTimingLogger.recordEvent('tts_end', 1);

      const record = sttTimingLogger.getCurrentTurnRecord();
      expect(record).not.toBeNull();
      expect(record?.turnIndex).toBe(1);
      expect(record?.provider).toBe('browser');
      expect(record?.timestamps.speech_start).toBeDefined();
      expect(record?.timestamps.first_interim).toBeDefined();
      expect(record?.timestamps.last_interim).toBeDefined();
      expect(record?.timestamps.final_text).toBeDefined();
      expect(record?.timestamps.answer_end_decision).toBeDefined();
      expect(record?.timestamps.answer_sent).toBeDefined();
      expect(record?.timestamps.question_received).toBeDefined();
      expect(record?.timestamps.tts_start).toBeDefined();
      expect(record?.timestamps.tts_end).toBeDefined();

      // Gaps exist
      expect(record?.gaps.speech_to_first_interim_ms).toBeGreaterThanOrEqual(0);
      expect(record?.gaps.interim_to_final_text_ms).toBeGreaterThanOrEqual(0);
      expect(record?.gaps.final_to_answer_end_ms).toBeGreaterThanOrEqual(0);
      expect(record?.gaps.question_received_to_tts_start_ms).toBeGreaterThanOrEqual(0);
      expect(record?.gaps.answer_end_to_tts_start_ms).toBeGreaterThanOrEqual(0);
    });

    it('emits live updates to registered onTimingUpdate listeners', () => {
      const listener = vi.fn();
      const unsub = sttTimingLogger.onTimingUpdate(listener);

      // Initial call on subscribe
      expect(listener).toHaveBeenCalledTimes(1);

      sttTimingLogger.startTurn(2, 'nemotron');
      expect(listener).toHaveBeenCalledTimes(2);

      sttTimingLogger.recordEvent('speech_start', 2);
      expect(listener).toHaveBeenCalledTimes(3);

      unsub();
      sttTimingLogger.recordEvent('first_interim', 2);
      // Listener should not be called after unsub
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('2. Latency Budget Auditing (Red Thresholds)', () => {
    it('flags first_interim_exceeded when speech to 1st interim > 700ms', () => {
      // Inject synthetic timestamps to test exact budget boundaries
      const logger = sttTimingLogger as any;
      logger.startTurn(3, 'browser');

      logger.currentTurnRecord.speech_start = 1000;
      logger.currentTurnRecord.first_interim = 1800; // 800ms > 700ms budget
      logger.currentTurnRecord.final_text = 2000;
      logger.currentTurnRecord.answer_end_decision = 3200; // 1200ms <= 2500ms
      logger.currentTurnRecord.question_received = 3500;
      logger.currentTurnRecord.tts_start = 3800; // 300ms <= 500ms

      const record = logger.getCurrentTurnRecord();
      expect(record?.budgetsExceeded.first_interim_exceeded).toBe(true);
      expect(record?.budgetsExceeded.answer_end_decision_exceeded).toBe(false);
      expect(record?.budgetsExceeded.tts_start_exceeded).toBe(false);
      expect(record?.budgetsExceeded.turnaround_exceeded).toBe(false);
    });

    it('flags answer_end_decision_exceeded when silence timeout > 2500ms', () => {
      const logger = sttTimingLogger as any;
      logger.startTurn(4, 'browser');

      logger.currentTurnRecord.speech_start = 1000;
      logger.currentTurnRecord.first_interim = 1350; // 350ms <= 700ms
      logger.currentTurnRecord.final_text = 2000;
      logger.currentTurnRecord.answer_end_decision = 4800; // 2800ms > 2500ms
      logger.currentTurnRecord.question_received = 5000;
      logger.currentTurnRecord.tts_start = 5300; // 300ms <= 500ms

      const record = logger.getCurrentTurnRecord();
      expect(record?.budgetsExceeded.first_interim_exceeded).toBe(false);
      expect(record?.budgetsExceeded.answer_end_decision_exceeded).toBe(true);
      expect(record?.budgetsExceeded.tts_start_exceeded).toBe(false);
    });

    it('flags tts_start_exceeded when question received -> TTS audio start > 500ms', () => {
      const logger = sttTimingLogger as any;
      logger.startTurn(5, 'browser');

      logger.currentTurnRecord.speech_start = 1000;
      logger.currentTurnRecord.first_interim = 1300;
      logger.currentTurnRecord.final_text = 2000;
      logger.currentTurnRecord.answer_end_decision = 3500;
      logger.currentTurnRecord.question_received = 4000;
      logger.currentTurnRecord.tts_start = 4750; // 750ms > 500ms

      const record = logger.getCurrentTurnRecord();
      expect(record?.budgetsExceeded.tts_start_exceeded).toBe(true);
    });

    it('flags turnaround_exceeded when answer end -> TTS start > 4000ms', () => {
      const logger = sttTimingLogger as any;
      logger.startTurn(6, 'browser');

      logger.currentTurnRecord.speech_start = 1000;
      logger.currentTurnRecord.first_interim = 1300;
      logger.currentTurnRecord.final_text = 2000;
      logger.currentTurnRecord.answer_end_decision = 3000;
      logger.currentTurnRecord.question_received = 6000;
      logger.currentTurnRecord.tts_start = 7500; // 4500ms turnaround > 4000ms

      const record = logger.getCurrentTurnRecord();
      expect(record?.budgetsExceeded.turnaround_exceeded).toBe(true);
    });
  });

  describe('3. Multi-Turn History & Percentiles Aggregation', () => {
    it('accurately computes p50 and p95 across recorded turn history', () => {
      const logger = sttTimingLogger as any;

      // Turn 1
      logger.startTurn(1, 'browser');
      logger.currentTurnRecord = {
        speech_start: 1000,
        first_interim: 1300, // 300ms
        final_text: 2000,
        answer_end: 3200, // 1200ms
        question_received: 3500,
        tts_start: 3750, // 250ms
        tts_end: 5000,
      };
      logger.finalizeCurrentTurn();

      // Turn 2
      logger.startTurn(2, 'browser');
      logger.currentTurnRecord = {
        speech_start: 6000,
        first_interim: 6400, // 400ms
        final_text: 8000,
        answer_end: 9500, // 1500ms
        question_received: 9800,
        tts_start: 10100, // 300ms
        tts_end: 12000,
      };
      logger.finalizeCurrentTurn();

      // Turn 3
      logger.startTurn(3, 'browser');
      logger.currentTurnRecord = {
        speech_start: 13000,
        first_interim: 13500, // 500ms
        final_text: 15000,
        answer_end: 16800, // 1800ms
        question_received: 17100,
        tts_start: 17500, // 400ms
        tts_end: 19000,
      };
      logger.finalizeCurrentTurn();

      expect(logger.getHistory().length).toBe(3);

      const metrics = logger.getSummaryMetrics();
      expect(metrics.sampleCount).toBe(3);
      // speech_to_first_interim values: [300, 400, 500] -> median is 400
      expect(metrics.speech_to_first_interim.p50).toBe(400);
      expect(metrics.speech_to_first_interim.p95).toBeGreaterThanOrEqual(480);

      // question_to_tts_start values: [250, 300, 400] -> median is 300
      expect(metrics.question_to_tts_start.p50).toBe(300);
    });
  });

  describe('4. STT Provider Live Toggling in Chain Manager', () => {
    it('switches between browser and nemotron live via switchToProvider', () => {
      const manager = new STTChainManager({
        chain: ['browser', 'nemotron', 'typed'],
      });

      expect(manager.activeProvider).toBe('browser');

      manager.switchToProvider('nemotron');
      expect(manager.activeProvider).toBe('nemotron');
      expect(manager.getChainStatus().activeProvider).toBe('nemotron');

      manager.switchToProvider('browser');
      expect(manager.activeProvider).toBe('browser');
      expect(manager.getChainStatus().activeProvider).toBe('browser');
    });
  });
});

