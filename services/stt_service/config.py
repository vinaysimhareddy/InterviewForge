"""
Configuration for Nemotron Streaming STT Service (§2).
Runs on port 8001 (separate from core backend on port 8000).
"""

import os
from typing import List

# Server Network Settings
STT_HOST: str = os.getenv("STT_HOST", "127.0.0.1")
STT_PORT: int = int(os.getenv("STT_PORT", "8001"))

# Cache-Aware Streaming Conformer / Transducer Settings
# att_context_size: [left_context, right_context]
# Default [70, 1] provides 2.8s left acoustic context and 40ms right lookahead
DEFAULT_ATT_CONTEXT_SIZE: List[int] = [70, 1]

# Audio Input Constraints
SAMPLE_RATE: int = 16000
CHANNELS: int = 1
SAMPLE_WIDTH_BYTES: int = 2  # 16-bit linear PCM
FRAME_SIZE_MS: int = 100     # 80 - 160 ms (100 ms = 1600 samples = 3200 bytes)
BYTES_PER_FRAME: int = int(SAMPLE_RATE * (FRAME_SIZE_MS / 1000.0) * SAMPLE_WIDTH_BYTES)

# VAD & End-of-Utterance Detection
VAD_ENERGY_THRESHOLD: float = float(os.getenv("VAD_ENERGY_THRESHOLD", "0.018"))
VAD_SILENCE_TIMEOUT_MS: int = int(os.getenv("VAD_SILENCE_TIMEOUT_MS", "1200"))
VAD_MIN_SPEECH_FRAMES: int = 3
VAD_SILENCE_FRAMES_TRIGGER: int = int(VAD_SILENCE_TIMEOUT_MS / FRAME_SIZE_MS)  # ~12 frames

# Zero Audio Storage Mandate
PERSIST_AUDIO: bool = False

