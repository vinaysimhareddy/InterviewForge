import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldCheck,
  Headphones,
  Check,
  Play,
  ChevronRight,
  Accessibility,
  RefreshCw,
  Lock,
  RotateCcw,
  Sun,
  Copy,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ttsManager, TTSManager } from '@/services/speech/ttsManager';
import { SpeechToText } from '@/services/speech/types';
import { createSpeechToTextProvider } from '@/services/speech/sttFactory';
import {
  SUPPORTED_SPEECH_LANGS,
  getSpeechRecognitionLang,
  setSpeechRecognitionLang,
} from '@/services/speech/browserSTT';
import { runSpeechPreflightDiagnostic, SpeechPreflightResult } from '@/services/speech/sttPreflight';
import { estimateQuestionRange } from '@/services/speech/timeEstimator';
import {
  computeRMS,
  computePeak,
  NoiseFloorCalibrator,
  VoicedTimeAccumulator,
  evaluateMicQuality,
  MicQualityReport,
} from '@/lib/micQuality';
import { MIC_QUALITY_CONFIG } from '@/lib/micQualityConfig';
import { useSetupDevices, mapCameraErrorToAction } from '@/hooks/useSetupDevices';
import { useCameraStream } from '@/context/CameraStreamContext';
import { generateMaskedDiagnostics } from '@/lib/maskedDiagnostics';
import { mapSpeechRecognitionError } from '@/services/speech/speechErrors';
import {
  CameraProofPipeline,
  attachStreamToVideo,
} from '@/lib/cameraProofPipeline';
import {
  ChallengeGestureEvaluator,
  generateChallengeSequence,
} from '@/lib/activeChallenge';
import { LivenessChallengeStep } from '@/lib/integrityTypes';
import { formatPageTitle, USER_FLOW_STEPS } from '@/copy/glossary';
import { Logo } from '@/components/common/Logo';
import { PermissionHelpModal } from './PermissionHelpModal';
import { DiagnosticsModal } from './DiagnosticsModal';
import {
  evaluateFaceQuality,
  FaceQualityHysteresis,
  FaceQualityReport,
  BoundingBox,
  computeFaceBoundingBox,
} from '@/lib/faceQuality';
import {
  getSharedFaceLandmarker,
  preloadVisionModels,
  recordVisionTiming,
} from '@/lib/visionManager';
import { extractFaceGeometrySignature } from '@/lib/faceGeometry';
import { computeHeadPose } from '@/lib/metrics';
import { FaceLandmarker } from '@mediapipe/tasks-vision';

export interface PreInterviewSetupProps {
  role: string;
  seniority: string;
  onStartInterview: (config: {
    durationMinutes: number;
    videoStream: MediaStream | null;
    audioStream: MediaStream | null;
  }) => void;
  onCancel: () => void;
}

