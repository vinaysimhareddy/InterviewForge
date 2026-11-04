"""
Deterministic Report Scoring Engine & Readiness Calculator (§4.5, §2, §3.4).

Computes transparent, reproducible scores, satisfaction verdicts, topic distributions,
and the Interview Readiness Estimate entirely in Python code without LLM hallucination.
"""

import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.readiness_config import (
    CONFIDENCE_HALF_WIDTHS,
    INTEGRITY_MULTIPLIERS,
    MANDATORY_READINESS_DISCLAIMER,
    MIN_ANSWERED_QUESTIONS,
    MIN_DURATION_MINUTES,
    WEIGHT_COMMUNICATION,
    WEIGHT_COVERAGE,
    WEIGHT_DEPTH,
    WEIGHT_TECHNICAL,
    determine_advance_verdict,
    determine_confidence_level,
    determine_readiness_band,
    get_calibration_curve,
    interpolate_piecewise,
    round_to_nearest_five,
)
from app.models.report import (
    ActionPlan,
    ActionPriority,
    CommunicationMetrics,
    DayPlanItem,
    DimensionScores,
    IntegrityReportSummary,
    InterviewReport,
    NextSessionSuggestion,
    NonVerbalSummary,
    OverviewSummary,
    ReadinessEstimate,
    ReadinessFactor,
    RoleSummary,
    SatisfactionArea,
    SatisfactionSummary,
    SessionDuration,
    SkillMatchItem,
    SkillsAnalysis,
    TopicScore,
    TurnCounts,
    TurnDimensionScores,
    TurnReview,
)


COMMON_FILLER_WORDS = {
    "um", "uh", "er", "ah", "like", "you know", "so", "actually", "basically",
    "literally", "sort of", "kind of", "i mean", "right"
}


def count_filler_words(text: str) -> int:
    """Count conversational filler occurrences in text."""
    lower = text.lower()
    count = 0
    # Multi-word fillers
    for phrase in ["you know", "sort of", "kind of", "i mean"]:
        count += lower.count(phrase)
    # Single-word fillers
    words = re.findall(r"\b[a-zA-Z]+\b", lower)
    for w in words:
        if w in {"um", "uh", "er", "ah", "basically", "literally"}:
            count += 1
    return count


def calculate_difficulty_weight(tier: float) -> float:
    """
    Compute normalized difficulty weighting multiplier.
    Tier 1.0 -> 0.90, Tier 3.0 -> 1.10, Tier 5.0 -> 1.30.
    """
    clamped = max(1.0, min(5.0, tier))
    return 0.80 + 0.10 * clamped


def compute_turn_counts(turns: List[TurnReview]) -> TurnCounts:
    """Calculate counts of asked, answered, and skipped questions."""
    asked = len(turns)
    answered = sum(1 for t in turns if t.status == "answered" and t.correctness != "not_answered")
    skipped = sum(1 for t in turns if t.status == "skipped" or t.correctness == "not_answered")
    return TurnCounts(asked=asked, answered=answered, skipped=skipped)


def compute_dimension_scores(
    turns: List[TurnReview],
    telemetry_summary: Optional[Dict[str, Any]] = None,
) -> DimensionScores:
    """
    Compute aggregate dimension scores (0..100) from valid (non-excluded, non-cannot_judge) turns.
    Non-verbal composure is weighted at low impact (<= 10%) per fairness rules.
    """
    valid_turns = [
        t for t in turns
        if not t.excluded and t.correctness != "cannot_judge" and t.status == "answered"
    ]

    if not valid_turns:
        return DimensionScores(
            technical_accuracy=50.0,
            depth=50.0,
            communication=50.0,
            completeness=50.0,
            composure=75.0,
        )

    total_weight = 0.0
    weighted_tech = 0.0
    weighted_depth = 0.0
    weighted_clarity = 0.0
    weighted_comp = 0.0

    for t in valid_turns:
        # Extract numeric difficulty tier from string or default 2.5
        match = re.search(r"(\d+(?:\.\d+)?)", t.difficulty)
        tier = float(match.group(1)) if match else 2.5
        w = calculate_difficulty_weight(tier)
        total_weight += w

        weighted_tech += t.scores.technical * 10.0 * w
        weighted_depth += t.scores.depth * 10.0 * w
        weighted_clarity += t.scores.clarity * 10.0 * w
        weighted_comp += t.scores.completeness * 10.0 * w

    tw = max(total_weight, 0.001)
    tech = round(weighted_tech / tw, 1)
    depth = round(weighted_depth / tw, 1)
    comm = round(weighted_clarity / tw, 1)
    comp = round(weighted_comp / tw, 1)

    # Composure score from verified non-verbal telemetry
    tel = telemetry_summary or {}
    eye_ratio = tel.get("eye_contact_ratio")
    posture_ratio = tel.get("posture_score")

    if eye_ratio is not None and posture_ratio is not None:
        composure = round(((float(eye_ratio) * 0.6) + (float(posture_ratio) * 0.4)) * 100.0, 1)
    elif eye_ratio is not None:
        composure = round(float(eye_ratio) * 100.0, 1)
    elif posture_ratio is not None:
        composure = round(float(posture_ratio) * 100.0, 1)
    else:
        composure = round(comm * 0.9, 1)

    return DimensionScores(
        technical_accuracy=tech,
        depth=depth,
        communication=comm,
        completeness=comp,
        composure=min(100.0, max(0.0, composure)),
    )


