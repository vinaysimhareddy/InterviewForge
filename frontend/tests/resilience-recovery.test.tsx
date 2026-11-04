import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';
import { CandidateAnswerTranscript } from '../src/components/interview/CandidateAnswerTranscript';

describe('PR7: Error Handling & Resilience Verification', () => {
  describe('ErrorBoundary Component Resilience', () => {
    it('renders children under normal execution', () => {
      const html = renderToString(
        <ErrorBoundary fallbackTitle="Interview Stage Recovery">
          <div data-testid="child-healthy">Healthy Content</div>
        </ErrorBoundary>
      );
      expect(html).toContain('child-healthy');
      expect(html).toContain('Healthy Content');
      expect(html).not.toContain('error-boundary-recovery-card');
    });

    it('renders friendly recovery card with Reload and Return to Dashboard buttons when error state is active', () => {
      const boundary = new ErrorBoundary({
        fallbackTitle: 'Interview Stage Recovery',
        children: <div>Child</div>,
      });
      boundary.state = {
        hasError: true,
        error: new Error('Simulated critical render crash in interview view'),
      };

      const html = renderToString(boundary.render() as React.ReactElement);

      expect(html).toContain('error-boundary-recovery-card');
      expect(html).toContain('Interview Stage Recovery');
      expect(html).toContain('Simulated critical render crash in interview view');
      expect(html).toContain('error-boundary-reload-button');
      expect(html).toContain('Reload Page');
      expect(html).toContain('error-boundary-try-again');
      expect(html).toContain('Try Again');
      expect(html).toContain('error-boundary-dashboard-button');
      expect(html).toContain('Return to Dashboard');
    });
  });

  describe('CandidateAnswerTranscript Microphone Error & Graceful Recovery', () => {
    it('displays actionable recovery buttons (Reconnect microphone, Retry turn, Continue with typed answers) on mic failure', () => {
      const html = renderToString(
        <CandidateAnswerTranscript
          transcript=""
          interimTranscript=""
          isListening={true}
          isCandidateSpeaking={false}
          isAiSpeaking={false}
          isSubmitting={false}
          audioLevel={0}
          silenceProgress={0}
          isSpeechSupported={true}
          sttError={{
            kind: 'not-allowed',
            title: 'Microphone Permission Revoked',
            explanation: 'Microphone access was denied or revoked by the browser.',
            recoveryStep: 'Click Reconnect microphone or Continue with typed answers.',
            retryable: true,
          }}
          onSubmit={() => {}}
          onClearAndRetry={() => {}}
          onRetryMic={() => {}}
        />
      );

      // Verify actionable error banner is rendered
      expect(html).toContain('stt-actionable-error-banner');
      expect(html).toContain('Microphone Permission Revoked');

      // Action 1: Reconnect microphone
      expect(html).toContain('reconnect-microphone-button');
      expect(html).toContain('Reconnect microphone');

      // Action 2: Retry turn
      expect(html).toContain('retry-turn-button');
      expect(html).toContain('Retry turn');

      // Action 3: Continue with typed answers
      expect(html).toContain('continue-with-typed-answers-button');
      expect(html).toContain('Continue with typed answers');
    });
  });

  describe('Session Resumption & Error Boundary Integration in Source Code', () => {
    it('verifies InterviewRoom imports ErrorBoundary and wraps terminal review screens', () => {
      const interviewRoomPath = path.resolve(__dirname, '../src/components/interview/InterviewRoom.tsx');
      const content = fs.readFileSync(interviewRoomPath, 'utf-8');

      expect(content).toContain("import { ErrorBoundary } from '@/components/common/ErrorBoundary'");
      expect(content).toContain('<ErrorBoundary fallbackTitle="Interview Review Screen Error">');
      expect(content).toContain('<ErrorBoundary fallbackTitle="Scorecard Render Error">');
      expect(content).toContain("if (res.status === 'COMPLETED' || res.final_report)");
      expect(content).toContain("if (res.status === 'ABORTED')");
    });

    it('verifies App.tsx wraps interview route in ErrorBoundary', () => {
      const appPath = path.resolve(__dirname, '../src/App.tsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      expect(content).toContain('<ErrorBoundary fallbackTitle="Interview Stage Error">');
    });
  });
});
