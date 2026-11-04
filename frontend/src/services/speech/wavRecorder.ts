/**
 * 16 kHz Mono WAV Audio Recorder & Encoder (§T3)
 *
 * Implements:
 * 1. Resampling from hardware mic sample rate (e.g. 44.1/48 kHz) to standard 16.0 kHz mono.
 * 2. 16-bit linear PCM WAV container encoding with canonical RIFF header.
 * 3. Client-side in-memory audio capture from MediaStream with zero network uploads.
 * 4. Deterministic WAV replay harness via AudioContext MediaStreamAudioDestinationNode.
 */

export function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate = 16000): Float32Array {
  if (outputRate === inputRate) {
    return buffer;
  }
  if (outputRate > inputRate) {
    throw new Error(`Output rate ${outputRate} must be <= input rate ${inputRate}`);
  }

  const sampleRatio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / sampleRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

export function encodeWAV(samples: Float32Array, sampleRate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (1 = raw linear PCM) */
  view.setUint16(20, 1, true);
  /* channel count (1 = mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM samples with clipping guard
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export class WavAudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private recordedChunks: Float32Array[] = [];
  private recordingLength = 0;
  private isRecording = false;
  private currentVolumeLevel = 0;

  public get recording(): boolean {
    return this.isRecording;
  }

  public get volumeLevel(): number {
    return this.currentVolumeLevel;
  }

  public start(stream: MediaStream): void {
    if (this.isRecording) return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioCtx();
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);

    // Buffer size 4096 gives ~85ms latency at 48kHz
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.recordedChunks = [];
    this.recordingLength = 0;
    this.isRecording = true;

    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.recordedChunks.push(copy);
      this.recordingLength += copy.length;

      // Compute RMS volume for VU meter
      let sum = 0;
      for (let i = 0; i < copy.length; i++) {
        sum += copy[i] * copy[i];
      }
      const rms = Math.sqrt(sum / copy.length);
      this.currentVolumeLevel = Math.min(1.0, rms * 5);
    };

    this.mediaStreamSource.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  public async stop(): Promise<Blob> {
    this.isRecording = false;
    this.currentVolumeLevel = 0;

    if (this.processorNode && this.mediaStreamSource) {
      this.processorNode.disconnect();
      this.mediaStreamSource.disconnect();
    }

    const inputRate = this.audioContext ? this.audioContext.sampleRate : 48000;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Merge recorded PCM chunks
    const merged = new Float32Array(this.recordingLength);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Downsample to 16 kHz mono linear PCM
    const downsampled16k = downsampleBuffer(merged, inputRate, 16000);
    return encodeWAV(downsampled16k, 16000);
  }
}

/**
 * Creates a playable MediaStream from a recorded 16 kHz WAV Blob
 * allowing identical audio to be fed back through speech recognition pipes.
 */
export async function createMediaStreamFromWavBlob(
  blob: Blob
): Promise<{ stream: MediaStream; audioContext: AudioContext; stop: () => void }> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioCtx();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;

  const destinationNode = audioContext.createMediaStreamDestination();
  sourceNode.connect(destinationNode);
  sourceNode.start();

  return {
    stream: destinationNode.stream,
    audioContext,
    stop: () => {
      try {
        sourceNode.stop();
        sourceNode.disconnect();
        destinationNode.disconnect();
        if (audioContext.state !== 'closed') {
          audioContext.close().catch(() => {});
        }
      } catch {}
    },
  };
}