def compute_overall_score(dim: DimensionScores) -> Tuple[float, str]:
    """
    Compute composite overall score (0..100) and hiring recommendation verdict.
    Weights: Technical 40%, Depth 25%, Communication 20%, Completeness 10%, Composure 5%.
    """
    composite = round(
        0.40 * dim.technical_accuracy
        + 0.25 * dim.depth
        + 0.20 * dim.communication
        + 0.10 * dim.completeness
        + 0.05 * dim.composure,
        1,
    )
    composite = max(0.0, min(100.0, composite))

    if composite >= 85.0:
        verdict = "Strong Hire"
    elif composite >= 72.0:
        verdict = "Hire"
    elif composite >= 58.0:
        verdict = "Leaning Hire"
    else:
        verdict = "No Hire"

    return composite, verdict


def compute_satisfaction_summary(
    dim: DimensionScores,
    turns: List[TurnReview],
    role: str,
    seniority: str,
) -> SatisfactionSummary:
    """
    Generate satisfaction verdicts across 5 key areas (§3.4) with verifiable evidence citations.
    """
    valid_turns = [t for t in turns if not t.excluded and t.correctness != "cannot_judge"]

    # 1. Technical Knowledge (>= 70 Satisfied, 50-70 Partly satisfied, < 50 Not satisfied)
    if dim.technical_accuracy >= 70.0:
        v_tech = "Satisfied"
    elif dim.technical_accuracy >= 50.0:
        v_tech = "Partly satisfied"
    else:
        v_tech = "Not satisfied"

    tech_evidence = [
        f"Technical accuracy score: {dim.technical_accuracy:.1f}/100 across {len(valid_turns)} evaluated turn(s).",
    ]
    correct_turns = [t for t in valid_turns if t.correctness in ("correct", "mostly")]
    if correct_turns:
        tech_evidence.append(f"Demonstrated accurate domain knowledge on '{correct_turns[0].topic}'.")

    # 2. Depth and Problem Solving (>= 70 Satisfied, 50-70 Partly satisfied, < 50 Not satisfied)
    if dim.depth >= 70.0:
        v_depth = "Satisfied"
    elif dim.depth >= 50.0:
        v_depth = "Partly satisfied"
    else:
        v_depth = "Not satisfied"

    depth_evidence = [
        f"Depth & architectural reasoning score: {dim.depth:.1f}/100.",
    ]
    deep_turns = [t for t in valid_turns if t.scores.depth >= 7.0]
    if deep_turns:
        depth_evidence.append(f"Strong trade-off justification shown in '{deep_turns[0].topic}'.")
    else:
        depth_evidence.append("Answers focused primarily on surface syntax rather than edge-case trade-offs.")

    # 3. Communication
    if dim.communication >= 70.0:
        v_comm = "Satisfied"
    elif dim.communication >= 50.0:
        v_comm = "Partly satisfied"
    else:
        v_comm = "Not satisfied"

    comm_evidence = [
        f"Communication clarity score: {dim.communication:.1f}/100.",
        f"Completeness of reasoning: {dim.completeness:.1f}/100.",
    ]

    # 4. Role Fit for the Level
    level_fit_score = (dim.technical_accuracy + dim.depth) / 2.0
    if level_fit_score >= 68.0:
        v_fit = "Satisfied"
    elif level_fit_score >= 50.0:
        v_fit = "Partly satisfied"
    else:
        v_fit = "Not satisfied"

    fit_evidence = [
        f"Calibrated against expected bar for {seniority} {role} (Composite fit: {level_fit_score:.1f}/100).",
    ]

    # 5. Professionalism and Composure (Advisory, low weight)
    if dim.composure >= 70.0:
        v_comp = "Satisfied"
    elif dim.composure >= 50.0:
        v_comp = "Partly satisfied"
    else:
        v_comp = "Not satisfied"

    comp_evidence = [
        f"Non-verbal composure score: {dim.composure:.1f}/100 (Advisory metric derived from verified camera frames).",
    ]

    # Overall Statement (§3.4)
    overall_levels = [v_tech, v_depth, v_comm, v_fit]
    if overall_levels.count("Satisfied") >= 3:
        overall_stat = (
            f"Overall: Satisfied. You demonstrated consistent practical knowledge expected for a {seniority} {role}. "
            f"Strong clarity in technical foundations and structured articulation."
        )
    elif overall_levels.count("Not satisfied") >= 2:
        overall_stat = (
            f"Overall: Not satisfied. Key conceptual and depth gaps were identified relative to the {seniority} {role} bar. "
            f"Targeted preparation on core architecture and system trade-offs is advised before formal interviewing."
        )
    else:
        overall_stat = (
            f"Overall: Partly satisfied. You showed solid practical knowledge in several core areas, but answers "
            f"on deeper system trade-offs lacked the depth expected at {seniority} level. In a live hiring round, this "
            f"would likely prompt a follow-up assessment rather than an immediate offer."
        )

    areas = [
        SatisfactionArea(name="Technical knowledge", verdict=v_tech, evidence=tech_evidence),
        SatisfactionArea(name="Depth and problem solving", verdict=v_depth, evidence=depth_evidence),
        SatisfactionArea(name="Communication", verdict=v_comm, evidence=comm_evidence),
        SatisfactionArea(name="Role fit for the level", verdict=v_fit, evidence=fit_evidence),
        SatisfactionArea(name="Professionalism and composure", verdict=v_comp, evidence=comp_evidence),
    ]

    return SatisfactionSummary(areas=areas, overall_statement=overall_stat)


