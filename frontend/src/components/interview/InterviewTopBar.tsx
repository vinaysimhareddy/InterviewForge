import React, { useState } from 'react';
import {
  Clock,
  Sun,
  Moon,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/context/ThemeContext';
import { Logo } from '@/components/common/Logo';

export interface InterviewTopBarProps {
  role: string;
  seniority: string;
  remainingSeconds?: number;
  totalDurationMinutes?: number;
  cameraActive?: boolean;
  micActive?: boolean;
  onEndInterview?: () => void;
  onOpenHelp?: () => void;
  showTimer?: boolean;
  interviewerName?: string;
}

export function InterviewTopBar({
  role,
  seniority,
  remainingSeconds = 900,
  totalDurationMinutes: _totalDurationMinutes = 15,
  cameraActive = true,
  micActive = true,
  onEndInterview,
  onOpenHelp: _onOpenHelp,
  showTimer = true,
  interviewerName = 'AI Interviewer',
}: InterviewTopBarProps): React.ReactElement {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [showConfirmEnd, setShowConfirmEnd] = useState<boolean>(false);

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(Math.max(0, seconds) / 60);
    const secs = Math.max(0, seconds) % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = remainingSeconds <= 120; // 2 min remaining

  return (
    <>
      <header className="w-full border-b border-[#E3DED2]/15 bg-[#0A2E24]/85 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 h-14 min-h-[56px] flex items-center justify-between text-[#FBFAF6] transition-colors">
        {/* Left: Wordmark & Candidate Role */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Logo variant="mark" size="sm" />
            <span className="font-display font-semibold tracking-tight text-[#FBFAF6] text-sm sm:text-base">
              InterviewForge
            </span>
            <span className="text-[#E3DED2]/40 hidden sm:inline">•</span>
            <span className="font-mono text-[11px] text-mint uppercase tracking-wider hidden sm:inline">
              LIVE STAGE
            </span>
          </div>
          <span className="text-[#E3DED2]/30 hidden md:inline">|</span>
          <div className="flex items-center gap-1.5 truncate text-xs text-[#E3DED2]/90">
            <span className="hidden lg:inline text-[#E3DED2]/70">{interviewerName}</span>
            <span className="text-[#E3DED2]/40 hidden lg:inline">•</span>
            <span className="font-medium truncate text-[11px] sm:text-xs">
              {seniority} {role}
            </span>
          </div>
        </div>

        {/* Center / Right: Timer & Indicators */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Remaining-time timer */}
          {showTimer && (
            <div
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-mono font-medium transition-colors ${
                isLowTime
                  ? 'bg-accent/25 border border-accent/40 text-accent-soft animate-pulse'
                  : 'bg-[#0F4A3A]/70 border border-[#E3DED2]/20 text-[#FBFAF6]'
              }`}
              title="Time remaining in current interview session"
            >
              <Clock className="h-3 w-3" />
              <span>{formatRemaining(remainingSeconds)}</span>
            </div>
          )}

          {/* Privacy Camera & Mic Active indicator */}
          <Tooltip
            content={
              <div className="space-y-1">
                <p className="font-semibold text-xs text-white">Privacy-Preserving On-Device CV</p>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Your camera and microphone are on during the interview. Camera monitoring and facial analysis run entirely on your device. Spoken answers are transcribed using your browser’s speech recognition service. Only numeric behavior signals and the transcribed text of your answers are saved. No raw audio or video recordings are stored on our servers.
                </p>
              </div>
            }
            side="bottom"
          >
            <div
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full bg-[#0F4A3A]/50 border border-[#E3DED2]/15 text-xs cursor-help select-none"
              tabIndex={0}
              aria-label="Camera and microphone active status: Privacy protected"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  cameraActive && micActive
                    ? 'bg-mint animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-[#E3DED2]/80 text-[11px] font-medium hidden md:inline">
                Camera &amp; mic active: monitoring posture &amp; eye contact
              </span>
            </div>
          </Tooltip>

          {/* Light / Dark Theme Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="h-9 w-9 sm:h-8 sm:w-8 p-0 rounded-full text-[#E3DED2]/80 hover:text-white hover:bg-white/10 min-h-[44px] sm:min-h-0 min-w-[44px] sm:min-w-0"
            title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label="Toggle visual theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {/* End Interview ghost button */}
          {onEndInterview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmEnd(true)}
              className="h-9 sm:h-8 px-2 sm:px-2.5 text-xs text-[#E3DED2]/80 hover:text-accent-soft hover:bg-accent/20 rounded-full min-h-[44px] sm:min-h-0"
              aria-label="End interview"
            >
              <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">End interview</span>
            </Button>
          )}
        </div>
      </header>

      {/* Confirmation Dialog for Early Exit */}
      {showConfirmEnd && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-end-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A2E24]/80 backdrop-blur-md animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-2xl bg-card border border-card-border p-6 shadow-soft space-y-4 text-text max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-peach border border-accent/25 flex items-center justify-center text-accent shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="confirm-end-title" className="text-base font-display font-semibold text-text">
                  Conclude Interview Session?
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Your responses so far will be evaluated and saved into your final scorecard.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmEnd(false)}
                className="rounded-full border-card-border text-text hover:bg-bg-subtle min-h-[44px] sm:min-h-0"
              >
                Continue Interview
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setShowConfirmEnd(false);
                  onEndInterview?.();
                }}
                className="rounded-full bg-accent hover:bg-accent/90 text-primary-ink min-h-[44px] sm:min-h-0"
              >
                Conclude Now
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
