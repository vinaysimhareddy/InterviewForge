import time
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.services.report_pipeline import generate_interview_report_pipeline


@pytest.mark.asyncio
async def test_session_reload_resumption_mid_interview() -> None:
    """Verify that candidate reloading/refreshing the page at question 2 resumes at Q2 without restarting."""
    test_email = f"reload.cand.{int(time.time())}.{uuid.uuid4().hex[:4]}@example.com"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 1. Register & login
        await client.post(
            "/api/v1/auth/register",
            json={"email": test_email, "full_name": "Reload Candidate", "password": "Password123!"},
        )
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": test_email, "password": "Password123!"},
        )
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Create session & start interview (Q1)
        sess_resp = await client.post(
            "/api/v1/sessions",
            headers=headers,
            json={"role": "Backend Engineer", "seniority": "Senior", "difficulty": "Adaptive", "max_questions": 3},
        )
        session_id = sess_resp.json()["id"]

        start_resp = await client.post(f"/api/v1/interview/sessions/{session_id}/start", headers=headers)
        assert start_resp.status_code == 200
        assert start_resp.json()["current_question_index"] == 1
        q1_text = start_resp.json()["next_question"]

        # 3. Submit answer to Q1 -> advances to Q2
        answer_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": "We used PostgreSQL with connection pooling and Redis for read caching to scale throughput.",
                "source": "voice",
            },
        )
        assert answer_resp.status_code == 200
        q2_data = answer_resp.json()
        assert q2_data["current_question_index"] == 2
        q2_text = q2_data["next_question"]
        assert q2_text != q1_text

        # 4. SIMULATE BROWSER RELOAD / DISCONNECT:
        # Candidate refreshes page mid-interview; frontend calls /start on active session
        reload_resp = await client.post(f"/api/v1/interview/sessions/{session_id}/start", headers=headers)
        assert reload_resp.status_code == 200
        reload_data = reload_resp.json()

        # Invariant: Resumes exactly at Question #2 without restarting or losing state
        assert reload_data["status"] == "IN_PROGRESS"
        assert reload_data["current_question_index"] == 2
        assert reload_data["next_question"] == q2_text
        assert reload_data["max_questions"] == 3


@pytest.mark.asyncio
async def test_session_reload_after_completion_returns_report() -> None:
    """Verify that calling /start after an interview is completed returns completed status and final report."""
    test_email = f"complete.cand.{int(time.time())}.{uuid.uuid4().hex[:4]}@example.com"
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # Register & login
        await client.post(
            "/api/v1/auth/register",
            json={"email": test_email, "full_name": "Completed Candidate", "password": "Password123!"},
        )
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": test_email, "password": "Password123!"},
        )
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create session and start
        sess_resp = await client.post(
            "/api/v1/sessions",
            headers=headers,
            json={"role": "Site Reliability Engineer", "seniority": "Staff", "max_questions": 1},
        )
        session_id = sess_resp.json()["id"]
        await client.post(f"/api/v1/interview/sessions/{session_id}/start", headers=headers)

        # End interview via /end
        end_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/end",
            headers=headers,
            json={"reason": "user_ended"},
        )
        assert end_resp.status_code == 200
        assert end_resp.json()["status"] == "COMPLETED"

        # Candidate returns to room or refreshes page -> calls /start
        resume_resp = await client.post(f"/api/v1/interview/sessions/{session_id}/start", headers=headers)
        assert resume_resp.status_code == 200
        resume_data = resume_resp.json()
        assert resume_data["status"] == "COMPLETED"
        assert resume_data["final_report"] is not None
        assert "overall_score" in resume_data["final_report"]


@pytest.mark.asyncio
async def test_safe_500_error_envelope_with_correlation_id() -> None:
    """Verify unhandled server exceptions return generic safe envelope with correlation ID and zero leaked traces."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # Patch internal logic to raise an unexpected exception
        with patch("app.api.v1.endpoints.auth.limiter.check", side_effect=RuntimeError("Secret internal failure details")):
            resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "nobody@example.com", "password": "Password123!"},
                headers={"X-Correlation-ID": "test-corr-456"},
            )
            assert resp.status_code == 500
            data = resp.json()
            assert data["code"] == "INTERNAL_ERROR"
            assert "Secret internal failure details" not in data["detail"]
            assert data["detail"] == "An unexpected error occurred while processing your request. Please try again shortly."
            assert data["correlation_id"] == "test-corr-456"
            assert resp.headers.get("X-Correlation-ID") == "test-corr-456"


@pytest.mark.asyncio
async def test_llm_failure_report_generation_fallback() -> None:
    """Verify report generation produces a valid limited fallback report when pipeline encounters upstream errors."""
    from app.services.report_pipeline import generate_limited_fallback_report

    session_doc = {
        "id": "mock-fail-session-123",
        "job_role": "Backend Engineer",
        "target_seniority": "Senior",
        "status": "COMPLETED",
        "turns": [
            {
                "question": "Explain consistency models in distributed data stores.",
                "candidate_answer": "Eventual consistency allows replicas to diverge temporarily before converging, whereas linearizability provides real-time recency guarantees.",
            }
        ],
        "integrity_score": 92.0,
    }

    # 1. Direct verification of limited fallback generator
    fallback_rep = generate_limited_fallback_report(
        session_id="mock-fail-session-123",
        user_id="user-fail-123",
        session_doc=session_doc,
    )
    assert fallback_rep.schema_version == "2.0"
    assert fallback_rep.session_id == "mock-fail-session-123"
    assert "deterministic-fallback-engine" in fallback_rep.models_used
    assert "[AI review unavailable: limited report]" in fallback_rep.overview.summary
    assert fallback_rep.overview.overall_score >= 0.0

    # 2. Pipeline exception capture verification
    with patch("app.services.report_pipeline.partition_batches", side_effect=RuntimeError("Upstream API quota exhausted")):
        pipe_rep = await generate_interview_report_pipeline(
            session_id="mock-fail-session-123",
            user_id="user-fail-123",
            session_doc=session_doc,
        )
        assert pipe_rep.schema_version == "2.0"
        assert "deterministic-fallback-engine" in pipe_rep.models_used
        assert "[AI review unavailable: limited report]" in pipe_rep.overview.summary
