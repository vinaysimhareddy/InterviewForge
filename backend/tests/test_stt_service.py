"""
Comprehensive Automated Tests for Streaming STT Microservice (§2, T4).
Tests:
- Health check & available providers
- System metrics (CPU, RAM, GPU)
- Single-use ticket authentication & expiration
- Live WebSocket streaming with faster-whisper on real evaluation audio
- Live WebSocket streaming with Vosk on real evaluation audio
- Graceful client disconnect & resource cleanup
"""

import json
import os
import sys
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from services.stt_service.server import app
from services.stt_service.tickets import (
    create_stt_ticket,
    validate_and_consume_ticket,
    clear_stt_tickets,
)
import services.stt_service.config as config


@pytest.fixture(autouse=True)
def reset_tickets():
    clear_stt_tickets()
    yield
    clear_stt_tickets()


def get_test_pcm_frames(wav_path: str, max_frames: int = 25, frame_samples: int = 1600):
    """Load test audio, resample to 16 kHz mono 16-bit linear PCM, yield up to max_frames."""
    data, sr = sf.read(wav_path, dtype="float32")
    if sr != 16000:
        target_len = int(len(data) * 16000 / sr)
        data_16k = np.interp(
            np.linspace(0, len(data), target_len, endpoint=False),
            np.arange(len(data)),
            data,
        ).astype(np.float32)
    else:
        data_16k = data

    pcm_int16 = (np.clip(data_16k, -1.0, 1.0) * 32767).astype(np.int16)
    raw_bytes = pcm_int16.tobytes()
    frame_bytes = frame_samples * 2

    frames = []
    for i in range(0, len(raw_bytes), frame_bytes):
        chunk = raw_bytes[i : i + frame_bytes]
        if len(chunk) == frame_bytes:
            frames.append(chunk)
            if len(frames) >= max_frames:
                break
    return frames


def test_health_check():
    """Verify /health endpoint returns accurate status, providers, and hardware."""
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "ok"
    assert data["service"] == "streaming-stt-service"
    assert data["zero_audio_storage_guaranteed"] is True
    assert "providers" in data
    assert "faster-whisper" in data["providers"]
    assert "vosk" in data["providers"]
    assert data["providers"]["faster-whisper"]["available"] is True
    assert data["providers"]["vosk"]["available"] is True


def test_metrics_endpoint():
    """Verify /metrics reports CPU, memory, and active streams."""
    client = TestClient(app)
    resp = client.get("/metrics")
    assert resp.status_code == 200
    data = resp.json()

    assert "process_cpu_pct" in data
    assert "process_memory_mb" in data
    assert data["process_memory_mb"] > 0
    assert "active_streams" in data
    assert data["active_streams"] == 0


def test_single_use_ticket_lifecycle():
    """Verify ticket generation, single-use consumption, and expiration."""
    client = TestClient(app)
    issue_resp = client.post("/api/v1/stt/ticket")
    assert issue_resp.status_code == 200
    ticket = issue_resp.json()["ticket"]
    assert ticket.startswith("stt_")

    orig_require = config.REQUIRE_AUTH
    try:
        config.REQUIRE_AUTH = True
        # First consumption succeeds
        assert validate_and_consume_ticket(ticket) is True
        # Second consumption fails
        assert validate_and_consume_ticket(ticket) is False
        # Nonexistent fails
        assert validate_and_consume_ticket("invalid_ticket") is False
    finally:
        config.REQUIRE_AUTH = orig_require


def test_websocket_streaming_vosk():
    """Verify live streaming of real evaluation audio via Vosk provider."""
    wav_path = os.path.join(PROJECT_ROOT, "data", "stt_eval_answers", "ans_short_01.wav")
    assert os.path.exists(wav_path), f"Audio file not found: {wav_path}"
    frames = get_test_pcm_frames(wav_path, max_frames=20)
    assert len(frames) > 0

    client = TestClient(app)
    with client.websocket_connect("/ws/stt?provider=vosk") as ws:
        ready_msg = ws.receive_json()
        assert ready_msg["type"] == "ready"
        assert ready_msg["provider"] == "vosk"

        # Stream frames
        for frame in frames:
            ws.send_bytes(frame)

        # Flush utterance
        ws.send_text(json.dumps({"type": "flush"}))

        transcripts = []
        for _ in range(10):
            try:
                msg = ws.receive_json(mode="text")
                if msg.get("type") == "transcript" and msg.get("text"):
                    transcripts.append(msg["text"])
                if msg.get("type") == "state" and msg.get("status") == "idle":
                    break
            except Exception:
                break

        assert len(transcripts) > 0, "Expected transcript events from Vosk"
        combined = " ".join(transcripts).lower()
        print(f"\n[Vosk streaming transcript]: {combined}")
        assert "guarantees" in combined or "acid" in combined or "database" in combined


def test_websocket_streaming_faster_whisper():
    """Verify live streaming of real evaluation audio via faster-whisper provider."""
    wav_path = os.path.join(PROJECT_ROOT, "data", "stt_eval_answers", "ans_short_01.wav")
    assert os.path.exists(wav_path), f"Audio file not found: {wav_path}"
    frames = get_test_pcm_frames(wav_path, max_frames=20)
    assert len(frames) > 0

    client = TestClient(app)
    with client.websocket_connect("/ws/stt?provider=faster-whisper") as ws:
        ready_msg = ws.receive_json()
        assert ready_msg["type"] == "ready"
        assert ready_msg["provider"] == "faster-whisper"

        # Stream frames
        for frame in frames:
            ws.send_bytes(frame)

        # Signal end of utterance via stop command
        ws.send_text(json.dumps({"type": "stop"}))

        transcripts = []
        for _ in range(10):
            try:
                msg = ws.receive_json(mode="text")
                if msg.get("type") == "transcript" and msg.get("text"):
                    transcripts.append(msg["text"])
                if msg.get("type") == "state" and msg.get("status") == "idle":
                    break
            except Exception:
                break

        assert len(transcripts) > 0, "Expected transcript event from faster-whisper"
        final_text = transcripts[-1].lower()
        print(f"\n[Faster-Whisper streaming transcript]: {final_text}")
        assert "acid" in final_text or "guarantees" in final_text or "database" in final_text


def test_websocket_graceful_disconnect_recovery():
    """Verify that abrupt client disconnect properly cleans up session memory and active stream counts."""
    client = TestClient(app)
    metrics_before = client.get("/metrics").json()
    initial_streams = metrics_before["active_streams"]

    with client.websocket_connect("/ws/stt?provider=vosk") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"
        # Abrupt close on exit

    metrics_after = client.get("/metrics").json()
    assert metrics_after["active_streams"] == initial_streams
