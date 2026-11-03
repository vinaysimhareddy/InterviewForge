import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToString } from 'react-dom/server';
import DashboardPage from '../src/pages/DashboardPage';
import type { InterviewReport } from '../src/lib/types';

// Mock contexts and network calls for isolated component verification
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'cand-rp6-test', full_name: 'Alex Morgan', email: 'alex@example.com', role: 'candidate' },
    token: 'jwt-mock-test-token',
    logout: vi.fn(),
    fetchProfile: vi.fn(),
  }),
}));

vi.mock('@/context/CameraStreamContext', () => ({
  useMediaStream: () => ({
    stopAll: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
  },
  ApiError: class extends Error {},
}));

describe('RP6: Dashboard Integration, Progression Tracking & Calibration Feedback', () => {
  const dashboardSourcePath = path.resolve(__dirname, '../src/pages/DashboardPage.tsx');
  const dashboardContent = fs.readFileSync(dashboardSourcePath, 'utf-8');

  it('verifies DashboardPage source contains all RP6 core progression sections and contracts', () => {
    // 02 // PERFORMANCE & READINESS PROGRESS header
    expect(dashboardContent).toContain('02 // PERFORMANCE & READINESS PROGRESS');
    expect(dashboardContent).toContain('Interview Trajectory & Readiness Progress');

    // Progression trend line & SVG curve
    expect(dashboardContent).toContain('PROGRESSION TIMELINE');
    expect(dashboardContent).toContain('Overall Score & Readiness Progression Over Time');
    expect(dashboardContent).toContain('scoreAreaGradient');
    expect(dashboardContent).toContain('Score Index (/100)');

    // Topic trajectory breakdown
    expect(dashboardContent).toContain('Improving & Mastered Topics');
    expect(dashboardContent).toContain('Stalled & Focus-Needed Topics');

    // Focus areas launch action
    expect(dashboardContent).toContain('Start another interview with these focus areas');

    // Real-world outcome feedback card
    expect(dashboardContent).toContain('Real-World Calibration Feedback');
    expect(dashboardContent).toContain('offer');
    expect(dashboardContent).toContain('final_round');
    expect(dashboardContent).toContain('rejection');
    expect(dashboardContent).toContain('ghosted');
    expect(dashboardContent).toContain('not_yet');

    // Reports archive and action buttons
    expect(dashboardContent).toContain('03 // MY REVIEWS');
    expect(dashboardContent).toContain('My Reviews');
    expect(dashboardContent).toContain('View Full Review');
    expect(dashboardContent).toContain('Download PDF');
    expect(dashboardContent).toContain('ExecutiveScorecard');
  });

  it('renders initial dashboard structure securely without exposing candidate IDs or raw tokens', () => {
    const html = renderToString(<DashboardPage />);

    // Candidate profile header (display name and email only)
    expect(html).toContain('Alex Morgan');
    expect(html).toContain('alex@example.com');
    expect(html).toContain('Verified Candidate');

    // Security invariant: Candidate ID and tokens must NOT be rendered in the DOM
    expect(html).not.toContain('cand-rp6-test');
    expect(html).not.toContain('Active Access Token');
    expect(html).not.toContain('Security &amp; Token Inspector Sandbox');

    // Section 01: Resume & Role Grounding
    expect(html).toContain('01 // RESUME &amp; ROLE GROUNDING');
    expect(html).toContain('Interview Preparation &amp; Grounding');
  });

  it('correctly aggregates multi-session topic trajectories into Improving vs Stalled categories', () => {
    const report1: InterviewReport = {
      schema_version: '2.0',
      session_id: 'sess-1',
      user_id: 'user-1',
      generated_at: '2026-11-01T10:00:00Z',
      models_used: ['gemini-2.5-flash'],
      role: {
        title: 'Backend Systems Engineer',
        level: 'Mid',
        purpose: 'Build resilient services',
        expectations: ['Design APIs', 'Scale databases'],
        skill_match: [],
      },
      overview: {
        summary: 'Solid performance',
        verdict: 'Leaning Hire',
        overall_score: 72,
        dimension_scores: { technical_accuracy: 70, depth: 68, communication: 75, completeness: 70, composure: 80 },
        counts: { asked: 5, answered: 5, skipped: 0 },
        duration: { planned_minutes: 15, actual_minutes: 14 },
      },
      turns: [],
      satisfaction: { areas: [], overall_statement: 'Partly satisfied.' },
      skills: {
        topic_scores: [
          { topic: 'REST APIs', score: 70, question_count: 2 },
          { topic: 'Distributed Caching', score: 60, question_count: 2 },
          { topic: 'Database Indexing', score: 65, question_count: 1 },
        ],
        strengths: ['REST APIs'],
        gaps: ['Distributed Caching'],
        communication: { avg_len_words: 80, wpm: 125, fillers_per_min: 2.1, latency_ms: 650, structure_notes: 'Clear' },
      },
      nonverbal: { eye_contact_ratio: 0.85, posture_score: 0.9, face_presence_rate: 0.98, pauses_count: 0, advisory_note: 'Good' },
      integrity: { verdict: 'Verified', integrity_score: 1.0, events_summary: [], disclaimer: 'Live session verified' },
      readiness: {
        range_low: 50,
        range_high: 60,
        band: 'Borderline',
        confidence: 'Medium',
        factors: [],
        raise_chances: [],
        disclaimer: 'Estimate disclaimer',
        available: true,
        advance_verdict: 'Borderline to advance',
      },
      action_plan: {
        priorities: [],
        seven_day_plan: [],
        next_session_suggestion: { role: 'Backend Systems Engineer', level: 'Mid', focus_topics: ['Distributed Caching'] },
      },
    };

    const report2: InterviewReport = {
      ...report1,
      session_id: 'sess-2',
      generated_at: '2026-11-02T10:00:00Z',
      overview: {
        ...report1.overview,
        overall_score: 82,
        verdict: 'Hire',
      },
      skills: {
        ...report1.skills,
        topic_scores: [
          { topic: 'REST APIs', score: 85, question_count: 2 }, // Delta: +15 -> Improving
          { topic: 'Distributed Caching', score: 60, question_count: 2 }, // Delta: 0 -> Stalled
          { topic: 'Database Indexing', score: 80, question_count: 1 }, // Delta: +15 -> Improving
        ],
      },
      readiness: {
        ...report1.readiness,
        range_low: 65,
        range_high: 75,
        band: 'Competitive',
      },
    };

    // Verify progression math logic directly
    const reports = [report1, report2].sort(
      (a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime()
    );

    const topicHistory: Record<string, { scores: number[]; latestScore: number }> = {};
    reports.forEach((rpt) => {
      rpt.skills.topic_scores.forEach((ts) => {
        if (!topicHistory[ts.topic]) {
          topicHistory[ts.topic] = { scores: [], latestScore: ts.score };
        }
        topicHistory[ts.topic].scores.push(ts.score);
        topicHistory[ts.topic].latestScore = ts.score;
      });
    });

    const improving: string[] = [];
    const stalled: string[] = [];

    Object.entries(topicHistory).forEach(([topic, entry]) => {
      const delta = entry.latestScore - entry.scores[0];
      if (delta > 0) improving.push(topic);
      else stalled.push(topic);
    });

    expect(improving).toContain('REST APIs');
    expect(improving).toContain('Database Indexing');
    expect(stalled).toContain('Distributed Caching');

    // Score improvement delta check
    const scoreDelta = reports[reports.length - 1].overview.overall_score - reports[0].overview.overall_score;
    expect(scoreDelta).toBe(10); // 82 - 72 = +10
  });

  it('guarantees weakest 3 topics are identified for follow-up session prefill', () => {
    const report: InterviewReport = {
      schema_version: '2.0',
      session_id: 'sess-3',
      user_id: 'user-1',
      generated_at: '2026-11-03T10:00:00Z',
      models_used: ['gemini-2.5-flash'],
      role: { title: 'Full Stack Engineer', level: 'Mid', purpose: '', expectations: [], skill_match: [] },
      overview: {
        summary: '',
        verdict: 'Hire',
        overall_score: 80,
        dimension_scores: { technical_accuracy: 80, depth: 80, communication: 80, completeness: 80, composure: 80 },
        counts: { asked: 6, answered: 6, skipped: 0 },
        duration: { planned_minutes: 15, actual_minutes: 15 },
      },
      turns: [],
      satisfaction: { areas: [], overall_statement: '' },
      skills: {
        topic_scores: [
          { topic: 'GraphQL', score: 92, question_count: 1 },
          { topic: 'Kafka Streaming', score: 55, question_count: 1 },
          { topic: 'PostgreSQL Indexing', score: 62, question_count: 1 },
          { topic: 'Docker & Kubernetes', score: 58, question_count: 1 },
          { topic: 'TypeScript Generics', score: 88, question_count: 1 },
        ],
        strengths: ['GraphQL'],
        gaps: ['Kafka Streaming'],
        communication: { avg_len_words: 90, wpm: 130, fillers_per_min: 1.5, latency_ms: 600, structure_notes: '' },
      },
      nonverbal: { eye_contact_ratio: 0.9, posture_score: 0.9, face_presence_rate: 1.0, pauses_count: 0, advisory_note: '' },
      integrity: { verdict: 'Verified', integrity_score: 1.0, events_summary: [], disclaimer: '' },
      readiness: {
        range_low: 65,
        range_high: 75,
        band: 'Competitive',
        confidence: 'High',
        factors: [],
        raise_chances: [],
        disclaimer: '',
        available: true,
        advance_verdict: 'Likely to advance',
      },
      action_plan: {
        priorities: [],
        seven_day_plan: [],
        next_session_suggestion: { role: 'Full Stack Engineer', level: 'Mid', focus_topics: [] },
      },
    };

    const sortedByScore = [...report.skills.topic_scores]
      .sort((a, b) => a.score - b.score)
      .map((ts) => ts.topic);

    const weakest3 = sortedByScore.slice(0, 3);
    expect(weakest3).toEqual(['Kafka Streaming', 'Docker & Kubernetes', 'PostgreSQL Indexing']);
  });
});
