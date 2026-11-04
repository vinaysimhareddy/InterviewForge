"""
Faster-Whisper Streaming STT Provider (§2, T4, T7).
Features:
- CTranslate2-accelerated Whisper inference (CUDA float16 or CPU int8).
- VAD-segmented chunk streaming with local agreement stabilization.
- initial_prompt technical vocabulary biasing (Spring Boot, Kafka, Kubernetes, PostgreSQL, etc.).
- Strict Zero Audio Storage: audio frames held in transient memory only and dereferenced.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional
import numpy as np

from ..config import (
    FASTER_WHISPER_MODEL,
    FASTER_WHISPER_DEVICE,
    FASTER_WHISPER_COMPUTE_TYPE,
    FASTER_WHISPER_CPU_THREADS,
    TECHNICAL_INITIAL_PROMPT,
    VAD_ENERGY_THRESHOLD,
    VAD_MIN_SPEECH_FRAMES,
    VAD_SILENCE_FRAMES_TRIGGER,
    STREAMING_CHUNK_INTERVAL_MS,
)
from .base import BaseSTTProvider

logger = logging.getLogger("stt_service.faster_whisper")


class FasterWhisperSession:
    """Transient session state for a streaming client."""

    def __init__(self, session_id: str, initial_prompt: Optional[str] = None):
        self.session_id: str = session_id
        self.initial_prompt: str = initial_prompt or TECHNICAL_INITIAL_PROMPT

        # Audio chunk buffer: list of float32 numpy arrays sampled at 16000 Hz
        self.audio_chunks: List[np.ndarray] = []
        self.total_samples: int = 0

        # VAD & Speech State
        self.is_speech_active: bool = False
        self.consecutive_speech_frames: int = 0
        self.consecutive_silence_frames: int = 0
        self.speech_start_time: Optional[float] = None
        self.last_speech_time: Optional[float] = None

        # Chunk transcription scheduling
        self.samples_since_last_transcribe: int = 0
        self.min_chunk_samples: int = int(16000 * (STREAMING_CHUNK_INTERVAL_MS / 1000.0))  # 1.5s window
        self.is_transcribing: bool = False

        # Stabilization state
        self.confirmed_text: str = ""
        self.last_partial_text: str = ""
        self.last_emitted_text: str = ""

    def reset_utterance(self) -> None:
        """Reset utterance buffers while keeping session active."""
        self.audio_chunks.clear()
        self.total_samples = 0
        self.is_speech_active = False
        self.consecutive_speech_frames = 0
        self.consecutive_silence_frames = 0
        self.speech_start_time = None
        self.last_speech_time = None
        self.samples_since_last_transcribe = 0
        self.is_transcribing = False
        self.last_partial_text = ""
        self.last_emitted_text = ""


class FasterWhisperProvider(BaseSTTProvider):
    """Streaming wrapper for faster-whisper (CTranslate2)."""

    def __init__(self, model_name: Optional[str] = None):
        self._model_name = model_name or FASTER_WHISPER_MODEL
        self._model = None
        self._device = "cpu"
        self._compute_type = "int8"
        self._sessions: Dict[str, FasterWhisperSession] = {}
        self._load_time: float = 0.0
        self._init_model()

    def _init_model(self) -> None:
        """Initialize WhisperModel with configured device and threads."""
        t0 = time.time()
        try:
            from faster_whisper import WhisperModel
            import ctranslate2

            self._device = FASTER_WHISPER_DEVICE
            self._compute_type = FASTER_WHISPER_COMPUTE_TYPE
            threads = FASTER_WHISPER_CPU_THREADS

            logger.info(
                "Loading Faster-Whisper (%s) on %s (%s, %d threads)...",
                self._model_name, self._device, self._compute_type, threads
            )
            self._model = WhisperModel(
                self._model_name,
                device=self._device,
                compute_type=self._compute_type,
                cpu_threads=threads,
            )
            self._load_time = time.time() - t0
            logger.info("Faster-Whisper loaded in %.2fs", self._load_time)

        except Exception as exc:
            logger.error("Failed to load Faster-Whisper: %s", exc)
            self._model = None

    @property
    def name(self) -> str:
        return "faster-whisper"

    @property
    def is_available(self) -> bool:
        return self._model is not None

    def init_session(self, session_id: str, options: Optional[Dict[str, Any]] = None) -> None:
        opts = options or {}
        prompt = opts.get("initial_prompt", TECHNICAL_INITIAL_PROMPT)
        self._sessions[session_id] = FasterWhisperSession(session_id, initial_prompt=prompt)

    def _get_session(self, session_id: str) -> FasterWhisperSession:
        if session_id not in self._sessions:
            self.init_session(session_id)
        return self._sessions[session_id]

    async def process_pcm_frame(
        self, session_id: str, pcm_bytes: bytes
    ) -> Optional[Dict[str, Any]]:
        """
        Process 16 kHz 16-bit linear PCM frame.
        Applies VAD, buffers audio in memory, triggers async transcription, and yields partial/final events.
        """
        if not self.is_available or not pcm_bytes:
            return None

        session = self._get_session(session_id)
        now = time.time()

        # Convert raw PCM bytes to float32 normalized samples
        pcm_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
        if len(pcm_int16) == 0:
            return None
        pcm_float = pcm_int16.astype(np.float32) / 32768.0

        # Compute RMS energy
        rms = float(np.sqrt(np.mean(pcm_float**2)))
        is_speech = rms >= VAD_ENERGY_THRESHOLD

        if is_speech:
            session.consecutive_speech_frames += 1
            session.consecutive_silence_frames = 0
            session.last_speech_time = now

            if not session.is_speech_active and session.consecutive_speech_frames >= VAD_MIN_SPEECH_FRAMES:
                session.is_speech_active = True
                session.speech_start_time = now
        else:
            session.consecutive_speech_frames = 0
            if session.is_speech_active:
                session.consecutive_silence_frames += 1

        # Accumulate audio in memory buffer
        session.audio_chunks.append(pcm_float)
        session.total_samples += len(pcm_float)
        session.samples_since_last_transcribe += len(pcm_float)

        # Check for end-of-utterance via silence trigger
        if session.is_speech_active and session.consecutive_silence_frames >= VAD_SILENCE_FRAMES_TRIGGER:
            # End of utterance detected
            return await self.finalize_utterance(session_id)

        # Periodic partial hypothesis generation
        if (
            session.is_speech_active
            and not session.is_transcribing
            and session.samples_since_last_transcribe >= session.min_chunk_samples
        ):
            session.is_transcribing = True
            session.samples_since_last_transcribe = 0

            # Concatenate transient audio buffer for transcription
            audio_data = np.concatenate(session.audio_chunks)

            try:
                # Transcribe in separate thread to prevent event loop blocking
                text = await asyncio.to_thread(self._transcribe_audio_buffer, audio_data, session.initial_prompt)
                session.is_transcribing = False

                if text and text != session.last_emitted_text:
                    session.last_partial_text = text
                    session.last_emitted_text = text
                    return {
                        "session_id": session_id,
                        "type": "transcript",
                        "event": "partial",
                        "text": text,
                        "is_final": False,
                        "rms": round(rms, 4),
                        "timestamp": int(now * 1000),
                        "provider": self.name,
                    }
            except Exception as e:
                logger.warning("Partial transcription error: %s", e)
                session.is_transcribing = False

        return None

    def _transcribe_audio_buffer(self, audio_data: np.ndarray, initial_prompt: str) -> str:
        """Transcribe in-memory audio array with initial_prompt term biasing."""
        if self._model is None or len(audio_data) < 1600:
            return ""

        segments, _ = self._model.transcribe(
            audio_data,
            beam_size=1,
            temperature=0.0,
            initial_prompt=initial_prompt,
            vad_filter=False,  # We manage VAD externally
            without_timestamps=True,
        )
        return " ".join([s.text for s in segments]).strip()

    async def finalize_utterance(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Finalize current utterance, emit endpoint event, and purge buffer."""
        session = self._get_session(session_id)
        if not session.audio_chunks:
            return None

        now = time.time()
        audio_data = np.concatenate(session.audio_chunks)

        try:
            final_text = await asyncio.to_thread(
                self._transcribe_audio_buffer, audio_data, session.initial_prompt
            )
        except Exception as e:
            logger.warning("Final transcription error: %s", e)
            final_text = session.last_partial_text

        # Purge transient audio buffers (strict zero audio storage)
        session.reset_utterance()

        if final_text:
            return {
                "session_id": session_id,
                "type": "transcript",
                "event": "endpoint",
                "text": final_text,
                "is_final": True,
                "timestamp": int(now * 1000),
                "provider": self.name,
            }

        return None

    def reset_session(self, session_id: str) -> None:
        session = self._get_session(session_id)
        session.reset_utterance()

    def close_session(self, session_id: str) -> None:
        if session_id in self._sessions:
            self._sessions[session_id].reset_utterance()
            del self._sessions[session_id]

    def get_metrics(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "available": self.is_available,
            "model_name": self._model_name,
            "device": self._device,
            "compute_type": self._compute_type,
            "load_time_seconds": round(self._load_time, 3),
            "active_sessions": len(self._sessions),
        }
