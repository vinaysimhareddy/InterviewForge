import time
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.models.report import InterviewReport
from app.services.report_pipeline import generate_interview_report_pipeline, generate_limited_fallback_report


@pytest.mark.asyncio
async def test_full_candidate_e2e_interview_lifecycle() -> None:
    """
    PR9: Full smoke test:
    1. Register -> 2. Login -> 3. Setup Session -> 4. Start (Q1) ->
    5. Turn 1 -> 6. Turn 2 -> 7. Turn 3 -> 8. End Session ->
    9. Async Report Generation -> 10. Report Status Polling ->
    11. Scorecard View Retrieval -> 12. Verification of Zero Banned Tokens.
    """
    timestamp = int(time.time())
    unique_suffix = uuid.uuid4().hex[:6]
    candidate_email = f"staff.architect.{timestamp}.{unique_suffix}@interviewforge.internal"
    candidate_name = "Alex Vance"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # Step 1: Register Candidate
        t0 = time.perf_counter()
        reg_resp = await client.post(
            "/api/v1/auth/register",
            json={
                "email": candidate_email,
                "full_name": candidate_name,
                "password": "SecurePassword123!",
            },
        )
        assert reg_resp.status_code == 201, f"Registration failed: {reg_resp.text}"
        user_data = reg_resp.json()
        assert user_data["email"] == candidate_email
        assert user_data["full_name"] == candidate_name
        assert "password" not in user_data
        assert "hashed_password" not in user_data

        # Step 2: Login Candidate
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": candidate_email, "password": "SecurePassword123!"},
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Step 3: Verify Profile via /auth/me
        me_resp = await client.get("/api/v1/auth/me", headers=headers)
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == candidate_email

        # Step 4: Create Adaptive Interview Session
        session_create_payload = {
            "role": "Distributed Systems Architect",
            "seniority": "Staff",
            "difficulty": "Adaptive",
            "max_questions": 3,
        }
        create_resp = await client.post("/api/v1/sessions", headers=headers, json=session_create_payload)
        assert create_resp.status_code == 201
        session_id = create_resp.json()["id"]
        assert session_id is not None

        # Step 5: Start Workflow (Generate Question #1)
        start_resp = await client.post(f"/api/v1/interview/sessions/{session_id}/start", headers=headers)
        assert start_resp.status_code == 200
        start_data = start_resp.json()
        assert start_data["status"] == "IN_PROGRESS"
        assert start_data["current_question_index"] == 1
        assert start_data["max_questions"] == 3
        q1_text = start_data["next_question"]
        assert q1_text and len(q1_text) > 10

        # Step 6: Candidate Turn 1 Answer
        turn1_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "In our event-driven microservices architecture, we adopted Apache Kafka for log-based message streaming "
                    "coupled with PostgreSQL as our transactional store. To guarantee linearizable consistency across services "
                    "without distributed two-phase commit overhead, we utilized the transactional outbox pattern with Debezium CDC "
                    "streaming events into Kafka topics partitioned by entity identifier."
                ),
                "source": "voice",
                "stt_confidence": 0.94,
            },
        )
        assert turn1_resp.status_code == 200
        t1_data = turn1_resp.json()
        assert t1_data["current_question_index"] == 2
        q2_text = t1_data["next_question"]
        assert q2_text and q2_text != q1_text

        # Step 7: Candidate Turn 2 Answer
        turn2_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "To mitigate hot partitions under high write load, we implemented compound partition keys with salted hashes "
                    "and asynchronous Redis buffer tiers with token-bucket rate limiting. For read-heavy paths, we provisioned "
                    "read-replicas fronted by Redis caches utilizing write-through cache invalidation protocols."
                ),
                "source": "voice",
                "stt_confidence": 0.92,
            },
        )
        assert turn2_resp.status_code == 200
        t2_data = turn2_resp.json()
        assert t2_data["current_question_index"] == 3
        q3_text = t2_data["next_question"]
        assert q3_text and q3_text != q2_text

        # Step 8: Candidate Turn 3 Answer (Final Question)
        turn3_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "For catastrophic multi-region failover, our data plane relies on CockroachDB distributed consensus "
                    "with Raft leases assigned locally to each availability zone. RTO was measured under 3 seconds and RPO was zero "
                    "during our quarterly chaotic network partition drills."
                ),
                "source": "voice",
                "stt_confidence": 0.96,
            },
        )
        assert turn3_resp.status_code == 200
        t3_data = turn3_resp.json()
        # Turn 3 reached maximum questions (3/3)
        assert t3_data["current_question_index"] >= 3

        # Step 9: End Interview Session
        end_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/end",
            headers=headers,
            json={"reason": "user_ended"},
        )
        assert end_resp.status_code == 200
        end_data = end_resp.json()
        assert end_data["status"] == "COMPLETED"

        # Step 10: Generate Interview Review Report
        gen_resp = await client.post(
            f"/api/v1/sessions/{session_id}/report/generate",
            headers=headers,
        )
        assert gen_resp.status_code == 200
        gen_report = gen_resp.json()
        assert gen_report["session_id"] == session_id
        assert gen_report["role"]["title"] == "Distributed Systems Architect"
        assert gen_report["role"]["level"] == "Staff"
        assert gen_report["overview"]["overall_score"] > 0
        assert len(gen_report["turns"]) == 3

        # Step 11: Poll Report Status
        status_resp = await client.get(f"/api/v1/sessions/{session_id}/report/status", headers=headers)
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["status"] == "completed"
        assert status_data["progress"] == 1.0

        # Step 12: Retrieve Detailed Scorecard
        scorecard_resp = await client.get(f"/api/v1/sessions/{session_id}/report", headers=headers)
        assert scorecard_resp.status_code == 200
        scorecard = scorecard_resp.json()
        assert scorecard["session_id"] == session_id
        assert scorecard["overview"]["verdict"] in ("Strong Hire", "Hire", "Leaning Hire", "No Hire")
        assert len(scorecard["action_plan"]["seven_day_plan"]) == 7
        assert len(scorecard["action_plan"]["priorities"]) >= 1

        # Step 13: Banned Technology & Vendor Name Hygiene Verification
        # Invariant: Scorecard and executive summaries must never leak vendor names or internal tokens
        banned_terms = ["gemini", "openai", "gpt-4", "claude", "anthropic", "langgraph", "langchain", "llama", "pydantic"]
        scorecard_dump = str(scorecard).lower()
        for banned in banned_terms:
            assert banned not in scorecard_dump, f"Banned terminology '{banned}' detected in scorecard payload!"

        total_sec = time.perf_counter() - t0
        assert total_sec > 0
        print(f"\n[E2E Session 1: Architect] Total elapsed: {total_sec:.2f}s, turns: 3, score: {gen_report['overview']['overall_score']}")


