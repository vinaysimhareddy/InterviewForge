/**
 * AudioWorklet Processor for 16 kHz Mono 16-bit Linear PCM Streaming.
 *
 * Captures microphone audio, downsamples to 16,000 Hz if necessary,
 * and packages audio into 80-160 ms frames (default: 100 ms = 1,600 samples).
 * Uses zero-copy transferable ArrayBuffers to post PCM frames to the main thread.
 */

class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = 16000;
    this.sourceSampleRate = sampleRate; // Global AudioWorklet sampleRate
    this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;

    // Target frame length in samples at 16 kHz (100 ms = 1,600 samples = 3,200 bytes)
    const frameMs = (options && options.processorOptions && options.processorOptions.frameMs) || 100;
    this.targetFrameSize = Math.round((this.targetSampleRate * frameMs) / 1000);

    this.buffer = new Float32Array(this.targetFrameSize * 2);
    this.bufferIndex = 0;
    this.resampleCounter = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0]; // Channel 0 (mono)
    if (!channelData || channelData.length === 0) return true;

    // Simple, low-latency linear downsampling to 16 kHz
    if (this.resampleRatio === 1) {
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];
        if (this.bufferIndex >= this.targetFrameSize) {
          this.flushFrame();
        }
      }
    } else {
      for (let i = 0; i < channelData.length; i++) {
        this.resampleCounter += 1;
        if (this.resampleCounter >= this.resampleRatio) {
          this.resampleCounter -= this.resampleRatio;
          this.buffer[this.bufferIndex++] = channelData[i];
          if (this.bufferIndex >= this.targetFrameSize) {
            this.flushFrame();
          }
        }
      }
    }

    return true;
  }

  flushFrame() {
    const pcm16 = new Int16Array(this.targetFrameSize);
    for (let i = 0; i < this.targetFrameSize; i++) {
      const sample = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }

    // Zero-copy transfer of PCM buffer to main thread
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);

    // Shift remainder if any
    const remaining = this.bufferIndex - this.targetFrameSize;
    if (remaining > 0) {
      this.buffer.copyWithin(0, this.targetFrameSize, this.bufferIndex);
      this.bufferIndex = remaining;
    } else {
      this.bufferIndex = 0;
    }
  }
}

registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);