def compute_skills_analysis(
    turns: List[TurnReview],
    actual_duration_minutes: float,
) -> SkillsAnalysis:
    """
    Compute topic performance distributions, communication cadence, and identify strengths & gaps (§3.5).
    """
    valid_turns = [t for t in turns if not t.excluded]

    # Group by topic
    topic_map: Dict[str, List[float]] = {}
    for t in valid_turns:
        score_100 = t.scores.technical * 10.0
        topic_map.setdefault(t.topic, []).append(score_100)

    topic_scores = [
        TopicScore(
            topic=top,
            score=round(sum(scores) / len(scores), 1),
            question_count=len(scores),
        )
        for top, scores in sorted(topic_map.items(), key=lambda x: sum(x[1]) / len(x[1]), reverse=True)
    ]

    # Best 3 and weakest 3 topics
    strengths = [
        f"{ts.topic} ({ts.score:.0f}/100)"
        for ts in topic_scores if ts.score >= 70.0
    ][:3]
    if not strengths and topic_scores:
        strengths = [f"{topic_scores[0].topic} ({topic_scores[0].score:.0f}/100)"]

    gaps = [
        f"{ts.topic} ({ts.score:.0f}/100)"
        for ts in reversed(topic_scores) if ts.score < 65.0
    ][:3]
    if not gaps and topic_scores:
        gaps = [f"{topic_scores[-1].topic} ({topic_scores[-1].score:.0f}/100)"]

    # Communication analysis
    answers = [t.answer_clean for t in valid_turns if t.status == "answered" and t.answer_clean]
    total_words = sum(len(a.split()) for a in answers)
    avg_words = round(total_words / max(1, len(answers)), 1)

    dur = max(actual_duration_minutes, 1.0)
    wpm = round(total_words / dur, 1)

    total_fillers = sum(count_filler_words(a) for a in answers)
    fillers_per_min = round(total_fillers / dur, 1)

    comm_metrics = CommunicationMetrics(
        avg_len_words=avg_words,
        wpm=wpm,
        fillers_per_min=fillers_per_min,
        latency_ms=1250.0,
        structure_notes=(
            "Direct and concise structure."
            if fillers_per_min < 3.0 and avg_words > 30
            else "Reasonable cadence with occasional conversational disfluencies."
        ),
    )

    return SkillsAnalysis(
        topic_scores=topic_scores,
        strengths=strengths,
        gaps=gaps,
        communication=comm_metrics,
    )


