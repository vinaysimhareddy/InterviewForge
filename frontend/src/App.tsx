import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  LayoutDashboard,
  PlayCircle,
  Award,
  FileText,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CameraStreamProvider, useMediaStream } from '@/context/CameraStreamContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Logo } from '@/components/common/Logo';
import AuthPage from '@/pages/AuthPage';
import DashboardPage from '@/pages/DashboardPage';
import LandingPage from '@/pages/LandingPage';
import PrivacyPage from '@/pages/PrivacyPage';
import TermsPage from '@/pages/TermsPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { InterviewWelcome } from '@/components/interview/InterviewWelcome';
import { PreInterviewSetup } from '@/components/interview/PreInterviewSetup';
import { InterviewReady } from '@/components/interview/InterviewReady';
import { InterviewRoom } from '@/components/interview/InterviewRoom';
import { CameraLostModal } from '@/components/interview/CameraLostModal';
import { FaceLostModal } from '@/components/interview/FaceLostModal';
import { InterviewComplete } from '@/components/interview/InterviewComplete';
import { InterviewAborted } from '@/components/interview/InterviewAborted';
import { ExecutiveScorecard } from '@/components/interview/ExecutiveScorecard';
import { FinalReport } from '@/lib/types';
import { formatPageTitle } from '@/copy/glossary';

function ThemeToggleButton(): React.ReactElement {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="h-9 w-9 sm:h-8 sm:w-8 p-0 rounded-full text-text-muted hover:text-text min-h-[44px] sm:min-h-0 min-w-[44px] sm:min-w-0"
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle theme"
    >
      {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function LiveStageDemoWrapper(): React.ReactElement {
  const { videoStream, acquireCamera, acquireAudio } = useMediaStream();

  React.useEffect(() => {
    if (!videoStream) {
      void acquireCamera().catch(() => {});
      void acquireAudio().catch(() => {});
    }
  }, [videoStream, acquireCamera, acquireAudio]);

  return (
    <InterviewRoom
      session={{
        id: 'demo-live-stage-session',
        user_id: 'demo-user-123',
        role: 'Full Stack Engineer',
        seniority: 'Senior',
        difficulty: 'Adaptive',
        status: 'IN_PROGRESS',
        created_at: new Date().toISOString(),
      }}
      token="demo-token-123"
      initialQuestion="Can you walk me through the architecture of a high-throughput real-time web application you designed, and explain your key trade-offs?"
      durationMinutes={15}
      onExit={() => {
        window.location.search = '';
      }}
    />
  );
}

/**
 * Route protection wrapper: unauthenticated users are redirected to /login with target path preserved.
 */
function ProtectedRoute({ children }: { children: React.ReactElement }): React.ReactElement {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-bg text-text flex flex-col items-center justify-center p-8 space-y-4">
        <Logo variant="mark" size={48} className="animate-pulse" />
        <div className="flex items-center gap-3 text-text-muted text-sm font-mono">
          <span className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Verifying candidate session...
        </div>
      </div>
    );
  }

  if (!user) {
    const redirectUrl = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
    return <Navigate to={redirectUrl} replace />;
  }

  return children;
}

/**
 * Auth route wrapper: if already logged in, redirect straight to /app/dashboard or specified target.
 */
function AuthRouteWrapper({ mode }: { mode: 'login' | 'register' }): React.ReactElement {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  React.useEffect(() => {
    document.title = formatPageTitle(mode === 'login' ? 'Sign In' : 'Register');
  }, [mode]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-bg text-text flex flex-col items-center justify-center p-8 space-y-4">
        <Logo variant="mark" size={48} className="animate-pulse" />
        <div className="flex items-center gap-3 text-text-muted text-sm font-mono">
          <span className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading candidate portal...
        </div>
      </div>
    );
  }

  if (user) {
    const params = new URLSearchParams(location.search);
    const target = params.get('redirect') || '/app/dashboard';
    return <Navigate to={target} replace />;
  }

  return (
    <div className="min-h-[100dvh] bg-bg text-text flex flex-col justify-between selection:bg-accent-soft selection:text-accent font-sans">
      <header className="border-b border-card-border bg-bg/85 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo href="/" size="md" responsive={true} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = '/';
            }}
            className="text-text-muted hover:text-text min-h-[44px] sm:min-h-0"
          >
            Back to Home
          </Button>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <AuthPage key={mode} initialMode={mode} />
      </main>
      <footer className="border-t border-card-border bg-bg-subtle py-4 safe-bottom text-center text-xs text-text-muted">
        InterviewForge • Secure Candidate Authentication
      </footer>
    </div>
  );
}

