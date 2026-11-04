/**
 * Technical Term Normalization & Disambiguation (§T7).
 *
 * Requirements:
 * - Deterministic, conservative fuzzy matching against a technical glossary (role terms + resume tags).
 * - Fixes casing and spelling of known technical terms ("spring boot" -> "Spring Boot", "kafka" -> "Kafka", "k8s" -> "Kubernetes").
 * - Multi-word phonetic / acoustic substitution map for known STT failure patterns (e.g. "post rescue l" -> "PostgreSQL", "caf kissing connector" -> "Kafka sink connector").
 * - Strict length and stop-word guards: never rewrite ordinary English words ("state", "order", "table", "lock", "right", "write").
 * - Zero LLM hallucination: rule-based, deterministic, pure function.
 * - Computes per-turn STT confidence and flags low-confidence turns for review verification.
 */

// ==============================================================================
// 1. Canonical Technical Glossary
// ==============================================================================

export interface NormalizationResult {
  cleanText: string;
  appliedReplacements: Array<{
    original: string;
    replacement: string;
    reason: 'phonetic_alias' | 'casing_fix' | 'fuzzy_match';
  }>;
}

export interface TurnConfidenceResult {
  confidence: number;
  isLowConfidence: boolean;
  flagReason?: string;
}

/**
 * Canonical dictionary of software engineering terms and their exact canonical casing.
 */
export const CANONICAL_TECHNICAL_TERMS: Record<string, string> = {
  // Frameworks & Runtimes
  'spring boot': 'Spring Boot',
  'springboot': 'Spring Boot',
  'react': 'React',
  'reactjs': 'React',
  'vue': 'Vue',
  'vuejs': 'Vue',
  'angular': 'Angular',
  'nextjs': 'Next.js',
  'next.js': 'Next.js',
  'express': 'Express',
  'expressjs': 'Express',
  'fastapi': 'FastAPI',
  'flask': 'Flask',
  'django': 'Django',
  'nodejs': 'Node.js',
  'node.js': 'Node.js',
  'hikaricp': 'HikariCP',
  'guava': 'Guava',
  'vite': 'Vite',

  // Databases & Caching
  'postgresql': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'mongodb': 'MongoDB',
  'mysql': 'MySQL',
  'redis': 'Redis',
  'cassandra': 'Cassandra',
  'dynamodb': 'DynamoDB',
  'elasticsearch': 'Elasticsearch',
  'sqlite': 'SQLite',

  // Distributed Systems & Cloud
  'kubernetes': 'Kubernetes',
  'k8s': 'Kubernetes',
  'docker': 'Docker',
  'kafka': 'Kafka',
  'rabbitmq': 'RabbitMQ',
  'grpc': 'gRPC',
  'graphql': 'GraphQL',
  'terraform': 'Terraform',
  'datadog': 'Datadog',
  'prometheus': 'Prometheus',
  'grafana': 'Grafana',

  // Protocols, Standards & Security
  'rest': 'REST',
  'restful': 'RESTful',
  'oauth2': 'OAuth2',
  'oauth': 'OAuth',
  'pkce': 'PKCE',
  'jwt': 'JWT',
  'mtls': 'mTLS',
  'json': 'JSON',
  'sql': 'SQL',
  'nosql': 'NoSQL',
  'acid': 'ACID',
  'crdt': 'CRDT',
  'crdts': 'CRDTs',
  'http': 'HTTP',
  'https': 'HTTPS',
  'tcp': 'TCP',
  'udp': 'UDP',
  'websocket': 'WebSocket',
  'websockets': 'WebSockets',
  'cors': 'CORS',

  // Architectures & Patterns
  'microservices': 'microservices',
  'microservice': 'microservice',
  'goroutine': 'Goroutines',
  'goroutines': 'Goroutines',
  'idempotent': 'idempotent',
  'idempotency': 'idempotency',
  'explain analyze': 'EXPLAIN ANALYZE',
  'outbox pattern': 'outbox pattern',
  'strangler fig': 'Strangler Fig',
  'saga pattern': 'saga pattern',
  'two phase commit': 'two-phase commit',
  '2pc': '2PC',
  'circuit breaker': 'circuit breaker',
  'jvm': 'JVM',
  'ci cd': 'CI/CD',
  'ci/cd': 'CI/CD',
};

/**
 * Phonetic and acoustic error mappings observed from real speech recognition transcripts.
 * These handle specific multi-word acoustic misrecognitions produced by ASR systems.
 */
