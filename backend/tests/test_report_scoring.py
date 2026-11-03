"""
Unit & Integration Tests for Post-Interview Report Scoring & Readiness Engine (§4.5, §2, RP2).
"""

import pytest
from datetime import datetime, timezone, timedelta
from httpx import ASGITransport, AsyncClient

from app.core.readiness_config import (
    CALIBRATION_CURVES,
    CONFIDENCE_HALF_WIDTHS,
    INTEGRITY_MULTIPLIERS,
    MANDATORY_READINESS_DISCLAIMER,
    MIN_ANSWERED_QUESTIONS,
    MIN_DURATION_MINUTES,
    determine_advance_verdict,
    determine_confidence_level,
    determine_readiness_band,
    get_calibration_curve,
    interpolate_piecewise,
    round_to_nearest_five,
)
from app.models.report import (
    DimensionScores,
    InterviewReport,
    TurnDimensionScores,
    TurnReview,
)
from app.services.report_scoring import (
    build_deterministic_report,
    calculate_difficulty_weight,
    compute_dimension_scores,
    compute_overall_score,
    compute_readiness_estimate,
    compute_satisfaction_summary,
    compute_skills_analysis,
    recompute_report_after_exclusion,
)
from app.repositories.session_repo import session_repo
from app.repositories.evaluation_repo import evaluation_repo
from app.main import app


# ------------------------------------------------------------------------------
# 1. Readiness Formula & Monotonicity Tests (§4.5)
# ------------------------------------------------------------------------------

def test_rounding_to_nearest_five() -> None:
    """Verify numbers round cleanly to the nearest multiple of 5."""
    assert round_to_nearest_five(52.0) == 50
    assert round_to_nearest_five(53.0) == 55
    assert round_to_nearest_five(57.5) == 60
    assert round_to_nearest_five(80.0) == 80
    assert round_to_nearest_five(82.4) == 80
    assert round_to_nearest_five(82.5) == 80  # Banker's rounding or standard multiple of 5
    assert round_to_nearest_five(83.0) == 85


def test_monotonicity_piecewise_curve() -> None:
    """Verify calibration curve interpolation is strictly monotonic for all seniorities."""
    for seniority, curve in CALIBRATION_CURVES.items():
        prev_prob = -1.0
        # Test 100 quality steps from 0.0 to 1.0
        for step in range(101):
            quality = step / 100.0
            prob = interpolate_piecewise(quality, curve)
            assert prob >= prev_prob, (
                f"Monotonicity breach in {seniority} at quality {quality}: "
                f"{prob} < {prev_prob}"
            )
            assert 0.0 <= prob <= 100.0
            prev_prob = prob


def test_seniority_pass_bars() -> None:
    """
    Verify seniority bar hierarchy (§4.5):
    For identical quality (e.g. 0.70), Junior base probability > Mid > Senior > Staff.
    """
    test_qual = 0.70
    p_junior = interpolate_piecewise(test_qual, get_calibration_curve("junior"))
    p_mid = interpolate_piecewise(test_qual, get_calibration_curve("mid"))
    p_senior = interpolate_piecewise(test_qual, get_calibration_curve("senior"))
    p_staff = interpolate_piecewise(test_qual, get_calibration_curve("staff"))

    assert p_junior >= p_mid, f"Junior ({p_junior}) should be >= Mid ({p_mid})"
    assert p_mid >= p_senior, f"Mid ({p_mid}) should be >= Senior ({p_senior})"
    assert p_senior >= p_staff, f"Senior ({p_senior}) should be >= Staff ({p_staff})"


def test_confidence_range_widening() -> None:
    """Verify confidence level range half-widths expand when evidence is thinner (§4.5)."""
    assert CONFIDENCE_HALF_WIDTHS["High"] < CONFIDENCE_HALF_WIDTHS["Medium"]
    assert CONFIDENCE_HALF_WIDTHS["Medium"] < CONFIDENCE_HALF_WIDTHS["Low"]

    # 10 answered, 16 min, good STT -> High confidence (half-width 6)
    assert determine_confidence_level(10, 16.0, 0.92) == "High"
    # 6 answered, 10 min -> Medium confidence (half-width 10)
    assert determine_confidence_level(6, 10.0, 0.90) == "Medium"
    # 4 answered, 6 min -> Low confidence (half-width 15)
    assert determine_confidence_level(4, 6.0, 0.90) == "Low"


