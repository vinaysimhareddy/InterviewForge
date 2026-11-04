/**
 * Speech Recognition and Synthesis Abstraction Layer
 * Interfaces allow seamless swapping between Browser Web Speech API and neural providers.
 */

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
  timestamp: number;
  fullTranscript: string;
}

export interface SpeechError {
  error: string;
  message?: string;
  isFatal: boolean;
}

export type STTState = 'idle' | 'listening' | 'error';
export type TTSState = 'idle' | 'speaking' | 'paused' | 'error' | 'silent-fallback';

export interface TTSOptions {
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
}

export interface STTProviderConfig {
  sampleRate?: number;
  frameMs?: number;
  wsUrl?: string;
  initialPrompt?: string;
  lang?: string;
  audioStream?: MediaStream | null;
}

export interface STTProviderMetrics {
  providerId: string;
  providerName: string;
  firstPartialLatencyMs?: number;
  totalLatencyMs?: number;
  wordsCaptured?: number;
  connected?: boolean;
  errorCount?: number;
}

export interface ISTTProvider {
  readonly id: string;
  readonly name: string;
  readonly isSupported: boolean;
  readonly isListening: boolean;
  init(config?: STTProviderConfig): Promise<void> | void;
  start(): void;
  stop(): void;
  abort(): void;
  onPartial(callback: (text: string, timestamp: number) => void): () => void;
  onFinal(callback: (text: string, timestamp: number) => void): () => void;
  onError(callback: (error: SpeechError) => void): () => void;
  getMetrics(): STTProviderMetrics;
}

export interface SpeechToText {
  readonly isSupported: boolean;
  readonly isListening: boolean;
  readonly isRestarting?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  resetTranscript(): void;
  getFullTranscript(): string;
  seal?(): string;
  hasPendingInterim?(): boolean;
  onTranscript(callback: (event: TranscriptEvent) => void): () => void;
  onError(callback: (err: SpeechError) => void): () => void;
  onStateChange(callback: (state: STTState) => void): () => void;
}

export interface TextToSpeech {
  readonly isSupported: boolean;
  readonly isSpeaking: boolean;
  speak(text: string, options?: TTSOptions): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  getVoices(): SpeechSynthesisVoice[];
  setVoice(voiceURI: string): void;
  setRate(rate: number): void;
  onStateChange(callback: (state: TTSState) => void): () => void;
}
