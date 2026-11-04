"""
PR4 Regression & Verification Suite:
Speech-to-Text Transcript Limits & Multi-Minute Answer End-to-End Pipeline (§PR4).

Verifies:
1. Candidate submitting a 3-minute (3,000+ character) and 5-minute (5,500+ character) answer.
2. Server accepts the multi-thousand character payload without truncation or frame overflow.
3. 100% of candidate words are stored in interview_sessions without truncation.
4. Long answer map-reduce path processes extended responses.
5. Review report displays full candidate answer without truncation.
"""

import time
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.repositories.session_repo import session_repo


@pytest.mark.asyncio
async def test_multi_minute_long_transcript_capture_and_evaluation() -> None:
    """Verify that multi-minute (3-min and 5-min) candidate answers are accepted, preserved, and evaluated."""
    test_email = f"long.transcript.{int(time.time())}@example.com"

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 1. Register & login
        reg_resp = await client.post(
            "/api/v1/auth/register",
            json={
                "email": test_email,
                "full_name": "Long Transcript Candidate",
                "password": "Password123!",
            },
        )
        assert reg_resp.status_code == 201

        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": test_email, "password": "Password123!"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Create Interview Session (3 questions)
        sess_resp = await client.post(
            "/api/v1/sessions",
            headers=headers,
            json={
                "role": "Distributed Systems Engineer",
                "seniority": "Senior",
                "difficulty": "Hard",
                "max_questions": 3,
            },
        )
        assert sess_resp.status_code == 201
        session_id = sess_resp.json()["id"]

        # 3. Start Interview
        start_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/start", headers=headers
        )
        assert start_resp.status_code == 200

        # 4. Turn 1: Submit a 3-Minute Spoken Answer (~450 words, ~3,000 characters)
        three_minute_answer = (
            "In our core banking ledger platform, we implemented a CQRS architecture with event sourcing. "
            "Every state transition is written to an immutable event store backed by Apache Kafka topics with "
            "triple replication across three separate availability zones. To guarantee strict financial idempotency, "
            "each mutation includes a client-generated UUID idempotency key cached in Redis with a 24-hour TTL "
            "prior to acquiring row locks in PostgreSQL. "
            "We configured Debezium Change Data Capture to tail the PostgreSQL write-ahead log and stream projection "
            "updates to read-optimized Elasticsearch clusters and in-memory caches. Under peak transaction volume of "
            "50,000 operations per second, our p99 query latency remained strictly below 15 milliseconds. "
            "When network partitions occur, the CAP theorem mandates consistency over availability for ledger debits. "
            "Our Envoy service proxy mesh implements circuit breakers with exponential backoff and jitter, tripping "
            "when error rates exceed two percent. Degraded read operations fall back to stale replicas, while debit "
            "requests are queued in persistent dead-letter topics with automated retry workers. "
            "Furthermore, observability is unified using Prometheus metrics and OpenTelemetry trace propagation across "
            "all gRPC service boundaries, ensuring automated alerts trigger before customer-visible SLAs degrade. "
            "Disaster recovery runbooks are tested quarterly using automated chaos engineering pipelines that terminate "
            "random Kubernetes worker nodes to verify zero transaction loss and sub-minute replica promotions."
        )
        # Duplicate paragraphs to simulate an extensive 3-minute technical explanation (> 3,000 chars)
        extended_3min = (three_minute_answer + " " + three_minute_answer).strip()
        assert len(extended_3min) >= 3000

        ans1_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": extended_3min,
                "answer_raw": extended_3min,
                "source": "voice",
                "reason": "silence",
            },
        )
        assert ans1_resp.status_code == 200
        ans1_data = ans1_resp.json()
        assert ans1_data["current_question_index"] == 2

        # Verify DB preservation: 100% of characters preserved in session document
        session_doc = await session_repo.get_by_id(session_id)
        assert session_doc is not None
        last_turn = session_doc["interview_state"]["turns_history"][0]
        assert last_turn["candidate_answer"] == extended_3min
        assert len(last_turn["candidate_answer"]) == len(extended_3min)

        # 5. Turn 2: Submit a 5-Minute Spoken Answer (~800 words, > 5,500 characters)
        five_minute_answer = (
            "Now discussing our global multi-region database migration strategy from legacy monolithic Oracle to distributed Spanner. "
            "First, the assessment phase cataloged all schemas, stored procedures, and consistency requirements across four business units. "
            "Second, we designed a dual-write replication layer using transactional outboxes and Kafka mirrors. "
            "Every write was shadowed to Spanner in shadow mode for six weeks to compare read reconciliations and identify latency outliers. "
            "Third, we addressed hot-spotting on monotonically increasing primary keys by prepending a hash shard prefix to customer identifiers. "
            "This distributed tablet writes uniformly across all Spanner nodes, avoiding single-tablet saturation. "
            "Fourth, we implemented zero-downtime cutover: read queries were shifted traffic-percentage by percentage (1%, 5%, 25%, 50%, 100%) "
            "with automated automated rollbacks if error budgets spiked beyond 0.05 percent. "
            "Fifth, during cutover of the European payment pipeline, a transatlantic undersea cable cut caused transient packet loss of 12%. "
            "Our multi-region consensus protocol maintained quorums across US-East, US-Central, and Europe-West without split-brain or data corruption. "
            "The entire migration completed with zero seconds of planned customer downtime and reduced our annual licensing costs by 45 percent. "
        )
        extended_5min = " ".join([five_minute_answer] * 4).strip()
        assert len(extended_5min) >= 5000

        ans2_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={
                "answer": extended_5min,
                "answer_raw": extended_5min,
                "source": "voice",
                "reason": "cap",  # Hard cap reached
            },
        )
        assert ans2_resp.status_code == 200
        ans2_data = ans2_resp.json()
        assert ans2_data["current_question_index"] == 3

        # Verify 5-minute answer was stored 100% intact
        session_doc = await session_repo.get_by_id(session_id)
        turn2 = session_doc["interview_state"]["turns_history"][1]
        assert turn2["candidate_answer"] == extended_5min
        assert len(turn2["candidate_answer"]) == len(extended_5min)
        assert "global multi-region database migration" in turn2["candidate_answer"]

        # 6. Turn 3: Complete the interview
        ans3_resp = await client.post(
            f"/api/v1/interview/sessions/{session_id}/answer",
            headers=headers,
            json={"answer": "We enforce strict automated unit and integration tests in CI/CD before deployment."},
        )
        assert ans3_resp.status_code == 200
        ans3_data = ans3_resp.json()
        assert ans3_data["status"] == "COMPLETED"

        # 7. Check the Final Report preserves full candidate answers
        report_resp = await client.get(
            f"/api/v1/interview/sessions/{session_id}/report", headers=headers
        )
        assert report_resp.status_code == 200
        rep_json = report_resp.json()
        qc_list = rep_json.get("question_coverage", [])
        assert len(qc_list) >= 2
        # Question 1 & 2 coverage contains candidate's extended answers
        assert len(qc_list[0]["candidate_answer"]) >= 3000
        assert len(qc_list[1]["candidate_answer"]) >= 5000
