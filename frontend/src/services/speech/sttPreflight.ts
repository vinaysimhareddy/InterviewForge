/**
 * Pre-interview Speech & Network Diagnostics (§B3)
 * Analyzes browser type (Brave/Chromium), online status, speech endpoint reachability,
 * and microphone track state to identify network or configuration issues before the interview begins.
 */

export interface SpeechPreflightResult {
  isOnline: boolean;
  isBrave: boolean;
  isEndpointReachable: boolean;
  isMicTrackActive: boolean;
  isSpeechRecognitionSupported: boolean;
  summary: string;
  recommendation: string;
}

export async function runSpeechPreflightDiagnostic(
  audioStream?: MediaStream | null
): Promise<SpeechPreflightResult> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const isBrave =
    typeof navigator !== 'undefined' &&
    (Boolean((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') ||
      navigator.userAgent.includes('Brave'));

  const isSpeechRecognitionSupported =
    typeof window !== 'undefined' &&
    Boolean(
      window.SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  let isMicTrackActive = false;
  if (audioStream && audioStream.getAudioTracks().length > 0) {
    const track = audioStream.getAudioTracks()[0];
    isMicTrackActive = track.readyState === 'live' && !track.muted && track.enabled;
  }

  // Lightweight reachability check
  let isEndpointReachable = isOnline;
  if (isOnline && typeof fetch === 'function') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/health', { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      isEndpointReachable = res.ok;
    } catch {
      // If local server /health is reachable or external fallback
      isEndpointReachable = false;
    }
  }

  let summary = 'Speech recognition environment healthy.';
  let recommendation = 'Ready for speech recognition.';

  if (!isOnline) {
    summary = 'No internet connection detected.';
    recommendation = 'Please connect to the internet to use browser speech recognition.';
  } else if (isBrave) {
    summary = 'Brave browser detected with Google speech endpoints blocked by default.';
    recommendation =
      'Brave blocks Google speech services by default. Please enable Google Services in brave://settings/privacy or switch to Chrome / Edge.';
  } else if (!isSpeechRecognitionSupported) {
    summary = 'Web Speech API is unsupported in this browser build.';
    recommendation = 'Please switch to Google Chrome or Microsoft Edge for hands-free speech input.';
  } else if (!isMicTrackActive && audioStream) {
    summary = 'Microphone hardware appears muted or inactive.';
    recommendation = 'Check physical mic mute button and browser permissions.';
  } else if (!isEndpointReachable) {
    summary = 'Speech endpoint or network reachability issue detected.';
    recommendation = 'Check VPN, proxy, firewall, or DNS restrictions blocking Google speech endpoints.';
  }

  return {
    isOnline,
    isBrave,
    isEndpointReachable,
    isMicTrackActive,
    isSpeechRecognitionSupported,
    summary,
    recommendation,
  };
}

