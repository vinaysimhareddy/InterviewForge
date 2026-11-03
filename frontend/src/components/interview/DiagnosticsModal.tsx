import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  X,
  Copy,
  Check,
  RefreshCw,
  Video,
  ShieldCheck,
  Monitor,
  Mic,
  Zap,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  collectDiagnosticsReport,
  formatDiagnosticsAsMarkdown,
  sanitizeTrackSettings,
  DiagnosticsReport,
} from '@/lib/diagnosticsCollector';

export interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stream?: MediaStream | null;
  audioStream?: MediaStream | null;
  audioContext?: AudioContext | null;
  videoEl?: HTMLVideoElement | null;
  measuredFps?: number;
  meanLuminance?: number;
  faceCount?: number;
  centeringOffsetPct?: number;
  faceHeightPct?: number;
  sharpnessScore?: number;
  headPose?: { yaw: number; pitch: number; roll: number };
  eyeBlink?: number;
  noiseFloorRms?: number | null;
  noiseFloorDb?: number | null;
  estimatedSnrDb?: number | null;
  voicedSeconds?: number | null;
  lastError?: string | null;
  lastGetUserMediaError?: string | null;
  lastSpeechRecognitionError?: string | null;
}

export function DiagnosticsModal({
  isOpen,
  onClose,
  stream,
  audioStream,
  audioContext,
  videoEl,
  measuredFps,
  meanLuminance,
  faceCount,
  centeringOffsetPct,
  faceHeightPct,
  sharpnessScore,
  headPose,
  eyeBlink,
  noiseFloorRms,
  noiseFloorDb,
  estimatedSnrDb,
  voicedSeconds,
  lastError,
  lastGetUserMediaError,
  lastSpeechRecognitionError,
}: DiagnosticsModalProps): React.ReactElement | null {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshReport = async () => {
    setIsLoading(true);
    const data = await collectDiagnosticsReport({
      stream,
      audioStream,
      audioContext,
      videoEl,
      measuredFps,
      meanLuminance,
      faceCount,
      centeringOffsetPct,
      faceHeightPct,
      sharpnessScore,
      headPose,
      eyeBlink,
      noiseFloorRms,
      noiseFloorDb,
      estimatedSnrDb,
      voicedSeconds,
      lastError,
      lastGetUserMediaError,
      lastSpeechRecognitionError,
    });
    setReport(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshReport();
    }
  }, [
    isOpen,
    stream,
    audioStream,
    audioContext,
    videoEl,
    measuredFps,
    meanLuminance,
    faceCount,
    centeringOffsetPct,
    faceHeightPct,
    sharpnessScore,
    headPose,
    eyeBlink,
    noiseFloorRms,
    noiseFloorDb,
    estimatedSnrDb,
    voicedSeconds,
    lastError,
    lastGetUserMediaError,
    lastSpeechRecognitionError,
  ]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!report) return;
    const text = formatDiagnosticsAsMarkdown(report);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep-1/60 backdrop-blur-md p-4 animate-in fade-in">
      <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col card-editorial shadow-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-card-border flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-sky border border-primary/20 flex items-center justify-center text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base text-text font-display font-bold">System & Hardware Diagnostics</CardTitle>
              <span className="text-[11px] text-text-muted">Machine verification & device proof report</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('?latency-lab=true', '_blank')}
              className="h-8 text-xs border-card-border text-text gap-1.5 hover:bg-bg-subtle cursor-pointer"
              title="Open Latency Lab in new tab"
            >
              <Zap className="h-3.5 w-3.5 text-primary" />
              Latency Lab
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshReport}
              disabled={isLoading}
              className="h-8 text-xs border-card-border text-text gap-1.5 hover:bg-bg-subtle"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-text-muted hover:text-text"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
          {report ? (
            <>
              {/* Quick Status Pill Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border">
                  <span className="text-[10px] text-text-faint uppercase block font-sans">Context</span>
                  <span className="text-xs font-semibold text-text flex items-center gap-1 mt-0.5">
                    {report.isSecureContext ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0" />
                    )}
                    {report.isSecureContext ? 'HTTPS / Local' : 'Insecure'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border">
                  <span className="text-[10px] text-text-faint uppercase block font-sans">Camera Perm</span>
                  <span className="text-xs font-semibold text-text flex items-center gap-1 mt-0.5">
                    {report.cameraPermission === 'granted' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 text-warning shrink-0" />
                    )}
                    {report.cameraPermission}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border">
                  <span className="text-[10px] text-text-faint uppercase block font-sans">Mic Perm</span>
                  <span className="text-xs font-semibold text-text flex items-center gap-1 mt-0.5">
                    {report.microphonePermission === 'granted' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 text-warning shrink-0" />
                    )}
                    {report.microphonePermission}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border">
                  <span className="text-[10px] text-text-faint uppercase block font-sans">Video Track</span>
                  <span className="text-xs font-semibold text-text flex items-center gap-1 mt-0.5">
                    {report.activeVideoTrack?.readyState === 'live' ? (
                      <Video className="h-3.5 w-3.5 text-success shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-text-faint shrink-0" />
                    )}
                    {report.activeVideoTrack?.readyState || 'No Track'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-bg-subtle border border-card-border">
                  <span className="text-[10px] text-text-faint uppercase block font-sans">Luminance</span>
                  <span className="text-xs font-semibold text-text flex items-center gap-1 mt-0.5">
                    {report.metrics.meanLuminance < 8 ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    {report.metrics.meanLuminance.toFixed(1)} / 255
                  </span>
                </div>
              </div>

              {/* Stage Timings & Delegate Section */}
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-2">
                <span className="text-xs font-semibold text-primary font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="h-4 w-4" /> Stage Timings & Vision Delegate (§S6)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-text">
                  <div>
                    <span className="text-text-muted block text-[10px]">Time to Stream:</span>
                    <strong className="text-text text-xs">
                      {report.stageTimings.timeToStreamMs !== null ? `${report.stageTimings.timeToStreamMs.toFixed(0)} ms` : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Model Ready:</span>
                    <strong className="text-text text-xs">
                      {report.stageTimings.timeToModelReadyMs !== null ? `${report.stageTimings.timeToModelReadyMs.toFixed(0)} ms` : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">First Detection:</span>
                    <strong className="text-text text-xs">
                      {report.stageTimings.timeToFirstDetectionMs !== null ? `${report.stageTimings.timeToFirstDetectionMs.toFixed(0)} ms` : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Delegate Used:</span>
                    <span className="text-xs font-semibold text-success">
                      {report.visionDelegate.delegateUsed || 'CPU (Fallback)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hardware Acquisition Counts Section */}
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary font-mono uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="h-4 w-4" /> Hardware Acquisition Counts (Single-Request Invariant)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      report.getUserMediaCalls.video <= 1 && report.getUserMediaCalls.audio <= 1
                        ? 'border-success/30 text-success bg-mint/30'
                        : 'border-warning/30 text-warning bg-warning/10'
                    }`}
                  >
                    {report.getUserMediaCalls.video <= 1 && report.getUserMediaCalls.audio <= 1
                      ? '✓ Single-Request Invariant'
                      : 'Multiple Calls Detected'}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-text">
                  <div>
                    <span className="text-text-muted block text-[10px]">Video Requests:</span>
                    <strong className="text-text text-sm">{report.getUserMediaCalls.video}</strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Audio Requests:</span>
                    <strong className="text-text text-sm">{report.getUserMediaCalls.audio}</strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Total Invocations:</span>
                    <strong className="text-text text-sm">{report.getUserMediaCalls.total}</strong>
                  </div>
                </div>
              </div>

              {/* Real-Time Vision & Face Alignment Metrics Section */}
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-2">
                <span className="text-xs font-semibold text-primary font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="h-4 w-4" /> Real-Time Machine Proofs & Face Alignment
                </span>
                <div className="grid grid-cols-3 gap-2 text-text">
                  <div>
                    <span className="text-text-muted block text-[10px]">FPS (1s Rolling):</span>
                    <strong className="text-text text-sm">{report.metrics.measuredFps} FPS</strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Detected Faces:</span>
                    <strong className="text-text text-sm">{report.metrics.faceCount}</strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Video Resolution:</span>
                    <strong className="text-text text-sm">
                      {report.videoElement
                        ? `${report.videoElement.videoWidth}x${report.videoElement.videoHeight}`
                        : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Centering Offset:</span>
                    <strong className="text-text text-xs">
                      {report.metrics.centeringOffsetPct !== undefined
                        ? `${report.metrics.centeringOffsetPct.toFixed(1)}%`
                        : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Face Height:</span>
                    <strong className="text-text text-xs">
                      {report.metrics.faceHeightPct !== undefined
                        ? `${report.metrics.faceHeightPct.toFixed(1)}%`
                        : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Laplacian Sharpness:</span>
                    <strong className="text-text text-xs">
                      {report.metrics.sharpnessScore !== undefined
                        ? report.metrics.sharpnessScore.toFixed(0)
                        : 'N/A'}
                    </strong>
                  </div>
                </div>
                {report.metrics.headPose && (
                  <div className="pt-1 text-[11px] text-text-muted flex items-center gap-3">
                    <span>Yaw: <strong className="text-text">{report.metrics.headPose.yaw.toFixed(1)}°</strong></span>
                    <span>Pitch: <strong className="text-text">{report.metrics.headPose.pitch.toFixed(1)}°</strong></span>
                    <span>Roll: <strong className="text-text">{report.metrics.headPose.roll.toFixed(1)}°</strong></span>
                  </div>
                )}
              </div>

              {/* Microphone & Audio Proofs Section */}
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-2">
                <span className="text-xs font-semibold text-primary font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <Mic className="h-4 w-4" /> Audio Quality Proofs & Calibration
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-text">
                  <div>
                    <span className="text-text-muted block text-[10px]">Noise Floor (RMS):</span>
                    <strong className="text-text text-xs">
                      {report.audioQuality.noiseFloorRms !== null
                        ? report.audioQuality.noiseFloorRms.toFixed(4)
                        : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Noise Floor (dBFS):</span>
                    <strong className="text-text text-xs">
                      {report.audioQuality.noiseFloorDb !== null
                        ? `${report.audioQuality.noiseFloorDb.toFixed(1)} dBFS`
                        : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Estimated Speech SNR:</span>
                    <strong className="text-text text-xs">
                      {report.audioQuality.estimatedSnrDb !== null
                        ? `${report.audioQuality.estimatedSnrDb.toFixed(1)} dB`
                        : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Voiced Speech:</span>
                    <strong className="text-text text-xs">
                      {report.audioQuality.voicedSeconds !== null
                        ? `${report.audioQuality.voicedSeconds.toFixed(1)} s / 1.5 s`
                        : 'N/A'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Audio Hardware & Speech Engine Diagnostics Section (§M5) */}
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary font-mono uppercase tracking-wider flex items-center gap-1.5">
                    <Mic className="h-4 w-4" /> Audio Hardware & Speech Engine Diagnostics (§M5)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      report.audioDiagnostics.speechRecognitionSupported
                        ? 'border-success/30 text-success bg-mint/30'
                        : 'border-warning/30 text-warning bg-warning/10'
                    }`}
                  >
                    {report.audioDiagnostics.speechRecognitionSupported
                      ? 'SpeechRecognition: Supported'
                      : 'SpeechRecognition: Unsupported'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-text">
                  <div>
                    <span className="text-text-muted block text-[10px]">Mic Permission:</span>
                    <strong className="text-text text-xs">{report.microphonePermission}</strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">AudioContext:</span>
                    <strong
                      className={`text-xs ${
                        report.audioDiagnostics.audioContextState === 'running'
                          ? 'text-success font-bold'
                          : 'text-text-muted'
                      }`}
                    >
                      {report.audioDiagnostics.audioContextState}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">TTS State:</span>
                    <strong
                      className={`text-xs ${
                        report.audioDiagnostics.ttsState === 'speaking'
                          ? 'text-mint font-bold uppercase'
                          : report.audioDiagnostics.ttsState === 'silent-fallback' || report.audioDiagnostics.ttsState === 'error'
                          ? 'text-amber-400 font-bold uppercase'
                          : 'text-text uppercase'
                      }`}
                    >
                      {report.audioDiagnostics.ttsState || 'idle'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Last getUserMedia:</span>
                    <strong
                      className="text-danger text-xs truncate block"
                      title={report.audioDiagnostics.lastGetUserMediaError || 'None'}
                    >
                      {report.audioDiagnostics.lastGetUserMediaError || 'None'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Last STT Error:</span>
                    <strong
                      className="text-danger text-xs truncate block"
                      title={report.audioDiagnostics.lastSpeechRecognitionError || 'None'}
                    >
                      {report.audioDiagnostics.lastSpeechRecognitionError || 'None'}
                    </strong>
                  </div>
                </div>

                {/* Active Audio Track & Settings */}
                {report.audioDiagnostics.activeAudioTrack ? (
                  <div className="pt-2 border-t border-card-border space-y-1 text-text-muted">
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        Active Mic Track: <span className="text-text font-bold">{report.audioDiagnostics.activeAudioTrack.label}</span>
                      </span>
                      <span
                        className={
                          report.audioDiagnostics.isAudioTrackMutedOrEnded
                            ? 'text-danger font-semibold'
                            : 'text-success font-semibold'
                        }
                      >
                        {report.audioDiagnostics.isAudioTrackMutedOrEnded
                          ? '⚠️ Track Muted or Ended'
                          : '✓ Live & Unmuted'}
                      </span>
                    </div>
                    {report.audioDiagnostics.activeAudioTrack.settings &&
                      Object.keys(report.audioDiagnostics.activeAudioTrack.settings).length > 0 && (
                        <pre className="p-2.5 rounded-xl bg-bg-subtle border border-card-border text-[11px] text-text-muted overflow-x-auto">
                          {JSON.stringify(report.audioDiagnostics.activeAudioTrack.settings, null, 2)}
                        </pre>
                      )}
                  </div>
                ) : (
                  <p className="pt-1 text-[11px] text-text-faint border-t border-card-border">
                    No active audio track stream acquired.
                  </p>
                )}

                {/* Audio Input Devices */}
                <div className="pt-1 border-t border-card-border">
                  <span className="text-[10px] text-text-muted block mb-1">
                    Detected Audio Inputs ({report.audioDiagnostics.audioInputs.length}):
                  </span>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {report.audioDiagnostics.audioInputs.map((input, idx) => (
                      <div
                        key={input.deviceId || idx}
                        className="text-[11px] text-text flex items-center justify-between"
                      >
                        <span className="truncate max-w-sm">{input.label || `Microphone ${idx + 1}`}</span>
                        <span className="text-[10px] font-mono text-text-faint">
                          {input.isDeviceIdEmpty ? 'Status: Unassigned' : 'Status: Ready'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active Track Settings */}
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-2">
                <span className="text-xs font-semibold text-primary font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <Monitor className="h-4 w-4" /> Active Camera Track &amp; Settings
                </span>
                {report.activeVideoTrack ? (
                  <div className="space-y-1 text-text-muted">
                    <div>
                      Label: <span className="text-text font-bold">{report.activeVideoTrack.label}</span>
                    </div>
                    <div>
                      Live: <span className="text-success font-semibold">{String(report.activeVideoTrack.readyState === 'live')}</span> | Enabled: <span className="text-success font-semibold">{String(report.activeVideoTrack.enabled)}</span> | Muted: <span className="text-text font-semibold">{String(report.activeVideoTrack.muted)}</span>
                    </div>
                    <pre className="p-2.5 rounded-xl bg-bg-subtle border border-card-border text-[11px] text-text-muted overflow-x-auto">
                      {JSON.stringify(sanitizeTrackSettings(report.activeVideoTrack.settings), null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="text-text-faint">No active media stream acquired.</p>
                )}
              </div>

              {/* Enumerated Devices */}
              <div className="p-3 rounded-xl bg-card border border-card-border space-y-2">
                <span className="text-xs font-semibold text-text font-mono uppercase tracking-wider">
                  Enumerated Hardware Devices ({report.devices.length})
                </span>
                <div className="divide-y divide-card-border max-h-36 overflow-y-auto">
                  {report.devices.map((d, i) => (
                    <div key={`${d.deviceId || 'device'}-${d.kind}-${i}`} className="py-1.5 flex items-center justify-between">
                      <span className="text-text truncate max-w-sm">{d.label}</span>
                      <Badge variant="outline" className="text-[10px] border-card-border text-text-muted">
                        {d.kind}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Last Error Notice */}
              {report.lastError && (
                <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-[11px] flex items-center gap-2 font-sans">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                  <span>Last Error: {report.lastError}</span>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-text-faint">Compiling device report...</div>
          )}
        </CardContent>

        {/* Footer Actions */}
        <div className="p-3 border-t border-card-border bg-bg-subtle flex items-center justify-between shrink-0">
          <span className="text-[11px] text-text-muted font-sans">
            Diagnostic logs exclude biometric telemetry.
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="text-xs border-primary/30 text-primary hover:bg-mint/40 gap-1.5 h-8 px-3"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied to Clipboard' : 'Copy Report'}
            </Button>
            <Button size="sm" onClick={onClose} className="text-xs bg-primary hover:bg-primary-hover text-primary-ink h-8 px-4">
              Close
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
