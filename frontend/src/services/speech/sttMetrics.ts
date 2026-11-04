/**
 * Speech Recognition Metrics & Alignment Engine (§T3)
 *
 * Implements:
 * 1. Word Error Rate (WER) via Levenshtein DP distance on normalized word tokens.
 * 2. Word Capture Ratio: (Matched Words / Reference Words) * 100%.
 * 3. Technical Term Recall & Recognition Accuracy.
 * 4. Token-by-token alignment diff for side-by-side inspection.
 */

export interface WERMetrics {
  wer: number;               // 0.0 to 1.0+ (percentage as fraction, e.g. 0.08 = 8%)
  werPercentage: string;     // e.g. "8.2%"
  wordCaptureRatio: number;  // 0.0 to 100.0 (percentage, e.g. 98.5)
  substitutions: number;
  deletions: number;
  insertions: number;
  referenceWordCount: number;
  hypothesisWordCount: number;
}

export interface DiffToken {
  type: 'match' | 'substitution' | 'deletion' | 'insertion';
  refWord?: string;
  hypWord?: string;
}

export interface TechTermMetrics {
  totalTerms: number;
  matchedCount: number;
  accuracy: number;          // 0.0 to 100.0
  matchedTerms: string[];
  missedTerms: string[];
}

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Computes standard Word Error Rate (WER) using dynamic programming Levenshtein distance on words.
 */
export function computeWER(reference: string, hypothesis: string): WERMetrics {
  const refTokens = normalizeWords(reference);
  const hypTokens = normalizeWords(hypothesis);

  const n = refTokens.length;
  const m = hypTokens.length;

  if (n === 0) {
    return {
      wer: m > 0 ? 1.0 : 0.0,
      werPercentage: m > 0 ? '100.0%' : '0.0%',
      wordCaptureRatio: 100.0,
      substitutions: 0,
      deletions: 0,
      insertions: m,
      referenceWordCount: 0,
      hypothesisWordCount: m,
    };
  }

  // dp[i][j] stores Levenshtein edit distance between refTokens[0..i-1] and hypTokens[0..j-1]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (refTokens[i - 1] === hypTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        const substitution = dp[i - 1][j - 1] + 1;
        const deletion = dp[i - 1][j] + 1;
        const insertion = dp[i][j - 1] + 1;
        dp[i][j] = Math.min(substitution, deletion, insertion);
      }
    }
  }

  // Backtrack to count substitutions, deletions, insertions
  let i = n;
  let j = m;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refTokens[i - 1] === hypTokens[j - 1]) {
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      substitutions++;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      deletions++;
      i--;
    } else {
      insertions++;
      j--;
    }
  }

  const edits = substitutions + deletions + insertions;
  const wer = edits / n;
  const matchedWords = Math.max(0, n - substitutions - deletions);
  const wordCaptureRatio = Math.min(100, Math.max(0, (matchedWords / n) * 100));

  return {
    wer,
    werPercentage: `${(wer * 100).toFixed(1)}%`,
    wordCaptureRatio: parseFloat(wordCaptureRatio.toFixed(1)),
    substitutions,
    deletions,
    insertions,
    referenceWordCount: n,
    hypothesisWordCount: m,
  };
}

/**
 * Computes word-level diff tokens for visual side-by-side comparison.
 */
export function computeWordDiff(reference: string, hypothesis: string): DiffToken[] {
  const refTokens = normalizeWords(reference);
  const hypTokens = normalizeWords(hypothesis);

  const n = refTokens.length;
  const m = hypTokens.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (refTokens[i - 1] === hypTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = n;
  let j = m;
  const diffs: DiffToken[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refTokens[i - 1] === hypTokens[j - 1]) {
      diffs.unshift({ type: 'match', refWord: refTokens[i - 1], hypWord: hypTokens[j - 1] });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      diffs.unshift({ type: 'substitution', refWord: refTokens[i - 1], hypWord: hypTokens[j - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      diffs.unshift({ type: 'deletion', refWord: refTokens[i - 1] });
      i--;
    } else {
      diffs.unshift({ type: 'insertion', hypWord: hypTokens[j - 1] });
      j--;
    }
  }

  return diffs;
}

/**
 * Computes technical terms recall across candidate transcript.
 */
export function computeTechTermAccuracy(terms: string[], hypothesis: string): TechTermMetrics {
  if (terms.length === 0) {
    return {
      totalTerms: 0,
      matchedCount: 0,
      accuracy: 100.0,
      matchedTerms: [],
      missedTerms: [],
    };
  }

  const normalizedHyp = ` ${normalizeWords(hypothesis).join(' ')} `;
  const matchedTerms: string[] = [];
  const missedTerms: string[] = [];

  for (const term of terms) {
    const termNorm = normalizeWords(term).join(' ');
    if (normalizedHyp.includes(` ${termNorm} `)) {
      matchedTerms.push(term);
    } else {
      missedTerms.push(term);
    }
  }

  const accuracy = (matchedTerms.length / terms.length) * 100;
  return {
    totalTerms: terms.length,
    matchedCount: matchedTerms.length,
    accuracy: parseFloat(accuracy.toFixed(1)),
    matchedTerms,
    missedTerms,
  };
}

