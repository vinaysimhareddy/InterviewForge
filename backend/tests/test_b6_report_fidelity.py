import pytest
from app.models.report import InterviewReport
from app.services.report_scoring import build_deterministic_report


def test_role_and_level_fidelity():
    """Verify candidate's selected role and level are preserved and not replaced by defaults."""
    session_doc = {
        "job_role": "Machine Learning Engineer",
        "target_seniority": "Staff",
        "resume_id": "resume-ml-999",
        "turns": [
            {
                "question_index": 1,
                "question": "How do you mitigate data drift in production recommendation models?",
                "candidate_answer": "We monitor distribution shifts using Kolmogorov-Smirnov tests and shadow pipelines.",
                "target_topic": "MLOps",
                "difficulty_tier": 4.5,
                "difficulty_label": "Hard",
                "score": 8.5,
                "technical_accuracy": 9.0,
                "depth": 8.5,
                "clarity": 8.5,
                "completeness": 8.0,
            }
        ],
        "interview_state": {
            "role": "Machine Learning Engineer",
            "seniority": "Staff",
            "resume_id": "resume-ml-999",
        },
    }

    report = build_deterministic_report("sess-fidelity-1", "user-1", session_doc)
    assert isinstance(report, InterviewReport)
    assert report.role.title == "Machine Learning Engineer"
    assert report.role.level == "Staff"
    assert report.resume_id == "resume-ml-999"
    assert "Staff Machine Learning Engineer" in report.role.purpose
    assert "Staff Machine Learning Engineer" in report.overview.summary


def test_resume_id_extraction_fallbacks():
    """Verify resume_id is correctly found from various session keys."""
    # Case 1: resumeId camelCase in state
    session_doc1 = {
        "role": "DevOps Architect",
        "seniority": "Lead",
        "interview_state": {"resumeId": "resume-camel-456"},
    }
    report1 = build_deterministic_report("sess-res-1", "user-1", session_doc1)
    assert report1.resume_id == "resume-camel-456"
    assert report1.role.title == "DevOps Architect"
    assert report1.role.level == "Lead"

    # Case 2: None provided
    session_doc2 = {
        "job_role": "Backend Engineer",
        "target_seniority": "Mid",
    }
    report2 = build_deterministic_report("sess-res-2", "user-1", session_doc2)
    assert report2.resume_id is None


def test_edge_case_zero_turns_completed():
    """Verify 0 turns completed (immediate abort or crash) generates valid report with all sections."""
    session_doc = {
        "job_role": "Security Engineer",
        "target_seniority": "Senior",
        "status": "TERMINATED",
        "session_status": "aborted",
        "turns": [],
        "interview_state": {
            "turns_history": [],
            "role": "Security Engineer",
            "seniority": "Senior",
        },
    }

    report = build_deterministic_report("sess-zero-turns", "user-zero", session_doc)
    assert isinstance(report, InterviewReport)
    assert report.role.title == "Security Engineer"
    assert report.role.level == "Senior"
    assert len(report.turns) == 0
    assert report.overview.counts.asked == 0
    assert report.overview.counts.answered == 0
    assert report.overview.verdict == "Incomplete"
    assert report.overview.overall_score == 0.0

    # Readiness should gracefully report unavailable with "Not enough data"
    assert report.readiness.available is False
    assert report.readiness.band == "Not enough data"
    assert report.readiness.range_low == 0
    assert report.readiness.range_high == 0
    assert report.readiness.reason_if_unavailable is not None

    # All sections exist and are populated
    assert report.role is not None
    assert report.overview is not None
    assert report.satisfaction is not None
    assert len(report.satisfaction.areas) == 5
    assert report.skills is not None
    assert report.nonverbal is not None
    assert report.integrity is not None
    assert report.readiness is not None
    assert report.action_plan is not None
    assert len(report.action_plan.priorities) == 3


