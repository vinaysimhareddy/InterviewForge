import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.rate_limiter import limiter
from app.models.interview import AnswerSubmission, FinalReport, InterviewStepResponse, QuestionEvaluation
from app.models.user import UserInDB
from app.repositories.evaluation_repo import evaluation_repo
from app.repositories.resume_repo import resume_repo
from app.repositories.session_repo import session_repo
from app.repositories.telemetry_repo import telemetry_repo
from app.services.integrity_service import build_integrity_summary, compute_verified_non_verbal_scores
from app.services.interview_engine import InterviewState, start_interview, submit_candidate_answer

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/interview", tags=["interview"])


def _extract_final_report_from_docs(
    session_id: str,
    session_doc: Optional[Dict[str, Any]],
    eval_doc: Optional[Dict[str, Any]],
) -> Optional[FinalReport]:
    """Adapt and parse FinalReport from session state or evaluation document with fallback resilience (§PR7)."""
    state_report = (session_doc or {}).get("interview_state", {}).get("final_report")
    raw_report: Optional[Dict[str, Any]] = None

    if isinstance(state_report, dict) and "category_scores" in state_report:
        raw_report = dict(state_report)
    elif eval_doc and "category_scores" in (eval_doc.get("report") or {}):
        raw_report = dict(eval_doc["report"])
    elif eval_doc and "overview" in (eval_doc.get("report") or {}):
        rep = eval_doc["report"]
        overview = rep.get("overview", {})
        dim = overview.get("dimension_scores", {})
        raw_report = {
            "overall_score": float(overview.get("overall_score", 70.0)),
            "category_scores": {
                "technical": float(dim.get("technical_accuracy", 70.0)),
                "communication": float(dim.get("communication", 70.0)),
                "composure": float(dim.get("composure", 70.0)),
            },
            "hiring_recommendation": str(overview.get("verdict", "Hire")),
            "strengths": rep.get("strengths") or [
                f"Demonstrated solid knowledge of {(session_doc or {}).get('role', 'engineering')} conventions.",
                "Articulated system trade-offs with structured communication.",
            ],
            "weaknesses": rep.get("weaknesses") or [
                "Could provide more quantitative performance metrics when proposing architectures.",
                "Consider discussing edge cases and disaster recovery runbooks in greater depth.",
            ],
            "executive_summary": str(overview.get("summary") or "Interview completed successfully."),
            "integrity_summary": rep.get("integrity_summary"),
            "question_coverage": rep.get("question_coverage", []),
            "difficulty_progression": rep.get("difficulty_progression", []),
        }
    elif state_report and isinstance(state_report, dict):
        raw_report = dict(state_report)
    elif eval_doc and eval_doc.get("report"):
        raw_report = dict(eval_doc["report"])

    if not raw_report:
        return None

    if not raw_report.get("integrity_summary") and session_doc:
        score = float(session_doc.get("integrity_score", 95.0))
        events = session_doc.get("integrity_events", [])
        cam = session_doc.get("camera_device_name") or session_doc.get("activeCameraLabel")
        raw_report["integrity_summary"] = build_integrity_summary(
            session_id=session_id,
            integrity_score=score,
            events=events,
            samples=[],
            camera_device_name=cam,
            challenges_passed=int(session_doc.get("challenges_passed", 0)),
            challenges_failed=int(session_doc.get("challenges_failed", 0)),
        )

    try:
        return FinalReport(**raw_report)
    except Exception as exc:
        logger.warning("Could not parse FinalReport for session %s: %s", session_id, exc)
        return None


