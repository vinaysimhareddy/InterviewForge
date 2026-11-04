import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechToText, TTSState } from '../services/speech/types';
import { createSpeechToTextProvider } from '../services/speech/sttFactory';
import { STTProviderMode } from '../services/speech/sttChainManager';
import { ttsManager, TTSManager } from '../services/speech/ttsManager';
import { isSignificantSpeech, VoiceActivityDetector } from '../services/speech/vad';
import { mapSpeechRecognitionError, SpeechErrorInfo } from '../services/speech/speechErrors';
import { sttTimingLogger } from '../services/speech/sttTimingLogger';
import {
  computeTurnSilenceTimeoutMs,
  MAX_ANSWER_DURATION_SEC,
  ANSWER_WARNING_THRESHOLD_SEC,
} from '../services/speech/adaptiveSilence';
import { normalizeTranscript, computeTurnConfidence } from '../services/speech/termNormalizer';
import { ClientWSMessage } from '../lib/types';

export type VoiceTurnState =
  | 'idle'
  | 'ai_speaking'
  | 'candidate_turn'
  | 'submitting'
  | 'paused';

export interface AnswerSubmissionMetadata {
  source?: 'voice' | 'typed';
  reason?: 'silence' | 'cap' | 'user' | string;
  answer_raw?: string;
  stt_confidence?: number;
  is_low_confidence?: boolean;
  skipCatchCheck?: boolean;
}

export interface UseVoiceTurnEngineOptions {
  audioStream: MediaStream | null;
  currentQuestion: string;
  questionIndex: number;
  isPaused?: boolean;
  sendWSMessage?: (message: ClientWSMessage) => boolean;
  onSubmitAnswer: (answer: string, metadata?: AnswerSubmissionMetadata) => Promise<void>;
  autoPlayTTS?: boolean;
  silenceTimeoutMs?: number;      // Silence window after speech to trigger auto-complete (default: 2000ms)
  minSpeechDurationMs?: number;   // Minimum speech duration to qualify as spoken answer (default: 400ms)
  energyThreshold?: number;       // RMS energy threshold for VAD (default: 0.045)
  customTerms?: string[];         // Technical glossary terms from role & resume (§T7)
}

export interface UseVoiceTurnEngineReturn {
  turnState: VoiceTurnState;
  ttsState: TTSState;
  isAiSpeaking: boolean;
  isCandidateSpeaking: boolean;
  isListening: boolean;
  transcript: string;             // Clean normalized transcript shown live (§T7)
  rawTranscript: string;          // Unaltered raw transcript for audit review (§T7)
  turnConfidence: number;         // 0..1 confidence score (§T7)
  isLowConfidence: boolean;       // Flagged if confidence < 0.65 (§T7)
  interimTranscript: string;
  audioLevel: number;             // 0..1 normalized RMS for UI visualizer
  silenceProgress: number;        // 0..1 countdown progress toward auto-submission
  isSpeechSupported: boolean;
  isReconnectingVoice: boolean;
  sttStatusNotice: string | null;
  activeSTTProvider: STTProviderMode;
  retryVoice: () => void;
  speakQuestion: () => Promise<void>;
  replayQuestion: () => Promise<void>;
  stopAudio: () => void;
  interruptAI: () => void;
  submitAnswer: (metadata?: AnswerSubmissionMetadata) => Promise<void>;
  clearTranscript: () => void;
  setTranscript: (text: string) => void;
  toggleDictation: () => void;
  sttError?: SpeechErrorInfo | null;
  isAnswerTimeWarning?: boolean;
  clearSttError?: () => void;
}