def test_thin_data_gating() -> None:
    """Verify available=False and zero range returned when answered < 4 or duration < 5 min (§2, §4.5)."""
    dim = DimensionScores(
        technical_accuracy=85.0,
        depth=80.0,
        communication=85.0,
        completeness=85.0,
        composure=90.0,
    )

    # 3 answers, 10 min -> Thin data (< 4 questions)
    thin_turns = [
        _create_mock_turn(i, 8.5) for i in range(1, 4)
    ]
    res_q = compute_readiness_estimate(
        dim=dim,
        turns=thin_turns,
        role="Backend Engineer",
        seniority="Mid",
        actual_duration_minutes=10.0,
    )
    assert res_q.available is False
    assert res_q.band == "Not enough data"
    assert res_q.range_low == 0
    assert res_q.range_high == 0
    assert "Fewer than 4" in (res_q.reason_if_unavailable or "") or "Evidence is too thin" in (res_q.reason_if_unavailable or "")

    # 5 answers, 3.5 min -> Thin data (< 5 min)
    five_turns = [_create_mock_turn(i, 8.0) for i in range(1, 6)]
    res_dur = compute_readiness_estimate(
        dim=dim,
        turns=five_turns,
        role="Backend Engineer",
        seniority="Mid",
        actual_duration_minutes=3.5,
    )
    assert res_dur.available is False
    assert res_dur.band == "Not enough data"
    assert res_dur.disclaimer == MANDATORY_READINESS_DISCLAIMER


def test_skip_penalty_reduces_readiness() -> None:
    """Verify skipping questions penalizes the readiness estimate (§4.5)."""
    dim = DimensionScores(
        technical_accuracy=75.0,
        depth=70.0,
        communication=75.0,
        completeness=70.0,
        composure=80.0,
    )

    # Case A: 8 questions answered, 0 skipped
    turns_clean = [_create_mock_turn(i, 7.5, status="answered") for i in range(1, 9)]
    res_a = compute_readiness_estimate(
        dim=dim,
        turns=turns_clean,
        role="Backend Engineer",
        seniority="Mid",
        actual_duration_minutes=12.0,
    )

    # Case B: 6 questions answered, 2 skipped
    turns_skipped = [
        _create_mock_turn(i, 7.5, status="answered") for i in range(1, 7)
    ] + [
        _create_mock_turn(7, 0.0, status="skipped"),
        _create_mock_turn(8, 0.0, status="skipped"),
    ]
    res_b = compute_readiness_estimate(
        dim=dim,
        turns=turns_skipped,
        role="Backend Engineer",
        seniority="Mid",
        actual_duration_minutes=12.0,
    )

    assert res_a.range_high >= res_b.range_high
    assert res_a.range_low >= res_b.range_low


def test_integrity_multiplier_hierarchy() -> None:
    """Verify integrity verdict multipliers: Verified > Warnings > Not verified (§4.5)."""
    assert INTEGRITY_MULTIPLIERS["Verified"] == 1.00
    assert INTEGRITY_MULTIPLIERS["Verified with warnings"] == 0.95
    assert INTEGRITY_MULTIPLIERS["Not verified"] == 0.85

    dim = DimensionScores(
        technical_accuracy=80.0,
        depth=80.0,
        communication=80.0,
        completeness=80.0,
        composure=80.0,
    )
    turns = [_create_mock_turn(i, 8.0) for i in range(1, 9)]

    res_verified = compute_readiness_estimate(
        dim=dim, turns=turns, role="Full Stack", seniority="Senior",
        actual_duration_minutes=15.0,
        integrity_summary={"verdict": "Verified"},
    )
    res_unverified = compute_readiness_estimate(
        dim=dim, turns=turns, role="Full Stack", seniority="Senior",
        actual_duration_minutes=15.0,
        integrity_summary={"verdict": "Not verified"},
    )

    assert res_verified.range_high >= res_unverified.range_high


def test_readiness_factor_table_and_disclaimer() -> None:
    """Verify factor table contents and mandatory transparency disclaimer."""
    dim = DimensionScores(
        technical_accuracy=82.0,
        depth=78.0,
        communication=80.0,
        completeness=75.0,
        composure=85.0,
    )
    turns = [_create_mock_turn(i, 8.0) for i in range(1, 9)]
    res = compute_readiness_estimate(
        dim=dim,
        turns=turns,
        role="Backend Engineer",
        seniority="Mid",
        actual_duration_minutes=16.0,
    )

    assert res.available is True
    assert res.disclaimer == MANDATORY_READINESS_DISCLAIMER
    assert len(res.factors) >= 5
    factor_names = [f.name for f in res.factors]
    assert "Technical Accuracy" in factor_names
    assert "Depth & Architectural Rigor" in factor_names
    assert "Communication Clarity" in factor_names
    assert len(res.raise_chances) >= 1