export const PHONETIC_ASR_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string; reason: 'phonetic_alias' }> = [
  // Database & Cache acoustic misrecognitions
  { pattern: /\bpost\s+rescue\s+l\b/gi, replacement: 'PostgreSQL', reason: 'phonetic_alias' },
  { pattern: /\bpost\s+gres\b/gi, replacement: 'PostgreSQL', reason: 'phonetic_alias' },
  { pattern: /\bpostgre\s+sql\b/gi, replacement: 'PostgreSQL', reason: 'phonetic_alias' },
  { pattern: /\bhakeri\s+cp\b/gi, replacement: 'HikariCP', reason: 'phonetic_alias' },
  { pattern: /\bhikari\s+cp\b/gi, replacement: 'HikariCP', reason: 'phonetic_alias' },
  { pattern: /\bmongo\s+db\b/gi, replacement: 'MongoDB', reason: 'phonetic_alias' },

  // Distributed Messaging misrecognitions
  { pattern: /\bcaf\s+kissing\s+connector\b/gi, replacement: 'Kafka sink connector', reason: 'phonetic_alias' },
  { pattern: /\bcaf\s+kissing\b/gi, replacement: 'Kafka sink', reason: 'phonetic_alias' },
  { pattern: /\bkafka\s+sync\s+connector\b/gi, replacement: 'Kafka sink connector', reason: 'phonetic_alias' },
  { pattern: /\bkafka\s+sync\b/gi, replacement: 'Kafka sink', reason: 'phonetic_alias' },

  // Auth & Security misrecognitions
  { pattern: /\boh\s+off\s+to\b/gi, replacement: 'OAuth2', reason: 'phonetic_alias' },
  { pattern: /\bo\s+auth\s+2\b/gi, replacement: 'OAuth2', reason: 'phonetic_alias' },
  { pattern: /\boauth\s+2\b/gi, replacement: 'OAuth2', reason: 'phonetic_alias' },
  { pattern: /\bpk\s+see\b/gi, replacement: 'PKCE', reason: 'phonetic_alias' },
  { pattern: /\bp\s+k\s+c\s+e\b/gi, replacement: 'PKCE', reason: 'phonetic_alias' },

  // Infrastructure misrecognitions
  { pattern: /\bkabir\s+nets\b/gi, replacement: 'Kubernetes', reason: 'phonetic_alias' },
  { pattern: /\bkuber\s+netes\b/gi, replacement: 'Kubernetes', reason: 'phonetic_alias' },
  { pattern: /\bgraph\s+que\s+el\b/gi, replacement: 'GraphQL', reason: 'phonetic_alias' },

  // Language runtime & format misrecognitions
  { pattern: /\bgorotines\b/gi, replacement: 'Goroutines', reason: 'phonetic_alias' },
  { pattern: /\bj\s+eso\s+and\b/gi, replacement: 'JSON', reason: 'phonetic_alias' },
  { pattern: /\bm2n\b/gi, replacement: 'M:N', reason: 'phonetic_alias' },
];

/**
 * Common English words that MUST NEVER be rewritten by fuzzy Levenshtein matching.
 */
export const PROTECTED_COMMON_WORDS: Set<string> = new Set([
  'and', 'that', 'this', 'with', 'from', 'have', 'here', 'there', 'were', 'will',
  'would', 'could', 'should', 'about', 'after', 'before', 'between', 'during',
  'under', 'above', 'while', 'where', 'which', 'state', 'table', 'query', 'order',
  'right', 'write', 'read', 'lock', 'test', 'user', 'role', 'point', 'class',
  'model', 'group', 'system', 'service', 'worker', 'stream', 'client', 'server',
  'level', 'value', 'index', 'check', 'start', 'first', 'share', 'scale', 'score',
  'speed', 'stack', 'stage', 'store', 'total', 'trace', 'track', 'treat', 'trust',
  'clean', 'clear', 'close', 'count', 'cover', 'crash', 'daily', 'delay', 'depth',
  'drive', 'early', 'entry', 'event', 'exact', 'extra', 'field', 'final', 'floor',
  'focus', 'force', 'front', 'glass', 'grade', 'grant', 'graph', 'great', 'green',
]);

// ==============================================================================
// 2. Pure Levenshtein Distance & Similarity Calculation
// ==============================================================================

export function computeLevenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[an][bn];
}

export function computeSimilarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = computeLevenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1.0 - dist / maxLen;
}

// ==============================================================================
// 3. Main Normalizer Engine
// ==============================================================================

/**
 * Normalizes speech-to-text transcripts with conservative technical term matching.
 *
 * @param rawText Unnormalized speech recognition transcript.
 * @param customTerms Additional terms from current job role and candidate resume.
 * @returns Clean normalized text and audit log of applied replacements.
 */
