/**
 * STT & Voice Turn Timing Logger & Budget Auditor (§B4, §B7)
 *
 * Tracks critical voice turnaround milestones in sequence:
 * 1. speech_start: Candidate initiates speech (VAD or STT audio start)
 * 2. first_interim: First partial transcript received from STT (Budget: <= 700ms, p50 <= 400ms)
 * 3. last_interim: Most recent interim transcript before recognizer finalizes
 * 4. final_text: Final transcript chunk finalized for the turn
 * 5. answer_end_decision: Adaptive silence timeout triggers completion (Budget: <= 2500ms)
 * 6. answer_sent: Candidate answer payload dispatched to backend over WebSocket / API
 * 7. question_received: Next question payload generated and received on client
 * 8. tts_start: Interviewer speech synthesis audio playback begins (Budget: <= 500ms)
 * 9. tts_end: Interviewer finishes speaking question (mic re-opens)
 *
 * Budget Auditor (§B7):
 * Highlights in red when any stage exceeds its strict latency budget:
 * - first_interim > 700 ms
 * - answer_end_decision > 2500 ms (silence detection)
 * - question_to_tts_start > 500 ms
 * - total_turnaround (answer_end_decision -> tts_start) > 4000 ms
 */

export type STTTimingEventName =
  | 'speech_start'
  | 'first_interim'
  | 'last_interim'
  | 'final_text'
  | 'answer_end_decision'
  | 'answer_end'
  | 'answer_sent'
  | 'question_received'
  | 'tts_start'
  | 'tts_end'
  | 'next_question_spoken';

export const LATENCY_BUDGETS = {
  first_interim_max_ms: 700, // Budget <= 700 ms (p50 <= 400ms, p95 <= 700ms)
  answer_end_decision_max_ms: 2500, // Budget <= 2500 ms (typical 1.2s - 2.0s)
  question_to_tts_start_max_ms: 500, // Budget <= 500 ms
  total_turnaround_max_ms: 4000, // Budget <= 4000 ms (p50 <= 2500ms, p95 <= 4000ms)
};

export interface TurnTimingGaps {
  speech_to_first_interim_ms?: number;
  first_to_last_interim_ms?: number;
  interim_to_final_text_ms?: number;
  final_to_answer_end_ms?: number;
  speech_to_answer_end_ms?: number;
  answer_end_to_answer_sent_ms?: number;
  answer_sent_to_question_received_ms?: number;
  question_received_to_tts_start_ms?: number;
  answer_end_to_next_question_ms?: number;
  answer_end_to_tts_start_ms?: number; // Total turnaround time
  tts_duration_ms?: number;
}

export interface TurnBudgetStatus {
  first_interim_exceeded: boolean;
  answer_end_decision_exceeded: boolean;
  tts_start_exceeded: boolean;
  turnaround_exceeded: boolean;
}

export interface TurnTimingRecord {
  turnIndex: number;
  provider?: string;
  timestamps: Partial<Record<STTTimingEventName, number>>;
  gaps: TurnTimingGaps;
  budgetsExceeded: TurnBudgetStatus;
}

export interface PercentileSummary {
  sampleCount: number;
  speech_to_first_interim: { p50: number; p95: number; mean: number };
  interim_to_final_text: { p50: number; p95: number; mean: number };
  speech_to_answer_end: { p50: number; p95: number; mean: number };
  answer_end_to_next_question: { p50: number; p95: number; mean: number };
  question_to_tts_start: { p50: number; p95: number; mean: number };
  total_turnaround: { p50: number; p95: number; mean: number };
}

export type TimingUpdateListener = (
  history: TurnTimingRecord[],
  currentTurn: TurnTimingRecord | null
) => void;

class STTTimingLogger {
  private currentTurnIndex: number = 0;
  private currentProvider: string = 'browser';
  private currentTurnRecord: Partial<Record<STTTimingEventName, number>> = {};
  private history: TurnTimingRecord[] = [];
  private isDev: boolean = Boolean(import.meta.env?.DEV);
  private listeners: Set<TimingUpdateListener> = new Set();
  private isFinalized: boolean = false;

  public setDevMode(enabled: boolean): void {
    this.isDev = enabled;
  }

  public setProvider(provider: string): void {
    this.currentProvider = provider;
  }

