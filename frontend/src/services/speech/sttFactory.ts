/**
 * Speech-to-Text Provider Factory (§B3)
 *
 * Configurable via:
 * 1. Environment variable: VITE_STT_PROVIDER=browser|nemotron
 * 2. Runtime override in localStorage: 'ai_interviewer_stt_provider'
 *
 * Returns an STTChainManager instance that enforces debounced restarts,
 * auto-retry exponential backoff, and seamless fallback across:
 *   Browser Web Speech API -> Nemotron Streaming ASR (port 8001) -> Typed Fallback
 */

import { BrowserSpeechToText } from './browserSTT';
import { NemotronStreamingSTT, NemotronSTTOptions } from './nemotronSTT';
import { STTChainManager, STTProviderMode } from './sttChainManager';

export type STTProviderType = 'browser' | 'nemotron';

const STORAGE_KEY = 'ai_interviewer_stt_provider';

export function getSelectedSTTProvider(): STTProviderType {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'browser' || stored === 'nemotron') {
      return stored;
    }
  }

  const envProvider = (import.meta.env.VITE_STT_PROVIDER || '').toLowerCase().trim();
  if (envProvider === 'nemotron') {
    return 'nemotron';
  }

  return 'browser';
}

export function setSelectedSTTProvider(provider: STTProviderType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, provider);
  }
}

export function createSpeechToTextProvider(options: NemotronSTTOptions = {}): STTChainManager {
  const preferred = getSelectedSTTProvider();
  const chain: STTProviderMode[] =
    preferred === 'nemotron'
      ? ['nemotron', 'browser', 'typed']
      : ['browser', 'nemotron', 'typed'];

  if (import.meta.env.DEV) {
    console.info(`[STT Factory] Initializing STTChainManager with primary provider: ${preferred}`);
  }

  return new STTChainManager({
    ...options,
    chain,
  });
}

/**
 * Checks whether the Nemotron streaming service on port 8001 is reachable and healthy.
 */
export async function checkNemotronHealth(timeoutMs = 1500): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const healthUrl = import.meta.env.VITE_NEMOTRON_HEALTH_URL || 'http://127.0.0.1:8001/health';
    const res = await fetch(healthUrl, { signal: controller.signal, mode: 'cors' });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export { STTChainManager, BrowserSpeechToText, NemotronStreamingSTT };
