"""
Sliding-Window Rate Limiter for Sensitive Endpoints (§PR6).

Thread-safe sliding-window rate limiter by client IP or entity key.
Returns HTTP 429 Too Many Requests with Retry-After header when exceeded.
Configurable by environment (production enforces strict limits; tests allow headroom).
"""

from collections import defaultdict
import time
from typing import Dict, List
from fastapi import HTTPException, Request, status
from app.core.config import get_settings


class SlidingWindowRateLimiter:
    """In-memory sliding window rate limiter keyed by entity or client IP."""

    def __init__(self) -> None:
        self._records: Dict[str, List[float]] = defaultdict(list)

    def check(
        self,
        key: str,
        limit: int,
        window_seconds: float = 60.0,
    ) -> None:
        """
        Record a request and raise HTTP 429 if the request count within
        window_seconds exceeds the configured limit.
        """
        settings = get_settings()
        # In test environment, multiply limit by 20 to avoid tight loop timeouts in unit test suites
        effective_limit = limit * 20 if settings.ENVIRONMENT == "test" else limit

        now = time.time()
        timestamps = self._records[key]

        # Retain only timestamps within the active sliding window
        valid = [t for t in timestamps if now - t < window_seconds]
        self._records[key] = valid

        if len(valid) >= effective_limit:
            oldest = valid[0] if valid else now
            retry_after = max(1, int(window_seconds - (now - oldest)))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a moment before trying again.",
                headers={"Retry-After": str(retry_after)},
            )

        self._records[key].append(now)

    def reset(self) -> None:
        """Clear all in-memory rate limit records (for test isolation)."""
        self._records.clear()


limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP respecting X-Forwarded-For if behind a reverse proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