@pytest.mark.asyncio
async def test_full_candidate_e2e_frontend_engineer_lifecycle() -> None:
    """PR9 Run 2: Senior Frontend Engineer interview lifecycle end-to-end."""
    timestamp = int(time.time())
    unique_suffix = uuid.uuid4().hex[:6]
    candidate_email = f"senior.frontend.{timestamp}.{unique_suffix}@interviewforge.internal"
    candidate_name = "Sarah Connor"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        t0 = time.perf_counter()
        reg_resp = await client.post(
            "/api/v1/auth/register",
            json={
                "email": candidate_email,
                "full_name": candidate_name,
                "password": "FrontendPassword123!",
            },
        )
        assert reg_resp.status_code == 201

        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": candidate_email, "password": "FrontendPassword123!"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        create_resp = await client.post(
            "/api/v1/sessions",
            headers=headers,
            json={
                "role": "Senior Frontend Engineer",
                "seniority": "Senior",
                "difficulty": "Adaptive",
                "max_questions": 3,
            },
        )
        assert create_resp.status_code == 201
        session_id = create_resp.json()["id"]

        start_resp = await client.post(f"/api/v1/interview/sessions/{session_id}/start", headers=headers)
        assert start_resp.status_code == 200
        assert start_resp.json()["status"] == "IN_PROGRESS"

        # Turn 1
        t1_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "To optimize Largest Contentful Paint and Cumulative Layout Shift in our single-page application, "
                    "we implemented route-level code splitting using dynamic imports and preloaded critical web fonts with font-display swap. "
                    "We also strictly reserved aspect-ratio sizing on all dynamic hero assets to eliminate visual layout shifts."
                ),
                "source": "voice",
                "stt_confidence": 0.95,
            },
        )
        assert t1_resp.status_code == 200

        # Turn 2
        t2_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "For global state orchestration without unnecessary React re-renders, we migrated from monolithic Redux context "
                    "to atomic state primitives using Zustand with selector subscriptions. For heavy data grids, we implemented windowed virtualization "
                    "rendering only the DOM nodes visible within the current viewport."
                ),
                "source": "voice",
                "stt_confidence": 0.93,
            },
        )
        assert t2_resp.status_code == 200

        # Turn 3
        t3_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "Our testing strategy combines unit tests for pure domain utilities, component integration tests validating accessibility via ARIA roles, "
                    "and automated end-to-end visual regression suites verifying responsive layouts across multiple device viewports in CI."
                ),
                "source": "voice",
                "stt_confidence": 0.97,
            },
        )
        assert t3_resp.status_code == 200

        end_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/end",
            headers=headers,
            json={"reason": "user_ended"},
        )
        assert end_resp.status_code == 200

        # Generate report
        gen_resp = await client.post(f"/api/v1/sessions/{session_id}/report/generate", headers=headers)
        assert gen_resp.status_code == 200
        gen_report = gen_resp.json()
        assert gen_report["role"]["title"] == "Senior Frontend Engineer"
        assert gen_report["overview"]["overall_score"] > 0
        assert len(gen_report["turns"]) == 3

        # Scorecard
        scorecard_resp = await client.get(f"/api/v1/sessions/{session_id}/report", headers=headers)
        assert scorecard_resp.status_code == 200
        scorecard = scorecard_resp.json()
        assert scorecard["overview"]["verdict"] in ("Strong Hire", "Hire", "Leaning Hire", "No Hire")

        banned_terms = ["gemini", "openai", "gpt-4", "claude", "anthropic", "langgraph", "langchain", "llama", "pydantic"]
        scorecard_dump = str(scorecard).lower()
        for banned in banned_terms:
            assert banned not in scorecard_dump

        total_sec = time.perf_counter() - t0
        print(f"\n[E2E Session 2: Frontend] Total elapsed: {total_sec:.2f}s, turns: 3, score: {gen_report['overview']['overall_score']}")


