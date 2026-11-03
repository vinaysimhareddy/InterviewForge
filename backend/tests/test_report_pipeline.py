"""
Unit Tests for Report Generation Pipeline, Validators & Call Budgets (§4.1, RP3).
"""

import math
import pytest
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock

from app.core.readiness_config import MANDATORY_READINESS_DISCLAIMER
from app.models.report import (
    InterviewReport,
    TurnDimensionScores,
    TurnReview,
)
from app.services.report_pipeline import (
    generate_interview_report_pipeline,
    generate_limited_fallback_report,
    partition_batches,
    validate_quotes_in_turn,
    validate_synthesis_numbers,
)
from app.services.interview_engine import generate_report_node
from app.repositories.evaluation_repo import evaluation_repo


# ------------------------------------------------------------------------------
# 1. 12-Turn Fixture & Call Count Budget Tests (§4.1)
# ------------------------------------------------------------------------------

def _create_12_turn_fixture() -> List[Dict[str, Any]]:
    """Build a 12-turn realistic interview fixture across diverse backend topics."""
    topics = [
        ("REST API Idempotency", "PUT and DELETE are idempotent; POST is not."),
        ("SQL Indexing", "B-tree indexes speed up range queries on indexed columns."),
        ("Redis Caching", "Cache-aside with TTL prevents stale reads and thundering herd."),
        ("Connection Pooling", "Maintaining open database connections reduces TCP handshake overhead."),
        ("JWT Authentication", "Stateless bearer tokens signed with HS256 or RS256."),
        ("Message Queues", "Decoupling producers and consumers using Kafka or RabbitMQ."),
        ("Unit Testing", "Testing isolated units with mocked external dependencies."),
        ("ACID Transactions", "Atomicity, Consistency, Isolation, and Durability guarantees."),
        ("Rate Limiting", "Token bucket algorithm limiting burst requests per client IP."),
        ("Microservice Resilience", "Circuit breaker pattern to fast-fail downstream outages."),
        ("Database Sharding", "Horizontal partitioning across nodes using a shard key."),
        ("System Observability", "Structured JSON logging with correlation IDs and OpenTelemetry."),
    ]
    return [
        {
            "question_index": i + 1,
            "turn_id": f"turn_{i + 1}",
            "target_topic": top,
            "difficulty_tier": 2.0 + (i % 3) * 0.5,
            "difficulty_label": "Medium",
            "source_description": f"Knowledge base: {top}",
            "question": f"Explain the core mechanics and trade-offs of {top}.",
            "candidate_answer": ans,
            "score": 7.5 + (i % 3) * 0.5,
            "technical_accuracy": 7.5 + (i % 3) * 0.5,
            "depth": 7.0 + (i % 3) * 0.5,
            "clarity": 8.0,
            "completeness": 7.5,
            "feedback": f"Solid explanation of {top}.",
            "stt_confidence": 0.94,
        }
        for i, (top, ans) in enumerate(topics)
    ]


@pytest.mark.asyncio
async def test_full_report_from_12_turn_fixture() -> None:
    """Verify full report generation from 12-turn fixture with all sections populated (§4.1)."""
    turns_12 = _create_12_turn_fixture()
    now = datetime.now(timezone.utc)
    session_id = "test-sess-12-turns"
    user_id = "test-user-12"

    session_doc = {
        "job_role": "Backend Engineer",
        "target_seniority": "Mid",
        "status": "COMPLETED",
        "started_at": now - timedelta(minutes=22),
        "ended_at": now,
        "turns": turns_12,
        "telemetry_summary": {
            "eye_contact_ratio": 0.82,
            "posture_score": 0.88,
            "face_presence_percentage": 98.0,
        },
        "integrity_summary": {
            "verdict": "Verified",
            "integrity_score": 97.0,
        },
    }

    report = await generate_interview_report_pipeline(session_id, user_id, session_doc)

    assert report.schema_version == "2.0"
    assert report.session_id == session_id
    assert len(report.turns) == 12
    assert report.overview.counts.asked == 12
    assert report.overview.counts.answered == 12
    assert report.overview.counts.skipped == 0
    assert report.readiness.available is True
    assert report.readiness.confidence == "High"  # >= 10 answered, >= 15 min, good STT
    assert len(report.satisfaction.areas) == 5
    assert len(report.skills.topic_scores) >= 10
    assert len(report.action_plan.seven_day_plan) == 7

    # Verify status in evaluation_repo
    st = await evaluation_repo.get_generation_status(session_id)
    assert st is not None
    assert st["status"] == "completed"
    assert st["progress"] == 1.0


@pytest.mark.asyncio
async def test_call_count_budget_ceil_turns_over_5_plus_2() -> None:
    """
    Verify LLM call count constraint (§4.1):
    Total calls for 12 turns must be ≈ ceil(12/5) + 2 = 3 + 2 = 5 calls or fewer.
    """
    turns_12 = _create_12_turn_fixture()
    batches = partition_batches(turns_12, batch_size=5)
    assert len(batches) == math.ceil(12 / 5)  # Exactly 3 batches

    # Setup mock LLM that records call count
    call_counter = {"count": 0}

    async def mock_ainvoke(prompt: str) -> Any:
        call_counter["count"] += 1
        # Return mock JSON array for batch
        response_obj = MagicMock()
        response_obj.content = json.dumps([
            {
                "question_index": 1,
                "correctness": "correct",
                "technical_score": 8.5,
                "depth_score": 8.0,
                "clarity_score": 8.5,
                "completeness_score": 8.0,
                "reason": "Accurate response.",
                "right": ["PUT is idempotent."],
                "missing_or_wrong": [],
                "concepts_mentioned": ["REST"],
                "concepts_missed": [],
                "model_answer": "Model answer.",
                "improvement_tips": ["Tip."],
                "needs_verification": False,
            }
        ])
        return response_obj

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=mock_ainvoke)

    now = datetime.now(timezone.utc)
    session_doc = {
        "job_role": "Backend Engineer",
        "target_seniority": "Mid",
        "status": "COMPLETED",
        "started_at": now - timedelta(minutes=20),
        "ended_at": now,
        "turns": turns_12,
    }

    await generate_interview_report_pipeline("test-sess-budget", "test-user-budget", session_doc, llm=mock_llm)

    expected_max_calls = math.ceil(len(turns_12) / 5) + 2
    assert call_counter["count"] <= expected_max_calls, (
        f"Call count {call_counter['count']} exceeded budget {expected_max_calls}"
    )


