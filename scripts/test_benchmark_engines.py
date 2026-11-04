import json
import time
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
import vosk

audio_path = 'data/stt_eval_answers/ans_short_01.wav'
data, sr = sf.read(audio_path, dtype='float32')
print(f"Original audio: {len(data)} samples, {sr} Hz, {len(data)/sr:.2f} s")

# Resample to 16000 Hz if necessary
if sr != 16000:
    target_len = int(len(data) * 16000 / sr)
    data_16k = np.interp(
        np.linspace(0, len(data), target_len, endpoint=False),
        np.arange(len(data)),
        data
    ).astype(np.float32)
else:
    data_16k = data

duration_s = len(data_16k) / 16000
pcm_16k_int16 = (np.clip(data_16k, -1.0, 1.0) * 32767).astype(np.int16)
print(f"Resampled audio: {len(data_16k)} samples, 16000 Hz, {duration_s:.2f} s")

# 1. Test Faster-Whisper on CPU (int8)
print("\n--- Faster-Whisper (CPU int8, 4 threads) ---")
t_model_start = time.time()
fw_model = WhisperModel('base.en', device='cpu', compute_type='int8', cpu_threads=4)
t_model_load = time.time() - t_model_start
print(f"Model load time: {t_model_load:.3f} s")

t0 = time.time()
segments, info = fw_model.transcribe(
    data_16k,
    beam_size=1,
    initial_prompt='Spring Boot, microservices, REST, PostgreSQL, Kafka, Kubernetes'
)
fw_text = " ".join([s.text for s in segments]).strip()
fw_latency = time.time() - t0
rtf_fw = fw_latency / duration_s
print(f"Transcript: {fw_text}")
print(f"Inference Latency: {fw_latency:.3f} s (RTF: {rtf_fw:.3f}x)")

# 2. Test Vosk on CPU
print("\n--- Vosk Small EN (CPU) ---")
t_v_start = time.time()
v_model = vosk.Model(model_name='vosk-model-small-en-us-0.15')
rec = vosk.KaldiRecognizer(v_model, 16000.0)
t_v_load = time.time() - t_v_start
print(f"Model load time: {t_v_load:.3f} s")

t0 = time.time()
# Stream in 100ms frames to simulate real streaming
chunk_size = 1600  # 100ms = 1600 samples
raw_bytes = pcm_16k_int16.tobytes()
frame_bytes = chunk_size * 2
partials = []
first_partial_time = None

for i in range(0, len(raw_bytes), frame_bytes):
    frame = raw_bytes[i:i + frame_bytes]
    if rec.AcceptWaveform(frame):
        res = json.loads(rec.Result())
        if res.get('text'):
            partials.append(res['text'])
    else:
        part = json.loads(rec.PartialResult())
        p_text = part.get('partial', '')
        if p_text and first_partial_time is None:
            first_partial_time = time.time() - t0

final_res = json.loads(rec.FinalResult())
if final_res.get('text'):
    partials.append(final_res['text'])
v_latency = time.time() - t0
v_text = " ".join(partials).strip()
rtf_v = v_latency / duration_s
print(f"Transcript: {v_text}")
print(f"Total Stream Latency: {v_latency:.3f} s (RTF: {rtf_v:.3f}x)")
print(f"First Partial Latency: {first_partial_time:.3f} s" if first_partial_time else "No partials emitted")
