import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Mic,
  MicOff,
  RotateCcw,
  CheckCircle2,
  Edit3,
  Volume2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpeechErrorInfo } from '@/services/speech/speechErrors';

export interface CandidateAnswerTranscriptProps {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  isCandidateSpeaking: boolean;
  isAiSpeaking: boolean;
  isSubmitting: boolean;
  audioLevel: number;
  silenceProgress: number; // 0..1
  isSpeechSupported: boolean;
  sttError?: SpeechErrorInfo | null;
  onSubmit: (answerText: string) => void | Promise<void>;
  onClearAndRetry: () => void;
  onManualTextChange?: (text: string) => void;
  onRetryMic?: () => void;
  className?: string;
}

export function CandidateAnswerTranscript({
  transcript,
  interimTranscript,
  isListening,
  isCandidateSpeaking,
  isAiSpeaking,
  isSubmitting,
  audioLevel,
  silenceProgress,
  isSpeechSupported,
  sttError,
  onSubmit,
  onClearAndRetry,
  onManualTextChange,
  onRetryMic,
  className = '',
}: CandidateAnswerTranscriptProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isManualEditMode, setIsManualEditMode] = useState<boolean>(false);
  const [manualText, setManualText] = useState<string>('');

  // Combined full text
  const fullVoiceText = useMemo(() => {
    const combined = [transcript, interimTranscript].filter(Boolean).join(' ').trim();
    return combined;
  }, [transcript, interimTranscript]);

  const activeText = isManualEditMode ? manualText : fullVoiceText;

  // Word count calculation
  const wordCount = useMemo(() => {
    if (!activeText.trim()) return 0;
    return activeText.trim().split(/\s+/).filter(Boolean).length;
  }, [activeText]);

  // Keep manual text in sync if user switches to manual mode
  const handleEnterManualMode = () => {
    setManualText(fullVoiceText);
    setIsManualEditMode(true);
  };

  const handleManualTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setManualText(val);
    if (onManualTextChange) {
      onManualTextChange(val);
    }
  };

  // Auto-scroll to bottom of transcript as speech streams
  useEffect(() => {
    if (!isManualEditMode && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimTranscript, isManualEditMode]);

  // If SpeechRecognition throws error, automatically enable manual input fallback
  useEffect(() => {
    if (sttError || !isSpeechSupported) {
      if (!isManualEditMode && !manualText && fullVoiceText) {
        setManualText(fullVoiceText);
      }
    }
  }, [sttError, isSpeechSupported, isManualEditMode, manualText, fullVoiceText]);

  const handleSubmit = () => {
    const textToSubmit = activeText.trim();
    if (textToSubmit.length === 0 || isSubmitting) return;
    void onSubmit(textToSubmit);
  };

  const handleClear = () => {
    setManualText('');
    onClearAndRetry();
  };

  // Silence timer remaining seconds (assuming ~2.2s window)
  const silenceSecRemaining = Math.max(0, Math.ceil((1 - silenceProgress) * 2.2));

  return (
    <div
      role="region"
      aria-label="Live candidate answer transcript"
      className={`w-full max-w-2xl mx-auto rounded-2xl border transition-all duration-300 backdrop-blur-md bg-[#0A2E24]/65 text-[#FBFAF6] shadow-xl flex flex-col overflow-hidden ${
        isCandidateSpeaking
          ? 'border-mint/50 shadow-[0_0_25px_rgba(227,239,232,0.15)]'
          : isListening
          ? 'border-mint/30 shadow-[0_0_15px_rgba(15,74,58,0.25)]'
          : 'border-[#E3DED2]/15'
      } ${className}`}
      data-testid="candidate-live-transcript"
    >
      {/* Top Header Bar: Status Indicator, Waveform, Word Counter */}
      <div className="px-4 py-2.5 bg-[#0A2E24]/50 border-b border-[#E3DED2]/10 flex items-center justify-between text-xs select-none">
        {/* Left: State Badge + Live Audio Equalizer */}
        <div className="flex items-center gap-2.5">
          {sttError || !isSpeechSupported ? (
            <div className="flex items-center gap-1.5 text-accent-soft font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-accent" />
              <span>Voice capture unavailable</span>
            </div>
          ) : isCandidateSpeaking ? (
            <div className="flex items-center gap-2 text-mint font-medium">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-mint" />
              </span>
              <span>Speaking</span>
              {/* Dynamic waveform equalizer */}
              <div className="flex items-center gap-0.5 h-3 ml-1">
                {[0.12, 0.28, 0.45, 0.65, 0.85].map((threshold, idx) => {
                  const isActive = audioLevel >= threshold;
                  return (
                    <div
                      key={idx}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        isActive
                          ? 'bg-mint h-3 animate-pulse'
                          : audioLevel >= threshold * 0.5
                          ? 'bg-mint/60 h-2'
                          : 'bg-[#E3DED2]/25 h-1'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          ) : isListening ? (
            <div className="flex items-center gap-2 text-mint/90 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-mint" />
              </span>
              <Mic className="h-3.5 w-3.5 text-mint" />
              <span>Listening for answer...</span>
            </div>
          ) : isAiSpeaking ? (
            <div className="flex items-center gap-1.5 text-[#E3DED2]/70 font-medium">
              <Volume2 className="h-3.5 w-3.5" />
              <span>Interviewer speaking...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[#E3DED2]/60 font-medium">
              <MicOff className="h-3.5 w-3.5" />
              <span>Microphone idle</span>
            </div>
          )}
        </div>

        {/* Right: Word Count Badge & Mode Switch */}
        <div className="flex items-center gap-2">
          {wordCount > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${
                wordCount >= 5
                  ? 'bg-mint/15 text-mint border border-mint/30 font-medium'
                  : 'bg-white/10 text-[#E3DED2]/80'
              }`}
            >
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
          )}

          {!sttError && isSpeechSupported && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (isManualEditMode) {
                  setIsManualEditMode(false);
                } else {
                  handleEnterManualMode();
                }
              }}
              className="h-6 px-2 text-[11px] font-medium text-[#E3DED2]/80 hover:text-white hover:bg-white/10 gap-1 rounded-md"
              title={isManualEditMode ? 'Switch to live speech' : 'Type or edit answer manually'}
            >
              <Edit3 className="h-3 w-3" />
              <span>{isManualEditMode ? 'Live Speech' : 'Type / Edit'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Actionable Error Alert Box (from M3) if SpeechRecognition fails or is unsupported */}
      {(sttError || !isSpeechSupported) && (
        <div className="p-3 mx-4 mt-3 rounded-xl bg-peach/20 border border-accent/30 text-accent-soft text-xs space-y-1.5 animate-in fade-in">
          <div className="flex items-center justify-between font-semibold">
            <span className="flex items-center gap-1.5 text-accent-soft">
              <AlertTriangle className="h-4 w-4 text-accent" />
              {sttError ? sttError.title : 'Speech Recognition Not Available in This Browser'}
            </span>
            {onRetryMic && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetryMic}
                className="h-6 text-[11px] px-2 border-accent/40 text-accent-soft hover:bg-accent/20"
              >
                Try Again
              </Button>
            )}
          </div>
          <p className="text-[11px] text-[#E3DED2]/90 leading-relaxed">
            {sttError
              ? sttError.explanation
              : 'Web Speech API is not supported in this browser. Please use Google Chrome or type your answer below.'}
          </p>
          <div className="text-[11px] text-accent-soft font-medium">
            Recovery: {sttError ? sttError.recoveryStep : 'Type your answer below and click Submit Answer.'}
          </div>
        </div>
      )}

      {/* Main Content Area: Streaming Transcript OR Manual Textarea */}
      <div className="p-4 flex-1">
        {isManualEditMode || sttError || !isSpeechSupported ? (
          <div className="space-y-2">
            <textarea
              value={manualText}
              onChange={handleManualTextChange}
              placeholder="Type your response here if microphone recognition is unavailable..."
              rows={4}
              className="w-full resize-none rounded-xl bg-[#0A2E24]/50 border border-[#E3DED2]/20 p-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary text-[#FBFAF6] placeholder:text-[#E3DED2]/40 transition-all"
              data-testid="manual-answer-input"
            />
            <div className="flex items-center justify-between text-[11px] text-[#E3DED2]/70 px-1 font-mono">
              <span>{manualText.length} characters</span>
              <span>Press Submit Answer when ready</span>
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            aria-live="polite"
            aria-atomic="false"
            className="max-h-40 min-h-[5.5rem] overflow-y-auto pr-1 text-sm font-sans leading-relaxed scroll-smooth flex flex-col justify-start"
            data-testid="live-transcript-container"
          >
            {transcript || interimTranscript ? (
              <div className="space-y-1">
                {/* Finalized speech text in solid foreground */}
                {transcript && (
                  <span className="text-[#FBFAF6] font-normal transition-colors duration-150">
                    {transcript}{' '}
                  </span>
                )}
                {/* Real-time streaming interim speech in italic */}
                {interimTranscript && (
                  <span className="text-muted-foreground italic font-normal animate-pulse text-mint/80">
                    {interimTranscript}
                  </span>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-xs text-[#E3DED2]/60 py-4 italic select-none">
                {isListening ? (
                  <span className="flex items-center gap-1.5 animate-pulse text-mint/80">
                    <Mic className="h-3.5 w-3.5 text-mint" />
                    Speak clearly into your microphone. Your answer will transcribe here in real time...
                  </span>
                ) : isAiSpeaking ? (
                  <span>Interviewer is presenting the question. Get ready to answer...</span>
                ) : isSubmitting ? (
                  <span>Evaluating answer and adapting next topic...</span>
                ) : (
                  <span>Microphone ready. Start speaking your answer when ready.</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Silence Progress Bar Countdown (visible when silence is detected post-speech) */}
      {silenceProgress > 0 && !isSubmitting && (
        <div className="px-4 pb-2 animate-in fade-in">
          <div className="flex items-center justify-between text-[11px] text-accent-soft font-mono mb-1">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
              Pause detected • Auto-submitting in {silenceSecRemaining}s
            </span>
            <span className="text-[#E3DED2]/60">Click Submit now to advance</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-100 ease-linear rounded-full"
              style={{ width: `${Math.min(100, Math.round(silenceProgress * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom Controls Bar: Clear/Retry & Done Speaking/Submit Button */}
      <div className="px-4 py-2.5 bg-[#0A2E24]/50 border-t border-[#E3DED2]/10 flex items-center justify-between gap-3 select-none">
        {/* Left: Clear and retry button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={activeText.length === 0 || isSubmitting}
          className="h-8 px-2.5 text-xs text-[#E3DED2]/70 hover:text-white hover:bg-white/10 gap-1.5 rounded-lg disabled:opacity-30"
          title="Clear current transcript and start answering this question fresh"
          aria-label="Clear answer transcript and retry"
          data-testid="clear-transcript-button"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Clear & Retry</span>
        </Button>

        {/* Right: Submit Answer Button */}
        <Button
          onClick={handleSubmit}
          disabled={wordCount < 1 || isSubmitting}
          size="sm"
          aria-label="Submit recorded answer now"
          className={`h-8 px-4 text-xs font-semibold rounded-lg gap-1.5 transition-all shadow-sm ${
            wordCount >= 5
              ? 'bg-primary text-primary-ink hover:bg-primary-hover border border-mint/20 shadow-lg'
              : 'bg-white/10 text-[#E3DED2]/60 border border-[#E3DED2]/10'
          }`}
          title={
            wordCount < 5
              ? 'Speak or type at least a few words to submit your answer'
              : 'Submit answer and advance to next question'
          }
          data-testid="submit-answer-button"
        >
          {isSubmitting ? (
            <>
              <Sparkles className="h-3.5 w-3.5 animate-spin text-mint" />
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-mint" />
              <span>Submit Answer</span>
              <ArrowRight className="h-3.5 w-3.5 ml-0.5 opacity-70" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
