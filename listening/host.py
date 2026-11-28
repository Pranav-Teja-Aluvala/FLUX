"""FLUX's local Chrome native messaging host."""

import base64
import json
import os
from pathlib import Path
import struct
import sys

WEIGHTS = Path(__file__).resolve().parent / "models"
MAX_PACKET = 2_500_000
SEPARATORS = {
    2: ("sepformer-whamr", "9950fd8055b38679d2af5bef2366b5dba600ec66"),
    3: ("sepformer-wsj03mix", "21e78b44a378092c34fff32ba8e788a73584f474"),
}


def send(reply):
    body = json.dumps(reply, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(body)) + body)
    sys.stdout.buffer.flush()


def requests():
    while header := sys.stdin.buffer.read(4):
        if len(header) != 4:
            return
        size, = struct.unpack("<I", header)
        if not 0 < size <= MAX_PACKET:
            return
        body = sys.stdin.buffer.read(size)
        if len(body) != size:
            return
        yield json.loads(body)


def level(signal):
    return signal.square().mean().sqrt().item()


class Listener:
    def __init__(self):
        import torch
        import torchaudio
        from faster_whisper import WhisperModel, download_model
        from huggingface_hub.errors import LocalEntryNotFoundError

        torch.set_num_threads(min(4, os.cpu_count() or 1))
        self.torch = torch
        self.resample = torchaudio.functional.resample
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        bundle = torchaudio.pipelines.HDEMUCS_HIGH_MUSDB_PLUS
        self.demucs = bundle.get_model().to(self.device).eval()
        self.demucs_rate = bundle.sample_rate
        self.vocal_index = self.demucs.sources.index("vocals")
        whisper_revision = "ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66"
        try:
            whisper_path = download_model(
                "base", cache_dir=str(WEIGHTS), revision=whisper_revision,
                local_files_only=True,
            )
            if not (Path(whisper_path) / "model.bin").is_file():
                raise LocalEntryNotFoundError("Incomplete Whisper cache")
        except LocalEntryNotFoundError:
            whisper_path = download_model(
                "base", cache_dir=str(WEIGHTS), revision=whisper_revision,
            )
        self.whisper = WhisperModel(
            whisper_path, device="cpu", compute_type="int8",
            cpu_threads=min(4, os.cpu_count() or 1),
        )
        self.separators = {}

    def get_separator(self, voices):
        from huggingface_hub import hf_hub_download, try_to_load_from_cache
        from hyperpyyaml import load_hyperpyyaml
        from speechbrain.inference.separation import SepformerSeparation

        if voices not in self.separators:
            name, revision = SEPARATORS[voices]
            repository = f"speechbrain/{name}"
            for filename in ("masknet.ckpt", "encoder.ckpt", "decoder.ckpt", "hyperparams.yaml"):
                file = try_to_load_from_cache(repository, filename, revision=revision)
                if not isinstance(file, str) or not Path(file).is_file():
                    file = hf_hub_download(repository, filename, revision=revision)
            with Path(file).open(encoding="utf-8") as config:
                hparams = load_hyperpyyaml(config)
            hparams["pretrainer"].set_collect_in(Path(file).parent)
            hparams["pretrainer"].load_collected()
            self.separators[voices] = SepformerSeparation(
                hparams["modules"], hparams,
                run_opts={"device": self.device},
            )
        return self.separators[voices]

    def transcribe(self, samples, rate, lane):
        if level(samples) < 0.002:
            return []
        waveform = self.resample(samples.float().cpu(), rate, 16000).numpy()
        segments, _ = self.whisper.transcribe(
            waveform, language="en", beam_size=2, temperature=0,
            vad_filter=True, vad_parameters={"min_silence_duration_ms": 220},
            condition_on_previous_text=False,
        )
        return [
            {"text": text, "start": segment.start, "end": segment.end, "lane": lane}
            for segment in segments
            if (text := segment.text.strip()) and segment.avg_logprob >= -1.0
            and segment.no_speech_prob < 0.6
        ]

    def tone_presence(self, mono):
        frame_size = self.demucs_rate // 2
        frames = mono.unfold(0, frame_size, frame_size)
        frames = frames[frames.square().mean(1).sqrt() > 0.006]
        if not len(frames):
            return False, False
        window = self.torch.hann_window(frame_size, device=mono.device)
        power = self.torch.fft.rfft(frames * window).abs().square()
        peaks = power.argmax(dim=1)
        visible = (peaks > 1) & (peaks < power.shape[1] - 2)
        bins = peaks.clamp(1, power.shape[1] - 2)[:, None]
        offsets = self.torch.tensor([-1, 0, 1], device=mono.device)
        peak_fraction = power.gather(1, bins + offsets).sum(1) / power.sum(1)
        tonal = visible & (peak_fraction > 0.93)
        return bool(tonal.any()), bool(tonal.all())

    def analyze(self, audio, rate, voices):
        import numpy as np

        if len(audio) % 4 or not 2 * rate <= len(audio) // 4 <= 7 * rate:
            raise ValueError("Audio must be a stereo PCM window.")
        samples = np.frombuffer(audio, dtype="<i2").astype(np.float32)
        mix = self.torch.from_numpy(samples.reshape(-1, 2).T.copy()) / 32768
        with self.torch.inference_mode():
            mix = self.resample(mix.to(self.device), rate, self.demucs_rate)
            mix_level = level(mix)
            if mix_level < 0.001:
                return {"sounds": [], "lines": []}
            mono = mix.mean(0)
            has_tone, tone_only = self.tone_presence(mono)
            if tone_only:
                return {"sounds": ["Tone"], "lines": []}
            mean = mix.mean()
            scale = mix.std().clamp(min=0.001)
            stems = self.demucs(((mix - mean) / scale).unsqueeze(0))[0] * scale
            vocals = stems[self.vocal_index].mean(0)
            backing = stems.sum(0) - stems[self.vocal_index]
            vocal_level = level(vocals)
            has_music = level(backing) > max(0.004, mix_level * 0.24)
            voice_mix = vocals if has_music else mono
            if has_music and vocal_level < max(0.002, mix_level * 0.075):
                lines = []
            elif voices == 1:
                lines = self.transcribe(voice_mix, self.demucs_rate, 1)
            else:
                separator = self.get_separator(voices)
                voice_rate = int(separator.hparams.sample_rate)
                signal = self.resample(voice_mix, self.demucs_rate, voice_rate)
                sources = separator.separate_batch(signal.unsqueeze(0))[0]
                lines = []
                for lane, stem in enumerate(sources.T, 1):
                    if level(stem) >= max(0.002, level(signal) * 0.12):
                        lines.extend(self.transcribe(stem, voice_rate, lane))
            lines.sort(key=lambda line: (line["start"], line["lane"]))
            sounds = []
            if has_tone:
                sounds.append("Tone")
            if has_music:
                sounds.append("Music")
            if lines or vocal_level > max(0.008, mix_level * 0.13):
                sounds.append("Vocals")
            return {"sounds": sounds, "lines": lines}


