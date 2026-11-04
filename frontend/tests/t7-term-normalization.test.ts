/**
 * T7: Transcript Quality Layer & Term Normalization Unit Tests (§T7).
 *
 * Verifies:
 * 1. Technical term normalization (casing fixes and known multi-word acoustic replacements).
 * 2. Guard against false rewrites of ordinary English words.
 * 3. Dynamic role and resume glossary expansion.
 * 4. Dual storage invariant (raw transcript preserved alongside clean transcript).
 * 5. Low-confidence detection and "I didn't catch that" flow conditions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeTranscript,
  computeTurnConfidence,
  computeLevenshteinDistance,
  computeSimilarityScore,
  PROTECTED_COMMON_WORDS,
} from '../src/services/speech/termNormalizer';

describe('T7: Technical Term Normalization & Disambiguation (§T7)', () => {
  describe('1. Technical Term Casing & Multi-Word Normalization', () => {
    it('fixes casing for known technical frameworks and databases', () => {
      const input = 'i built the microservice with spring boot and stored records in postgresql and redis';
      const result = normalizeTranscript(input);

      expect(result.cleanText).toContain('Spring Boot');
      expect(result.cleanText).toContain('PostgreSQL');
      expect(result.cleanText).toContain('Redis');
      expect(result.appliedReplacements.length).toBeGreaterThanOrEqual(3);
    });

    it('corrects known acoustic/phonetic ASR errors from real STT bake-off', () => {
      const input = 'we streamed events through caf kissing connector into post rescue l with kabir nets orchestration';
      const result = normalizeTranscript(input);

      expect(result.cleanText).toContain('Kafka sink connector');
      expect(result.cleanText).toContain('PostgreSQL');
      expect(result.cleanText).toContain('Kubernetes');
      expect(result.cleanText).not.toContain('caf kissing');
      expect(result.cleanText).not.toContain('post rescue l');
      expect(result.cleanText).not.toContain('kabir nets');
    });

    it('corrects auth and runtime misrecognitions (OAuth2, PKCE, Goroutines, HikariCP)', () => {
      const input = 'we configured oh off to with pk see in frontend and used gorotines with hakeri cp in backend';
      const result = normalizeTranscript(input);

      expect(result.cleanText).toContain('OAuth2');
      expect(result.cleanText).toContain('PKCE');
      expect(result.cleanText).toContain('Goroutines');
      expect(result.cleanText).toContain('HikariCP');
    });

    it('handles query and database tools: EXPLAIN ANALYZE and GraphQL', () => {
      const input = 'we executed explain analyze to optimize the query and replaced rest with graph que el';
      const result = normalizeTranscript(input);

      expect(result.cleanText).toContain('EXPLAIN ANALYZE');
      expect(result.cleanText).toContain('GraphQL');
      expect(result.cleanText).toContain('REST');
    });
  });

  describe('2. Strict Guard Against False Rewrites of Ordinary English Words', () => {
    it('never rewrites ordinary common words that resemble technical acronyms or concepts', () => {
      const ordinarySentence = 'the team will order a new table and write a clean test to lock the state and share the score';
      const result = normalizeTranscript(ordinarySentence);

      // Verify none of the ordinary words were corrupted
      expect(result.cleanText).toBe(ordinarySentence);
      expect(result.appliedReplacements).toHaveLength(0);
    });

    it('all words in PROTECTED_COMMON_WORDS are preserved without modification', () => {
      for (const word of PROTECTED_COMMON_WORDS) {
        const sentence = `please make sure you ${word} before proceeding`;
        const res = normalizeTranscript(sentence);
        expect(res.cleanText).toBe(sentence);
      }
    });

    it('short unrecognized words (< 6 characters) are never fuzzy matched', () => {
      const shortTokens = 'we run app on dev pod box net log map';
      const res = normalizeTranscript(shortTokens);
      expect(res.cleanText).toBe(shortTokens);
    });
  });

  describe('3. Dynamic Resume and Role Glossary Injection', () => {
    it('normalizes custom domain terms provided from job role or resume', () => {
      const customGlossary = ['Snowflake', 'ArgoCD', 'PyTorch', 'Temporal.io'];
      const candidateAnswer = 'we orchestrated workflows in temporal.io and trained models in pytorch before dumping to snowflake';

      const result = normalizeTranscript(candidateAnswer, customGlossary);
      expect(result.cleanText).toContain('Temporal.io');
      expect(result.cleanText).toContain('PyTorch');
      expect(result.cleanText).toContain('Snowflake');
    });
  });

  describe('4. Dual Storage Invariant: Raw vs. Clean Transcript (§T7)', () => {
    it('retains raw transcript completely intact while providing cleanText for live display', () => {
      const raw = 'we migrated springboot to k8s using post rescue l';
      const result = normalizeTranscript(raw);

      // Raw text must not be mutated in the return structure
      expect(raw).toBe('we migrated springboot to k8s using post rescue l');
      expect(result.cleanText).toBe('we migrated Spring Boot to Kubernetes using PostgreSQL');
      expect(result.appliedReplacements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ replacement: 'PostgreSQL' }),
          expect.objectContaining({ replacement: 'Spring Boot' }),
          expect.objectContaining({ replacement: 'Kubernetes' }),
        ])
      );
    });
  });

  describe('5. Per-Turn Confidence & Low-Confidence Detection (§T7)', () => {
    it('computes high confidence for articulate answers with healthy word count', () => {
      const answer = 'In our architecture we use Kafka for asynchronous event ingestion and PostgreSQL for transactional persistence.';
      const res = computeTurnConfidence(answer, 0.94, 8.5);

      expect(res.confidence).toBe(0.94);
      expect(res.isLowConfidence).toBe(false);
      expect(res.flagReason).toBeUndefined();
    });

    it('flags low confidence when speech detected for > 2s but fewer than 3 words recognized ("I didn\'t catch that" condition)', () => {
      // Candidate spoke for 2.8 seconds but only 2 mumbled words came through
      const sparseAnswer = 'uh yeah';
      const res = computeTurnConfidence(sparseAnswer, 0.70, 2.8);

      expect(res.isLowConfidence).toBe(true);
      expect(res.confidence).toBeLessThanOrEqual(0.35);
      expect(res.flagReason).toContain('Speech detected for 2.8s but only 2 words recognized');
    });

    it('flags low confidence when recognizer reports low acoustic confidence (< 0.65)', () => {
      const garbledAnswer = 'we maybe did something with some kind of database';
      const res = computeTurnConfidence(garbledAnswer, 0.48, 4.0);

      expect(res.isLowConfidence).toBe(true);
      expect(res.confidence).toBe(0.48);
      expect(res.flagReason).toContain('Low speech recognition confidence score (< 0.65)');
    });
  });

  describe('6. Distance and Similarity Math Correctness', () => {
    it('computes exact Levenshtein distance correctly', () => {
      expect(computeLevenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(computeLevenshteinDistance('kafka', 'kafka')).toBe(0);
      expect(computeLevenshteinDistance('k8s', 'kubernetes')).toBe(8);
    });

    it('computes similarity ratio in 0..1 interval', () => {
      expect(computeSimilarityScore('postgresql', 'postgresql')).toBe(1.0);
      expect(computeSimilarityScore('postgresql', 'postgresol')).toBeGreaterThan(0.85);
      expect(computeSimilarityScore('cat', 'dog')).toBeLessThan(0.4);
    });
  });
});