def test_cannot_judge_turn_excluded_from_dimension_scoring() -> None:
    """Verify cannot_judge turns are completely excluded from numeric averages."""
    turns = [
        _create_mock_turn(1, 9.0),
        _create_mock_turn(2, 9.0),
        _create_mock_turn(3, 1.0, correctness="cannot_judge"),  # Garbled/low STT
    ]
    dim = compute_dimension_scores(turns)
    # The 1.0 score must not drag down the average from 9.0 (90%)
    assert dim.technical_accuracy == 90.0


def test_turn_exclusion_recomputation() -> None:
    """Verify marking a turn as excluded recomputes all scores without that turn (§3.3)."""
    # 5 turns: 4 strong turns (8.0), 1 anomalous low turn (2.0)
    turns = [_create_mock_turn(i, 8.0) for i in range(1, 5)] + [
        _create_mock_turn(5, 2.0)
    ]
    sess_doc = {
        "job_role": "Backend Engineer",
        "target_seniority": "Mid",
        "turns": [
            {
                "question_index": t.index,
                "turn_id": t.turn_id,
                "target_topic": t.topic,
                "question": t.question,
                "candidate_answer": t.answer_clean,
                "difficulty_tier": 2.5,
                "difficulty_label": "Medium",
                "score": t.scores.technical,
                "technical_accuracy": t.scores.technical,
                "depth": t.scores.depth,
                "clarity": t.scores.clarity,
                "completeness": t.scores.completeness,
            }
            for t in turns
        ],
    }

    report = build_deterministic_report("sess-test-ex", "user-test", sess_doc)
    initial_score = report.overview.overall_score

    # Exclude turn 5
    recomputed = recompute_report_after_exclusion(report, "turn_5")
    assert recomputed.turns[4].excluded is True
    # Recomputed score should be higher without the 2.0 turn
    assert recomputed.overview.overall_score > initial_score


