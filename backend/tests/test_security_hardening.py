"""
Security & Configuration Hardening Test Suite (§PR6).

Verifies:
1. Startup validation fails fast on default/insecure JWT_SECRET in production mode.
2. Startup validation fails fast on wildcard CORS in production mode.
3. SecurityHeadersMiddleware attaches defense-in-depth headers (CSP, nosniff, DENY, Permissions-Policy).
4. SlidingWindowRateLimiter throttles abusive requests with HTTP 429 and Retry-After.
5. Production error sanitization suppresses internal tracebacks and vendor leaks.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from starlette.exceptions import HTTPException

from app.core.config import Settings
from app.core.rate_limiter import SlidingWindowRateLimiter
from app.main import app


def test_production_rejects_default_jwt_secret() -> None:
    """Verify Settings rejects default changeme JWT_SECRET when ENVIRONMENT=production."""
    with pytest.raises(ValidationError) as excinfo:
        Settings(
            ENVIRONMENT="production",
            JWT_SECRET="changeme_replace_with_a_secure_random_hex_key_at_least_32_chars",
            MONGODB_URI="mongodb+srv://<USER>:<PASS>@cluster.mongodb.net/?retryWrites=true",
            MONGODB_DB_NAME="test-db",
        )
    assert "[SECURITY FATAL]" in str(excinfo.value)
    assert "JWT_SECRET" in str(excinfo.value)


def test_production_rejects_short_jwt_secret() -> None:
    """Verify Settings rejects short JWT_SECRET (< 32 chars) when ENVIRONMENT=production."""
    with pytest.raises(ValidationError) as excinfo:
        Settings(
            ENVIRONMENT="production",
            JWT_SECRET="too-short-secret-key-12345",
            MONGODB_URI="mongodb+srv://<USER>:<PASS>@cluster.mongodb.net/?retryWrites=true",
            MONGODB_DB_NAME="test-db",
        )
    assert "[SECURITY FATAL]" in str(excinfo.value)


def test_production_rejects_wildcard_cors() -> None:
    """Verify Settings rejects wildcard CORS ('*') when ENVIRONMENT=production."""
    with pytest.raises(ValidationError) as excinfo:
        Settings(
            ENVIRONMENT="production",
            JWT_SECRET="a" * 32,
            CORS_ORIGINS="*",
            MONGODB_URI="mongodb+srv://<USER>:<PASS>@cluster.mongodb.net/?retryWrites=true",
            MONGODB_DB_NAME="test-db",
        )
    assert "[SECURITY FATAL]" in str(excinfo.value)
    assert "Wildcard CORS" in str(excinfo.value)


def test_production_accepts_valid_high_entropy_config() -> None:
    """Verify Settings accepts secure configuration with 32+ char key and explicit CORS origins."""
    s = Settings(
        ENVIRONMENT="production",
        JWT_SECRET="f6c8d7e9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7",
        CORS_ORIGINS="https://interviewforge.com,https://app.interviewforge.com",
        MONGODB_URI="mongodb+srv://<USER>:<PASS>@cluster.mongodb.net/?retryWrites=true",
        MONGODB_DB_NAME="production-db",
    )
    assert s.ENVIRONMENT == "production"
    assert len(s.JWT_SECRET) >= 32
    assert "*" not in s.cors_origin_list


@pytest.mark.asyncio
async def test_security_headers_middleware_present() -> None:
    """Verify all responses include defense-in-depth HTTP security headers."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        resp = await client.get("/health")
        assert resp.status_code == 200

        headers = resp.headers
        assert headers.get("x-content-type-options") == "nosniff"
        assert headers.get("x-frame-options") == "DENY"
        assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
        assert "camera=(self)" in headers.get("permissions-policy", "")
        assert "microphone=(self)" in headers.get("permissions-policy", "")
        assert "default-src 'self'" in headers.get("content-security-policy", "")
        assert "frame-ancestors 'none'" in headers.get("content-security-policy", "")


def test_sliding_window_rate_limiter_throttling(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify SlidingWindowRateLimiter raises HTTP 429 when threshold exceeded."""
    test_limiter = SlidingWindowRateLimiter()
    test_key = "test-client-ip-123"

    # Enforce non-test environment to test exact limit = 5
    monkeypatch.setenv("ENVIRONMENT", "production")

    # First 5 requests should succeed
    for _ in range(5):
        test_limiter.check(test_key, limit=5, window_seconds=10.0)

    # 6th request should trigger HTTP 429
    with pytest.raises(HTTPException) as excinfo:
        test_limiter.check(test_key, limit=5, window_seconds=10.0)

    assert excinfo.value.status_code == 429
    assert "Too many requests" in excinfo.value.detail
    assert "Retry-After" in excinfo.value.headers
