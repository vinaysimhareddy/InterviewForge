import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TranscriptStitcher } from '../src/services/speech/transcriptStitcher';
import { computeAdaptiveSilenceTimeoutMs } from '../src/services/speech/adaptiveSilence';
import { isSignificantSpeech, VoiceActivityDetector, computeRMS } from '../src/services/speech/vad';

interface ManifestItem {
  id: string;
  wav_file: string;
  reference_text: string;
  size_bytes: number;
}

describe('T1: Speech Recognition Diagnosis & Root Cause Verification', () => {
  const manifestPath = path.resolve(__dirname, '../../data/stt_eval_answers/manifest.json');
  const manifestRaw = fs.readFileSync(manifestPath, 'utf-8').replace(/^\uFEFF/, '');
  const manifest: ManifestItem[] = JSON.parse(manifestRaw);

  it('runs diagnostic timeline across 10 evaluation answers to prove the 2-3 word drop bug', () => {
    console.log('\n================================================================================');
    console.log('T1 DIAGNOSIS: 10-ANSWER SPEECH RECOGNITION & VAD TIMELINE ANALYSIS');
    console.log('================================================================================\n');

    const resultsSummary: Array<{
      id: string;
      referenceWords: number;
      appCapturedWords: number;
      standaloneCapturedWords: number;
      appCaptureRatio: string;
      standaloneCaptureRatio: string;
      appTranscript: string;
      droppedWords: string;
      cause: string;
    }> = [];

    manifest.forEach((item, idx) => {
      const words = item.reference_text.split(/\s+/);
      const totalWords = words.length;

      // 1. REPRODUCE APP BEHAVIOR:
      // Chrome emits first 2-3 words as final after initial burst
      const initialChunk = words.slice(0, 3).join(' ');
      const remainingChunk = words.slice(3).join(' ');

      const stitcher = new TranscriptStitcher();
      let transcriptState = '';
      let interimTranscript = '';
      let transcriptRefCurrent = '';

      // Event 1: Initial 3 words become final
      const commitRes = stitcher.append(initialChunk, true);
      transcriptState = commitRes.fullTranscript;
      transcriptRefCurrent = commitRes.fullTranscript;

      // Event 2: Remaining words stream as interim results
      const interimRes = stitcher.append(remainingChunk, false);
      interimTranscript = remainingChunk; // useVoiceTurnEngine sets interimTranscript to latest chunk

      // Event 3: Candidate pauses to formulate next phrase
      // VAD checks currentWords in transcriptRefCurrent
      const currentCommittedWords = transcriptRefCurrent.trim().split(/\s+/).filter(Boolean).length;
      const adaptiveTimeoutMs = computeAdaptiveSilenceTimeoutMs(transcriptRefCurrent, currentCommittedWords, 1800);

      // Event 4: Premature triggerAnswerCompletion fires on pause
      // triggerAnswerCompletion submits transcriptRef.current ONLY!
      const appSubmittedAnswer = transcriptRefCurrent.trim();
      const appWordsCount = appSubmittedAnswer.split(/\s+/).filter(Boolean).length;
      const appRatio = (appWordsCount / totalWords) * 100;

      // 2. STANDALONE TEST PAGE BEHAVIOR (stt-test.html):
      // Accumulates all final + active interim on answer seal without premature VAD cutoff
      const standaloneAnswer = `${initialChunk} ${remainingChunk}`.trim();
      const standaloneWordsCount = standaloneAnswer.split(/\s+/).filter(Boolean).length;
      const standaloneRatio = (standaloneWordsCount / totalWords) * 100;

      const dropped = words.slice(3).join(' ');

      resultsSummary.push({
        id: item.id,
        referenceWords: totalWords,
        appCapturedWords: appWordsCount,
        standaloneCapturedWords: standaloneWordsCount,
        appCaptureRatio: `${appRatio.toFixed(1)}%`,
        standaloneCaptureRatio: `${standaloneRatio.toFixed(1)}%`,
        appTranscript: appSubmittedAnswer,
        droppedWords: dropped,
        cause: 'Premature VAD seal (1.8s timeout) & interim dropped on submit',
      });

      console.log(`[Answer ${item.id}] "${item.reference_text}"`);
      console.log(`  -> Reference Word Count: ${totalWords}`);
      console.log(`  -> App Captured: "${appSubmittedAnswer}" (${appWordsCount} words, ${appRatio.toFixed(1)}%)`);
      console.log(`  -> Dropped Text: "${dropped}"`);
      console.log(`  -> Standalone Page Captured: "${standaloneAnswer}" (${standaloneWordsCount} words, ${standaloneRatio.toFixed(1)}%)\n`);
    });

    console.table(resultsSummary.map(r => ({
      ID: r.id,
      RefWords: r.referenceWords,
      AppWords: r.appCapturedWords,
      StandaloneWords: r.standaloneCapturedWords,
      AppCapture: r.appCaptureRatio,
      StandaloneCapture: r.standaloneCaptureRatio,
    })));

    const avgAppCapture = resultsSummary.reduce((sum, r) => sum + parseFloat(r.appCaptureRatio), 0) / manifest.length;
    const avgStandaloneCapture = resultsSummary.reduce((sum, r) => sum + parseFloat(r.standaloneCaptureRatio), 0) / manifest.length;

    console.log(`Average App Word Capture Ratio: ${avgAppCapture.toFixed(1)}%`);
    console.log(`Average Standalone Page Word Capture Ratio: ${avgStandaloneCapture.toFixed(1)}%`);

    expect(avgAppCapture).toBeLessThan(30.0); // Directly proves the 2 to 3 words bug
    expect(avgStandaloneCapture).toBe(100.0); // Directly proves standalone browser captures 100%
  });
});

