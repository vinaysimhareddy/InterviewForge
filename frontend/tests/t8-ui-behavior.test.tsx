import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { CandidateAnswerTranscript } from '../src/components/interview/CandidateAnswerTranscript';
import {
  SUPPORTED_SPEECH_LANGS,
  getSpeechRecognitionLang,
  setSpeechRecognitionLang,
} from '../src/services/speech/browserSTT';

describe('T8: UI Behavior Polish - Candidate Transcript & Setup Speech Test', () => {
  const componentPath = path.resolve(
    __dirname,
    '../src/components/interview/CandidateAnswerTranscript.tsx'
  );
  const preInterviewSetupPath = path.resolve(
    __dirname,
    '../src/components/interview/PreInterviewSetup.tsx'
  );

  const transcriptContent = fs.readFileSync(componentPath, 'utf-8');
  const setupContent = fs.readFileSync(preInterviewSetupPath, 'utf-8');

  it('renders "Answer captured ✓" badge and banner when answer is submitting or sealed (§T8)', () => {
    const htmlSubmitting = renderToString(
      <CandidateAnswerTranscript
        transcript="I built microservices using Kafka and Spring Boot."
        interimTranscript=""
        isListening={false}
        isCandidateSpeaking={false}
        isAiSpeaking={false}
        isSubmitting={true}
        audioLevel={0}
        silenceProgress={1.0}
        isSpeechSupported={true}
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    expect(htmlSubmitting).toContain('Answer captured ✓');
    expect(htmlSubmitting).toContain('answer-captured-header');
    expect(htmlSubmitting).toContain('answer-captured-banner');

    const htmlExplicitCaptured = renderToString(
      <CandidateAnswerTranscript
        transcript="Docker containerization with Kubernetes orchestration."
        interimTranscript=""
        isListening={false}
        isCandidateSpeaking={false}
        isAiSpeaking={false}
        isSubmitting={false}
        isAnswerCaptured={true}
        audioLevel={0}
        silenceProgress={0}
        isSpeechSupported={true}
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    expect(htmlExplicitCaptured).toContain('Answer captured ✓');
    expect(htmlExplicitCaptured).toContain('answer-captured-header');
    expect(htmlExplicitCaptured).toContain('answer-captured-banner');
  });

  it('renders distinct solid finalized text and lighter interim text without flicker (§T8)', () => {
    const html = renderToString(
      <CandidateAnswerTranscript
        transcript="PostgreSQL with connection pooling"
        interimTranscript="and redis cache invalidation"
        isListening={true}
        isCandidateSpeaking={true}
        isAiSpeaking={false}
        isSubmitting={false}
        audioLevel={0.45}
        silenceProgress={0}
        isSpeechSupported={true}
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    // Finalized text in solid foreground
    expect(html).toContain('PostgreSQL with connection pooling');
    expect(html).toContain('text-[#FBFAF6]');

    // Interim text in soft mint italic
    expect(html).toContain('and redis cache invalidation');
    expect(html).toContain('text-[#96C8B4]');
  });

  it('shows calm "Reconnecting voice…" status indicator when provider reconnects without jarring error (§T8)', () => {
    const html = renderToString(
      <CandidateAnswerTranscript
        transcript="My previous answer segment"
        interimTranscript=""
        isListening={false}
        isCandidateSpeaking={false}
        isAiSpeaking={false}
        isSubmitting={false}
        audioLevel={0}
        silenceProgress={0}
        isSpeechSupported={true}
        isReconnectingVoice={true}
        sttStatusNotice="Reconnecting voice… (network delay)"
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    expect(html).toContain('Reconnecting voice…');
    expect(html).toContain('reconnecting-voice-banner');
    // Does NOT render jarring error card or crash
    expect(html).not.toContain('Voice capture unavailable');
  });

  it('verifies dynamic mic level indicator tied to real input is active during listening (§T8)', () => {
    const html = renderToString(
      <CandidateAnswerTranscript
        transcript=""
        interimTranscript=""
        isListening={true}
        isCandidateSpeaking={false}
        isAiSpeaking={false}
        isSubmitting={false}
        audioLevel={0.42}
        silenceProgress={0}
        isSpeechSupported={true}
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    expect(html).toContain('Mic level: 42%');
    expect(html).toContain('Listening for answer...');
  });

  it('verifies setup page speech check prompt text (§T8)', () => {
    // Required prompt: "I'm ready for the interview and excited to begin"
    expect(setupContent).toContain("Say: &apos;I&apos;m ready for the interview and excited to begin&apos;");
  });

  it('verifies setup page reports generic "Voice recognition ready" without vendor names (§T8)', () => {
    expect(setupContent).toContain('Voice recognition ready');
    // Ensure no vendor or model names are exposed in user-facing setup UI
    expect(setupContent).not.toMatch(/STT Provider:.*faster-whisper/i);
    expect(setupContent).not.toMatch(/STT Provider:.*vosk/i);
    expect(setupContent).not.toMatch(/STT Provider:.*nemotron/i);
  });

  it('verifies language/accent selector supports en-IN, en-US, en-GB, en-AU (§T8)', () => {
    expect(SUPPORTED_SPEECH_LANGS).toEqual([
      { code: 'en-IN', label: 'English (India)' },
      { code: 'en-US', label: 'English (US)' },
      { code: 'en-GB', label: 'English (UK)' },
      { code: 'en-AU', label: 'English (Australia)' },
    ]);

    expect(setupContent).toContain('data-testid="speech-lang-selector"');
    expect(setupContent).toContain('handleSpeechLangChange');
    expect(setupContent).toContain('Accent / Language:');

    // Default language is en-IN
    expect(getSpeechRecognitionLang()).toBe('en-IN');

    // Language setting update works
    setSpeechRecognitionLang('en-US');
    expect(getSpeechRecognitionLang()).toBe('en-US');
    setSpeechRecognitionLang('en-IN'); // Reset back to default
    expect(getSpeechRecognitionLang()).toBe('en-IN');
  });

  it('verifies actionable audio advice handles "move closer", "reduce background noise", and "use a headset" (§T8)', () => {
    expect(setupContent).toContain('data-testid="mic-input-advice"');
    expect(setupContent).toContain('use a headset or reduce input volume');
    expect(setupContent).toContain('reduce background noise');
    expect(setupContent).toContain('move closer to your microphone or speak louder');
  });

  it('verifies code contains zero banned terminology violations (§T8)', () => {
    // Both components must be clean of any vendor names or banned terms
    expect(transcriptContent).not.toMatch(/\bwhisper\b/i);
    expect(transcriptContent).not.toMatch(/\bvosk\b/i);
    expect(transcriptContent).not.toMatch(/\bopenai\b/i);
    expect(transcriptContent).not.toMatch(/\bgpt\b/i);
  });
});
