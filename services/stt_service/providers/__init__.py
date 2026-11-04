"""
Streaming STT Providers Registry (§2 & T4).
"""

from typing import Any, Dict, List, Optional
from .base import BaseSTTProvider
from .faster_whisper_provider import FasterWhisperProvider
from .vosk_provider import VoskProvider

# Lazy-loaded singleton registry
_PROVIDERS: Dict[str, BaseSTTProvider] = {}


def get_stt_provider(name: Optional[str] = None) -> BaseSTTProvider:
    """
    Get or instantiate STT provider singleton.
    Supported: 'faster-whisper' (default), 'vosk'.
    """
    target = (name or "faster-whisper").lower().strip()
    if target in ("whisper", "faster_whisper", "faster-whisper"):
        target = "faster-whisper"
    elif target in ("vosk", "kaldi"):
        target = "vosk"
    else:
        target = "faster-whisper"

    if target not in _PROVIDERS:
        if target == "faster-whisper":
            _PROVIDERS[target] = FasterWhisperProvider()
        elif target == "vosk":
            _PROVIDERS[target] = VoskProvider()

    return _PROVIDERS[target]


def get_available_providers() -> Dict[str, Dict[str, Any]]:
    """Return status dictionary of all registered providers."""
    result = {}
    for p_name in ("faster-whisper", "vosk"):
        try:
            prov = get_stt_provider(p_name)
            result[p_name] = prov.get_metrics()
        except Exception as e:
            result[p_name] = {"available": False, "error": str(e)}
    return result


__all__ = ["BaseSTTProvider", "FasterWhisperProvider", "VoskProvider", "get_stt_provider", "get_available_providers"]
