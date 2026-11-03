import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.models.report import InterviewReport, ReportStatusResponse
from app.models.session import SessionCreate, SessionResponse, SessionStatusType
from app.models.user import UserInDB
from app.repositories.evaluation_repo import evaluation_repo
from app.repositories.resume_repo import resume_repo
from app.repositories.session_repo import session_repo
from app.services.report_scoring import (
    build_deterministic_report,
    recompute_report_after_exclusion,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/sessions", tags=["sessions"])


class StatusUpdate(BaseModel):
    """Schema to transition session status."""
    status: SessionStatusType


class SessionOutcomeFeedback(BaseModel):
    """Schema for candidate-reported real interview outcome (§6)."""
    outcome: str = Field(..., description="Outcome: offer | final_round | rejection | ghosted | not_yet")
    notes: Optional[str] = Field(None, max_length=500, description="Optional notes on the real interview")


@router.get(
    "/reports",
    response_model=List[InterviewReport],
    summary="List all completed interview reports for the current candidate (§6)",
)
async def list_candidate_reports(
    current_user: UserInDB = Depends(get_current_user),
) -> List[InterviewReport]:
    """
    Retrieve all completed reports for the authenticated candidate.
    Self-heals and reconciles any completed sessions that lack an evaluation report in DB (§B6).
    """
    raw_reports = await evaluation_repo.list_reports_by_user(current_user.id)
    reported_session_ids = {r.get("session_id") for r in raw_reports if r.get("session_id")}

    try:
        user_sessions = await session_repo.list_by_user(current_user.id, limit=50)
        for s in user_sessions:
            s_id = s.get("id") or s.get("_id")
            if not s_id or s_id in reported_session_ids:
                continue

            status_val = str(s.get("status", "")).upper()
            sess_status = str(s.get("session_status", "")).lower()
            is_finished = bool(s.get("interview_state", {}).get("is_finished", False))
            ended_at = s.get("ended_at")

            if status_val in ("COMPLETED", "TERMINATED") or sess_status in ("completed", "aborted") or is_finished or ended_at:
                try:
                    full_doc = await session_repo.get_by_id_and_user(s_id, current_user.id)
                    if full_doc:
                        gen_report = build_deterministic_report(s_id, current_user.id, full_doc)
                        await evaluation_repo.save_interview_report(s_id, current_user.id, gen_report.model_dump())
                        raw_reports.append(gen_report.model_dump())
                        reported_session_ids.add(s_id)
                except Exception as rec_err:
                    logger.warning("Could not reconcile report for session %s: %s", s_id, rec_err)
    except Exception as list_err:
        logger.warning("Error during session report reconciliation: %s", list_err)

    return [InterviewReport(**r) for r in raw_reports]


@router.post(
    "",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new adaptive interview session",
)
async def create_session(
    session_in: SessionCreate,
    current_user: UserInDB = Depends(get_current_user),
) -> SessionResponse:
    """
    Create a new interview session configured with candidate resume, target role, seniority, and difficulty.
    Persists to ai-mock-interview.interview_sessions collection via session_repo.
    Enforces user isolation on referenced resume.
    """
    if session_in.resume_id:
        resume_doc = await resume_repo.get_by_id_and_user(
            session_in.resume_id, current_user.id
        )
        if not resume_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Referenced resume not found or access denied.",
            )

    session_doc = await session_repo.create_session(
        user_id=current_user.id,
        job_role=session_in.job_role,
        target_seniority=session_in.target_seniority,
        difficulty=session_in.difficulty or "Adaptive",
        integrity_mode=session_in.integrity_mode or "strict",
        resume_id=session_in.resume_id,
        max_questions=session_in.max_questions,
    )

    return SessionResponse(**session_doc)


@router.get(
    "",
    response_model=List[SessionResponse],
    summary="List all interview sessions for current user",
)
async def list_sessions(
    current_user: UserInDB = Depends(get_current_user),
) -> List[SessionResponse]:
    """Retrieve all interview sessions for current user ordered by creation time."""
    sessions_list = await session_repo.list_by_user(current_user.id)
    return [SessionResponse(**s) for s in sessions_list]


@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Get single interview session by ID",
)
async def get_session(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> SessionResponse:
    """Retrieve session details by ID. Returns 404 if session not found or owned by another user."""
    doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found.",
        )
    return SessionResponse(**doc)


@router.patch(
    "/{session_id}/status",
    response_model=SessionResponse,
    summary="Transition session lifecycle state",
)
async def update_session_status(
    session_id: str,
    status_update: StatusUpdate,
    current_user: UserInDB = Depends(get_current_user),
) -> SessionResponse:
    """Update session state to IN_PROGRESS, COMPLETED, or TERMINATED with timestamp recording."""
    updated = await session_repo.update_status(
        session_id=session_id,
        user_id=current_user.id,
        status=status_update.status,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found.",
        )
    return SessionResponse(**updated)


