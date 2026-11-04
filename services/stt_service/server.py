"""
Streaming Speech-to-Text WebSocket Microservice (§2, T4).
Runs on port 8001 (separate from main backend on port 8000).

Strict Zero Audio Storage:
Audio frames are decoded in transient memory and immediately dereferenced.
No audio files, blobs, or waveforms are ever written to disk or database.
"""

import asyncio
from collections import defaultdict
import json
import logging
import os
import subprocess
import time
import uuid
from typing import Any, Dict, Optional

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import psutil
import uvicorn

from .config import (
    DEFAULT_PROVIDER,
    FRAME_SIZE_MS,
    MAX_CONCURRENT_STREAMS,
    RATE_LIMIT_PER_MINUTE,
    REQUIRE_AUTH,
    SAMPLE_RATE,
    STT_FALLBACK_PORT,
    STT_HOST,
    STT_PORT,
)
from .providers import get_available_providers, get_stt_provider
from .tickets import create_stt_ticket, validate_and_consume_ticket

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stt_server")

app = FastAPI(
    title="Streaming Speech-to-Text Microservice",
    description="Dual-engine (faster-whisper + Vosk) streaming STT microservice with zero audio persistence.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

process = psutil.Process()
stream_semaphore = asyncio.Semaphore(MAX_CONCURRENT_STREAMS)
active_connections: Dict[str, Dict[str, Any]] = {}

# Simple sliding-window rate limiter per IP: {ip: [timestamps]}
rate_limiter: Dict[str, list] = defaultdict(list)


def check_rate_limit(client_ip: str) -> bool:
    """Return True if under rate limit; False if exceeded."""
    now = time.time()
    cutoff = now - 60.0
    history = [t for t in rate_limiter[client_ip] if t > cutoff]
    if len(history) >= RATE_LIMIT_PER_MINUTE:
        return False
    history.append(now)
    rate_limiter[client_ip] = history
    return True


def query_gpu_stats() -> Dict[str, Any]:
    """Query NVIDIA GPU utilization and VRAM usage via nvidia-smi."""
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
    """Health check reporting provider status, hardware, and audio constraints."""
    prov_metrics = get_available_providers()
    gpu = query_gpu_stats()

    return {
        "status": "ok",
        "service": "streaming-stt-service",
        "port": STT_PORT,
        "default_provider": DEFAULT_PROVIDER,
        "providers": prov_metrics,
        "hardware": {
            "gpu": gpu,
            "cpu_count": psutil.cpu_count(logical=True),
        },
        "sample_rate": SAMPLE_RATE,
        "frame_ms": FRAME_SIZE_MS,
        "zero_audio_storage_guaranteed": True,
        "require_auth": REQUIRE_AUTH,
        "max_concurrent_streams": MAX_CONCURRENT_STREAMS,
        "active_streams": len(active_connections),
    }


@app.get("/metrics")
async def get_metrics() -> Dict[str, Any]:
    """System resource metrics (CPU %, GPU %, memory, active connections)."""
    cpu_pct = process.cpu_percent(interval=0.05)
    mem_info = process.memory_info()
    gpu_stats = query_gpu_stats()

    return {
        "service_port": STT_PORT,
        "process_cpu_pct": round(cpu_pct, 2),
        "process_memory_mb": round(mem_info.rss / (1024 * 1024), 2),
        "active_streams": len(active_connections),
        "max_streams": MAX_CONCURRENT_STREAMS,
        "gpu": gpu_stats,
    }


@app.post("/api/v1/stt/ticket")
async def issue_stt_ticket(session_id: Optional[str] = None) -> Dict[str, Any]:
    """Generate a single-use ticket for authenticating WebSocket streaming sessions."""
    ticket = create_stt_ticket(session_id=session_id)
    return {
        "ticket": ticket,
        "expires_in_seconds": 30.0,
    }


@app.websocket("/ws/stt")
async def websocket_stt_endpoint(
    websocket: WebSocket,
    ticket: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    initial_prompt: Optional[str] = Query(None),
) -> None:
    """
    Streaming STT WebSocket Endpoint (§2 & T4).
    Accepts:
    - Binary messages: Raw 16 kHz 16-bit mono linear PCM frames (80-200ms).
    - JSON text messages: Control commands ({"type": "start"}, {"type": "stop"}, etc.).
    Emits:
    - JSON messages: {"type": "transcript", "event": "partial" | "final" | "endpoint", "text": "...", "is_final": bool, ...}
    """
    client_ip = websocket.client.host if websocket.client else "127.0.0.1"

    # Rate limiting
    if not check_rate_limit(client_ip):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Rate limit exceeded")
        return

    # Single-use ticket authentication
    if not validate_and_consume_ticket(ticket):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired ticket")
        return

    # Check concurrency limits
    if len(active_connections) >= MAX_CONCURRENT_STREAMS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Max concurrent streams reached")
        return

    await websocket.accept()
    session_id = str(uuid.uuid4())
    provider_name = provider or DEFAULT_PROVIDER
    stt = get_stt_provider(provider_name)
    stt.init_session(session_id, options={"initial_prompt": initial_prompt})

    active_connections[session_id] = {
        "provider": stt.name,
        "client_ip": client_ip,
        "connected_at": time.time(),
    }

    # Send ready handshake
    await websocket.send_json({
        "type": "ready",
        "session_id": session_id,
        "provider": stt.name,
        "sample_rate": SAMPLE_RATE,
        "frame_ms": FRAME_SIZE_MS,
    })

    try:
        while True:
            message = await websocket.receive()

            # Handle Binary PCM Audio Frame (16 kHz mono 16-bit)
            if "bytes" in message and message["bytes"]:
                pcm_bytes = message["bytes"]
                result = await stt.process_pcm_frame(session_id, pcm_bytes)
                if result and result.get("text"):
                    await websocket.send_json(result)

            # Handle JSON Control Messages
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type", "")

                    if msg_type == "start":
                        stt.reset_session(session_id)
                        await websocket.send_json({
                            "type": "state",
                            "status": "listening",
                            "provider": stt.name,
                        })

                    elif msg_type in ("stop", "flush"):
                        endpoint_res = await stt.finalize_utterance(session_id)
                        if endpoint_res and endpoint_res.get("text"):
                            await websocket.send_json(endpoint_res)
                        await websocket.send_json({"type": "state", "status": "idle"})

                    elif msg_type == "reset":
                        stt.reset_session(session_id)
                        await websocket.send_json({"type": "state", "status": "reset"})

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info("Client session disconnected: %s", session_id)
    except Exception as exc:
        logger.warning("WebSocket error in session %s: %s", session_id, exc)
    finally:
        stt.close_session(session_id)
        active_connections.pop(session_id, None)


def main() -> None:
    """CLI launcher with automatic fallback port binding."""
    port = STT_PORT
    try:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((STT_HOST, port))
    except OSError:
        logger.warning("Port %d is occupied. Binding to fallback port %d.", port, STT_FALLBACK_PORT)
        port = STT_FALLBACK_PORT

    logger.info("Starting Streaming STT Service on %s:%d...", STT_HOST, port)
    uvicorn.run(app, host=STT_HOST, port=port, log_level="info")


if __name__ == "__main__":
    main()