def test_edge_case_one_turn_completed():
    """Verify 1 turn completed produces valid report with correct score and unavailable readiness (<4 required)."""
    session_doc = {
        "job_role": "Frontend Architect",
        "target_seniority": "Lead",
        "status": "COMPLETED",
        "turns": [
            {
                "question_index": 1,
                "question": "How do you architect microfrontends for runtime isolation?",
                "candidate_answer": "We use Module Federation with isolated iframe sandboxes and postMessage event bus.",
                "target_topic": "Microfrontends",
                "difficulty_tier": 4.0,
                "difficulty_label": "Hard",
                "score": 8.0,
                "technical_accuracy": 8.5,
                "depth": 8.0,
                "clarity": 8.0,
                "completeness": 7.5,
            }
        ],
    }

    report = build_deterministic_report("sess-one-turn", "user-one", session_doc)
    assert isinstance(report, InterviewReport)
    assert report.role.title == "Frontend Architect"
    assert report.role.level == "Lead"
    assert len(report.turns) == 1
    assert report.overview.counts.asked == 1
    assert report.overview.counts.answered == 1
    assert report.overview.overall_score > 0.0

    # Under 4 answered questions means readiness estimate is unavailable
    assert report.readiness.available is False
    assert report.readiness.band == "Not enough data"
    assert "minimum of 4 answered questions" in (report.readiness.reason_if_unavailable or "").lower()

    # All expected sections render
    assert len(report.skills.topic_scores) == 1
    assert report.skills.topic_scores[0].topic == "Microfrontends"
    assert report.action_plan.next_session_suggestion.role == "Frontend Architect"


def test_edge_case_aborted_session():
    """Verify aborted session (camera lost / face absence) generates valid report using completed turns."""
    session_doc = {
        "job_role": "Data Engineer",
        "target_seniority": "Junior",
        "status": "TERMINATED",
        "session_status": "aborted",
        "turns": [
            {
                "question_index": 1,
                "question": "Explain differences between row and columnar storage.",
                "candidate_answer": "Parquet stores column chunks for fast analytical aggregates, while CSV is row-based.",
                "target_topic": "Storage Formats",
                "difficulty_tier": 2.0,
                "difficulty_label": "Easy",
                "score": 7.5,
                "technical_accuracy": 8.0,
                "depth": 7.0,
                "clarity": 7.5,
                "completeness": 7.0,
            },
            {
                "question_index": 2,
                "question": "What is partition pruning in Spark SQL?",
                "candidate_answer": "Spark skips reading directory partitions that do not match the WHERE filter.",
                "target_topic": "Spark Optimization",
                "difficulty_tier": 2.5,
                "difficulty_label": "Medium",
                "score": 8.0,
                "technical_accuracy": 8.5,
                "depth": 7.5,
                "clarity": 8.0,
                "completeness": 8.0,
            },
        ],
    }

    report = build_deterministic_report("sess-aborted", "user-abort", session_doc)
    assert isinstance(report, InterviewReport)
    assert report.role.title == "Data Engineer"
    assert report.role.level == "Junior"
    assert len(report.turns) == 2
    assert report.overview.counts.asked == 2
    assert report.overview.counts.answered == 2
    assert report.readiness.available is False  # 2 turns < 4 turns required


def test_edge_case_standard_five_turns():
    """Verify standard 5-turn completed interview produces full valid report with unlocked readiness."""
    turns = [
        {
            "question_index": i,
            "question": f"Question {i} on system reliability and databases.",
            "candidate_answer": f"Answer {i} explaining indexing, sharding, and latency SLAs in detail.",
            "target_topic": f"Topic-{i}",
            "difficulty_tier": 3.0,
            "difficulty_label": "Medium",
            "score": 8.0,
            "technical_accuracy": 8.5,
            "depth": 8.0,
            "clarity": 8.0,
            "completeness": 7.5,
        }
        for i in range(1, 6)
    ]

    session_doc = {
        "job_role": "Full Stack Engineer",
        "target_seniority": "Senior",
        "status": "COMPLETED",
        "turns": turns,
        "started_at": None,
        "ended_at": None,
    }

    report = build_deterministic_report("sess-five-turns", "user-five", session_doc)
    assert isinstance(report, InterviewReport)
    assert report.role.title == "Full Stack Engineer"
    assert report.role.level == "Senior"
    assert len(report.turns) == 5
    assert report.overview.counts.asked == 5
    assert report.overview.counts.answered == 5
    assert report.overview.overall_score >= 70.0
    assert report.readiness.available is True
    assert report.readiness.band in ["Competitive", "Strong", "Developing", "Borderline"]
    assert report.readiness.range_low > 0
    assert report.readiness.range_high >= report.readiness.range_low


