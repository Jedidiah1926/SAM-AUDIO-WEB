from __future__ import annotations

import logging
import re
import shutil
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import audio_io
from .config import Settings, get_settings
from .engine import SamAudioEngine, get_engine
from .schemas import HealthResponse, SeparateResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sam_audio_web")

_JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")

app = FastAPI(title="SAM-Audio Web", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _job_dir(settings: Settings, job_id: str) -> Path:
    path = settings.storage_dir / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


@app.get("/api/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    engine = get_engine(settings)
    device = None
    if isinstance(engine, SamAudioEngine):
        device = engine.resolve_device()
    return HealthResponse(
        status="ok",
        engine=engine.name,
        engine_ready=engine.is_ready(),
        model_name=settings.model_name if isinstance(engine, SamAudioEngine) else None,
        device=device,
    )


@app.post("/api/separate", response_model=SeparateResponse)
async def separate(
    audio: UploadFile = File(...),
    description: str = Form(...),
    reranking_candidates: int = Form(1),
    settings: Settings = Depends(get_settings),
) -> SeparateResponse:
    description = description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")

    job_id = uuid.uuid4().hex
    job_dir = _job_dir(settings, job_id)
    safe_name = Path(audio.filename or "input").name or "input"
    upload_path = job_dir / f"upload_{safe_name}"

    max_bytes = settings.max_upload_mb * 1024 * 1024
    size = 0
    with upload_path.open("wb") as out_file:
        while chunk := await audio.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                out_file.close()
                shutil.rmtree(job_dir, ignore_errors=True)
                raise HTTPException(
                    status_code=413, detail=f"File exceeds {settings.max_upload_mb}MB limit"
                )
            out_file.write(chunk)

    try:
        info = audio_io.read_info(upload_path)
    except Exception as exc:  # noqa: BLE001
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Could not read audio file: {exc}") from exc

    duration = info.duration_seconds
    if duration > settings.max_audio_seconds:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail=f"Audio exceeds {settings.max_audio_seconds:.0f}s limit ({duration:.1f}s)",
        )

    engine = get_engine(settings)
    try:
        result = engine.separate(
            upload_path,
            description,
            reranking_candidates=reranking_candidates,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Separation failed for job %s", job_id)
        raise HTTPException(status_code=500, detail=f"Separation failed: {exc}") from exc

    original_wav = job_dir / "original.wav"
    target_wav = job_dir / "target.wav"
    residual_wav = job_dir / "residual.wav"

    waveform, sr = audio_io.load(upload_path)
    audio_io.save(original_wav, waveform, sr)
    audio_io.save(target_wav, result.target, result.sample_rate)
    audio_io.save(residual_wav, result.residual, result.sample_rate)
    upload_path.unlink(missing_ok=True)

    return SeparateResponse(
        job_id=job_id,
        description=description,
        engine=result.engine,
        sample_rate=result.sample_rate,
        duration_seconds=duration,
        original_url=f"/api/results/{job_id}/original.wav",
        target_url=f"/api/results/{job_id}/target.wav",
        residual_url=f"/api/results/{job_id}/residual.wav",
    )


@app.get("/api/results/{job_id}/{filename}")
def get_result(job_id: str, filename: str, settings: Settings = Depends(get_settings)) -> FileResponse:
    if filename not in {"original.wav", "target.wav", "residual.wav"}:
        raise HTTPException(status_code=404, detail="Not found")
    if not _JOB_ID_RE.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")

    file_path = settings.storage_dir / job_id / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(file_path, media_type="audio/wav")
