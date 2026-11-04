"""
Technical Term Normalization & Quality Layer (Backend §T7).

Deterministic, conservative fuzzy matching against software engineering glossaries
and acoustic error maps. Keeps raw text pristine and produces cleaned transcript
with per-turn confidence scores.
"""

import re
from typing import Any, Dict, List, Optional, Set, Tuple


CANONICAL_TECHNICAL_TERMS: Dict[str, str] = {
    # Frameworks & Runtimes
    "spring boot": "Spring Boot",
    "springboot": "Spring Boot",
    "react": "React",
    "reactjs": "React",
    "vue": "Vue",
    "vuejs": "Vue",
    "angular": "Angular",
    "nextjs": "Next.js",
    "next.js": "Next.js",
    "express": "Express",
    "expressjs": "Express",
    "fastapi": "FastAPI",
    "flask": "Flask",
    "django": "Django",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "hikaricp": "HikariCP",
    "guava": "Guava",
    "vite": "Vite",

    # Databases & Caching
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "mongodb": "MongoDB",
    "mysql": "MySQL",
    "redis": "Redis",
    "cassandra": "Cassandra",
    "dynamodb": "DynamoDB",
    "elasticsearch": "Elasticsearch",
    "sqlite": "SQLite",

    # Distributed Systems & Cloud
    "kubernetes": "Kubernetes",
    "k8s": "Kubernetes",
    "docker": "Docker",
    "kafka": "Kafka",
    "rabbitmq": "RabbitMQ",
    "grpc": "gRPC",
    "graphql": "GraphQL",
    "terraform": "Terraform",
    "datadog": "Datadog",
    "prometheus": "Prometheus",
    "grafana": "Grafana",

    # Protocols & Standards
    "rest": "REST",
    "restful": "RESTful",
    "oauth2": "OAuth2",
    "oauth": "OAuth",
    "pkce": "PKCE",
    "jwt": "JWT",
    "mtls": "mTLS",
    "json": "JSON",
    "sql": "SQL",
    "nosql": "NoSQL",
    "acid": "ACID",
    "crdt": "CRDT",
    "crdts": "CRDTs",
    "http": "HTTP",
    "https": "HTTPS",
    "websocket": "WebSocket",
    "websockets": "WebSockets",

    # Architecture & Patterns
    "microservices": "microservices",
    "microservice": "microservice",
    "goroutine": "Goroutines",
    "goroutines": "Goroutines",
    "idempotent": "idempotent",
    "idempotency": "idempotency",
    "explain analyze": "EXPLAIN ANALYZE",
    "outbox pattern": "outbox pattern",
    "strangler fig": "Strangler Fig",
    "saga pattern": "saga pattern",
    "two phase commit": "two-phase commit",
    "2pc": "2PC",
    "circuit breaker": "circuit breaker",
    "jvm": "JVM",
    "ci cd": "CI/CD",
    "ci/cd": "CI/CD",
}

PHONETIC_ASR_REPLACEMENTS: List[Tuple[re.Pattern, str, str]] = [
    (re.compile(r"\bpost\s+rescue\s+l\b", re.IGNORECASE), "PostgreSQL", "phonetic_alias"),
    (re.compile(r"\bpost\s+gres\b", re.IGNORECASE), "PostgreSQL", "phonetic_alias"),
    (re.compile(r"\bpostgre\s+sql\b", re.IGNORECASE), "PostgreSQL", "phonetic_alias"),
    (re.compile(r"\bhakeri\s+cp\b", re.IGNORECASE), "HikariCP", "phonetic_alias"),
    (re.compile(r"\bhikari\s+cp\b", re.IGNORECASE), "HikariCP", "phonetic_alias"),
    (re.compile(r"\bmongo\s+db\b", re.IGNORECASE), "MongoDB", "phonetic_alias"),
    (re.compile(r"\bcaf\s+kissing\s+connector\b", re.IGNORECASE), "Kafka sink connector", "phonetic_alias"),
    (re.compile(r"\bcaf\s+kissing\b", re.IGNORECASE), "Kafka sink", "phonetic_alias"),
    (re.compile(r"\bkafka\s+sync\s+connector\b", re.IGNORECASE), "Kafka sink connector", "phonetic_alias"),
    (re.compile(r"\bkafka\s+sync\b", re.IGNORECASE), "Kafka sink", "phonetic_alias"),
    (re.compile(r"\boh\s+off\s+to\b", re.IGNORECASE), "OAuth2", "phonetic_alias"),
    (re.compile(r"\bo\s+auth\s+2\b", re.IGNORECASE), "OAuth2", "phonetic_alias"),
    (re.compile(r"\boauth\s+2\b", re.IGNORECASE), "OAuth2", "phonetic_alias"),
    (re.compile(r"\bpk\s+see\b", re.IGNORECASE), "PKCE", "phonetic_alias"),
    (re.compile(r"\bp\s+k\s+c\s+e\b", re.IGNORECASE), "PKCE", "phonetic_alias"),
    (re.compile(r"\bkabir\s+nets\b", re.IGNORECASE), "Kubernetes", "phonetic_alias"),
    (re.compile(r"\bkuber\s+netes\b", re.IGNORECASE), "Kubernetes", "phonetic_alias"),
    (re.compile(r"\bgraph\s+que\s+el\b", re.IGNORECASE), "GraphQL", "phonetic_alias"),
    (re.compile(r"\bgorotines\b", re.IGNORECASE), "Goroutines", "phonetic_alias"),
    (re.compile(r"\bj\s+eso\s+and\b", re.IGNORECASE), "JSON", "phonetic_alias"),
    (re.compile(r"\bm2n\b", re.IGNORECASE), "M:N", "phonetic_alias"),
]

