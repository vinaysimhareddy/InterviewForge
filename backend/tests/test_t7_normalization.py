"""
T7: Technical Term Normalization & Disambiguation Backend Tests (§T7).

Verifies:
1. Normalization correctness (casing fixes and known acoustic substitutions).
2. Protection of ordinary English words against false rewrites.
3. Dual storage persistence (answer_raw vs. answer_clean in turn history).
4. Low-confidence speech recognition flagging for interview review (needs_verification).
"""

import pytest
from app.services.term_normalizer import (
    normalize_transcript,
    compute_turn_confidence,
    compute_levenshtein,
    compute_similarity,
    PROTECTED_COMMON_WORDS,
)
from app.services.interview_engine import submit_candidate_answer, InterviewState
from app.services.report_pipeline import _build_heuristic_turn_review, _turn_review_from_json


def test_term_normalization_casing_and_phonetic_aliases():
    """Verify casing and phonetic misrecognition replacement."""
    raw = "we streamed events via caf kissing connector into post rescue l using spring boot and k8s"
    res = normalize_transcript(raw)

    clean = res["clean_text"]
    assert "Kafka sink connector" in clean
    assert "PostgreSQL" in clean
    assert "Spring Boot" in clean
    assert "Kubernetes" in clean
    assert "caf kissing" not in clean
    assert "post rescue l" not in clean


def test_protected_words_preservation():
    """Ensure ordinary everyday words are never falsely rewritten."""
    ordinary = "the team will order a new table and write a clean test to lock the state and share the score"
    res = normalize_transcript(ordinary)

    assert res["clean_text"] == ordinary
    assert len(res["applied_replacements"]) == 0

    for word in list(PROTECTED_COMMON_WORDS)[:15]:
        sentence = f"please verify that you {word} the record"
        assert normalize_transcript(sentence)["clean_text"] == sentence


def test_custom_terms_expansion():
    """Verify dynamic glossary injection from candidate resume or job role."""
    custom = ["Snowflake", "ArgoCD", "Temporal.io"]
    text = "we orchestrated workflows in temporal.io and synced data to snowflake"
    res = normalize_transcript(text, custom_terms=custom)

    assert "Temporal.io" in res["clean_text"]
    assert "Snowflake" in res["clean_text"]


def test_compute_turn_confidence_normal_and_low():
    """Verify confidence score calculations and low-confidence triggers."""
    # Healthy turn
    high_conf = compute_turn_confidence("We deployed Redis cluster across three availability zones.", 0.95, 6.0)
    assert high_conf["confidence"] >= 0.90
    assert high_conf["is_low_confidence"] is False
    assert high_conf["flag_reason"] is None

    # Mumbled speech > 2.0s with < 3 words
    sparse = compute_turn_confidence("uh yeah", None, 3.2)
    assert sparse["is_low_confidence"] is True
    assert sparse["confidence"] <= 0.35
    assert "Speech detected for 3.2s but only 2 words recognized" in sparse["flag_reason"]

    # Low ASR confidence
    low_asr = compute_turn_confidence("some vague words here", 0.52, 4.0)
    assert low_asr["is_low_confidence"] is True
    assert low_asr["confidence"] == 0.52


@pytest.mark.asyncio
async def test_dual_storage_in_submit_candidate_answer(monkeypatch):
    """Verify that submit_candidate_answer stores both answer_raw and answer_clean."""
    state: InterviewState = {
        "session_id": "test_sess_t7",
        "current_question_index": 1,
        "current_question": "Explain database indexing in PostgreSQL.",
        "current_action": "new_topic_from_role",
        "current_topic": "Database Indexing",
        "difficulty": "Medium",
        "numeric_difficulty": 2.0,
        "difficulty_change": "UNCHANGED",
        "max_questions": 5,
        "rolling_summary": "",
        "turns_history": [],
        "covered_topics": [],
        "evaluations_history": [],
        "target_skills": ["PostgreSQL", "B-tree"],
    }

    # Mock evaluate_answer_node to return deterministic score without hitting external LLM
    async def mock_eval(st):
        return {
            "evaluation": {
                "score": 8.0,
                "technical_accuracy": 8.0,
                "clarity": 8.0,
                "completeness": 8.0,
                "feedback": "Solid explanation of B-tree indexes.",
            }
        }

    # Mock routing and question generation to isolate answer persistence
    async def mock_plan(st):
        return {"current_action": "deepen"}

    async def mock_rag(st):
        return {}

    async def mock_gen(st):
        return {"current_question": "Next question?"}

    async def mock_val(st):
        return {"validation_feedback": None}

    monkeypatch.setattr("app.services.interview_engine.evaluate_answer_node", mock_eval)
    monkeypatch.setattr("app.services.interview_engine.route_next_node", lambda st: "continue")
    monkeypatch.setattr("app.services.interview_engine.plan_turn_node", mock_plan)
    monkeypatch.setattr("app.services.interview_engine.retrieve_context_node", mock_rag)
    monkeypatch.setattr("app.services.interview_engine.generate_question_node", mock_gen)
    monkeypatch.setattr("app.services.interview_engine.validate_question_node", mock_val)

    raw_spoken = "we used post rescue l with b-tree indexes on spring boot"
    updated_state = await submit_candidate_answer(
        state=state,
        answer=raw_spoken,
        answer_raw=raw_spoken,
        stt_confidence=0.88,
        is_low_confidence=False,
    )

    # 1. State contains both clean and raw answer
    assert updated_state["answer_raw"] == raw_spoken
    assert "PostgreSQL" in updated_state["answer_clean"]
    assert "Spring Boot" in updated_state["answer_clean"]

    # 2. Structured turn record contains both
    latest_turn = updated_state["turns_history"][-1]
    assert latest_turn["answer_raw"] == raw_spoken
    assert "PostgreSQL" in latest_turn["answer_clean"]
    assert latest_turn["stt_confidence"] == 0.88
    assert latest_turn["is_low_confidence"] is False


def test_turn_review_low_confidence_flagging():
    """Verify that low-confidence turns trigger needs_verification for human audit."""
    turn_data = {
        "question_index": 2,
        "target_topic": "Kafka",
        "question": "How does Kafka handle partitioning?",
        "candidate_answer": "uh yeah",
        "answer_clean": "uh yeah",
        "answer_raw": "uh yeah",
        "stt_confidence": 0.30,
        "is_low_confidence": True,
        "difficulty_tier": 2.0,
        "difficulty_label": "Medium",
        "score": 2.0,
        "feedback": "Answer was too brief.",
    }

    review = _build_heuristic_turn_review(turn_data, role="Backend Engineer", seniority="Mid")
    assert review.needs_verification is True
    assert review.answer_raw == "uh yeah"
    assert review.stt_confidence == 0.30
