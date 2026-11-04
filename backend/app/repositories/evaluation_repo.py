from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.core.database import get_collection


class EvaluationRepository:
    """Repository handling persistence for final scores, report cards, and evaluations (§4.1)."""

    @property
    def collection(self) -> Any:
        return get_collection("evaluations")

    @property
    def versions_collection(self) -> Any:
        return get_collection("report_versions")

    @property
    def status_collection(self) -> Any:
        return get_collection("report_status")

    async def save_evaluation(
        self,
        session_id: str,
        user_id: str,
        report: Dict[str, Any],
        final_score: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Upsert the final evaluation and score report for a completed session."""
        now = datetime.now(timezone.utc)

        doc: Dict[str, Any] = {
            "session_id": str(session_id),
            "user_id": str(user_id),
            "report": report,
            "final_score": final_score,
            "overall_score": report.get("overall_score", final_score),
            "technical_competency_score": report.get("technical_competency_score"),
            "communication_score": report.get("communication_score"),
            "non_verbal_score": report.get("non_verbal_score"),
            "dimension_breakdown": report.get("dimension_breakdown", {}),
            "strengths": report.get("strengths", []),
            "improvements": report.get("improvements", []),
            "detailed_summary": report.get("detailed_summary"),
            "updated_at": now,
        }

        await self.collection.update_one(
            {"session_id": str(session_id)},
            {
                "$set": doc,
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        return doc

    create_or_update = save_evaluation

    async def get_by_session_and_user(
        self, session_id: str, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve evaluation report ensuring strict candidate ownership isolation."""
        doc = await self.collection.find_one({"session_id": str(session_id), "user_id": str(user_id)})
        if not doc:
            return None
        return dict(doc)

    async def save_interview_report(
        self,
        session_id: str,
        user_id: str,
        report_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Upsert full InterviewReport (§4.1, §4.2) and archive version for regeneration history.
        """
        now = datetime.now(timezone.utc)
        overall_score = (
            report_data.get("overview", {}).get("overall_score")
            or report_data.get("overall_score", 70.0)
        )

        doc: Dict[str, Any] = {
            "session_id": str(session_id),
            "user_id": str(user_id),
            "schema_version": report_data.get("schema_version", "2.0"),
            "interview_report": report_data,
            "report": report_data,  # Backward compatibility pointer
            "overall_score": overall_score,
            "final_score": overall_score,
            "updated_at": now,
        }

        await self.collection.update_one(
            {"session_id": str(session_id)},
            {
                "$set": doc,
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

        # Archive version in report_versions collection (§4.1)
        version_doc: Dict[str, Any] = {
            "session_id": str(session_id),
            "user_id": str(user_id),
            "archived_at": now,
            "report": report_data,
        }
        try:
            await self.versions_collection.insert_one(version_doc)
        except Exception:
            pass

        return doc

    async def get_interview_report(
        self, session_id: str, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve InterviewReport document with strict user ownership isolation."""
        doc = await self.collection.find_one({"session_id": str(session_id), "user_id": str(user_id)})
        if not doc:
            return None
        if "interview_report" in doc:
            return doc["interview_report"]
        return doc.get("report")

    async def save_generation_status(
        self,
        session_id: str,
        status: str,
        step: str = "",
        progress: float = 0.0,
        error: Optional[str] = None,
        report_id: Optional[str] = None,
    ) -> None:
        """Persist real-time report generation status for polling (§4.1)."""
        now = datetime.now(timezone.utc)
        await self.status_collection.update_one(
            {"session_id": str(session_id)},
            {
                "$set": {
                    "session_id": str(session_id),
                    "status": status,
                    "step": step,
                    "progress": progress,
                    "error": error,
                    "report_id": report_id,
                    "updated_at": now,
                }
            },
            upsert=True,
        )

    async def get_generation_status(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve status of asynchronous report generation."""
        doc = await self.status_collection.find_one({"session_id": str(session_id)})
        if not doc:
            return None
        return dict(doc)

    async def list_reports_by_user(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """List all completed InterviewReport documents for a user with ownership isolation."""
        cursor = self.collection.find({"user_id": str(user_id)}).sort("updated_at", -1).limit(limit)
        docs = await cursor.to_list(length=limit)
        results = []
        for d in docs:
            rep = d.get("interview_report") or d.get("report")
            if rep:
                results.append(rep)
        return results


evaluation_repo = EvaluationRepository()
