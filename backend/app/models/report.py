"""
Pydantic v2 Models for Post-Interview Detailed Summary, Answer Review & Readiness Estimate (§4.2).
Versioned schema (schema_version: '2.0').
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


SkillRating = Literal["Met", "Partly", "Not shown"]
TurnStatus = Literal["answered", "skipped"]
CorrectnessVerdict = Literal[
    "correct", "mostly", "partly", "incorrect", "not_answered", "cannot_judge"
]
SatisfactionVerdict = Literal["Satisfied", "Partly satisfied", "Not satisfied"]
ConfidenceLevel = Literal["Low", "Medium", "High"]
FactorImpact = Literal["+", "-", "neutral"]


class SkillMatchItem(BaseModel):
    """Evaluation of an expected role skill against candidate transcript and resume evidence."""
    skill: str = Field(..., description="Expected core skill for this role and seniority level")
    evidence: str = Field(..., description="Verbatim or summarized evidence from transcript or resume")
    rating: SkillRating = Field(..., description="Met | Partly | Not shown")


class RoleSummary(BaseModel):
    """Explanation of role purpose and expectations (§3.2)."""
    title: str = Field(..., description="Target role name (e.g. Backend Engineer)")
    level: str = Field(..., description="Target seniority (Junior, Mid, Senior, Staff)")
    purpose: str = Field(..., description="2-3 sentences explaining day-to-day role purpose grounded in KB")
    expectations: List[str] = Field(default_factory=list, description="Core responsibilities and depth expected at this level")
    skill_match: List[SkillMatchItem] = Field(default_factory=list, description="Skill match matrix")


class DimensionScores(BaseModel):
    """Aggregate multi-axis dimension scores (0..100)."""
    technical_accuracy: float = Field(..., ge=0.0, le=100.0, description="Accuracy of technical explanations")
    depth: float = Field(..., ge=0.0, le=100.0, description="Architectural depth and trade-off rigor")
    communication: float = Field(..., ge=0.0, le=100.0, description="Clarity, structure, and concision")
    completeness: float = Field(..., ge=0.0, le=100.0, description="Completeness of coverage across question sub-facets")
    composure: float = Field(..., ge=0.0, le=100.0, description="Verified-live non-verbal composure (low weight)")


class TurnCounts(BaseModel):
    """Question turn counters."""
    asked: int = Field(..., ge=0)
    answered: int = Field(..., ge=0)
    skipped: int = Field(..., ge=0)


class SessionDuration(BaseModel):
    """Duration in minutes."""
    planned_minutes: int = Field(..., ge=1)
    actual_minutes: float = Field(..., ge=0.0)


class OverviewSummary(BaseModel):
    """Executive overview of the interview performance (§3.1)."""
    summary: str = Field(..., description="5-7 sentence plain language executive summary")
    verdict: str = Field(..., description="Strong Hire | Hire | Leaning Hire | No Hire")
    overall_score: float = Field(..., ge=0.0, le=100.0, description="Weighted composite score 0..100")
    dimension_scores: DimensionScores
    counts: TurnCounts
    duration: SessionDuration


class TurnDimensionScores(BaseModel):
    """Per-turn 0..10 rubric scores."""
    technical: float = Field(..., ge=0.0, le=10.0)
    depth: float = Field(..., ge=0.0, le=10.0)
    clarity: float = Field(..., ge=0.0, le=10.0)
    completeness: float = Field(..., ge=0.0, le=10.0)


class TurnReview(BaseModel):
    """Detailed per-question evaluation card (§3.3, §4.2)."""
    turn_id: str = Field(..., description="Unique turn identifier")
    index: int = Field(..., ge=1, description="Question sequence index")
    topic: str = Field(..., description="High-level topic area")
    difficulty: str = Field(..., description="Difficulty label and numeric tier")
    why_asked: str = Field(..., description="Provenance: resume probe, KB requirement, or follow-up")
    question: str = Field(..., description="Question prompt asked to candidate")
    answer_clean: str = Field(default="", description="Cleaned transcript of candidate answer")
    answer_raw: str = Field(default="", description="Raw transcript of candidate answer")
    stt_confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Speech-to-text recognition confidence")
    status: TurnStatus = Field(default="answered", description="answered | skipped")
    correctness: CorrectnessVerdict = Field(
        ...,
        description="correct | mostly | partly | incorrect | not_answered | cannot_judge",
    )
    scores: TurnDimensionScores
    reason: str = Field(..., description="One-line justification for scores")
    right: List[str] = Field(default_factory=list, description="Specific accurate concepts demonstrated")
    missing_or_wrong: List[str] = Field(default_factory=list, description="Specific omissions or inaccuracies")
    concepts_mentioned: List[str] = Field(default_factory=list, description="Keywords/concepts covered")
    concepts_missed: List[str] = Field(default_factory=list, description="Key concepts expected but missed")
    model_answer: str = Field(..., description="Level-appropriate model answer (4-7 sentences)")
    improvement_tips: List[str] = Field(default_factory=list, description="1-2 concrete coaching tips")
    needs_verification: bool = Field(default=False, description="Flagged if answer made dubious claims needing verification")
    excluded: bool = Field(default=False, description="Whether turn is excluded from aggregate scoring")


class SatisfactionArea(BaseModel):
    """Satisfaction verdict for a specific evaluation area (§3.4)."""
    name: str = Field(..., description="Technical knowledge | Depth and problem solving | Communication | Role fit for the level | Professionalism and composure")
    verdict: SatisfactionVerdict = Field(..., description="Satisfied | Partly satisfied | Not satisfied")
    evidence: List[str] = Field(default_factory=list, description="1-2 citations or data points from the interview")


class SatisfactionSummary(BaseModel):
    """Satisfaction breakdown across 5 competency areas (§3.4)."""
    areas: List[SatisfactionArea] = Field(default_factory=list)
    overall_statement: str = Field(..., description="Clear overall satisfaction summary statement")


class TopicScore(BaseModel):
    """Topic performance breakdown."""
    topic: str
    score: float = Field(..., ge=0.0, le=100.0)
    question_count: int = Field(..., ge=1)


class CommunicationMetrics(BaseModel):
    """Quantitative speech and structure metrics (§3.5)."""
    avg_len_words: float = Field(..., ge=0.0)
    wpm: float = Field(..., ge=0.0)
    fillers_per_min: float = Field(..., ge=0.0)
    latency_ms: float = Field(..., ge=0.0)
    structure_notes: str = Field(..., description="Assessment of answer structuring (e.g. STAR, clear opening/summary)")


class SkillsAnalysis(BaseModel):
    """Topic radar, communication analysis, and strengths/gaps (§3.5)."""
    topic_scores: List[TopicScore] = Field(default_factory=list)
    strengths: List[str] = Field(default_factory=list)
    gaps: List[str] = Field(default_factory=list)
    communication: CommunicationMetrics


class NonVerbalSummary(BaseModel):
    """Advisory non-verbal telemetry summary from verified-live segments (§3.6)."""
    eye_contact_ratio: float = Field(..., ge=0.0, le=1.0)
    posture_score: float = Field(..., ge=0.0, le=1.0)
    face_presence_rate: float = Field(..., ge=0.0, le=100.0)
    pauses_count: int = Field(default=0, ge=0)
    advisory_note: str = Field(
        default="Non-verbal observations are advisory heuristics only, have low score weight, and do not infer personal traits.",
        description="Heuristic disclaimer",
    )


class IntegrityReportSummary(BaseModel):
    """Physical biometric and camera integrity summary (§3.6)."""
    verdict: str = Field(..., description="Verified | Verified with warnings | Not verified")
    integrity_score: float = Field(..., ge=0.0, le=100.0)
    events_summary: List[str] = Field(default_factory=list)
    disclaimer: str = Field(
        default="Camera integrity checks are automated heuristics and may produce false positives.",
        description="Integrity disclaimer",
    )


class ReadinessFactor(BaseModel):
    """Transparent factor influencing the readiness estimate (§2, §4.5)."""
    name: str = Field(..., description="Factor name (e.g. Technical Accuracy, Depth)")
    value: str = Field(..., description="Formatted value or score")
    weight: float = Field(..., ge=0.0, le=1.0, description="Contribution weight")
    impact: FactorImpact = Field(..., description="Positive (+), negative (-), or neutral impact")
    description: str = Field(..., description="Brief explanation of effect")


class ReadinessEstimate(BaseModel):
    """Transparent, deterministic interview readiness estimate (§2, §4.5)."""
    range_low: int = Field(..., ge=0, le=100, description="Lower bound percentage (rounded to nearest 5)")
    range_high: int = Field(..., ge=0, le=100, description="Upper bound percentage (rounded to nearest 5)")
    band: str = Field(..., description="Not ready | Developing | Borderline | Competitive | Strong | Not enough data")
    confidence: ConfidenceLevel = Field(..., description="Low | Medium | High")
    factors: List[ReadinessFactor] = Field(default_factory=list, description="Factor breakdown table")
    raise_chances: List[str] = Field(default_factory=list, description="Top 5 concrete actions to improve readiness")
    disclaimer: str = Field(..., description="Mandatory transparency disclaimer")
    available: bool = Field(default=True, description="False if evidence is too thin (< 4 answered or < 5 min)")
    advance_verdict: str = Field(..., description="likely to advance | borderline | unlikely to advance")
    reason_if_unavailable: Optional[str] = Field(default=None, description="Explanation if available=False")


class ActionPriority(BaseModel):
    """Top-priority improvement area (§3.8)."""
    priority: int = Field(..., ge=1, le=5)
    area: str = Field(..., description="Competency or technology area")
    reason: str = Field(..., description="Why this matters for the target role")
    study_practice: str = Field(..., description="Specific topics and concrete practice task")
    estimated_effort: str = Field(..., description="Estimated time effort (e.g. '3-5 hours')")


class DayPlanItem(BaseModel):
    """Daily practice agenda item in 7-day plan (§3.8)."""
    day: int = Field(..., ge=1, le=7)
    title: str = Field(..., description="Focus topic title")
    task: str = Field(..., description="Concrete 20-30 minute actionable practice task")


class NextSessionSuggestion(BaseModel):
    """Suggested configuration for candidate's next mock interview session (§3.8)."""
    role: str
    level: str
    focus_topics: List[str] = Field(default_factory=list)