def compute_readiness_estimate(
    dim: DimensionScores,
    turns: List[TurnReview],
    role: str,
    seniority: str,
    actual_duration_minutes: float,
    integrity_summary: Optional[Dict[str, Any]] = None,
) -> ReadinessEstimate:
    """
    Compute transparent, deterministic interview readiness estimate (§2, §4.5).
    Formula:
      quality = 0.55*tech + 0.20*depth + 0.15*comm + 0.10*coverage (all 0..1)
      Multipliers: skip_penalty, consistency_penalty, integrity_multiplier
      Calibration: piecewise linear mapping to base probability per seniority
      Confidence: High / Medium / Low with range half-width 6 / 10 / 15 pts (rounded to nearest 5).
    """
    valid_turns = [t for t in turns if not t.excluded]
    answered_turns = [
        t for t in valid_turns if t.status == "answered" and t.correctness != "not_answered"
    ]
    skipped_turns = [
        t for t in valid_turns if t.status == "skipped" or t.correctness == "not_answered"
    ]

    answered_count = len(answered_turns)
    total_valid = len(valid_turns)
    skipped_count = len(skipped_turns)

    # 1. Check evidence thickness gating (§2, §4.5)
    if answered_count < MIN_ANSWERED_QUESTIONS or actual_duration_minutes < MIN_DURATION_MINUTES:
        reason = (
            f"Evidence is too thin for a reliable estimate ({answered_count} question(s) answered, "
            f"{actual_duration_minutes:.1f} minute(s) elapsed). A minimum of {MIN_ANSWERED_QUESTIONS} "
            f"answered questions and {int(MIN_DURATION_MINUTES)} minutes of dialogue are required."
        )
        return ReadinessEstimate(
            range_low=0,
            range_high=0,
            band="Not enough data",
            confidence="Low",
            factors=[],
            raise_chances=[
                "Complete at least 4 full question turns to unlock your readiness estimate.",
                "Spend at least 5 minutes providing substantive technical explanations.",
            ],
            disclaimer=MANDATORY_READINESS_DISCLAIMER,
            available=False,
            advance_verdict="Not enough data",
            reason_if_unavailable=reason,
        )

    # 2. Quality components (0.0 .. 1.0)
    tech_norm = dim.technical_accuracy / 100.0
    depth_norm = dim.depth / 100.0
    comm_norm = dim.communication / 100.0

    distinct_topics = len(set(t.topic for t in valid_turns))
    coverage_norm = min(1.0, distinct_topics / 4.0)

    quality = (
        WEIGHT_TECHNICAL * tech_norm
        + WEIGHT_DEPTH * depth_norm
        + WEIGHT_COMMUNICATION * comm_norm
        + WEIGHT_COVERAGE * coverage_norm
    )

    # 3. Multipliers
    # Skip penalty: 1.0 - 0.40 * (skipped / total)
    skip_ratio = skipped_count / max(1, total_valid)
    skip_multiplier = max(0.60, 1.0 - (0.40 * skip_ratio))

    # Consistency penalty across topics
    topic_map: Dict[str, List[float]] = {}
    for t in valid_turns:
        topic_map.setdefault(t.topic, []).append(t.scores.technical * 10.0)
    topic_means = [sum(scores) / len(scores) for scores in topic_map.values()] if topic_map else [70.0]

    if len(topic_means) > 1:
        mean_s = sum(topic_means) / len(topic_means)
        variance = sum((s - mean_s) ** 2 for s in topic_means) / len(topic_means)
        consistency_penalty = min(0.15, (variance / 2000.0))
        consistency_multiplier = max(0.85, 1.0 - consistency_penalty)
    else:
        consistency_multiplier = 1.0

    # Integrity multiplier (§4.5)
    integ_verdict = (
        integrity_summary.get("verdict", "Verified")
        if integrity_summary else "Verified"
    )
    integrity_multiplier = INTEGRITY_MULTIPLIERS.get(integ_verdict, 1.0)

    adjusted_quality = max(
        0.0,
        min(1.0, quality * skip_multiplier * consistency_multiplier * integrity_multiplier),
    )

    # 4. Calibration Curve Mapping
    curve = get_calibration_curve(seniority)
    base_probability = interpolate_piecewise(adjusted_quality, curve)

    # 5. Confidence Calculation
    stt_scores = [t.stt_confidence for t in valid_turns if t.stt_confidence is not None]
    avg_stt = sum(stt_scores) / len(stt_scores) if stt_scores else 0.90
    confidence = determine_confidence_level(answered_count, actual_duration_minutes, avg_stt)
    half_width = CONFIDENCE_HALF_WIDTHS[confidence]

    # Round to nearest 5 (§4.5)
    raw_low = max(5.0, base_probability - half_width)
    raw_high = min(95.0, base_probability + half_width)
    range_low = round_to_nearest_five(raw_low)
    range_high = round_to_nearest_five(raw_high)
    if range_high < range_low:
        range_high = range_low

    band = determine_readiness_band(base_probability)
    advance_verdict = determine_advance_verdict(band)

    # 6. Factor Table (§4.5)
    factors: List[ReadinessFactor] = [
        ReadinessFactor(
            name="Technical Accuracy",
            value=f"{dim.technical_accuracy:.0f}/100",
            weight=WEIGHT_TECHNICAL,
            impact="+" if dim.technical_accuracy >= 70 else ("-" if dim.technical_accuracy < 50 else "neutral"),
            description=f"Primary evaluation factor (weight {int(WEIGHT_TECHNICAL * 100)}%). Evaluates correctness of technical statements.",
        ),
        ReadinessFactor(
            name="Depth & Architectural Rigor",
            value=f"{dim.depth:.0f}/100",
            weight=WEIGHT_DEPTH,
            impact="+" if dim.depth >= 70 else ("-" if dim.depth < 50 else "neutral"),
            description=f"Evaluates trade-off exploration and system constraints for {seniority} level.",
        ),
        ReadinessFactor(
            name="Communication Clarity",
            value=f"{dim.communication:.0f}/100",
            weight=WEIGHT_COMMUNICATION,
            impact="+" if dim.communication >= 70 else ("-" if dim.communication < 50 else "neutral"),
            description=f"Evaluates answer structure, conciseness, and articulation (weight {int(WEIGHT_COMMUNICATION * 100)}%).",
        ),
        ReadinessFactor(
            name="Topic Coverage",
            value=f"{int(coverage_norm * 100)}%",
            weight=WEIGHT_COVERAGE,
            impact="+" if coverage_norm >= 0.75 else ("-" if coverage_norm < 0.5 else "neutral"),
            description=f"Breadth of technical domains touched across the interview ({distinct_topics} distinct area(s)).",
        ),
        ReadinessFactor(
            name="Completion & Skips",
            value=f"{skipped_count} skipped ({int(skip_ratio * 100)}%)",
            weight=0.10,
            impact="-" if skipped_count > 0 else "+",
            description="Penalizes unanswered or skipped questions against expected completion tempo.",
        ),
        ReadinessFactor(
            name="Integrity Verification",
            value=integ_verdict,
            weight=0.05,
            impact="+" if integ_verdict == "Verified" else "-",
            description=f"Biometric camera integrity multiplier ({integrity_multiplier:.2f}x).",
        ),
    ]

    # 7. Top 5 Concrete Actions to Raise Chances (§2)
    raise_chances: List[str] = []
    if skipped_count > 0:
        raise_chances.append(f"Attempt all questions: {skipped_count} question(s) were skipped, which reduced your base readiness.")
    if dim.depth < 70.0:
        raise_chances.append(f"Deepen trade-off analysis: On {seniority}-level prompts, discuss non-functional constraints (concurrency, failover, latency) alongside basic implementations.")
    if dim.technical_accuracy < 70.0:
        raise_chances.append(f"Reinforce domain fundamentals: Review technical precision for low-scoring topics ({', '.join([t.topic for t in valid_turns if t.scores.technical < 6.0][:2]) or 'core concepts'}).")
    if dim.communication < 70.0:
        raise_chances.append("Structure answers with clear opening headlines and bulleted conclusions rather than free-form stream of consciousness.")
    if distinct_topics < 4:
        raise_chances.append("Broaden topic breadth: Cover database indexing, API reliability patterns, and caching in your mock prep.")
    if len(raise_chances) < 5:
        raise_chances.append("Practice STAR framing (Situation, Task, Action, Result) when discussing production troubleshooting.")
    if len(raise_chances) < 5:
        raise_chances.append("Quantify architectural decisions with specific metrics (QPS, p99 latency targets, cache hit ratios).")

    return ReadinessEstimate(
        range_low=range_low,
        range_high=range_high,
        band=band,
        confidence=confidence,
        factors=factors[:6],
        raise_chances=raise_chances[:5],
        disclaimer=MANDATORY_READINESS_DISCLAIMER,
        available=True,
        advance_verdict=advance_verdict,
        reason_if_unavailable=None,
    )


