import React, { useState, useEffect } from 'react';
import {
  CameraOff,
  RotateCcw,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '../ui/button';

export interface CameraLostModalProps {
  isOpen: boolean;
  graceSeconds?: number;
  reason?: string;
  availableCameras?: MediaDeviceInfo[];
  selectedDeviceId?: string;
  onSelectCamera?: (deviceId: string) => Promise<void> | void;
  onRestore: () => Promise<void> | void;
  onGraceExpired?: () => void;
}

export function CameraLostModal({
  isOpen,
  graceSeconds = 30,
  reason = 'Camera feed disconnected or obstructed.',
  availableCameras,
  selectedDeviceId,
  onSelectCamera,
  onRestore,
  onGraceExpired,
}: CameraLostModalProps): React.ReactElement | null {
  const [remainingSec, setRemainingSec] = useState<number>(graceSeconds);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setRemainingSec(graceSeconds);
      return;
    }

    setRemainingSec(graceSeconds);
    const interval = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onGraceExpired) {
            onGraceExpired();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, graceSeconds, onGraceExpired]);

  if (!isOpen) return null;

  const handleRestoreClick = async () => {
    setIsRestoring(true);
    try {
      await onRestore();
    } finally {
      setIsRestoring(false);
    }
  };

  const isCritical = remainingSec <= 10;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="camera-lost-title"
      className="fixed inset-0 z-50 bg-[#0A2E24]/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg bg-card border border-card-border rounded-3xl p-6 sm:p-8 shadow-soft space-y-6 text-center text-text">
        {/* Pulsing Icon */}
        <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
          <div className="relative p-4 rounded-2xl bg-peach border border-accent/25 text-accent shadow-sm">
            <CameraOff className="h-8 w-8" />
          </div>
        </div>

        {/* Title & Reason */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-accent text-xs font-mono font-semibold uppercase tracking-wider">
            <ShieldAlert className="h-3.5 w-3.5" />
            Interview Paused — Camera Lost
          </div>
          <h2 id="camera-lost-title" className="text-xl sm:text-2xl font-display font-semibold text-text">
            Please Restore Your Camera
          </h2>
          <p className="text-xs sm:text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            {reason} All interview question timers are paused during this recovery grace period.
          </p>
        </div>

        {/* 30-Second Countdown Meter */}
        <div className="p-4 rounded-2xl bg-bg-subtle border border-card-border space-y-2 text-left">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted font-medium">Recovery Grace Window</span>
            <span
              className={`font-mono font-bold text-sm ${
                isCritical ? 'text-accent animate-pulse' : 'text-accent'
              }`}
            >
              00:{remainingSec < 10 ? `0${remainingSec}` : remainingSec}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted-surface overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                isCritical ? 'bg-accent' : 'bg-primary'
              }`}
              style={{ width: `${(remainingSec / graceSeconds) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-text-muted font-mono">
            If camera feed is not restored before timeout, the session will be paused or aborted under interview integrity policy.
          </p>
        </div>

        {/* Camera Selector Dropdown (if multiple webcams available) */}
        {availableCameras && availableCameras.length > 1 && onSelectCamera && (
          <div className="p-3 rounded-2xl bg-bg-subtle border border-card-border text-left space-y-1.5">
            <label className="text-[11px] text-text-muted font-medium block">
              Switch to alternative physical camera:
            </label>
            <select
              value={selectedDeviceId}
              onChange={(e) => onSelectCamera(e.target.value)}
              className="w-full h-9 rounded-xl bg-card border border-card-border text-xs text-text px-3 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {availableCameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label || `Camera ${cam.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Action Button */}
        <Button
          onClick={handleRestoreClick}
          disabled={isRestoring}
          className="w-full h-11 bg-primary hover:bg-primary-hover text-primary-ink font-semibold text-sm gap-2 shadow-sm cursor-pointer rounded-full"
        >
          <RotateCcw className={`h-4 w-4 ${isRestoring ? 'animate-spin' : ''}`} />
          {isRestoring ? 'Reconnecting Camera...' : 'Restore Camera Feed'}
        </Button>

        {/* Troubleshooting Tips Card */}
        <div className="p-4 rounded-2xl bg-bg-subtle border border-card-border text-left space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            Troubleshooting Tips:
          </div>
          <ul className="text-[11px] text-text-muted space-y-1 list-disc list-inside">
            <li>Unplug and replug your external webcam cable.</li>
            <li>Close other apps using the camera (Zoom, Microsoft Teams, Google Meet, Skype).</li>
            <li>Verify browser camera permissions in the address bar (lock icon).</li>
            <li>Ensure laptop lid is open and camera privacy shutter is retracted.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
