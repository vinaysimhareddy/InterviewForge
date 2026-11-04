/**
 * TranscriptAssembler: Pure, resilient multi-session transcript assembly engine.
 *
 * Requirements (§T2):
 * 1. Retains committed final segments across restarts.
 * 2. Manages active interim string.
 * 3. Supports recognizer restarts: a new recognizer session appends to committed text,
 *    never wiping mid-answer content.
 * 4. Deduplicates repeated final words across session boundaries using suffix-prefix overlap matching.
 * 5. Exposes getText() = committed + interim (guarantees zero dropped words on completion).
 * 6. seal(): flushes and commits any remaining interim into final text before turn submission.
 */

export interface TranscriptState {
  committedText: string;
  interimText: string;
  fullText: string;
  wordCount: number;
}

export class TranscriptAssembler {
  // Finalized text segments committed across sessions
  private committedSegments: string[] = [];

  // Current session's in-progress results keyed by session resultIndex
  private sessionFinals: Map<number, string> = new Map();
  private currentInterim: string = '';

  // Base offset from previous sessions to prevent index collision
  private sessionCount: number = 0;

  /**
   * Resets all history for a brand new interview question/turn.
   */
  public reset(): void {
    this.committedSegments = [];
    this.sessionFinals.clear();
    this.currentInterim = '';
    this.sessionCount = 0;
  }

  /**
   * Called when the recognizer restarts (e.g. after onend or provider failover).
   * Consolidates current session finals into committedSegments and clears session-local maps.
   */
  public handleSessionRestart(): void {
    this.sessionCount += 1;
    // Commit any session finals into committedSegments
    const sessionText = this.getSessionFinalsText();
    if (sessionText) {
      const deduplicated = this.deduplicateAgainstCommitted(sessionText);
      if (deduplicated) {
        this.committedSegments.push(deduplicated);
      }
    }
    this.sessionFinals.clear();
    // Do NOT wipe interim immediately unless a new interim replaces it
  }

  /**
   * Ingests a raw SpeechRecognition onresult event or parsed result chunk.
   *
   * @param resultIndex The event.resultIndex indicating where results changed.
   * @param results Array of result objects with isFinal and transcript.
   */
  public ingestResults(
    resultIndex: number,
    results: Array<{ isFinal: boolean; transcript: string }>
  ): TranscriptState {
    let newInterim = '';

    for (let i = resultIndex; i < results.length; i++) {
      const item = results[i];
      const text = (item.transcript || '').trim();
      if (!text) continue;

      if (item.isFinal) {
        this.sessionFinals.set(i, text);
      } else {
        newInterim = newInterim ? `${newInterim} ${text}` : text;
      }
    }

    this.currentInterim = newInterim.trim();
    return this.getState();
  }

  /**
   * Ingests a pre-parsed text chunk directly (useful for WebSocket STT or legacy events).
   */
  public appendChunk(text: string, isFinal: boolean, resultIndex?: number): TranscriptState {
    const cleaned = text.trim();
    if (!cleaned) return this.getState();

    if (isFinal) {
      this.currentInterim = '';
      const key = resultIndex !== undefined ? resultIndex : this.sessionFinals.size;
      this.sessionFinals.set(key, cleaned);
    } else {
      this.currentInterim = cleaned;
    }

    return this.getState();
  }

  /**
   * Ingests a pre-parsed text segment keyed by resultIndex (alias for appendChunk).
   */
  public appendSegment(resultIndex: number, text: string, isFinal: boolean): TranscriptState {
    return this.appendChunk(text, isFinal, resultIndex);
  }

  /**
   * Checks whether there is active interim text waiting to be committed.
   */
  public hasPendingInterim(): boolean {
    return Boolean(this.getInterimText().trim());
  }

  /**
   * Returns text finalized within the current recognizer session.
   */
  private getSessionFinalsText(): string {
    if (this.sessionFinals.size === 0) return '';
    const sortedKeys = Array.from(this.sessionFinals.keys()).sort((a, b) => a - b);
    return sortedKeys.map((k) => this.sessionFinals.get(k)!).join(' ').trim();
  }

  /**
   * Returns all committed text across all sessions and the current session's finalized items.
   */
  public getCommittedText(): string {
    const previous = this.committedSegments.join(' ').trim();
    const current = this.getSessionFinalsText();

    if (previous && current) {
      const dedupCurrent = this.deduplicateAgainstCommitted(current);
      return dedupCurrent ? `${previous} ${dedupCurrent}`.trim() : previous;
    }
    return previous || current;
  }

  /**
   * Returns current active interim text.
   */
  public getInterimText(): string {
    return this.currentInterim;
  }

  /**
   * Returns full text: committed + active interim.
   * Guarantees zero dropped words on intermediate inspection.
   */
  public getText(): string {
    const committed = this.getCommittedText();
    const interim = this.getInterimText();

    if (committed && interim) {
      return `${committed} ${interim}`.trim();
    }
    return committed || interim;
  }

  /**
   * Seals the answer before submission.
   * Flushes any remaining interim text into the committed history,
   * applying deduplication so no words are dropped into the void.
   */
  public seal(): string {
    if (this.currentInterim) {
      const interimToCommit = this.currentInterim;
      this.currentInterim = '';
      const key = this.sessionFinals.size + 1000;
      this.sessionFinals.set(key, interimToCommit);
    }

    // Consolidate everything into committedSegments
    const sessionText = this.getSessionFinalsText();
    if (sessionText) {
      const deduplicated = this.deduplicateAgainstCommitted(sessionText);
      if (deduplicated) {
        this.committedSegments.push(deduplicated);
      }
    }
    this.sessionFinals.clear();

    return this.getCommittedText();
  }

  /**
   * Returns current snapshot state.
   */
  public getState(): TranscriptState {
    const committedText = this.getCommittedText();
    const interimText = this.getInterimText();
    const fullText = this.getText();
    const wordCount = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;

    return {
      committedText,
      interimText,
      fullText,
      wordCount,
    };
  }

  /**
   * Suffix/prefix overlap deduplication algorithm.
   * Compares the end of existing committed text with the beginning of new text (up to 8 words).
   */
  public deduplicateAgainstCommitted(newText: string): string {
    if (this.committedSegments.length === 0) return newText;

    const lastCommitted = this.committedSegments[this.committedSegments.length - 1];
    const prevWords = lastCommitted.split(/\s+/).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const newWords = newText.split(/\s+/);
    const newWordsNormalized = newWords.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Check overlap from up to 8 words down to 1 word
    const maxLen = Math.min(prevWords.length, newWordsNormalized.length, 8);
    for (let len = maxLen; len >= 1; len--) {
      const suffix = prevWords.slice(-len).join(' ');
      const prefix = newWordsNormalized.slice(0, len).join(' ');
      if (suffix === prefix && suffix.length > 0) {
        // Overlap found: strip the repeated prefix from newWords
        const remainingTokens = newWords.slice(len);
        return remainingTokens.join(' ').trim();
      }
    }

    return newText;
  }
}