@pytest.mark.asyncio
async def test_get_session_report_auto_reconciles_missing_report():
    """Verify get_session_report automatically builds and saves a review if missing in evaluations collection."""
    from unittest.mock import AsyncMock, patch
    from app.api.v1.endpoints.sessions import get_session_report
    from app.models.user import UserInDB

    fake_user = UserInDB(
        id="user-reconcile-1",
        email="candidate@example.com",
        full_name="Candidate One",
        hashed_password="hashed_secret",
        role="candidate",
    )

    fake_session = {
        "id": "sess-crashed-123",
        "user_id": "user-reconcile-1",
        "job_role": "Cloud Architect",
        "target_seniority": "Senior",
        "resume_id": "resume-cloud-99",
        "status": "TERMINATED",
        "session_status": "aborted",
        "turns": [
            {
                "question_index": 1,
                "question": "Explain AWS VPC peering and transit gateway trade-offs.",
                "candidate_answer": "Transit gateway scales hub-and-spoke topologies better than full mesh VPC peering.",
                "target_topic": "Networking",
                "difficulty_tier": 3.5,
                "difficulty_label": "Hard",
                "score": 8.0,
                "technical_accuracy": 8.5,
                "depth": 8.0,
                "clarity": 8.0,
                "completeness": 7.5,
            }
        ],
    }

    saved_reports = []

    async def mock_save_report(session_id, user_id, report_dict):
        saved_reports.append((session_id, user_id, report_dict))

    with patch("app.api.v1.endpoints.sessions.session_repo.get_by_id_and_user", new=AsyncMock(return_value=fake_session)), \
         patch("app.api.v1.endpoints.sessions.evaluation_repo.get_interview_report", new=AsyncMock(return_value=None)), \
         patch("app.api.v1.endpoints.sessions.evaluation_repo.save_interview_report", new=AsyncMock(side_effect=mock_save_report)):

        report = await get_session_report("sess-crashed-123", current_user=fake_user)

        assert isinstance(report, InterviewReport)
        assert report.session_id == "sess-crashed-123"
        assert report.role.title == "Cloud Architect"
        assert report.role.level == "Senior"
        assert report.resume_id == "resume-cloud-99"
        assert len(saved_reports) == 1
        assert saved_reports[0][0] == "sess-crashed-123"
        assert saved_reports[0][1] == "user-reconcile-1"


@pytest.mark.asyncio
async def test_list_candidate_reports_auto_reconciles_missing_report():
    """Verify list_candidate_reports automatically reconciles completed sessions that lack an evaluation."""
    from unittest.mock import AsyncMock, patch
    from app.api.v1.endpoints.sessions import list_candidate_reports
    from app.models.user import UserInDB

    fake_user = UserInDB(
        id="user-reconcile-2",
        email="candidate2@example.com",
        full_name="Candidate Two",
        hashed_password="hashed_secret",
        role="candidate",
    )

    unreported_session = {
        "id": "sess-legacy-777",
        "user_id": "user-reconcile-2",
        "job_role": "Site Reliability Engineer",
        "target_seniority": "Senior",
        "status": "COMPLETED",
        "session_status": "completed",
        "turns": [
            {
                "question_index": 1,
                "question": "How do you design error budgets and SLO alerting thresholds?",
                "candidate_answer": "We alert on multi-window multi-burn rates to prevent alert fatigue.",
                "target_topic": "Observability",
                "difficulty_tier": 3.0,
                "difficulty_label": "Medium",
                "score": 8.0,
                "technical_accuracy": 8.5,
                "depth": 8.0,
                "clarity": 8.0,
                "completeness": 7.5,
            }
        ],
    }

    saved = []

    async def mock_save(session_id, user_id, report_dict):
        saved.append((session_id, user_id, report_dict))

    with patch("app.api.v1.endpoints.sessions.evaluation_repo.list_reports_by_user", new=AsyncMock(return_value=[])), \
         patch("app.api.v1.endpoints.sessions.session_repo.list_by_user", new=AsyncMock(return_value=[unreported_session])), \
         patch("app.api.v1.endpoints.sessions.session_repo.get_by_id_and_user", new=AsyncMock(return_value=unreported_session)), \
         patch("app.api.v1.endpoints.sessions.evaluation_repo.save_interview_report", new=AsyncMock(side_effect=mock_save)):

        reports = await list_candidate_reports(current_user=fake_user)

        assert len(reports) == 1
        assert reports[0].session_id == "sess-legacy-777"
        assert reports[0].role.title == "Site Reliability Engineer"
        assert reports[0].role.level == "Senior"
        assert len(saved) == 1


