/**
 * Terms and wording definitions for sanitized in-app copy.
 *
 * Rules:
 * Internal technology and vendor names (Gemini, GPT, OpenAI, LangGraph, MediaPipe,
 * Nemotron, Web Speech, MongoDB, FastAPI, Argon2, JWT, HMAC, RAG, etc.) are strictly
 * forbidden in client-facing app views (auth, dashboard, stage, review, PDF, errors).
 * They are permitted solely on public marketing and legal pages (/privacy, /terms).
 */

export interface CopyReplacementEntry {
  originalPattern: RegExp;
  replacement: string;
  category: 'model' | 'engine' | 'vision' | 'speech' | 'storage' | 'auth' | 'security';
}

export const SANITIZED_TERMS: Record<string, string> = {
  // Models & AI
  'Gemini is evaluating...': 'Reviewing your answer...',
  'GPT is evaluating...': 'Reviewing your answer...',
  'Evaluating answer with AI...': 'Reviewing your answer...',
  'LangGraph Adaptive Engine': 'Adaptive Question Flow',
  'LangGraph Engine': 'Adaptive Engine',
  'RAG Grounding': 'Resume Grounding',
  'Resume-Aware RAG': 'Resume Grounding',
  'RAG technology grounding': 'Resume technology personalization',
  'vector search': 'relevant skill search',
  'biometric vectors': 'biometric telemetry',

  // Vision & Camera
  'MediaPipe / WASM / FaceLandmarker': 'Checking that you are visible',
  'Loading Vision Models (MediaPipe WASM)...': 'Checking that you are visible...',
  'Verifying physical hardware feed and loading local MediaPipe neural models...':
    'Verifying camera feed and preparing composure analysis...',
  'Local Telemetry (WASM 1 Hz)': 'Camera & Audio Metrics (1 Hz)',

  // Speech & Audio
  'Browser Web Speech': 'Voice Recognition',
  'Web Speech API': 'Voice recognition',
  'Google speech service': 'Voice recognition',
  'Nemotron Neural STT': 'Voice recognition',
  'Nemotron Neural STT (port 8001)': 'Voice recognition',

  // Storage & Backend
  'MongoDB Atlas': 'Secure Database',
  'in MongoDB': 'recorded',
  'FastAPI': 'Backend Services',
  'Argon2id + JWT': 'SECURE AUTH',

  // Auth & Security
  'JWT token expired': 'Your session expired. Please sign in again.',
  'token expired': 'Your session expired. Please sign in again.',
  'HMAC signature verification': 'Camera and audio verification',
  'Integrity heuristics': 'Camera and audio verification',
};

export const BANNED_TECHNOLOGY_TERMS = [
  'gemini',
  'openai',
  'gpt',
  'langgraph',
  'langchain',
  'nemotron',
  'nemo',
  'mediapipe',
  'wasm',
  'mongodb',
  'mongo',
  'atlas',
  'fastapi',
  'argon',
  'argon2',
  'jwt',
  'hmac',
  'rag',
  'embedding',
  'embeddings',
  'vector search',
  'llm',
  'web speech',
  'google speech',
] as const;

/**
 * Utility to scrub banned technology terms from any dynamic text strings.
 */
export function sanitizeCopy(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [target, replacement] of Object.entries(SANITIZED_TERMS)) {
    out = out.split(target).join(replacement);
  }
  return out;
}

