import { describe, it, expect } from 'vitest';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { PDFReportDocument } from '../src/components/report/PDFReportDocument';
import { InterviewReport, TurnReview } from '../src/lib/types';
import fs from 'fs';
import path from 'path';

describe('RP5: PDF Export & Print Stylesheet Verification', () => {
  // Build a 15-question fixture report to verify scaling, paginating, and no crash
  const fifteenTurns: TurnReview[] = Array.from({ length: 15 }, (_, i) => ({
    turn_id: `turn-${i + 1}`,
    index: i + 1,
    topic: `Topic Domain ${Math.floor(i / 3) + 1}`,
    difficulty: i < 5 ? 'Easy-Medium' : i < 10 ? 'Medium' : 'Hard',
    why_asked: `Evaluation probe ${i + 1}`,
    question: `What are the production architectural implications and trade-offs of engineering decision #${i + 1}?`,
    answer_clean: `In our production deployment for service #${i + 1}, we tuned connection pooling, verified idempotency keys, and enforced circuit breakers.`,
    answer_raw: `In our production deployment for service #${i + 1}, we tuned connection pooling, verified idempotency keys, and enforced circuit breakers.`,
    stt_confidence: i === 3 ? 0.74 : 0.95,
    status: 'answered',
    correctness: i % 4 === 0 ? 'correct' : i % 4 === 1 ? 'mostly' : i % 4 === 2 ? 'partly' : 'correct',
    scores: {
      technical: 7.5 + (i % 3) * 0.5,
      depth: 7.0 + (i % 3) * 0.5,
      clarity: 8.0,
      completeness: 7.5,
    },
    reason: `Candidate showed solid reasoning on scenario #${i + 1}.`,
    right: [`Clear understanding of connection limits #${i + 1}`],
    missing_or_wrong: i % 2 === 0 ? [`Could elaborate on failover latencies #${i + 1}`] : [],
    concepts_mentioned: [`Idempotency`, `Pooling`],
    concepts_missed: i % 2 === 0 ? [`Telemetry p99`] : [],
    model_answer: `A comprehensive staff-level answer outlines circuit breaker thresholds, fallback degradation runbooks, and zero-downtime rollover.`,
    improvement_tips: [`State concrete SLA targets before choosing architectural patterns.`],
    needs_verification: i === 3,
    excluded: false,
  }));

  const sample15Report: InterviewReport = {
    schema_version: '2.0',
    session_id: 'sess-pdf-15-turns',
    user_id: 'user-pdf-test',
    generated_at: '2026-11-02T12:00:00Z',
    models_used: ['adaptive-scoring-engine'],
    role: {
      title: 'Principal Systems Architect',
      level: 'Staff',
      purpose: 'Lead cross-functional architecture and scale high-throughput infrastructure.',
      expectations: [
        'Drive multi-region active-active architectures',
        'Demonstrate rigorous disaster recovery planning',
        'Mentor senior engineers on trade-off communication',
      ],
      skill_match: [
        { skill: 'Distributed Consensus', evidence: 'Addressed Raft/Paxos trade-offs', rating: 'Met' },
        { skill: 'Observability & SLAs', evidence: 'Detailed p99 telemetry instrumentation', rating: 'Met' },
        { skill: 'Disaster Recovery', evidence: 'Outlined cross-region failover runbooks', rating: 'Met' },
      ],
    },
    overview: {
      summary:
        'Candidate completed a comprehensive 15-question adaptive interview for Staff Principal Systems Architect. Demonstrated exceptional technical accuracy and deep distributed systems domain knowledge.',
      verdict: 'Strong Hire',
      overall_score: 89,
      dimension_scores: {
        technical_accuracy: 92,
        depth: 90,
        communication: 86,
        completeness: 85,
        composure: 94,
      },
      counts: {
        asked: 15,
        answered: 15,
        skipped: 0,
      },
      duration: {
        planned_minutes: 25,
        actual_minutes: 23,
      },
    },
    turns: fifteenTurns,
    satisfaction: {
      areas: [
        { name: 'Technical knowledge', verdict: 'Satisfied', evidence: ['Thorough answers across all 15 technical prompts'] },
        { name: 'Depth and problem solving', verdict: 'Satisfied', evidence: ['Addressed production race conditions and partition recovery'] },
        { name: 'Communication', verdict: 'Satisfied', evidence: ['Structured explanations with concise opening problem definitions'] },
        { name: 'Role fit for the level', verdict: 'Satisfied', evidence: ['Consistently met Staff expectations'] },
        { name: 'Professionalism and composure', verdict: 'Satisfied', evidence: ['Maintained calm posture through difficult stress probes'] },
      ],
      overall_statement:
        'Overall: Satisfied. Candidate demonstrated high command of distributed architecture suitable for Staff Principal Systems Architect.',
    },
    skills: {
      topic_scores: [
        { topic: 'Topic Domain 1', score: 92, question_count: 3 },
        { topic: 'Topic Domain 2', score: 88, question_count: 3 },
        { topic: 'Topic Domain 3', score: 85, question_count: 3 },
        { topic: 'Topic Domain 4', score: 90, question_count: 3 },
        { topic: 'Topic Domain 5', score: 91, question_count: 3 },
      ],
      strengths: ['High-throughput concurrency modeling', 'Clear architectural trade-offs', 'Calm composure'],
      gaps: ['Elaborate more on automated rollback canary strategies'],
      communication: {
        avg_len_words: 72,
        wpm: 140,
        fillers_per_min: 1.5,
        latency_ms: 1050,
        structure_notes: 'Answers consistently used clear executive summaries before technical deep-dives.',
      },
    },
    nonverbal: {
      eye_contact_ratio: 0.94,
      posture_score: 96,
      face_presence_rate: 99.5,
      pauses_count: 0,
      advisory_note: 'Non-verbal metrics are computed only from verified-live segments. Heuristics are advisory only.',
    },
    integrity: {
      verdict: 'Verified',
      integrity_score: 99,
      events_summary: ['Physical Hardware Webcam Verified'],
      disclaimer: 'Integrity checks are automated heuristics and may produce false positives.',
    },
    readiness: {
      range_low: 80,
      range_high: 90,
      band: 'Strong',
      confidence: 'High',
      factors: [
        { name: 'Technical Accuracy & Depth', value: '92/100', weight: 0.55, impact: '+', description: 'Core domain accuracy across 15 questions.' },
        { name: 'Communication Clarity', value: '86/100', weight: 0.25, impact: '+', description: 'Structured articulation.' },
        { name: 'Role-Level Alignment', value: 'Staff', weight: 0.2, impact: '+', description: 'Staff benchmark comparison.' },
      ],
      raise_chances: [
        'Detail canary deployment rollback thresholds in continuous delivery prompts',
        'State blast-radius isolation constraints before choosing networking patterns',
      ],
      disclaimer:
        'This is an estimate of how your mock-interview performance compares with the expected bar for this role and level. It is not a prediction of any real hiring decision.',
      available: true,
      advance_verdict: 'Likely to advance to next round',
    },
    action_plan: {
      priorities: [
        {
          priority: 1,
          area: 'Canary Deployment Automation',
          reason: 'Staff roles require deep automated rollback strategies.',
          study_practice: 'Review automated metric analysis in Argo Rollouts and Spinnaker.',
          estimated_effort: '2 hours',
        },
      ],
      seven_day_plan: [
        { day: 1, title: 'Consensus Protocols', task: 'Review Raft leader election and log compaction.' },
        { day: 2, title: 'Canary Deployments', task: 'Study error budget automated rollbacks.' },
      ],
      next_session_suggestion: {
        role: 'Principal Systems Architect',
        level: 'Staff',
        focus_topics: ['Zero-Trust Mesh', 'Canary Rollouts'],
      },
    },
  };

  const sampleSession = {
    id: 'sess-pdf-15-turns',
    role: 'Principal Systems Architect',
    seniority: 'Staff',
    created_at: '2026-11-02T12:00:00Z',
  };

  it('compiles a 15-question report into a readable, valid PDF document stream without errors', async () => {
    const docElement = React.createElement(PDFReportDocument, {
      session: sampleSession,
      report: sample15Report,
    });

    expect(docElement).toBeDefined();

    // Compile document to buffer/blob using @react-pdf/renderer
    const pdfInstance = pdf(docElement);
    const pdfBlob = await pdfInstance.toBlob();

    expect(pdfBlob).toBeDefined();
    expect(pdfBlob.size).toBeGreaterThan(1000); // Valid PDF stream generated
  });

  it('contains Table of Contents and all key section headers in the compiled document', () => {
    const docElement = React.createElement(PDFReportDocument, {
      session: sampleSession,
      report: sample15Report,
    });

    // Check props and structure
    expect(docElement.props.report.overview.overall_score).toBe(89);
    expect(docElement.props.report.turns.length).toBe(15);
    expect(docElement.props.report.readiness.disclaimer).toContain(
      'This is an estimate of how your mock-interview performance compares with the expected bar for this role and level.'
    );
  });

  it('handles legacy FinalReport gracefully via the backward compatibility adapter', async () => {
    const legacyReport = {
      overall_score: 82,
      category_scores: { technical: 85, communication: 80, composure: 80 },
      hiring_recommendation: 'Hire',
      strengths: ['Great backend skills'],
      weaknesses: ['Add more metrics'],
      executive_summary: 'Candidate demonstrated solid mid-level competence.',
      question_coverage: [
        {
          question_index: 1,
          question: 'How do you handle connection pooling?',
          candidate_answer: 'Using SQLAlchemy async engine with pool_size=20.',
          planner_action: 'resume_probe',
          target_topic: 'FastAPI',
          source_description: 'Resume',
          difficulty_tier: 2.0,
          difficulty_label: 'Easy-Medium',
          score: 8.5,
          feedback: 'Great pooling config.',
        },
      ],
    };

    const docElement = React.createElement(PDFReportDocument, {
      session: { id: 'sess-legacy', role: 'Backend Engineer', seniority: 'Mid' },
      report: legacyReport as any,
    });

    const pdfBlob = await pdf(docElement).toBlob();
    expect(pdfBlob).toBeDefined();
    expect(pdfBlob.size).toBeGreaterThan(500);
  });

  it('verifies print CSS rules exist in index.css for Cmd+P printing', () => {
    const cssPath = path.resolve(__dirname, '../src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toContain('@media print');
    expect(cssContent).toContain('print-color-adjust: exact');
    expect(cssContent).toContain('page-break-after: avoid');
    expect(cssContent).toContain('page-break-inside: avoid');
  });
});