export function useVoiceTurnEngine({
  audioStream,
  currentQuestion,
  questionIndex,
  isPaused = false,
  sendWSMessage,
  onSubmitAnswer,
  autoPlayTTS = true,
  silenceTimeoutMs = 2000,
  minSpeechDurationMs = 400,
  energyThreshold = 0.045,
  customTerms = [],
}: UseVoiceTurnEngineOptions): UseVoiceTurnEngineReturn {
  const [turnState, setTurnState] = useState<VoiceTurnState>('idle');
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscriptState] = useState<string>('');
  const [rawTranscript, setRawTranscriptState] = useState<string>('');
  const [turnConfidence, setTurnConfidence] = useState<number>(0.90);
  const [isLowConfidence, setIsLowConfidence] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [silenceProgress, setSilenceProgress] = useState<number>(0);
  const [sttError, setSttError] = useState<SpeechErrorInfo | null>(null);
  const [ttsState, setTtsState] = useState<TTSState>(ttsManager.getAudioState());
  const [isReconnectingVoice, setIsReconnectingVoice] = useState<boolean>(false);
  const [isAnswerTimeWarning, setIsAnswerTimeWarning] = useState<boolean>(false);
  const [sttStatusNotice, setSttStatusNotice] = useState<string | null>(null);
  const [activeSTTProvider, setActiveSTTProvider] = useState<STTProviderMode>('browser');
  const isReconnectingVoiceRef = useRef<boolean>(false);
  isReconnectingVoiceRef.current = isReconnectingVoice;

  // References for services and lifecycle
  const ttsRef = useRef<TTSManager | null>(null);
  const sttRef = useRef<SpeechToText | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);

  // Web Audio API refs for VAD
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // State machine tracking refs
  const turnStateRef = useRef<VoiceTurnState>('idle');
  turnStateRef.current = turnState;

  const transcriptRef = useRef<string>('');
  transcriptRef.current = transcript;

  const rawTranscriptRef = useRef<string>('');
  rawTranscriptRef.current = rawTranscript;

  const accumulatedSpeechDurationSecRef = useRef<number>(0);
  const hasAskedToRepeatRef = useRef<boolean>(false);
  const customTermsRef = useRef<string[]>(customTerms);
  customTermsRef.current = customTerms;

  const hasSpokenMeaningfullyRef = useRef<boolean>(false);
  const silenceStartTimeRef = useRef<number | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const currentQuestionRef = useRef<string>('');
  const questionStartTimeRef = useRef<number>(Date.now());
  const lastRecognizerResultTimeRef = useRef<number>(0);
  const restartWaitStartTimeRef = useRef<number | null>(null);
  const graceFinalStartTimeRef = useRef<number | null>(null);

  // Check browser speech capabilities
  const isSpeechSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  // 1. Initialize STT, TTS, and VAD instances
  useEffect(() => {
    ttsRef.current = ttsManager;
    const unsubscribeTTS = ttsManager.onStateChange((state) => {
      setTtsState(state);
    });
    const stt = createSpeechToTextProvider({ audioStream });
    sttRef.current = stt;
    vadRef.current = new VoiceActivityDetector({
      energyThreshold,
      minSpeechDurationMs,
      hangoverMs: 300,
    });

    const unsubscribeChain = stt.onChainStatusChange((chainStatus) => {
      setIsReconnectingVoice(chainStatus.isReconnecting);
      setSttStatusNotice(chainStatus.statusNotice);
      setActiveSTTProvider(chainStatus.activeProvider);
      if (!chainStatus.isReconnecting && chainStatus.activeProvider !== 'typed') {
        setSttError(null);
      }
    });

    let rafInterimId: number | null = null;
    let latestInterimChunk = '';

    const unsubscribeSTT = stt.onTranscript((event) => {
      lastRecognizerResultTimeRef.current = performance.now();
      restartWaitStartTimeRef.current = null;

      // If AI is speaking and candidate starts speaking, trigger barge-in interruption!
      if (turnStateRef.current === 'ai_speaking' && event.text.trim().length > 0) {
        handleBargeIn();
      }

      const rawFull = event.fullTranscript;
      rawTranscriptRef.current = rawFull;
      setRawTranscriptState(rawFull);

      const normResult = normalizeTranscript(rawFull, customTermsRef.current);
      const cleanFull = normResult.cleanText;

      if (event.isFinal) {
        graceFinalStartTimeRef.current = null;
        if (rafInterimId !== null) {
          cancelAnimationFrame(rafInterimId);
          rafInterimId = null;
        }
        latestInterimChunk = '';
        sttTimingLogger.recordEvent('final_text', questionIndex);
        setTranscriptState(cleanFull);
        setInterimTranscript('');
        transcriptRef.current = cleanFull;
      } else {
        sttTimingLogger.recordEvent('first_interim', questionIndex);
        sttTimingLogger.recordEvent('last_interim', questionIndex);
        latestInterimChunk = event.text;
        // Keep transcriptRef current with the full clean assembled text (§T2, §T7)
        transcriptRef.current = cleanFull;
        // Throttle interim re-renders via requestAnimationFrame to avoid UI thread thrashing (§B4)
        if (rafInterimId === null) {
          rafInterimId = requestAnimationFrame(() => {
            const cleanInterim = normalizeTranscript(latestInterimChunk, customTermsRef.current).cleanText;
            setInterimTranscript(cleanInterim);
            rafInterimId = null;
          });
        }
      }

      // Stream transcript chunk to server over WebSocket (§4.2)
      if (sendWSMessage && event.text.trim()) {
        const elapsedSec = (Date.now() - questionStartTimeRef.current) / 1000;
        sendWSMessage({
          type: 'transcript_chunk',
          text: event.text.trim(),
          is_final: event.isFinal,
          t: Math.max(0, parseFloat(elapsedSec.toFixed(3))),
        });
      }
    });

    const unsubscribeState = stt.onStateChange((state) => {
      setIsListening(state === 'listening');
    });

    const unsubscribeError = stt.onError((err) => {
      if (err.error === 'network' && isReconnectingVoiceRef.current) {
        return;
      }
      if (
        err.isFatal ||
        err.error === 'network' ||
        err.error === 'audio-capture' ||
        err.error === 'not-allowed' ||
        err.error === 'service-not-allowed'
      ) {
        setSttError(mapSpeechRecognitionError(err.error));
      }
    });

    return () => {
      if (rafInterimId !== null) cancelAnimationFrame(rafInterimId);
      unsubscribeTTS();
      unsubscribeChain();
      unsubscribeSTT();
      unsubscribeState();
      unsubscribeError();
      if (ttsRef.current) ttsRef.current.stop();
      if (sttRef.current) sttRef.current.stop();
    };
  }, [sendWSMessage, energyThreshold, minSpeechDurationMs, audioStream, questionIndex]);

  // 2. Set up Web Audio AnalyserNode for shared audioStream VAD
  useEffect(() => {
    if (!audioStream || !audioStream.active || audioStream.getAudioTracks().length === 0) {
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(audioStream);
      source.connect(analyser);
      sourceNodeRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const processAudio = () => {
        if (!analyserRef.current || isPaused) {
          animFrameIdRef.current = requestAnimationFrame(processAudio);
          return;
        }

        analyserRef.current.getByteTimeDomainData(dataArray);
        const now = performance.now();

        if (vadRef.current) {
          const vadState = vadRef.current.processFrame(dataArray, now);
          const normalizedRms = Math.min(1.0, vadState.currentRMS * 4);
          setAudioLevel(normalizedRms);
          setIsCandidateSpeaking(vadState.isSpeaking);

          if (vadState.isSpeaking && turnStateRef.current === 'candidate_turn') {
            accumulatedSpeechDurationSecRef.current += 0.016;
          }

          if (sttRef.current && typeof (sttRef.current as any).notifySpeechActivity === 'function') {
            (sttRef.current as any).notifySpeechActivity(vadState.isSpeaking);
          }

          // 2a. Interruption Check: Candidate speaking while AI is speaking
          if (turnStateRef.current === 'ai_speaking') {
            if (vadState.speechDurationMs >= 200 && vadState.currentRMS >= energyThreshold) {
              handleBargeIn();
            }
          }

          // 2b. Turn-taking & Silence Detection during candidate_turn
          if (turnStateRef.current === 'candidate_turn') {
            if (isReconnectingVoiceRef.current) {
              silenceStartTimeRef.current = null;
              setSilenceProgress(0);
              animFrameIdRef.current = requestAnimationFrame(processAudio);
              return;
            }

            if (vadState.isSpeaking) {
              sttTimingLogger.recordEvent('speech_start', questionIndex);
            }
            const currentWords = transcriptRef.current.trim().split(/\s+/).filter(Boolean).length;
            if (isSignificantSpeech(vadState.speechDurationMs, currentWords, minSpeechDurationMs, 2)) {
              hasSpokenMeaningfullyRef.current = true;
            }

            // Cap 300s (5 minutes) per answer check (§B4, PR3)
            const elapsedAnswerSec = (Date.now() - questionStartTimeRef.current) / 1000;
            if (elapsedAnswerSec >= ANSWER_WARNING_THRESHOLD_SEC) {
              setIsAnswerTimeWarning(true);
            }
            if (elapsedAnswerSec >= MAX_ANSWER_DURATION_SEC && !isSubmittingRef.current) {
              void triggerAnswerCompletion({ reason: 'cap' });
              return;
            }

            if (hasSpokenMeaningfullyRef.current) {
              if (!vadState.isSpeaking) {
                // Adaptive silence window (§T2):
                // - shorter (1.5–2.0 s) if answer is already long/complete
                // - longer (2.5–3.5 s) if answer is short (< 10 words) or candidate just paused mid-thought
                const adaptiveTimeoutMs = computeTurnSilenceTimeoutMs(
                  transcriptRef.current,
                  currentWords,
                  silenceTimeoutMs
                );

                // Candidate is silent after having spoken
                if (!silenceStartTimeRef.current) {
                  silenceStartTimeRef.current = now;
                }
                const elapsedSilence = now - silenceStartTimeRef.current;
                const progress = Math.min(1.0, elapsedSilence / adaptiveTimeoutMs);
                setSilenceProgress(progress);

                if (elapsedSilence >= adaptiveTimeoutMs && !isSubmittingRef.current) {
                  // Guard 1: Do NOT declare answer complete if recognizer returned a result within the last 400 ms (§T2)
                  const timeSinceLastResult = now - lastRecognizerResultTimeRef.current;
                  if (timeSinceLastResult < 400) {
                    animFrameIdRef.current = requestAnimationFrame(processAudio);
                    return;
                  }

                  // Guard 2: If recognizer is currently in restart, wait for it to restart (up to 1.5 s) (§T2)
                  const isSTTRestarting = Boolean((sttRef.current as any)?.isRestarting);
                  if (isSTTRestarting) {
                    if (restartWaitStartTimeRef.current === null) {
                      restartWaitStartTimeRef.current = now;
                    }
                    const restartWaitElapsed = now - restartWaitStartTimeRef.current;
                    if (restartWaitElapsed < 1500) {
                      animFrameIdRef.current = requestAnimationFrame(processAudio);
                      return;
                    }
                  } else {
                    restartWaitStartTimeRef.current = null;
                  }

                  // Guard 3: Wait for pending finalization: on silence detection, give recognizer up to 700 ms
                  // to deliver isFinal: true before sealing interim (§T2)
                  const hasPendingInterim = Boolean(
                    interimTranscript.trim() ||
                    ((sttRef.current as any)?.hasPendingInterim && (sttRef.current as any).hasPendingInterim())
                  );
                  if (hasPendingInterim) {
                    if (graceFinalStartTimeRef.current === null) {
                      graceFinalStartTimeRef.current = now;
                    }
                    const graceElapsed = now - graceFinalStartTimeRef.current;
                    if (graceElapsed < 700) {
                      animFrameIdRef.current = requestAnimationFrame(processAudio);
                      return;
                    }
                  }

                  if (import.meta.env.DEV) {
                    console.log(`[useVoiceTurnEngine][SilenceTrigger] Silence timeout reached: elapsedSilence=${elapsedSilence.toFixed(0)}ms >= adaptiveTimeoutMs=${adaptiveTimeoutMs}ms (currentWords=${currentWords}, hasSpokenMeaningfully=true)`);
                  }
                  // Adaptive silence timeout reached -> automatically complete answer
                  void triggerAnswerCompletion();
                }
              } else {
                // Candidate resumed speaking -> reset silence timer and grace tracking
                silenceStartTimeRef.current = null;
                restartWaitStartTimeRef.current = null;
                graceFinalStartTimeRef.current = null;
                setSilenceProgress(0);
              }
            }
          }
        }

        animFrameIdRef.current = requestAnimationFrame(processAudio);
      };

      animFrameIdRef.current = requestAnimationFrame(processAudio);
    } catch (err) {
      console.warn('Web Audio VAD setup warning:', err);
    }

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [audioStream, isPaused, energyThreshold, minSpeechDurationMs, silenceTimeoutMs]);

  // 3. Handle Candidate Interruption (Barge-in)
  const handleBargeIn = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.stop();
    }
    setIsAiSpeaking(false);
    setTurnState('candidate_turn');

    // Ensure STT is listening
    if (sttRef.current && !sttRef.current.isListening) {
      try {
        sttRef.current.start();
      } catch {}
    }
  }, []);

  // 4. Trigger Answer Completion & Submission
  const triggerAnswerCompletion = useCallback(async (metadata?: AnswerSubmissionMetadata) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsAnswerTimeWarning(false);

    sttTimingLogger.recordEvent('answer_end_decision', questionIndex);

    // Seal any trailing interim words into the committed transcript before stopping STT (§T2)
    let finalRaw = rawTranscriptRef.current.trim();
    if (sttRef.current && 'seal' in sttRef.current && typeof (sttRef.current as any).seal === 'function') {
      const sealed = (sttRef.current as any).seal();
      if (sealed && sealed.trim().length > 0) {
        finalRaw = sealed.trim();
        rawTranscriptRef.current = finalRaw;
        setRawTranscriptState(finalRaw);
      }
    }

    const norm = normalizeTranscript(finalRaw, customTermsRef.current);
    const finalClean = norm.cleanText.trim();
    transcriptRef.current = finalClean;
    setTranscriptState(finalClean);
    setInterimTranscript('');

    const wordCount = finalRaw.split(/\s+/).filter(Boolean).length;
    const voicedDuration = accumulatedSpeechDurationSecRef.current;
    const confResult = computeTurnConfidence(finalRaw, undefined, voicedDuration);
    setTurnConfidence(confResult.confidence);
    setIsLowConfidence(confResult.isLowConfidence);

    // "I didn't catch that" flow (§T7):
    // If speech was detected for > 2 s but < 3 recognized words, or confidence is very low (< 0.40),
    // the AI asks the candidate to repeat once (not counted as a skip).
    const isUnintelligibleSpeech =
      (voicedDuration >= 2.0 && wordCount < 3) ||
      (wordCount > 0 && confResult.confidence < 0.40);

    if (isUnintelligibleSpeech && !hasAskedToRepeatRef.current && !metadata?.skipCatchCheck) {
      hasAskedToRepeatRef.current = true;
      isSubmittingRef.current = false;

      setTurnState('ai_speaking');
      setIsAiSpeaking(true);
      setTranscriptState('');
      setInterimTranscript('');
      setRawTranscriptState('');
      transcriptRef.current = '';
      rawTranscriptRef.current = '';
      accumulatedSpeechDurationSecRef.current = 0;
      silenceStartTimeRef.current = null;
      restartWaitStartTimeRef.current = null;
      graceFinalStartTimeRef.current = null;
      setSilenceProgress(0);

      if (sttRef.current) {
        sttRef.current.resetTranscript();
        try { sttRef.current.stop(); } catch {}
      }

      const repeatPrompt = "I didn't catch that. Could you please repeat your answer?";
      if (ttsRef.current) {
        ttsRef.current
          .speak(repeatPrompt)
          .catch(() => {})
          .finally(() => {
            setIsAiSpeaking(false);
            setTurnState('candidate_turn');
            if (sttRef.current && !sttRef.current.isListening) {
              try {
                sttRef.current.start();
              } catch {}
            }
          });
      } else {
        setIsAiSpeaking(false);
        setTurnState('candidate_turn');
        if (sttRef.current && !sttRef.current.isListening) {
          try {
            sttRef.current.start();
          } catch {}
        }
      }
      return;
    }

    // Stop STT and VAD tracking
    if (sttRef.current) {
      sttRef.current.stop();
    }
    setTurnState('submitting');
    setSilenceProgress(0);

    // Notify backend WebSocket that answer is complete
    if (sendWSMessage) {
      sendWSMessage({
        type: 'answer_complete',
        turn_id: `turn_${questionIndex}`,
      });
    }

    sttTimingLogger.recordEvent('answer_sent', questionIndex);

    if (import.meta.env.DEV) {
      console.log(`[useVoiceTurnEngine][triggerAnswerCompletion] Sealed answer:
        - rawTranscriptRef.current: "${finalRaw}"
        - cleanTranscript: "${finalClean}"
        - words committed: ${finalClean.split(/\s+/).filter(Boolean).length}
        - questionIndex: ${questionIndex}
        - confidence: ${confResult.confidence} (low=${confResult.isLowConfidence})
      `);
    }
    const source = metadata?.source || (activeSTTProvider === 'typed' ? 'typed' : 'voice');
    try {
      await onSubmitAnswer(finalClean, {
        source,
        reason: metadata?.reason,
        answer_raw: finalRaw || finalClean,
        stt_confidence: confResult.confidence,
        is_low_confidence: confResult.isLowConfidence,
      });
    } finally {
      isSubmittingRef.current = false;
    }
  }, [sendWSMessage, questionIndex, onSubmitAnswer, activeSTTProvider]);

  // Retry Voice Recognition when user clicks Try Again
  const retryVoice = useCallback(() => {
    setSttError(null);
    if (sttRef.current && 'retry' in sttRef.current) {
      (sttRef.current as any).retry();
    }
  }, []);

  // 5. Speak Question via TTS
  const speakQuestion = useCallback(async () => {
    if (!currentQuestion.trim() || isPaused) return;

    sttTimingLogger.startTurn(questionIndex, activeSTTProvider);
    sttTimingLogger.recordEvent('question_received', questionIndex);

    // Reset turn state for new question without tearing down active recognizer instance
    if (sttRef.current) {
      sttRef.current.resetTranscript();
    }
    if (vadRef.current) {
      vadRef.current.reset();
    }
    setTranscriptState('');
    setInterimTranscript('');
    setRawTranscriptState('');
    transcriptRef.current = '';
    rawTranscriptRef.current = '';
    hasAskedToRepeatRef.current = false;
    accumulatedSpeechDurationSecRef.current = 0;
    setIsAnswerTimeWarning(false);
    setTurnConfidence(0.90);
    setIsLowConfidence(false);
    hasSpokenMeaningfullyRef.current = false;
    silenceStartTimeRef.current = null;
    restartWaitStartTimeRef.current = null;
    graceFinalStartTimeRef.current = null;
    lastRecognizerResultTimeRef.current = 0;
    setSilenceProgress(0);
    questionStartTimeRef.current = Date.now();

    setTurnState('ai_speaking');
    setIsAiSpeaking(true);

    // Warm up / ensure STT is running to allow instant barge-in and zero cold-start latency (§B4)
    if (sttRef.current && sttRef.current.isSupported && !sttRef.current.isListening) {
      try {
        sttRef.current.start();
      } catch {}
    }

    try {
      if (ttsRef.current) {
        await ttsRef.current.speak(currentQuestion, {
          onStart: () => {
            sttTimingLogger.recordEvent('tts_start', questionIndex);
          },
        });
        sttTimingLogger.recordEvent('tts_end', questionIndex);
      }
    } finally {
      setIsAiSpeaking(false);
      // If candidate hasn't already interrupted and taken turn, hand over to candidate
      if (turnStateRef.current === 'ai_speaking') {
        setTurnState('candidate_turn');
        if (sttRef.current && !sttRef.current.isListening) {
          try {
            sttRef.current.start();
          } catch {}
        }
      }
    }
  }, [currentQuestion, isPaused]);

  // 6. Stop all audio playback
  const stopAudio = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.stop();
    }
    setIsAiSpeaking(false);
  }, []);

  // 7. Manual Dictation Toggle
  const toggleDictation = useCallback(() => {
    if (!sttRef.current) return;
    if (sttRef.current.isListening) {
      sttRef.current.stop();
    } else {
      stopAudio();
      setTurnState('candidate_turn');
      sttRef.current.start();
    }
  }, [stopAudio]);

  // 8. Auto-speak when question text changes
  useEffect(() => {
    if (currentQuestion && currentQuestion !== currentQuestionRef.current) {
      currentQuestionRef.current = currentQuestion;
      if (autoPlayTTS && !isPaused) {
        void speakQuestion();
      } else {
        setTurnState('candidate_turn');
        if (sttRef.current) {
          sttRef.current.resetTranscript();
          try {
            sttRef.current.start();
          } catch {}
        }
      }
    }
  }, [currentQuestion, autoPlayTTS, isPaused, speakQuestion]);

  // 9. Pause handling: silence TTS & STT when room is paused
  useEffect(() => {
    if (isPaused) {
      if (ttsRef.current) ttsRef.current.stop();
      if (sttRef.current) sttRef.current.stop();
      setIsAiSpeaking(false);
      setIsListening(false);
      setTurnState('paused');
    } else if (turnStateRef.current === 'paused') {
      setTurnState('candidate_turn');
      if (sttRef.current) {
        try {
          sttRef.current.start();
        } catch {}
      }
    }
  }, [isPaused]);

  return {
    turnState,
    ttsState,
    isAiSpeaking,
    isCandidateSpeaking,
    isListening,
    transcript,
    rawTranscript,
    turnConfidence,
    isLowConfidence,
    interimTranscript,
    audioLevel,
    silenceProgress,
    isSpeechSupported,
    isReconnectingVoice,
    sttStatusNotice,
    activeSTTProvider,
    retryVoice,
    speakQuestion,
    replayQuestion: speakQuestion,
    stopAudio,
    interruptAI: handleBargeIn,
    submitAnswer: triggerAnswerCompletion,
    clearTranscript: () => {
      setTranscriptState('');
      setInterimTranscript('');
      setRawTranscriptState('');
      transcriptRef.current = '';
      rawTranscriptRef.current = '';
      if (sttRef.current) sttRef.current.resetTranscript();
    },
    setTranscript: (text: string) => {
      setTranscriptState(text);
      setRawTranscriptState(text);
      transcriptRef.current = text;
      rawTranscriptRef.current = text;
    },
    toggleDictation,
    sttError,
    isAnswerTimeWarning,
    clearSttError: () => setSttError(null),
  };
}