  public onTimingUpdate(listener: TimingUpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.getHistory(), this.getCurrentTurnRecord());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const hist = this.getHistory();
    const curr = this.getCurrentTurnRecord();
    this.listeners.forEach((listener) => {
      try {
        listener(hist, curr);
      } catch (err) {
        console.error('[STTTimingLogger] Error in listener callback:', err);
      }
    });
  }

  public startTurn(turnIndex: number, provider?: string): void {
    if (!this.isFinalized && Object.keys(this.currentTurnRecord).length > 0) {
      this.finalizeCurrentTurn();
    }
    this.currentTurnIndex = turnIndex;
    if (provider) this.currentProvider = provider;
    this.currentTurnRecord = {};
    this.isFinalized = false;
    this.notifyListeners();
  }

  public recordEvent(eventName: STTTimingEventName, turnIndex?: number): void {
    const timestamp = performance.now();
    const activeTurn = turnIndex ?? this.currentTurnIndex;

    // Reset if a new turn index is passed
    if (turnIndex !== undefined && turnIndex !== this.currentTurnIndex) {
      if (!this.isFinalized && Object.keys(this.currentTurnRecord).length > 0) {
        this.finalizeCurrentTurn();
      }
      this.currentTurnIndex = turnIndex;
      this.currentTurnRecord = {};
      this.isFinalized = false;
    }

    // Map aliases
    if (eventName === 'answer_end' || eventName === 'answer_end_decision') {
      this.currentTurnRecord.answer_end = timestamp;
      this.currentTurnRecord.answer_end_decision = timestamp;
    } else if (eventName === 'next_question_spoken') {
      this.currentTurnRecord.next_question_spoken = timestamp;
      if (!this.currentTurnRecord.question_received) {
        this.currentTurnRecord.question_received = timestamp;
      }
    } else if (eventName === 'first_interim') {
      if (!this.currentTurnRecord.first_interim) {
        this.currentTurnRecord.first_interim = timestamp;
      }
      this.currentTurnRecord.last_interim = timestamp;
    } else {
      this.currentTurnRecord[eventName] = timestamp;
    }

    if (this.isDev) {
      console.debug(`[STT Timing] [Turn ${activeTurn}] ${eventName} @ ${timestamp.toFixed(1)}ms`);
    }

    this.notifyListeners();

    // Finalize when tts_end or next_question_spoken occurs
    if (eventName === 'tts_end' || eventName === 'next_question_spoken') {
      this.finalizeCurrentTurn();
    }
  }

  private computeGapsAndBudgets(ts: Partial<Record<STTTimingEventName, number>>): {
    gaps: TurnTimingGaps;
    budgetsExceeded: TurnBudgetStatus;
  } {
    const gaps: TurnTimingGaps = {};
    const answerEnd = ts.answer_end ?? ts.answer_end_decision;

    if (ts.speech_start && ts.first_interim) {
      gaps.speech_to_first_interim_ms = Math.max(0, ts.first_interim - ts.speech_start);
    }
    if (ts.first_interim && ts.last_interim && ts.last_interim > ts.first_interim) {
      gaps.first_to_last_interim_ms = Math.max(0, ts.last_interim - ts.first_interim);
    }
    if (ts.first_interim && ts.final_text) {
      gaps.interim_to_final_text_ms = Math.max(0, ts.final_text - ts.first_interim);
    }
    if (ts.final_text && answerEnd) {
      gaps.final_to_answer_end_ms = Math.max(0, answerEnd - ts.final_text);
    }
    if (ts.speech_start && answerEnd) {
      gaps.speech_to_answer_end_ms = Math.max(0, answerEnd - ts.speech_start);
    }
    if (answerEnd && ts.answer_sent) {
      gaps.answer_end_to_answer_sent_ms = Math.max(0, ts.answer_sent - answerEnd);
    }
    if (ts.answer_sent && ts.question_received) {
      gaps.answer_sent_to_question_received_ms = Math.max(0, ts.question_received - ts.answer_sent);
    }
    if (ts.question_received && ts.tts_start) {
      gaps.question_received_to_tts_start_ms = Math.max(0, ts.tts_start - ts.question_received);
    }
    if (answerEnd && ts.next_question_spoken) {
      gaps.answer_end_to_next_question_ms = Math.max(0, ts.next_question_spoken - answerEnd);
    }
    if (answerEnd && ts.tts_start) {
      gaps.answer_end_to_tts_start_ms = Math.max(0, ts.tts_start - answerEnd);
    } else if (answerEnd && ts.next_question_spoken) {
      gaps.answer_end_to_tts_start_ms = Math.max(0, ts.next_question_spoken - answerEnd);
    }
    if (ts.tts_start && ts.tts_end) {
      gaps.tts_duration_ms = Math.max(0, ts.tts_end - ts.tts_start);
    }

    const budgetsExceeded: TurnBudgetStatus = {
      first_interim_exceeded:
        typeof gaps.speech_to_first_interim_ms === 'number' &&
        gaps.speech_to_first_interim_ms > LATENCY_BUDGETS.first_interim_max_ms,
      answer_end_decision_exceeded:
        typeof gaps.final_to_answer_end_ms === 'number' &&
        gaps.final_to_answer_end_ms > LATENCY_BUDGETS.answer_end_decision_max_ms,
      tts_start_exceeded:
        typeof gaps.question_received_to_tts_start_ms === 'number' &&
        gaps.question_received_to_tts_start_ms > LATENCY_BUDGETS.question_to_tts_start_max_ms,
      turnaround_exceeded:
        typeof gaps.answer_end_to_tts_start_ms === 'number' &&
        gaps.answer_end_to_tts_start_ms > LATENCY_BUDGETS.total_turnaround_max_ms,
    };

    return { gaps, budgetsExceeded };
  }

  public getCurrentTurnRecord(): TurnTimingRecord | null {
    if (Object.keys(this.currentTurnRecord).length === 0) return null;
    const { gaps, budgetsExceeded } = this.computeGapsAndBudgets(this.currentTurnRecord);
    return {
      turnIndex: this.currentTurnIndex,
      provider: this.currentProvider,
      timestamps: { ...this.currentTurnRecord },
      gaps,
      budgetsExceeded,
    };
  }

  public finalizeCurrentTurn(): void {
    if (this.isFinalized || Object.keys(this.currentTurnRecord).length === 0) return;
    this.isFinalized = true;

    const ts = { ...this.currentTurnRecord };
    const { gaps, budgetsExceeded } = this.computeGapsAndBudgets(ts);

    const record: TurnTimingRecord = {
      turnIndex: this.currentTurnIndex,
      provider: this.currentProvider,
      timestamps: ts,
      gaps,
      budgetsExceeded,
    };

    // Replace if same turn already finalized in history, otherwise push
    const existingIdx = this.history.findIndex((h) => h.turnIndex === this.currentTurnIndex);
    if (existingIdx !== -1) {
      this.history[existingIdx] = record;
    } else {
      this.history.push(record);
    }

    if (this.isDev) {
      console.table([
        {
          Turn: this.currentTurnIndex,
          Provider: this.currentProvider,
          'Speech -> 1st Interim': gaps.speech_to_first_interim_ms ? `${gaps.speech_to_first_interim_ms.toFixed(1)} ms` : '—',
          'Interim -> Final': gaps.interim_to_final_text_ms ? `${gaps.interim_to_final_text_ms.toFixed(1)} ms` : '—',
          'Silence -> Answer End': gaps.final_to_answer_end_ms ? `${gaps.final_to_answer_end_ms.toFixed(1)} ms` : '—',
          'Answer End -> TTS Start': gaps.answer_end_to_tts_start_ms ? `${gaps.answer_end_to_tts_start_ms.toFixed(1)} ms` : '—',
          'Budget Violations': Object.entries(budgetsExceeded).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None (Pass)',
        },
      ]);
    }

    this.notifyListeners();
  }

  public getHistory(): TurnTimingRecord[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
    this.currentTurnRecord = {};
    this.isFinalized = false;
    this.notifyListeners();
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  public getSummaryMetrics(): PercentileSummary {
    const gap1 = this.history
      .map((h) => h.gaps.speech_to_first_interim_ms)
      .filter((v): v is number => typeof v === 'number');
    const gap2 = this.history
      .map((h) => h.gaps.interim_to_final_text_ms)
      .filter((v): v is number => typeof v === 'number');
    const gap3 = this.history
      .map((h) => h.gaps.speech_to_answer_end_ms)
      .filter((v): v is number => typeof v === 'number');
    const gap4 = this.history
      .map((h) => h.gaps.answer_end_to_next_question_ms)
      .filter((v): v is number => typeof v === 'number');
    const gap5 = this.history
      .map((h) => h.gaps.question_received_to_tts_start_ms)
      .filter((v): v is number => typeof v === 'number');
    const gap6 = this.history
      .map((h) => h.gaps.answer_end_to_tts_start_ms)
      .filter((v): v is number => typeof v === 'number');

    const getStats = (vals: number[]) => ({
      p50: Math.round(this.calculatePercentile(vals, 50)),
      p95: Math.round(this.calculatePercentile(vals, 95)),
      mean: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
    });

    return {
      sampleCount: this.history.length,
      speech_to_first_interim: getStats(gap1),
      interim_to_final_text: getStats(gap2),
      speech_to_answer_end: getStats(gap3),
      answer_end_to_next_question: getStats(gap4),
      question_to_tts_start: getStats(gap5),
      total_turnaround: getStats(gap6),
    };
  }
}

export const sttTimingLogger = new STTTimingLogger();
