"""Separation engine abstraction.

Two implementations:

- ``SamAudioEngine`` wraps the real facebookresearch/sam-audio model
  (https://github.com/facebookresearch/sam-audio). It requires the ``sam_audio``
  package to be installed separately and, in practice, a CUDA GPU plus gated
  HuggingFace access to the checkpoints.
- ``MockEngine`` is a lightweight DSP stand-in (deterministic band-pass split)
  used when the real model isn't available, so the rest of the web app
  (upload -> separate -> playback) can be built and tested end to end without
  GPU hardware or model weights. It is never presented as real separation:
  the API always reports which engine served a request.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

import torch
import torchaudio

from . import audio_io
from .config import Settings

logger = logging.getLogger("sam_audio_web.engine")


@dataclass
class SeparationResult:
    target: torch.Tensor  # [channels, samples]
    residual: torch.Tensor  # [channels, samples]
    sample_rate: int
    engine: str


class SeparationEngine:
    name = "base"

    def separate(
        self,
        audio_path: Path,
        description: str,
        reranking_candidates: int = 1,
        predict_spans: bool = False,
    ) -> SeparationResult:
        raise NotImplementedError

    def is_ready(self) -> bool:
        return True


class SamAudioEngine(SeparationEngine):
    """Wraps facebookresearch/sam-audio's SAMAudio / SAMAudioProcessor."""

    name = "sam_audio"

    def __init__(self, model_name: str, device: str):
        self._model_name = model_name
        self._requested_device = device
        self._lock = Lock()
        self._model = None
        self._processor = None
        self._device = None

    @staticmethod
    def is_available() -> bool:
        try:
            import sam_audio  # noqa: F401
        except ImportError:
            return False
        return True

    def resolve_device(self) -> str:
        if self._requested_device != "auto":
            return self._requested_device
        return "cuda" if torch.cuda.is_available() else "cpu"

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            from sam_audio import SAMAudio, SAMAudioProcessor

            device = self.resolve_device()
            logger.info("Loading SAM-Audio model %s on %s", self._model_name, device)
            model = SAMAudio.from_pretrained(self._model_name)
            processor = SAMAudioProcessor.from_pretrained(self._model_name)
            model = model.eval().to(device)

            self._model = model
            self._processor = processor
            self._device = device

    def is_ready(self) -> bool:
        return self.is_available()

    def separate(
        self,
        audio_path: Path,
        description: str,
        reranking_candidates: int = 1,
        predict_spans: bool = False,
    ) -> SeparationResult:
        self._ensure_loaded()
        assert self._model is not None and self._processor is not None

        batch = self._processor(
            audios=[str(audio_path)],
            descriptions=[description],
        ).to(self._device)

        with torch.inference_mode():
            result = self._model.separate(
                batch,
                predict_spans=predict_spans,
                reranking_candidates=reranking_candidates,
            )

        sample_rate = self._processor.audio_sampling_rate
        target = result.target.detach().cpu()
        residual = result.residual.detach().cpu()
        if target.dim() == 1:
            target = target.unsqueeze(0)
        if residual.dim() == 1:
            residual = residual.unsqueeze(0)

        return SeparationResult(
            target=target,
            residual=residual,
            sample_rate=sample_rate,
            engine=self.name,
        )


class MockEngine(SeparationEngine):
    """Deterministic DSP stand-in for local development and UI testing.

    Splits the input into a "target" band-pass component and its complement
    ("residual"), where the band is derived from a hash of the text prompt.
    This is *not* real source separation -- it exists purely so the upload /
    playback pipeline can be exercised without the gated SAM-Audio weights or
    a GPU.
    """

    name = "mock"

    def is_ready(self) -> bool:
        return True

    def separate(
        self,
        audio_path: Path,
        description: str,
        reranking_candidates: int = 1,
        predict_spans: bool = False,
    ) -> SeparationResult:
        waveform, sample_rate = audio_io.load(audio_path)

        low, high = self._band_for(description, sample_rate)
        target = torchaudio.functional.bandpass_biquad(
            waveform, sample_rate, central_freq=(low + high) / 2, Q=0.707
        )
        residual = waveform - target

        return SeparationResult(
            target=target,
            residual=residual,
            sample_rate=sample_rate,
            engine=self.name,
        )

    @staticmethod
    def _band_for(description: str, sample_rate: int) -> tuple[float, float]:
        digest = hashlib.sha256(description.strip().lower().encode("utf-8")).digest()
        nyquist = sample_rate / 2
        # Pick a center frequency in [200Hz, 0.8 * nyquist), deterministically
        # from the prompt text, so different prompts audibly differ.
        span = max(nyquist * 0.8 - 200, 1.0)
        center = 200 + (int.from_bytes(digest[:4], "big") % 10_000) / 10_000 * span
        bandwidth = max(center * 0.5, 100.0)
        return center - bandwidth / 2, center + bandwidth / 2


_engine_instance: SeparationEngine | None = None
_engine_lock = Lock()


def get_engine(settings: Settings) -> SeparationEngine:
    global _engine_instance
    if _engine_instance is not None:
        return _engine_instance

    with _engine_lock:
        if _engine_instance is not None:
            return _engine_instance

        choice = settings.engine
        if choice == "sam_audio":
            _engine_instance = SamAudioEngine(settings.model_name, settings.device)
        elif choice == "mock":
            _engine_instance = MockEngine()
        else:  # auto
            if SamAudioEngine.is_available():
                logger.info("sam_audio package detected, using SamAudioEngine")
                _engine_instance = SamAudioEngine(settings.model_name, settings.device)
            else:
                logger.warning(
                    "sam_audio package not found; falling back to MockEngine. "
                    "Install https://github.com/facebookresearch/sam-audio and set "
                    "SAM_AUDIO_ENGINE=sam_audio for real separation."
                )
                _engine_instance = MockEngine()

        return _engine_instance
