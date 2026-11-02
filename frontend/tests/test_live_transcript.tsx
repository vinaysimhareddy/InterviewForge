import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { CandidateAnswerTranscript } from '../src/components/interview/CandidateAnswerTranscript';

describe('Q8: test_live_transcript.tsx - UI updates, finalization, auto-scroll, retry, accessibility', () => {
  const componentPath = path.resolve(
    __dirname,
    '../src/components/interview/CandidateAnswerTranscript.tsx'
  );
  const componentSource = fs.readFileSync(componentPath, 'utf-8');

  it('1. UI updates: renders live listening state, audio equalizer waveform, and dynamic speech status', () => {
    const html = renderToString(
      <CandidateAnswerTranscript
        transcript=""
        interimTranscript="I built REST APIs"
        isListening={true}
        isCandidateSpeaking={true}
        isAiSpeaking={false}
        isSubmitting={false}
        audioLevel={0.7}
        silenceProgress={0}
        isSpeechSupported={true}
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    expect(html).toContain('candidate-live-transcript');
    expect(html).toContain('Speaking');
    expect(html).toContain('I built REST APIs');
    // Audio equalizer waveform bars present
    expect(html).toContain('w-1 rounded-full');
  });

  it('2. Finalization: displays finalized text and streaming interim text with distinctive styling', () => {
    const html = renderToString(
      <CandidateAnswerTranscript
        transcript="We deployed a distributed Redis cluster"
        interimTranscript="for session caching and token validation"
        isListening={true}
        isCandidateSpeaking={true}
        isAiSpeaking={false}
        isSubmitting={false}
        audioLevel={0.4}
        silenceProgress={0}
        isSpeechSupported={true}
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    // Finalized text in solid foreground
    expect(html).toContain('We deployed a distributed Redis cluster');
    // Interim text marked in italic with styling
    expect(html).toContain('for session caching and token validation');
    expect(html).toContain('text-muted-foreground italic');
    // Metrics badge counting total words
    expect(html).toContain('words');
    expect(html).toContain('11');
  });

  it('3. Auto-scroll: verifies scroll container and programmatic scrolling implementation', () => {
    // Structural DOM checks
    expect(componentSource).toContain('ref={scrollRef}');
    expect(componentSource).toContain('scrollRef.current.scrollTop = scrollRef.current.scrollHeight');
    expect(componentSource).toContain('overflow-y-auto');
    expect(componentSource).toContain('data-testid="live-transcript-container"');
  });

  it('4. Retry: provides functional Clear & Retry button and reset lifecycle', () => {
    const html = renderToString(
      <CandidateAnswerTranscript
        transcript="Initial partial answer"
        interimTranscript=""
        isListening={true}
        isCandidateSpeaking={false}
        isAiSpeaking={false}
        isSubmitting={false}
        audioLevel={0}
        silenceProgress={0}
        isSpeechSupported={true}
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    expect(html).toContain('Clear &amp; Retry');
    expect(componentSource).toContain('onClearAndRetry');
    expect(componentSource).toContain('onClick={handleClear}');
    expect(componentSource).toContain('data-testid="clear-transcript-button"');
  });

  it('5. Accessibility: adheres to WCAG accessibility with aria-live, roles, and accessible labels', () => {
    const html = renderToString(
      <CandidateAnswerTranscript
        transcript="Audited accessibility compliance test"
        interimTranscript=""
        isListening={true}
        isCandidateSpeaking={false}
        isAiSpeaking={false}
        isSubmitting={false}
        audioLevel={0.2}
        silenceProgress={0}
        isSpeechSupported={true}
        onSubmit={() => {}}
        onClearAndRetry={() => {}}
      />
    );

    // ARIA live region for real-time speech announcement
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Live candidate answer transcript"');

    // Button accessible names
    expect(html).toContain('aria-label="Clear answer transcript and retry"');
    expect(html).toContain('aria-label="Submit recorded answer now"');
  });
});
