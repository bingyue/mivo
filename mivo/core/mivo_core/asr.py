import argparse
import json
import os
import tempfile
import wave
from pathlib import Path

import av


def decode_audio(source, target):
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    with av.open(str(source)) as container, wave.open(str(target), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        for frame in container.decode(audio=0):
            for converted in resampler.resample(frame):
                output.writeframes(bytes(converted.planes[0])[:converted.samples * 2])
        for converted in resampler.resample(None):
            output.writeframes(bytes(converted.planes[0])[:converted.samples * 2])


def transcribe(source, options, emit):
    model = Path(options["model_path"]).expanduser().resolve()
    if not model.is_dir():
        raise ValueError("LOCAL_MODEL_NOT_FOUND: install a local model first")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    with tempfile.TemporaryDirectory(prefix="mivo-asr-") as scratch:
        wav = Path(scratch) / "audio.wav"
        decode_audio(source, wav)
        provider = options["provider"]
        if provider == "whisper":
            from faster_whisper import WhisperModel
            device = options.get("device", "cpu")
            engine = WhisperModel(str(model), device=device,
                                  compute_type="float16" if device == "cuda" else "int8",
                                  local_files_only=True)
            segments, info = engine.transcribe(str(wav), language=options.get("language"), vad_filter=True)
            for segment in segments:
                emit({"segment": {"start": segment.start, "end": segment.end, "text": segment.text},
                      "progress": min(.99, segment.end / max(info.duration, 1))})
        else:
            from funasr import AutoModel
            with wave.open(str(wav), "rb") as audio:
                duration = audio.getnframes() / audio.getframerate()
            engine = AutoModel(model=str(model), device=options.get("device", "cpu"),
                               disable_update=True, trust_remote_code=False)
            result = engine.generate(input=str(wav), language=options.get("language") or "auto")
            for item in result:
                text = item.get("text", "").strip()
                if text:
                    emit({"segment": {"start": 0, "end": duration, "text": text}, "progress": .99})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("options")
    args = parser.parse_args()
    transcribe(Path(args.source), json.loads(args.options),
               lambda value: print(json.dumps(value, ensure_ascii=False), flush=True))


if __name__ == "__main__":
    main()
