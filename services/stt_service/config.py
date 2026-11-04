"""
Configuration for Streaming STT Microservice (§2 & T4).
Runs on port 8001 (separate from main backend on port 8000).
Strict Zero Audio Storage Guarantee: audio data is kept only in transient memory and dereferenced immediately.
"""

import os
from typing import List

# Server Network Settings
STT_HOST: str = os.getenv("STT_HOST", "127.0.0.1")
STT_PORT: int = int(os.getenv("STT_PORT", "8001"))
STT_FALLBACK_PORT: int = int(os.getenv("STT_FALLBACK_PORT", "8002"))

# Audio Input Specifications
SAMPLE_RATE: int = 16000
CHANNELS: int = 1
SAMPLE_WIDTH_BYTES: int = 2  # 16-bit signed linear PCM
FRAME_SIZE_MS: int = 100     # 80 - 160 ms (100 ms = 1600 samples = 3200 bytes)
BYTES_PER_FRAME: int = int(SAMPLE_RATE * (FRAME_SIZE_MS / 1000.0) * SAMPLE_WIDTH_BYTES)

# Concurrency & Rate Limiting
MAX_CONCURRENT_STREAMS: int = int(os.getenv("STT_MAX_CONCURRENT_STREAMS", "4"))
RATE_LIMIT_PER_MINUTE: int = int(os.getenv("STT_RATE_LIMIT_PER_MINUTE", "60"))

# Authentication & Ticket Security
REQUIRE_AUTH: bool = os.getenv("STT_REQUIRE_AUTH", "false").lower() in ("true", "1", "yes")
TICKET_TTL_SECONDS: float = float(os.getenv("STT_TICKET_TTL_SECONDS", "30.0"))

# Provider Settings
DEFAULT_PROVIDER: str = os.getenv("STT_DEFAULT_PROVIDER", "faster-whisper")
FASTER_WHISPER_MODEL: str = os.getenv("FASTER_WHISPER_MODEL", "base.en")
FASTER_WHISPER_DEVICE: str = os.getenv("STT_DEVICE", "cpu")
FASTER_WHISPER_COMPUTE_TYPE: str = os.getenv("STT_COMPUTE_TYPE", "int8")
FASTER_WHISPER_CPU_THREADS: int = int(os.getenv("STT_CPU_THREADS", "4"))
VOSK_MODEL_NAME: str = os.getenv("VOSK_MODEL_NAME", "vosk-model-small-en-us-0.15")

# Technical Term Biasing Prompt (§2, T4, T7)
TECHNICAL_INITIAL_PROMPT: str = (
    "Technical software engineering interview terms: Spring Boot, Kafka, Kubernetes, "
    "PostgreSQL, microservices, REST, ACID, idempotent, Redis, Docker, gRPC, distributed systems, "
    "CI/CD, SQL, transaction, replication, latency, throughput, JWT, OAuth2, GraphQL, shard, cluster."
)

# VAD & End-of-Utterance Detection
VAD_ENERGY_THRESHOLD: float = float(os.getenv("VAD_ENERGY_THRESHOLD", "0.015"))
VAD_SILENCE_TIMEOUT_MS: int = int(os.getenv("VAD_SILENCE_TIMEOUT_MS", "1200"))
VAD_MIN_SPEECH_FRAMES: int = 3
VAD_SILENCE_FRAMES_TRIGGER: int = int(VAD_SILENCE_TIMEOUT_MS / FRAME_SIZE_MS)  # ~12 frames
STREAMING_CHUNK_INTERVAL_MS: int = int(os.getenv("STT_CHUNK_INTERVAL_MS", "1500"))  # Partial update chunk (1.5s)

# Cache-Aware Streaming Parameters (for NeMo / Transducer compatibility)
DEFAULT_ATT_CONTEXT_SIZE: List[int] = [70, 1]

# Zero Audio Storage Mandate
PERSIST_AUDIO: bool = False
