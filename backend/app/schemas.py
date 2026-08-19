from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    engine: str
    engine_ready: bool
    model_name: str | None = None
    device: str | None = None


class SeparateResponse(BaseModel):
    job_id: str
    description: str
    engine: str
    sample_rate: int
    duration_seconds: float
    original_url: str
    target_url: str
    residual_url: str
