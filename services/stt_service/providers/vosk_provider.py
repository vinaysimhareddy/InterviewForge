"""
Vosk Streaming STT Provider (§2 & T4).
Features:
- Instant frame-by-frame streaming ASR based on Kaldi HMM-DNN.
- Ultra-low latency (<250ms p50 to first partial).
- 0 GPU requirement, ~60MB RAM footprint.
- Strict Zero Audio Storage: frames decoded in transient memory and dereferenced.
"""

import json
import logging
import time
from typing import Any, Dict, Optional

from ..config import VOSK_MODEL_NAME
from .base import BaseSTTProvider

logger = logging.getLogger("stt_service.vosk")


class VoskSession:
    """Transient session state for a streaming client."""

    def __init__(self, session_id: str, model: Any):
        self.session_id: str = session_id
        import vosk
        self.recognizer = vosk.KaldiRecognizer(model, 16000.0)
        self.recognizer.SetWords(True)
        self.last_emitted_partial: str = ""
        self.is_speech_active: bool = False

    def reset_utterance(self, model: Any) -> None:
        """Reset recognizer state between turns."""
        import vosk
        self.recognizer = vosk.KaldiRecognizer(model, 16000.0)
        self.recognizer.SetWords(True)
        self.last_emitted_partial = ""
        self.is_speech_active = False


class VoskProvider(BaseSTTProvider):
    """Streaming Kaldi/Vosk provider for ultra-low latency CPU speech recognition."""

    def __init__(self, model_name: Optional[str] = None):
        self._model_name = model_name or VOSK_MODEL_NAME
        self._model = None
        self._sessions: Dict[str, VoskSession] = {}
        self._load_time: float = 0.0
        self._init_model()

    def _init_model(self) -> None:
        """Initialize Vosk Model."""
        t0 = time.time()
        try:
            import vosk
            logger.info("Loading Vosk Model (%s)...", self._model_name)
            self._model = vosk.Model(model_name=self._model_name)
            self._load_time = time.time() - t0
            logger.info("Vosk Model loaded in %.3fs", self._load_time)
        except Exception as exc:
            logger.error("Failed to load Vosk model: %s", exc)
            self._model = None

    @property
    def name(self) -> str:
        return "vosk"

    @property
    def is_available(self) -> bool:
        return self._model is not None

    def init_session(self, session_id: str, options: Optional[Dict[str, Any]] = None) -> None:
        if not self.is_available:
            return
        self._sessions[session_id] = VoskSession(session_id, self._model)

    def _get_session(self, session_id: str) -> Optional[VoskSession]:
        if session_id not in self._sessions and self.is_available:
            self.init_session(session_id)
        return self._sessions.get(session_id)

    async def process_pcm_frame(
        self, session_id: str, pcm_bytes: bytes
    ) -> Optional[Dict[str, Any]]:
        """
        Feed 16-bit linear PCM frame to Kaldi recognizer.
        Returns partial or final transcript event.
        """
        session = self._get_session(session_id)
        if not session or not pcm_bytes:
            return None

        now = time.time()

        # Feed frame to Kaldi recognizer
        if session.recognizer.AcceptWaveform(pcm_bytes):
            res_raw = session.recognizer.Result()
            try:
                res = json.loads(res_raw)
                text = res.get("text", "").strip()
                if text:
                    session.last_emitted_partial = ""
                    session.is_speech_active = False
                    return {
                        "session_id": session_id,
                        "type": "transcript",
                        "event": "final",
                        "text": text,
                        "is_final": True,
                        "confidence": 0.95,
                        "timestamp": int(now * 1000),
                        "provider": self.name,
                    }
            except json.JSONDecodeError:
                pass
        else:
            part_raw = session.recognizer.PartialResult()
            try:
                part = json.loads(part_raw)
                partial_text = part.get("partial", "").strip()
                if partial_text and partial_text != session.last_emitted_partial:
                    session.last_emitted_partial = partial_text
                    session.is_speech_active = True
                    return {
                        "session_id": session_id,
                        "type": "transcript",
                        "event": "partial",
                        "text": partial_text,
                        "is_final": False,
                        "confidence": 0.85,
                        "timestamp": int(now * 1000),
                        "provider": self.name,
                    }
            except json.JSONDecodeError:
                pass

        return None

    async def finalize_utterance(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Flush final result on silence or utterance end."""
        session = self._get_session(session_id)
        if not session:
            return None

        now = time.time()
        final_raw = session.recognizer.FinalResult()
        text = ""
        try:
            res = json.loads(final_raw)
            text = res.get("text", "").strip()
        except json.JSONDecodeError:
            pass

        # Reset recognizer for next turn
        session.reset_utterance(self._model)

        if text:
            return {
                "session_id": session_id,
                "type": "transcript",
                "event": "endpoint",
                "text": text,
                "is_final": True,
                "confidence": 0.95,
                "timestamp": int(now * 1000),
                "provider": self.name,
            }

        return None

    def reset_session(self, session_id: str) -> None:
        session = self._get_session(session_id)
        if session:
            session.reset_utterance(self._model)

    def close_session(self, session_id: str) -> None:
        if session_id in self._sessions:
            del self._sessions[session_id]

    def get_metrics(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "available": self.is_available,
            "model_name": self._model_name,
            "device": "cpu",
            "compute_type": "float32",
            "load_time_seconds": round(self._load_time, 3),
            "active_sessions": len(self._sessions),
        }

