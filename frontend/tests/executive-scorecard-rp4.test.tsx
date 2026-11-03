import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ExecutiveScorecard } from '../src/components/interview/ExecutiveScorecard';
import { InterviewReport } from '../src/lib/types';

describe('RP4: ExecutiveScorecard Complete Review Page UI', () => {
  const sampleInterviewReport: InterviewReport = {
    schema_version: '2.0',
    session_id: 'sess-rp4-test-123',
    user_id: 'user-rp4-test',
    generated_at: '2026-11-02T10:00:00Z',
    models_used: ['gemini-2.5-flash'],
    role: {
      title: 'Full Stack Engineer',
      level: 'Senior',
      purpose: 'Design and deliver resilient, high-scale web platforms and distributed APIs.',
      expectations: [
        'Design fault-tolerant APIs with clear SLAs',
        'Demonstrate practical knowledge of caching and DB sharding',
        'Demonstrate structured communication via STAR',
      ],
      skill_match: [
        { skill: 'Distributed Caching', evidence: 'Explained Redis probabilistic early expiration', rating: 'Met' },
        { skill: 'Database Migrations', evidence: 'Outlined zero-downtime expand/contract schema migrations', rating: 'Met' },
        { skill: 'Event Streaming', evidence: 'Briefly touched Kafka assignors', rating: 'Partly' },
      ],
    },
    overview: {
      summary:
        'Candidate demonstrated strong architectural depth across backend services and database scaling. Technical answers were backed by concrete metrics and trade-off considerations. Communication was concise and well-paced. Biometric composure was calm throughout the session.',
      verdict: 'Strong Hire',
      overall_score: 87,
      dimension_scores: {
        technical_accuracy: 90,
        depth: 88,
        communication: 85,
        completeness: 82,
        composure: 92,
      },
      counts: {
        asked: 5,
        answered: 5,
        skipped: 0,
      },
      duration: {
        planned_minutes: 15,
        actual_minutes: 13,
      },
    },
    turns: [
      {
        turn_id: 'turn-1',
        index: 1,
        topic: 'Payment API & Idempotency',
        difficulty: 'Easy-Medium',
        why_asked: 'From resume: Stripe Integration & PostgreSQL',
        question: 'How do you design an idempotent payment processing endpoint?',
        answer_clean: 'I use a client-generated Idempotency-Key header stored in Redis with a 24-hour TTL.',
        answer_raw: 'I use client generated Idempotency-Key header stored in Redis with 24 hour TTL.',
        stt_confidence: 0.96,
        status: 'answered',
        correctness: 'correct',
        scores: { technical: 9.0, depth: 8.5, clarity: 9.0, completeness: 8.5 },
        reason: 'Strong understanding of idempotency keys, Redis TTL, and database transactions.',
        right: ['Accurate Redis key TTL setup', 'Mentioned transaction isolation'],
        missing_or_wrong: [],
        concepts_mentioned: ['Idempotency-Key', 'Redis TTL', 'PostgreSQL'],
        concepts_missed: [],
        model_answer: 'A comprehensive answer highlights client-generated UUID idempotency keys stored in Redis with atomic reservation.',
        improvement_tips: ['Mention retry exponential backoff strategies on payment gateway timeouts.'],
        needs_verification: false,
        excluded: false,
      },
      {
        turn_id: 'turn-2',
        index: 2,
        topic: 'Speech Recognition Tuning',
        difficulty: 'Medium',
        why_asked: 'Adaptive probe: Audio pipeline',
        question: 'How do you handle acoustic variance in streaming STT?',
        answer_clean: 'We apply VAD pre-filtering and acoustic feature normalization.',
        answer_raw: 'We apply VAD prefiltering and acoustic feature normalization.',
        stt_confidence: 0.72,
        status: 'answered',
        correctness: 'partly',
        scores: { technical: 6.0, depth: 5.5, clarity: 7.0, completeness: 6.0 },
        reason: 'Basic concepts present but lacks detail on acoustic adaptation.',
        right: ['Identified VAD requirement'],
        missing_or_wrong: ['Lacks discussion of streaming frame latency budgets'],
        concepts_mentioned: ['VAD'],
        concepts_missed: ['Chunk streaming', 'Lookahead context'],
        model_answer: 'Discuss cache-aware streaming, 80-160ms chunking, and dual-pass rescoring.',
        improvement_tips: ['Structure answer with concrete latency budgets.'],
        needs_verification: true,
        excluded: false,
      },
    ],
    satisfaction: {
      areas: [
        { name: 'Technical knowledge', verdict: 'Satisfied', evidence: ['Accurate API idempotency architecture'] },
        { name: 'Depth and problem solving', verdict: 'Satisfied', evidence: ['Explained race conditions in payments'] },
        { name: 'Communication', verdict: 'Satisfied', evidence: ['Clear, structured phrasing'] },
        { name: 'Role fit for the level', verdict: 'Satisfied', evidence: ['Demonstrated Senior-level trade-off analysis'] },
        { name: 'Professionalism and composure', verdict: 'Satisfied', evidence: ['Steady camera presence and eye contact'] },
      ],
      overall_statement: 'Overall: Satisfied. Candidate showed solid Senior Full Stack capabilities with deep knowledge of distributed systems.',
    },
    skills: {
      topic_scores: [
        { topic: 'Payment API & Idempotency', score: 90, question_count: 1 },
        { topic: 'Speech Recognition Tuning', score: 60, question_count: 1 },
      ],
      strengths: ['High-throughput API design', 'Structured STAR communication'],
      gaps: ['Elaborate more on audio streaming latency budgets'],
      communication: {
        avg_len_words: 68,
        wpm: 138,
        fillers_per_min: 1.8,
        latency_ms: 1100,
        structure_notes: 'Answers used clear opening sentences and problem breakdowns.',
      },
    },
    nonverbal: {
      eye_contact_ratio: 0.91,
      posture_score: 94,
      face_presence_rate: 99.2,
      pauses_count: 0,
      advisory_note: 'Non-verbal metrics are computed only from verified-live segments. Heuristics are advisory only.',
    },
    integrity: {
      verdict: 'Verified',
      integrity_score: 98,
      events_summary: ['Physical Hardware Webcam Verified'],
      disclaimer: 'Integrity checks are automated heuristics and may produce false positives.',
    },
    readiness: {
      range_low: 75,
      range_high: 85,
      band: 'Strong',
      confidence: 'High',
      factors: [
        { name: 'Technical Accuracy & Depth', value: '90/100', weight: 0.55, impact: '+', description: 'Core domain accuracy and response depth.' },
        { name: 'Communication Clarity', value: '85/100', weight: 0.25, impact: '+', description: 'Structured articulation and fluency.' },
        { name: 'Role-Level Alignment', value: 'Senior', weight: 0.2, impact: '+', description: 'Seniority benchmark comparison.' },
      ],
      raise_chances: [
        'Provide concrete latency percentiles in streaming audio answers',
        'State trade-offs before recommending an architectural pattern',
      ],
      disclaimer: 'This is an estimate of how your mock-interview performance compares with the expected bar for this role and level. It is not a prediction of any real hiring decision.',
      available: true,
      advance_verdict: 'Likely to advance to next round',
    },
    action_plan: {
      priorities: [
        {
          priority: 1,
          area: 'Streaming Audio Latency Budgets',
          reason: 'Senior roles require quantitative trade-offs rather than qualitative guesses.',
          study_practice: 'Review 80-160ms PCM chunking and lookahead buffers.',
          estimated_effort: '2 hours',
        },
      ],
      seven_day_plan: [
        { day: 1, title: 'Distributed Systems', task: 'Review Kafka assignors and consumer groups.' },
        { day: 2, title: 'Caching', task: 'Study cache stampede mitigation.' },
      ],
      next_session_suggestion: {
        role: 'Full Stack Engineer',
        level: 'Senior',
        focus_topics: ['Audio Streaming', 'Kafka Rebalances'],
      },
    },
    difficulty_progression: [
      { question_index: 1, difficulty_tier: 2.0, difficulty_label: 'Easy-Medium', score: 9.0, change: 'UPGRADE' },
      { question_index: 2, difficulty_tier: 2.5, difficulty_label: 'Medium', score: 6.0, change: 'DOWNGRADE' },
    ],
  };

  const sampleSession = {
    id: 'sess-rp4-test-123',
    role: 'Full Stack Engineer',
    seniority: 'Senior',
    created_at: '2026-11-02T10:00:00Z',
  };

  it('renders all 6 sticky section targets and header navigation', () => {
    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={sampleInterviewReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('section-overview');
    expect(html).toContain('section-role');
    expect(html).toContain('section-qa');
    expect(html).toContain('section-satisfaction');
    expect(html).toContain('section-skills');
    expect(html).toContain('section-readiness');
    expect(html).toContain('section-action-plan');
  });

  it('renders Section 3.1 Overview with score, verdict, duration, and dimension breakdown', () => {
    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={sampleInterviewReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('87');
    expect(html).toContain('/100');
    expect(html).toContain('Strong Hire');
    expect(html).toContain('Technical Accuracy');
    expect(html).toContain('Depth &amp; Reasoning');
    expect(html).toContain('Communication');
    expect(html).toContain('Completeness');
    expect(html).toContain('Composure');
    expect(html).toContain('13m actual / 15m planned');
  });

  it('renders Section 3.2 Role purpose and Skill Match table with ratings', () => {
    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={sampleInterviewReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('What is this role for?');
    expect(html).toContain('Design and deliver resilient, high-scale web platforms');
    expect(html).toContain('Distributed Caching');
    expect(html).toContain('Database Migrations');
    expect(html).toContain('Met');
    expect(html).toContain('Partly');
  });

  it('renders Section 3.3 Q&A Review with filter chips, answers, model answer, and low STT confidence badge', () => {
    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={sampleInterviewReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('Question-by-Question Review');
    expect(html).toContain('How do you design an idempotent payment processing endpoint?');
    expect(html).toContain('Model Answer (Senior Level)');
    expect(html).toContain('Transcription may be inaccurate (confidence: 72%)');
    expect(html).toContain('Transcription looks wrong');
  });

  it('renders Section 3.4 Satisfaction table with 5 areas and evidence', () => {
    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={sampleInterviewReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('Are we satisfied?');
    expect(html).toContain('Technical knowledge');
    expect(html).toContain('Depth and problem solving');
    expect(html).toContain('Satisfied');
    expect(html).toContain('Overall: Satisfied');
  });

  it('renders Section 3.5 Skills, topics, and communication analysis metrics', () => {
    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={sampleInterviewReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('Skills, Topics &amp; Communication Analysis');
    expect(html).toContain('Payment API &amp; Idempotency');
    expect(html).toContain('Speaking Pace');
    expect(html).toContain('138 WPM');
    expect(html).toContain('68 words');
  });

  it('renders Section 3.7 Job-Readiness Estimate with honesty rules, range, factors table, and disclaimer', () => {
    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={sampleInterviewReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('Interview Readiness Estimate');
    expect(html).toContain('75% to 85%');
    expect(html).toContain('Strong');
    expect(html).toContain('Likely to advance to next round');
    expect(html).toContain('This is an estimate of how your mock-interview performance compares with the expected bar for this role and level. It is not a prediction of any real hiring decision.');
    expect(html).toContain('How This Was Calculated (Factors &amp; Deterministic Weights)');
    expect(html).toContain('What Would Raise Your Chances (Top 5 Concrete Actions)');
  });

  it('renders thin-data gating message when readiness estimate is unavailable', () => {
    const thinReport: InterviewReport = {
      ...sampleInterviewReport,
      readiness: {
        ...sampleInterviewReport.readiness,
        available: false,
        reason_if_unavailable: 'Fewer than 4 questions were answered. At least 4 answered questions are required for a reliable estimate.',
      },
    };

    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={thinReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('Not Enough Data for an Estimate');
    expect(html).toContain('Fewer than 4 questions were answered');
  });

  it('renders Section 3.8 Action Plan with 7-day schedule and follow-up button', () => {
    const html = renderToString(
      <ExecutiveScorecard
        session={sampleSession}
        report={sampleInterviewReport}
        onDownloadPdf={() => {}}
        onReturnHome={() => {}}
      />
    );

    expect(html).toContain('Targeted Action Plan &amp; Practice Schedule');
    expect(html).toContain('Streaming Audio Latency Budgets');
    expect(html).toContain('7-Day Structured Practice Plan');
    expect(html).toContain('Start another interview with these focus areas');
  });
});

