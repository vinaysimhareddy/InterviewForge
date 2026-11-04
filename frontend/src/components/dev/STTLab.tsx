import React, { useState, useEffect, useRef } from 'react';
import { CURATED_STT_SCRIPT, CuratedScriptItem } from '../../services/speech/sttCuratedScript';
import { WavAudioRecorder, createMediaStreamFromWavBlob } from '../../services/speech/wavRecorder';
import { saveLabRecording, getLabRecording, listLabRecordings } from '../../services/speech/sttStorage';
import { computeWER, computeWordDiff, computeTechTermAccuracy, WERMetrics, DiffToken, TechTermMetrics } from '../../services/speech/sttMetrics';
import { BrowserSpeechToText } from '../../services/speech/browserSTT';
import { Mic, Square, Play, RotateCcw, Award, CheckCircle2, XCircle, Clock, Volume2, Database, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';

export const STTLab: React.FC = () => {
  const [selectedScriptId, setSelectedScriptId] = useState<string>('ans_short_01');
  const [filterCategory, setFilterCategory] = useState<'all' | 'short' | 'long'>('all');
  const [recordedMap, setRecordedMap] = useState<Record<string, boolean>>({});

  // Audio capture state
  const [isRecordingMic, setIsRecordingMic] = useState<boolean>(false);
  const [micAudioLevel, setMicAudioLevel] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  // Live STT state
  const [isSTTRunning, setIsSTTRunning] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [interimChunk, setInterimChunk] = useState<string>('');

  // Timing waterfall
  const [firstInterimLatency, setFirstInterimLatency] = useState<number | null>(null);
  const [finalCommitLatency, setFinalCommitLatency] = useState<number | null>(null);

  // Results & Metrics
  const [metrics, setMetrics] = useState<WERMetrics | null>(null);
  const [diffTokens, setDiffTokens] = useState<DiffToken[]>([]);
  const [techMetrics, setTechMetrics] = useState<TechTermMetrics | null>(null);

  // References
  const recorderRef = useRef<WavAudioRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sttRef = useRef<BrowserSpeechToText | null>(null);
  const audioPlaybackRef = useRef<{ stop: () => void } | null>(null);

  const selectedItem: CuratedScriptItem =
    CURATED_STT_SCRIPT.find((item) => item.id === selectedScriptId) || CURATED_STT_SCRIPT[0];

  // Load existing recordings list
  useEffect(() => {
    void refreshRecordingsList();
  }, []);

  // When selected script changes, load corresponding recorded audio if present
  useEffect(() => {
    let active = true;
    setLiveTranscript('');
    setInterimChunk('');
    setMetrics(null);
    setDiffTokens([]);
    setTechMetrics(null);
    setFirstInterimLatency(null);
    setFinalCommitLatency(null);

    void getLabRecording(selectedItem.id).then((blob) => {
      if (!active) return;
      if (blob) {
        setRecordedBlob(blob);
        setRecordedAudioUrl(URL.createObjectURL(blob));
      } else {
        setRecordedBlob(null);
        setRecordedAudioUrl(null);
      }
    });

    return () => {
      active = false;
      if (audioPlaybackRef.current) {
        audioPlaybackRef.current.stop();
        audioPlaybackRef.current = null;
      }
    };
  }, [selectedItem.id]);

  const refreshRecordingsList = async () => {
    const keys = await listLabRecordings();
    const map: Record<string, boolean> = {};
    keys.forEach((k) => (map[k] = true));
    setRecordedMap(map);
  };

  // Start live microphone recording
  const handleStartMicRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;

      const recorder = new WavAudioRecorder();
      recorderRef.current = recorder;
      recorder.start(stream);
      setIsRecordingMic(true);

      const interval = setInterval(() => {
        if (recorderRef.current && recorderRef.current.recording) {
          setMicAudioLevel(recorderRef.current.volumeLevel);
        } else {
          clearInterval(interval);
        }
      }, 50);
    } catch (err) {
      console.error('Failed to access microphone:', err);
      alert('Could not access microphone for STT Lab.');
    }
  };

  // Stop recording and save to IndexedDB
  const handleStopMicRecording = async () => {
    if (!recorderRef.current) return;
    setIsRecordingMic(false);
    setMicAudioLevel(0);

    const wavBlob = await recorderRef.current.stop();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    setRecordedBlob(wavBlob);
    const url = URL.createObjectURL(wavBlob);
    setRecordedAudioUrl(url);

    await saveLabRecording(selectedItem.id, wavBlob);
    await refreshRecordingsList();
  };

  // Run STT live from mic or replayed audio
  const handleRunSTT = async (source: 'live_mic' | 'recorded_audio') => {
    setIsSTTRunning(true);
    setLiveTranscript('');
    setInterimChunk('');
    setMetrics(null);
    setDiffTokens([]);
    setTechMetrics(null);

    const tStart = performance.now();
    let firstInterimCaptured = false;

    const stt = new BrowserSpeechToText();
    sttRef.current = stt;

    let mediaPlayback: { stream: MediaStream; stop: () => void } | null = null;

    if (source === 'recorded_audio' && recordedBlob) {
      mediaPlayback = await createMediaStreamFromWavBlob(recordedBlob);
      audioPlaybackRef.current = mediaPlayback;
    }

    stt.onTranscript((event) => {
      const now = performance.now();
      if (!firstInterimCaptured && event.text.trim()) {
        firstInterimCaptured = true;
        setFirstInterimLatency(Math.round(now - tStart));
      }

      if (event.isFinal) {
        setLiveTranscript(event.fullTranscript);
        setInterimChunk('');
        setFinalCommitLatency(Math.round(now - tStart));

        // Evaluate metrics on final text
        const werRes = computeWER(selectedItem.referenceText, event.fullTranscript);
        const diffs = computeWordDiff(selectedItem.referenceText, event.fullTranscript);
        const tech = computeTechTermAccuracy(selectedItem.technicalTerms, event.fullTranscript);

        setMetrics(werRes);
        setDiffTokens(diffs);
        setTechMetrics(tech);
      } else {
        setLiveTranscript(event.fullTranscript);
        setInterimChunk(event.text);
      }
    });

    stt.start();
  };

  const handleStopSTT = () => {
    if (sttRef.current) {
      const sealed = sttRef.current.seal();
      sttRef.current.stop();
      sttRef.current = null;
      setIsSTTRunning(false);

      if (audioPlaybackRef.current) {
        audioPlaybackRef.current.stop();
        audioPlaybackRef.current = null;
      }

      const finalHyp = sealed || liveTranscript;
      setLiveTranscript(finalHyp);
      setInterimChunk('');

      const werRes = computeWER(selectedItem.referenceText, finalHyp);
      const diffs = computeWordDiff(selectedItem.referenceText, finalHyp);
      const tech = computeTechTermAccuracy(selectedItem.technicalTerms, finalHyp);

      setMetrics(werRes);
      setDiffTokens(diffs);
      setTechMetrics(tech);
    }
  };

  const filteredItems = CURATED_STT_SCRIPT.filter((item) => {
    if (filterCategory === 'short') return item.category === 'short';
    if (filterCategory === 'long') return item.category === 'long';
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-card-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-display font-bold text-text">
              Speech-to-Text Benchmark Lab
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mint text-primary font-bold uppercase tracking-wider">
              Step T3
            </span>
          </div>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Local 16 kHz WAV recording harness, curated 20-answer technical test script, and deterministic replay evaluator.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={filterCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterCategory('all')}
            className="text-xs"
          >
            All (20)
          </Button>
          <Button
            variant={filterCategory === 'short' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterCategory('short')}
            className="text-xs"
          >
            Short ≤ 15s (10)
          </Button>
          <Button
            variant={filterCategory === 'long' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterCategory('long')}
            className="text-xs"
          >
            Long 45-90s (10)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left Column: Script Selector */}
        <div className="lg:col-span-4 bg-card border border-card-border rounded-xl p-4 flex flex-col h-[750px]">
          <h2 className="text-xs font-mono font-semibold text-text-muted uppercase tracking-wider mb-3">
            Curated Answers ({filteredItems.length})
          </h2>
          <div className="overflow-y-auto space-y-2 pr-1 flex-1">
            {filteredItems.map((item, idx) => {
              const isSelected = item.id === selectedItem.id;
              const hasRecording = recordedMap[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedScriptId(item.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all text-xs cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 border-primary/40 text-text font-medium shadow-sm'
                      : 'bg-bg/40 border-card-border/60 hover:bg-bg/80 text-text-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[11px] font-bold text-primary">
                      #{idx + 1} {item.id}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {hasRecording ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          <Database className="w-2.5 h-2.5" /> Saved
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-muted/60">No WAV</span>
                      )}
                      <span className="text-[10px] font-mono bg-card-border/60 px-1.5 py-0.5 rounded text-text-muted">
                        ~{item.expectedDurationSec}s
                      </span>
                    </div>
                  </div>
                  <div className="line-clamp-2 text-text text-[11px] leading-relaxed">
                    {item.title}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.technicalTerms.slice(0, 3).map((term) => (
                      <span
                        key={term}
                        className="text-[9px] font-mono px-1 py-0.2 bg-mint/50 text-primary rounded"
                      >
                        {term}
                      </span>
                    ))}
                    {item.technicalTerms.length > 3 && (
                      <span className="text-[9px] font-mono text-text-muted">
                        +{item.technicalTerms.length - 3}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Recording, Replay & Evaluation View */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Reference Script Card */}
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-card-border">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold">
                  {selectedItem.category.toUpperCase()} ANSWER ({selectedItem.expectedDurationSec}s target)
                </span>
                <h3 className="text-base font-semibold text-text mt-0.5">{selectedItem.title}</h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
                <span>{selectedItem.referenceText.split(/\s+/).length} words</span>
              </div>
            </div>

            <div className="p-3 bg-bg/60 border border-card-border/60 rounded-lg text-xs leading-relaxed text-text font-serif">
              "{selectedItem.referenceText}"
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="text-[11px] text-text-muted font-mono">Technical Keywords:</span>
              {selectedItem.technicalTerms.map((term) => (
                <span
                  key={term}
                  className="text-[10px] font-mono px-2 py-0.5 bg-mint/60 text-primary border border-primary/20 rounded-full font-medium"
                >
                  {term}
                </span>
              ))}
            </div>
          </div>

          {/* Audio Capture & Replay Console */}
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-mono font-semibold text-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-primary" /> Audio Capture & Deterministic Replay
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mic Recording Box */}
              <div className="p-4 bg-bg/50 border border-card-border rounded-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-2 font-medium">
                    <span>1. Record from Candidate Mic (16 kHz Mono)</span>
                    {isRecordingMic && (
                      <span className="flex items-center gap-1.5 text-red-500 font-mono text-[11px] animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> REC
                      </span>
                    )}
                  </div>
                  {/* VU Level Meter */}
                  <div className="w-full bg-card-border h-2 rounded-full overflow-hidden mb-3">
                    <div
                      className="bg-primary h-full transition-all duration-75"
                      style={{ width: `${Math.min(100, micAudioLevel * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  {!isRecordingMic ? (
                    <Button
                      size="sm"
                      onClick={handleStartMicRecording}
                      disabled={isSTTRunning}
                      className="gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5" /> Start Recording
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleStopMicRecording}
                      className="gap-1.5 text-xs cursor-pointer animate-pulse"
                    >
                      <Square className="w-3.5 h-3.5" /> Stop & Save WAV
                    </Button>
                  )}
                </div>
              </div>

              {/* Stored Audio Replay Box */}
              <div className="p-4 bg-bg/50 border border-card-border rounded-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-2 font-medium">
                    <span>2. Stored WAV Audio ({recordedBlob ? `${(recordedBlob.size / 1024).toFixed(1)} KB` : 'None'})</span>
                    {recordedBlob && (
                      <span className="text-[10px] text-emerald-400 font-mono">16000 Hz Mono PCM</span>
                    )}
                  </div>
                  {recordedAudioUrl ? (
                    <audio src={recordedAudioUrl} controls className="w-full h-8 mb-2" />
                  ) : (
                    <div className="h-8 flex items-center justify-center text-xs text-text-muted/60 bg-card/60 rounded border border-card-border/40">
                      No recording saved yet for this answer
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRunSTT('recorded_audio')}
                    disabled={!recordedBlob || isSTTRunning}
                    className="gap-1.5 text-xs cursor-pointer border-card-border hover:border-primary"
                  >
                    <Play className="w-3.5 h-3.5 text-primary" /> Replay WAV through STT
                  </Button>
                  {isSTTRunning && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleStopSTT}
                      className="text-xs text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                    >
                      Seal & Stop
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Live Transcript & Alignment View */}
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-card-border">
              <h3 className="text-xs font-mono font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Live Transcription Stream & Diff Alignment
              </h3>
              {isSTTRunning && (
                <span className="inline-flex items-center gap-1.5 text-xs text-primary font-mono animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-primary" /> Listening & Assembling...
                </span>
              )}
            </div>

            {/* Live streaming text view */}
            <div className="p-4 bg-bg/80 border border-card-border rounded-lg min-h-[90px] text-xs leading-relaxed">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-card-border/40 text-[11px] font-mono text-text-muted">
                <span>Transcript Accumulator</span>
                {liveTranscript && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLiveTranscript('');
                      setInterimChunk('');
                      setMetrics(null);
                      setDiffTokens([]);
                      setTechMetrics(null);
                    }}
                    className="h-6 px-1.5 text-[10px] text-text-muted hover:text-text gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </Button>
                )}
              </div>
              {liveTranscript ? (
                <div>
                  <span className="text-text font-medium">{liveTranscript}</span>
                  {interimChunk && <span className="text-primary italic ml-1">{interimChunk}</span>}
                </div>
              ) : (
                <span className="text-text-muted/50 italic">
                  Run recognition or replay audio above to view streaming transcript...
                </span>
              )}
            </div>

            {/* Token-level alignment diff */}
            {diffTokens.length > 0 && (
              <div className="mt-4 pt-4 border-t border-card-border/60">
                <div className="text-[11px] font-mono text-text-muted mb-2 font-medium flex items-center justify-between">
                  <span>Alignment Diff vs Reference:</span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-emerald-400">■ Match</span>
                    <span className="text-amber-400">■ Substitution</span>
                    <span className="text-red-400">■ Deletion (Dropped)</span>
                    <span className="text-sky-400">■ Insertion</span>
                  </div>
                </div>
                <div className="p-3 bg-bg/50 border border-card-border rounded-lg flex flex-wrap gap-1 text-xs">
                  {diffTokens.map((token, i) => {
                    if (token.type === 'match') {
                      return (
                        <span key={i} className="text-emerald-300 font-mono">
                          {token.refWord}
                        </span>
                      );
                    }
                    if (token.type === 'substitution') {
                      return (
                        <span
                          key={i}
                          className="bg-amber-500/20 text-amber-300 px-1 rounded font-mono"
                          title={`Expected: "${token.refWord}", Got: "${token.hypWord}"`}
                        >
                          {token.hypWord || token.refWord}
                        </span>
                      );
                    }
                    if (token.type === 'deletion') {
                      return (
                        <span
                          key={i}
                          className="line-through text-red-400/80 bg-red-500/10 px-1 rounded font-mono"
                          title={`Dropped word: "${token.refWord}"`}
                        >
                          {token.refWord}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={i}
                        className="underline text-sky-400 bg-sky-500/10 px-1 rounded font-mono"
                        title={`Inserted word: "${token.hypWord}"`}
                      >
                        {token.hypWord}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Metrics & Latency Waterfall */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Word Capture Ratio Card */}
            <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                Word Capture Ratio
              </span>
              <div className="flex items-baseline gap-2 my-2">
                <span className="text-2xl font-bold font-mono text-text">
                  {metrics ? `${metrics.wordCaptureRatio}%` : '—'}
                </span>
                <span className="text-[11px] text-text-muted font-mono">Target: ≥ 95%</span>
              </div>
              <div className="flex items-center gap-1.5">
                {metrics && metrics.wordCaptureRatio >= 95 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Target Satisfied
                  </span>
                ) : metrics ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-red-400 font-mono">
                    <XCircle className="w-3.5 h-3.5" /> Below Target
                  </span>
                ) : (
                  <span className="text-[11px] text-text-muted font-mono">Awaiting test</span>
                )}
              </div>
            </div>

            {/* Word Error Rate (WER) Card */}
            <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                Word Error Rate (WER)
              </span>
              <div className="flex items-baseline gap-2 my-2">
                <span className="text-2xl font-bold font-mono text-text">
                  {metrics ? metrics.werPercentage : '—'}
                </span>
                <span className="text-[11px] text-text-muted font-mono">Target: ≤ 10%</span>
              </div>
              <div className="flex items-center gap-1.5">
                {metrics && metrics.wer <= 0.10 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Target Satisfied
                  </span>
                ) : metrics ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-mono">
                    <Award className="w-3.5 h-3.5" /> {metrics.substitutions} sub, {metrics.deletions} del
                  </span>
                ) : (
                  <span className="text-[11px] text-text-muted font-mono">Awaiting test</span>
                )}
              </div>
            </div>

            {/* Technical Terms Accuracy Card */}
            <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-primary" /> Technical Term Recall
              </span>
              <div className="flex items-baseline gap-2 my-2">
                <span className="text-2xl font-bold font-mono text-text">
                  {techMetrics ? `${techMetrics.accuracy}%` : '—'}
                </span>
                <span className="text-[11px] text-text-muted font-mono">
                  {techMetrics ? `${techMetrics.matchedCount}/${techMetrics.totalTerms}` : 'Target: ≥ 85%'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {techMetrics && techMetrics.accuracy >= 85 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" /> High Term Recall
                  </span>
                ) : techMetrics ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-mono">
                    {techMetrics.missedTerms.length} terms missed
                  </span>
                ) : (
                  <span className="text-[11px] text-text-muted font-mono">Awaiting test</span>
                )}
              </div>
            </div>

            {/* Latency Waterfall Card */}
            <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-primary" /> Latency Waterfall
              </span>
              <div className="space-y-1.5 my-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-text-muted">Start → 1st Partial:</span>
                  <span className="text-text font-semibold">
                    {firstInterimLatency !== null ? `${firstInterimLatency} ms` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Pause → Final Commit:</span>
                  <span className="text-text font-semibold">
                    {finalCommitLatency !== null ? `${finalCommitLatency} ms` : '—'}
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-text-muted font-mono">
                Target: ≤ 500 ms p50
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
