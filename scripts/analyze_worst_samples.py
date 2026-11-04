import json

with open("data/stt_eval_answers/stt_bakeoff_results.json", "r", encoding="utf-8") as f:
    d = json.load(f)

cases = d["results_by_case"]

print("=== WORST 5 FASTER-WHISPER SAMPLES ===")
fw_sorted = sorted(cases, key=lambda x: x["providers"]["faster_whisper_biased"]["wer_percent"], reverse=True)[:5]
for c in fw_sorted:
    p = c["providers"]["faster_whisper_biased"]
    print(f"\nID: {c['id']} | Category: {c['category']} | Title: {c['title']}")
    print(f"WER: {p['wer_percent']}% | Capture: {p['word_capture_ratio']}% | Subs: {p['substitutions']} | Dels: {p['deletions']} | Inss: {p['insertions']}")
    print(f"Ref: {c['reference_text']}")
    print(f"Hyp: {p['hypothesis']}")
    print(f"Missed Tech Terms: {p['missed_tech_terms']}")

print("\n\n=== WORST 5 VOSK SAMPLES ===")
vk_sorted = sorted(cases, key=lambda x: x["providers"]["vosk"]["wer_percent"], reverse=True)[:5]
for c in vk_sorted:
    p = c["providers"]["vosk"]
    print(f"\nID: {c['id']} | Category: {c['category']} | Title: {c['title']}")
    print(f"WER: {p['wer_percent']}% | Capture: {p['word_capture_ratio']}% | Subs: {p['substitutions']} | Dels: {p['deletions']} | Inss: {p['insertions']}")
    print(f"Ref: {c['reference_text']}")
    print(f"Hyp: {p['hypothesis']}")
    print(f"Missed Tech Terms: {p['missed_tech_terms']}")

