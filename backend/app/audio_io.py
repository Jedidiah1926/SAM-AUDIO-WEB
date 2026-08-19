"""Audio file I/O helpers.

We deliberately use ``soundfile`` (libsndfile) rather than torchaudio's
load/save, since the latter now requires TorchCodec + a matching system
FFmpeg install. soundfile ships its own libsndfile binary in the wheel and
handles wav/flac/ogg without any extra system dependencies, which keeps the
web service's runtime footprint small and predictable.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import torch


@dataclass
class AudioInfo:
    sample_rate: int
    num_frames: int

    @property
    def duration_seconds(self) -> float:
        return self.num_frames / self.sample_rate


def read_info(path: Path) -> AudioInfo:
    info = sf.info(str(path))
    return AudioInfo(sample_rate=info.samplerate, num_frames=info.frames)


def load(path: Path) -> tuple[torch.Tensor, int]:
    """Returns a [channels, samples] float32 tensor and the sample rate."""
    data, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    # soundfile gives [samples, channels]; torch convention here is
    # [channels, samples].
    waveform = torch.from_numpy(data.T.copy())
    return waveform, sample_rate


def save(path: Path, waveform: torch.Tensor, sample_rate: int) -> None:
    if waveform.dim() == 1:
        waveform = waveform.unsqueeze(0)
    data = waveform.detach().cpu().numpy().T.astype(np.float32)
    sf.write(str(path), data, sample_rate)