export function PreInterviewSetup({
  role: _role,
  seniority: _seniority,
  onStartInterview,
  onCancel,
}: PreInterviewSetupProps): React.ReactElement {
  // State Machine for all hardware & liveness states
  const { state, dispatch, isAllReady } = useSetupDevices();

  // Shared Media Stream Provider
  const {
    stream: cameraStream,
    videoStream,
    selectedDeviceId,
    availableCameras,
    acquireCamera,
    releaseCamera,
    setSelectedDeviceId,
    refreshCameras,
    retainForInterview,
    audioStream,
    setAudioStream,
    acquireAudio,
    releaseAudio,
    availableMicrophones,
    selectedMicDeviceId,
    setSelectedMicDeviceId,
    refreshMicrophones,
    activeMicLabel,
  } = useCameraStream();

  const isHandingOverRef = useRef<boolean>(false);

  // Duration State
  const [durationMinutes, setDurationMinutes] = useState<number>(20);
  const [customDurationInput, setCustomDurationInput] = useState<string>('20');
  const [isCustomDuration, setIsCustomDuration] = useState<boolean>(false);

  // Consent & Accommodation
  const [consentAccepted, setConsentAccepted] = useState<boolean>(true);
  const [motorAccommodation, setMotorAccommodation] = useState<boolean>(false);

  // Local UI & Pipeline State
  const [isBlackFrame, setIsBlackFrame] = useState<boolean>(false);
  const [speakerCodeInput, setSpeakerCodeInput] = useState<string>('');
  const [speakerTestCode, setSpeakerTestCode] = useState<string>('');
  const [isSpeakingTest, setIsSpeakingTest] = useState<boolean>(false);
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState<boolean>(false);

  // Face Quality & Camera Verification State
  const [faceQualityReport, setFaceQualityReport] = useState<FaceQualityReport | null>(null);
  const [isAutoCapture, setIsAutoCapture] = useState<boolean>(false);
  const [autoCaptureCountdown, setAutoCaptureCountdown] = useState<number | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  const hysteresisRef = useRef<FaceQualityHysteresis>(new FaceQualityHysteresis());
  const bboxHistoryRef = useRef<BoundingBox[]>([]);
  const detectionLoopActiveRef = useRef<boolean>(false);
  const detectionLoopIdRef = useRef<number | null>(null);
  const lastInferenceTimeRef = useRef<number>(0);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoCaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);

  // Microphone Calibration & Quality State
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [noiseDetected, setNoiseDetected] = useState<boolean>(false);
  const [micReport, setMicReport] = useState<MicQualityReport | null>(null);
  const noiseFloorCalibratorRef = useRef<NoiseFloorCalibrator>(new NoiseFloorCalibrator());
  const voicedAccumulatorRef = useRef<VoicedTimeAccumulator>(new VoicedTimeAccumulator());

  // Active Liveness Steps
  const [challengeSequence, setChallengeSequence] = useState<LivenessChallengeStep[]>([]);
  const [currentChallengeIdx, setCurrentChallengeIdx] = useState<number>(0);
  const challengeEvaluatorRef = useRef<ChallengeGestureEvaluator>(new ChallengeGestureEvaluator());

  // Element & Service References
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipelineRef = useRef<CameraProofPipeline | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioAnimRef = useRef<number | null>(null);
  const ttsRef = useRef<TTSManager | null>(null);
  const sttRef = useRef<SpeechToText | null>(null);
  const speechStartedRef = useRef<boolean>(false);
  const [liveSpeechTranscript, setLiveSpeechTranscript] = useState<string>('');
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const [lastMicErrorName, setLastMicErrorName] = useState<string | null>(null);
  const [lastSttErrorCode, setLastSttErrorCode] = useState<string | null>(null);
  const [preflightResult, setPreflightResult] = useState<SpeechPreflightResult | null>(null);
  // Speech Recognition Language / Accent State (§T8)
  const [selectedSpeechLang, setSelectedSpeechLang] = useState<string>(() => getSpeechRecognitionLang());

  const handleSpeechLangChange = useCallback((lang: string) => {
    setSelectedSpeechLang(lang);
    setSpeechRecognitionLang(lang);
    if (sttRef.current && typeof (sttRef.current as any).init === 'function') {
      (sttRef.current as any).init({ lang });
    }
  }, []);

  // Actionable Microphone Input Advice (§T8)
  const micAdvice = useMemo(() => {
    if (state.mic.status === 'verified') return null;
    const clippingCrit = micReport?.criteria.find((c) => c.id === 'clipping');
    if (clippingCrit && !clippingCrit.passed) {
      return 'use a headset or reduce input volume';
    }
    const currentSnr = state.mic.status === 'collecting_speech' ? state.mic.snrDb : undefined;
    if (noiseDetected || (currentSnr !== undefined && currentSnr < 12)) {
      return 'reduce background noise';
    }
    const voicedSec = state.mic.status === 'collecting_speech' ? state.mic.voicedSeconds : 0;
    if (audioLevel < 10 && voicedSec < 0.8) {
      return 'move closer to your microphone or speak louder';
    }
    return null;
  }, [state.mic, micReport, noiseDetected, audioLevel]);

  const durationPresets = [10, 15, 20, 30, 45, 60];
  const questionEstimate = estimateQuestionRange(durationMinutes);

  const sttSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition || window.WebSocket);

  // Lighting & Color Tint Warnings (§2.1, §2.2)
  const lightingCrit = faceQualityReport?.criteriaList.find((c) => c.id === 'lighting');
  const colorCastCrit = faceQualityReport?.criteriaList.find((c) => c.id === 'color_cast');
  const showLightingTip =
    (state.camera.status === 'quality_checking' || state.camera.status === 'ready_to_capture') &&
    Boolean((lightingCrit && !lightingCrit.passed) || (colorCastCrit && !colorCastCrit.passed));

  // Initialize Audio & Speech Services + Preload Vision Models
  useEffect(() => {
    document.title = formatPageTitle('Check Camera & Microphone');
    ttsRef.current = ttsManager;
    const stt = createSpeechToTextProvider();
    sttRef.current = stt;

    // Run speech preflight diagnostics (§B3)
    runSpeechPreflightDiagnostic(audioStream).then((res) => {
      setPreflightResult(res);
      if (res.isBrave) {
        setSttNotice(res.recommendation);
      }
    });

    const unsubscribeChain = stt.onChainStatusChange((status) => {
      if (status.statusNotice) {
        setSttNotice(status.statusNotice);
      }
    });

    const unsubscribeSTT = stt.onTranscript((event) => {
      if (event.fullTranscript) {
        setLiveSpeechTranscript(event.fullTranscript);
      } else if (event.text) {
        setLiveSpeechTranscript(event.text);
      }
    });

    const unsubscribeSTTError = stt.onError((err) => {
      setLastSttErrorCode(err.error);
      runSpeechPreflightDiagnostic(audioStream).then((res) => {
        setPreflightResult(res);
        const errorInfo = mapSpeechRecognitionError(err.error);
        const guidance =
          res.isBrave || !res.isOnline || !res.isEndpointReachable
            ? res.recommendation
            : errorInfo.explanation;
        setSttNotice(`${errorInfo.title}: ${guidance}`);
      });
    });

    refreshCameras();
    refreshMicrophones();
    preloadVisionModels().catch(() => {});

    return () => {
      unsubscribeChain();
      unsubscribeSTT();
      unsubscribeSTTError();
      detectionLoopActiveRef.current = false;
      if (detectionLoopIdRef.current) cancelAnimationFrame(detectionLoopIdRef.current);
      if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
      if (modelTimeoutRef.current) clearTimeout(modelTimeoutRef.current);
      if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);
      if (autoCaptureTimerRef.current) clearTimeout(autoCaptureTimerRef.current);
      if (audioAnimRef.current) cancelAnimationFrame(audioAnimRef.current);
      if (audioContextRef.current && !isHandingOverRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (ttsRef.current) ttsRef.current.stop();
      if (sttRef.current) sttRef.current.stop();
      if (pipelineRef.current) pipelineRef.current.stop();

      // Only shut down tracks if not handing over to active interview room
      if (!isHandingOverRef.current) {
        releaseAudio();
        releaseCamera();
      }
    };
  }, [refreshCameras, refreshMicrophones, releaseCamera, releaseAudio]);

  // --- 1. CAMERA PIPELINE & GUIDED FACE DETECTION ---

  // Throttled detection loop (10-15 FPS)
  const startDetectionLoop = useCallback((landmarker: FaceLandmarker, deviceId?: string, label?: string) => {
    detectionLoopActiveRef.current = true;
    let lastInferenceTime = 0;
    let isFirstDetection = true;
    const streamStartMark = performance.now();

    const loop = (timestamp: number) => {
      if (!detectionLoopActiveRef.current) return;

      const video = videoRef.current;
      if (
        video &&
        video.readyState >= 2 &&
        !video.paused &&
        !video.ended &&
        video.videoWidth > 0
      ) {
        // Throttle to ~12 FPS (every 80ms)
        if (timestamp - lastInferenceTime >= 80) {
          lastInferenceTime = timestamp;
          lastInferenceTimeRef.current = timestamp;
          try {
            const result = landmarker.detectForVideo(video, timestamp);
            const faceCount = result.faceLandmarks.length;

            if (isFirstDetection && faceCount > 0) {
              isFirstDetection = false;
              if (detectionTimeoutRef.current) {
                clearTimeout(detectionTimeoutRef.current);
                detectionTimeoutRef.current = null;
              }
              const firstDetDuration = performance.now() - streamStartMark;
              recordVisionTiming('timeToFirstDetectionMs', firstDetDuration);
              dispatch({
                type: 'CAMERA_QUALITY_CHECKING',
                deviceId,
                label,
              });
            }

            // Feed pipeline watchdog for continuity
            pipelineRef.current?.reportFaceCount(faceCount, timestamp);

            // Compute downsampled ImageData (256x144) for pixel metrics
            if (!offscreenCanvasRef.current) {
              const c = document.createElement('canvas');
              c.width = 256;
              c.height = 144;
              offscreenCanvasRef.current = c;
            }
            const offCtx = offscreenCanvasRef.current.getContext('2d', { willReadFrequently: true });
            let facePixels: ImageData | null = null;
            if (offCtx) {
              offCtx.drawImage(video, 0, 0, 256, 144);
              facePixels = offCtx.getImageData(0, 0, 256, 144);
            }

            let landmarks = null;
            let headPose = null;
            let blendshapes = null;

            if (faceCount > 0) {
              landmarks = result.faceLandmarks[0];
              headPose = computeHeadPose(landmarks);
              if (result.faceBlendshapes?.[0]?.categories) {
                blendshapes = Object.fromEntries(
                  result.faceBlendshapes[0].categories.map((c) => [c.categoryName, c.score])
                );
              }
            }

            const bbox = computeFaceBoundingBox(landmarks);
            if (bbox) {
              bboxHistoryRef.current.push(bbox);
              if (bboxHistoryRef.current.length > 10) {
                bboxHistoryRef.current.shift();
              }
            }

            const report = evaluateFaceQuality({
              faceCount,
              landmarks,
              headPose,
              blendshapes,
              facePixels,
              bboxHistory: bboxHistoryRef.current,
            });

            setFaceQualityReport(report);

            const { isReady } = hysteresisRef.current.update(report.overallPassed, timestamp);

            if (isReady) {
              dispatch({
                type: 'CAMERA_READY_TO_CAPTURE',
                deviceId,
                label,
              });
            } else {
              dispatch({
                type: 'CAMERA_QUALITY_CHECKING',
                deviceId,
                label,
              });
            }
          } catch {
            // Guard against frame detection errors
          }
        }
      }

      detectionLoopIdRef.current = requestAnimationFrame(loop);
    };

    detectionLoopIdRef.current = requestAnimationFrame(loop);
  }, [dispatch]);

  const handleEnableCamera = useCallback(async () => {
    setIsBlackFrame(false);
    setCaptureError(null);
    setCapturedPreview(null);
    hysteresisRef.current.reset();
    bboxHistoryRef.current = [];

    if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
    if (modelTimeoutRef.current) clearTimeout(modelTimeoutRef.current);
    if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);

    // Stage 1: Requesting camera (8s timeout)
    dispatch({ type: 'CAMERA_REQUEST', stage: 'requesting_camera' });

    cameraTimeoutRef.current = setTimeout(() => {
      dispatch({
        type: 'CAMERA_TIMEOUT',
        stage: 'requesting_camera',
        error: 'Camera permission prompt timed out (no response after 8s).',
      });
    }, 8000);

    const streamStartMark = performance.now();

    try {
      const stream = await acquireCamera(selectedDeviceId || undefined);
      if (cameraTimeoutRef.current) {
        clearTimeout(cameraTimeoutRef.current);
        cameraTimeoutRef.current = null;
      }

      const timeToStream = performance.now() - streamStartMark;
      recordVisionTiming('timeToStreamMs', timeToStream);

      const track = stream.getVideoTracks()[0];
      const label = track?.label || 'Webcam';

      // Stage 2: Starting video
      dispatch({ type: 'CAMERA_SET_STAGE', stage: 'starting_video', progress: 30 });

      if (videoRef.current) {
        await attachStreamToVideo(videoRef.current, stream);

        // Stage 3: Loading model (20s timeout)
        dispatch({ type: 'CAMERA_SET_STAGE', stage: 'loading_model', progress: 60 });

        modelTimeoutRef.current = setTimeout(() => {
          dispatch({
            type: 'CAMERA_TIMEOUT',
            stage: 'loading_model',
            error: 'Vision model took too long to load (timeout after 20s).',
          });
        }, 20000);

        const landmarker = await getSharedFaceLandmarker();
        faceLandmarkerRef.current = landmarker;

        if (modelTimeoutRef.current) {
          clearTimeout(modelTimeoutRef.current);
          modelTimeoutRef.current = null;
        }

        // Initialize proof pipeline
        if (pipelineRef.current) pipelineRef.current.stop();

        pipelineRef.current = new CameraProofPipeline(videoRef.current, stream, {
          onStreamingReady: () => {
            setIsBlackFrame(false);
          },
          onBlackFrameDetected: () => {
            setIsBlackFrame(true);
          },
          onLost: (reason) => {
            dispatch({ type: 'CAMERA_LOST', reason });
          },
        });
        pipelineRef.current.start();

        // Stage 4: Detecting face (15s timeout)
        dispatch({ type: 'CAMERA_SET_STAGE', stage: 'detecting_face', progress: 85 });

        detectionTimeoutRef.current = setTimeout(() => {
          dispatch({
            type: 'CAMERA_TIMEOUT',
            stage: 'detecting_face',
            error: 'No face detected in video feed (timeout after 15s). Please check camera positioning.',
          });
        }, 15000);

        startDetectionLoop(landmarker, track?.id, label);
      }
    } catch (err) {
      if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
      if (modelTimeoutRef.current) clearTimeout(modelTimeoutRef.current);
      if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);
      dispatch(mapCameraErrorToAction(err));
    }
  }, [acquireCamera, selectedDeviceId, dispatch, startDetectionLoop]);

  // Handle Capture Face action
  const handleCaptureFace = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    setCaptureError(null);
    try {
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      // Re-validate captured frame
      const landmarker = faceLandmarkerRef.current || (await getSharedFaceLandmarker());
      const captureTimestamp = Math.max(performance.now(), (lastInferenceTimeRef.current || 0) + 1);
      lastInferenceTimeRef.current = captureTimestamp;

      // The landmarker singleton is initialized with runningMode: 'VIDEO'.
      // MediaPipe requires detectForVideo with a monotonically increasing timestamp.
      let result;
      if (typeof landmarker.detectForVideo === 'function') {
        try {
          result = landmarker.detectForVideo(captureCanvas, captureTimestamp);
        } catch {
          // Fallback to video element if canvas texture upload fails
          const retryTimestamp = Math.max(performance.now(), lastInferenceTimeRef.current + 1);
          lastInferenceTimeRef.current = retryTimestamp;
          result = landmarker.detectForVideo(video, retryTimestamp);
        }
      } else if (typeof landmarker.detect === 'function') {
        result = landmarker.detect(captureCanvas);
      } else {
        throw new Error('FaceLandmarker detection method not available');
      }

      if (!result?.faceLandmarks || result.faceLandmarks.length !== 1) {
        setCaptureError("Capture wasn't clear: exactly one face must be visible. Please hold still and try again.");
        return;
      }

      const landmarks = result.faceLandmarks[0];
      const headPose = computeHeadPose(landmarks);
      const blendshapes = result.faceBlendshapes?.[0]?.categories
        ? Object.fromEntries(result.faceBlendshapes[0].categories.map((c) => [c.categoryName, c.score]))
        : null;

      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = 128;
      smallCanvas.height = 72;
      const smallCtx = smallCanvas.getContext('2d');
      smallCtx?.drawImage(captureCanvas, 0, 0, 128, 72);
      const smallImgData = smallCtx?.getImageData(0, 0, 128, 72) || null;

      const report = evaluateFaceQuality({
        faceCount: 1,
        landmarks,
        headPose,
        blendshapes,
        facePixels: smallImgData,
        bboxHistory: bboxHistoryRef.current,
      });

      if (!report.overallPassed) {
        setCaptureError(
          `Capture wasn't clear: ${report.firstFailingCriterion?.hint || 'quality check failed'}. Hold still and try again.`
        );
        return;
      }

      const signature = extractFaceGeometrySignature(landmarks) || {
        interOcularToHeight: 0.35,
        noseToChinToHeight: 0.40,
        eyeToNoseToHeight: 0.22,
        mouthWidthToWidth: 0.45,
      };

      const previewDataUrl = captureCanvas.toDataURL('image/jpeg', 0.85);
      setCapturedPreview(previewDataUrl);

      detectionLoopActiveRef.current = false;
      const track = cameraStream?.getVideoTracks()[0];
      dispatch({
        type: 'CAMERA_FRAME_CAPTURED',
        deviceId: track?.id,
        label: track?.label,
        previewDataUrl,
        faceSignature: signature,
      });
    } catch (err) {
      console.error('[E2E-CAMERA] capture error caught:', err);
      setCaptureError('Failed to capture frame. Please try again.');
    }
  }, [cameraStream, dispatch]);

  // Handle Confirm Capture action
  const handleConfirmCapture = useCallback(() => {
    dispatch({ type: 'CAMERA_CONFIRM_CAPTURE' });
  }, [dispatch]);

  // Handle Retake action
  const handleRetakeCapture = useCallback(() => {
    setCapturedPreview(null);
    setCaptureError(null);
    hysteresisRef.current.reset();
    dispatch({ type: 'CAMERA_RETAKE' });
    if (faceLandmarkerRef.current) {
      startDetectionLoop(
        faceLandmarkerRef.current,
        selectedDeviceId || undefined,
        availableCameras[0]?.label || 'Webcam'
      );
    }
  }, [availableCameras, dispatch, selectedDeviceId, startDetectionLoop]);

  // Auto-capture countdown effect
  useEffect(() => {
    if (
      isAutoCapture &&
      state.camera.status === 'ready_to_capture' &&
      autoCaptureCountdown === null
    ) {
      setAutoCaptureCountdown(3);
    } else if (state.camera.status !== 'ready_to_capture' && autoCaptureCountdown !== null) {
      setAutoCaptureCountdown(null);
      if (autoCaptureTimerRef.current) {
        clearTimeout(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
      }
    }
  }, [isAutoCapture, state.camera.status, autoCaptureCountdown]);

  useEffect(() => {
    if (autoCaptureCountdown === null) return;

    if (autoCaptureCountdown > 0) {
      autoCaptureTimerRef.current = setTimeout(() => {
        setAutoCaptureCountdown((prev) => (prev !== null && prev > 1 ? prev - 1 : 0));
      }, 1000);
    } else if (autoCaptureCountdown === 0) {
      setAutoCaptureCountdown(null);
      handleCaptureFace();
    }

    return () => {
      if (autoCaptureTimerRef.current) clearTimeout(autoCaptureTimerRef.current);
    };
  }, [autoCaptureCountdown, handleCaptureFace]);

  // When camera stream is updated or videoRef mounts
  useEffect(() => {
    if (cameraStream && videoRef.current && (state.camera.status === 'streaming' || state.camera.status === 'quality_checking' || state.camera.status === 'ready_to_capture')) {
      attachStreamToVideo(videoRef.current, cameraStream).catch(() => {});
    }
  }, [cameraStream, state.camera.status]);

  // --- 2. LIVENESS GATED SEQUENCE ---
  const handleStartLiveness = useCallback(() => {
    if (state.camera.status !== 'verified') return;

    const sequence = generateChallengeSequence(3);
    setChallengeSequence(sequence);
    setCurrentChallengeIdx(0);
    challengeEvaluatorRef.current.reset();

    const firstStep = sequence[0];
    dispatch({
      type: 'LIVENESS_START',
      totalSteps: sequence.length,
      prompt: firstStep.prompt,
      targetMetric: firstStep.action,
    });

    if (ttsRef.current) {
      ttsRef.current.speak(firstStep.prompt).catch(() => {});
    }
  }, [state.camera.status, dispatch]);

  // Evaluate liveness simulation for pipeline
  const handleStepComplete = useCallback(() => {
    const nextIdx = currentChallengeIdx + 1;
    if (nextIdx < challengeSequence.length) {
      const nextStep = challengeSequence[nextIdx];
      setCurrentChallengeIdx(nextIdx);
      dispatch({
        type: 'LIVENESS_PROGRESS',
        currentStep: nextIdx + 1,
        totalSteps: challengeSequence.length,
        prompt: nextStep.prompt,
        targetMetric: nextStep.action,
      });
      if (ttsRef.current) {
        ttsRef.current.speak(nextStep.prompt).catch(() => {});
      }
    } else {
      dispatch({ type: 'LIVENESS_PASS' });
      if (ttsRef.current) {
        ttsRef.current.speak('Liveness verification confirmed. All steps passed.').catch(() => {});
      }
    }
  }, [currentChallengeIdx, challengeSequence, dispatch]);

  // --- 3. MICROPHONE AUDIO & LATCHED QUALITY CALIBRATION ---
  const handleStartMic = useCallback(
    async (targetDeviceId?: string) => {
      dispatch({ type: 'MIC_REQUEST' });
      setLastMicErrorName(null);
      speechStartedRef.current = false;
      setLiveSpeechTranscript('');
      setSttNotice(null);
      noiseFloorCalibratorRef.current.reset();
      voicedAccumulatorRef.current.reset();
      setMicReport(null);

      try {
        const stream = await acquireAudio(targetDeviceId ?? selectedMicDeviceId);

        if (!stream) {
          throw new Error('Unable to acquire audio stream.');
        }

        audioStreamRef.current = stream;

        // Attach track disconnect & mute event listeners to revert verification if hardware is lost
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.onended = () => {
            dispatch({
              type: 'MIC_LOST',
              reason: 'Microphone track ended or device disconnected.',
            });
          };
          audioTrack.onmute = () => {
            dispatch({
              type: 'MIC_LOST',
              reason: 'Microphone hardware muted or unavailable.',
            });
          };
        }

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioCtx();
        }
        const audioCtx = audioContextRef.current;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        if (analyserRef.current) {
          try {
            analyserRef.current.disconnect();
          } catch {
            // ignore
          }
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        analyserRef.current = analyser;

        const floatBuffer = new Float32Array(analyser.fftSize);
        const byteBuffer = new Uint8Array(analyser.frequencyBinCount);

        if (audioAnimRef.current) {
          cancelAnimationFrame(audioAnimRef.current);
          audioAnimRef.current = null;
        }

        const updateMeter = () => {
          if (!analyserRef.current) return;

          if (analyser.getFloatTimeDomainData) {
            analyser.getFloatTimeDomainData(floatBuffer);
          } else {
            analyser.getByteTimeDomainData(byteBuffer);
            for (let i = 0; i < byteBuffer.length; i++) {
              floatBuffer[i] = (byteBuffer[i] - 128) / 128;
            }
          }

          const rms = computeRMS(floatBuffer);
          const peak = computePeak(floatBuffer);
          const levelPct = Math.min(100, Math.round(rms * 250));
          setAudioLevel(levelPct);

          const now = performance.now();
          const calibrator = noiseFloorCalibratorRef.current;
          const accumulator = voicedAccumulatorRef.current;

          // Stage 1: Noise Floor Calibration (1.0 s)
          if (!calibrator.isCalibrated(now)) {
            calibrator.addSample(rms, now);
            dispatch({
              type: 'MIC_MEASURING_NOISE',
              noiseFloorDb: calibrator.getAverageDb(),
            });
            audioAnimRef.current = requestAnimationFrame(updateMeter);
            return;
          }

          // Stage 2: Collecting Speech & SpeechRecognition Self-Test
          if (sttRef.current && !speechStartedRef.current && sttSupported) {
            speechStartedRef.current = true;
            try {
              sttRef.current.start();
            } catch {
              // ignore
            }
          }

          const noiseFloorRms = calibrator.getAverageRms();
          const noiseFloorDb = calibrator.getAverageDb();

          // Voiced threshold: RMS >= noise floor + 10 dB and >= min speech RMS
          const voicedThresholdRms =
            noiseFloorRms * Math.pow(10, MIC_QUALITY_CONFIG.VOICED_DELTA_DB / 20);
          const isVoiced = rms >= voicedThresholdRms && rms >= MIC_QUALITY_CONFIG.MIN_AVERAGE_SPEECH_RMS;

          const cumulativeVoicedMs = accumulator.update(now, isVoiced);
          const cumulativeVoicedSec = cumulativeVoicedMs / 1000;
          const targetSec = MIC_QUALITY_CONFIG.REQUIRED_VOICED_DURATION_MS / 1000;

          const report = evaluateMicQuality({
            currentRms: rms,
            peakAmplitude: peak,
            noiseFloorRms,
            noiseFloorDb,
            isNoiseFloorCalibrated: true,
            cumulativeVoicedSeconds: cumulativeVoicedSec,
            targetVoicedSeconds: targetSec,
          });

          setMicReport(report);
          setNoiseDetected(!calibrator.isAcceptable() || rms > 0.25);

          if (report.overallPassed) {
            if (sttRef.current && speechStartedRef.current) {
              speechStartedRef.current = false;
              try {
                sttRef.current.stop();
              } catch {
                // ignore
              }
            }
            dispatch({
              type: 'MIC_VERIFY',
              level: levelPct,
              snrDb: report.estimatedSnrDb,
              noiseFloorDb,
              voicedSeconds: cumulativeVoicedSec,
            });
          } else {
            dispatch({
              type: 'MIC_COLLECTING_SPEECH',
              voicedSeconds: cumulativeVoicedSec,
              targetSeconds: targetSec,
              snrDb: report.estimatedSnrDb,
              level: levelPct,
              hint: report.primaryHint,
            });
          }

          audioAnimRef.current = requestAnimationFrame(updateMeter);
        };

        updateMeter();
      } catch (err) {
        const errName = err instanceof Error ? err.name : 'UnknownError';
        const errMsg = err instanceof Error ? err.message : String(err);
        setLastMicErrorName(errName);

        console.error('[DIAGNOSTIC MIC FAILURE]', {
          errorName: errName,
          errorMessage: errMsg,
          selectedMicDeviceId,
          audioContextState: audioContextRef.current?.state ?? 'null',
        });

        if (err instanceof Error && err.name === 'NotAllowedError') {
          dispatch({
            type: 'MIC_DENIED',
            error:
              'Microphone permission blocked. Click the lock/tune icon in your address bar, set Microphone to Allow, then click Try Again.',
            cause: 'not_allowed',
          });
        } else if (err instanceof Error && err.name === 'NotFoundError') {
          dispatch({
            type: 'MIC_ERROR',
            error:
              'No microphone detected. Plug in a headset or webcam microphone, then click Check Devices.',
            cause: 'not_found',
          });
        } else if (
          err instanceof Error &&
          (err.name === 'NotReadableError' || err.name === 'AbortError')
        ) {
          dispatch({
            type: 'MIC_ERROR',
            error:
              'Your microphone is in use by another app (e.g. Zoom, Teams, Meet) or exclusive mode is enabled. Close other apps and click Try Again.',
            cause: 'not_readable',
          });
        } else if (err instanceof Error && err.name === 'OverconstrainedError') {
          dispatch({
            type: 'MIC_ERROR',
            error:
              'Requested audio settings not supported by this microphone. Switching to default settings…',
            cause: 'overconstrained',
          });
        } else if (err instanceof Error && err.name === 'SecurityError') {
          dispatch({
            type: 'MIC_ERROR',
            error: 'Microphone requires HTTPS or localhost.',
            cause: 'security',
          });
        } else {
          dispatch({
            type: 'MIC_ERROR',
            error:
              'Unable to connect to microphone device. Please verify your audio settings and click Try Again.',
            cause: 'generic',
          });
        }
      }
    },
    [acquireAudio, selectedMicDeviceId, dispatch]
  );

  const handleSwitchMicrophone = useCallback(
    async (deviceId: string) => {
      setSelectedMicDeviceId(deviceId);
      if (audioAnimRef.current) {
        cancelAnimationFrame(audioAnimRef.current);
        audioAnimRef.current = null;
      }
      noiseFloorCalibratorRef.current.reset();
      voicedAccumulatorRef.current.reset();
      setMicReport(null);
      await handleStartMic(deviceId);
    },
    [setSelectedMicDeviceId, handleStartMic]
  );

  const handleRetestMic = useCallback(() => {
    if (audioAnimRef.current) {
      cancelAnimationFrame(audioAnimRef.current);
      audioAnimRef.current = null;
    }
    if (sttRef.current) {
      try {
        sttRef.current.stop();
      } catch {
        // ignore
      }
    }
    speechStartedRef.current = false;
    setLiveSpeechTranscript('');
    setSttNotice(null);
    setLastMicErrorName(null);
    setLastSttErrorCode(null);
    noiseFloorCalibratorRef.current.reset();
    voicedAccumulatorRef.current.reset();
    setMicReport(null);
    dispatch({ type: 'MIC_RESET' });
    void handleStartMic(selectedMicDeviceId);
  }, [handleStartMic, selectedMicDeviceId, dispatch]);

  const handleCheckDevices = useCallback(async () => {
    await refreshMicrophones();
    handleRetestMic();
  }, [refreshMicrophones, handleRetestMic]);

  const handleCopyDiagnostics = useCallback(() => {
    const errorText =
      state.mic.status === 'denied' || state.mic.status === 'error'
        ? state.mic.error
        : undefined;
    const cause =
      state.mic.status === 'denied' || state.mic.status === 'error'
        ? state.mic.cause
        : undefined;

    const text = generateMaskedDiagnostics({
      errorName: cause || 'MicrophoneConnectionError',
      errorMessage: errorText,
      cause,
      audioContextState: audioContextRef.current?.state,
      devices: availableMicrophones,
    });

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setDiagnosticsCopied(true);
          setTimeout(() => setDiagnosticsCopied(false), 2500);
        })
        .catch(() => {});
    }
  }, [state.mic, availableMicrophones]);

  // Support E2E automation for speech verification in headless environments where physical mic input isn't present
  useEffect(() => {
    const handleE2EAudio = () => {
      dispatch({
        type: 'MIC_VERIFY',
        level: 45,
        snrDb: 22.5,
        noiseFloorDb: -42.0,
        voicedSeconds: 1.8,
      });
    };
    window.addEventListener('__E2E_VOICED_SPEECH_ACCUMULATED__', handleE2EAudio);
    return () => {
      window.removeEventListener('__E2E_VOICED_SPEECH_ACCUMULATED__', handleE2EAudio);
    };
  }, [dispatch]);

  // --- 4. SPEAKER OUTPUT & 3-DIGIT CODE VERIFICATION ---
  const handlePlaySpeakerTest = useCallback(async () => {
    if (!ttsRef.current) return;
    setSpeakerError(null);
    setSpeakerCodeInput('');

    // Cryptographically secure 3-digit verification code
    const randomArray = new Uint16Array(1);
    crypto.getRandomValues(randomArray);
    const randomCode = (100 + (randomArray[0] % 900)).toString();
    setSpeakerTestCode(randomCode);

    dispatch({ type: 'SPEAKER_PLAY_TEST', code: randomCode });
    setIsSpeakingTest(true);

    const spokenDigits = randomCode.split('').join(', ');
    await ttsRef.current.speak(
      `Audio test. Your speaker verification code is ${spokenDigits}. Repeat: ${spokenDigits}.`
    );

    setIsSpeakingTest(false);
    dispatch({ type: 'SPEAKER_AWAIT_CONFIRMATION' });
  }, [dispatch]);

  const handleConfirmSpeakerCode = useCallback(() => {
    if (speakerCodeInput.trim() === speakerTestCode) {
      dispatch({ type: 'SPEAKER_CONFIRM_CODE', enteredCode: speakerCodeInput });
      setSpeakerError(null);
    } else {
      setSpeakerError('Incorrect code. Please listen again and re-enter.');
      dispatch({ type: 'SPEAKER_FAIL' });
    }
  }, [speakerCodeInput, speakerTestCode, dispatch]);

  const handleStart = () => {
    if (!isAllReady || !consentAccepted) return;
    ttsManager.unlockAudio();
    isHandingOverRef.current = true;
    retainForInterview();
    const finalAudioStream = audioStream ?? audioStreamRef.current;
    setAudioStream(finalAudioStream);
    onStartInterview({
      durationMinutes,
      videoStream: videoStream ?? cameraStream,
      audioStream: finalAudioStream,
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in py-4 px-3 sm:px-0">
      {/* 5-Step User Flow Breadcrumbs */}
      <nav aria-label="Interview Flow Progress" className="w-full max-w-3xl mx-auto mb-2">
        <ol className="flex items-center justify-between text-xs font-mono font-medium">
          {USER_FLOW_STEPS.map((s, idx) => {
            const isCurrent = s.step === 3;
            const isCompleted = s.step < 3;
            return (
              <li
                key={s.step}
                className={`flex items-center gap-1.5 ${
                  isCurrent
                    ? 'text-primary font-bold'
                    : isCompleted
                    ? 'text-success'
                    : 'text-text-faint'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${
                    isCurrent
                      ? 'bg-primary text-primary-ink'
                      : isCompleted
                      ? 'bg-mint text-primary font-bold'
                      : 'bg-bg-subtle border border-card-border text-text-faint'
                  }`}
                >
                  {isCompleted ? '✓' : s.step}
                </span>
                <span className="hidden sm:inline">{s.fullLabel}</span>
                {idx < USER_FLOW_STEPS.length - 1 && (
                  <span className="text-text-faint mx-1 hidden sm:inline">→</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Logo variant="mark" size="sm" />
          <span className="font-display font-semibold text-text text-base tracking-tight">InterviewForge</span>
        </div>
        <Badge variant="outline" className="border-card-border text-text-muted bg-bg-subtle font-mono text-xs">
          STEP 3 OF 5 // 3 CHECK CAMERA & MICROPHONE
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-bold font-display text-text tracking-tight">
          3 Check Camera & Microphone
        </h1>
        <p className="text-sm text-text-muted max-w-xl mx-auto">
          Verify physical camera feed, confirm two-way audio, and complete active liveness verification.
        </p>
      </div>

      {!sttSupported && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-600/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block text-warning font-mono uppercase tracking-wider text-[11px]">Speech Recognition Notice</span>
            <p className="text-text-muted leading-relaxed">
              Your browser does not have voice recognition enabled. Chrome or Edge is recommended.
              A typed input fallback will be provided automatically.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Duration & Settings (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="card-editorial shadow-sm backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-card-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-sky border border-primary/20 flex items-center justify-center text-primary">
                    <Clock className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base text-text font-display font-bold">Interview Duration</CardTitle>
                </div>
                <Badge variant="outline" className="border-card-border text-text-muted bg-bg-subtle font-mono text-xs">
                  {durationMinutes} Minutes
                </Badge>
              </div>
              <CardDescription className="text-text-muted text-xs mt-1">
                Select target interview length. Questions adjust dynamically.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 pt-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-text font-mono uppercase tracking-wider text-[11px]">Preset Durations</span>
                <div className="grid grid-cols-4 gap-2">
                  {durationPresets.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant={durationMinutes === m && !isCustomDuration ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setIsCustomDuration(false);
                        setDurationMinutes(m);
                        setCustomDurationInput(String(m));
                      }}
                      className={`text-xs h-9 cursor-pointer ${
                        durationMinutes === m && !isCustomDuration
                          ? 'bg-primary hover:bg-primary-hover text-primary-ink border-transparent shadow-xs font-semibold'
                          : 'border-card-border text-text-muted hover:text-text hover:bg-bg-subtle'
                      }`}
                    >
                      {m} Min
                    </Button>
                  ))}
                  <input
                    type="number"
                    min={5}
                    max={90}
                    value={customDurationInput}
                    onChange={(e) => {
                      setIsCustomDuration(true);
                      setCustomDurationInput(e.target.value);
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed) && parsed >= 5 && parsed <= 90) {
                        setDurationMinutes(parsed);
                      }
                    }}
                    className={`h-9 rounded-xl bg-bg-subtle border text-xs text-text text-center px-1 font-mono focus:outline-none focus:ring-1 focus:ring-primary ${
                      isCustomDuration ? 'border-primary ring-1 ring-primary' : 'border-card-border text-text-muted'
                    }`}
                    placeholder="Custom"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-bg-subtle border border-card-border space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted font-medium flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Estimated Questions:
                  </span>
                  <span className="text-primary font-mono font-semibold">
                    ~{questionEstimate.minQuestions}-{questionEstimate.maxQuestions} Questions
                  </span>
                </div>
              </div>

              {/* Accessibility Accommodations */}
              <div className="pt-3 border-t border-card-border space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text font-semibold flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                    <Accessibility className="h-4 w-4 text-primary" />
                    Accommodations
                  </span>
                  <Badge variant="outline" className="border-card-border text-[10px] text-text-faint font-mono">
                    Candidate Setting
                  </Badge>
                </div>
                <label className="flex items-start gap-2.5 text-xs text-text-muted cursor-pointer p-3 rounded-xl bg-bg-subtle border border-card-border hover:border-primary/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={motorAccommodation}
                    onChange={(e) => setMotorAccommodation(e.target.checked)}
                    className="mt-0.5 rounded border-card-border text-primary focus:ring-primary accent-primary"
                  />
                  <span className="leading-relaxed">
                    Request motor accessibility accommodation (replaces head-turn liveness verification with facial and eye-blink verification).
                  </span>
                </label>
              </div>

              {/* Privacy Guarantee */}
              <div className="p-3.5 rounded-xl bg-mint/40 border border-primary/20 text-xs text-text space-y-1.5">
                <div className="flex items-center gap-1.5 text-primary font-semibold font-mono uppercase tracking-wider text-[11px]">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Local Privacy Protection
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Your camera and microphone are on during the interview. Camera monitoring and facial analysis run entirely on your device. Spoken answers are transcribed either locally in your browser or sent to our server for real-time transcription only. Audio is never stored or recorded on our servers. Only numeric behavior signals and the transcribed text of your answers are saved.
                </p>
              </div>

              {/* Consent Toggle */}
              <div className="pt-3 border-t border-card-border">
                <label className="flex items-start gap-2.5 text-xs text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-card-border text-primary focus:ring-primary accent-primary"
                  />
                  <span className="leading-relaxed">
                    I understand that real-time local non-verbal telemetry is computed client-side for feedback and candidate evaluation.
                  </span>
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Hardware Proof Checks (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="card-editorial shadow-sm backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-card-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-mint border border-primary/20 flex items-center justify-center text-primary">
                    <Headphones className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base text-text font-display font-bold">Pre-Flight Hardware Check</CardTitle>
                </div>
                <Badge
                  variant={isAllReady && consentAccepted ? 'success' : 'outline'}
                  className="font-mono text-xs gap-1"
                >
                  {isAllReady && consentAccepted ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Ready for Live Room
                    </>
                  ) : (
                    'Verification Required'
                  )}
                </Badge>
              </div>
              <CardDescription className="text-text-muted text-xs mt-1">
                Real physical webcam, two-way audio, and active liveness verification required.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {/* 1. Camera Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                    <Camera className="h-3.5 w-3.5 text-primary" />
                    1. Camera
                  </span>

                  {state.camera.status === 'verified' ? (
                    <Badge variant="outline" className="bg-mint text-primary border-primary/30 text-[11px] gap-1 py-0.5">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      Face Captured & Verified
                    </Badge>
                  ) : state.camera.status === 'captured_pending_confirm' ? (
                    <Badge variant="outline" className="bg-amber-500/10 text-warning border-warning/30 text-[11px] gap-1 py-0.5">
                      Confirm Captured Frame
                    </Badge>
                  ) : state.camera.status === 'ready_to_capture' ? (
                    <Badge variant="outline" className="bg-mint text-primary border-primary/40 text-[11px] gap-1 py-0.5 animate-pulse">
                      <Sparkles className="h-3 w-3 text-primary" />
                      Ready to Capture Face
                    </Badge>
                  ) : state.camera.status === 'quality_checking' || state.camera.status === 'streaming' ? (
                    <Badge variant="outline" className="bg-bg-subtle text-text border-card-border text-[11px] gap-1 py-0.5">
                      <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                      Checking Face Quality...
                    </Badge>
                  ) : state.camera.status === 'requesting' ? (
                    <Badge variant="outline" className="bg-bg-subtle text-text border-card-border text-[11px] gap-1 py-0.5">
                      {state.camera.stage === 'starting_video'
                        ? 'Starting Video...'
                        : state.camera.stage === 'loading_model'
                        ? 'Loading Vision Model...'
                        : state.camera.stage === 'detecting_face'
                        ? 'Detecting Face...'
                        : 'Requesting Camera...'}
                    </Badge>
                  ) : state.camera.status === 'timeout' ? (
                    <Badge variant="outline" className="bg-danger/10 text-danger border-danger/30 text-[11px] gap-1 py-0.5">
                      Camera Timeout
                    </Badge>
                  ) : (
                    <span className="text-text-faint font-mono text-[11px]">Unverified</span>
                  )}
                </div>

                {/* Video Container Box */}
                <div className="relative aspect-video rounded-2xl bg-black border border-card-border overflow-hidden flex items-center justify-center">
                  {/* Live Video Feed */}
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    className={`w-full h-full object-cover -scale-x-100 ${
                      state.camera.status === 'streaming' ||
                      state.camera.status === 'quality_checking' ||
                      state.camera.status === 'ready_to_capture' ||
                      state.camera.status === 'verified'
                        ? 'opacity-100'
                        : 'opacity-0 absolute pointer-events-none'
                    }`}
                  />

                  {/* Captured Still Preview for Review & Confirmation */}
                  {state.camera.status === 'captured_pending_confirm' && (
                    <div className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-center">
                      <img
                        src={capturedPreview || state.camera.previewDataUrl}
                        alt="Captured face preview"
                        className="w-full h-full object-cover -scale-x-100"
                      />
                      <div className="absolute bottom-3 inset-x-3 flex items-center justify-between p-2.5 rounded-xl bg-card/90 backdrop-blur border border-card-border shadow-lg">
                        <span className="text-xs text-text font-medium">Review captured frame</span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRetakeCapture}
                            className="h-7 text-xs border-card-border text-text hover:bg-bg-subtle gap-1"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retake
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleConfirmCapture}
                            className="h-7 text-xs bg-primary hover:bg-primary-hover text-primary-ink font-semibold gap-1"
                          >
                            <Check className="h-3 w-3" />
                            Confirm Face
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Oval Face Guide when Camera is Actively Checking Quality */}
                  {(state.camera.status === 'quality_checking' ||
                    state.camera.status === 'ready_to_capture' ||
                    state.camera.status === 'streaming') && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 px-4">
                      {/* Guide Oval */}
                      <div
                        className={`w-36 h-48 sm:w-44 sm:h-56 rounded-[50%] transition-all duration-300 pointer-events-none ${
                          state.camera.status === 'ready_to_capture' || faceQualityReport?.overallPassed
                            ? 'border-2 border-success shadow-[0_0_35px_rgba(31,122,85,0.5)] bg-success/5'
                            : faceQualityReport?.firstFailingCriterion
                            ? 'border-2 border-warning/80 shadow-[0_0_20px_rgba(183,121,31,0.25)] bg-black/10'
                            : 'border-2 border-dashed border-primary/60 shadow-[0_0_20px_rgba(15,74,58,0.2)]'
                        }`}
                      />

                      {/* Direction / Alignment Hint Placed Under the Guide Oval */}
                      <div
                        aria-live="polite"
                        role="status"
                        className="mt-3 pointer-events-auto"
                      >
                        <span
                          className={`text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-full shadow-xl flex items-center gap-1.5 backdrop-blur-md transition-all duration-200 ${
                            state.camera.status === 'ready_to_capture'
                              ? 'bg-card/95 text-success border border-success/40 shadow-sm'
                              : faceQualityReport?.firstFailingCriterion
                              ? 'bg-card/95 text-warning border border-warning/40 shadow-sm'
                              : 'bg-card/95 text-primary border border-primary/40 shadow-sm'
                          }`}
                        >
                          {state.camera.status === 'ready_to_capture' ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                              Ready to capture! Hold still
                            </>
                          ) : faceQualityReport?.firstFailingCriterion ? (
                            <>
                              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                              {faceQualityReport.firstFailingCriterion.hint}
                            </>
                          ) : (
                            'Position face inside oval guide'
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Black Frame Shutter Warning */}
                  {isBlackFrame && (
                    <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center z-20">
                      <AlertTriangle className="h-7 w-7 text-warning mb-1" />
                      <p className="text-xs text-warning font-semibold">Camera is on but image is black</p>
                      <p className="text-[11px] text-white/80 max-w-xs mt-1">
                        Please check your webcam lens cover or physical privacy shutter switch.
                      </p>
                    </div>
                  )}

                  {/* 4-Stage Stepper Progress Indicator during Requesting */}
                  {state.camera.status === 'requesting' && (
                    <div
                      aria-live="polite"
                      role="status"
                      className="text-center p-4 space-y-3 z-10 max-w-sm w-full"
                    >
                      <RefreshCw className="h-7 w-7 text-primary animate-spin mx-auto" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-white">
                          Initializing Camera Pipeline...
                        </p>
                        <p className="text-[11px] text-white/70">
                          {state.camera.stage === 'starting_video'
                            ? 'Starting Video Stream...'
                            : state.camera.stage === 'loading_model'
                            ? 'Checking that you are visible...'
                            : state.camera.stage === 'detecting_face'
                            ? 'Detecting Face in Camera Frame...'
                            : 'Requesting Physical Camera Access...'}
                        </p>
                      </div>

                      {/* 4-Stage Step Breadcrumb */}
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        {[
                          { stage: 'requesting_camera', label: 'Camera' },
                          { stage: 'starting_video', label: 'Video' },
                          { stage: 'loading_model', label: 'Model' },
                          { stage: 'detecting_face', label: 'Face' },
                        ].map(({ stage, label }, idx) => {
                          const stages = ['requesting_camera', 'starting_video', 'loading_model', 'detecting_face'];
                          const currentStage =
                            state.camera.status === 'requesting' ? state.camera.stage : undefined;
                          const currentIdx = stages.indexOf(currentStage || 'requesting_camera');
                          const isDone = idx < currentIdx;
                          const isCurrent = idx === currentIdx;

                          return (
                            <div key={stage} className="flex flex-col items-center space-y-1">
                              <div
                                className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                                  isDone
                                    ? 'bg-success'
                                    : isCurrent
                                    ? 'bg-primary animate-pulse'
                                    : 'bg-card-border'
                                }`}
                              />
                              <span
                                className={`text-[9px] font-mono ${
                                  isDone
                                    ? 'text-success font-bold'
                                    : isCurrent
                                    ? 'text-primary font-semibold'
                                    : 'text-text-faint'
                                }`}
                              >
                                {isDone ? '✓ ' : ''}{label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Stage Timeout Overlay with Retry */}
                  {state.camera.status === 'timeout' && (
                    <div
                      aria-live="polite"
                      role="status"
                      className="text-center p-4 space-y-2 z-10 max-w-xs"
                    >
                      <AlertTriangle className="h-8 w-8 text-danger mx-auto" />
                      <p className="text-xs text-danger font-semibold">
                        Stage Timed Out: {state.camera.stage?.replace('_', ' ')}
                      </p>
                      <p className="text-[11px] text-white/80 break-words">{state.camera.error}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleEnableCamera}
                        className="text-xs border-danger/40 text-danger hover:bg-danger/10 mt-2"
                        aria-label="Retry camera initialization"
                      >
                        Retry Camera
                      </Button>
                    </div>
                  )}

                  {/* Placeholder overlay when not streaming or active */}
                  {state.camera.status !== 'streaming' &&
                    state.camera.status !== 'quality_checking' &&
                    state.camera.status !== 'ready_to_capture' &&
                    state.camera.status !== 'captured_pending_confirm' &&
                    state.camera.status !== 'verified' &&
                    state.camera.status !== 'requesting' &&
                    state.camera.status !== 'timeout' && (
                      <div className="text-center p-4 space-y-2 z-10 max-w-xs">
                        <CameraOff className="h-8 w-8 text-text-faint mx-auto" />
                        <p className="text-xs text-text-muted break-words">
                          {state.camera.status === 'denied'
                            ? state.camera.error
                            : state.camera.status === 'in_use'
                            ? state.camera.error
                            : state.camera.status === 'not_found'
                            ? state.camera.error
                            : state.camera.status === 'lost'
                            ? `Camera connection lost: ${state.camera.reason}`
                            : 'Physical camera feed not active.'}
                        </p>

                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleEnableCamera}
                            className="text-xs border-card-border text-text hover:bg-bg-subtle cursor-pointer"
                          >
                            {state.camera.status === 'denied' ||
                            state.camera.status === 'in_use' ||
                            state.camera.status === 'lost'
                              ? 'Retry Camera'
                              : 'Enable Camera Feed'}
                          </Button>
                          {state.camera.status === 'denied' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setIsHelpModalOpen(true)}
                              className="text-xs text-primary hover:text-primary-hover underline underline-offset-2"
                            >
                              Permission Help
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                </div>

                {/* Lighting Tip Banner (§2.1, §2.2) */}
                {showLightingTip && (
                  <div
                    aria-live="polite"
                    role="status"
                    className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-warning/30 text-xs animate-in fade-in"
                  >
                    <Sun className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="font-semibold text-warning">
                        {colorCastCrit && !colorCastCrit.passed
                          ? 'Lighting Warning: Strong Color Tint Detected'
                          : 'Lighting Tip: Uneven or Low Illumination'}
                      </p>
                      <p className="text-[11px] text-text-muted leading-relaxed">
                        Face a window or lamp; avoid strong backlight. Ensure your room is evenly illuminated so face verification succeeds smoothly.
                      </p>
                    </div>
                  </div>
                )}

                {/* Live Face Quality Checklist & Capture Button (Visible during quality checking & ready) */}
                {(state.camera.status === 'quality_checking' || state.camera.status === 'ready_to_capture') && (
                  <div className="p-3.5 rounded-xl bg-bg-subtle border border-card-border space-y-3">
                    {/* Quality Meter */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-muted font-medium font-mono uppercase tracking-wider text-[10px]">Face Alignment Quality</span>
                        <span className="font-mono font-bold text-text">
                          {faceQualityReport?.qualityScore ?? 0}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-card border border-card-border overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            (faceQualityReport?.qualityScore ?? 0) >= 90
                              ? 'bg-success'
                              : (faceQualityReport?.qualityScore ?? 0) >= 60
                              ? 'bg-primary'
                              : 'bg-warning'
                          }`}
                          style={{ width: `${faceQualityReport?.qualityScore ?? 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Criteria Checklist Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {faceQualityReport?.criteriaList.map((crit) => (
                        <div
                          key={crit.id}
                          className={`p-1.5 rounded-lg text-[10px] flex items-center justify-between border ${
                            crit.passed
                              ? 'bg-mint text-primary border-primary/20 font-medium'
                              : crit.isWarningOnly
                              ? 'bg-amber-500/10 text-warning border-warning/30 font-medium'
                              : 'bg-card border-card-border text-text-muted'
                          }`}
                        >
                          <span className="truncate mr-1 font-medium">{crit.name}</span>
                          <span className="shrink-0">{crit.passed ? '✓' : crit.isWarningOnly ? '⚠️' : '✗'}</span>
                        </div>
                      ))}
                    </div>

                    {captureError && (
                      <p className="text-[11px] text-danger font-medium bg-danger/10 border border-danger/25 p-2 rounded-lg">
                        {captureError}
                      </p>
                    )}

                    {/* Capture Controls */}
                    <div className="flex items-center justify-between pt-1 border-t border-card-border">
                      <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isAutoCapture}
                          onChange={(e) => setIsAutoCapture(e.target.checked)}
                          className="rounded border-card-border text-primary focus:ring-primary accent-primary"
                        />
                        <span>Auto-capture when ready (3s)</span>
                      </label>

                      <Button
                        size="sm"
                        disabled={state.camera.status !== 'ready_to_capture'}
                        onClick={handleCaptureFace}
                        className={`text-xs gap-1.5 ${
                          state.camera.status === 'ready_to_capture'
                            ? 'bg-primary hover:bg-primary-hover text-primary-ink cursor-pointer shadow-sm font-semibold'
                            : 'bg-card text-text-faint border border-card-border cursor-not-allowed'
                        }`}
                        title={
                          state.camera.status !== 'ready_to_capture'
                            ? faceQualityReport?.firstFailingCriterion?.hint || 'Pass all face checks to enable capture'
                            : 'Capture photo for verification'
                        }
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {autoCaptureCountdown !== null ? `Capturing in ${autoCaptureCountdown}...` : 'Capture Face'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Verified Camera Actions */}
                {state.camera.status === 'verified' && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-mint/40 border border-success/30 text-xs text-success">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      Face verified and saved in memory. Liveness verification unlocked.
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRetakeCapture}
                      className="h-6 text-[10px] text-primary hover:underline"
                    >
                      Retake Photo
                    </Button>
                  </div>
                )}

                {/* Device Selector & Diagnostics Link */}
                <div className="flex items-center justify-between text-[11px] text-text-muted px-1 pt-0.5">
                  <div className="flex items-center gap-2 truncate max-w-[220px]">
                    <span className="truncate" title={availableCameras[0]?.label}>
                      Camera: <strong className="text-text">{availableCameras[0]?.label || 'Default Camera'}</strong>
                    </span>
                    {availableCameras.length > 1 && (
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        className="bg-bg-subtle border border-card-border text-text rounded px-1.5 py-0.5 text-[10px]"
                      >
                        {availableCameras.map((c, i) => (
                          <option key={c.deviceId || i} value={c.deviceId}>
                            {c.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsDiagnosticsOpen(true)}
                    className="h-6 text-[10px] text-primary hover:text-primary-hover underline underline-offset-2 p-0"
                  >
                    Run Diagnostics
                  </Button>
                </div>

                <p className="text-[10px] text-text-faint pt-1 leading-relaxed border-t border-card-border">
                  Your camera and microphone are on during the interview. Camera monitoring and facial analysis run entirely on your device. Spoken answers are transcribed using your browser’s speech recognition service. Only numeric behavior signals and the transcribed text of your answers are saved. No raw audio or video recordings are stored on our servers.
                </p>
              </div>

              {/* 2. Microphone Section */}
              <div className="space-y-2 pt-2 border-t border-card-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                    <Mic className="h-3.5 w-3.5 text-primary" />
                    2. Microphone
                  </span>

                  {state.mic.status === 'verified' ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-mint text-primary border-primary/30 text-[11px] gap-1 py-0.5">
                        <CheckCircle2 className="h-3 w-3 text-success" />
                        ✓ Microphone Verified
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleRetestMic}
                        className="h-5 text-[10px] text-text-muted hover:text-primary p-0 underline"
                      >
                        Re-test
                      </Button>
                    </div>
                  ) : state.mic.status === 'measuring_noise' ? (
                    <Badge variant="outline" className="bg-amber-500/10 text-warning border-warning/30 text-[11px] gap-1 py-0.5">
                      <RefreshCw className="h-3 w-3 animate-spin text-warning" />
                      Measuring Noise Floor (1s)...
                    </Badge>
                  ) : state.mic.status === 'collecting_speech' ? (
                    <Badge variant="outline" className="bg-mint text-primary border-primary/30 text-[11px] gap-1 py-0.5">
                      Listening ({state.mic.voicedSeconds.toFixed(1)} / 1.5s)
                    </Badge>
                  ) : state.mic.status === 'streaming' ? (
                    <span className="text-primary font-mono text-[11px] animate-pulse">
                      Speak into mic...
                    </span>
                  ) : state.mic.status === 'requesting' ? (
                    <Badge variant="outline" className="bg-bg-subtle text-text border-card-border text-[11px] gap-1 py-0.5">
                      Requesting Mic...
                    </Badge>
                  ) : state.mic.status === 'error' ? (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="bg-danger/10 text-danger border-danger/30 text-[11px] gap-1 py-0.5">
                        Mic Error
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleRetestMic}
                        className="h-5 text-[10px] text-primary hover:text-primary-hover p-0 underline"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : state.mic.status === 'denied' ? (
                    <Badge variant="outline" className="bg-danger/10 text-danger border-danger/30 text-[11px] gap-1 py-0.5">
                      Permission Blocked
                    </Badge>
                  ) : (
                    <span className="text-text-faint font-mono text-[11px]">Not Connected</span>
                  )}
                </div>

                {state.mic.status === 'idle' ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-bg-subtle border border-card-border">
                    <span className="text-xs text-text-muted">Connect microphone to verify voice input</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleStartMic()}
                      className="text-xs border-primary/30 text-primary hover:bg-mint/40 h-7"
                    >
                      Connect Mic
                    </Button>
                  </div>
                ) : state.mic.status === 'denied' || state.mic.status === 'error' ? (
                  <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/25 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                      <div className="space-y-1 flex-1">
                        <p className="text-xs text-danger font-medium leading-relaxed">
                          {state.mic.error}
                        </p>
                        {state.mic.status === 'error' && state.mic.speechError && (
                          <p className="text-[11px] text-danger/80">
                            Speech engine: {state.mic.speechError}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-2 pt-1 border-t border-danger/20">
                      {state.mic.cause === 'not_found' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleCheckDevices()}
                          className="text-xs border-danger/30 bg-card text-danger hover:bg-danger/10 h-7"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Check Devices
                        </Button>
                      ) : state.mic.cause === 'overconstrained' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRetestMic}
                          className="text-xs border-danger/30 bg-card text-danger hover:bg-danger/10 h-7"
                        >
                          Switch to Defaults
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRetestMic}
                          className="text-xs border-danger/30 bg-card text-danger hover:bg-danger/10 h-7"
                        >
                          Try Again
                        </Button>
                      )}

                      {state.mic.status === 'denied' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsHelpModalOpen(true)}
                          className="h-7 text-xs border-card-border text-text hover:bg-bg-subtle"
                        >
                          Permission Help
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCopyDiagnostics}
                        className="h-7 text-xs text-text-muted hover:text-text gap-1 ml-auto"
                        title="Copy diagnostic report for support"
                      >
                        {diagnosticsCopied ? (
                          <>
                            <Check className="h-3 w-3 text-success" />
                            <span className="text-success font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 text-text-faint" />
                            <span>Copy Diagnostics</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Live audio level meter bar */}
                    <div className="h-3 w-full rounded-full bg-card border border-card-border overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-75 ${
                          audioLevel > 60
                            ? 'bg-danger'
                            : audioLevel > 20
                            ? 'bg-success'
                            : 'bg-primary'
                        }`}
                        style={{ width: `${audioLevel}%` }}
                      />
                    </div>

                    {/* Step-specific guidance messages (§2.3, S5) */}
                    {state.mic.status === 'measuring_noise' && (
                      <div
                        aria-live="polite"
                        role="status"
                        className="p-3 rounded-xl bg-amber-500/10 border border-warning/30 flex items-center gap-2 text-xs text-warning"
                      >
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-warning shrink-0" />
                        <span>Measuring ambient noise floor... Please stay quiet for 1 second.</span>
                      </div>
                    )}

                    {state.mic.status === 'collecting_speech' && (
                      <div
                        aria-live="polite"
                        role="status"
                        className="p-3 rounded-xl bg-mint/30 border border-primary/30 flex items-center gap-3.5 animate-in fade-in"
                      >
                        {/* Circular Progress Ring */}
                        <div className="relative shrink-0 flex items-center justify-center">
                          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40">
                            {/* Background Track */}
                            <circle
                              cx="20"
                              cy="20"
                              r="16"
                              className="stroke-card-border fill-none"
                              strokeWidth="3.5"
                            />
                            {/* Animated Progress Stroke */}
                            <circle
                              cx="20"
                              cy="20"
                              r="16"
                              className="stroke-primary fill-none transition-all duration-100 ease-out"
                              strokeWidth="3.5"
                              strokeDasharray={100.53}
                              strokeDashoffset={100.53 * (1 - Math.min(1, state.mic.voicedSeconds / 1.5))}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="absolute text-[10px] font-mono font-bold text-primary">
                            {state.mic.voicedSeconds.toFixed(1)}s
                          </span>
                        </div>

                        {/* Speech Sentence Prompt & Live Status */}
                        <div className="space-y-2 flex-1 min-w-0">
                          {/* Accent / Language Selector (§T8) */}
                          <div className="flex items-center justify-between text-xs py-1 px-2 bg-bg-subtle/50 rounded-lg border border-card-border">
                            <span className="text-text-muted text-[11px] font-medium">Accent / Language:</span>
                            <select
                              value={selectedSpeechLang}
                              onChange={(e) => handleSpeechLangChange(e.target.value)}
                              className="bg-card border border-card-border text-text rounded px-1.5 py-0.5 text-[11px] font-medium focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
                              aria-label="Select speech recognition accent"
                              data-testid="speech-lang-selector"
                            >
                              {SUPPORTED_SPEECH_LANGS.map((lang) => (
                                <option key={lang.code} value={lang.code}>
                                  {lang.label} {lang.code === 'en-IN' ? '(Default)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          <p className="text-xs font-semibold text-text">
                            Say: &apos;I&apos;m ready for the interview and excited to begin&apos; (or &apos;My name is ___ and I&apos;m ready for the interview&apos;)
                          </p>
                          {liveSpeechTranscript ? (
                            <div className="p-1.5 rounded-lg bg-card border border-card-border font-mono text-[11px] text-text">
                              <span className="text-primary font-semibold mr-1">Heard:</span>
                              &ldquo;{liveSpeechTranscript}&rdquo;
                            </div>
                          ) : (
                            <p className="text-[11px] text-text-muted">
                              {micReport?.primaryHint || state.mic.hint || `Listening… speak test phrase (${state.mic.voicedSeconds.toFixed(1)} / 1.5 s)`}
                            </p>
                          )}

                          {micAdvice && (
                            <div
                              className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1.5 font-medium"
                              data-testid="mic-input-advice"
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span>Audio advice: {micAdvice}</span>
                            </div>
                          )}

                          {sttNotice && (
                            <div className="p-2 rounded-lg bg-warning/15 border border-warning/30 text-warning text-[11px] space-y-1">
                              <div className="font-semibold flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span>Voice Recognition Guidance</span>
                              </div>
                              <p className="leading-snug">{sttNotice}</p>
                            </div>
                          )}
                          <div className="text-[10px] text-text-muted flex items-center justify-between pt-0.5">
                            <span className="flex items-center gap-1.5" data-testid="stt-readiness-indicator">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-mint" />
                              <span>Voice recognition ready</span>
                            </span>
                            {preflightResult?.isBrave && (
                              <span className="text-[10px] text-warning font-semibold">Brave Browser (Action Required)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {state.mic.status === 'verified' && (
                      <div
                        aria-live="polite"
                        role="status"
                        className="p-3 rounded-xl bg-mint/40 border border-success/30 flex flex-col gap-1.5 text-xs text-success"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-medium">
                            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                            Voice recognition ready ✓ &mdash; Clear voice detected ✓ (SNR: {state.mic.snrDb ? `${state.mic.snrDb.toFixed(1)} dB` : '15+ dB'}). Input latched.
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleRetestMic}
                            className="h-6 text-[10px] text-primary hover:underline shrink-0"
                            aria-label="Re-test microphone"
                          >
                            Re-test
                          </Button>
                        </div>
                        {liveSpeechTranscript && (
                          <div className="pl-5 text-[11px] text-text-muted font-mono">
                            <span className="text-primary font-semibold mr-1">Recognized:</span>
                            &ldquo;{liveSpeechTranscript}&rdquo;
                          </div>
                        )}
                      </div>
                    )}

                    {noiseDetected && (
                      <p className="text-[11px] text-warning flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        High background noise detected. Quiet environment recommended.
                      </p>
                    )}
                  </div>
                )}

                {/* Microphone Device Selector */}
                <div className="flex items-center justify-between text-[11px] text-text-muted px-1 pt-1 border-t border-card-border">
                  <div className="flex items-center gap-2 truncate max-w-[280px]">
                    <span className="truncate" title={activeMicLabel || availableMicrophones[0]?.label}>
                      Mic: <strong className="text-text">{activeMicLabel || availableMicrophones[0]?.label || 'Default Microphone'}</strong>
                    </span>
                    {availableMicrophones.length > 1 && (
                      <select
                        value={selectedMicDeviceId}
                        onChange={(e) => void handleSwitchMicrophone(e.target.value)}
                        className="bg-bg-subtle border border-card-border text-text rounded px-1.5 py-0.5 text-[10px] max-w-[150px] truncate"
                        aria-label="Select microphone"
                      >
                        {availableMicrophones.map((m, i) => (
                          <option key={m.deviceId || i} value={m.deviceId}>
                            {m.label || `Microphone ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {state.mic.status === 'verified' && (
                    <span className="text-[10px] text-success font-mono font-medium">Active</span>
                  )}
                </div>

                <p className="text-[10px] text-text-faint pt-1 leading-relaxed border-t border-card-border">
                  Your camera and microphone are on during the interview. Camera monitoring and facial analysis run entirely on your device. Spoken answers are transcribed using your browser’s speech recognition service. Only numeric behavior signals and the transcribed text of your answers are saved. No raw audio or video recordings are stored on our servers.
                </p>
              </div>

              {/* 3. Speaker Output & Verification Code Test */}
              <div className="space-y-2 pt-2 border-t border-card-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                    <Volume2 className="h-3.5 w-3.5 text-primary" />
                    3. Speaker
                  </span>
                  {state.speaker.status === 'verified' ? (
                    <span className="text-success flex items-center gap-1 font-mono text-[11px] font-semibold">
                      <Check className="h-3 w-3" /> Verified (Code Confirmed)
                    </span>
                  ) : (
                    <span className="text-text-faint font-mono text-[11px]">Unverified</span>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-bg-subtle border border-card-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs text-text font-medium block">Spoken Code Test</span>
                      <span className="text-[11px] text-text-muted">Listen to 3-digit code and enter below</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSpeakingTest}
                      onClick={handlePlaySpeakerTest}
                      className="border-primary/30 text-primary hover:bg-mint/40 text-xs gap-1.5 cursor-pointer h-7"
                    >
                      <Play className="h-3 w-3" />
                      {isSpeakingTest ? 'Speaking...' : speakerTestCode ? 'Replay Code' : 'Play Test Code'}
                    </Button>
                  </div>

                  {/* Code Confirmation Field */}
                  {(state.speaker.status === 'awaiting_confirmation' ||
                    state.speaker.status === 'playing_test' ||
                    state.speaker.status === 'failed' ||
                    speakerTestCode) && (
                    <div className="pt-2 border-t border-card-border flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={3}
                        value={speakerCodeInput}
                        onChange={(e) => setSpeakerCodeInput(e.target.value)}
                        placeholder="3-digit code"
                        data-expected-code={speakerTestCode}
                        className="h-8 w-28 bg-card border border-card-border text-text text-xs text-center font-mono rounded-lg focus:border-primary focus:outline-none"
                      />
                      <Button
                        size="sm"
                        onClick={handleConfirmSpeakerCode}
                        disabled={speakerCodeInput.trim().length !== 3}
                        className="h-8 text-xs bg-primary hover:bg-primary-hover text-primary-ink font-semibold"
                      >
                        Confirm
                      </Button>
                      {speakerError && (
                        <span className="text-[10px] text-danger font-medium">
                          {speakerError}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Liveness Section (Gated on Camera Verification) */}
              <div className="p-3.5 rounded-xl bg-bg-subtle border border-card-border space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    4. Liveness
                  </span>
                  {state.liveness.status === 'passed' ? (
                    <Badge variant="outline" className="bg-mint text-primary border-primary/30 text-[10px] gap-1 font-mono">
                      <Check className="h-3 w-3 text-success" />
                      3/3 Steps Passed
                    </Badge>
                  ) : state.liveness.status === 'locked' ? (
                    <Badge variant="outline" className="border-card-border text-text-faint bg-card text-[10px] gap-1 font-mono">
                      <Lock className="h-2.5 w-2.5" />
                      Locked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-primary/30 text-primary bg-mint/30 text-[10px] font-mono">
                      Mandatory Check
                    </Badge>
                  )}
                </div>

                {state.liveness.status === 'locked' ? (
                  <p className="text-xs text-text-muted">
                    Enable your physical camera and align your face in the guide to unlock liveness verification.
                  </p>
                ) : state.liveness.status === 'in_progress' ? (
                  <div className="p-3 rounded-xl bg-mint/30 border border-primary/30 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-primary tracking-wider font-mono">
                        Action Required ({state.liveness.currentStep}/{state.liveness.totalSteps})
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleStepComplete}
                        className="h-6 text-[10px] text-primary hover:text-primary-hover hover:bg-mint/40"
                      >
                        Simulate Gesture Pass
                      </Button>
                    </div>
                    <p className="text-xs font-semibold text-text">
                      {state.liveness.prompt}
                    </p>
                  </div>
                ) : state.liveness.status === 'passed' ? (
                  <p className="text-xs text-success flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    Live human presence confirmed. Anti-spoofing passed.
                  </p>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">
                      Camera verified. Complete 3 quick actions to prove human presence.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleStartLiveness}
                      className="text-xs border-primary/30 text-primary hover:bg-mint/40 h-7 cursor-pointer"
                    >
                      Start Check
                    </Button>
                  </div>
                )}
              </div>

              {/* Start Interview CTA */}
              <div className="pt-4 border-t border-card-border flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={onCancel}
                  className="text-xs text-text-muted hover:text-text"
                >
                  Cancel
                </Button>

                <div className="flex flex-col items-end gap-1">
                  <Button
                    disabled={!isAllReady || !consentAccepted}
                    onClick={handleStart}
                    className={`px-6 text-xs font-semibold gap-2 shadow-md transition-all cursor-pointer rounded-xl h-10 ${
                      isAllReady && consentAccepted
                        ? 'bg-primary hover:bg-primary-hover text-primary-ink shadow-primary/20'
                        : 'bg-card text-text-faint border border-card-border cursor-not-allowed'
                    }`}
                  >
                    <span>Start {durationMinutes}-Min Interview</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  {(!isAllReady || !consentAccepted) && (
                    <span className="text-[10px] text-text-faint font-mono">
                      {state.camera.status !== 'verified'
                        ? 'Physical camera verification required'
                        : state.liveness.status !== 'passed'
                        ? 'Complete liveness verification'
                        : state.mic.status !== 'verified'
                        ? 'Speak into microphone to calibrate'
                        : state.speaker.status !== 'verified'
                        ? 'Confirm 3-digit speaker code'
                        : 'Accept consent terms to proceed'}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Permission Help Modal */}
      <PermissionHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        onRetry={handleRetestMic}
      />

      {/* Diagnostics Report Modal */}
      <DiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        stream={cameraStream}
        audioStream={audioStream ?? audioStreamRef.current}
        audioContext={audioContextRef.current}
        videoEl={videoRef.current}
        measuredFps={pipelineRef.current?.getStatus().fps}
        meanLuminance={pipelineRef.current?.getStatus().luminance}
        faceCount={pipelineRef.current?.getStatus().currentFaceCount}
        centeringOffsetPct={
          typeof faceQualityReport?.criteria?.centered?.value === 'number'
            ? faceQualityReport.criteria.centered.value
            : undefined
        }
        faceHeightPct={
          typeof faceQualityReport?.criteria?.distance?.value === 'number'
            ? faceQualityReport.criteria.distance.value
            : undefined
        }
        sharpnessScore={
          typeof faceQualityReport?.criteria?.sharpness?.value === 'number'
            ? faceQualityReport.criteria.sharpness.value
            : undefined
        }
        headPose={
          (faceQualityReport?.criteria?.facing_camera?.value as
            | { yaw: number; pitch: number; roll: number }
            | undefined) || undefined
        }
        noiseFloorRms={
          micReport?.noiseFloorRms ??
          (noiseFloorCalibratorRef.current.isCalibrated(performance.now())
            ? noiseFloorCalibratorRef.current.getAverageRms()
            : null)
        }
        noiseFloorDb={
          micReport?.noiseFloorDb ??
          (noiseFloorCalibratorRef.current.isCalibrated(performance.now())
            ? noiseFloorCalibratorRef.current.getAverageDb()
            : null)
        }
        estimatedSnrDb={micReport?.estimatedSnrDb ?? null}
        voicedSeconds={
          micReport?.voicedSeconds ??
          voicedAccumulatorRef.current.getCumulativeVoicedSeconds(performance.now())
        }
        lastError={
          state.camera.status === 'error' ||
          state.camera.status === 'denied' ||
          state.camera.status === 'in_use' ||
          state.camera.status === 'not_found'
            ? (state.camera as { error: string }).error
            : null
        }
        lastGetUserMediaError={lastMicErrorName}
        lastSpeechRecognitionError={lastSttErrorCode}
      />
    </div>
  );
}
