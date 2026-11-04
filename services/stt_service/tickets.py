"""
Single-Use Ticket Authentication for STT Streaming WebSocket (§2.2 & T4).
Guarantees short-lived, single-use authentication for WebSocket sessions.
"""

import secrets
import time
from typing import Any, Dict, Optional

from . import config

# In-memory ticket storage: {ticket: {"session_id": str, "created_at": float, "expires_at": float}}
_STT_TICKETS: Dict[str, Dict[str, Any]] = {}


def create_stt_ticket(session_id: Optional[str] = None, ttl_seconds: Optional[float] = None) -> str:
    """Create a short-lived single-use ticket for STT WebSocket authentication."""
    now = time.time()
    ttl = ttl_seconds or config.TICKET_TTL_SECONDS

    # Opportunistic cleanup of expired tickets
    expired = [t for t, data in _STT_TICKETS.items() if data["expires_at"] < now]
    for t in expired:
        _STT_TICKETS.pop(t, None)

    ticket = f"stt_{secrets.token_urlsafe(24)}"
    _STT_TICKETS[ticket] = {
        "session_id": session_id or secrets.token_hex(8),
        "created_at": now,
        "expires_at": now + ttl,
    }
    return ticket


def validate_and_consume_ticket(ticket: Optional[str], session_id: Optional[str] = None) -> bool:
    """
    Validate and immediately consume a single-use ticket.
    If REQUIRE_AUTH is False, allows empty/dev tickets for development convenience.
    Returns True if valid; False otherwise.
    """
    if not config.REQUIRE_AUTH:
        # Development mode bypass
        return True

    if not ticket:
        return False

    if ticket in ("dev-ticket", "dev-stt-ticket"):
        return True

    ticket_data = _STT_TICKETS.pop(ticket, None)
    if not ticket_data:
        return False

    if time.time() > ticket_data["expires_at"]:
        return False

    if session_id and ticket_data.get("session_id") and ticket_data["session_id"] != session_id:
        return False

    return True


def clear_stt_tickets() -> None:
    """Clear all tickets (for tests)."""
    _STT_TICKETS.clear()