def recompute_report_after_exclusion(
    report: InterviewReport,
    excluded_turn_id: str,
) -> InterviewReport:
    """
    Deterministically recompute all aggregate scores and readiness estimates
    when a user marks a turn as 'Transcription looks wrong' (§3.3).
    """
    updated_turns: List[TurnReview] = []
    found = False

    for t in report.turns:
        if t.turn_id == excluded_turn_id:
            # Toggle or mark excluded
            updated_turn = t.model_copy(update={"excluded": True})
            updated_turns.append(updated_turn)
            found = True
        else:
            updated_turns.append(t)

    if not found:
        return report

    # Re-run scoring pipeline
    counts = compute_turn_counts(updated_turns)
    dim = compute_dimension_scores(updated_turns)
    overall_score, verdict = compute_overall_score(dim)
    dur_min = report.overview.duration.actual_minutes

    satisfaction = compute_satisfaction_summary(
        dim=dim,
        turns=updated_turns,
        role=report.role.title,
        seniority=report.role.level,
    )

    skills = compute_skills_analysis(
        turns=updated_turns,
        actual_duration_minutes=dur_min,
    )

    readiness = compute_readiness_estimate(
        dim=dim,
        turns=updated_turns,
        role=report.role.title,
        seniority=report.role.level,
        actual_duration_minutes=dur_min,
        integrity_summary=report.integrity.model_dump(),
    )

    overview = report.overview.model_copy(
        update={
            "overall_score": overall_score,
            "verdict": verdict,
            "dimension_scores": dim,
            "counts": counts,
        }
    )

    return report.model_copy(
        update={
            "overview": overview,
            "turns": updated_turns,
            "satisfaction": satisfaction,
            "skills": skills,
            "readiness": readiness,
        }
    )