PROTECTED_COMMON_WORDS: Set[str] = {
    "and", "that", "this", "with", "from", "have", "here", "there", "were", "will",
    "would", "could", "should", "about", "after", "before", "between", "during",
    "under", "above", "while", "where", "which", "state", "table", "query", "order",
    "right", "write", "read", "lock", "test", "user", "role", "point", "class",
    "model", "group", "system", "service", "worker", "stream", "client", "server",
    "level", "value", "index", "check", "start", "first", "share", "scale", "score",
    "speed", "stack", "stage", "store", "total", "trace", "track", "treat", "trust",
}


def compute_levenshtein(a: str, b: str) -> int:
    """Calculate Levenshtein distance between two strings."""
    an, bn = len(a), len(b)
    if an == 0:
        return bn
    if bn == 0:
        return an

    dp = [[0] * (bn + 1) for _ in range(an + 1)]
    for i in range(an + 1):
        dp[i][0] = i
    for j in range(bn + 1):
        dp[0][j] = j

    for i in range(1, an + 1):
        for j in range(1, bn + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,       # deletion
                dp[i][j - 1] + 1,       # insertion
                dp[i - 1][j - 1] + cost, # substitution
            )

    return dp[an][bn]


def compute_similarity(a: str, b: str) -> float:
    """Calculate normalized character similarity score (0.0 to 1.0)."""
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    dist = compute_levenshtein(a.lower(), b.lower())
    return 1.0 - (dist / max_len)


def normalize_transcript(
    raw_text: str, custom_terms: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Deterministic technical term normalizer.
    Returns clean_text and audit trail of replacements.
    """
    if not raw_text or not raw_text.strip():
        return {"clean_text": "", "applied_replacements": []}

    text = raw_text
    replacements: List[Dict[str, str]] = []

    # Phase 1: Multi-word phonetic substitutions
    for pattern, rep, reason in PHONETIC_ASR_REPLACEMENTS:
        matches = pattern.findall(text)
        if matches:
            for m in matches:
                replacements.append({"original": m, "replacement": rep, "reason": reason})
            text = pattern.sub(rep, text)

    # Phase 2: Build term dictionary with custom role terms
    term_dict = dict(CANONICAL_TECHNICAL_TERMS)
    if custom_terms:
        for t in custom_terms:
            clean_t = t.strip()
            if len(clean_t) >= 2:
                term_dict[clean_t.lower()] = clean_t

    # Phase 3: Multi-word exact phrases
    for lower_key, canonical in term_dict.items():
        if " " in lower_key or "/" in lower_key or "-" in lower_key:
            phrase_regex = re.compile(rf"\b{re.escape(lower_key)}\b", re.IGNORECASE)
            matches = phrase_regex.findall(text)
            if matches:
                for m in matches:
                    if m != canonical:
                        replacements.append({"original": m, "replacement": canonical, "reason": "casing_fix"})
                text = phrase_regex.sub(canonical, text)

    # Phase 4: Token-by-token conservative fuzzy matching
    def replace_token(match: re.Match) -> str:
        token = match.group(0)
        lower = token.lower()

        if lower in PROTECTED_COMMON_WORDS:
            return token

        if lower in term_dict:
            canonical = term_dict[lower]
            if token != canonical:
                replacements.append({"original": token, "replacement": canonical, "reason": "casing_fix"})
            return canonical

        # Conservative fuzzy matching guards (length >= 6)
        if len(token) >= 6:
            best_match = None
            highest_sim = 0.0

            for term_lower, canonical in term_dict.items():
                if " " in term_lower or abs(len(term_lower) - len(token)) > 2:
                    continue

                sim = compute_similarity(lower, term_lower)
                dist = compute_levenshtein(lower, term_lower)

                meets_threshold = (
                    (len(token) <= 8 and dist <= 1 and sim >= 0.82)
                    or (len(token) >= 9 and dist <= 2 and sim >= 0.85)
                )

                if meets_threshold and sim > highest_sim:
                    highest_sim = sim
                    best_match = canonical

            if best_match and best_match != token:
                replacements.append({"original": token, "replacement": best_match, "reason": "fuzzy_match"})
                return best_match

        return token

    text = re.sub(r"([a-zA-Z0-9_\-\.]+)", replace_token, text)

    return {
        "clean_text": text,
        "applied_replacements": replacements,
    }


def compute_turn_confidence(
    text: str,
    stt_confidence: Optional[float] = None,
    speech_duration_sec: float = 0.0,
) -> Dict[str, Any]:
    """Compute per-turn STT confidence and flag low-confidence turns."""
    words = [w for w in text.strip().split() if w]
    word_count = len(words)

    # Speech detected > 2.0s with < 3 words
    if speech_duration_sec >= 2.0 and word_count < 3:
        return {
            "confidence": 0.30,
            "is_low_confidence": True,
            "flag_reason": f"Speech detected for {speech_duration_sec:.1f}s but only {word_count} words recognized.",
        }

    if stt_confidence is not None:
        base_confidence = max(0.0, min(1.0, float(stt_confidence)))
    else:
        if word_count >= 10:
            base_confidence = 0.94
        elif word_count >= 4:
            base_confidence = 0.85
        elif word_count > 0:
            base_confidence = 0.60
        else:
            base_confidence = 0.0

    is_low = base_confidence < 0.65
    return {
        "confidence": round(base_confidence, 2),
        "is_low_confidence": is_low,
        "flag_reason": "Low speech recognition confidence score (< 0.65)." if is_low else None,
    }
