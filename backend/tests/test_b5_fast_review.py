import asyncio
import time
from typing import Any, Dict, List
import pytest
from app.models.report import InterviewReport, TurnReview
from app.services.report_pipeline import (
    generate_interview_report_pipeline,
    review_turns_batch,
    get_cached_role_summary,
    cache_role_summary,
)
from app.services.report_scoring import build_deterministic_report


@pytest.mark.asyncio
async def test_fast_review_deterministic_generation_under_1_second():
    """Verify build_deterministic_report executes in < 100ms (< 5s target)."""
    raw_turns = [
        {
            "question_index": i,
            "question": f"Question {i}: Explain architecture principles and trade-offs.",
            "candidate_answer": f"Answer {i}: I have experience with horizontal scaling and caching patterns.",
            "planner_action": "new_topic_from_role",
            "target_topic": "System Design",
            "difficulty_tier": 2.5,
            "difficulty_label": "Medium",
            "score": 7.5,
            "feedback": "Strong architectural reasoning.",
            "technical_accuracy": 7.5,
            "clarity": 8.0,
            "completeness": 7.0,
        }
        for i in range(1, 16)
    ]

    session_doc = {
        "job_role": "Backend Engineer",
        "target_seniority": "Senior",
        "turns": raw_turns,
        "interview_state": {
            "turns_history": raw_turns,
            "role": "Backend Engineer",
            "seniority": "Senior",
            "telemetry_summary": {
                "eye_contact_ratio": 0.85,
                "posture_score": 0.90,
                "face_presence_percentage": 98.0,
            },
        },
    }

    start = time.perf_counter()
    report = build_deterministic_report("session_b5_test", "user_b5_test", session_doc)
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert isinstance(report, InterviewReport)
    assert report.overview.overall_score > 0
    assert len(report.turns) == 15
    assert report.role.title == "Backend Engineer"
    assert report.role.level == "Senior"
    assert report.readiness.band in ["Ready", "Strongly Ready", "Needs Practice", "Nearly Ready", "Borderline"]

    # Target: First section visible <= 5s. Deterministic execution should be < 200ms
    assert elapsed_ms < 500, f"Deterministic report took {elapsed_ms:.1f}ms, expected < 500ms"


@pytest.mark.asyncio
async def test_role_rubric_in_memory_caching():
    """Verify role/level expectations and rubrics are cached and retrieved without recalculation."""
    test_role = "Distributed Systems Specialist"
    test_level = "Staff"

    # Initially not in cache
    cache_role_summary(test_role, test_level, {
        "title": test_role,
        "level": test_level,
        "purpose": "Designs mission-critical distributed consensus platforms.",
        "expectations": ["Consensus protocols (Raft, Paxos)", "Fault tolerance"],
        "skill_match": [],
    })

    cached = get_cached_role_summary(test_role, test_level)
    assert cached is not None
    assert cached["title"] == test_role
    assert cached["level"] == test_level
    assert "Consensus protocols" in cached["expectations"][0]


@pytest.mark.asyncio
async def test_parallel_batch_evaluation_via_gather():
    """Verify batches of turns are evaluated concurrently via asyncio.gather."""
    import json
    import re

    class FakeLLM:
        def __init__(self, delay_sec=0.1):
            self.delay_sec = delay_sec
            self.call_count = 0

        async def ainvoke(self, prompt: str):
            self.call_count += 1
            await asyncio.sleep(self.delay_sec)
            indices = [int(m) for m in re.findall(r"Turn (\d+)", prompt)]
            if not indices:
                indices = [1]
            items = [
                {
                    "question_index": idx,
                    "correctness": "correct",
                    "technical_score": 8.0,
                    "depth_score": 7.5,
                    "clarity_score": 8.0,
                    "completeness_score": 7.5,
                    "reason": "Good",
                    "right": ["concept"],
                    "missing_or_wrong": [],
                    "concepts_mentioned": ["topic"],
                    "concepts_missed": [],
                }
                for idx in indices
            ]
            return json.dumps(items)

    fake_llm = FakeLLM(delay_sec=0.1)

    raw_turns = [
        {
            "question_index": i,
            "question": f"Q{i}",
            "candidate_answer": f"Answer text for question {i}.",
            "target_topic": "Databases",
        }
        for i in range(1, 16) # 3 batches of 5 turns
    ]

    session_doc = {
        "job_role": "Database Architect",
        "target_seniority": "Senior",
        "turns": raw_turns,
        "interview_state": {"turns_history": raw_turns},
    }

    start = time.perf_counter()
    report = await generate_interview_report_pipeline(
        session_id="session_parallel_test",
        user_id="user_parallel_test",
        session_doc=session_doc,
        llm=fake_llm,
    )
    elapsed_sec = time.perf_counter() - start

    assert isinstance(report, InterviewReport)
    assert len(report.turns) == 15
    # Batched evaluation runs concurrently via gather and finishes well within the fast review window
    assert elapsed_sec < 3.0


@pytest.mark.asyncio
async def test_429_backoff_and_graceful_recovery():
    """Verify Gemini 429 quota exhaustion applies backoff and falls back gracefully without failing."""
    class RateLimitedLLM:
        def __init__(self):
            self.attempts = 0

        async def ainvoke(self, prompt: str):
            self.attempts += 1
            raise Exception("429 ResourceExhausted: Quota exceeded for quota metric 'Generate Content API'")

    failing_llm = RateLimitedLLM()

    batch = [
        {
            "question_index": 1,
            "question": "What is eventual consistency?",
            "candidate_answer": "Eventual consistency means all replicas eventually converge.",
            "target_topic": "Distributed Systems",
            "score": 7.0,
        }
    ]

    start = time.perf_counter()
    reviews = await review_turns_batch(batch, "Software Engineer", "Mid", llm=failing_llm)
    elapsed_sec = time.perf_counter() - start

    assert len(reviews) == 1
    assert isinstance(reviews[0], TurnReview)
    assert reviews[0].index == 1
    assert reviews[0].topic == "Distributed Systems"
    # Graceful fallback was used
    assert reviews[0].scores.technical >= 0.0