export function normalizeTranscript(
  rawText: string,
  customTerms: string[] = []
): NormalizationResult {
  if (!rawText || !rawText.trim()) {
    return { cleanText: '', appliedReplacements: [] };
  }

  let text = rawText;
  const replacements: NormalizationResult['appliedReplacements'] = [];

  // Phase 1: Apply known phonetic / acoustic multi-word misrecognition replacements
  for (const rule of PHONETIC_ASR_REPLACEMENTS) {
    const matches = text.match(rule.pattern);
    if (matches) {
      for (const m of matches) {
        replacements.push({
          original: m,
          replacement: rule.replacement,
          reason: rule.reason,
        });
      }
      text = text.replace(rule.pattern, rule.replacement);
    }
  }

  // Phase 2: Build combined canonical dictionary including custom role & resume terms
  const termsMap: Map<string, string> = new Map();
  for (const [key, canonical] of Object.entries(CANONICAL_TECHNICAL_TERMS)) {
    termsMap.set(key.toLowerCase(), canonical);
  }

  for (const term of customTerms) {
    const cleanTerm = term.trim();
    if (cleanTerm.length >= 2) {
      termsMap.set(cleanTerm.toLowerCase(), cleanTerm);
    }
  }

  // Phase 3: Exact phrase replacement for multi-word technical terms
  for (const [lowerKey, canonical] of termsMap.entries()) {
    if (lowerKey.includes(' ') || lowerKey.includes('/') || lowerKey.includes('-')) {
      const escaped = lowerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const phraseRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
      const matches = text.match(phraseRegex);
      if (matches) {
        for (const m of matches) {
          if (m !== canonical) {
            replacements.push({
              original: m,
              replacement: canonical,
              reason: 'casing_fix',
            });
          }
        }
        text = text.replace(phraseRegex, canonical);
      }
    }
  }

  // Phase 4: Word-by-word token processing with conservative fuzzy matching
  const tokenRegex = /([a-zA-Z0-9_\-\.]+)/g;
  text = text.replace(tokenRegex, (token) => {
    const lower = token.toLowerCase();

    // Guard 1: Never modify protected everyday English words
    if (PROTECTED_COMMON_WORDS.has(lower)) {
      return token;
    }

    // Exact single-word casing match
    if (termsMap.has(lower)) {
      const canonical = termsMap.get(lower)!;
      if (token !== canonical) {
        replacements.push({
          original: token,
          replacement: canonical,
          reason: 'casing_fix',
        });
      }
      return canonical;
    }

    // Conservative fuzzy matching guards:
    // - Token must be >= 6 characters
    // - Distance <= 1 for lengths 6..8 (similarity >= 0.82)
    // - Distance <= 2 for lengths 9+ (similarity >= 0.85)
    if (token.length >= 6) {
      let bestMatch: string | null = null;
      let highestSimilarity = 0.0;

      for (const [termLower, canonical] of termsMap.entries()) {
        // Skip multi-word entries in single-token matching
        if (termLower.includes(' ')) continue;

        // Skip candidates with significant length difference
        if (Math.abs(termLower.length - token.length) > 2) continue;

        const sim = computeSimilarityScore(lower, termLower);
        const dist = computeLevenshteinDistance(lower, termLower);

        const meetsThreshold =
          (token.length <= 8 && dist <= 1 && sim >= 0.82) ||
          (token.length >= 9 && dist <= 2 && sim >= 0.85);

        if (meetsThreshold && sim > highestSimilarity) {
          highestSimilarity = sim;
          bestMatch = canonical;
        }
      }

      if (bestMatch && bestMatch !== token) {
        replacements.push({
          original: token,
          replacement: bestMatch,
          reason: 'fuzzy_match',
        });
        return bestMatch;
      }
    }

    return token;
  });

  return {
    cleanText: text,
    appliedReplacements: replacements,
  };
}

// ==============================================================================
// 4. Per-Turn Confidence & Low-Confidence Detection (§T7)
// ==============================================================================

/**
 * Computes per-turn STT confidence and identifies turns requiring verification.
 *
 * Rule:
 * - If speech detected > 2.0s but < 3 recognized words: severely penalized (confidence <= 0.35, low confidence).
 * - If confidence < 0.65: flagged as low-confidence turn for review ("Transcription may be inaccurate").
 * - Returns clean confidence rating between 0.0 and 1.0.
 */
export function computeTurnConfidence(
  text: string,
  sttConfidence?: number,
  speechDurationSec: number = 0.0
): TurnConfidenceResult {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Rule 1: Speech detected > 2.0s but fewer than 3 words captured
  if (speechDurationSec >= 2.0 && wordCount < 3) {
    return {
      confidence: 0.30,
      isLowConfidence: true,
      flagReason: `Speech detected for ${speechDurationSec.toFixed(1)}s but only ${wordCount} words recognized.`,
    };
  }

  // Rule 2: Explicit STT confidence provided by recognizer
  let baseConfidence = 0.90;
  if (typeof sttConfidence === 'number' && !isNaN(sttConfidence)) {
    baseConfidence = Math.max(0.0, Math.min(1.0, sttConfidence));
  } else {
    // Estimate baseline confidence from word density & structure
    if (wordCount >= 10) {
      baseConfidence = 0.94;
    } else if (wordCount >= 4) {
      baseConfidence = 0.85;
    } else if (wordCount > 0) {
      baseConfidence = 0.60;
    } else {
      baseConfidence = 0.0;
    }
  }

  // Flag low confidence if below threshold
  const isLow = baseConfidence < 0.65;
  return {
    confidence: parseFloat(baseConfidence.toFixed(2)),
    isLowConfidence: isLow,
    flagReason: isLow ? 'Low speech recognition confidence score (< 0.65).' : undefined,
  };
}
