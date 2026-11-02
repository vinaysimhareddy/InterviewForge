import React, { useState, useEffect } from 'react';
import {
  Key,
  LogOut,
  Send,
  AlertTriangle,
  CheckCircle,
  Copy,
  Check,
  FileText,
  PlayCircle,
  Layers,
  Video,
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
import { useMediaStream } from '@/context/CameraStreamContext';

export default function DashboardPage(): React.ReactElement {
  const { user, token, logout, fetchProfile } = useAuth();
  const { stopAll } = useMediaStream();
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
  const [_isLoadingData, setIsLoadingData] = useState(false);

  // Security test sandbox state
  const [testResult, setTestResult] = useState<{
    endpoint: string;
    status: number;
    data: unknown;
    timestamp: string;
    isError?: boolean;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Load candidate's existing resumes and sessions
  useEffect(() => {
    async function loadCandidateData() {
      setIsLoadingData(true);
      try {
        const [resumes, sessions] = await Promise.all([
          apiClient.get<ResumeData[]>('/api/v1/resumes').catch(() => []),
          apiClient.get<SessionData[]>('/api/v1/sessions').catch(() => []),
        ]);
        setResumesList(resumes);
        if (resumes.length > 0 && !selectedResume) {
          setSelectedResume(resumes[0]);
        }
        setSessionsList(sessions);
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

  const testWithToken = async () => {
    setIsTesting(true);
    try {
      const data = await fetchProfile();
      setTestResult({
        endpoint: 'GET /api/v1/auth/me (With Bearer Token)',
        status: 200,
        data,
        timestamp: new Date().toLocaleTimeString(),
        isError: false,
      });
    } catch (err) {
      const errorData = err instanceof ApiError ? err.data : { error: 'Unknown error' };
      const status = err instanceof ApiError ? err.status : 500;
      setTestResult({
        endpoint: 'GET /api/v1/auth/me (With Bearer Token)',
        status,
        data: errorData,
        timestamp: new Date().toLocaleTimeString(),
        isError: true,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const testWithoutToken = async () => {
    setIsTesting(true);
    try {
      const response = await fetch('/api/v1/auth/me', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      setTestResult({
        endpoint: 'GET /api/v1/auth/me (WITHOUT Authorization Header)',
        status: response.status,
        data,
        timestamp: new Date().toLocaleTimeString(),
        isError: response.status !== 200,
      });
    } catch {
      setTestResult({
        endpoint: 'GET /api/v1/auth/me (WITHOUT Authorization Header)',
        status: 401,
        data: { detail: 'Could not validate credentials' },
        timestamp: new Date().toLocaleTimeString(),
        isError: true,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const copyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

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

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="text-danger border-danger/30 bg-danger/5 hover:bg-danger/10 hover:text-danger"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-bg-subtle border border-card-border space-y-1">
            <span className="label-mono text-text-faint text-[10px]">Candidate ID</span>
            <p className="text-xs font-mono text-text truncate" title={user?.id}>
              {user?.id}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-bg-subtle border border-card-border space-y-1">
            <span className="label-mono text-text-faint text-[10px]">Active Resumes</span>
            <div className="flex items-center gap-1.5 text-xs text-text">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>{resumesList.length} uploaded document(s)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-bg-subtle border border-card-border space-y-1">
            <span className="label-mono text-text-faint text-[10px]">Interview Sessions</span>
            <div className="flex items-center gap-1.5 text-xs text-success">
              <Layers className="h-3.5 w-3.5 text-success" />
              <span>{sessionsList.length} created session(s)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PHASE 3 & 4: Resume Ingestion & Interview Configurator Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="label-mono text-primary text-[11px]">01 // RESUME & ROLE GROUNDING</span>
            <h2 className="text-xl font-bold text-text tracking-tight font-display flex items-center gap-2 mt-0.5">
              <Layers className="h-5 w-5 text-primary" />
              Interview Preparation & Grounding
            </h2>
          </div>
          <Badge variant="outline" className="border-card-border text-text-muted bg-bg-subtle font-mono text-xs self-start sm:self-auto">
            Phase 3 & 4: Computer Vision & Telemetry
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Resume Ingestion */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" />
              1. Resume Upload & PDF Parsing (pdfplumber)
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
              2. Target Role, Seniority & Difficulty
            </h3>
            <InterviewConfigurator
              selectedResume={selectedResume}
              onSessionCreated={handleSessionCreated}
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
                  Interview Session Active
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success" className="font-mono text-xs">
                  Status: {activeSession.status}
                </Badge>
                <Button
                  size="sm"
                  onClick={() => setWelcomeSession(activeSession)}
                  className="h-8 bg-primary hover:bg-primary-hover text-primary-ink text-xs gap-1.5 cursor-pointer shadow-sm"
                >
                  <Video className="h-3.5 w-3.5" />
                  Configure & Enter Live Room
                </Button>
              </div>
            </div>
            <CardDescription className="text-text-muted text-xs">
              Session UUID: <span className="font-mono text-primary font-semibold">{activeSession.id}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-text">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2 border-y border-card-border font-mono bg-card/60 rounded-lg p-2.5">
              <div>Role: <span className="text-text font-bold">{activeSession.role}</span></div>
              <div>Seniority: <span className="text-text font-bold">{activeSession.seniority}</span></div>
              <div>Difficulty: <span className="text-text font-bold">{activeSession.difficulty}</span></div>
              <div>Created: <span className="text-text font-bold">{new Date(activeSession.created_at).toLocaleTimeString()}</span></div>
            </div>
            <p className="text-text-muted text-xs pt-1">
              Phase 4 Telemetry streaming active over WebSocket at <code className="bg-bg-subtle px-1.5 py-0.5 rounded border border-card-border text-primary font-mono text-[11px]">/api/v1/telemetry/ws</code>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Candidate Sessions List */}
      {sessionsList.length > 0 && (
        <Card className="card-editorial shadow-sm">
          <CardHeader className="pb-3 border-b border-card-border">
            <div className="flex items-center justify-between">
              <div>
                <span className="label-mono text-primary text-[10px]">02 // SESSION ARCHIVE</span>
                <CardTitle className="text-base text-text font-display font-bold">Your Interview Sessions</CardTitle>
              </div>
              <span className="text-xs text-text-faint font-mono">{sessionsList.length} session(s) in MongoDB</span>
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
                      Session ID: {sess.id}
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
                      className="h-8 px-3 text-xs text-primary border-primary/30 hover:bg-mint/40 gap-1.5 cursor-pointer font-sans"
                    >
                      <Video className="h-3 w-3" />
                      Configure & Start
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Barrier Sandbox Inspector */}
      <Card className="card-editorial shadow-sm">
        <CardHeader className="border-b border-card-border pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-mint border border-primary/20 flex items-center justify-center text-primary">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <span className="label-mono text-primary text-[10px]">03 // PROTOCOL VALIDATION</span>
                <CardTitle className="text-base text-text font-display font-bold">Security & Token Inspector Sandbox</CardTitle>
              </div>
            </div>
            <Badge variant="outline" className="border-card-border text-text-muted bg-bg-subtle font-mono text-xs self-start sm:self-auto">
              Active Authorization Check
            </Badge>
          </div>
          <CardDescription className="text-text-muted text-xs mt-1">
            Verify candidate token authorization. Test accessing <code className="bg-bg-subtle px-1 py-0.5 rounded border border-card-border text-text font-mono">/api/v1/auth/me</code> with Bearer token (expect 200 OK) or without token (expect 401 Unauthorized).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
                <Key className="h-3.5 w-3.5 text-primary" />
                Active Access Token
              </span>
              <button
                type="button"
                onClick={copyToken}
                className="text-primary hover:text-primary-hover font-mono text-xs flex items-center gap-1 transition-colors"
              >
                {copiedToken ? (
                  <>
                    <Check className="h-3 w-3 text-success" />
                    <span className="text-success font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy Token</span>
                  </>
                )}
              </button>
            </div>
            <div className="p-3 bg-bg-subtle rounded-xl border border-card-border text-xs font-mono text-text-muted break-all select-all">
              {token || 'No token active'}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={testWithToken}
              disabled={isTesting}
              className="bg-primary hover:bg-primary-hover text-primary-ink font-medium gap-2 shadow-sm text-xs"
            >
              <Send className="h-4 w-4" />
              Test With Token (Expect 200 OK)
            </Button>

            <Button
              variant="outline"
              onClick={testWithoutToken}
              disabled={isTesting}
              className="border-danger/30 text-danger bg-danger/5 hover:bg-danger/10 gap-2 text-xs"
            >
              <AlertTriangle className="h-4 w-4 text-danger" />
              Test Without Token (Confirm 401 Unauthorized)
            </Button>
          </div>

          {testResult && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text flex items-center gap-1.5">
                  {testResult.status === 200 ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-danger" />
                  )}
                  <span className="font-medium text-text font-mono">{testResult.endpoint}</span>
                </span>
                <span className="text-text-faint font-mono text-[11px]">Tested at {testResult.timestamp}</span>
              </div>

              <div
                className={`p-4 rounded-xl border text-xs font-mono overflow-x-auto ${
                  testResult.status === 200
                    ? 'bg-mint/20 border-success/30 text-success'
                    : 'bg-danger/5 border-danger/30 text-danger'
                }`}
              >
                <div className="flex items-center justify-between border-b border-card-border pb-2 mb-2 font-semibold">
                  <span className="text-text">HTTP Response Status:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono ${
                      testResult.status === 200
                        ? 'bg-mint text-success border border-success/30'
                        : 'bg-danger/10 text-danger border border-danger/30'
                    }`}
                  >
                    {testResult.status} {testResult.status === 200 ? 'OK' : 'UNAUTHORIZED'}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-text">{JSON.stringify(testResult.data, null, 2)}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
