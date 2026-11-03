import uuid
from datetime import datetime, timezone
from httpx import ASGITransport, AsyncClient
import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.database import get_database
from app.core.security import create_access_token
from app.core.ws_ticket import create_ws_ticket, consume_ws_ticket, clear_ws_tickets
from app.main import app


@pytest.fixture
def client() -> TestClient:
    clear_ws_tickets()
    return TestClient(app)


async def setup_test_user_and_session(
    user_email: str,
    integrity_mode: str = "advisory",
) -> tuple[str, str, str]:
    """Helper to provision a test user and interview session directly in DB."""
    import asyncio
    db = await get_database()
    user_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    user_doc = {
        "_id": user_id,
        "id": user_id,
        "email": user_email.strip().lower(),
        "full_name": "Ticket Test Candidate",
        "hashed_password": "dummy_hash_argon2",
        "is_active": True,
        "is_email_verified": False,
        "failed_login_count": 0,
        "locked_until": None,
        "last_login_at": None,
        "settings": {},
        "created_at": now,
        "updated_at": now,
        "role": "candidate",
    }

    session_doc = {
        "_id": session_id,
        "id": session_id,
        "user_id": user_id,
        "job_role": "Backend Engineer",
        "target_seniority": "Senior",
        "integrity_mode": integrity_mode,
        "session_status": "created",
        "transcript": [],
        "video_telemetry_time_series": [],
        "created_at": now,
    }

    for attempt in range(4):
        try:
            await db["auth"].insert_one(user_doc)
            await db["interview_sessions"].insert_one(session_doc)
            break
        except Exception:
            if attempt == 3:
                raise
            await asyncio.sleep(1.0)

    token = create_access_token(subject=user_id)
    return user_id, session_id, token


@pytest.mark.asyncio
async def test_ws_ticket_issuance_and_connection(client: TestClient) -> None:
    """Verify endpoint issues ticket and connection succeeds with ticket."""
    user_id, session_id, token = await setup_test_user_and_session("ticket.user1@example.com")

    # 1. Request ticket via AsyncClient to preserve asyncio loop context
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http_client:
        resp = await http_client.post(
            "/api/v1/auth/ws-ticket",
            json={"session_id": session_id},
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 503:
            import asyncio
            await asyncio.sleep(1.0)
            resp = await http_client.post(
                "/api/v1/auth/ws-ticket",
                json={"session_id": session_id},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "ticket" in data
        assert data["expires_in"] == 30
        ticket = data["ticket"]

    # 2. Connect with ticket via TestClient WebSocket
    url = f"/api/v1/ws/interview/{session_id}?ticket={ticket}"
    with client.websocket_connect(url) as ws:
        ready = ws.receive_json()
        assert ready["type"] == "session_ready"
        assert ready["session_id"] == session_id


@pytest.mark.asyncio
async def test_ws_ticket_single_use_enforcement(client: TestClient) -> None:
    """Verify ticket cannot be reused once consumed."""
    user_id, session_id, token = await setup_test_user_and_session("ticket.user2@example.com")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http_client:
        resp = await http_client.post(
            "/api/v1/auth/ws-ticket",
            json={"session_id": session_id},
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 503:
            import asyncio
            await asyncio.sleep(1.0)
            resp = await http_client.post(
                "/api/v1/auth/ws-ticket",
                json={"session_id": session_id},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        ticket = resp.json()["ticket"]

    url = f"/api/v1/ws/interview/{session_id}?ticket={ticket}"

    # First connection consumes ticket
    with client.websocket_connect(url) as ws:
        ready = ws.receive_json()
        assert ready["type"] == "session_ready"

    # Second connection with same ticket must be rejected with 4008
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(url):
            pass
    assert exc_info.value.code == 4008


@pytest.mark.asyncio
async def test_ws_ticket_forbidden_for_other_user() -> None:
    """Verify that a user cannot request a ticket for another user's session."""
    _, session_a_id, _ = await setup_test_user_and_session("owner.a@example.com")
    _, _, token_b = await setup_test_user_and_session("intruder.b@example.com")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http_client:
        resp = await http_client.post(
            "/api/v1/auth/ws-ticket",
            json={"session_id": session_a_id},
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_ws_ticket_session_mismatch_rejected(client: TestClient) -> None:
    """Verify that a ticket issued for Session A cannot be used on Session B."""
    user_id, session_a_id, token = await setup_test_user_and_session("user.two.sessions@example.com")
    
    # Create second session for same user
    import asyncio
    db = await get_database()
    session_b_id = str(uuid.uuid4())
    session_b_doc = {
        "_id": session_b_id,
        "id": session_b_id,
        "user_id": user_id,
        "job_role": "Backend Engineer",
        "target_seniority": "Senior",
        "integrity_mode": "advisory",
        "session_status": "created",
        "transcript": [],
        "video_telemetry_time_series": [],
        "created_at": datetime.now(timezone.utc),
    }
    for attempt in range(4):
        try:
            await db["interview_sessions"].insert_one(session_b_doc)
            break
        except Exception:
            if attempt == 3:
                raise
            await asyncio.sleep(1.0)

    # Issue ticket for session A
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as http_client:
        resp = await http_client.post(
            "/api/v1/auth/ws-ticket",
            json={"session_id": session_a_id},
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 503:
            await asyncio.sleep(1.0)
            resp = await http_client.post(
                "/api/v1/auth/ws-ticket",
                json={"session_id": session_a_id},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        ticket_a = resp.json()["ticket"]

    # Try using ticket_a to connect to session B
    url = f"/api/v1/ws/interview/{session_b_id}?ticket={ticket_a}"
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(url):
            pass
    assert exc_info.value.code == 4008


def test_ws_ticket_invalid_ticket_rejected_4008(client: TestClient) -> None:
    """Verify completely bogus ticket is rejected with 4008."""
    fake_session_id = str(uuid.uuid4())
    url = f"/api/v1/ws/interview/{fake_session_id}?ticket=bogus_ticket_val"
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(url):
            pass
    assert exc_info.value.code == 4008