# ------------------------------------------------------------------------------
# 2. Security, Ownership Isolation, & No-Leak Invariant Tests (§0, §4.1)
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_leak_rule_before_session_completed() -> None:
    """Verify no report data can be retrieved or generated while session is active (HTTP 400)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Register and log in Alice
        email = f"alice.noleak.{int(datetime.now().timestamp())}@example.com"
        await ac.post(
            "/api/v1/auth/register",
            json={"email": email, "full_name": "Alice NoLeak", "password": "Password123!"},
        )
        login_res = await ac.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "Password123!"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create session
        sess_res = await ac.post(
            "/api/v1/sessions",
            headers=headers,
            json={"role": "Backend Engineer", "seniority": "Mid"},
        )
        session_id = sess_res.json()["id"]

        # 1. GET /sessions/{id}/report must fail with 400 while in-progress
        get_res = await ac.get(f"/api/v1/sessions/{session_id}/report", headers=headers)
        assert get_res.status_code == 400
        assert "still in progress" in get_res.json()["detail"]

        # 2. POST /sessions/{id}/report/generate must fail with 400 while in-progress
        post_res = await ac.post(f"/api/v1/sessions/{session_id}/report/generate", headers=headers)
        assert post_res.status_code == 400
        assert "still in progress" in post_res.json()["detail"]


@pytest.mark.asyncio
async def test_user_ownership_isolation_on_reports() -> None:
    """Verify User B cannot access User A's completed interview report (HTTP 404)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        ts = int(datetime.now().timestamp())
        # Register Owner (Alice) and Intruder (Bob)
        owner_email = f"alice.owner.{ts}@example.com"
        await ac.post(
            "/api/v1/auth/register",
            json={"email": owner_email, "full_name": "Alice Owner", "password": "Password123!"},
        )
        owner_login = await ac.post(
            "/api/v1/auth/login",
            json={"email": owner_email, "password": "Password123!"},
        )
        owner_token = owner_login.json()["access_token"]
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        intruder_email = f"bob.intruder.{ts}@example.com"
        await ac.post(
            "/api/v1/auth/register",
            json={"email": intruder_email, "full_name": "Bob Intruder", "password": "Password123!"},
        )
        intruder_login = await ac.post(
            "/api/v1/auth/login",
            json={"email": intruder_email, "password": "Password123!"},
        )
        intruder_token = intruder_login.json()["access_token"]
        intruder_headers = {"Authorization": f"Bearer {intruder_token}"}

        # Create session under Alice
        sess_res = await ac.post(
            "/api/v1/sessions",
            headers=owner_headers,
            json={"role": "Backend Engineer", "seniority": "Mid"},
        )
        session_id = sess_res.json()["id"]

        # Complete the session and populate turns
        now = datetime.now(timezone.utc)
        await session_repo.collection.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "status": "COMPLETED",
                    "session_status": "completed",
                    "started_at": now - timedelta(minutes=16),
                    "ended_at": now,
                    "turns": [_create_mock_turn_dict(i, 8.0) for i in range(1, 6)],
                    "interview_state": {"is_finished": True},
                }
            },
        )

        # Bob attempts to access Alice's report -> 404
        intruder_res = await ac.get(f"/api/v1/sessions/{session_id}/report", headers=intruder_headers)
        assert intruder_res.status_code == 404
        assert "not found" in intruder_res.json()["detail"].lower()

        # Alice accesses her own report -> 200
        owner_res = await ac.get(f"/api/v1/sessions/{session_id}/report", headers=owner_headers)
        assert owner_res.status_code == 200
        data = owner_res.json()
        assert data["schema_version"] == "2.0"
        assert data["session_id"] == session_id
        assert "readiness" in data
        assert data["readiness"]["available"] is True
        assert data["readiness"]["disclaimer"] == MANDATORY_READINESS_DISCLAIMER

        # Candidate lists all their reports -> GET /api/v1/sessions/reports
        reports_res = await ac.get("/api/v1/sessions/reports", headers=owner_headers)
        assert reports_res.status_code == 200
        reports_list = reports_res.json()
        assert isinstance(reports_list, list)
        assert any(r["session_id"] == session_id for r in reports_list)

        # Candidate records real-world outcome feedback -> POST /api/v1/sessions/{id}/outcome
        outcome_res = await ac.post(
            f"/api/v1/sessions/{session_id}/outcome",
            headers=owner_headers,
            json={"outcome": "offer", "notes": "Received L5 offer at Stripe"},
        )
        assert outcome_res.status_code == 200
        outcome_data = outcome_res.json()
        assert outcome_data["status"] == "success"
        assert outcome_data["outcome"] == "offer"

        # Verify outcome persisted in session doc
        updated_sess = await session_repo.get_by_id(session_id)
        assert updated_sess is not None
        assert "outcome_feedback" in updated_sess
        assert updated_sess["outcome_feedback"]["outcome"] == "offer"
        assert updated_sess["outcome_feedback"]["notes"] == "Received L5 offer at Stripe"



# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

def _create_mock_turn(
    index: int,
    score: float,
    status: str = "answered",
    correctness: str = "correct",
) -> TurnReview:
    return TurnReview(
        turn_id=f"turn_{index}",
        index=index,
        topic=f"Topic {index}",
        difficulty="Medium (2.5)",
        why_asked="Role knowledge base",
        question=f"Question {index}?",
        answer_clean="Clear candidate explanation covering architecture and trade-offs.",
        answer_raw="Clear candidate explanation covering architecture and trade-offs.",
        stt_confidence=0.92,
        status=status,  # type: ignore[arg-type]
        correctness=correctness,  # type: ignore[arg-type]
        scores=TurnDimensionScores(
            technical=score,
            depth=max(0.0, score - 0.5),
            clarity=score,
            completeness=score,
        ),
        reason="Demonstrated core competency.",
        right=["Accurate explanation."],
        missing_or_wrong=[],
        concepts_mentioned=[f"Topic {index}"],
        concepts_missed=[],
        model_answer="Model answer outline.",
        improvement_tips=["Tip 1"],
        needs_verification=False,
        excluded=False,
    )


def _create_mock_turn_dict(index: int, score: float) -> dict:
    return {
        "question_index": index,
        "turn_id": f"turn_{index}",
        "target_topic": f"Topic_{index}",
        "question": f"Question {index}?",
        "candidate_answer": "Detailed answer explaining principles and practical implementation.",
        "difficulty_tier": 2.5,
        "difficulty_label": "Medium",
        "score": score,
        "technical_accuracy": score,
        "depth": score,
        "clarity": score,
        "completeness": score,
        "feedback": "Strong answer.",
        "stt_confidence": 0.95,
    }