def main():
    os.environ.setdefault("TORCH_HOME", str(WEIGHTS / "torch"))
    os.environ.setdefault("HF_HOME", str(WEIGHTS / "hf"))
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
    if "--prepare" in sys.argv:
        listener = Listener()
        for voices in SEPARATORS:
            listener.get_separator(voices)
        print("All FLUX listening models loaded.")
        return

    listener = None
    for request in requests():
        if not isinstance(request, dict):
            continue
        serial = request.get("id")
        try:
            if request.get("type") == "hello":
                send({"type": "ready", "protocol": 1})
                continue
            rate = request["rate"]
            voices = request["voices"]
            if request.get("type") != "analyze" or rate not in (44100, 48000) or voices not in (1, 2, 3):
                raise ValueError("Unsupported audio request.")
            stereo = base64.b64decode(request["audio"], validate=True)
            if listener is None:
                send({"type": "loading", "id": serial})
                listener = Listener()
            if voices > 1 and voices not in listener.separators:
                send({"type": "loading", "id": serial})
            reply = listener.analyze(stereo, rate, voices)
            send({"type": "analysis", "id": serial, **reply})
        except Exception as error:
            print(f"FLUX listening: {type(error).__name__}: {error}", file=sys.stderr)
            send({"type": "error", "id": serial, "message": "Local audio analysis failed. Check the listening companion setup."})


if __name__ == "__main__":
    main()
