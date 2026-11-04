import { describe, expect, it } from 'vitest';
import { TranscriptAssembler } from '../src/services/speech/transcriptAssembler';

describe('T2: TranscriptAssembler Unit Tests', () => {
  it('initializes with empty text and zero words', () => {
    const assembler = new TranscriptAssembler();
    expect(assembler.getText()).toBe('');
    expect(assembler.getCommittedText()).toBe('');
    expect(assembler.getInterimText()).toBe('');
    expect(assembler.getState().wordCount).toBe(0);
  });

  it('accumulates interim results and exposes them via getText()', () => {
    const assembler = new TranscriptAssembler();

    assembler.ingestResults(0, [
      { isFinal: false, transcript: 'To guarantee' },
    ]);
    expect(assembler.getInterimText()).toBe('To guarantee');
    expect(assembler.getCommittedText()).toBe('');
    expect(assembler.getText()).toBe('To guarantee');
    expect(assembler.getState().wordCount).toBe(2);

    assembler.ingestResults(0, [
      { isFinal: false, transcript: 'To guarantee distributed idempotency' },
    ]);
    expect(assembler.getText()).toBe('To guarantee distributed idempotency');
    expect(assembler.getState().wordCount).toBe(4);
  });

  it('transitions interim to final and clears interim correctly', () => {
    const assembler = new TranscriptAssembler();

    // Interim arrives
    assembler.ingestResults(0, [
      { isFinal: false, transcript: 'In React reconciliation' },
    ]);
    expect(assembler.getText()).toBe('In React reconciliation');

    // Finalizes index 0
    assembler.ingestResults(0, [
      { isFinal: true, transcript: 'In React reconciliation' },
    ]);
    expect(assembler.getCommittedText()).toBe('In React reconciliation');
    expect(assembler.getInterimText()).toBe('');
    expect(assembler.getText()).toBe('In React reconciliation');

    // Index 1 arrives as interim
    assembler.ingestResults(1, [
      { isFinal: true, transcript: 'In React reconciliation' },
      { isFinal: false, transcript: 'compares virtual DOM trees' },
    ]);
    expect(assembler.getCommittedText()).toBe('In React reconciliation');
    expect(assembler.getInterimText()).toBe('compares virtual DOM trees');
    expect(assembler.getText()).toBe('In React reconciliation compares virtual DOM trees');
    expect(assembler.getState().wordCount).toBe(7);
  });

  it('handles recognizer restart seamlessly without dropping committed text', () => {
    const assembler = new TranscriptAssembler();

    // Session 1: candidate speaks first clause and it becomes final
    assembler.ingestResults(0, [
      { isFinal: true, transcript: 'Circuit breakers prevent cascading failures' },
    ]);
    expect(assembler.getText()).toBe('Circuit breakers prevent cascading failures');

    // Chrome fires onend and restarts -> handleSessionRestart()
    assembler.handleSessionRestart();

    // Session 2 starts: index resets to 0!
    assembler.ingestResults(0, [
      { isFinal: false, transcript: 'in microservices by intercepting failing endpoints' },
    ]);

    // Crucial invariant: Session 1 text is preserved, and Session 2 text is appended!
    expect(assembler.getText()).toBe(
      'Circuit breakers prevent cascading failures in microservices by intercepting failing endpoints'
    );

    // Session 2 finalizes
    assembler.ingestResults(0, [
      { isFinal: true, transcript: 'in microservices by intercepting failing endpoints' },
    ]);
    expect(assembler.getText()).toBe(
      'Circuit breakers prevent cascading failures in microservices by intercepting failing endpoints'
    );
  });

  it('deduplicates repeated final words across session restarts', () => {
    const assembler = new TranscriptAssembler();

    // Session 1 commits
    assembler.appendChunk('We protect public REST endpoints by validating JWT', true);
    assembler.handleSessionRestart();

    // Session 2 repeats "validating JWT" as prefix before continuing
    assembler.appendChunk('validating JWT tokens on incoming requests and throttling traffic', true);

    // Overlap on "validating JWT" must be cleanly stripped
    expect(assembler.getCommittedText()).toBe(
      'We protect public REST endpoints by validating JWT tokens on incoming requests and throttling traffic'
    );
  });

  it('seal() commits unfinalized interim text so zero words are lost upon submission', () => {
    const assembler = new TranscriptAssembler();

    // First part is final
    assembler.appendChunk('The CAP theorem forces distributed databases', true);

    // Second part is still in interim when candidate pauses and answer seals!
    assembler.appendChunk('to choose between consistency and availability', false);

    expect(assembler.getCommittedText()).toBe('The CAP theorem forces distributed databases');
    expect(assembler.getInterimText()).toBe('to choose between consistency and availability');

    // Seal called by triggerAnswerCompletion
    const sealedAnswer = assembler.seal();

    // All words must be present in the sealed output
    expect(sealedAnswer).toBe(
      'The CAP theorem forces distributed databases to choose between consistency and availability'
    );
    expect(assembler.getInterimText()).toBe('');
  });

  it('handles appendChunk with resultIndex ordering', () => {
    const assembler = new TranscriptAssembler();

    assembler.appendChunk('Kafka achieves', true, 0);
    assembler.appendChunk('high throughput', true, 1);
    assembler.appendChunk('through partition parallelism', false);

    expect(assembler.getText()).toBe('Kafka achieves high throughput through partition parallelism');
  });

  it('reset() completely clears all history for the next question turn', () => {
    const assembler = new TranscriptAssembler();
    assembler.appendChunk('Some previous turn text', true);
    expect(assembler.getText()).toBe('Some previous turn text');

    assembler.reset();
    expect(assembler.getText()).toBe('');
    expect(assembler.getCommittedText()).toBe('');
    expect(assembler.getInterimText()).toBe('');
    expect(assembler.getState().wordCount).toBe(0);
  });
});

