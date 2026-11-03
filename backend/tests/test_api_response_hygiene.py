import json
import uuid
from datetime import datetime, timezone
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.interview import (
    DifficultyProgressionPoint,
    FinalReport,
    InterviewStepResponse,
    QuestionCoverageItem,
    QuestionEvaluation,
    CategoryScores,
)
from app.models.report import InterviewReport
from app.services.report_scoring import build_deterministic_report
from app.services.report_pipeline import generate_limited_fallback_report


BANNED_API_TOKENS = [
    "gemini",
    "openai",
    "gpt-",
    "gpt4",
    "langgraph",
    "langchain",
    "nemotron",
    "mediapipe",
    "mongodb",
    "fastapi",
    "argon2",
]


def assert_no_banned_terms(data: any, path: str = "root") -> None:
    """Recursively inspect objects, dicts, lists, and strings for banned technology or vendor names."""
    if isinstance(data, dict):
        for k, v in data.items():
            assert_no_banned_terms(k, f"{path}.key({k})")
            assert_no_banned_terms(v, f"{path}.{k}")
    elif isinstance(data, list):
        for idx, item in enumerate(data):
            assert_no_banned_terms(item, f"{path}[{idx}]")
    elif isinstance(data, str):
        lower = data.lower()
        for banned in BANNED_API_TOKENS:
            assert banned not in lower, (
                f"Hygiene violation at '{path}': Found banned term '{banned}' in string: {data!r}"
            )


def test_interview_report_hygiene():
    """Verify InterviewReport serialization contains zero vendor or model names."""
    session_id = f"sess-{uuid.uuid4().hex[:8]}"
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)

    session_doc = {
        "_id": session_id,
        "id": session_id,
        "user_id": user_id,
        "role": "Frontend Engineer",
        "seniority": "Senior",
        "duration_minutes": 20,
        "status": "COMPLETED",
        "started_at": now,
        "ended_at": now,
        "turns": [
            {
                "turn_id": "t-1",
                "question": "Explain virtual DOM reconciliation in React.",
                "candidate_answer": "React uses a fiber architecture to diff trees and schedule updates efficiently.",
                "status": "answered",
                "difficulty_tier": 3.0,
                "difficulty_label": "Senior",
                "topic": "React Architecture",
            }
        ],
    }

    report = build_deterministic_report(session_id, user_id, session_doc)
    serialized = json.loads(report.model_dump_json())
    assert_no_banned_terms(serialized)

    # Also test limited fallback report
    fallback_report = generate_limited_fallback_report(session_id, user_id, session_doc)
    fallback_serialized = json.loads(fallback_report.model_dump_json())
    assert_no_banned_terms(fallback_serialized)


def test_interview_step_response_hygiene():
    """Verify InterviewStepResponse contains zero vendor or model names."""
    step = InterviewStepResponse(
        session_id="sess-hygiene-test",
        status="in_progress",
        current_question_index=2,
        max_questions=5,
        evaluation=QuestionEvaluation(
            score=8.5,
            technical_accuracy=9.0,
            clarity=8.0,
            completeness=8.5,
            feedback="Strong structural explanation with trade-offs.",
            encouragement="Good pacing and tone.",
        ),
        next_question="How would you optimize asset loading with code splitting?",
        difficulty="Senior",
        difficulty_change="UNCHANGED",
        current_action="probe_depth",
        question_sources=[
            {"source": "resume", "title": "Performance Optimization", "snippet": "Webpack bundle splitting"}
        ],
    )
    serialized = json.loads(step.model_dump_json())
    assert_no_banned_terms(serialized)


@pytest.mark.asyncio
async def test_auth_me_error_hygiene():
    """Verify 401 unauthenticated response returns generic user-safe error without traces or headers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401
        data = res.json()
        assert_no_banned_terms(data)
        assert "detail" in data
        assert data.get("code") == "AUTH_REQUIRED"


@pytest.mark.asyncio
async def test_session_not_found_hygiene():
    """Verify 404 response does not leak internal DB info or collection names."""
    from app.api.deps import get_current_user
    from app.models.user import UserInDB

    mock_user = UserInDB(
        _id="test-uid",
        id="test-uid",
        email="test@example.com",
        full_name="Candidate",
        hashed_password="pw",
        role="candidate",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    app.dependency_overrides[get_current_user] = lambda: mock_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/sessions/non-existent-session-id")
            assert res.status_code == 404
            data = res.json()
            assert_no_banned_terms(data)
            assert data.get("code") == "NOT_FOUND"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