@router.post(
    "/sessions/{session_id}/start",
    response_model=InterviewStepResponse,
    summary="Initialize adaptive LangGraph workflow and generate Question #1",
)
async def start_interview_endpoint(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> InterviewStepResponse:
    """Start or resume the adaptive interview workflow with user isolation (§PR7)."""
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    # Resumption case 1: Session has already concluded (COMPLETED or ABORTED)
    if session_doc.get("status") in ("COMPLETED", "ABORTED"):
        eval_doc = await evaluation_repo.get_by_session_and_user(session_id, current_user.id)
        final_rep = _extract_final_report_from_docs(session_id, session_doc, eval_doc)
        state_dict = session_doc.get("interview_state") or {}
        return InterviewStepResponse(
            session_id=session_id,
            status=session_doc["status"],
            current_question_index=state_dict.get("current_question_index", 0),
            max_questions=state_dict.get("max_questions", 5),
            next_question=None,
            difficulty=state_dict.get("difficulty", session_doc.get("difficulty", "Adaptive")),
            final_report=final_rep,
        )

    # Resumption case 2: If already running with an active question, resume cleanly
    if session_doc.get("interview_state") and session_doc.get("status") == "IN_PROGRESS":
        state: InterviewState = session_doc["interview_state"]
        return InterviewStepResponse(
            session_id=session_id,
            status=session_doc["status"],
            current_question_index=state["current_question_index"],
            max_questions=state["max_questions"],
            next_question=state.get("current_question"),
            difficulty=state["difficulty"],
            difficulty_change=state.get("difficulty_change"),
        )

    # Fetch resume skills and summary if attached (with user isolation)
    target_skills: List[str] = []
    resume_summary: Optional[str] = None
    if session_doc.get("resume_id"):
        resume_doc = await resume_repo.get_by_id_and_user(session_doc["resume_id"], current_user.id)
        if resume_doc:
            parsed = resume_doc.get("parsed_profile") or resume_doc.get("parsed_data", {})
            target_skills = parsed.get("technical_skills") or parsed.get("skills", [])
            resume_summary = parsed.get("summary")

    # Run LangGraph start node
    now = datetime.now(timezone.utc)
    state = await start_interview(
        session_id=session_id,
        user_id=current_user.id,
        role=session_doc.get("role") or session_doc.get("job_role", "Software Engineer"),
        seniority=session_doc.get("seniority") or session_doc.get("target_seniority", "Mid"),
        difficulty=session_doc.get("difficulty", "Adaptive"),
        resume_summary=resume_summary,
        target_skills=target_skills,
        max_questions=session_doc.get("max_questions") or 9999,
    )

    await session_repo.update_interview_state(
        session_id=session_id,
        state=state,
        extra_fields={
            "status": "IN_PROGRESS",
            "session_status": "in_progress",
            "started_at": now,
        },
    )

    return InterviewStepResponse(
        session_id=session_id,
        status="IN_PROGRESS",
        current_question_index=1,
        max_questions=state["max_questions"],
        next_question=state.get("current_question"),
        difficulty=state["difficulty"],
        difficulty_change=state.get("difficulty_change"),
        current_action=state.get("current_action"),
        question_sources=state.get("question_sources"),
    )


@router.post(
    "/sessions/{session_id}/answer",
    response_model=InterviewStepResponse,
    summary="Submit answer, evaluate against rubric, and adaptively route next step",
)
async def submit_answer_endpoint(
    session_id: str,
    submission: AnswerSubmission,
    current_user: UserInDB = Depends(get_current_user),
) -> InterviewStepResponse:
    """Submit candidate response to current question; updates score and dynamic difficulty."""
    limiter.check(f"answer:{session_id}", limit=30, window_seconds=60.0)
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    state: Optional[InterviewState] = session_doc.get("interview_state")
    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview has not been started. Call /start first.",
        )

    if session_doc.get("status") == "COMPLETED" or state.get("is_finished"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview session has already concluded.",
        )

    # Retrieve telemetry samples via telemetry_repo
    all_telemetry_samples = await telemetry_repo.get_full_session_samples(session_id)

    # Verified-live non-verbal calculation excluding active-flag segments (§7)
    eye_ratio, posture_ratio, excluded_count = compute_verified_non_verbal_scores(all_telemetry_samples)

    telemetry_summary: Dict[str, Any] = {
        "eye_contact_ratio": eye_ratio,
        "posture_score": posture_ratio,
        "excluded_segments_count": excluded_count,
        "blink_rate": 18.0,
        "facial_tension": 0.2,
        "speech_rate_wpm": 125.0,
    }

    # Pre-build integrity summary if interview is reaching maximum questions
    if state.get("current_question_index", 1) >= state.get("max_questions", 5):
        session_integrity_score = float(session_doc.get("integrity_score", 95.0))
        session_integrity_events = session_doc.get("integrity_events", [])
        camera_name = session_doc.get("camera_device_name") or session_doc.get("activeCameraLabel")
        challenges_passed = int(session_doc.get("challenges_passed", 0))
        challenges_failed = int(session_doc.get("challenges_failed", 0))

        state["integrity_summary"] = build_integrity_summary(
            session_id=session_id,
            integrity_score=session_integrity_score,
            events=session_integrity_events,
            samples=all_telemetry_samples,
            camera_device_name=camera_name,
            challenges_passed=challenges_passed,
            challenges_failed=challenges_failed,
        )

    # Advance state machine via LangGraph (§T7)
    candidate_answer = submission.answer if submission.answer is not None else ""
    updated_state = await submit_candidate_answer(
        state=state,
        answer=candidate_answer,
        telemetry_summary=telemetry_summary,
        answer_raw=submission.answer_raw,
        stt_confidence=submission.stt_confidence,
        is_low_confidence=submission.is_low_confidence,
    )

    now = datetime.now(timezone.utc)
    new_status = "COMPLETED" if updated_state["is_finished"] else "IN_PROGRESS"

    extra_update: Dict[str, Any] = {
        "status": new_status,
        "session_status": new_status.lower(),
    }
    if updated_state["is_finished"]:
        extra_update["ended_at"] = now

    await session_repo.update_interview_state(
        session_id=session_id,
        state=updated_state,
        extra_fields=extra_update,
    )

    # Persist the structured turn to session document in MongoDB (§Q7)
    if updated_state.get("turns_history"):
        latest_turn = updated_state["turns_history"][-1]
        if submission.source:
            latest_turn["source"] = submission.source
        try:
            await session_repo.record_turn(
                session_id=session_id,
                user_id=current_user.id,
                turn=latest_turn,
            )
        except Exception as exc:
            logger.warning("Failed to record turn to session document: %s", exc)

    # Persist final report to evaluations collection if interview has finished (§M4)
    final_report_dict: Optional[Dict[str, Any]] = updated_state.get("final_report")
    if updated_state["is_finished"]:
        if final_report_dict is not None:
            final_score = final_report_dict.get("overall_score")
            await evaluation_repo.save_evaluation(
                session_id=session_id,
                user_id=current_user.id,
                report=final_report_dict,
                final_score=float(final_score) if final_score is not None else None,
            )

        # Immediately synthesize and persist deterministic v2 InterviewReport so review is instantly visible (§B5)
        try:
            from app.services.report_scoring import build_deterministic_report
            session_doc_for_rep = {
                **session_doc,
                "interview_state": updated_state,
                "turns": updated_state.get("turns_history", session_doc.get("turns", [])),
                "ended_at": now,
            }
            interview_rep = build_deterministic_report(session_id, current_user.id, session_doc_for_rep)
            await evaluation_repo.save_interview_report(session_id, current_user.id, interview_rep.model_dump())
            
            # Asynchronously synthesize full AI report in background (§4.1, RP3)
            from app.services.report_pipeline import generate_interview_report_pipeline
            asyncio.create_task(generate_interview_report_pipeline(session_id, current_user.id, session_doc_for_rep))
        except Exception as exc:
            logger.warning("Failed to immediately save report or trigger background generation in submit_answer_endpoint: %s", exc)

    # Per UX security & anti-bias requirements: withhold per-answer scores/critiques from client mid-interview.
    # Evaluations are stored in updated_state["evaluations_history"] in MongoDB and exposed only in the final report.
    eval_dict = updated_state.get("evaluation")
    return InterviewStepResponse(
        session_id=session_id,
        status=new_status,
        current_question_index=updated_state["current_question_index"],
        max_questions=updated_state["max_questions"],
        evaluation=QuestionEvaluation(**eval_dict) if (updated_state.get("is_finished") and eval_dict) else None,
        next_question=updated_state.get("current_question") if not updated_state["is_finished"] else None,
        difficulty=updated_state["difficulty"],
        difficulty_change=updated_state.get("difficulty_change"),
        final_report=FinalReport(**final_report_dict) if final_report_dict is not None else None,
        current_action=updated_state.get("current_action"),
        question_sources=updated_state.get("question_sources"),
    )


