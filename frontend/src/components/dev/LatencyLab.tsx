import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Mic,
  MicOff,
  Server,
  Terminal,
  RefreshCw,
  Download,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  sttTimingLogger,
  TurnTimingRecord,
  PercentileSummary,
  LATENCY_BUDGETS,
} from '@/services/speech/sttTimingLogger';
import { BrowserSpeechToText } from '@/services/speech/browserSTT';
import { NemotronStreamingSTT } from '@/services/speech/nemotronSTT';
import { SpeechToText, TranscriptEvent } from '@/services/speech/types';

export interface LatencyLabProps {
  onClose?: () => void;
  isModal?: boolean;
}

export const LatencyLab: React.FC<LatencyLabProps> = ({ onClose, isModal = false }) => {
  // Timing records state
  const [history, setHistory] = useState<TurnTimingRecord[]>([]);
  const [currentTurn, setCurrentTurn] = useState<TurnTimingRecord | null>(null);
  const [summary, setSummary] = useState<PercentileSummary>(sttTimingLogger.getSummaryMetrics());

  // STT comparison test harness state
  const [selectedProvider, setSelectedProvider] = useState<'browser' | 'nemotron'>('browser');
  const [isTestMicActive, setIsTestMicActive] = useState<boolean>(false);
  const [testInterim, setTestInterim] = useState<string>('');
  const [testFinal, setTestFinal] = useState<string>('');
  const [testTimeouts, setTestTimeouts] = useState<{
    speechStart?: number;
    firstInterim?: number;
    finalText?: number;
    latencyMs?: number;
  }>({});

  // Nemotron Service Health
  const [nemotronStatus, setNemotronStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [nemotronDetails, setNemotronDetails] = useState<any>(null);

  // References for live mic harness
  const activeSTTRef = useRef<SpeechToText | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Subscribe to live turn timing events
  useEffect(() => {
    const unsub = sttTimingLogger.onTimingUpdate((hist, curr) => {
      setHistory([...hist]);
      setCurrentTurn(curr);
      setSummary(sttTimingLogger.getSummaryMetrics());
    });
    return unsub;
  }, []);

  // Probe Nemotron health on port 8001
  const checkNemotronHealth = async () => {
    setNemotronStatus('checking');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch('http://localhost:8001/health', {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setNemotronStatus('online');
        setNemotronDetails(data);
      } else {
        setNemotronStatus('offline');
      }
    } catch {
      setNemotronStatus('offline');
    }
  };

  useEffect(() => {
    checkNemotronHealth();
  }, []);

  // Cleanup test mic on unmount
  useEffect(() => {
    return () => {
      stopTestMic();
    };
  }, []);

  // Start real mic comparison test
  const startTestMic = async () => {
    stopTestMic();
    setTestInterim('');
    setTestFinal('');
    setTestTimeouts({});

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      audioStreamRef.current = stream;

      const startTime = performance.now();
      setTestTimeouts({ speechStart: startTime });

      let sttInstance: SpeechToText;
      if (selectedProvider === 'nemotron') {
        sttInstance = new NemotronStreamingSTT({
          audioStream: stream,
          autoFallback: false,
        });
      } else {
        sttInstance = new BrowserSpeechToText();
      }

      let hasReceivedFirst = false;

      sttInstance.onTranscript((evt: TranscriptEvent) => {
        const now = performance.now();
        if (!hasReceivedFirst && evt.text.trim()) {
          hasReceivedFirst = true;
          setTestTimeouts((prev) => ({
            ...prev,
            firstInterim: now,
            latencyMs: Math.round(now - (prev.speechStart || startTime)),
          }));
        }

        if (evt.isFinal) {
          setTestFinal((prev) => (prev ? `${prev} ${evt.text}` : evt.text));
          setTestInterim('');
          setTestTimeouts((prev) => ({ ...prev, finalText: now }));
        } else {
          setTestInterim(evt.text);
        }
      });

      sttInstance.onError((err) => {
        console.warn('[LatencyLab] STT test error:', err);
      });

      sttInstance.start();
      activeSTTRef.current = sttInstance;
      setIsTestMicActive(true);
    } catch (err) {
      console.error('[LatencyLab] Failed to acquire test microphone:', err);
    }
  };

  const stopTestMic = () => {
    if (activeSTTRef.current) {
      activeSTTRef.current.stop();
      activeSTTRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    setIsTestMicActive(false);
  };

  const handleClearHistory = () => {
    sttTimingLogger.clearHistory();
    setHistory([]);
    setCurrentTurn(null);
    setSummary(sttTimingLogger.getSummaryMetrics());
  };

  const handleExportJSON = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      summary,
      history,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `latency_benchmark_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`w-full max-w-6xl mx-auto space-y-6 ${isModal ? 'p-1' : 'p-4 sm:p-8'}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-card-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-mint border border-primary/20 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-semibold text-text">
                Dev Latency Lab & STT Observability
              </h1>
              <p className="text-xs text-text-muted font-mono">
                Real-time milestone timings, turn-taking budget audit, and live STT comparison (§B7)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkNemotronHealth}
            className="gap-1.5 text-xs font-mono border-card-border cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 text-primary" />
            Check STT Services
          </Button>
          {onClose && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs font-sans border-card-border cursor-pointer"
            >
              Close
            </Button>
          )}
        </div>
      </div>

      {/* STT Services Health & Mode Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Browser STT Status */}
        <Card className="border-card-border bg-card shadow-soft rounded-2xl">
          <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-text">
                  Browser Web Speech API
                </CardTitle>
              </div>
              <Badge className="bg-mint text-primary border-primary/20 text-[11px] font-mono">
                Active & Zero-Compute
              </Badge>
            </div>
            <CardDescription className="text-xs text-text-muted mt-1">
              Low-latency native browser speech recognition. Requires Google service reachability.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Nemotron Service Status */}
        <Card className="border-card-border bg-card shadow-soft rounded-2xl">
          <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-text">
                  Nemotron Streaming STT Service
                </CardTitle>
              </div>
              {nemotronStatus === 'online' ? (
                <Badge className="bg-mint text-primary border-primary/20 text-[11px] font-mono">
                  Online (Port 8001)
                </Badge>
              ) : nemotronStatus === 'checking' ? (
                <Badge variant="outline" className="text-[11px] font-mono">
                  Checking...
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[11px] font-mono">
                  Offline
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-text-muted mt-1">
              {nemotronStatus === 'online' ? (
                <span>
                  NeMo cache-aware ASR active on port 8001. Att context:{' '}
                  {JSON.stringify(nemotronDetails?.att_context_size || [70, 1])}.
                </span>
              ) : (
                <span>
                  Microservice on port 8001 not detected. Browser STT is active as primary.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          {nemotronStatus === 'offline' && (
            <CardContent className="px-4 sm:px-6 pb-4 pt-0">
              <div className="p-3 rounded-xl bg-bg-subtle border border-card-border space-y-1.5 text-xs font-mono">
                <span className="text-[11px] text-text-muted font-bold block flex items-center gap-1.5">
                  <Terminal className="h-3 w-3 text-primary" />
                  To launch Nemotron streaming ASR locally:
                </span>
                <code className="block p-2 rounded-lg bg-card border border-card-border text-primary select-all text-[11px] overflow-x-auto">
                  python -m uvicorn services.stt_service.server:app --port 8001 --host 0.0.0.0
                </code>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Live STT Provider Comparison Harness */}
      <Card className="border-card-border bg-card shadow-soft rounded-2xl">
        <CardHeader className="pb-3 px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-text flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" />
                Live Microphone STT Comparison
              </CardTitle>
              <CardDescription className="text-xs text-text-muted mt-0.5">
                Speak into your mic to test real turnaround, time-to-first-interim, and transcript fidelity.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-card-border p-1 bg-bg-subtle text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedProvider('browser')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    selectedProvider === 'browser'
                      ? 'bg-primary text-[#FBFAF6] shadow-sm'
                      : 'text-text hover:text-primary'
                  }`}
                >
                  Browser STT
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProvider('nemotron')}
                  disabled={nemotronStatus !== 'online'}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    selectedProvider === 'nemotron'
                      ? 'bg-primary text-[#FBFAF6] shadow-sm'
                      : 'text-text hover:text-primary'
                  } ${nemotronStatus !== 'online' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Nemotron {nemotronStatus !== 'online' ? '(Offline)' : ''}
                </button>
              </div>

              {!isTestMicActive ? (
                <Button size="sm" onClick={startTestMic} className="gap-1.5 text-xs font-medium cursor-pointer">
                  <Mic className="h-3.5 w-3.5" />
                  Start Mic Test
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={stopTestMic}
                  className="gap-1.5 text-xs font-medium cursor-pointer"
                >
                  <MicOff className="h-3.5 w-3.5" />
                  Stop Test
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 sm:px-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-bg-subtle border border-card-border">
              <span className="text-[11px] font-mono text-text-muted block uppercase">Time to 1st Interim</span>
              <span className="text-xl font-bold font-mono text-primary">
                {testTimeouts.latencyMs !== undefined ? `${testTimeouts.latencyMs} ms` : '—'}
              </span>
              <span className="text-[10px] text-text-muted block mt-0.5">Budget: ≤ 700 ms</span>
            </div>

            <div className="p-3.5 rounded-xl bg-bg-subtle border border-card-border">
              <span className="text-[11px] font-mono text-text-muted block uppercase">Active Provider</span>
              <span className="text-xl font-bold font-mono text-text">
                {selectedProvider === 'browser' ? 'Browser Web Speech' : 'Nemotron ASR'}
              </span>
              <span className="text-[10px] text-text-muted block mt-0.5">
                {isTestMicActive ? 'Listening to mic...' : 'Idle'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-bg-subtle border border-card-border">
              <span className="text-[11px] font-mono text-text-muted block uppercase">Budget Status</span>
              <span className="text-xl font-bold font-mono">
                {testTimeouts.latencyMs === undefined ? (
                  <span className="text-text-muted">—</span>
                ) : testTimeouts.latencyMs <= LATENCY_BUDGETS.first_interim_max_ms ? (
                  <span className="text-primary flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Pass
                  </span>
                ) : (
                  <span className="text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Exceeded
                  </span>
                )}
              </span>
              <span className="text-[10px] text-text-muted block mt-0.5">
                {testTimeouts.latencyMs !== undefined && testTimeouts.latencyMs > LATENCY_BUDGETS.first_interim_max_ms
                  ? 'Exceeds 700ms threshold'
                  : 'Within interactive threshold'}
              </span>
            </div>
          </div>

          {/* Transcript Display Box */}
          <div className="p-4 rounded-xl bg-bg border border-card-border space-y-2 min-h-[90px]">
            <span className="text-[11px] font-mono text-text-muted uppercase font-semibold block">
              Live Captured Speech:
            </span>
            <div className="text-xs sm:text-sm text-text leading-relaxed">
              {testFinal && <span>{testFinal} </span>}
              {testInterim && <span className="text-primary font-medium italic">{testInterim}</span>}
              {!testFinal && !testInterim && (
                <span className="text-text-muted italic">
                  {isTestMicActive
                    ? 'Start speaking into your microphone...'
                    : 'Click "Start Mic Test" and speak a test sentence.'}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Turnaround Breakdown (Current / Most Recent Turn) */}
      <Card className="border-card-border bg-card shadow-soft rounded-2xl">
        <CardHeader className="pb-3 px-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-text flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Live Turnaround Breakdown (Turn {currentTurn?.turnIndex || history[history.length - 1]?.turnIndex || 1})
              </CardTitle>
              <CardDescription className="text-xs text-text-muted mt-0.5">
                Sequential stage milestones from speech initiation to next question audio start
              </CardDescription>
            </div>

            {currentTurn && (
              <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">
                Turn {currentTurn.turnIndex} Live
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-4 sm:px-6 space-y-5">
          {/* Milestone Pipeline Flow */}
          {(() => {
            const activeRecord = currentTurn || history[history.length - 1];
            const gaps = activeRecord?.gaps || {};
            const budgets = activeRecord?.budgetsExceeded || {
              first_interim_exceeded: false,
              answer_end_decision_exceeded: false,
              tts_start_exceeded: false,
              turnaround_exceeded: false,
            };

            return (
              <div className="space-y-4">
                {/* Stage Steps Visualizer */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-xs">
                  {/* Step 1: speech_start */}
                  <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                    <span className="text-[10px] font-mono text-text-muted block uppercase">1. Speech Start</span>
                    <span className="font-mono font-bold text-text">
                      {activeRecord?.timestamps.speech_start ? '0 ms' : '—'}
                    </span>
                  </div>

                  {/* Step 2: first_interim */}
                  <div
                    className={`p-2.5 rounded-xl border space-y-1 ${
                      budgets.first_interim_exceeded
                        ? 'bg-destructive/10 border-destructive text-destructive'
                        : 'bg-bg-subtle border-card-border text-text'
                    }`}
                  >
                    <span className="text-[10px] font-mono block uppercase">2. 1st Interim</span>
                    <span className="font-mono font-bold">
                      {gaps.speech_to_first_interim_ms !== undefined
                        ? `+${gaps.speech_to_first_interim_ms.toFixed(0)} ms`
                        : '—'}
                    </span>
                    <span className="text-[9px] block opacity-75">≤ 700ms</span>
                  </div>

                  {/* Step 3: last_interim */}
                  <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                    <span className="text-[10px] font-mono text-text-muted block uppercase">3. Last Interim</span>
                    <span className="font-mono font-bold text-text">
                      {gaps.first_to_last_interim_ms !== undefined
                        ? `+${gaps.first_to_last_interim_ms.toFixed(0)} ms`
                        : '—'}
                    </span>
                  </div>

                  {/* Step 4: final_text */}
                  <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                    <span className="text-[10px] font-mono text-text-muted block uppercase">4. Final Text</span>
                    <span className="font-mono font-bold text-text">
                      {gaps.interim_to_final_text_ms !== undefined
                        ? `+${gaps.interim_to_final_text_ms.toFixed(0)} ms`
                        : '—'}
                    </span>
                  </div>

                  {/* Step 5: answer_end_decision */}
                  <div
                    className={`p-2.5 rounded-xl border space-y-1 ${
                      budgets.answer_end_decision_exceeded
                        ? 'bg-destructive/10 border-destructive text-destructive'
                        : 'bg-bg-subtle border-card-border text-text'
                    }`}
                  >
                    <span className="text-[10px] font-mono block uppercase">5. Answer End</span>
                    <span className="font-mono font-bold">
                      {gaps.final_to_answer_end_ms !== undefined
                        ? `+${gaps.final_to_answer_end_ms.toFixed(0)} ms`
                        : '—'}
                    </span>
                    <span className="text-[9px] block opacity-75">≤ 2500ms</span>
                  </div>

                  {/* Step 6: answer_sent */}
                  <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                    <span className="text-[10px] font-mono text-text-muted block uppercase">6. Answer Sent</span>
                    <span className="font-mono font-bold text-text">
                      {gaps.answer_end_to_answer_sent_ms !== undefined
                        ? `+${gaps.answer_end_to_answer_sent_ms.toFixed(0)} ms`
                        : '—'}
                    </span>
                  </div>

                  {/* Step 7: question_received */}
                  <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border space-y-1">
                    <span className="text-[10px] font-mono text-text-muted block uppercase">7. Q Received</span>
                    <span className="font-mono font-bold text-text">
                      {gaps.answer_sent_to_question_received_ms !== undefined
                        ? `+${gaps.answer_sent_to_question_received_ms.toFixed(0)} ms`
                        : '—'}
                    </span>
                  </div>

                  {/* Step 8: tts_start */}
                  <div
                    className={`p-2.5 rounded-xl border space-y-1 ${
                      budgets.tts_start_exceeded
                        ? 'bg-destructive/10 border-destructive text-destructive'
                        : 'bg-bg-subtle border-card-border text-text'
                    }`}
                  >
                    <span className="text-[10px] font-mono block uppercase">8. TTS Start</span>
                    <span className="font-mono font-bold">
                      {gaps.question_received_to_tts_start_ms !== undefined
                        ? `+${gaps.question_received_to_tts_start_ms.toFixed(0)} ms`
                        : '—'}
                    </span>
                    <span className="text-[9px] block opacity-75">≤ 500ms</span>
                  </div>
                </div>

                {/* Total Turnaround Callout */}
                <div
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
                    budgets.turnaround_exceeded
                      ? 'bg-destructive/10 border-destructive text-destructive'
                      : 'bg-bg-subtle border-card-border text-text'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {budgets.turnaround_exceeded ? (
                      <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold text-sm block">
                        Total Answer End → Next Question Audio Start
                      </span>
                      <span className="text-xs opacity-80">
                        Target: ≤ 2.5s (p50), ≤ 4.0s (p95). Current: {gaps.answer_end_to_tts_start_ms ? `${(gaps.answer_end_to_tts_start_ms / 1000).toFixed(2)}s` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="font-mono text-xl font-bold">
                    {gaps.answer_end_to_tts_start_ms
                      ? `${gaps.answer_end_to_tts_start_ms.toFixed(0)} ms`
                      : '—'}
                  </div>
                </div>

                {/* Budget Warnings List */}
                {(budgets.first_interim_exceeded ||
                  budgets.answer_end_decision_exceeded ||
                  budgets.tts_start_exceeded ||
                  budgets.turnaround_exceeded) && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive text-destructive text-xs space-y-1">
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Latency Budget Alerts for this turn:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5">
                      {budgets.first_interim_exceeded && (
                        <li>First interim visual feedback took {gaps.speech_to_first_interim_ms?.toFixed(0)} ms (budget: ≤ 700 ms).</li>
                      )}
                      {budgets.answer_end_decision_exceeded && (
                        <li>End-of-answer decision took {gaps.final_to_answer_end_ms?.toFixed(0)} ms (budget: ≤ 2500 ms).</li>
                      )}
                      {budgets.tts_start_exceeded && (
                        <li>Question text received → TTS audio start took {gaps.question_received_to_tts_start_ms?.toFixed(0)} ms (budget: ≤ 500 ms).</li>
                      )}
                      {budgets.turnaround_exceeded && (
                        <li>Total turnaround exceeded 4.0s cap ({gaps.answer_end_to_tts_start_ms?.toFixed(0)} ms).</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Aggregate Percentiles ($p50$ and $p95$) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Speech to 1st Interim */}
        <Card className="border-card-border bg-card shadow-soft rounded-2xl">
          <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
            <span className="text-[11px] font-mono text-text-muted uppercase">1. Speech → 1st Interim</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-bold font-mono text-primary">
                {summary.speech_to_first_interim.p50} ms
              </span>
              <span className="text-xs font-mono text-text-muted">
                p95: {summary.speech_to_first_interim.p95} ms
              </span>
            </div>
            <CardDescription className="text-[10px] text-text-muted mt-1">
              Target: ≤ 400ms (p50), ≤ 700ms (p95)
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Metric 2: Interim to Final */}
        <Card className="border-card-border bg-card shadow-soft rounded-2xl">
          <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
            <span className="text-[11px] font-mono text-text-muted uppercase">2. Streaming Span</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-bold font-mono text-text">
                {summary.interim_to_final_text.p50} ms
              </span>
              <span className="text-xs font-mono text-text-muted">
                p95: {summary.interim_to_final_text.p95} ms
              </span>
            </div>
            <CardDescription className="text-[10px] text-text-muted mt-1">
              Interim recognizer duration
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Metric 3: Question to TTS Start */}
        <Card className="border-card-border bg-card shadow-soft rounded-2xl">
          <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
            <span className="text-[11px] font-mono text-text-muted uppercase">3. Question → TTS Start</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-bold font-mono text-primary">
                {summary.question_to_tts_start.p50} ms
              </span>
              <span className="text-xs font-mono text-text-muted">
                p95: {summary.question_to_tts_start.p95} ms
              </span>
            </div>
            <CardDescription className="text-[10px] text-text-muted mt-1">
              Target: ≤ 500ms audio trigger
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Metric 4: Total Turnaround */}
        <Card className="border-card-border bg-card shadow-soft rounded-2xl">
          <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
            <span className="text-[11px] font-mono text-text-muted uppercase">4. Total Turnaround</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-bold font-mono text-primary">
                {summary.total_turnaround.p50} ms
              </span>
              <span className="text-xs font-mono text-text-muted">
                p95: {summary.total_turnaround.p95} ms
              </span>
            </div>
            <CardDescription className="text-[10px] text-text-muted mt-1">
              Target: ≤ 2.5s (p50), ≤ 4.0s (p95)
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Turn History Table */}
      <Card className="border-card-border bg-card shadow-soft rounded-2xl">
        <CardHeader className="pb-3 px-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-text">
                Session Turn History ({history.length} samples)
              </CardTitle>
              <CardDescription className="text-xs text-text-muted mt-0.5">
                Historical turnaround metrics and budget status per turn
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJSON}
                disabled={history.length === 0}
                className="gap-1.5 text-xs font-mono border-card-border cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-primary" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearHistory}
                disabled={history.length === 0}
                className="gap-1.5 text-xs font-mono border-card-border text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 sm:px-6 pt-0">
          <div className="overflow-x-auto border border-card-border rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-subtle border-b border-card-border text-text-muted font-mono uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Turn</th>
                  <th className="py-2.5 px-3 font-semibold">Provider</th>
                  <th className="py-2.5 px-3 font-semibold">1st Interim</th>
                  <th className="py-2.5 px-3 font-semibold">Silence → End</th>
                  <th className="py-2.5 px-3 font-semibold">TTS Start</th>
                  <th className="py-2.5 px-3 font-semibold">Total Turnaround</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Budget Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border font-mono text-text">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-text-muted italic">
                      No turn timing samples recorded yet. Run an interview session or mic test above.
                    </td>
                  </tr>
                ) : (
                  history.map((rec) => {
                    const hasViolation =
                      rec.budgetsExceeded.first_interim_exceeded ||
                      rec.budgetsExceeded.answer_end_decision_exceeded ||
                      rec.budgetsExceeded.tts_start_exceeded ||
                      rec.budgetsExceeded.turnaround_exceeded;

                    return (
                      <tr key={rec.turnIndex} className="hover:bg-bg-subtle/50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-primary">Turn {rec.turnIndex}</td>
                        <td className="py-2.5 px-3 text-text-muted capitalize">{rec.provider || 'browser'}</td>
                        <td
                          className={`py-2.5 px-3 ${
                            rec.budgetsExceeded.first_interim_exceeded ? 'text-destructive font-bold' : ''
                          }`}
                        >
                          {rec.gaps.speech_to_first_interim_ms !== undefined
                            ? `${rec.gaps.speech_to_first_interim_ms.toFixed(0)} ms`
                            : '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 ${
                            rec.budgetsExceeded.answer_end_decision_exceeded ? 'text-destructive font-bold' : ''
                          }`}
                        >
                          {rec.gaps.final_to_answer_end_ms !== undefined
                            ? `${rec.gaps.final_to_answer_end_ms.toFixed(0)} ms`
                            : '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 ${
                            rec.budgetsExceeded.tts_start_exceeded ? 'text-destructive font-bold' : ''
                          }`}
                        >
                          {rec.gaps.question_received_to_tts_start_ms !== undefined
                            ? `${rec.gaps.question_received_to_tts_start_ms.toFixed(0)} ms`
                            : '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 ${
                            rec.budgetsExceeded.turnaround_exceeded ? 'text-destructive font-bold' : 'font-semibold text-primary'
                          }`}
                        >
                          {rec.gaps.answer_end_to_tts_start_ms !== undefined
                            ? `${rec.gaps.answer_end_to_tts_start_ms.toFixed(0)} ms`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {hasViolation ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive">
                              <AlertTriangle className="h-3 w-3" /> Exceeded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                              <CheckCircle2 className="h-3 w-3" /> Pass
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