@pytest.mark.asyncio
async def test_full_candidate_e2e_engineering_manager_lifecycle() -> None:
    """PR9 Run 3: Engineering Manager interview lifecycle end-to-end."""
    timestamp = int(time.time())
    unique_suffix = uuid.uuid4().hex[:6]
    candidate_email = f"eng.manager.{timestamp}.{unique_suffix}@interviewforge.internal"
    candidate_name = "Marcus Holloway"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        t0 = time.perf_counter()
        reg_resp = await client.post(
            "/api/v1/auth/register",
            json={
                "email": candidate_email,
                "full_name": candidate_name,
                "password": "ManagerPassword123!",
            },
        )
        assert reg_resp.status_code == 201

        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": candidate_email, "password": "ManagerPassword123!"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        create_resp = await client.post(
            "/api/v1/sessions",
            headers=headers,
            json={
                "role": "Engineering Manager",
                "seniority": "Lead",
                "difficulty": "Adaptive",
                "max_questions": 3,
            },
        )
        assert create_resp.status_code == 201
        session_id = create_resp.json()["id"]

        start_resp = await client.post(f"/api/v1/interview/sessions/{session_id}/start", headers=headers)
        assert start_resp.status_code == 200

        # Turn 1: Team scaling and alignment
        t1_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "When scaling engineering teams across distributed timezones, I establish transparent operating cadences "
                    "grounded in asynchronous RFC documents, explicit ownership charters, and blameless retrospectives. "
                    "I pair senior engineers as mentors to accelerate junior onboarding and preserve high technical velocity."
                ),
                "source": "voice",
                "stt_confidence": 0.96,
            },
        )
        assert t1_resp.status_code == 200

        # Turn 2: Conflict resolution & prioritization
        t2_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "When product deadlines conflict with critical technical debt remediation, I quantify the business risk "
                    "using customer-facing SLO burn rates and incident post-mortems. By framing technical health in terms of feature velocity and platform stability, "
                    "we consistently negotiate dedicated 20 percent engineering capacity in every quarterly sprint cycle."
                ),
                "source": "voice",
                "stt_confidence": 0.94,
            },
        )
        assert t2_resp.status_code == 200

        # Turn 3: Performance management
        t3_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": (
                    "My approach to performance management relies on continuous feedback loops rather than annual surprises. "
                    "In weekly 1-on-1s, we review clear growth competencies. When performance dips, we immediately co-design "
                    "a 30-day performance improvement milestone roadmap with measurable criteria and actionable weekly checkpoints."
                ),
                "source": "voice",
                "stt_confidence": 0.98,
            },
        )
        assert t3_resp.status_code == 200

        end_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/end",
            headers=headers,
            json={"reason": "user_ended"},
        )
        assert end_resp.status_code == 200

        # Generate report
        gen_resp = await client.post(f"/api/v1/sessions/{session_id}/report/generate", headers=headers)
        assert gen_resp.status_code == 200
        gen_report = gen_resp.json()
        assert gen_report["role"]["title"] == "Engineering Manager"
        assert gen_report["overview"]["overall_score"] > 0
        assert len(gen_report["turns"]) == 3

        # Scorecard
        scorecard_resp = await client.get(f"/api/v1/sessions/{session_id}/report", headers=headers)
        assert scorecard_resp.status_code == 200
        scorecard = scorecard_resp.json()
        assert scorecard["overview"]["verdict"] in ("Strong Hire", "Hire", "Leaning Hire", "No Hire")

        banned_terms = ["gemini", "openai", "gpt-4", "claude", "anthropic", "langgraph", "langchain", "llama", "pydantic"]
        scorecard_dump = str(scorecard).lower()
        for banned in banned_terms:
            assert banned not in scorecard_dump

        total_sec = time.perf_counter() - t0
        print(f"\n[E2E Session 3: Manager] Total elapsed: {total_sec:.2f}s, turns: 3, score: {gen_report['overview']['overall_score']}")


