/**
 * Adaptive Silence & Turn-Taking Timeout Engine (§B4)
 *
 * Dynamically computes silence detection thresholds based on:
 * 1. Terminal punctuation (. ? !) signaling a complete grammatical thought -> 1.2s (1200 ms).
 * 2. Concluding interview idioms ("that's all", "that's it", "thank you") -> 1.2s (1200 ms).
 * 3. Mid-sentence pauses (trailing conjunctions like "and", "because", "so") -> 2.0s (2000 ms).
 * 4. Short hesitant starts (<= 2 words) -> 2.2s (2200 ms).
 * 5. General utterances -> 1.5s (1500 ms).
 *
 * Target: Typical 1.2s to 2.0s, hard minimum 1.2s, hard cap 2.5s.
 * Maximum answer duration cap: 120 seconds.
 */

export const MIN_SILENCE_TIMEOUT_MS = 1200; // 1.2s
export const MAX_SILENCE_TIMEOUT_MS = 2500; // 2.5s
export const DEFAULT_SILENCE_TIMEOUT_MS = 1800; // 1.8s
export const MAX_ANSWER_DURATION_SEC = 120; // 120s per answer cap

const TERMINAL_PUNCTUATION_REGEX = /[.?!][)"'\s]*$/;
const MID_SENTENCE_TRAILING_REGEX = /[,;:\-\u2013\u2014]\s*$/;

const TRAILING_CONJUNCTIONS = new Set([
  'and',
  'or',
  'but',
  'because',
  'so',
  'if',
  'when',
  'while',
  'though',
  'although',
  'then',
  'like',
  'also',
  'as',
  'which',
  'that',
]);

const CLOSING_PHRASES = [
  "that's it",
  "that's all",
  'that is all',
  "that's my answer",
  'that is my answer',
  'that covers it',
  "that's pretty much it",
  'thank you',
  'thanks',
];

export function computeAdaptiveSilenceTimeoutMs(
  transcript: string,
  wordCount?: number,
  baseTimeoutMs: number = DEFAULT_SILENCE_TIMEOUT_MS
): number {
  const trimmed = transcript.trim();
  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const count = wordCount ?? words.length;

  // Very short response (1-2 words): allow extra time for candidate to formulate sentence
  if (count <= 2) {
    return Math.min(MAX_SILENCE_TIMEOUT_MS, 2200);
  }

  // Check for concluding interview phrases
  const hasClosingPhrase = CLOSING_PHRASES.some(
    (phrase) => lower.endsWith(phrase) || lower.endsWith(`${phrase}.`) || lower.endsWith(`${phrase}!`)
  );
  if (hasClosingPhrase && count >= 3) {
    return MIN_SILENCE_TIMEOUT_MS; // 1200ms
  }

  // Check for terminal sentence punctuation
  if (TERMINAL_PUNCTUATION_REGEX.test(trimmed) && count >= 4) {
    return MIN_SILENCE_TIMEOUT_MS; // 1200ms
  }

  // Check for trailing mid-sentence pauses (comma, semicolon, dash)
  if (MID_SENTENCE_TRAILING_REGEX.test(trimmed)) {
    return 2000; // 2.0s
  }

  // Check for trailing conjunction words
  const lastWord = words[words.length - 1]?.toLowerCase().replace(/[^a-z]/g, '');
  if (lastWord && TRAILING_CONJUNCTIONS.has(lastWord)) {
    return 2000; // 2.0s
  }

  // Substantial answer without explicit terminal punctuation
  if (count >= 8) {
    return 1400; // 1.4s
  }

  // Default within bounds
  return Math.min(MAX_SILENCE_TIMEOUT_MS, Math.max(MIN_SILENCE_TIMEOUT_MS, baseTimeoutMs));
}

/**
 * T2 Tuned Turn Silence Timeout (§T2):
 * - Shorter (1.5–2.0 s) if answer is already long/complete.
 * - Longer (2.5–3.5 s) if answer is short (< 10 words) or candidate just paused mid-thought.
 */
export function computeTurnSilenceTimeoutMs(
  transcript: string,
  wordCount?: number,
  baseTimeoutMs?: number
): number {
  const trimmed = transcript.trim();
  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const count = wordCount ?? words.length;

  // 1. Candidate paused mid-thought: trailing punctuation (comma, dash, ellipsis) -> 3000ms (2.5–3.5s)
  if (MID_SENTENCE_TRAILING_REGEX.test(trimmed)) {
    return 3000;
  }

  // 2. Candidate paused mid-thought: trailing conjunction (e.g. "and", "because", "so") -> 3000ms (2.5–3.5s)
  const lastWord = words[words.length - 1]?.toLowerCase().replace(/[^a-z]/g, '');
  if (lastWord && TRAILING_CONJUNCTIONS.has(lastWord)) {
    return 3000;
  }

  // 3. Answer is complete: concluding interview phrases -> 1500ms (1.5–2.0s)
  const hasClosingPhrase = CLOSING_PHRASES.some(
    (phrase) => lower.endsWith(phrase) || lower.endsWith(`${phrase}.`) || lower.endsWith(`${phrase}!`)
  );
  if (hasClosingPhrase && count >= 3) {
    return 1500;
  }

  // 4. Answer is complete: terminal sentence punctuation (. ? !) -> 1600ms (1.5–2.0s)
  if (TERMINAL_PUNCTUATION_REGEX.test(trimmed) && count >= 4) {
    return 1600;
  }

  // 5. Short incomplete answer (< 10 words): candidate is still formulating or speaking -> 2800ms-3200ms (2.5–3.5s)
  if (count < 10) {
    if (count <= 2) {
      return 3200; // 3.2s
    }
    return 2800; // 2.8s
  }

  // 6. Answer is already long (>= 15 words) -> 1800ms (1.5–2.0s)
  if (count >= 15) {
    return 1800;
  }

  // Default fallback clamped between 1.5s and 3.5s
  const base = baseTimeoutMs ?? 2000;
  return Math.min(3500, Math.max(1500, base));
}

