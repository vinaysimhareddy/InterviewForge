from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import get_db, mongo_manager

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager managing database initialization and cleanup."""
    await mongo_manager.connect(app=app)
    yield
    await mongo_manager.close(app=app)


is_prod = settings.ENVIRONMENT == "production"

app = FastAPI(
    title="InterviewForge API",
    description="Backend services for real-time telemetry processing, adaptive technical interviewing, and multi-dimensional scoring.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
)

# Enforce explicit CORS whitelist from settings - never use wildcard in authenticated environments
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Enforces defense-in-depth HTTP security headers on all API responses (§PR6)."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        headers = response.headers
        headers["X-Content-Type-Options"] = "nosniff"
        headers["X-Frame-Options"] = "DENY"
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
        headers["Cross-Origin-Opener-Policy"] = "same-origin"

        # In production, enforce Strict-Transport-Security (HSTS)
        if is_prod:
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data: https:; "
            "connect-src 'self' ws: wss: http: https:; "
            "media-src 'self' blob: data:; "
            "worker-src 'self' blob:; "
            "frame-ancestors 'none';"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)


import time
import logging
import uuid
from fastapi import Request
from fastapi.responses import JSONResponse
from pymongo.errors import ConnectionFailure
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.database import get_error_hint

logger = logging.getLogger("app.main")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Assign or propagate a unique correlation ID for every request for tracing and error reporting (§PR7)."""
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID") or uuid.uuid4().hex[:12]
        request.state.correlation_id = correlation_id
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        except Exception as exc:
            logger.error("Unhandled server exception [%s]: %s", correlation_id, exc, exc_info=True)
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "An unexpected error occurred while processing your request. Please try again shortly.",
                    "code": "INTERNAL_ERROR",
                    "correlation_id": correlation_id,
                },
                headers={"X-Correlation-ID": correlation_id},
            )


app.add_middleware(CorrelationIdMiddleware)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Standardize HTTP exception envelopes with short error code and clean message."""
    code = "AUTH_REQUIRED" if exc.status_code == 401 else "FORBIDDEN" if exc.status_code == 403 else "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
    correlation_id = getattr(request.state, "correlation_id", None)
    headers = dict(getattr(exc, "headers", None) or {})
    if correlation_id:
        headers["X-Correlation-ID"] = correlation_id
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": code},
        headers=headers,
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Ensure unexpected exceptions return safe, generic error envelopes with correlation ID without leaking traces or vendors (§PR7)."""
    correlation_id = getattr(request.state, "correlation_id", None) or uuid.uuid4().hex[:12]
    logger.error("Unhandled server exception [%s]: %s", correlation_id, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected error occurred while processing your request. Please try again shortly.",
            "code": "INTERNAL_ERROR",
            "correlation_id": correlation_id,
        },
        headers={"X-Correlation-ID": correlation_id},
    )


@app.get("/health", tags=["health"])
async def health_check() -> Dict[str, str]:
    """Health check endpoint to verify ASGI backend vitality."""
    return {"status": "ok"}


@app.get("/health/db", tags=["health"])
async def health_db_check() -> JSONResponse:
    """
    Database connectivity and health diagnostic check.
    In production: returns minimal {"status": "ok"} without leaking collection names or internal metrics.
    In dev/test: returns extended diagnostic fields.
    Never exposes raw URI, credentials, or user data.
    """
    start_time = time.perf_counter()
    try:
        db = await get_db()
        if mongo_manager.client is None or not mongo_manager._is_connected or db is None:
            raise ConnectionFailure("MongoDB client is not connected to active database")
        await mongo_manager.client.admin.command("ping")

        if is_prod:
            return JSONResponse(
                status_code=200,
                content={"status": "ok"},
            )

        collections = await db.list_collection_names()
        auth_collection_exists = "auth" in collections
        auth_document_count = 0
        if auth_collection_exists:
            auth_document_count = await mongo_manager.db["auth"].count_documents({})

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return JSONResponse(
            status_code=200,
            content={
                "status": "ok",
                "database": settings.MONGODB_DB_NAME,
                "auth_collection_exists": auth_collection_exists,
                "auth_document_count": auth_document_count,
                "latency_ms": latency_ms,
            },
        )
    except Exception as exc:
        if is_prod:
            return JSONResponse(
                status_code=503,
                content={"status": "error", "message": "Database service unavailable"},
            )
        hint = get_error_hint(exc)
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "database": settings.MONGODB_DB_NAME,
                "auth_collection_exists": False,
                "auth_document_count": 0,
                "message": hint,
            },
        )


# Mount versioned API routes
app.include_router(api_router, prefix="/api/v1")

# Mount production frontend static distribution if built
import os
from fastapi.staticfiles import StaticFiles

static_dir = os.environ.get("STATIC_DIR", "/app/static")
if not os.path.isdir(static_dir):
    for candidate in ["dist", "frontend/dist", "../dist", "/app/applet/dist"]:
        if os.path.isdir(candidate):
            static_dir = candidate
            break

if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=(settings.ENVIRONMENT == "development"),
    )
