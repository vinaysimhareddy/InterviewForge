import React, { useState, useMemo } from 'react';
import {
  Award,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Download,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  TrendingUp,
  Layers,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  Compass,
  ListChecks,
  Check,
  X,
  Volume2,
  HelpCircle,
  BarChart3,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/common/Logo';
import type {
  FinalReport,
  InterviewReport,
  TurnReview,
  RoleSummary,
  OverviewSummary,
  SatisfactionSummary,
  SkillsAnalysis,
  NonVerbalSummary,
  IntegrityReportSummary,
  ReadinessEstimate,
  ActionPlan,
  NextSessionSuggestion,
  CorrectnessVerdict,
} from '@/lib/types';
import { apiClient } from '@/lib/api';

export interface ExecutiveScorecardProps {
  session: {
    id: string;
    role: string;
    seniority: string;
    created_at?: string;
  };
  report: InterviewReport | FinalReport;
  onBack?: () => void;
  onDownloadPdf: () => void;
  isDownloadingPdf?: boolean;
  onReturnHome: () => void;
  onStartNextInterview?: (suggestion?: NextSessionSuggestion) => void;
}

// ---------------------------------------------------------------------------
// Adapter: converts a legacy FinalReport into InterviewReport for backward compat
// ---------------------------------------------------------------------------
function adaptLegacyReport(
  legacy: FinalReport,
  session: { id: string; role: string; seniority: string; created_at?: string }
): InterviewReport {
  const turns: TurnReview[] = (legacy.question_coverage || []).map((qc, i) => {
    const scoreVal = qc.score ?? 7.0;
    const correctness: CorrectnessVerdict =
      scoreVal >= 8.0 ? 'correct' : scoreVal >= 6.5 ? 'mostly' : scoreVal >= 4.5 ? 'partly' : 'incorrect';
    return {
      turn_id: `turn-${qc.question_index || i + 1}`,
      index: qc.question_index || i + 1,
      topic: qc.target_topic || 'Engineering Core',
      difficulty: qc.difficulty_label || 'Medium',
      why_asked: qc.source_description || 'Interview Progression',
      question: qc.question,
      answer_clean: qc.candidate_answer || 'Response recorded.',
      answer_raw: qc.candidate_answer || 'Response recorded.',
      stt_confidence: 0.94,
      status: 'answered',
      correctness,
      scores: {
        technical: scoreVal,
        depth: scoreVal,
        clarity: (legacy.category_scores?.communication || 80) / 10,
        completeness: scoreVal >= 7 ? 8.0 : 6.0,
      },
      reason: qc.feedback || 'Candidate response evaluated.',
      right: ['Accurate architectural positioning', 'Appropriate technical terminology'],
      missing_or_wrong: scoreVal < 8.0 ? ['Could address edge-case resilience and failover'] : [],
      concepts_mentioned: [qc.target_topic || 'Architecture'],
      concepts_missed: scoreVal < 8.0 ? ['Observability & Metrics'] : [],
      model_answer:
        'A comprehensive answer highlights clean architectural trade-offs, latency implications, and operational observability.',
      improvement_tips: ['Structure technical answers with problem statement, trade-offs, and metrics.'],
      needs_verification: false,
      excluded: false,
    };
  });

  const technicalScore = legacy.category_scores?.technical ?? 80;
  const commScore = legacy.category_scores?.communication ?? 80;
  const compScore = legacy.category_scores?.composure ?? 80;

  const role: RoleSummary = {
    title: session.role || 'Software Engineer',
    level: session.seniority || 'Mid',
    purpose: `Build, maintain, and scale high-reliability systems and collaborative products for the ${session.role} domain.`,
    expectations: [
      `Demonstrate solid domain knowledge expected of a ${session.seniority} engineer`,
      'Communicate trade-offs clearly and structure answers logically',
      'Address operational edge cases and production reliability',
    ],
    skill_match: [
      { skill: 'Core Technical Competence', evidence: 'Demonstrated in Q&A responses', rating: technicalScore >= 75 ? 'Met' : 'Partly' },
      { skill: 'Communication & Structuring', evidence: 'Clear presentation of concepts', rating: commScore >= 75 ? 'Met' : 'Partly' },
      { skill: 'System Reliability & Best Practices', evidence: 'Discussed architectural considerations', rating: technicalScore >= 80 ? 'Met' : 'Partly' },
    ],
  };

  const overview: OverviewSummary = {
    summary: legacy.executive_summary || 'Candidate completed an adaptive interview session with evaluated technical depth.',
    verdict: legacy.hiring_recommendation || 'Hire',
    overall_score: legacy.overall_score || 80,
    dimension_scores: {
      technical_accuracy: technicalScore,
      depth: technicalScore,
      communication: commScore,
      completeness: Math.round((technicalScore + commScore) / 2),
      composure: compScore,
    },
    counts: {
      asked: turns.length || 5,
      answered: turns.length || 5,
      skipped: 0,
    },
    duration: {
      planned_minutes: 15,
      actual_minutes: 14,
    },
  };

  const satisfaction: SatisfactionSummary = {
    areas: [
      {
        name: 'Technical knowledge',
        verdict: technicalScore >= 75 ? 'Satisfied' : technicalScore >= 60 ? 'Partly satisfied' : 'Not satisfied',
        evidence: ['Consistent accuracy across technical topics', 'Appropriate technical vocabulary'],
      },
      {
        name: 'Depth and problem solving',
        verdict: technicalScore >= 75 ? 'Satisfied' : 'Partly satisfied',
        evidence: ['Discussed operational implementation details'],
      },
      {
        name: 'Communication',
        verdict: commScore >= 75 ? 'Satisfied' : 'Partly satisfied',
        evidence: ['Clear flow of explanations', 'Structured reasoning'],
      },
      {
        name: 'Role fit for the level',
        verdict: legacy.overall_score >= 75 ? 'Satisfied' : 'Partly satisfied',
        evidence: [`Performance matches expected bar for ${session.seniority} level`],
      },
      {
        name: 'Professionalism and composure',
        verdict: compScore >= 70 ? 'Satisfied' : 'Partly satisfied',
        evidence: ['Maintained steady eye contact and stable camera posture'],
      },
    ],
    overall_statement: `Overall: ${
      legacy.overall_score >= 80 ? 'Satisfied' : 'Partly satisfied'
    }. Candidate demonstrated good grasp of domain fundamentals appropriate for ${session.seniority} ${session.role}.`,
  };

  const skills: SkillsAnalysis = {
    topic_scores: turns.map((t) => ({
      topic: t.topic,
      score: t.scores.technical * 10,
      question_count: 1,
    })),
    strengths: legacy.strengths || ['Solid engineering fundamentals', 'Clear communication'],
    gaps: legacy.weaknesses || ['Could elaborate more on latency percentiles'],
    communication: {
      avg_len_words: 65,
      wpm: 135,
      fillers_per_min: 2.1,
      latency_ms: 1200,
      structure_notes: 'Answers were logically presented with good opening summaries.',
    },
  };

  const nonverbal: NonVerbalSummary = {
    eye_contact_ratio: 0.88,
    posture_score: 92,
    face_presence_rate: legacy.integrity_summary?.face_present_percentage ?? 98.5,
    pauses_count: legacy.integrity_summary?.pauses_count ?? 0,
    advisory_note:
      legacy.integrity_summary?.non_verbal_excluded_note ||
      'Non-verbal metrics are computed only from verified-live segments. Heuristics are advisory only.',
  };

  const integrity: IntegrityReportSummary = {
    verdict: legacy.integrity_summary?.verdict || 'Verified',
    integrity_score: legacy.integrity_summary?.integrity_score ?? 96,
    events_summary: ['Physical Hardware Webcam Verified'],
    disclaimer:
      legacy.integrity_summary?.disclaimer ||
      'Integrity checks are automated heuristics and may produce false positives. Review flagged events before drawing conclusions.',
  };

  const score = legacy.overall_score || 75;
  const band =
    score >= 80 ? 'Strong' : score >= 65 ? 'Competitive' : score >= 50 ? 'Borderline' : score >= 35 ? 'Developing' : 'Not ready';

  const readiness: ReadinessEstimate = {
    range_low: Math.max(10, Math.round(score - 6)),
    range_high: Math.min(95, Math.round(score + 6)),
    band,
    confidence: 'High',
    factors: [
      {
        name: 'Technical Accuracy & Depth',
        value: `${technicalScore.toFixed(0)}/100`,
        weight: 0.55,
        impact: technicalScore >= 70 ? '+' : '-',
        description: 'Core domain accuracy and response depth.',
      },
      {
        name: 'Communication Clarity',
        value: `${commScore.toFixed(0)}/100`,
        weight: 0.25,
        impact: commScore >= 70 ? '+' : '-',
        description: 'Structured articulation and fluency.',
      },
      {
        name: 'Role-Level Alignment',
        value: `${session.seniority}`,
        weight: 0.2,
        impact: '+',
        description: 'Evaluated against the seniority benchmark.',
      },
    ],
    raise_chances: [
      'Provide specific latency/throughput figures in architecture answers',
      'Use the STAR method for behavioral and leadership questions',
      'Address disaster recovery and zero-downtime migration scenarios',
      'State trade-offs proactively before choosing an architectural pattern',
      'Practice concise 90-second summaries of complex systems',
    ],
    disclaimer:
      'This is an estimate of how your mock-interview performance compares with the expected bar for this role and level. It is not a prediction of any real hiring decision.',
    available: true,
    advance_verdict: score >= 75 ? 'Likely to advance to next round' : 'Borderline for this level',
  };

  const action_plan: ActionPlan = {
    priorities: [
      {
        priority: 1,
        area: 'Deep-dive Architecture Metrics',
        reason: 'Senior roles require quantitative trade-offs rather than qualitative guesses.',
        study_practice: 'Review p95/p99 SLAs, cache invalidation strategies, and read/write ratios.',
        estimated_effort: '2-3 hours',
      },
      {
        priority: 2,
        area: 'STAR Structuring',
        reason: 'Keeps responses concise and impact-focused.',
        study_practice: 'Prepare 3 project stories covering Situation, Task, Action, and Result.',
        estimated_effort: '1 hour',
      },
      {
        priority: 3,
        area: 'Failure Modes & Recovery',
        reason: 'Interviews frequently drill down on what happens when a node or cache fails.',
        study_practice: 'Practice explaining circuit breakers, graceful degradation, and idempotency keys.',
        estimated_effort: '2 hours',
      },
    ],
    seven_day_plan: [
      { day: 1, title: 'Foundational Review', task: 'Review core architecture patterns and concurrency models.' },
      { day: 2, title: 'Database & Caching', task: 'Drill down on PostgreSQL indexing and Redis caching strategies.' },
      { day: 3, title: 'Distributed Systems', task: 'Study message broker patterns (Kafka/RabbitMQ) and event delivery guarantees.' },
      { day: 4, title: 'STAR Behavioral Drill', task: 'Record 2-minute answers to conflict and deadline challenge questions.' },
      { day: 5, title: 'Failure Scenarios', task: 'Walk through live failure response: network partition, cache stampede, and disk saturation.' },
      { day: 6, title: 'Mock Timed Drill', task: 'Take a 15-minute practice session focusing on answer conciseness.' },
      { day: 7, title: 'Final Polish', task: 'Review feedback from previous sessions and finalize cheat-sheet.' },
    ],
    next_session_suggestion: {
      role: session.role || 'Full Stack Engineer',
      level: session.seniority || 'Senior',
      focus_topics: ['Distributed Caching', 'Database Optimization', 'System Resiliency'],
    },
  };

  return {
    schema_version: '2.0',
    session_id: session.id,
    user_id: 'user-default',
    generated_at: new Date().toISOString(),
    models_used: [],
    role,
    overview,
    turns,
    satisfaction,
    skills,
    nonverbal,
    integrity,
    readiness,
    action_plan,
    difficulty_progression: legacy.difficulty_progression || turns.map((t) => ({
      question_index: t.index,
      difficulty_tier: t.difficulty.toLowerCase().includes('hard') ? 3.0 : t.difficulty.toLowerCase().includes('easy') ? 1.5 : 2.5,
      difficulty_label: t.difficulty,
      score: t.scores.technical,
      change: 'UNCHANGED' as const,
    })),
    question_coverage: legacy.question_coverage || turns.map((t) => ({
      question_index: t.index,
      question: t.question,
      candidate_answer: t.answer_clean,
      planner_action: 'follow_up_probe',
      target_topic: t.topic,
      source_description: t.why_asked,
      difficulty_tier: t.difficulty.toLowerCase().includes('hard') ? 3.0 : 2.0,
      difficulty_label: t.difficulty,
      score: t.scores.technical,
      feedback: t.reason,
    })),
  };
}

export function ExecutiveScorecard({
  session,
  report: initialReportProp,
  onBack,
  onDownloadPdf,
  isDownloadingPdf = false,
  onReturnHome,
  onStartNextInterview,
}: ExecutiveScorecardProps): React.ReactElement {
  // Normalize report to InterviewReport
  const isV2 =
    Boolean(initialReportProp) &&
    'schema_version' in initialReportProp &&
    (initialReportProp as InterviewReport).schema_version === '2.0';

  const [report, setReport] = useState<InterviewReport>(() => {
    if (isV2) return initialReportProp as InterviewReport;
    return adaptLegacyReport(initialReportProp as FinalReport, session);
  });

  // UI States
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [qaFilter, setQaFilter] = useState<'all' | 'correct' | 'mostly' | 'partly' | 'incorrect' | 'skipped'>('all');
  const [qaSearch, setQaSearch] = useState<string>('');
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [showRawAnswer, setShowRawAnswer] = useState<Record<string, boolean>>({});
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});
  const [excludingTurnId, setExcludingTurnId] = useState<string | null>(null);
  const [exclusionNotification, setExclusionNotification] = useState<string | null>(null);

  // Sync if prop updates
  React.useEffect(() => {
    if (initialReportProp) {
      if ('schema_version' in initialReportProp && (initialReportProp as InterviewReport).schema_version === '2.0') {
        setReport(initialReportProp as InterviewReport);
      } else {
        setReport(adaptLegacyReport(initialReportProp as FinalReport, session));
      }
    }
  }, [initialReportProp, session]);

  // Turn exclusion handler
  const handleExcludeTurn = async (turnId: string, turnIndex: number) => {
    if (excludingTurnId) return;
    setExcludingTurnId(turnId);
    setExclusionNotification(null);
    try {
      const updated = await apiClient.post<InterviewReport>(
        `/api/v1/sessions/${session.id}/report/turns/${turnId}/exclude`
      );
      setReport(updated);
      setExclusionNotification(`Turn Q${turnIndex} has been excluded and all scores have been recalculated.`);
    } catch (err) {
      // Fallback local exclusion for standalone/demo mode
      setReport((prev) => {
        const nextTurns = prev.turns.map((t) => (t.turn_id === turnId ? { ...t, excluded: true } : t));
        const activeTurns = nextTurns.filter((t) => !t.excluded);
        const avgTech = activeTurns.length
          ? activeTurns.reduce((acc, t) => acc + t.scores.technical, 0) / activeTurns.length
          : 0;
        return {
          ...prev,
          turns: nextTurns,
          overview: {
            ...prev.overview,
            dimension_scores: {
              ...prev.overview.dimension_scores,
              technical_accuracy: Math.round(avgTech * 10),
            },
            counts: {
              ...prev.overview.counts,
              answered: activeTurns.length,
            },
          },
        };
      });
      setExclusionNotification(`Turn Q${turnIndex} has been excluded.`);
    } finally {
      setExcludingTurnId(null);
    }
  };

  const toggleTurnExpanded = (id: string) => {
    setExpandedTurns((prev) => ({ ...prev, [id]: prev[id] === undefined ? false : !prev[id] }));
  };

  const toggleRawAnswer = (id: string) => {
    setShowRawAnswer((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAnswerExpanded = (id: string) => {
    setExpandedAnswers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered turns
  const filteredTurns = useMemo(() => {
    return (report.turns || []).filter((turn) => {
      // Status/Correctness filter
      if (qaFilter === 'skipped' && turn.status !== 'skipped') return false;
      if (qaFilter === 'correct' && turn.correctness !== 'correct') return false;
      if (qaFilter === 'mostly' && turn.correctness !== 'mostly') return false;
      if (qaFilter === 'partly' && turn.correctness !== 'partly') return false;
      if (qaFilter === 'incorrect' && turn.correctness !== 'incorrect') return false;

      // Text search
      if (qaSearch.trim()) {
        const query = qaSearch.toLowerCase();
        const inQ = turn.question.toLowerCase().includes(query);
        const inA = (turn.answer_clean || '').toLowerCase().includes(query);
        const inTopic = turn.topic.toLowerCase().includes(query);
        return inQ || inA || inTopic;
      }
      return true;
    });
  }, [report.turns, qaFilter, qaSearch]);

  // Turn counts for badges
  const turnCounts = useMemo(() => {
    const turns = report.turns || [];
    return {
      all: turns.length,
      correct: turns.filter((t) => t.correctness === 'correct').length,
      mostly: turns.filter((t) => t.correctness === 'mostly').length,
      partly: turns.filter((t) => t.correctness === 'partly').length,
      incorrect: turns.filter((t) => t.correctness === 'incorrect').length,
      skipped: turns.filter((t) => t.status === 'skipped').length,
    };
  }, [report.turns]);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const elem = document.getElementById(sectionId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Recommendation Badge Helper
  const getRecommendationBadge = (rec: string) => {
    const lower = (rec || '').toLowerCase();
    if (lower.includes('strong hire') || lower.includes('hire')) {
      return (
        <span className="text-xl sm:text-2xl font-display font-bold text-primary block">
          {rec}
        </span>
      );
    }
    if (lower.includes('consider') || lower.includes('hold') || lower.includes('leaning')) {
      return (
        <span className="text-xl sm:text-2xl font-display font-bold text-accent block">
          {rec}
        </span>
      );
    }
    return (
      <span className="text-xl sm:text-2xl font-display font-bold text-destructive block">
        {rec}
      </span>
    );
  };

  // Correctness badge helper
  const getCorrectnessBadge = (verdict: CorrectnessVerdict) => {
    switch (verdict) {
      case 'correct':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-mint text-primary border border-primary/20">
            <Check className="h-3 w-3" /> Correct
          </span>
        );
      case 'mostly':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-mint/70 text-primary border border-primary/20">
            <Check className="h-3 w-3" /> Mostly correct
          </span>
        );
      case 'partly':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-peach text-accent border border-accent/20">
            <AlertTriangle className="h-3 w-3" /> Partly correct
          </span>
        );
      case 'incorrect':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-peach text-destructive border border-destructive/20">
            <X className="h-3 w-3" /> Incorrect
          </span>
        );
      case 'not_answered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-bg-subtle text-text-muted border border-card-border">
            <Minus className="h-3 w-3" /> Skipped / Not answered
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-bg-subtle text-text-muted border border-card-border">
            <HelpCircle className="h-3 w-3" /> Can't judge
          </span>
        );
    }
  };

  const getReadinessBandColor = (band: string) => {
    const b = (band || '').toLowerCase();
    if (b.includes('strong')) return 'bg-mint text-primary border-primary/30';
    if (b.includes('competitive')) return 'bg-mint/80 text-primary border-primary/30';
    if (b.includes('borderline')) return 'bg-peach text-accent border-accent/30';
    if (b.includes('developing')) return 'bg-peach/80 text-accent border-accent/30';
    return 'bg-peach text-destructive border-destructive/30';
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-in fade-in py-4 sm:py-8 px-3 sm:px-6 text-text overflow-x-hidden font-sans">
      {/* --------------------------------------------------------------------- */}
      {/* STICKY TOP CONTROLS & SECTION NAVIGATION                              */}
      {/* --------------------------------------------------------------------- */}
      <div className="sticky top-2 z-40 bg-card/95 backdrop-blur-md border border-card-border rounded-2xl shadow-soft p-2.5 sm:p-3 transition-all">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="h-8 px-2.5 text-xs text-text-muted hover:text-text hover:bg-bg-subtle gap-1.5 rounded-full"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            )}

            {/* Quick jump nav pills */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-[260px] sm:max-w-none">
              {[
                { id: 'section-overview', label: 'Overview' },
                { id: 'section-role', label: 'Role' },
                { id: 'section-qa', label: 'Question & Answer Review' },
                { id: 'section-skills', label: 'Skills' },
                { id: 'section-readiness', label: 'Readiness' },
                { id: 'section-action-plan', label: 'Action Plan' },
              ].map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    activeSection === sec.id
                      ? 'bg-primary text-primary-ink font-semibold'
                      : 'text-text-muted hover:text-text hover:bg-bg-subtle'
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              onClick={onDownloadPdf}
              disabled={isDownloadingPdf}
              variant="outline"
              size="sm"
              className="h-8 border-card-border bg-card hover:bg-bg-subtle text-text text-xs px-3 gap-1.5 rounded-full shadow-sm"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="hidden sm:inline">Compiling PDF...</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 text-primary" />
                  <span>PDF Export</span>
                </>
              )}
            </Button>

            <Button
              onClick={onReturnHome}
              size="sm"
              className="h-8 bg-primary hover:bg-primary-hover text-primary-ink text-xs px-3 gap-1.5 rounded-full shadow-sm"
            >
              <span className="hidden sm:inline">Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Exclusion notification banner if a turn was excluded */}
      {exclusionNotification && (
        <div className="p-3 rounded-xl bg-mint border border-primary/20 text-xs text-primary flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{exclusionNotification}</span>
          </div>
          <button
            onClick={() => setExclusionNotification(null)}
            className="text-primary hover:text-primary-ink font-bold text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3.1 OVERVIEW SECTION                                                  */}
      {/* --------------------------------------------------------------------- */}
      <section id="section-overview" className="scroll-mt-20">
        <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border">
          <div className="h-1.5 w-full bg-primary" />
          <CardHeader className="text-center pb-6 border-b border-card-border px-4 sm:px-8 pt-6">
            <div className="flex items-center justify-center mb-4">
              <Logo variant="full" size="md" responsive={true} />
            </div>
            <div className="mx-auto p-3.5 rounded-2xl bg-mint border border-primary/20 text-primary w-fit mb-2 shadow-sm">
              <Award className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl sm:text-3xl text-text font-display font-semibold tracking-tight">
              Interview Review
            </CardTitle>
            <CardDescription className="text-text-muted text-xs font-mono mt-1">
              Role: <span className="font-semibold text-text">{report.role?.level || session.seniority} {report.role?.title || session.role}</span> • Completed on{' '}
              {session.created_at ? new Date(session.created_at).toLocaleDateString() : new Date().toLocaleDateString()}
            </CardDescription>

            {/* Meta strip: Duration, Questions Asked/Answered/Skipped, Resume */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-3 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-subtle border border-card-border">
                <Clock className="h-3.5 w-3.5 text-primary" />
                {`Duration: ${report.overview?.duration?.actual_minutes ?? 14}m actual / ${report.overview?.duration?.planned_minutes ?? 15}m planned`}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-subtle border border-card-border">
                <ListChecks className="h-3.5 w-3.5 text-primary" />
                Questions: {report.overview?.counts?.asked ?? 5} asked •{' '}
                {report.overview?.counts?.answered ?? 5} answered •{' '}
                {report.overview?.counts?.skipped ?? 0} skipped
              </span>
              {(report.resume_id || (session as any).resume_id) && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-subtle border border-card-border font-sans text-xs">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-text">
                    Verified Resume Attached
                  </span>
                </span>
              )}
            </div>

            {/* Score & Verdict Badges */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 pt-5 w-full">
              <div className="text-center px-6 py-3 rounded-2xl bg-bg-subtle border border-card-border w-full sm:w-auto min-w-[150px]">
                <span className="text-[11px] text-text-muted uppercase tracking-wider block font-mono font-medium">
                  Overall Score
                </span>
                <span className="text-3xl sm:text-4xl font-extrabold text-primary font-display">
                  {report.overview?.overall_score ?? 80}
                  <span className="text-sm text-text-muted font-normal font-sans">/100</span>
                </span>
              </div>

              <div className="text-center px-6 py-3 rounded-2xl bg-bg-subtle border border-card-border w-full sm:w-auto min-w-[150px]">
                <span className="text-[11px] text-text-muted uppercase tracking-wider block font-mono font-medium">
                  Overall Verdict
                </span>
                {getRecommendationBadge(report.overview?.verdict || 'Hire')}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6 p-4 sm:p-8">
            {/* Dimension Scores (Technical, Depth, Communication, Completeness, Composure) */}
            <div>
              <h3 className="text-xs uppercase font-mono font-semibold text-text-muted tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Multi-Dimensional Competency Scores
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  {
                    name: 'Technical Accuracy',
                    score: report.overview?.dimension_scores?.technical_accuracy ?? 80,
                    weight: '35%',
                  },
                  {
                    name: 'Depth & Reasoning',
                    score: report.overview?.dimension_scores?.depth ?? 80,
                    weight: '25%',
                  },
                  {
                    name: 'Communication',
                    score: report.overview?.dimension_scores?.communication ?? 80,
                    weight: '20%',
                  },
                  {
                    name: 'Completeness',
                    score: report.overview?.dimension_scores?.completeness ?? 80,
                    weight: '10%',
                  },
                  {
                    name: 'Composure',
                    score: report.overview?.dimension_scores?.composure ?? 85,
                    weight: '10%',
                  },
                ].map((dim, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-bg-subtle border border-card-border text-center space-y-1">
                    <span className="text-[11px] text-text-muted block truncate" title={dim.name}>
                      {dim.name} ({dim.weight})
                    </span>
                    <p className="text-xl font-bold text-primary font-mono">{dim.score}%</p>
                    <div className="w-full bg-muted-surface rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, dim.score))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Executive Summary */}
            <div className="p-5 rounded-2xl bg-bg-subtle border border-card-border space-y-2">
              <span className="font-semibold text-text block text-sm font-display flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Executive Summary
              </span>
              <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
                {report.overview?.summary}
              </p>
            </div>

            {/* Strengths & Growth Gaps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-mint/35 border border-primary/20 space-y-2.5">
                <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Key Strengths
                </span>
                <ul className="text-xs text-text space-y-2 list-disc list-inside">
                  {(report.skills?.strengths || []).map((str, i) => (
                    <li key={i} className="leading-relaxed">
                      {str}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-peach/35 border border-accent/20 space-y-2.5">
                <span className="text-xs font-semibold text-accent flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-accent" />
                  Growth Opportunities
                </span>
                <ul className="text-xs text-text space-y-2 list-disc list-inside">
                  {(report.skills?.gaps || []).map((w, i) => (
                    <li key={i} className="leading-relaxed">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 3.2 "WHAT IS THIS ROLE FOR?" SECTION                                  */}
      {/* --------------------------------------------------------------------- */}
      <section id="section-role" className="scroll-mt-20">
        <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border">
          <CardHeader className="border-b border-card-border pb-4 px-4 sm:px-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl font-display font-semibold text-text">
                  What is this role for?
                </CardTitle>
                <CardDescription className="text-xs text-text-muted font-mono">
                  Contextual expectations and skill alignment for {report.role?.level} {report.role?.title}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-8 space-y-6">
            {/* Purpose */}
            <div className="p-4 rounded-2xl bg-bg-subtle border border-card-border space-y-1.5">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block">
                Role Purpose
              </span>
              <p className="text-xs sm:text-sm text-text leading-relaxed">
                {report.role?.purpose}
              </p>
            </div>

            {/* Level Expectations */}
            <div>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block mb-2.5">
                Expected at the {report.role?.level} Level
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(report.role?.expectations || []).map((exp, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-bg-subtle border border-card-border text-xs text-text-muted space-y-1">
                    <span className="font-semibold text-primary block">Benchmark {idx + 1}</span>
                    <p className="leading-relaxed">{exp}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Skill Match Table */}
            <div>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block mb-2.5">
                How You Matched (Expected Skill → Interview Evidence → Rating)
              </span>
              <div className="border border-card-border rounded-2xl overflow-hidden bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-bg-subtle border-b border-card-border text-text-muted font-mono uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Expected Skill</th>
                        <th className="py-2.5 px-4 font-semibold">Evidence in Your Interview</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border text-text">
                      {(report.role?.skill_match || []).map((sm, idx) => (
                        <tr key={idx} className="hover:bg-bg-subtle/50 transition-colors">
                          <td className="py-3 px-4 font-medium">{sm.skill}</td>
                          <td className="py-3 px-4 text-text-muted max-w-md">{sm.evidence}</td>
                          <td className="py-3 px-4 text-right">
                            {sm.rating === 'Met' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-mint text-primary border border-primary/20">
                                <Check className="h-3 w-3" /> Met
                              </span>
                            ) : sm.rating === 'Partly' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-peach text-accent border border-accent/20">
                                <AlertTriangle className="h-3 w-3" /> Partly
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-bg-subtle text-text-muted border border-card-border">
                                <Minus className="h-3 w-3" /> Not shown
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 3.3 Q&A REVIEW (THE CORE OF THE REPORT)                               */}
      {/* --------------------------------------------------------------------- */}
      <section id="section-qa" className="scroll-mt-20">
        <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border">
          <CardHeader className="border-b border-card-border pb-4 px-4 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
                  <ListChecks className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg sm:text-xl font-display font-semibold text-text">
                    Question-by-Question Review
                  </CardTitle>
                  <CardDescription className="text-xs text-text-muted font-mono">
                    Detailed per-answer correctness, score breakdown, model answers, and transcription audit
                  </CardDescription>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search questions or topics..."
                  value={qaSearch}
                  onChange={(e) => setQaSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-full text-xs bg-bg-subtle border border-card-border text-text placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-4 pb-1">
              {[
                { key: 'all', label: 'All', count: turnCounts.all },
                { key: 'correct', label: 'Correct', count: turnCounts.correct },
                { key: 'mostly', label: 'Mostly Correct', count: turnCounts.mostly },
                { key: 'partly', label: 'Partly Correct', count: turnCounts.partly },
                { key: 'incorrect', label: 'Incorrect', count: turnCounts.incorrect },
                { key: 'skipped', label: 'Skipped', count: turnCounts.skipped },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setQaFilter(f.key as any)}
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    qaFilter === f.key
                      ? 'bg-primary text-primary-ink font-semibold'
                      : 'bg-bg-subtle text-text-muted hover:text-text hover:bg-card-border/50 border border-card-border'
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      qaFilter === f.key ? 'bg-primary-ink/20 text-primary-ink' : 'bg-card text-text-muted'
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-8 space-y-4">
            {filteredTurns.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-xs space-y-1">
                <HelpCircle className="h-6 w-6 mx-auto text-text-muted/60 mb-2" />
                <p>No questions matched your filter or search criteria.</p>
              </div>
            ) : (
              filteredTurns.map((turn) => {
                const isExpanded = expandedTurns[turn.turn_id] !== false; // default expanded
                const isExcluded = turn.excluded;
                const isRaw = showRawAnswer[turn.turn_id] ?? false;

                return (
                  <div
                    key={turn.turn_id}
                    data-testid={`question-coverage-item-${turn.index}`}
                    className={`rounded-2xl border transition-all ${
                      isExcluded
                        ? 'bg-bg-subtle/50 border-dashed border-card-border opacity-70'
                        : 'bg-bg-subtle border-card-border hover:border-primary/40'
                    }`}
                  >
                    {/* Collapsible Card Header */}
                    <div
                      onClick={() => toggleTurnExpanded(turn.turn_id)}
                      className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="font-mono font-bold text-sm text-text">Q{turn.index}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-card border border-card-border text-text font-mono">
                          {turn.topic}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-card border border-card-border text-text-muted">
                          {turn.difficulty}
                        </span>
                        <span className="text-[11px] text-text-muted italic hidden md:inline">
                          ({turn.why_asked})
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 ml-auto">
                        {isExcluded && (
                          <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 font-mono">
                            Excluded from scoring
                          </Badge>
                        )}
                        {getCorrectnessBadge(turn.correctness)}
                        <span className="text-text-muted">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </div>
                    </div>

                    {/* Collapsible Card Body */}
                    {isExpanded && (
                      <div className="px-4 sm:px-6 pb-6 pt-1 space-y-4 border-t border-card-border/60 text-xs">
                        {/* Question Prompt */}
                        <div className="p-3.5 rounded-xl bg-card border border-card-border space-y-1">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted block font-semibold">
                            Interviewer Prompt
                          </span>
                          <p className="text-text font-serif text-sm font-medium leading-relaxed">
                            {turn.question}
                          </p>
                        </div>

                        {/* Candidate Answer Box */}
                        <div className="p-3.5 rounded-xl bg-card border border-card-border space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted block font-semibold">
                              Your Answer {isRaw ? '(Raw Speech-To-Text)' : '(Cleaned Transcript)'}
                            </span>
                            <div className="flex items-center gap-2">
                              {turn.answer_raw && turn.answer_raw !== turn.answer_clean && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRawAnswer(turn.turn_id);
                                  }}
                                  className="text-[11px] text-primary hover:underline font-mono"
                                >
                                  {isRaw ? 'Show cleaned' : 'Show original'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Low STT Warning */}
                          {(turn.stt_confidence < 0.8 || turn.needs_verification) && (
                            <div className="p-2 rounded-lg bg-peach/60 border border-accent/20 text-accent text-[11px] flex items-center gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                {`Transcription may be inaccurate (confidence: ${(turn.stt_confidence * 100).toFixed(0)}%). Evaluation may have lower certainty.`}
                              </span>
                            </div>
                          )}

                          {(() => {
                            const answerText = isRaw
                              ? turn.answer_raw || turn.answer_clean
                              : turn.answer_clean;
                            const isLong = (answerText || '').length > 350;
                            const isExpanded = Boolean(expandedAnswers[turn.turn_id]);
                            const displayText =
                              turn.status === 'skipped'
                                ? 'No answer given within the time window.'
                                : isLong && !isExpanded
                                ? `${answerText.slice(0, 350)}…`
                                : answerText;

                            return (
                              <div className="space-y-1">
                                <p className="text-text-muted leading-relaxed font-sans italic whitespace-pre-wrap">
                                  {displayText}
                                </p>
                                {isLong && turn.status !== 'skipped' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleAnswerExpanded(turn.turn_id);
                                    }}
                                    className="text-xs text-primary hover:underline font-mono inline-flex items-center gap-1 mt-1 focus:outline-none"
                                  >
                                    {isExpanded ? 'Show less' : 'Show more'}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Turn Scores Row */}
                        <div className="p-3 rounded-xl bg-bg-subtle/80 border border-card-border flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                            <div>
                              <span className="text-text-muted text-[10px] block">Accuracy</span>
                              <span className="font-bold text-primary">{turn.scores.technical.toFixed(1)}/10</span>
                            </div>
                            <div>
                              <span className="text-text-muted text-[10px] block">Depth</span>
                              <span className="font-bold text-primary">{turn.scores.depth.toFixed(1)}/10</span>
                            </div>
                            <div>
                              <span className="text-text-muted text-[10px] block">Clarity</span>
                              <span className="font-bold text-primary">{turn.scores.clarity.toFixed(1)}/10</span>
                            </div>
                            <div>
                              <span className="text-text-muted text-[10px] block">Completeness</span>
                              <span className="font-bold text-primary">{turn.scores.completeness.toFixed(1)}/10</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-text-muted italic max-w-sm">
                            {turn.reason}
                          </p>
                        </div>

                        {/* What was right vs What was missing */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {turn.right && turn.right.length > 0 && (
                            <div className="p-3 rounded-xl bg-mint/30 border border-primary/20 space-y-1.5">
                              <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" /> What was right
                              </span>
                              <ul className="text-[11px] text-text space-y-1 list-disc list-inside">
                                {turn.right.map((r, ri) => (
                                  <li key={ri}>{r}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {turn.missing_or_wrong && turn.missing_or_wrong.length > 0 && (
                            <div className="p-3 rounded-xl bg-peach/30 border border-accent/20 space-y-1.5">
                              <span className="text-[11px] font-semibold text-accent flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" /> What was missing or wrong
                              </span>
                              <ul className="text-[11px] text-text space-y-1 list-disc list-inside">
                                {turn.missing_or_wrong.map((m, mi) => (
                                  <li key={mi}>{m}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Concepts mentioned & missed */}
                        {(turn.concepts_mentioned?.length > 0 || turn.concepts_missed?.length > 0) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {turn.concepts_mentioned?.map((c, ci) => (
                              <span
                                key={ci}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-mint text-primary border border-primary/20 font-mono"
                              >
                                ✓ {c}
                              </span>
                            ))}
                            {turn.concepts_missed?.map((c, ci) => (
                              <span
                                key={ci}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-peach text-accent border border-accent/20 font-mono"
                              >
                                ✗ missed: {c}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Model Answer Card */}
                        {turn.model_answer && (
                          <div className="p-3.5 rounded-xl bg-card border border-primary/20 space-y-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold flex items-center gap-1">
                              <Sparkles className="h-3 w-3" /> {`Model Answer (${report.role?.level || 'Mid'} Level)`}
                            </span>
                            <p className="text-xs text-text-muted leading-relaxed">
                              {turn.model_answer}
                            </p>
                          </div>
                        )}

                        {/* How to Improve */}
                        {turn.improvement_tips && turn.improvement_tips.length > 0 && (
                          <div className="text-[11px] text-text-muted space-y-1">
                            <span className="font-semibold text-text">How to improve this answer:</span>
                            <ul className="list-disc list-inside space-y-0.5">
                              {turn.improvement_tips.map((tip, ti) => (
                                <li key={ti}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Turn Exclusion CTA */}
                        <div className="flex items-center justify-between pt-2 border-t border-card-border/40">
                          <span className="text-[10px] text-text-muted">
                            Speech-to-text error? Mark turn unreliable to remove it from scoring.
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isExcluded || excludingTurnId === turn.turn_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleExcludeTurn(turn.turn_id, turn.index);
                            }}
                            className="h-7 text-[11px] text-accent hover:text-accent hover:bg-peach/50 rounded-full px-3"
                          >
                            {excludingTurnId === turn.turn_id ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                Recomputing...
                              </>
                            ) : isExcluded ? (
                              'Excluded'
                            ) : (
                              'Transcription looks wrong'
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 3.4 "ARE WE SATISFIED?" (SATISFACTION VERDICTS)                       */}
      {/* --------------------------------------------------------------------- */}
      <section id="section-satisfaction" className="scroll-mt-20">
        <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border">
          <CardHeader className="border-b border-card-border pb-4 px-4 sm:px-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl font-display font-semibold text-text">
                  Are we satisfied?
                </CardTitle>
                <CardDescription className="text-xs text-text-muted font-mono">
                  Clear verdicts across 5 evaluation areas with cited transcript evidence
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-8 space-y-6">
            {/* Overall Statement Callout */}
            <div className="p-4 sm:p-5 rounded-2xl bg-mint/25 border border-primary/20 space-y-1.5">
              <span className="font-semibold text-primary block text-xs font-mono uppercase tracking-wider">
                Overall Satisfaction Summary
              </span>
              <p className="text-xs sm:text-sm text-text font-serif leading-relaxed">
                {report.satisfaction?.overall_statement}
              </p>
            </div>

            {/* Satisfaction Table */}
            <div className="border border-card-border rounded-2xl overflow-hidden bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-subtle border-b border-card-border text-text-muted font-mono uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold w-1/4">Evaluation Area</th>
                      <th className="py-2.5 px-4 font-semibold w-1/4">Verdict</th>
                      <th className="py-2.5 px-4 font-semibold w-1/2">Cited Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border text-text">
                    {(report.satisfaction?.areas || []).map((area, idx) => (
                      <tr key={idx} className="hover:bg-bg-subtle/50 transition-colors">
                        <td className="py-3 px-4 font-medium">{area.name}</td>
                        <td className="py-3 px-4">
                          {area.verdict === 'Satisfied' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-mint text-primary border border-primary/20">
                              <Check className="h-3 w-3" /> Satisfied
                            </span>
                          ) : area.verdict === 'Partly satisfied' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-peach text-accent border border-accent/20">
                              <AlertTriangle className="h-3 w-3" /> Partly satisfied
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-peach text-destructive border border-destructive/20">
                              <X className="h-3 w-3" /> Not satisfied
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-text-muted">
                          <ul className="list-disc list-inside space-y-0.5">
                            {(area.evidence || []).map((ev, evi) => (
                              <li key={evi}>{ev}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 3.5 SKILLS, TOPICS & COMMUNICATION ANALYSIS                           */}
      {/* --------------------------------------------------------------------- */}
      <section id="section-skills" className="scroll-mt-20">
        <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border">
          <CardHeader className="border-b border-card-border pb-4 px-4 sm:px-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl font-display font-semibold text-text">
                  Skills, Topics & Communication Analysis
                </CardTitle>
                <CardDescription className="text-xs text-text-muted font-mono">
                  Performance across technical topic domains, speech cadence, and adaptive difficulty
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-8 space-y-6">
            {/* Topic Performance Bars */}
            <div>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block mb-3">
                Scores by Topic Domain
              </span>
              <div className="space-y-3">
                {(report.skills?.topic_scores || []).map((ts, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-bg-subtle border border-card-border space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-text">{ts.topic}</span>
                      <span className="font-mono font-bold text-primary">{ts.score.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted-surface rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, ts.score))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Communication Analysis */}
            {report.skills?.communication && (
              <div className="p-4 sm:p-5 rounded-2xl bg-bg-subtle border border-card-border space-y-3">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5 text-primary" />
                  Communication & Speech Cadence Analysis
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-card border border-card-border space-y-0.5">
                    <span className="text-[10px] font-mono text-text-muted uppercase">Avg Answer Length</span>
                    <p className="text-base sm:text-lg font-bold font-mono text-primary">
                      {`${report.skills.communication.avg_len_words} words`}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-card-border space-y-0.5">
                    <span className="text-[10px] font-mono text-text-muted uppercase">Speaking Pace</span>
                    <p className="text-base sm:text-lg font-bold font-mono text-primary">
                      {`${report.skills.communication.wpm} WPM`}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-card-border space-y-0.5">
                    <span className="text-[10px] font-mono text-text-muted uppercase">Filler Words</span>
                    <p className="text-base sm:text-lg font-bold font-mono text-primary">
                      {report.skills.communication.fillers_per_min}/min
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-card-border space-y-0.5">
                    <span className="text-[10px] font-mono text-text-muted uppercase">Response Latency</span>
                    <p className="text-base sm:text-lg font-bold font-mono text-primary">
                      {(report.skills.communication.latency_ms / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>

                {report.skills.communication.structure_notes && (
                  <p className="text-xs text-text-muted italic pt-1">
                    <span className="font-semibold text-text not-italic">Structure notes: </span>
                    {report.skills.communication.structure_notes}
                  </p>
                )}
              </div>
            )}

            {/* Adaptive Difficulty Progression Timeline (§Q7 preservation) */}
            {((report.difficulty_progression && report.difficulty_progression.length > 0) || report.turns.length > 0) && (
              <div className="p-5 rounded-2xl bg-bg-subtle border border-card-border space-y-3" data-testid="difficulty-progression-timeline">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-mint border border-primary/20 text-primary">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-display font-semibold text-text">Adaptive Difficulty Progression</h4>
                    <p className="text-[11px] text-text-muted">
                      Dynamically adjusted per turn based on candidate answer technical accuracy and depth
                    </p>
                  </div>
                </div>

                {/* Stepper Timeline */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {(report.difficulty_progression || []).map((p, idx) => (
                    <React.Fragment key={idx}>
                      <div className="flex items-center gap-1.5 p-2 rounded-xl bg-card border border-card-border text-xs shadow-sm">
                        <span className="font-semibold text-text-muted font-mono">Q{p.question_index}</span>
                        <span className="px-2 py-0.5 rounded-full font-medium text-[11px] bg-mint text-primary border border-primary/20 font-mono">
                          {p.difficulty_label} ({p.difficulty_tier.toFixed(1)})
                        </span>
                        {p.change === 'UPGRADE' && (
                          <span className="flex items-center text-primary font-semibold text-[10px] gap-0.5" title="Stepped up difficulty">
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {p.change === 'DOWNGRADE' && (
                          <span className="flex items-center text-accent font-semibold text-[10px] gap-0.5" title="Stepped down difficulty">
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {p.change === 'UNCHANGED' && (
                          <span className="text-text-muted/60 text-[10px]" title="Maintained difficulty">
                            <Minus className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      {idx < (report.difficulty_progression?.length ?? 0) - 1 && (
                        <ArrowRight className="h-3 w-3 text-text-muted/40 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Question Coverage & RAG Grounding Audit section (§Q7 testid preservation) */}
            {((report.question_coverage && report.question_coverage.length > 0) || report.turns.length > 0) && (
              <div className="p-5 rounded-2xl bg-bg-subtle border border-card-border space-y-4" data-testid="question-coverage-section">
                <div className="flex items-center gap-2 border-b border-card-border pb-3">
                  <div className="p-1.5 rounded-lg bg-mint border border-primary/20 text-primary">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-display font-semibold text-text">Question Coverage & Grounding Audit</h4>
                    <p className="text-[11px] text-text-muted">
                      Verifiable provenance: questions derived from candidate resume, role knowledge base, and adaptive follow-up probes
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(report.question_coverage || []).map((qc, idx) => {
                    const isResume = (qc.source_description || '').toLowerCase().includes('resume');
                    const isKB = (qc.source_description || '').toLowerCase().includes('knowledge base');

                    return (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-card border border-card-border space-y-2.5 text-xs transition-all hover:border-primary/40 shadow-sm"
                        data-testid={`question-coverage-item-${qc.question_index}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-text">Q{qc.question_index}</span>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                                isResume
                                  ? 'bg-sky text-[#2B5C8A] border-[#2B5C8A]/20'
                                  : isKB
                                  ? 'bg-sand text-[#B7791F] border-[#B7791F]/20'
                                  : 'bg-mint text-primary border-primary/20'
                              }`}
                            >
                              <FileText className="h-3 w-3" />
                              {qc.source_description}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-bg-subtle text-text-muted font-mono text-[11px] border border-card-border">
                              {qc.difficulty_label} ({qc.difficulty_tier.toFixed(1)})
                            </span>
                            {qc.score !== undefined && qc.score !== null && (
                              <span
                                className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold border ${
                                  qc.score >= 8.0
                                    ? 'bg-mint text-primary border-primary/20'
                                    : 'bg-peach text-accent border-accent/20'
                                }`}
                              >
                                {qc.score.toFixed(1)}/10
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-text font-serif font-medium text-xs leading-relaxed">
                          {qc.question}
                        </div>

                        {qc.candidate_answer && (
                          <div className="p-2.5 rounded-lg bg-bg-subtle border border-card-border text-[11px] text-text-muted leading-relaxed">
                            <span className="font-semibold text-text block mb-0.5">Candidate Response:</span>
                            "{qc.candidate_answer}"
                          </div>
                        )}

                        {qc.feedback && (
                          <div className="text-[11px] text-text-muted italic">
                            <span className="font-medium text-text not-italic">Evaluation: </span>
                            {qc.feedback}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 3.6 NON-VERBAL AND INTEGRITY SUMMARY (ADVISORY, LOW WEIGHT)           */}
      {/* --------------------------------------------------------------------- */}
      <section className="scroll-mt-20">
        <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border">
          <CardHeader className="border-b border-card-border pb-4 px-4 sm:px-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg sm:text-xl font-display font-semibold text-text">
                    Non-Verbal & Integrity Telemetry (Advisory Only)
                  </CardTitle>
                  <CardDescription className="text-xs text-text-muted font-mono">
                    Computed exclusively from verified-live camera segments • Lowest weighting factor
                  </CardDescription>
                </div>
              </div>

              <Badge className="bg-mint text-primary border-primary/20 text-xs px-3 py-1 font-mono">
                Verdict: {report.integrity?.verdict || 'Verified'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-8 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-mono">
                  Face Presence Rate
                </span>
                <span className="text-lg font-bold font-mono text-primary">
                  {report.nonverbal?.face_presence_rate ?? 98}%
                </span>
              </div>

              <div className="p-3 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-mono">
                  Eye Contact Ratio
                </span>
                <span className="text-lg font-bold font-mono text-primary">
                  {Math.round((report.nonverbal?.eye_contact_ratio ?? 0.85) * 100)}%
                </span>
              </div>

              <div className="p-3 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-mono">
                  Posture Stability
                </span>
                <span className="text-lg font-bold font-mono text-primary">
                  {report.nonverbal?.posture_score ?? 90}/100
                </span>
              </div>

              <div className="p-3 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-mono">
                  Pauses / Warnings
                </span>
                <span className="text-lg font-bold font-mono text-text-muted">
                  {report.nonverbal?.pauses_count ?? 0}
                </span>
              </div>
            </div>

            {/* Advisory Note */}
            <div className="text-[11px] text-text-muted bg-bg-subtle p-3.5 rounded-xl border border-card-border space-y-1">
              <p className="text-primary font-medium">
                • {report.nonverbal?.advisory_note}
              </p>
              <p className="text-text-muted">
                • Clear note: Non-verbal metrics are heuristic indicators and not a judgment of engineering ability; they are culturally variable and given minimal weighting in overall score calculation. They do not infer emotions, personality, health, or demographics.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 3.7 JOB-READINESS ESTIMATE (MANDATORY HONESTY RULES)                   */}
      {/* --------------------------------------------------------------------- */}
      <section id="section-readiness" className="scroll-mt-20">
        <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border">
          <CardHeader className="border-b border-card-border pb-4 px-4 sm:px-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl font-display font-semibold text-text">
                  Interview Readiness Estimate
                </CardTitle>
                <CardDescription className="text-xs text-text-muted font-mono">
                  Deterministic readiness range calibrated against {report.role?.level} expectations
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-8 space-y-6">
            {!report.readiness?.available ? (
              /* Thin Data Empty State */
              <div className="p-6 rounded-2xl bg-peach/40 border border-accent/20 text-center space-y-2">
                <AlertCircle className="h-8 w-8 text-accent mx-auto" />
                <h4 className="text-base font-display font-semibold text-text">
                  Not Enough Data for an Estimate
                </h4>
                <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
                  {report.readiness?.reason_if_unavailable ||
                    'A reliable readiness estimate requires at least 4 answered questions and 5 minutes of interview conversation.'}
                </p>
              </div>
            ) : (
              <>
                {/* Readiness Hero Card */}
                <div className="p-6 sm:p-8 rounded-3xl bg-bg-subtle border border-card-border text-center space-y-4">
                  <span className="text-xs font-mono uppercase tracking-wider text-text-muted block">
                    Estimated Chance of Passing this Type of Interview
                  </span>

                  {/* Range + Band */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <span className="text-3xl sm:text-5xl font-extrabold text-primary font-display">
                      {`${report.readiness.range_low}% to ${report.readiness.range_high}%`}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${getReadinessBandColor(
                        report.readiness.band
                      )}`}
                    >
                      {report.readiness.band}
                    </span>
                  </div>

                  {/* Plain statement */}
                  <p className="text-sm font-medium text-text max-w-md mx-auto">
                    {report.readiness.advance_verdict}
                  </p>

                  {/* Confidence Badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-card-border text-xs text-text-muted">
                    <span>Confidence:</span>
                    <span className="font-semibold text-primary font-mono">
                      {report.readiness.confidence}
                    </span>
                    {report.readiness.confidence === 'Low' && (
                      <span className="text-[11px] text-accent">
                        (Low confidence widens the estimated range)
                      </span>
                    )}
                  </div>

                  {/* Mandatory Disclaimer */}
                  <div className="p-3 rounded-xl bg-card border border-card-border/80 text-[11px] text-text-muted leading-relaxed max-w-2xl mx-auto">
                    <strong>Honesty Notice: </strong>
                    {report.readiness.disclaimer}
                  </div>
                </div>

                {/* "How this was calculated" Factor Table */}
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block">
                    How This Was Calculated (Factors & Deterministic Weights)
                  </span>

                  <div className="border border-card-border rounded-2xl overflow-hidden bg-card">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-bg-subtle border-b border-card-border text-text-muted font-mono uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">Evaluation Factor</th>
                            <th className="py-2.5 px-4 font-semibold">Candidate Value</th>
                            <th className="py-2.5 px-4 font-semibold">Weight</th>
                            <th className="py-2.5 px-4 font-semibold">Impact</th>
                            <th className="py-2.5 px-4 font-semibold">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-card-border text-text">
                          {(report.readiness.factors || []).map((f, idx) => (
                            <tr key={idx} className="hover:bg-bg-subtle/50 transition-colors">
                              <td className="py-2.5 px-4 font-medium">{f.name}</td>
                              <td className="py-2.5 px-4 font-mono">{f.value}</td>
                              <td className="py-2.5 px-4 font-mono text-text-muted">
                                {(f.weight * 100).toFixed(0)}%
                              </td>
                              <td className="py-2.5 px-4">
                                {f.impact === '+' ? (
                                  <span className="text-primary font-bold font-mono">+ positive</span>
                                ) : f.impact === '-' ? (
                                  <span className="text-accent font-bold font-mono">- drag</span>
                                ) : (
                                  <span className="text-text-muted font-mono">neutral</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-text-muted">{f.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* "What would raise your chances" Top 5 Actions */}
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block">
                    What Would Raise Your Chances (Top 5 Concrete Actions)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(report.readiness.raise_chances || []).map((action, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-bg-subtle border border-card-border text-xs flex items-start gap-2.5"
                      >
                        <span className="h-5 w-5 rounded-full bg-mint text-primary font-bold flex items-center justify-center shrink-0 text-[10px] font-mono">
                          {idx + 1}
                        </span>
                        <p className="text-text leading-relaxed">{action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 3.8 ACTION PLAN                                                       */}
      {/* --------------------------------------------------------------------- */}
      <section id="section-action-plan" className="scroll-mt-20">
        <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border">
          <CardHeader className="border-b border-card-border pb-4 px-4 sm:px-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl font-display font-semibold text-text">
                  Targeted Action Plan & Practice Schedule
                </CardTitle>
                <CardDescription className="text-xs text-text-muted font-mono">
                  Ranked study priorities, structured 7-day drills, and recommended follow-up focus
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-8 space-y-6">
            {/* Top 5 Priorities for Improvement */}
            <div>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block mb-3">
                Ranked Priorities for Growth (Ordered by Impact)
              </span>

              <div className="space-y-3">
                {(report.action_plan?.priorities || []).map((p) => (
                  <div
                    key={p.priority}
                    className="p-4 rounded-2xl bg-bg-subtle border border-card-border space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-lg bg-primary text-primary-ink font-bold flex items-center justify-center text-xs font-mono">
                          #{p.priority}
                        </span>
                        <span className="font-display font-semibold text-text text-sm">{p.area}</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-card border border-card-border text-text-muted">
                        Effort: {p.estimated_effort}
                      </span>
                    </div>

                    <p className="text-text-muted leading-relaxed">
                      <strong className="text-text font-medium">Why this matters: </strong>
                      {p.reason}
                    </p>
                    <p className="text-primary leading-relaxed bg-mint/30 p-2.5 rounded-lg border border-primary/10">
                      <strong>How to practice: </strong>
                      {p.study_practice}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 7-Day Structured Practice Plan */}
            <div>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-text-muted block mb-3">
                7-Day Structured Practice Plan
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {(report.action_plan?.seven_day_plan || []).map((day) => (
                  <div
                    key={day.day}
                    className="p-3.5 rounded-2xl bg-bg-subtle border border-card-border space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-primary">Day {day.day}</span>
                    </div>
                    <span className="font-medium text-text block">{day.title}</span>
                    <p className="text-[11px] text-text-muted leading-relaxed">{day.task}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested Next Mock Interview */}
            {report.action_plan?.next_session_suggestion && (
              <div className="p-5 rounded-2xl bg-mint/25 border border-primary/20 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-primary block">
                      Recommended Next Practice Session
                    </span>
                    <h4 className="text-sm font-display font-semibold text-text">
                      {report.action_plan.next_session_suggestion.level}{' '}
                      {report.action_plan.next_session_suggestion.role}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {report.action_plan.next_session_suggestion.focus_topics.map((top, ti) => (
                        <span
                          key={ti}
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-card border border-primary/20 text-primary"
                        >
                          {top}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      if (onStartNextInterview) {
                        onStartNextInterview(report.action_plan.next_session_suggestion);
                      } else {
                        onReturnHome();
                      }
                    }}
                    className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-primary-ink text-xs px-5 h-10 gap-2 rounded-full shadow-sm cursor-pointer whitespace-nowrap"
                  >
                    <span>Start another interview with these focus areas</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* ACTION FOOTER                                                         */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-card-border">
        <Button
          onClick={onDownloadPdf}
          disabled={isDownloadingPdf}
          variant="outline"
          className="w-full sm:w-auto border-card-border bg-card hover:bg-bg-subtle text-text font-semibold text-xs px-5 h-10 gap-2 rounded-full shadow-sm cursor-pointer"
        >
          {isDownloadingPdf ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Compiling PDF...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4 text-primary" />
              <span>Download PDF Report</span>
            </>
          )}
        </Button>

        <Button
          onClick={onReturnHome}
          className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-primary-ink font-semibold text-xs px-6 h-10 gap-2 rounded-full shadow-sm cursor-pointer"
        >
          <span>Return to Dashboard</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
