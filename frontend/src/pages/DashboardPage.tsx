import React, { useState, useEffect, useMemo } from 'react';
import {
  LogOut,
  AlertTriangle,
  CheckCircle,
  FileText,
  PlayCircle,
  Layers,
  Video,
  TrendingUp,
  Award,
  Download,
  ArrowLeft,
  Sparkles,
  Clock,
  CheckCircle2,
  Loader2,
  Calendar,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { apiClient, ApiError } from '@/lib/api';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ResumeUploadDropzone, ResumeData } from '@/components/interview/ResumeUploadDropzone';
import { InterviewConfigurator, SessionData } from '@/components/interview/InterviewConfigurator';
import { InterviewWelcome } from '@/components/interview/InterviewWelcome';
import { PreInterviewSetup } from '@/components/interview/PreInterviewSetup';
import { InterviewReady } from '@/components/interview/InterviewReady';
import { InterviewRoom } from '@/components/interview/InterviewRoom';
import { ExecutiveScorecard } from '@/components/interview/ExecutiveScorecard';
import type { InterviewReport } from '@/lib/types';
import { useMediaStream } from '@/context/CameraStreamContext';
import { USER_FLOW_STEPS, formatPageTitle } from '@/copy/glossary';

export default function DashboardPage(): React.ReactElement {
  const { user, token, logout } = useAuth();
  const { stopAll } = useMediaStream();
  React.useEffect(() => {
    document.title = formatPageTitle('Dashboard');
  }, []);

  const [selectedResume, setSelectedResume] = useState<ResumeData | null>(null);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [welcomeSession, setWelcomeSession] = useState<SessionData | null>(null);
  const [setupSession, setSetupSession] = useState<SessionData | null>(null);
  const [readySession, setReadySession] = useState<{
    session: SessionData;
    durationMinutes: number;
    videoStream: MediaStream | null;
    audioStream: MediaStream | null;
  } | null>(null);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(15);
  const [activeRoomSession, setActiveRoomSession] = useState<SessionData | null>(null);
  const [sessionsList, setSessionsList] = useState<SessionData[]>([]);
  const [resumesList, setResumesList] = useState<ResumeData[]>([]);
  const [reportsList, setReportsList] = useState<InterviewReport[]>([]);
  const [viewingReport, setViewingReport] = useState<{ report: InterviewReport; session: SessionData } | null>(null);
  const [downloadingPdfSessionId, setDownloadingPdfSessionId] = useState<string | null>(null);
  const [outcomeState, setOutcomeState] = useState<
    Record<string, { outcome?: string; isSubmitting?: boolean; submitted?: boolean; error?: string }>
  >({});
  const [prefillConfig, setPrefillConfig] = useState<{
    role: string;
    seniority: 'Junior' | 'Mid' | 'Senior' | 'Lead';
    focusTopics: string[];
  } | null>(null);
  const [_isLoadingData, setIsLoadingData] = useState(false);

  // Load candidate's existing resumes, sessions, and completed reports
  useEffect(() => {
    async function loadCandidateData() {
      setIsLoadingData(true);
      try {
        const [resumes, sessions, reports] = await Promise.all([
          apiClient.get<ResumeData[]>('/api/v1/resumes').catch(() => []),
          apiClient.get<SessionData[]>('/api/v1/sessions').catch(() => []),
          apiClient.get<InterviewReport[]>('/api/v1/sessions/reports').catch(() => []),
        ]);
        setResumesList(resumes);
        if (resumes.length > 0 && !selectedResume) {
          setSelectedResume(resumes[0]);
        }
        setSessionsList(sessions);
        setReportsList(reports);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadCandidateData();
  }, []);

  const handleResumeParsed = (resume: ResumeData) => {
    setSelectedResume(resume);
    setResumesList((prev) => [resume, ...prev.filter((r) => r.id !== resume.id)]);
  };

  const handleSessionCreated = (session: SessionData) => {
    setActiveSession(session);
    setWelcomeSession(session);
    setSessionsList((prev) => [session, ...prev]);
  };

  // Helper to ensure full SessionData exists for a report
  const getSessionForReport = (report: InterviewReport): SessionData => {
    const validSeniority: 'Junior' | 'Mid' | 'Senior' | 'Lead' = ['Junior', 'Mid', 'Senior', 'Lead'].includes(
      report.role.level
    )
      ? (report.role.level as 'Junior' | 'Mid' | 'Senior' | 'Lead')
      : 'Mid';

    const found = sessionsList.find((s) => s.id === report.session_id);
    if (found) {
      return {
        ...found,
        role: report.role.title || found.role,
        seniority: validSeniority || found.seniority,
        resume_id: report.resume_id || found.resume_id,
      };
    }

    return {
      id: report.session_id,
      user_id: report.user_id,
      role: report.role.title,
      seniority: validSeniority,
      difficulty: 'Adaptive',
      status: 'COMPLETED',
      created_at: report.generated_at,
      resume_id: report.resume_id || undefined,
    };
  };

  // PDF Export trigger
  const handleDownloadPdf = async (reportToDownload: InterviewReport, sessionForPdf: SessionData) => {
    setDownloadingPdfSessionId(reportToDownload.session_id);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { PDFReportDocument } = await import('@/components/report/PDFReportDocument');
      const blob = await pdf(<PDFReportDocument session={sessionForPdf} report={reportToDownload} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Interview_Report_${sessionForPdf.role.replace(/[^a-zA-Z0-9_-]/g, '_')}_${sessionForPdf.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
    } finally {
      setDownloadingPdfSessionId(null);
    }
  };

  // Real-world outcome feedback recording
  const handleRecordOutcome = async (sessionId: string, outcome: string) => {
    setOutcomeState((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], isSubmitting: true, error: undefined },
    }));
    try {
      await apiClient.post(`/api/v1/sessions/${sessionId}/outcome`, {
        outcome,
        notes: '',
      });
      setOutcomeState((prev) => ({
        ...prev,
        [sessionId]: { outcome, isSubmitting: false, submitted: true },
      }));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to record outcome';
      setOutcomeState((prev) => ({
        ...prev,
        [sessionId]: { isSubmitting: false, submitted: false, error: msg },
      }));
    }
  };

  // Progression analysis across reports
  const chronologicalReports = useMemo(() => {
    return [...reportsList].sort(
      (a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime()
    );
  }, [reportsList]);

  const topicProgress = useMemo(() => {
    if (reportsList.length === 0) return { improving: [], stalled: [], weakest3: [] };

    const topicHistory: Record<string, { topic: string; scores: number[]; latestScore: number }> = {};

    chronologicalReports.forEach((rpt) => {
      rpt.skills?.topic_scores?.forEach((ts) => {
        if (!topicHistory[ts.topic]) {
          topicHistory[ts.topic] = { topic: ts.topic, scores: [], latestScore: ts.score };
        }
        topicHistory[ts.topic].scores.push(ts.score);
        topicHistory[ts.topic].latestScore = ts.score;
      });
    });

    const improving: Array<{ topic: string; latestScore: number; delta: number; label: string }> = [];
    const stalled: Array<{ topic: string; latestScore: number; delta: number; label: string }> = [];

    Object.values(topicHistory).forEach((entry) => {
      if (entry.scores.length > 1) {
        const delta = entry.latestScore - entry.scores[0];
        if (delta > 0) {
          improving.push({
            topic: entry.topic,
            latestScore: entry.latestScore,
            delta,
            label: `+${Math.round(delta)} pts`,
          });
        } else {
          stalled.push({
            topic: entry.topic,
            latestScore: entry.latestScore,
            delta,
            label: delta === 0 ? 'No change' : `${Math.round(delta)} pts`,
          });
        }
      } else {
        if (entry.latestScore >= 75) {
          improving.push({
            topic: entry.topic,
            latestScore: entry.latestScore,
            delta: 0,
            label: 'Mastered',
          });
        } else {
          stalled.push({
            topic: entry.topic,
            latestScore: entry.latestScore,
            delta: 0,
            label: 'Needs Depth',
          });
        }
      }
    });

    improving.sort((a, b) => (b.delta !== a.delta ? b.delta - a.delta : b.latestScore - a.latestScore));
    stalled.sort((a, b) => a.latestScore - b.latestScore);

    const latestReport = reportsList[0];
    const weakestFromLatest = [...(latestReport?.skills?.topic_scores || [])]
      .sort((a, b) => a.score - b.score)
      .map((ts) => ts.topic);

    const weakestFromStalled = stalled.map((s) => s.topic);
    const combinedWeakest = Array.from(new Set([...weakestFromLatest, ...weakestFromStalled])).slice(0, 3);

    return {
      improving,
      stalled,
      weakest3: combinedWeakest.length > 0 ? combinedWeakest : ['System Architecture', 'Concurrency', 'Reliability'],
    };
  }, [chronologicalReports, reportsList]);

  // Handler to launch new interview with weakest focus areas
  const handleStartFocusInterview = () => {
    const latestReport = reportsList[0];
    const targetRole = latestReport?.role?.title || 'Full Stack Engineer';
    const targetSeniority = (['Junior', 'Mid', 'Senior', 'Lead'].includes(latestReport?.role?.level || '')
      ? latestReport.role.level
      : 'Mid') as 'Junior' | 'Mid' | 'Senior' | 'Lead';

    setPrefillConfig({
      role: targetRole,
      seniority: targetSeniority,
      focusTopics: topicProgress.weakest3,
    });

    const el = document.getElementById('interview-prep-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // FULL REVIEW INSPECTION VIEW
  if (viewingReport) {
    return (
      <div className="w-full max-w-6xl mx-auto py-4 sm:py-8 px-3 sm:px-4 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-card-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewingReport(null)}
            className="gap-2 text-xs border-card-border text-text hover:bg-bg-subtle cursor-pointer font-sans"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">
              {viewingReport.report.role.level} {viewingReport.report.role.title}
            </Badge>
            <span className="text-xs text-text-muted font-mono">
              {new Date(viewingReport.report.generated_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <ExecutiveScorecard
          session={viewingReport.session}
          report={viewingReport.report}
          onBack={() => setViewingReport(null)}
          onReturnHome={() => setViewingReport(null)}
          onDownloadPdf={() => handleDownloadPdf(viewingReport.report, viewingReport.session)}
          isDownloadingPdf={Boolean(downloadingPdfSessionId === viewingReport.session.id)}
          onStartNextInterview={(suggestion) => {
            if (suggestion) {
              setPrefillConfig({
                role: suggestion.role,
                seniority: (['Junior', 'Mid', 'Senior', 'Lead'].includes(suggestion.level)
                  ? suggestion.level
                  : 'Mid') as 'Junior' | 'Mid' | 'Senior' | 'Lead',
                focusTopics: suggestion.focus_topics,
              });
            }
            setViewingReport(null);
            setTimeout(() => {
              const el = document.getElementById('interview-prep-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }}
        />
      </div>
    );
  }

  // Step 1: Interview Welcome (instructions + consent)
  if (welcomeSession) {
    return (
      <InterviewWelcome
        role={welcomeSession.role}
        seniority={welcomeSession.seniority}
        durationMinutes={sessionDurationMinutes}
        onContinue={() => {
          setSetupSession(welcomeSession);
          setWelcomeSession(null);
        }}
        onBack={() => setWelcomeSession(null)}
      />
    );
  }

  // Step 2: Device & Camera Check (existing verified setup, restyled)
  if (setupSession) {
    return (
      <PreInterviewSetup
        role={setupSession.role}
        seniority={setupSession.seniority}
        onStartInterview={(config) => {
          setSessionDurationMinutes(config.durationMinutes);
          setReadySession({
            session: setupSession,
            durationMinutes: config.durationMinutes,
            videoStream: config.videoStream,
            audioStream: config.audioStream,
          });
          setSetupSession(null);
        }}
        onCancel={() => setSetupSession(null)}
      />
    );
  }

  // Step 3: Pre-start "Ready?" screen (duration shown, Start button = audio unlock gesture)
  if (readySession) {
    return (
      <InterviewReady
        session={readySession.session}
        durationMinutes={readySession.durationMinutes}
        onStart={() => {
          setActiveRoomSession(readySession.session);
          setReadySession(null);
        }}
        onBack={() => {
          setSetupSession(readySession.session);
          setReadySession(null);
        }}
      />
    );
  }

  // Step 4: LIVE INTERVIEW STAGE
  if (activeRoomSession) {
    return (
      <InterviewRoom
        session={activeRoomSession}
        token={token || ''}
        durationMinutes={sessionDurationMinutes}
        onExit={() => {
          stopAll();
          setActiveRoomSession(null);
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto py-8 px-4 space-y-8">
      {/* Candidate Profile Header Card */}
      <Card className="card-editorial shadow-sm backdrop-blur-md">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-card-border">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-mint border border-primary/20 flex items-center justify-center text-primary font-bold text-xl font-display shadow-inner">
              {user?.full_name?.charAt(0).toUpperCase() || 'C'}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-bold text-text tracking-tight font-display">
                  {user?.full_name}
                </h2>
                <Badge variant="success" className="font-mono text-xs">
                  {user?.role}
                </Badge>
              </div>
              <p className="text-sm text-text-muted font-mono mt-0.5">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="w-full sm:w-auto text-danger border-danger/30 bg-danger/5 hover:bg-danger/10 hover:text-danger cursor-pointer min-h-[44px] sm:min-h-0"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-bg-subtle border border-card-border space-y-1">
            <span className="label-mono text-text-faint text-[10px]">Account Status</span>
            <div className="flex items-center gap-1.5 text-xs text-text font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span>Verified Candidate</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-bg-subtle border border-card-border space-y-1">
            <span className="label-mono text-text-faint text-[10px]">Active Resumes</span>
            <div className="flex items-center gap-1.5 text-xs text-text">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>{resumesList.length} resume(s)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-bg-subtle border border-card-border space-y-1">
            <span className="label-mono text-text-faint text-[10px]">Interviews</span>
            <div className="flex items-center gap-1.5 text-xs text-success">
              <Layers className="h-3.5 w-3.5 text-success" />
              <span>{sessionsList.length} interview(s)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-bg-subtle border border-card-border space-y-1">
            <span className="label-mono text-text-faint text-[10px]">Interview Reviews</span>
            <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
              <Award className="h-3.5 w-3.5 text-primary" />
              <span>{reportsList.length} review(s)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      
      {/* Universal 5-Step User Flow Banner (§4) */}
      <div className="p-4 rounded-2xl bg-card border border-card-border shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-card-border/60">
          <span className="label-mono text-primary text-[11px]">INTERVIEW WORKFLOW PROGRESS</span>
          <span className="text-xs text-text-muted font-mono">5 Canonical Steps</span>
        </div>
        <ol className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-3">
          {USER_FLOW_STEPS.map((s) => {
            const isCompleted = (s.step === 1 && selectedResume !== null) || (s.step === 2 && activeSession !== null);
            const isCurrent = (s.step === 1 && !selectedResume) || (s.step === 2 && selectedResume && !activeSession) || (s.step === 3 && activeSession !== null);
            return (
              <li
                key={s.step}
                className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${
                  isCurrent
                    ? 'border-primary/50 bg-mint/40 text-text shadow-xs'
                    : isCompleted
                    ? 'border-success/30 bg-mint/20 text-text'
                    : 'border-card-border bg-bg-subtle text-text-faint'
                }`}
              >
                <span
                  className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                    isCurrent
                      ? 'bg-primary text-primary-ink'
                      : isCompleted
                      ? 'bg-mint text-primary font-bold'
                      : 'bg-card border border-card-border text-text-faint'
                  }`}
                >
                  {isCompleted ? '✓' : s.step}
                </span>
                <span className="text-xs font-medium truncate">{s.fullLabel}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* SECTION 01: Resume Ingestion & Interview Configurator Grid */}
      <section id="interview-prep-section" className="space-y-4 scroll-mt-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="label-mono text-primary text-[11px]">01 // RESUME & ROLE GROUNDING</span>
            <h2 className="text-xl font-bold text-text tracking-tight font-display flex items-center gap-2 mt-0.5">
              <Layers className="h-5 w-5 text-primary" />
              Interview Preparation & Grounding
            </h2>
          </div>
          <Badge variant="outline" className="border-card-border text-text-muted bg-bg-subtle font-mono text-xs self-start sm:self-auto">
            Adaptive AI Engine
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Resume Ingestion */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" />
              1 Upload resume
            </h3>
            <ErrorBoundary fallbackTitle="Resume Ingestion Error">
              <ResumeUploadDropzone
                onParsed={handleResumeParsed}
                selectedResume={selectedResume}
              />
            </ErrorBoundary>
          </div>

          {/* Right Column: Interview Session Configuration */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <PlayCircle className="h-4 w-4 text-primary" />
              2 Choose role & level
            </h3>
            <InterviewConfigurator
              selectedResume={selectedResume}
              onSessionCreated={handleSessionCreated}
              initialRole={prefillConfig?.role}
              initialSeniority={prefillConfig?.seniority}
              focusTopics={prefillConfig?.focusTopics}
            />
          </div>
        </div>
      </section>

      {/* Active Created Session Alert */}
      {activeSession && (
        <Card className="border border-success/30 bg-mint/30 backdrop-blur-md animate-in fade-in rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                <CardTitle className="text-base text-text font-display font-bold">
                  Interview Session Ready
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success" className="font-mono text-xs">
                  Status: {activeSession.status}
                </Badge>
                <Button
                  size="sm"
                  onClick={() => setWelcomeSession(activeSession)}
                  className="w-full sm:w-auto h-10 sm:h-8 bg-primary hover:bg-primary-hover text-primary-ink text-xs gap-1.5 cursor-pointer shadow-sm min-h-[44px] sm:min-h-0"
                >
                  <Video className="h-3.5 w-3.5" />
                  3 Check Camera & Microphone
                </Button>
              </div>
            </div>
            <CardDescription className="text-text-muted text-xs">
              Interview Ref: <span className="font-mono text-primary font-semibold">#{activeSession.id.slice(0, 8)}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-text">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2 border-y border-card-border font-mono bg-card/60 rounded-lg p-2.5">
              <div>Role: <span className="text-text font-bold">{activeSession.role}</span></div>
              <div>Seniority: <span className="text-text font-bold">{activeSession.seniority}</span></div>
              <div>Difficulty: <span className="text-text font-bold">{activeSession.difficulty}</span></div>
              <div>Created: <span className="text-text font-bold">{new Date(activeSession.created_at).toLocaleTimeString()}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 02: PERFORMANCE & READINESS PROGRESS HUB (§3.9 & RP6) */}
      {reportsList.length > 0 && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="label-mono text-primary text-[11px]">02 // PERFORMANCE & READINESS PROGRESS</span>
              <h2 className="text-xl font-bold text-text tracking-tight font-display flex items-center gap-2 mt-0.5">
                <TrendingUp className="h-5 w-5 text-primary" />
                Interview Trajectory & Readiness Progress
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-card-border text-text font-mono text-xs bg-bg-subtle">
                {reportsList.length} Evaluated Session(s)
              </Badge>
            </div>
          </div>

          {/* Top Progress Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="card-editorial p-5 space-y-2">
              <span className="label-mono text-text-faint text-[10px]">Latest Score Trajectory</span>
              <div className="flex items-baseline justify-between">
                <div className="text-3xl font-bold text-text font-display">
                  {reportsList[0].overview.overall_score}
                  <span className="text-sm text-text-muted font-normal">/100</span>
                </div>
                {chronologicalReports.length > 1 && (
                  <Badge
                    variant="outline"
                    className={`font-mono text-xs ${
                      reportsList[0].overview.overall_score >= chronologicalReports[0].overview.overall_score
                        ? 'bg-mint text-primary border-primary/30'
                        : 'bg-peach text-accent border-accent/30'
                    }`}
                  >
                    {reportsList[0].overview.overall_score >= chronologicalReports[0].overview.overall_score ? '+' : ''}
                    {reportsList[0].overview.overall_score - chronologicalReports[0].overview.overall_score} pts vs baseline
                  </Badge>
                )}
              </div>
              <p className="text-xs text-text-muted">
                Verdict:{' '}
                <span className="font-semibold text-text">{reportsList[0].overview.verdict}</span>
              </p>
            </Card>

            <Card className="card-editorial p-5 space-y-2">
              <span className="label-mono text-text-faint text-[10px]">Current Job-Readiness Estimate</span>
              <div className="text-2xl font-bold text-text font-display">
                {reportsList[0].readiness.available ? (
                  <>
                    {reportsList[0].readiness.range_low} to {reportsList[0].readiness.range_high}%
                  </>
                ) : (
                  <span className="text-sm font-sans font-medium text-text-muted">Gated (Insufficient Data)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-mint/60 text-primary border-primary/30 font-mono text-xs">
                  {reportsList[0].readiness.band}
                </Badge>
                <span className="text-[11px] text-text-faint font-mono">
                  {reportsList[0].readiness.confidence} confidence
                </span>
              </div>
            </Card>

            <Card className="card-editorial p-5 space-y-2">
              <span className="label-mono text-text-faint text-[10px]">Interview Bar Advancement</span>
              <div className="text-sm font-semibold text-text line-clamp-1 pt-1">
                {reportsList[0].readiness.advance_verdict}
              </div>
              <p className="text-[11px] text-text-muted line-clamp-2">
                Evaluated against the expected standard for a {reportsList[0].role.level} {reportsList[0].role.title}.
              </p>
            </Card>
          </div>

          {/* Progression Trend Line Card */}
          <Card id="reviews" className="card-editorial shadow-sm scroll-mt-20">
            <CardHeader className="pb-3 border-b border-card-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="label-mono text-primary text-[10px]">PROGRESSION TIMELINE</span>
                  <CardTitle className="text-base text-text font-display font-bold">
                    Overall Score & Readiness Progression Over Time
                  </CardTitle>
                </div>
                <span className="text-xs text-text-faint font-mono">
                  Chronological mock interview history
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Deterministic SVG Progression Graph */}
              <div className="w-full bg-bg-subtle/50 border border-card-border rounded-xl p-4 overflow-hidden">
                <div className="flex items-center justify-between text-xs text-text-muted font-mono mb-2">
                  <span>Score Index (/100)</span>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" /> Overall Score
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded bg-mint border border-primary/20 inline-block" /> Readiness Band Range
                    </span>
                  </div>
                </div>

                <div className="relative h-44 w-full">
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 160">
                    <defs>
                      <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0F4A3A" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#0F4A3A" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="readinessBandGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E3EFE8" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#E3EFE8" stopOpacity="0.2" />
                      </linearGradient>
                    </defs>

                    {/* Subtle grid lines */}
                    {[25, 50, 75, 100].map((gridVal) => {
                      const y = 140 - (gridVal / 100) * 110;
                      return (
                        <g key={gridVal}>
                          <line
                            x1="30"
                            y1={y}
                            x2="570"
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity="0.1"
                            strokeDasharray="4 4"
                          />
                          <text
                            x="15"
                            y={y + 3}
                            className="fill-current text-text-faint text-[9px] font-mono"
                            textAnchor="middle"
                          >
                            {gridVal}
                          </text>
                        </g>
                      );
                    })}

                    {/* Connected score line points */}
                    {(() => {
                      const count = chronologicalReports.length;
                      const points = chronologicalReports.map((rpt, i) => {
                        const x = count === 1 ? 300 : 50 + (i / (count - 1)) * 500;
                        const scoreClamped = Math.max(0, Math.min(100, rpt.overview.overall_score));
                        const y = 140 - (scoreClamped / 100) * 110;
                        const lowY = 140 - (Math.max(0, Math.min(100, rpt.readiness.range_low)) / 100) * 110;
                        const highY = 140 - (Math.max(0, Math.min(100, rpt.readiness.range_high)) / 100) * 110;
                        return { x, y, lowY, highY, score: rpt.overview.overall_score, report: rpt, index: i };
                      });

                      const lineD = points.length === 1
                        ? `M 50 ${points[0].y} L 550 ${points[0].y}`
                        : points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

                      const areaD = points.length === 1
                        ? `M 50 ${points[0].y} L 550 ${points[0].y} L 550 140 L 50 140 Z`
                        : `${lineD} L ${points[points.length - 1].x.toFixed(1)} 140 L ${points[0].x.toFixed(1)} 140 Z`;

                      return (
                        <>
                          {/* Shaded Area under score line */}
                          <path d={areaD} fill="url(#scoreAreaGradient)" />

                          {/* Connecting Score Path */}
                          <path
                            d={lineD}
                            fill="none"
                            stroke="#0F4A3A"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Data points */}
                          {points.map((pt) => (
                            <g key={pt.report.session_id}>
                              {/* Range barbell / vertical indicator */}
                              {pt.report.readiness.available && (
                                <line
                                  x1={pt.x}
                                  y1={pt.highY}
                                  x2={pt.x}
                                  y2={pt.lowY}
                                  stroke="#C2410C"
                                  strokeWidth="2"
                                  strokeOpacity="0.4"
                                />
                              )}
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="5.5"
                                fill="#0F4A3A"
                                stroke="#FFFFFF"
                                strokeWidth="2"
                              />
                              <text
                                x={pt.x}
                                y={pt.y - 10}
                                textAnchor="middle"
                                className="fill-current text-primary font-mono text-[10px] font-bold"
                              >
                                {pt.score}
                              </text>
                              <text
                                x={pt.x}
                                y="155"
                                textAnchor="middle"
                                className="fill-current text-text-muted font-mono text-[9px]"
                              >
                                S{pt.index + 1}
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              {/* Progress milestones list */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {chronologicalReports.map((rpt, idx) => (
                  <div
                    key={rpt.session_id}
                    className="p-3.5 rounded-xl border border-card-border bg-card hover:bg-bg-subtle/50 transition-colors flex items-center justify-between text-xs font-mono"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-sans font-semibold text-text">
                        <span>Session {idx + 1}</span>
                        <span className="text-text-faint font-normal">·</span>
                        <span className="text-[11px] text-text-muted">{new Date(rpt.generated_at).toLocaleDateString()}</span>
                      </div>
                      <div className="text-[11px] text-text-muted truncate max-w-[180px]">
                        {rpt.role.level} {rpt.role.title}
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="text-sm font-bold text-primary font-mono">
                        {rpt.overview.overall_score}/100
                      </div>
                      <Badge variant="outline" className="text-[9px] bg-mint/50 text-primary border-primary/20">
                        {rpt.readiness.band}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Topic Comparison & Focus Areas Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Improving Topics */}
            <Card className="card-editorial shadow-sm">
              <CardHeader className="pb-3 border-b border-card-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <CardTitle className="text-sm text-text font-display font-bold">
                      Improving & Mastered Topics
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="bg-mint text-primary border-primary/20 font-mono text-[10px]">
                    {topicProgress.improving.length} topic(s)
                  </Badge>
                </div>
                <CardDescription className="text-text-muted text-xs">
                  Topics showing positive score delta (&Delta; &gt; 0) across consecutive interviews.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {topicProgress.improving.length === 0 ? (
                  <p className="text-xs text-text-muted italic py-3">
                    Complete additional interviews to track upward topic shifts.
                  </p>
                ) : (
                  <div className="divide-y divide-card-border">
                    {topicProgress.improving.map((item) => (
                      <div key={item.topic} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-text">{item.topic}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-text-muted">{item.latestScore}%</span>
                          <Badge variant="outline" className="bg-mint text-primary border-primary/30 font-mono text-[10px]">
                            {item.label}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stalled / Focus Needed Topics */}
            <Card className="card-editorial shadow-sm">
              <CardHeader className="pb-3 border-b border-card-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-accent" />
                    <CardTitle className="text-sm text-text font-display font-bold">
                      Stalled & Focus-Needed Topics
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="bg-peach/60 text-accent border-accent/20 font-mono text-[10px]">
                    {topicProgress.stalled.length} topic(s)
                  </Badge>
                </div>
                <CardDescription className="text-text-muted text-xs">
                  Topics that have plateaued or scored below expected level rubric bar.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {topicProgress.stalled.length === 0 ? (
                  <p className="text-xs text-text-muted italic py-3">
                    No stalled topics detected. All evaluated areas are progressing positively.
                  </p>
                ) : (
                  <div className="divide-y divide-card-border">
                    {topicProgress.stalled.map((item) => (
                      <div key={item.topic} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-text">{item.topic}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-text-muted">{item.latestScore}%</span>
                          <Badge variant="outline" className="bg-peach/80 text-accent border-accent/30 font-mono text-[10px]">
                            {item.label}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Call-to-action button */}
                <div className="pt-2 border-t border-card-border">
                  <Button
                    onClick={handleStartFocusInterview}
                    className="w-full bg-primary hover:bg-primary-hover text-primary-ink font-semibold text-xs gap-2 cursor-pointer shadow-sm"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Start another interview with these focus areas
                  </Button>
                  <p className="text-[10px] text-text-faint font-mono text-center mt-1.5">
                    Pre-configures target role with focus on: {topicProgress.weakest3.join(', ')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Real-World Interview Outcome Calibration Feedback Card (§6 & RP6) */}
          <Card className="card-editorial border-primary/20 bg-mint/20 shadow-sm">
            <CardHeader className="pb-3 border-b border-card-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm text-text font-display font-bold">
                    Real-World Calibration Feedback (Optional &amp; Opt-In)
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono bg-card text-primary border-primary/30">
                  Model Calibration
                </Badge>
              </div>
              <CardDescription className="text-text-muted text-xs">
                Did you take a real interview for your {reportsList[0].role.level} {reportsList[0].role.title} target? How did it go?
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {outcomeState[reportsList[0].session_id]?.submitted ? (
                <div className="p-3.5 rounded-xl bg-card border border-success/30 text-success text-xs flex items-center gap-2 font-medium">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>
                    Thank you! Your feedback will help calibrate future interview readiness models for all candidates.
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'offer', label: '🎉 Offer Received' },
                    { id: 'final_round', label: '🚀 Advanced to Final Round' },
                    { id: 'rejection', label: '❌ Rejection' },
                    { id: 'ghosted', label: '👻 Ghosted / No Response' },
                    { id: 'not_yet', label: '⏳ Still in Process / Scheduled' },
                  ].map((option) => (
                    <Button
                      key={option.id}
                      variant="outline"
                      size="sm"
                      disabled={outcomeState[reportsList[0].session_id]?.isSubmitting}
                      onClick={() => handleRecordOutcome(reportsList[0].session_id, option.id)}
                      className={`text-xs font-sans cursor-pointer transition-all ${
                        outcomeState[reportsList[0].session_id]?.outcome === option.id
                          ? 'bg-primary text-primary-ink border-primary'
                          : 'bg-card text-text border-card-border hover:bg-bg-subtle'
                      }`}
                    >
                      {outcomeState[reportsList[0].session_id]?.isSubmitting &&
                      outcomeState[reportsList[0].session_id]?.outcome === option.id ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      ) : null}
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-text-faint font-mono">
                Stored separately and never required. Helps ensure deterministic estimates reflect true hiring outcomes.
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      {/* SECTION 03: COMPLETED INTERVIEW REPORTS ARCHIVE (§3 & RP6) */}
      {reportsList.length > 0 && (
        <Card className="card-editorial shadow-sm">
          <CardHeader className="pb-3 border-b border-card-border">
            <div className="flex items-center justify-between">
              <div>
                <span className="label-mono text-primary text-[10px]">03 // MY REVIEWS</span>
                <CardTitle className="text-base text-text font-display font-bold">
                  My Reviews
                </CardTitle>
              </div>
              <span className="text-xs text-text-faint font-mono">
                {reportsList.length} completed review(s)
              </span>
            </div>
            <CardDescription className="text-text-muted text-xs">
              Access comprehensive Q&amp;A reviews, correctness breakdowns, satisfaction verdicts, and PDF scorecard exports.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-card-border">
            {reportsList.map((rpt) => {
              const sessionForRpt = getSessionForReport(rpt);
              const isDownloading = downloadingPdfSessionId === rpt.session_id;

              return (
                <div key={rpt.session_id} className="py-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-text font-display">
                          {rpt.role.level} {rpt.role.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono bg-mint/50 text-primary border-primary/30"
                        >
                          {rpt.overview.verdict}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted font-mono">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(rpt.generated_at).toLocaleDateString()}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {rpt.overview.duration.actual_minutes} mins actual ({rpt.overview.duration.planned_minutes}m planned)
                        </span>
                        <span>·</span>
                        <span>
                          {rpt.overview.counts.answered} of {rpt.overview.counts.asked} questions answered
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
                      <div className="px-3 py-1.5 rounded-xl bg-bg-subtle border border-card-border text-center">
                        <span className="text-[10px] text-text-faint block uppercase font-mono">Score</span>
                        <span className="text-sm font-bold text-primary font-mono">
                          {rpt.overview.overall_score}/100
                        </span>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-bg-subtle border border-card-border text-center">
                        <span className="text-[10px] text-text-faint block uppercase font-mono">Readiness</span>
                        <span className="text-xs font-semibold text-text font-mono">
                          {rpt.readiness.available
                            ? `${rpt.readiness.range_low} to ${rpt.readiness.range_high}%`
                            : 'Gated'}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => setViewingReport({ report: rpt, session: sessionForRpt })}
                        className="w-full sm:w-auto h-10 sm:h-9 px-3.5 bg-primary hover:bg-primary-hover text-primary-ink text-xs font-semibold gap-1.5 cursor-pointer shadow-sm min-h-[44px] sm:min-h-0"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Full Review
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isDownloading}
                        onClick={() => handleDownloadPdf(rpt, sessionForRpt)}
                        className="w-full sm:w-auto h-10 sm:h-9 px-3 text-xs border-card-border text-text hover:bg-bg-subtle gap-1.5 cursor-pointer font-sans min-h-[44px] sm:min-h-0"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-text-muted line-clamp-2 bg-bg-subtle/40 p-2.5 rounded-xl border border-card-border/60">
                    <span className="font-semibold text-text">Executive Summary: </span>
                    {rpt.overview.summary}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* SECTION 04: Raw Candidate Sessions List */}
      {sessionsList.length > 0 && (
        <Card className="card-editorial shadow-sm">
          <CardHeader className="pb-3 border-b border-card-border">
            <div className="flex items-center justify-between">
              <div>
                <span className="label-mono text-primary text-[10px]">04 // SESSION RUNTIME POOL</span>
                <CardTitle className="text-base text-text font-display font-bold">Interview Sessions</CardTitle>
              </div>
              <span className="text-xs text-text-faint font-mono">{sessionsList.length} session(s) recorded</span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="divide-y divide-card-border text-xs font-mono">
              {sessionsList.map((sess) => (
                <div key={sess.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-text font-semibold">
                      {sess.seniority} {sess.role}
                    </div>
                    <div className="text-text-faint text-[11px]">
                      Interview Ref: #{sess.id.slice(0, 8)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-text-muted">{sess.difficulty}</span>
                    <Badge variant={sess.status === 'CREATED' ? 'outline' : 'success'} className="text-[10px]">
                      {sess.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setWelcomeSession(sess)}
                      className="h-10 sm:h-8 px-3 text-xs text-primary border-primary/30 hover:bg-mint/40 gap-1.5 cursor-pointer font-sans min-h-[44px] sm:min-h-0"
                    >
                      <Video className="h-3 w-3" />
                      Configure &amp; Start
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dev Latency Lab & STT Observability Footer Link (Development Mode Only) */}
      {import.meta.env.DEV && (
        <footer className="pt-6 pb-2 text-center text-xs text-text-muted">
          <div className="inline-flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-card border border-card-border shadow-sm">
            <span className="font-mono text-[11px] text-text-muted">Voice Turnaround &amp; STT Benchmarks:</span>
            <a
              href="?latency-lab=true"
              className="font-mono text-primary font-semibold hover:underline inline-flex items-center gap-1.5"
            >
              <Activity className="h-3.5 w-3.5" />
              Open Dev Latency Lab
            </a>
          </div>
        </footer>
      )}
    </div>
  );
}