def _assert_session_completed(session_doc: dict) -> None:
    """Enforce strict no-leak invariant: reports are inaccessible while interview is active (§0, §4.1)."""
    status_val = str(session_doc.get("status", "")).upper()
    sess_status = str(session_doc.get("session_status", "")).lower()
    is_finished = bool(session_doc.get("interview_state", {}).get("is_finished", False))

    if not (status_val in ("COMPLETED", "TERMINATED") or sess_status in ("completed", "aborted") or is_finished):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview session is still in progress. Reports are only generated and accessible after interview completion.",
        )


@router.get(
    "/{session_id}/report",
    response_model=InterviewReport,
    summary="Retrieve post-interview detailed review and readiness report (§4.2)",
)
async def get_session_report(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> InterviewReport:
    """
    Retrieve InterviewReport with strict ownership isolation.
    If a session ended without a report (crash, timeout, early close),
    generates it on first access to the review page using whatever turns were completed (§B6).
    """
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found or access denied.",
        )

    # 1. Return immediately if report already exists
    report_data = await evaluation_repo.get_interview_report(session_id, current_user.id)
    if report_data:
        return InterviewReport(**report_data)

    # 2. Check if session has ended, or is completed/terminated/aborted/has turns
    status_val = str(session_doc.get("status", "")).upper()
    sess_status = str(session_doc.get("session_status", "")).lower()
    is_finished = bool(session_doc.get("interview_state", {}).get("is_finished", False))
    ended_at = session_doc.get("ended_at")
    raw_turns = session_doc.get("turns") or session_doc.get("interview_state", {}).get("turns_history") or []

    is_ended = (
        status_val in ("COMPLETED", "TERMINATED")
        or sess_status in ("completed", "aborted")
        or is_finished
        or ended_at is not None
        or len(raw_turns) > 0
    )

    if not is_ended:
        _assert_session_completed(session_doc)

    if status_val not in ("COMPLETED", "TERMINATED"):
        try:
            await session_repo.update_status(session_id, current_user.id, "COMPLETED")
            session_doc["status"] = "COMPLETED"
        except Exception:
            pass

    # Build deterministic report using whatever turns were completed (§B6)
    report_obj = build_deterministic_report(session_id, current_user.id, session_doc)
    await evaluation_repo.save_interview_report(session_id, current_user.id, report_obj.model_dump())
    return report_obj


@router.post(
    "/{session_id}/report/generate",
    response_model=InterviewReport,
    summary="Generate or regenerate post-interview review report (§4.1)",
)
async def generate_session_report(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> InterviewReport:
    """Generate or regenerate InterviewReport with deterministic scoring fallback."""
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found or access denied.",
        )

    _assert_session_completed(session_doc)

    from app.services.report_pipeline import generate_interview_report_pipeline
    report_obj = await generate_interview_report_pipeline(session_id, current_user.id, session_doc)
    return report_obj


@router.get(
    "/{session_id}/report/status",
    response_model=ReportStatusResponse,
    summary="Poll status and progress of report generation (§4.1)",
)
async def get_report_generation_status(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> ReportStatusResponse:
    """Retrieve async report generation status for polling UX."""
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found or access denied.",
        )

    _assert_session_completed(session_doc)

    st = await evaluation_repo.get_generation_status(session_id)
    if not st:
        # Check if report already exists
        existing = await evaluation_repo.get_interview_report(session_id, current_user.id)
        if existing:
            return ReportStatusResponse(
                session_id=session_id,
                status="completed",
                step="Completed",
                progress=1.0,
            )
        return ReportStatusResponse(
            session_id=session_id,
            status="not_started",
            step="Ready to generate",
            progress=0.0,
        )

    return ReportStatusResponse(**st)


@router.post(
    "/{session_id}/report/turns/{turn_id}/exclude",
    response_model=InterviewReport,
    summary="Mark turn as unreliable/excluded ('Transcription looks wrong') and recompute (§3.3)",
)
async def exclude_turn_and_recompute_report(
    session_id: str,
    turn_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> InterviewReport:
    """Mark turn as excluded and immediately recompute deterministic scores and readiness."""
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found or access denied.",
        )

    _assert_session_completed(session_doc)

    report_data = await evaluation_repo.get_interview_report(session_id, current_user.id)
    if not report_data:
        report_obj = build_deterministic_report(session_id, current_user.id, session_doc)
    else:
        report_obj = InterviewReport(**report_data)

    recomputed = recompute_report_after_exclusion(report_obj, turn_id)
    await evaluation_repo.save_interview_report(session_id, current_user.id, recomputed.model_dump())

    return recomputed


@router.post(
    "/{session_id}/outcome",
    summary="Record optional, opt-in real interview outcome for future calibration (§6)",
)
async def record_session_outcome(
    session_id: str,
    feedback: SessionOutcomeFeedback,
    current_user: UserInDB = Depends(get_current_user),
) -> Dict[str, Any]:
    """Record real-world interview outcome to calibrate future readiness models."""
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found or access denied.",
        )
    await session_repo.record_outcome_feedback(
        session_id=session_id,
        user_id=current_user.id,
        outcome=feedback.outcome,
        notes=feedback.notes,
    )
    return {
        "status": "success",
        "session_id": session_id,
        "outcome": feedback.outcome,
        "message": "Thank you! Your feedback will help calibrate future interview readiness models.",
    }


