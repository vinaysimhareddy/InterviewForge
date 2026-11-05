import React, { useEffect, useRef } from 'react';
import { UserX, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface FaceLostModalProps {
  isOpen: boolean;
  missingSeconds: number;
  videoStream?: MediaStream | null;
  onFaceRestored?: () => void;
}

export function FaceLostModal({
  isOpen,
  missingSeconds,
  videoStream,
  onFaceRestored: _onFaceRestored,
}: FaceLostModalProps): React.ReactElement | null {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen && videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [isOpen, videoStream]);

  if (!isOpen) return null;

  // Warning tiers according to policy §3.5:
  // >= 3s: soft popup
  // >= 10s: Warning 1 of 2
  // >= 20s: Warning 2 of 2
  // >= 30s: abort
  const isWarning1 = missingSeconds >= 10 && missingSeconds < 20;
  const isWarning2 = missingSeconds >= 20 && missingSeconds < 30;
  const isCritical = missingSeconds >= 20;
  const remainingUntilAbort = Math.max(0, 30 - Math.floor(missingSeconds));

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="face-lost-title"
      className="fixed inset-0 z-50 bg-[#0A2E24]/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-card border border-card-border rounded-3xl p-5 sm:p-8 shadow-soft space-y-4 sm:space-y-6 text-center text-text">
        {/* Pulsing Alert Icon */}
        <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
          <span
            className={`absolute inset-0 rounded-full animate-ping ${
              isCritical ? 'bg-accent/25' : 'bg-peach/50'
            }`}
          />
          <div
            className={`relative p-4 rounded-2xl border shadow-sm ${
              isCritical
                ? 'bg-peach border-accent/40 text-accent'
                : 'bg-peach border-accent/25 text-accent'
            }`}
          >
            {isCritical ? <ShieldAlert className="h-8 w-8" /> : <UserX className="h-8 w-8" />}
          </div>
        </div>

        {/* Title & Warning Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            {isWarning2 ? (
              <Badge variant="outline" className="border-accent text-accent font-mono text-[11px] uppercase tracking-wider bg-peach">
                Warning 2 of 2 • Final Notice
              </Badge>
            ) : isWarning1 ? (
              <Badge variant="outline" className="border-accent/50 text-accent font-mono text-[11px] uppercase tracking-wider bg-peach/40">
                Warning 1 of 2
              </Badge>
            ) : (
              <span className="text-accent text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Face Not Detected
              </span>
            )}
          </div>

          <h2 id="face-lost-title" className="text-xl sm:text-2xl font-display font-semibold text-text">
            Please Return to Camera View
          </h2>

          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            {isWarning2
              ? 'Continued absence from camera view will conclude the interview session automatically.'
              : 'We lost sight of you for a moment. Take a breath and center yourself back in frame. Timers are paused.'}
          </p>
        </div>

        {/* Live Camera Viewfinder to help candidate align */}
        <div className="relative aspect-video w-full rounded-2xl bg-bg-subtle overflow-hidden border border-card-border shadow-inner">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover transform -scale-x-100"
          />
          <div className="absolute inset-4 rounded-xl border-2 border-dashed border-accent/40 pointer-events-none flex items-center justify-center">
            <span className="text-[11px] font-mono text-text bg-card/90 border border-card-border px-2.5 py-0.5 rounded-full backdrop-blur-sm shadow-sm">
              Center your face here
            </span>
          </div>
        </div>

        {/* Countdown Grace Meter */}
        <div className="p-3.5 rounded-2xl bg-bg-subtle border border-card-border space-y-2 text-left">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted font-medium">Auto-abort countdown</span>
            <span
              className={`font-mono font-bold ${
                isCritical ? 'text-accent animate-pulse' : 'text-text'
              }`}
            >
              {remainingUntilAbort}s remaining
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted-surface overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isCritical ? 'bg-accent' : 'bg-primary'
              }`}
              style={{ width: `${(remainingUntilAbort / 30) * 100}%` }}
            />
          </div>
        </div>

        <div className="text-[11px] text-text-muted flex items-center justify-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          <span>This dialog will close automatically as soon as your face is detected.</span>
        </div>
      </div>
    </div>
  );
}
