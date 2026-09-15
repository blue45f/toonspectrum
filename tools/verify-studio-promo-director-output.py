"""Validate actual enhanced browser/Remotion output, not mocked audio nodes.

The director E2E fixture contains an 880Hz one-second narration at t=2 and a
130.813Hz synthesized pad before its first chord change. Requires ffmpeg/ffprobe.
"""
import argparse
import array
import json
import math
from pathlib import Path
import subprocess


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(path)
    ]))


def amplitude(samples, rate, frequency, start, end):
    window = samples[round(start * rate):round(end * rate)]
    if not window:
        raise AssertionError("Missing audio samples")
    real = sum(x * math.cos(2 * math.pi * frequency * i / rate) for i, x in enumerate(window))
    imag = sum(x * math.sin(2 * math.pi * frequency * i / rate) for i, x in enumerate(window))
    return 2 * math.hypot(real, imag) / len(window)


def validate(path, native):
    data = probe(path)
    video = next(stream for stream in data["streams"] if stream["codec_type"] == "video")
    assert any(stream["codec_type"] == "audio" for stream in data["streams"]), "Missing mixed audio track"
    frame_count = int(video["nb_read_frames"])
    if native:
        duration = float(data["format"]["duration"])
        assert abs(duration - 15.0) < 0.05, "Native recording must be finalized with its duration"
        assert frame_count >= 338, "Real captured frames are unexpectedly sparse"
        # Chromium MediaRecorder WebM reports the millisecond container time base as
        # r_frame_rate=1000/1 (and avg_frame_rate=0/0), not the requested capture cadence.
        # Validate the observable frame density instead of treating that metadata field as fps.
        effective_fps = frame_count / duration
        assert 22.5 <= effective_fps <= 35.0, (
            f"Native capture cadence is outside the accepted 30fps envelope: {effective_fps:.3f}fps"
        )
    else:
        assert video["codec_name"] == "h264"
        assert video["r_frame_rate"] == "30/1", "Declared Remotion frame rate must be 30fps"
        assert frame_count == 450
        assert abs(float(video["duration"]) - 15) < 0.05
    samples = array.array("f")
    samples.frombytes(subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"
    ]))
    before = amplitude(samples, 16000, 130.813, 1.25, 1.75)
    during = amplitude(samples, 16000, 130.813, 2.25, 2.75)
    assert before > 0.001, "Synthesized BGM is inaudible before narration"
    assert 0.15 < during / before < 0.55, "Encoded BGM was not ducked around narration"
    speech = amplitude(samples, 16000, 880, 2.25, 2.75)
    early = amplitude(samples, 16000, 880, 1.25, 1.75)
    late = amplitude(samples, 16000, 880, 3.25, 3.75)
    assert speech > max(0.03, early * 10, late * 10), "Narration timing, amplitude or non-looping contract failed"
    print(f"{path.name}: {video['nb_read_frames']} frames, timed narration, BGM ratio={during / before:.3f}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--remotion", type=Path, required=True)
    args = parser.parse_args()
    native = [path for path in args.results.rglob("director.*") if path.suffix in {".webm", ".mp4"}]
    assert len(native) == 1, f"Expected one director browser video, found {len(native)}"
    validate(native[0], native=True)
    validate(args.remotion, native=False)


if __name__ == "__main__":
    main()
