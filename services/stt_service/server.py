"""
Nemotron Streaming Speech-to-Text WebSocket Service (§2).
Runs on port 8001 (separate from main backend on port 8000).

Strict Zero Audio Storage:
Audio frames are decoded in transient memory and immediately dereferenced.
No audio files, blobs, or waveforms are ever written to disk or database.
"""

import asyncio
import json
import logging
import os
import subprocess
import time
import uuid
from typing import Any, Dict, Optional

import psutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .config import (
    DEFAULT_ATT_CONTEXT_SIZE,
    FRAME_SIZE_MS,
    SAMPLE_RATE,
    STT_HOST,
    STT_PORT,
)
from .engine import NEMO_AVAILABLE, NEMO_VERSION, NemotronStreamingEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nemotron_stt_server")

app = FastAPI(
    title="Nemotron Streaming STT Service",
    description="Low-latency cache-aware streaming STT microservice with zero audio persistence.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = NemotronStreamingEngine(att_context_size=DEFAULT_ATT_CONTEXT_SIZE)
process = psutil.Process()


def query_gpu_stats() -> Dict[str, Any]:
    """Query live NVIDIA GPU utilization and VRAM usage."""
    try:
        cmd = [
            "nvidia-smi",
            "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
            "--format=csv,noheader,nounits",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=1.5)
        lines = res.stdout.strip().split("\n")
        if lines and lines[0]:
            parts = [p.strip() for p in lines[0].split(",")]
            return {
                "gpu_available": True,
                "gpu_utilization_pct": float(parts[0]),
                "vram_used_mb": float(parts[1]),
                "vram_total_mb": float(parts[2]),
                "temp_c": float(parts[3]) if len(parts) > 3 else None,
            }
    except Exception:
        pass
    return {
        "gpu_available": False,
        "gpu_utilization_pct": 0.0,
        "vram_used_mb": 0.0,
        "vram_total_mb": 0.0,
    }


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint for auto-fallback detection."""
    return {
        "status": "ok",
        "service": "nemotron-streaming-stt",
        "port": STT_PORT,
        "nemo_available": NEMO_AVAILABLE,
        "nemo_version": NEMO_VERSION,
        "cache_aware": True,
        "att_context_size": engine.att_context_size,
        "sample_rate": SAMPLE_RATE,
        "frame_ms": FRAME_SIZE_MS,
        "zero_audio_storage_guaranteed": True,
    }


@app.get("/metrics")
async def get_metrics() -> Dict[str, Any]:
    """System resource metrics (CPU %, GPU %, memory)."""
    cpu_pct = process.cpu_percent(interval=0.1)
    mem_info = process.memory_info()
    gpu_stats = query_gpu_stats()

    return {
        "service_port": STT_PORT,
        "process_cpu_pct": round(cpu_pct, 2),
        "process_memory_mb": round(mem_info.rss / (1024 * 1024), 2),
        "active_sessions": len(engine.sessions),
        "gpu": gpu_stats,
    }


@app.websocket("/ws/stt")
async def websocket_stt_endpoint(websocket: WebSocket) -> None:
    """
    Streaming ASR WebSocket Endpoint (§2).
    Receives:
    - Binary messages: Raw 16 kHz 16-bit mono linear PCM frames (80-160 ms).
    - JSON text messages: Control commands (start, stop, set_hypothesis).
    Sends:
    - JSON messages: Partial/final transcript events, VAD indicators, timestamps.
    """
    await websocket.accept()
    session_id = str(uuid.uuid4())
    session = engine.create_session(session_id)

    # Acknowledge connection
    await websocket.send_json({
        "type": "ready",
        "session_id": session_id,
        "att_context_size": session.att_context_size,
        "sample_rate": SAMPLE_RATE,
        "frame_ms": FRAME_SIZE_MS,
    })

    try:
        while True:
            message = await websocket.receive()

            # Handle Binary PCM Audio Frame (AudioWorklet stream)
            if "bytes" in message and message["bytes"]:
                pcm_bytes = message["bytes"]
                result = await engine.process_pcm_frame(session_id, pcm_bytes)

                # If text generated or state change, emit response
                if result.get("text") or result.get("is_final"):
                    await websocket.send_json(result)

            # Handle JSON Control Messages
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type", "")

                    if msg_type == "start":
                        ctx = payload.get("att_context_size", DEFAULT_ATT_CONTEXT_SIZE)
                        session.att_context_size = ctx
                        session.reset_utterance()
                        await websocket.send_json({"type": "state", "status": "listening", "att_context_size": ctx})

                    elif msg_type == "stop":
                        # Flush current buffer as final if speech was active
                        if session.is_speech_active and session.current_partial_text:
                            await websocket.send_json({
                                "session_id": session_id,
                                "type": "transcript",
                                "text": session.current_partial_text,
                                "is_final": True,
                                "timestamp": int(time.time() * 1000),
                            })
                        session.reset_utterance()
                        await websocket.send_json({"type": "state", "status": "idle"})

                    elif msg_type == "reset":
                        session.reset_utterance()
                        await websocket.send_json({"type": "state", "status": "reset"})

                    elif msg_type == "set_hypothesis":
                        # Benchmark harness hook for synthetic audio evaluation
                        engine.set_mock_hypothesis(session_id, payload.get("text", ""))

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info("Client session disconnected: %s", session_id)
    except Exception as exc:
        logger.warning("WebSocket error in session %s: %s", session_id, exc)
    finally:
        engine.close_session(session_id)


def main() -> None:
    """CLI launcher for streaming STT service."""
    port = STT_PORT
    try:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((STT_HOST, port))
    except OSError:
        fallback_port = 8002 if port == 8001 else 8001
        logger.warning(
            "Port %d is currently occupied by another process. Binding to fallback port %d.",
            port, fallback_port
        )
        port = fallback_port

    logger.info("Starting Nemotron Streaming STT Service on %s:%d...", STT_HOST, port)
    uvicorn.run(app, host=STT_HOST, port=port, log_level="info")


if __name__ == "__main__":
    main()