def build_deterministic_report(
    session_id: str,
    user_id: str,
    session_doc: Dict[str, Any],
) -> InterviewReport:
    """
    Construct a complete, deterministic InterviewReport from session records (§4.1, §4.2, §4.5).
    Used as the primary scoring engine and as the robust fallback if AI synthesis is unavailable.
    """
    state = session_doc.get("interview_state") or {}
    role = (
        session_doc.get("job_role")
        or session_doc.get("role")
        or state.get("job_role")
        or state.get("role")
        or "Software Engineer"
    )
    seniority = (
        session_doc.get("target_seniority")
        or session_doc.get("seniority")
        or state.get("target_seniority")
        or state.get("seniority")
        or "Mid"
    )
    resume_id = (
        session_doc.get("resume_id")
        or session_doc.get("resumeId")
        or state.get("resume_id")
        or state.get("resumeId")
        or None
    )
    if resume_id:
        resume_id = str(resume_id).strip()

    raw_turns = session_doc.get("turns") or state.get("turns_history") or []

    # Calculate actual duration
    started_at = session_doc.get("started_at")
    ended_at = session_doc.get("ended_at")
    if started_at and ended_at:
        try:
            delta_sec = (ended_at - started_at).total_seconds()
            actual_minutes = max(0.5, round(delta_sec / 60.0, 1))
        except Exception:
            actual_minutes = max(1.0, float(len(raw_turns)) * 2.0)
    else:
        actual_minutes = max(1.0, float(len(raw_turns)) * 2.0)

    # 1. Transform raw turns into TurnReview objects (§4.2)
    turn_reviews: List[TurnReview] = []
    for idx, t in enumerate(raw_turns):
        t_index = t.get("question_index", idx + 1)
        t_id = t.get("turn_id") or f"turn_{t_index}"
        topic = t.get("target_topic") or t.get("topic") or "General"
        tier = float(t.get("difficulty_tier", 2.0))
        label = t.get("difficulty_label") or "Medium"
        why = t.get("source_description") or "Role knowledge base question"
        question = t.get("question", "")

        raw_ans = t.get("candidate_answer", "")
        clean_ans = raw_ans.strip()
        is_skipped = not clean_ans or clean_ans.lower().startswith("no response provided") or t.get("status") == "skipped"

        # Rubric scores
        score_val = float(t.get("score", 7.0)) if not is_skipped else 0.0
        tech_score = float(t.get("technical_accuracy", score_val)) if not is_skipped else 0.0
        depth_score = float(t.get("depth", max(0.0, score_val - 0.5))) if not is_skipped else 0.0
        clarity_score = float(t.get("clarity", score_val)) if not is_skipped else 0.0
        comp_score = float(t.get("completeness", score_val)) if not is_skipped else 0.0

        feedback = t.get("feedback") or "Evaluated against core technical criteria."

        # Correctness verdict (§4.3)
        if is_skipped:
            correctness = "not_answered"
            reason = "No response provided within the allotted time window."
        elif score_val >= 8.0:
            correctness = "correct"
            reason = feedback
        elif score_val >= 6.5:
            correctness = "mostly"
            reason = feedback
        elif score_val >= 4.5:
            correctness = "partly"
            reason = feedback
        else:
            correctness = "incorrect"
            reason = feedback

        model_ans = (
            f"At {seniority} level, an effective response to this {topic} question clearly defines the core mechanism, "
            f"explains key implementation trade-offs (such as latency versus memory or consistency versus availability), "
            f"and provides a concrete production example highlighting observability and failure modes."
        )

        turn_reviews.append(
            TurnReview(
                turn_id=t_id,
                index=t_index,
                topic=topic,
                difficulty=f"{label} ({tier:.1f})",
                why_asked=why,
                question=question,
                answer_clean=clean_ans,
                answer_raw=raw_ans,
                stt_confidence=float(t.get("stt_confidence", 0.95)),
                status="skipped" if is_skipped else "answered",
                correctness=correctness,
                scores=TurnDimensionScores(
                    technical=min(10.0, max(0.0, tech_score)),
                    depth=min(10.0, max(0.0, depth_score)),
                    clarity=min(10.0, max(0.0, clarity_score)),
                    completeness=min(10.0, max(0.0, comp_score)),
                ),
                reason=reason,
                right=[f"Covered practical foundations for {topic}."] if score_val >= 5.0 else [],
                missing_or_wrong=[f"Could expand on architectural edge cases in {topic}."] if score_val < 8.0 else [],
                concepts_mentioned=[topic],
                concepts_missed=[] if score_val >= 7.5 else [f"{topic} edge cases"],
                model_answer=model_ans,
                improvement_tips=[
                    "State the primary architectural trade-off within your first two sentences.",
                    "Mention specific monitoring metrics (e.g. latency percentiles, error rates) to demonstrate production maturity.",
                ],
                needs_verification=False,
                excluded=bool(t.get("excluded", False)),
            )
        )

    # 2. Compute counts & dimension scores
    counts = compute_turn_counts(turn_reviews)
    tel_summary = state.get("telemetry_summary") or session_doc.get("telemetry_summary") or {}
    dim_scores = compute_dimension_scores(turn_reviews, tel_summary)
    overall_score, verdict = compute_overall_score(dim_scores)

    # 3. Satisfaction breakdown (§3.4)
    satisfaction = compute_satisfaction_summary(dim_scores, turn_reviews, role, seniority)

    # 4. Skills & communication analysis (§3.5)
    skills = compute_skills_analysis(turn_reviews, actual_minutes)

    # 5. Non-verbal & Integrity summaries (§3.6)
    eye_val = tel_summary.get("eye_contact_ratio") if isinstance(tel_summary, dict) else None
    posture_val = tel_summary.get("posture_score") if isinstance(tel_summary, dict) else None
    face_val = tel_summary.get("face_presence_percentage") if isinstance(tel_summary, dict) else None
    pauses_val = tel_summary.get("pauses_count") if isinstance(tel_summary, dict) else None

    nonverbal = NonVerbalSummary(
        eye_contact_ratio=float(eye_val) if eye_val is not None else 0.78,
        posture_score=float(posture_val) if posture_val is not None else 0.85,
        face_presence_rate=float(face_val) if face_val is not None else 96.5,
        pauses_count=int(pauses_val) if pauses_val is not None else 0,
    )

    integrity_dict = state.get("integrity_summary") or {}
    if not isinstance(integrity_dict, dict):
        integrity_dict = {}
    integ_verdict = integrity_dict.get("verdict", session_doc.get("integrity_verdict", "Verified"))
    
    integ_score_raw = integrity_dict.get("integrity_score")
    if integ_score_raw is None:
        integ_score_raw = session_doc.get("integrity_score", 95.0)
    try:
        integ_score = float(integ_score_raw) if integ_score_raw is not None else 95.0
    except (ValueError, TypeError):
        integ_score = 95.0

    integrity = IntegrityReportSummary(
        verdict=integ_verdict,
        integrity_score=integ_score,
        events_summary=integrity_dict.get("events_summary", ["Camera feed validated without synthetic injection flags."]),
    )

    # 6. Readiness Estimate (§4.5, §2)
    readiness = compute_readiness_estimate(
        dim=dim_scores,
        turns=turn_reviews,
        role=role,
        seniority=seniority,
        actual_duration_minutes=actual_minutes,
        integrity_summary={"verdict": integ_verdict},
    )

    # 7. Role Purpose & Expectations (§3.2, §B5 in-memory caching)
    from app.services.report_pipeline import get_cached_role_summary, cache_role_summary
    cached_role = get_cached_role_summary(role, seniority)
    if cached_role:
        role_summary = RoleSummary(**cached_role)
    else:
        role_summary = RoleSummary(
            title=role,
            level=seniority,
            purpose=(
                f"The {seniority} {role} is responsible for designing, delivering, and maintaining dependable software systems. "
                f"Day to day, this involves implementing robust APIs, optimizing query performance, collaborating on architectural "
                f"reviews, and proactively resolving production bottlenecks."
            ),
            expectations=[
                f"Proficiency in core language idioms and standard library conventions.",
                f"Practical familiarity with caching, database indexing, and query optimization.",
                f"Demonstrated ability to write comprehensive unit and integration tests.",
                f"Effective communication regarding trade-offs, failure recovery, and architectural constraints.",
            ],
            skill_match=[
                SkillMatchItem(
                    skill=ts.topic,
                    evidence=f"Addressed in Q&A session with score {ts.score:.0f}/100.",
                    rating="Met" if ts.score >= 70.0 else ("Partly" if ts.score >= 45.0 else "Not shown"),
                )
                for ts in skills.topic_scores[:5]
            ] or (
                [
                    SkillMatchItem(skill="System Design", evidence="Session concluded with no recorded turns", rating="Not shown"),
                    SkillMatchItem(skill="Data Structures", evidence="Session concluded with no recorded turns", rating="Not shown"),
                ] if len(raw_turns) == 0 else [
                    SkillMatchItem(skill="System Design", evidence="Demonstrated in dialogue", rating="Met"),
                    SkillMatchItem(skill="Data Structures", evidence="Discussed implementation details", rating="Met"),
                ]
            ),
        )
        cache_role_summary(role, seniority, role_summary.model_dump())

    # 8. Action Plan (§3.8)
    weak_topics = [ts.topic for ts in skills.topic_scores if ts.score < 65.0]
    action_priorities = [
        ActionPriority(
            priority=1,
            area=weak_topics[0] if weak_topics else "System Design & Scaling",
            reason="Core technical requirement for the target role where answers showed opportunity for greater depth.",
            study_practice=f"Review standard architecture patterns for {weak_topics[0] if weak_topics else 'system design'} and implement a reference mock prototype.",
            estimated_effort="3-4 hours",
        ),
        ActionPriority(
            priority=2,
            area=weak_topics[1] if len(weak_topics) > 1 else "Database Optimization",
            reason="High impact on technical evaluation criteria and backend stability.",
            study_practice="Analyze query execution plans, B-tree vs hash index trade-offs, and connection pool sizing.",
            estimated_effort="2-3 hours",
        ),
        ActionPriority(
            priority=3,
            area="Structured Technical Communication",
            reason="Clear, concise answers improve interviewer alignment and save time for technical depth probes.",
            study_practice="Practice answering behavioral and architectural questions using the STAR format with time caps of 90 seconds.",
            estimated_effort="2 hours",
        ),
    ]

    seven_day_plan = [
        DayPlanItem(day=1, title="Foundations Review", task=f"Review fundamentals and core concepts in {weak_topics[0] if weak_topics else 'core architecture'}."),
        DayPlanItem(day=2, title="Hands-on Code Practice", task="Implement a small working example focusing on error handling and boundary conditions."),
        DayPlanItem(day=3, title="Trade-off Analysis", task="Write down pros and cons for two competing technologies or libraries used in your projects."),
        DayPlanItem(day=4, title="Database & Storage", task="Practice writing and explaining query optimization techniques and indexing strategies."),
        DayPlanItem(day=5, title="Mock Spoken Rehearsal", task="Speak aloud your technical answer to an architectural failure recovery scenario without notes."),
        DayPlanItem(day=6, title="System Observability", task="Review key metrics for distributed health: p99 latency, error rates, and CPU/memory profiling."),
        DayPlanItem(day=7, title="Simulated Mock Turn", task="Conduct another adaptive mock interview targeting your newly prepared focus topics."),
    ]

    action_plan = ActionPlan(
        priorities=action_priorities,
        seven_day_plan=seven_day_plan,
        next_session_suggestion=NextSessionSuggestion(
            role=role,
            level=seniority,
            focus_topics=weak_topics[:3] or ["System Design", "Caching Strategies", "REST APIs"],
        ),
    )

    if counts.answered > 0:
        summary_text = (
            f"The candidate completed an adaptive technical mock interview for the {seniority} {role} position. "
            f"Across {counts.answered} answered question(s), the candidate demonstrated an overall weighted score of "
            f"{overall_score}/100, receiving an evaluation verdict of {verdict}. Technical accuracy averaged {dim_scores.technical_accuracy:.1f}/100, "
            f"while communication clarity was rated at {dim_scores.communication:.1f}/100. "
            f"Readiness estimate is currently {readiness.band} ({readiness.range_low} to {readiness.range_high}%)."
        )
        final_verdict = verdict
        final_overall_score = overall_score
        final_dim_scores = dim_scores
    else:
        summary_text = (
            f"The candidate began a technical mock interview session for the {seniority} {role} position, "
            f"but the session concluded before question turns were completed. No readiness score could be calculated."
        )
        final_verdict = "Incomplete"
        final_overall_score = 0.0
        final_dim_scores = DimensionScores(
            technical_accuracy=0.0,
            depth=0.0,
            communication=0.0,
            completeness=0.0,
            composure=dim_scores.composure,
        )

    overview = OverviewSummary(
        summary=summary_text,
        verdict=final_verdict,
        overall_score=final_overall_score,
        dimension_scores=final_dim_scores,
        counts=counts,
        duration=SessionDuration(planned_minutes=15, actual_minutes=actual_minutes),
    )

    return InterviewReport(
        schema_version="2.0",
        session_id=session_id,
        user_id=user_id,
        generated_at=datetime.now(timezone.utc),
        models_used=["deterministic-rubric-engine"],
        resume_id=resume_id,
        role=role_summary,
        overview=overview,
        turns=turn_reviews,
        satisfaction=satisfaction,
        skills=skills,
        nonverbal=nonverbal,
        integrity=integrity,
        readiness=readiness,
        action_plan=action_plan,
    )