@router.get(
    "/sessions/{session_id}/report",
    response_model=FinalReport,
    summary="Retrieve final interview report and category scorecard",
)
async def get_interview_report(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> FinalReport:
    """Retrieve scorecard report from evaluations collection with strict user ownership isolation (§7, §M4)."""
    eval_doc = await evaluation_repo.get_by_session_and_user(session_id, current_user.id)
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)

    report_obj = _extract_final_report_from_docs(session_id, session_doc, eval_doc)
    if not report_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found. The interview session may not be completed yet.",
        )

    return report_obj


@router.get(
    "/sessions/{session_id}/state",
    summary="Retrieve full conversation and question state",
)
async def get_interview_state(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> Dict[str, Any]:
    """Retrieve interview transcript, evaluations, and current difficulty with user ownership enforcement."""
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    state = session_doc.get("interview_state", {})
    return {
        "session_id": session_id,
        "status": session_doc.get("status"),
        "role": session_doc.get("role"),
        "seniority": session_doc.get("seniority"),
        "difficulty": state.get("difficulty", session_doc.get("difficulty")),
        "current_question_index": state.get("current_question_index", 0),
        "max_questions": state.get("max_questions", 9999),
        "current_question": state.get("current_question"),
        "evaluations_history": state.get("evaluations_history", []),
        "difficulty_history": state.get("difficulty_history", []),
        "conversation_history": state.get("conversation_history", []),
        "final_report": state.get("final_report"),
    }


class EndInterviewRequest(BaseModel):
    reason: str = Field(
        default="user_ended",
        description="Reason: 'time_budget_expired' | 'user_ended' | 'aborted_face_not_visible' | 'aborted_camera_lost'",
    )


@router.post(
    "/sessions/{session_id}/end",
    response_model=InterviewStepResponse,
    summary="Conclude or abort interview session (§3.6, §3.7, Item 9)",
)
async def end_interview_endpoint(
    session_id: str,
    end_req: EndInterviewRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> InterviewStepResponse:
    """End interview session strictly on time-up, user end, or face/camera policy abort."""
    session_doc = await session_repo.get_by_id_and_user(session_id, current_user.id)
    if not session_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    state = session_doc.get("interview_state")
    if not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session has not started.")

    is_abort = end_req.reason.startswith("aborted_")
    new_status = "ABORTED" if is_abort else "COMPLETED"

    # Run LangGraph end_interview_node to generate final scorecard
    from app.services.interview_engine import end_interview_node
    end_res = await end_interview_node(state)
    state.update(end_res)
    state["is_finished"] = True
    final_report_dict = state.get("final_report")

    await session_repo.update_interview_state(
        session_id=session_id,
        state=state,
        extra_fields={
            "status": new_status,
            "session_status": new_status.lower(),
            "ended_at": datetime.now(timezone.utc),
            "end_reason": end_req.reason,
        },
    )

    if final_report_dict:
        await evaluation_repo.save_evaluation(
            session_id=session_id,
            user_id=current_user.id,
            report=final_report_dict,
            final_score=float(final_report_dict.get("overall_score", 0)),
        )
        try:
            from app.services.report_scoring import build_deterministic_report
            session_doc_for_rep = {
                **session_doc,
                "interview_state": state,
                "turns": state.get("turns_history", session_doc.get("turns", [])),
                "ended_at": datetime.now(timezone.utc),
            }
            interview_rep = build_deterministic_report(session_id, current_user.id, session_doc_for_rep)
            await evaluation_repo.save_interview_report(session_id, current_user.id, interview_rep.model_dump())
        except Exception as exc:
            logger.warning("Failed to immediately save deterministic interview report in end_interview_endpoint: %s", exc)

    return InterviewStepResponse(
        session_id=session_id,
        status=new_status,
        current_question_index=state["current_question_index"],
        max_questions=state.get("max_questions", 9999),
        evaluation=None,
        next_question=None,
        difficulty=state.get("difficulty", "Medium"),
        final_report=FinalReport(**final_report_dict) if final_report_dict else None,
    )