/**
 * Protected App Area Layout Shell
 */
function AppDashboardWrapper(): React.ReactElement {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState<boolean>(false);

  React.useEffect(() => {
    document.title = formatPageTitle('Dashboard');
  }, []);

  const handleMobileNav = (url: string) => {
    setMobileMenuOpen(false);
    window.location.href = url;
  };

  return (
    <div className="min-h-[100dvh] bg-bg text-text flex flex-col selection:bg-accent-soft selection:text-accent font-sans overflow-x-hidden">
      {/* Top Navigation */}
      <header className="border-b border-card-border bg-card/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 shrink-0">
            <Logo href="/app/dashboard" size="md" responsive={true} />
            <span className="label-mono bg-bg-subtle px-2 py-0.5 rounded border border-card-border hidden sm:inline">
              CANDIDATE WORKSPACE
            </span>
          </div>

          {/* App Shell Navigation (Desktop Canonical Order: Dashboard → New Interview → My Reviews → Resume → Account) */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-text-muted">
            <a
              href="/app/dashboard"
              className="text-text font-semibold hover:text-primary transition-colors flex items-center gap-1.5"
            >
              Dashboard
            </a>
            <a
              href="/app/setup"
              className="hover:text-text transition-colors flex items-center gap-1.5"
            >
              New Interview
            </a>
            <a
              href="/app/dashboard#reviews"
              className="hover:text-text transition-colors flex items-center gap-1.5"
            >
              My Reviews
            </a>
            <a
              href="/app/dashboard#resume"
              className="hover:text-text transition-colors flex items-center gap-1.5"
            >
              Resume
            </a>
            <a
              href="/app/dashboard#account"
              className="hover:text-text transition-colors flex items-center gap-1.5"
            >
              Account
            </a>
          </nav>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <Badge variant="success" className="gap-1.5 py-1 px-3 hidden md:inline-flex">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Live Telemetry & Adaptive AI Active
            </Badge>

            <ThemeToggleButton />

            {user && (
              <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-card-border">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-mint border border-primary/20 flex items-center justify-center text-xs text-primary font-semibold">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-text hidden sm:inline">
                    {user.full_name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-text-muted hover:text-text cursor-pointer min-h-[44px] sm:min-h-0 min-w-[44px] sm:min-w-0"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </Button>
              </div>
            )}

            {/* Mobile Hamburger Navigation Button (< 1024px) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close workspace menu' : 'Open workspace menu'}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 rounded-xl border border-card-border bg-card text-text hover:bg-bg-subtle focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer touch-manipulation ml-1"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Sheet Panel */}
        {mobileMenuOpen && (
          <div
            className="lg:hidden border-b border-card-border bg-card/98 backdrop-blur-lg px-4 pt-3 pb-5 space-y-3 shadow-elevated animate-in slide-in-from-top-2 duration-200"
            role="dialog"
            aria-label="Candidate Workspace Mobile Menu"
          >
            {user && (
              <div className="p-3 rounded-xl bg-bg-subtle border border-card-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-mint border border-primary/20 flex items-center justify-center text-xs text-primary font-bold">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-text block">{user.full_name}</span>
                    <span className="text-[11px] text-text-muted font-mono block">{user.email}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {user.role}
                </Badge>
              </div>
            )}

            <nav className="flex flex-col space-y-1 text-sm font-medium text-text">
              <button
                type="button"
                onClick={() => handleMobileNav('/app/dashboard')}
                className="text-left py-2.5 px-3 rounded-xl hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center gap-2.5 font-semibold text-primary"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => handleMobileNav('/app/setup')}
                className="text-left py-2.5 px-3 rounded-xl hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center gap-2.5"
              >
                <PlayCircle className="h-4 w-4 text-primary" />
                New Interview
              </button>
              <button
                type="button"
                onClick={() => handleMobileNav('/app/dashboard#reviews')}
                className="text-left py-2.5 px-3 rounded-xl hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center gap-2.5"
              >
                <Award className="h-4 w-4 text-primary" />
                My Reviews
              </button>
              <button
                type="button"
                onClick={() => handleMobileNav('/app/dashboard#resume')}
                className="text-left py-2.5 px-3 rounded-xl hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center gap-2.5"
              >
                <FileText className="h-4 w-4 text-primary" />
                Resume
              </button>
              <button
                type="button"
                onClick={() => handleMobileNav('/app/dashboard#account')}
                className="text-left py-2.5 px-3 rounded-xl hover:bg-bg-subtle transition-colors min-h-[44px] flex items-center gap-2.5"
              >
                <User className="h-4 w-4 text-primary" />
                Account
              </button>
            </nav>

            <div className="pt-2 border-t border-card-border">
              <Button
                variant="outline"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full text-danger border-danger/30 bg-danger/5 hover:bg-danger/10 hover:text-danger min-h-[44px] font-semibold text-xs gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 w-full space-y-8 sm:space-y-10">
        <DashboardPage />
      </main>

      {/* Footer */}
      <footer className="border-t border-card-border bg-bg-subtle py-6 safe-bottom text-center text-xs text-text-muted">
        InterviewForge • AI Technical Interview Platform
      </footer>
    </div>
  );
}

function PlatformContent(): React.ReactElement {
  // Preview routes: Strictly gated to development or test environments only.
  // In production builds (import.meta.env.DEV === false), this entire block is dead-code eliminated.
  if (import.meta.env.DEV) {
    const isDirectWelcome = typeof window !== 'undefined' && window.location.search.includes('welcome=true');
    const isDirectReady = typeof window !== 'undefined' && window.location.search.includes('ready=true');
    const isDirectSetup = typeof window !== 'undefined' && window.location.search.includes('setup=true');
    const isDirectLiveStage = typeof window !== 'undefined' && window.location.search.includes('live=true');
    const isDirectFaceLost = typeof window !== 'undefined' && window.location.search.includes('face_lost=true');
    const isDirectCameraLost = typeof window !== 'undefined' && window.location.search.includes('camera_lost=true');
    const isDirectComplete = typeof window !== 'undefined' && window.location.search.includes('complete=true');
    const isDirectAborted = typeof window !== 'undefined' && window.location.search.includes('aborted=true');
    const isDirectScorecard = typeof window !== 'undefined' && (window.location.search.includes('scorecard=true') || window.location.search.includes('report=true'));

    if (isDirectWelcome) {
      return (
        <div className="min-h-[100dvh] bg-bg text-text p-4 sm:p-8">
          <InterviewWelcome
            role="Full Stack Engineer"
            seniority="Senior"
            durationMinutes={15}
            onContinue={() => {
              window.location.search = '?setup=true';
            }}
            onBack={() => {
              window.location.search = '';
            }}
          />
        </div>
      );
    }

    if (isDirectReady) {
      return (
        <div className="min-h-[100dvh] bg-bg text-text p-4 sm:p-8">
          <InterviewReady
            session={{
              id: 'demo-session-1234',
              user_id: 'demo-user-123',
              role: 'Full Stack Engineer',
              seniority: 'Senior',
              difficulty: 'Adaptive',
              status: 'IN_PROGRESS',
              created_at: new Date().toISOString(),
            }}
            durationMinutes={15}
            onStart={() => {
              window.location.search = '?live=true';
            }}
            onBack={() => {
              window.location.search = '?setup=true';
            }}
          />
        </div>
      );
    }

    if (isDirectSetup) {
      return (
        <div className="min-h-[100dvh] bg-bg text-text p-4 sm:p-8">
          <PreInterviewSetup
            role="Full Stack Engineer"
            seniority="Senior"
            onStartInterview={(_config) => {
              window.location.search = '?ready=true';
            }}
            onCancel={() => {
              window.location.search = '';
            }}
          />
        </div>
      );
    }

    if (isDirectLiveStage) {
      return <LiveStageDemoWrapper />;
    }

    if (isDirectFaceLost) {
      return (
        <div className="min-h-[100dvh] bg-bg text-text flex items-center justify-center p-4">
          <FaceLostModal
            isOpen={true}
            missingSeconds={14}
            onFaceRestored={() => {
              window.location.search = '?live=true';
            }}
          />
        </div>
      );
    }

    if (isDirectCameraLost) {
      return (
        <div className="min-h-[100dvh] bg-bg text-text flex items-center justify-center p-4">
          <CameraLostModal
            isOpen={true}
            graceSeconds={30}
            reason="Camera feed disconnected or obstructed."
            onRestore={() => {
              window.location.search = '?live=true';
            }}
          />
        </div>
      );
    }

    if (isDirectComplete) {
      return (
        <div className="min-h-[100dvh] bg-bg text-text flex items-center justify-center p-4">
          <InterviewComplete
            role="Full Stack Engineer"
            seniority="Senior"
            isGeneratingReport={false}
            hasReport={true}
            onViewReport={() => {
              window.location.search = '?scorecard=true';
            }}
            onDownloadPdf={() => {}}
            onReturnHome={() => {
              window.location.search = '';
            }}
          />
        </div>
      );
    }

    if (isDirectAborted) {
      return (
        <div className="min-h-[100dvh] bg-bg text-text flex items-center justify-center p-4">
          <InterviewAborted
            role="Full Stack Engineer"
            seniority="Senior"
            reason="aborted_face_not_visible"
            onReturnHome={() => {
              window.location.search = '';
            }}
            onRestartSession={() => {
              window.location.search = '?welcome=true';
            }}
          />
        </div>
      );
    }

    if (isDirectScorecard) {
      const demoScorecardReport: FinalReport = {
        overall_score: 86,
        hiring_recommendation: 'Strong Hire',
        category_scores: {
          technical: 88,
          communication: 85,
          composure: 82,
        },
        strengths: [
          'Demonstrated deep understanding of distributed systems architecture, concurrency control, and idempotency guarantees.',
          'Articulated trade-offs between eventual consistency and strict ACID semantics with high precision.',
          'Maintained steady posture and calm eye contact while reasoning through edge case scenarios.',
        ],
        weaknesses: [
          'Could dive deeper into specific zero-downtime database migration strategies under heavy write volume.',
          'Elaborate more on disaster recovery RPO/RTO SLAs when answering system failure prompts.',
        ],
        executive_summary:
          'Candidate showed exceptional mastery in full-stack architecture, clean separation of concerns, and system resiliency. Communication was articulate and concise. Non-verbal composure and focus were consistently maintained throughout all technical challenges.',
        integrity_summary: {
          verdict: 'Verified',
          integrity_score: 98,
          camera_device_name: 'Physical Hardware Webcam Verified (Integrated Camera)',
          challenges_passed: 2,
          challenges_failed: 0,
          face_present_percentage: 99.4,
          pauses_count: 0,
          camera_loss_incidents: 0,
          timeline_events: [],
          excluded_segments_count: 0,
          non_verbal_excluded_note:
            'Non-verbal scores (eye contact, posture) are computed only from verified-live segments; segments with active integrity flags were excluded.',
          disclaimer: 'Automated camera verification combined with session plausibility checks.',
        },
        difficulty_progression: [
          { question_index: 1, difficulty_tier: 2.0, difficulty_label: 'Easy-Medium', score: 8.5, change: 'UPGRADE' },
          { question_index: 2, difficulty_tier: 2.5, difficulty_label: 'Medium', score: 8.8, change: 'UPGRADE' },
          { question_index: 3, difficulty_tier: 3.0, difficulty_label: 'Hard', score: 9.0, change: 'UNCHANGED' },
          { question_index: 4, difficulty_tier: 3.0, difficulty_label: 'Hard', score: 8.2, change: 'UNCHANGED' },
          { question_index: 5, difficulty_tier: 3.5, difficulty_label: 'Staff', score: 8.5, change: 'UPGRADE' },
        ],
        question_coverage: [
          {
            question_index: 1,
            question: 'How do you design an idempotent payment processing endpoint to prevent double-charging on network retries?',
            candidate_answer: 'I use a client-generated Idempotency-Key header stored in Redis with a 24-hour TTL and transactional locks in PostgreSQL before processing.',
            planner_action: 'resume_probe',
            target_topic: 'Payment API & Idempotency',
            source_description: 'From resume: Stripe Integration & PostgreSQL',
            difficulty_tier: 2.0,
            difficulty_label: 'Easy-Medium',
            score: 8.5,
            feedback: 'Strong grasp of idempotency keys, Redis TTL, and database transactions.',
          },
          {
            question_index: 2,
            question: 'When implementing Redis cache invalidation, how do you prevent cache stampedes under heavy traffic?',
            candidate_answer: 'We use probabilistic early expiration with mutex locks so only one worker recomputes the cache key while others receive stale values temporarily.',
            planner_action: 'follow_up_probe',
            target_topic: 'Redis Caching & Concurrency',
            source_description: 'Adaptive follow-up to caching answer',
            difficulty_tier: 2.5,
            difficulty_label: 'Medium',
            score: 8.8,
            feedback: 'Excellent explanation of mutex locks and probabilistic early expiration (XFetch algorithm).',
          },
          {
            question_index: 3,
            question: 'How would you handle schema migrations on a 50M-row PostgreSQL table without downtime?',
            candidate_answer: 'We use expand-and-contract: add nullable columns, double-write via application code, backfill asynchronously with batch limits, then switch reads.',
            planner_action: 'kb_probe',
            target_topic: 'Database Migrations & Scaling',
            source_description: 'Role knowledge base: High-throughput SQL',
            difficulty_tier: 3.0,
            difficulty_label: 'Hard',
            score: 9.0,
            feedback: 'Flawless expand-and-contract migration strategy and batch backfilling.',
          },
          {
            question_index: 4,
            question: 'Explain how you structure Kafka consumer group rebalances to avoid processing lag spikes.',
            candidate_answer: 'We use cooperative sticky assignors in Kafka 2.4+ so only affected partitions migrate rather than triggering stop-the-world partition revocations.',
            planner_action: 'kb_probe',
            target_topic: 'Distributed Messaging (Kafka)',
            source_description: 'Role knowledge base: Event-Driven Architecture',
            difficulty_tier: 3.0,
            difficulty_label: 'Hard',
            score: 8.2,
            feedback: 'Great knowledge of cooperative sticky assignor mechanics.',
          },
          {
            question_index: 5,
            question: 'Tell me about a time you had an architectural disagreement with a senior engineer. How was it resolved?',
            candidate_answer: 'Situation: Our lead wanted synchronous gRPC, I advocated for async event pub/sub for order placement. Task: Evaluate p99 latency SLAs. Action: Built a benchmark PoC showing gRPC cascade failure risk. Result: Adopted hybrid approach with fallback queues.',
            planner_action: 'behavioral_probe',
            target_topic: 'Technical Leadership & Conflict',
            source_description: 'Adaptive probe: Engineering Leadership',
            difficulty_tier: 3.5,
            difficulty_label: 'Staff',
            score: 8.5,
            feedback: 'Structured STAR response with benchmark data to de-escalate disagreement.',
          },
        ],
      };

      return (
        <div className="min-h-[100dvh] bg-bg text-text p-4 sm:p-8">
          <ExecutiveScorecard
            session={{
              id: 'session-demo-84920',
              role: 'Full Stack Engineer',
              seniority: 'Senior',
              created_at: new Date().toISOString(),
            }}
            report={demoScorecardReport}
            onBack={() => {
              window.location.search = '?complete=true';
            }}
            onDownloadPdf={() => {}}
            onReturnHome={() => {
              window.location.search = '';
            }}
          />
        </div>
      );
    }
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthRouteWrapper mode="login" />} />
        <Route path="/register" element={<AuthRouteWrapper mode="register" />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* Protected App Routes */}
        <Route
          path="/app/dashboard"
          element={
            <ProtectedRoute>
              <AppDashboardWrapper />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/setup"
          element={
            <ProtectedRoute>
              <div className="min-h-[100dvh] bg-bg text-text p-4 sm:p-8">
                <PreInterviewSetup
                  role="Full Stack Engineer"
                  seniority="Senior"
                  onStartInterview={(_config) => {
                    window.location.href = '/app/interview';
                  }}
                  onCancel={() => {
                    window.location.href = '/app/dashboard';
                  }}
                />
              </div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/interview"
          element={
            <ProtectedRoute>
              <ErrorBoundary fallbackTitle="Interview Stage Error">
                <LiveStageDemoWrapper />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app"
          element={<Navigate to="/app/dashboard" replace />}
        />

        {/* 404 Catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary fallbackTitle="Application Error Encountered">
      <ThemeProvider>
        <AuthProvider>
          <CameraStreamProvider>
            <PlatformContent />
          </CameraStreamProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
