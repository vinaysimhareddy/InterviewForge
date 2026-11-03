import secrets
import time
from typing import Any, Dict, Optional

# In-memory ticket storage: {ticket: {"user_id": str, "session_id": str, "expires_at": float}}
_WS_TICKETS: Dict[str, Dict[str, Any]] = {}


def create_ws_ticket(user_id: str, session_id: str, ttl_seconds: float = 30.0) -> str:
    """Create a short-lived single-use ticket for WebSocket authentication (§2.2)."""
    now = time.time()
    # Opportunistic cleanup of expired tickets
    expired = [t for t, data in _WS_TICKETS.items() if data["expires_at"] < now]
    for t in expired:
        _WS_TICKETS.pop(t, None)

    ticket = secrets.token_urlsafe(32)
    _WS_TICKETS[ticket] = {
        "user_id": str(user_id),
        "session_id": str(session_id),
        "expires_at": now + ttl_seconds,
    }
    return ticket


def consume_ws_ticket(ticket: str, session_id: str) -> Optional[str]:
    """
    Validate and consume a single-use ticket.
    Returns user_id if valid and session matches; otherwise None.
    Immediately deletes the ticket so it cannot be reused (§2.2).
    """
    if not ticket:
        return None

    ticket_data = _WS_TICKETS.pop(ticket, None)
    if not ticket_data:
        return None

    if time.time() > ticket_data["expires_at"]:
        return None

    if ticket_data["session_id"] != session_id:
        return None

    return str(ticket_data["user_id"])


def clear_ws_tickets() -> None:
    """Clear all tickets (utility for test teardown)."""
    _WS_TICKETS.clear()