class ActionPlan(BaseModel):
    """Comprehensive post-interview action plan (§3.8)."""
    priorities: List[ActionPriority] = Field(default_factory=list)
    seven_day_plan: List[DayPlanItem] = Field(default_factory=list)
    next_session_suggestion: NextSessionSuggestion


class InterviewReport(BaseModel):
    """Complete, versioned Interview Review and Readiness Report (§4.2)."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    schema_version: str = Field(default="2.0", description="Schema version identifier")
    session_id: str = Field(..., description="Evaluated interview session identifier")
    user_id: str = Field(..., description="Candidate user identifier")
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Timestamp report was generated (UTC)",
    )
    models_used: List[str] = Field(default_factory=list, description="AI models utilized in synthesis")
    resume_id: Optional[str] = Field(default=None, description="Referenced candidate resume identifier")
    role: RoleSummary
    overview: OverviewSummary
    turns: List[TurnReview] = Field(default_factory=list)
    satisfaction: SatisfactionSummary
    skills: SkillsAnalysis
    nonverbal: NonVerbalSummary
    integrity: IntegrityReportSummary
    readiness: ReadinessEstimate
    action_plan: ActionPlan


class ReportStatusResponse(BaseModel):
    """Progress and status of asynchronous report generation."""
    session_id: str
    status: Literal["not_started", "generating", "completed", "failed"]
    step: str = Field(default="", description="Collecting | Reviewing answers | Scoring | Writing summary")
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    error: Optional[str] = None
    report_id: Optional[str] = None