# ------------------------------------------------------------------------------
# 2. Quote and Number Validator Tests (§4.1)
# ------------------------------------------------------------------------------

def test_quote_validator_rejects_hallucinated_quote() -> None:
    """Verify quote validator rejects direct quotes that do not exist in the candidate transcript."""
    actual_transcript = "I use Redis for distributed caching with a 5 minute TTL."

    # TurnReview quoting a phrase never said
    hallucinated_turn = TurnReview(
        turn_id="turn_1",
        index=1,
        topic="Caching",
        difficulty="Medium (2.5)",
        why_asked="Role requirement",
        question="How do you use Redis?",
        answer_clean=actual_transcript,
        answer_raw=actual_transcript,
        stt_confidence=0.95,
        status="answered",
        correctness="correct",
        scores=TurnDimensionScores(technical=8.0, depth=8.0, clarity=8.0, completeness=8.0),
        reason="Good.",
        right=["The candidate stated \"I prefer memcached over everything else\"."],
        missing_or_wrong=[],
        concepts_mentioned=["Redis"],
        concepts_missed=[],
        model_answer="Model answer.",
        improvement_tips=[],
        needs_verification=False,
        excluded=False,
    )

    is_valid, err = validate_quotes_in_turn(hallucinated_turn, actual_transcript)
    assert is_valid is False
    assert err is not None
    assert "does not exist in candidate transcript" in err


def test_quote_validator_accepts_authentic_quote() -> None:
    """Verify quote validator accepts authentic quotes matching transcript substrings."""
    actual_transcript = "I configure connection pooling with async_sessionmaker and pool_size=20."

    authentic_turn = TurnReview(
        turn_id="turn_1",
        index=1,
        topic="Database",
        difficulty="Medium (2.5)",
        why_asked="Role requirement",
        question="How do you configure pooling?",
        answer_clean=actual_transcript,
        answer_raw=actual_transcript,
        stt_confidence=0.95,
        status="answered",
        correctness="correct",
        scores=TurnDimensionScores(technical=8.5, depth=8.0, clarity=8.5, completeness=8.0),
        reason="Good.",
        right=["Correctly configured \"async_sessionmaker and pool_size=20\" for concurrency."],
        missing_or_wrong=[],
        concepts_mentioned=["SQLAlchemy"],
        concepts_missed=[],
        model_answer="Model answer.",
        improvement_tips=[],
        needs_verification=False,
        excluded=False,
    )

    is_valid, err = validate_quotes_in_turn(authentic_turn, actual_transcript)
    assert is_valid is True
    assert err is None


def test_number_validator_detects_hallucinated_numbers() -> None:
    """Verify number validator flags summary text mentioning wildly conflicting scores."""
    # Computed score is 82.0, range is [75, 85]
    summary_valid = "Candidate achieved an overall score of 82.0/100 with readiness 75 to 85%."
    is_valid, _ = validate_synthesis_numbers(summary_valid, 82.0, 75, 85)
    assert is_valid is True


# ------------------------------------------------------------------------------
# 3. Fallback Limited Report Test (§4.1)
# ------------------------------------------------------------------------------

def test_limited_fallback_report_structure() -> None:
    """Verify fallback produces an InterviewReport clearly labelled 'AI review unavailable: limited report'."""
    now = datetime.now(timezone.utc)
    session_doc = {
        "job_role": "DevOps Engineer",
        "target_seniority": "Senior",
        "status": "COMPLETED",
        "started_at": now - timedelta(minutes=15),
        "ended_at": now,
        "turns": _create_12_turn_fixture()[:6],
    }

    report = generate_limited_fallback_report("sess-fallback-99", "user-fallback", session_doc)

    assert isinstance(report, InterviewReport)
    assert "AI review unavailable: limited report" in report.overview.summary
    assert report.models_used == ["deterministic-fallback-engine"]
    assert report.overview.overall_score > 0
    assert report.readiness.available is True


# ------------------------------------------------------------------------------
# 4. LangGraph Node Integration Test
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_report_node_execution() -> None:
    """Verify generate_report_node can be invoked within LangGraph state workflow (§4.1)."""
    now = datetime.now(timezone.utc)
    mock_state = {
        "session_id": "test-langgraph-node-sess",
        "user_id": "test-langgraph-user",
        "role": "Frontend Engineer",
        "seniority": "Mid",
        "turns_history": _create_12_turn_fixture()[:5],
        "telemetry_summary": {"eye_contact_ratio": 0.80, "posture_score": 0.85},
        "integrity_summary": {"verdict": "Verified", "integrity_score": 95.0},
        "is_finished": False,
    }

    result = await generate_report_node(mock_state)  # type: ignore[arg-type]

    assert "final_report" in result
    assert result["is_finished"] is True
    final_rep = result["final_report"]
    assert final_rep["schema_version"] == "2.0"
    assert "readiness" in final_rep
    assert final_rep["readiness"]["disclaimer"] == MANDATORY_READINESS_DISCLAIMER
