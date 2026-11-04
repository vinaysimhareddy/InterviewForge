"""
Base STT Provider Interface (§2 & T4).
All providers must:
1. Process 16 kHz 16-bit linear PCM frames in-memory.
2. Emit partial, final, and endpoint events with timestamps.
3. Guarantee strict zero audio persistence.
"""

from abc import ABC, abstractmethod
import time
from typing import Any, Dict, Optional


class BaseSTTProvider(ABC):
    """Abstract streaming STT provider."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g. 'faster-whisper', 'vosk')."""
        pass

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """Whether model weights and runtime are loaded and ready."""
        pass

    @abstractmethod
    def init_session(self, session_id: str, options: Optional[Dict[str, Any]] = None) -> None:
        """Initialize per-stream session state."""
        pass

    @abstractmethod
    async def process_pcm_frame(
        self, session_id: str, pcm_bytes: bytes
    ) -> Optional[Dict[str, Any]]:
        """
        Process a 16 kHz 16-bit linear PCM frame (80-160ms).
        Returns a transcript event dict if text changed, or None.
        """
        pass

    @abstractmethod
    async def finalize_utterance(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Flush any pending utterance buffers and mark as final endpoint."""
        pass

    @abstractmethod
    def reset_session(self, session_id: str) -> None:
        """Reset utterance state between turns while keeping connection open."""
        pass

    @abstractmethod
    def close_session(self, session_id: str) -> None:
        """Teardown session state and flush all transient memory."""
        pass

    @abstractmethod
    def get_metrics(self) -> Dict[str, Any]:
        """Return runtime metrics (device, memory, load time)."""
        pass

