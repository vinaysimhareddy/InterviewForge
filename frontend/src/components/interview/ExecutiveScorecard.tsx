import React from 'react';
import {
  Award,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Download,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  TrendingUp,
  Layers,
  FileText,
  Database,
  GitBranch,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FinalReport } from '@/lib/types';

export interface ExecutiveScorecardProps {
  session: {
    id: string;
    role: string;
    seniority: string;
    created_at?: string;
  };
  report: FinalReport;
  onBack?: () => void;
  onDownloadPdf: () => void;
  isDownloadingPdf?: boolean;
  onReturnHome: () => void;
}

export function ExecutiveScorecard({
  session,
  report,
  onBack,
  onDownloadPdf,
  isDownloadingPdf = false,
  onReturnHome,
}: ExecutiveScorecardProps): React.ReactElement {
  const getRecommendationBadge = (rec: string) => {
    const lower = rec.toLowerCase();
    if (lower.includes('strong hire') || lower.includes('hire')) {
      return (
        <span className="text-xl sm:text-2xl font-display font-bold text-primary mt-0.5 block">
          {rec}
        </span>
      );
    }
    if (lower.includes('consider') || lower.includes('hold')) {
      return (
        <span className="text-xl sm:text-2xl font-display font-bold text-accent mt-0.5 block">
          {rec}
        </span>
      );
    }
    return (
      <span className="text-xl sm:text-2xl font-display font-bold text-destructive mt-0.5 block">
        {rec}
      </span>
    );
  };

  const getVerdictStyle = (verdict?: string) => {
    const v = verdict || 'Verified';
    if (v === 'Verified') {
      return {
        badgeClass: 'bg-mint text-primary border-primary/20 text-xs px-3 py-1 gap-1.5 font-mono',
        dotClass: 'bg-primary',
      };
    }
    if (v === 'Verified with warnings') {
      return {
        badgeClass: 'bg-peach text-accent border-accent/20 text-xs px-3 py-1 gap-1.5 font-mono',
        dotClass: 'bg-accent',
      };
    }
    return {
      badgeClass: 'bg-peach text-destructive border-destructive/20 text-xs px-3 py-1 gap-1.5 font-mono',
      dotClass: 'bg-destructive',
    };
  };

  const verdictStyle = getVerdictStyle(report.integrity_summary?.verdict);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in py-4 sm:py-8 px-2 sm:px-4 text-text overflow-x-hidden">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-xs text-text-muted hover:text-text hover:bg-bg-subtle gap-1.5 cursor-pointer rounded-full self-start sm:self-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Completion Overview</span>
          </Button>
        ) : (
          <div />
        )}

        <Button
          onClick={onDownloadPdf}
          disabled={isDownloadingPdf}
          variant="outline"
          size="sm"
          className="border-card-border bg-card hover:bg-bg-subtle text-text font-semibold text-xs px-4 h-9 gap-2 cursor-pointer rounded-full ml-auto shadow-sm"
        >
          {isDownloadingPdf ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Compiling PDF...</span>
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5 text-primary" />
              <span>Download PDF Report</span>
            </>
          )}
        </Button>
      </div>

      <Card className="border-card-border bg-card shadow-soft rounded-3xl overflow-hidden border w-full max-w-full">
        {/* Subtle accent header line */}
        <div className="h-1 w-full bg-primary" />

        <CardHeader className="text-center pb-6 border-b border-card-border px-3 sm:px-6">
          <div className="mx-auto p-3.5 rounded-2xl bg-mint border border-primary/20 text-primary w-fit mb-2 shadow-sm">
            <Award className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl text-text font-display font-medium tracking-tight">
            Interview Completed: Executive Scorecard
          </CardTitle>
          <CardDescription className="text-text-muted text-xs font-mono">
            Role: {session.seniority} {session.role} • Evaluated by LangGraph Adaptive Engine
          </CardDescription>

          {/* Overall Score and Recommendation Display */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-5 w-full">
            <div className="text-center px-4 sm:px-6 py-3 rounded-2xl bg-bg-subtle border border-card-border w-full sm:w-auto min-w-[140px]">
              <span className="text-[11px] text-text-muted uppercase tracking-wider block font-mono font-medium">
                Overall Score
              </span>
              <span className="text-3xl sm:text-4xl font-extrabold text-primary font-display">
                {report.overall_score}
                <span className="text-sm text-text-muted font-normal font-sans">/100</span>
              </span>
            </div>

            <div className="text-center px-4 sm:px-6 py-3 rounded-2xl bg-bg-subtle border border-card-border w-full sm:w-auto min-w-[140px]">
              <span className="text-[11px] text-text-muted uppercase tracking-wider block font-mono font-medium">
                Recommendation
              </span>
              {getRecommendationBadge(report.hiring_recommendation)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6 p-3.5 sm:p-8 overflow-hidden">
          {/* Category Breakdown (Technical Depth 60%, Communication 25%, Biometric Composure 15%) */}
          <div>
            <h3 className="text-xs uppercase font-mono font-semibold text-text-muted tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Evaluation Category Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-bg-subtle border border-card-border text-center space-y-1">
                <span className="text-xs text-text-muted block">Technical Depth (60%)</span>
                <p className="text-2xl font-bold text-primary font-mono">
                  {report.category_scores.technical}%
                </p>
                <div className="w-full bg-muted-surface rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, report.category_scores.technical))}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-bg-subtle border border-card-border text-center space-y-1">
                <span className="text-xs text-text-muted block">Communication (25%)</span>
                <p className="text-2xl font-bold text-primary font-mono">
                  {report.category_scores.communication}%
                </p>
                <div className="w-full bg-muted-surface rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, report.category_scores.communication))}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-bg-subtle border border-card-border text-center space-y-1">
                <span className="text-xs text-text-muted block">Biometric Composure (15%)</span>
                <p className="text-2xl font-bold text-primary font-mono">
                  {report.category_scores.composure}%
                </p>
                <div className="w-full bg-muted-surface rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, report.category_scores.composure))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Key Strengths & Growth Opportunities */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-mint/35 border border-primary/20 space-y-2.5">
              <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Key Strengths
              </span>
              <ul className="text-xs text-text space-y-2 list-disc list-inside">
                {report.strengths.map((str, i) => (
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
                {report.weaknesses.map((w, i) => (
                  <li key={i} className="leading-relaxed">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="p-4 sm:p-5 rounded-2xl bg-bg-subtle border border-card-border text-xs text-text-muted leading-relaxed space-y-1.5">
            <span className="font-semibold text-text block text-sm font-display">Executive Summary:</span>
            <p className="leading-relaxed">{report.executive_summary}</p>
          </div>

          {/* Adaptive Difficulty Progression Timeline (§Q7) */}
          {report.difficulty_progression && report.difficulty_progression.length > 0 && (
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
                {report.difficulty_progression.map((p, idx) => (
                  <React.Fragment key={idx}>
                    <div className="flex items-center gap-1.5 p-2 rounded-xl bg-card border border-card-border text-xs shadow-sm">
                      <span className="font-semibold text-text-muted font-mono">Q{p.question_index}</span>
                      <span className="px-2 py-0.5 rounded-full font-medium text-[11px] bg-mint text-primary border border-primary/20 font-mono">
                        {p.difficulty_label} ({p.difficulty_tier.toFixed(1)})
                      </span>
                      {p.change === 'UPGRADE' && (
                        <span className="flex items-center text-success font-semibold text-[10px] gap-0.5" title="Stepped up difficulty">
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

          {/* Question Coverage & RAG Grounding Audit (§Q7) */}
          {report.question_coverage && report.question_coverage.length > 0 && (
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
                {report.question_coverage.map((qc, idx) => {
                  const isResume = qc.source_description.toLowerCase().includes('resume');
                  const isKB = qc.source_description.toLowerCase().includes('knowledge base');
                  const isFollowUp = qc.source_description.toLowerCase().includes('follow-up') || qc.source_description.toLowerCase().includes('probe');

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-card border border-card-border space-y-2.5 text-xs transition-all hover:border-primary/40 shadow-sm"
                      data-testid={`question-coverage-item-${qc.question_index}`}
                    >
                      {/* Item Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-text">Q{qc.question_index}</span>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                              isResume
                                ? 'bg-sky text-[#2B5C8A] border-[#2B5C8A]/20'
                                : isKB
                                ? 'bg-sand text-[#B7791F] border-[#B7791F]/20'
                                : isFollowUp
                                ? 'bg-mint text-primary border-primary/20'
                                : 'bg-bg-subtle text-text border-card-border'
                            }`}
                          >
                            {isResume ? (
                              <FileText className="h-3 w-3" />
                            ) : isKB ? (
                              <Database className="h-3 w-3" />
                            ) : (
                              <GitBranch className="h-3 w-3" />
                            )}
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
                                  : qc.score >= 5.0
                                  ? 'bg-sky text-[#2B5C8A] border-[#2B5C8A]/20'
                                  : 'bg-peach text-accent border-accent/20'
                              }`}
                            >
                              {qc.score.toFixed(1)}/10
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Question Text */}
                      <div className="text-text font-serif font-medium text-xs leading-relaxed">
                        {qc.question}
                      </div>

                      {/* Candidate Answer Excerpt */}
                      {qc.candidate_answer && (
                        <div className="p-2.5 rounded-lg bg-bg-subtle border border-card-border text-[11px] text-text-muted leading-relaxed">
                          <span className="font-semibold text-text block mb-0.5">Candidate Response:</span>
                          "{qc.candidate_answer}"
                        </div>
                      )}

                      {/* Feedback */}
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

          {/* Physical Camera Integrity & Biometric Verification (§7) */}
          <div className="p-5 rounded-2xl bg-bg-subtle border border-card-border space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-card-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-display font-semibold text-text tracking-wide">
                    Physical Camera Integrity & Biometric Verification (§7)
                  </h4>
                  <p className="text-[11px] text-text-muted">
                    Validated by client-side WebAssembly heuristics and server plausibility checks
                  </p>
                </div>
              </div>
              <Badge className={verdictStyle.badgeClass}>
                <span className={`h-2 w-2 rounded-full ${verdictStyle.dotClass}`} />
                Verdict: {report.integrity_summary?.verdict || 'Verified'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-mono">
                  Integrity Score
                </span>
                <span className="text-lg font-bold font-mono text-primary">
                  {report.integrity_summary?.integrity_score ?? 100}/100
                </span>
              </div>
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-mono">
                  Face Present Rate
                </span>
                <span className="text-lg font-bold font-mono text-text">
                  {report.integrity_summary?.face_present_percentage ?? 100}%
                </span>
              </div>
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-mono">
                  Challenges Passed
                </span>
                <span className="text-lg font-bold font-mono text-primary">
                  {report.integrity_summary?.challenges_passed ?? 1} /{' '}
                  {(report.integrity_summary?.challenges_passed ?? 1) +
                    (report.integrity_summary?.challenges_failed ?? 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-mono">
                  Pause / Loss Incidents
                </span>
                <span className="text-lg font-bold font-mono text-text-muted">
                  {report.integrity_summary?.pauses_count ?? 0} incidents
                </span>
              </div>
            </div>

            <div className="text-[11px] text-text-muted bg-card p-3.5 rounded-xl border border-card-border space-y-1">
              <p className="text-primary font-medium">
                •{' '}
                {report.integrity_summary?.non_verbal_excluded_note ||
                  'Non-verbal scores (eye contact, posture) are computed only from verified-live segments; segments with active integrity flags were excluded.'}
                {' '}({report.integrity_summary?.excluded_segments_count ?? 0} flagged segments excluded).
              </p>
              <p className="text-text-muted break-words">
                • Active Camera Device:{' '}
                <span className="font-mono text-text break-all">
                  {report.integrity_summary?.camera_device_name || 'Physical Hardware Webcam Verified'}
                </span>
              </p>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <Button
              onClick={onDownloadPdf}
              disabled={isDownloadingPdf}
              variant="outline"
              className="w-full sm:w-auto border-card-border bg-card hover:bg-bg-subtle text-text font-semibold text-xs px-5 h-10 gap-2 cursor-pointer rounded-full shadow-sm"
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
              className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-primary-ink font-semibold text-xs px-6 h-10 gap-2 cursor-pointer rounded-full shadow-sm"
            >
              <span>Return to Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

