/**
 * Speech-to-Text Provider Factory (§B3, T4, T5).
 *
 * Configurable via:
 * 1. Environment variable: VITE_STT_PROVIDER=faster-whisper|vosk|browser
 * 2. Runtime override in localStorage: 'ai_interviewer_stt_provider'
 *
 * Builds an STTChainManager instance configured with selection-and-fallback chain:
 *   faster-whisper -> vosk -> browser (Web Speech API) -> typed fallback
 */

import { BrowserSpeechToText } from './browserSTT';
import { StreamingServerSTT } from './streamingServerSTT';
import { NemotronStreamingSTT, NemotronSTTOptions } from './nemotronSTT';
import { STTChainManager, STTProviderMode } from './sttChainManager';

export type STTProviderType = 'faster-whisper' | 'vosk' | 'browser' | 'nemotron';

const STORAGE_KEY = 'ai_interviewer_stt_provider';

export function getSelectedSTTProvider(): STTProviderType {
  // Candidate localStorage provider overrides are strictly forbidden and compiled out in production builds
  if (!import.meta.env.PROD && typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'faster-whisper' || stored === 'vosk' || stored === 'browser' || stored === 'nemotron') {
      return stored as STTProviderType;
    }
  }

  const envProvider = (import.meta.env.VITE_STT_PROVIDER || '').toLowerCase().trim();
  if (envProvider === 'faster-whisper' || envProvider === 'vosk' || envProvider === 'browser' || envProvider === 'nemotron') {
    return envProvider as STTProviderType;
  }

  return 'faster-whisper';
}

export function setSelectedSTTProvider(provider: STTProviderType): void {
  if (!import.meta.env.PROD && typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, provider);
  }
}

export function createSpeechToTextProvider(options: NemotronSTTOptions = {}): STTChainManager {
  const preferred = getSelectedSTTProvider();

  let chain: STTProviderMode[];
  if (preferred === 'browser') {
    chain = ['browser', 'faster-whisper', 'vosk', 'typed'];
  } else if (preferred === 'vosk') {
    chain = ['vosk', 'faster-whisper', 'browser', 'typed'];
  } else {
    // Default: 'faster-whisper' (or legacy 'nemotron')
    chain = ['faster-whisper', 'vosk', 'browser', 'typed'];
  }

  if (import.meta.env.DEV) {
    console.info(`[STT Factory] Initializing STTChainManager with primary provider: ${preferred}, chain:`, chain);
  }

  return new STTChainManager({
    ...options,
    chain,
  });
}

/**
 * Checks whether the streaming STT microservice on port 8001 is reachable and healthy.
 */
export async function checkSTTServiceHealth(timeoutMs = 1500): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const healthUrl = import.meta.env.VITE_STT_HEALTH_URL || 'http://127.0.0.1:8001/health';
    const res = await fetch(healthUrl, { signal: controller.signal, mode: 'cors' });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// Backward-compatibility alias
export const checkNemotronHealth = checkSTTServiceHealth;

export { STTChainManager, BrowserSpeechToText, StreamingServerSTT, NemotronStreamingSTT };