@pytest.mark.asyncio
async def test_llm_quota_429_degradation_resilience() -> None:
    """Verify that when upstream LLM returns 429 quota exhausted, system gracefully falls back to deterministic report."""
    mock_quota_llm = MagicMock()
    mock_quota_llm.ainvoke.side_effect = Exception("429 Resource has been exhausted (e.g. check quota)")

    session_doc = {
        "id": f"quota-test-{uuid.uuid4().hex[:8]}",
        "job_role": "Principal Software Engineer",
        "target_seniority": "Principal",
        "status": "COMPLETED",
        "turns": [
            {
                "question": "How do you lead cross-functional architecture reviews across multiple teams?",
                "candidate_answer": "We establish clear RFC review processes with defined service-level objectives and failure domain boundaries.",
            }
        ],
        "integrity_score": 97.0,
    }

    # Simulate pipeline hitting 429 quota exception
    with patch("app.services.report_pipeline.partition_batches", side_effect=Exception("429 Resource has been exhausted")):
        report = await generate_interview_report_pipeline(
            session_id=session_doc["id"],
            user_id="test-quota-user",
            session_doc=session_doc,
            llm=mock_quota_llm,
        )

        # Invariant: Must emit valid report with deterministic fallback, without 500 crash
        assert isinstance(report, InterviewReport)
        assert report.session_id == session_doc["id"]
        assert "deterministic-fallback-engine" in report.models_used
        assert "[AI review unavailable: limited report]" in report.overview.summary
        assert report.overview.overall_score >= 0.0
        assert report.role.title == "Principal Software Engineer"
        assert report.role.level == "Principal"
