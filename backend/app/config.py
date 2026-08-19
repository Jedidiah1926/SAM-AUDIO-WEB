from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SAM_AUDIO_", env_file=".env", extra="ignore")

    # "auto" tries the real SAM-Audio engine and falls back to the mock engine
    # if the `sam_audio` package or a GPU is unavailable. Force with "sam_audio"
    # or "mock".
    engine: str = "auto"

    # e.g. facebook/sam-audio-base, facebook/sam-audio-large, ...-tv variants.
    model_name: str = "facebook/sam-audio-base"

    device: str = "auto"  # "auto" | "cuda" | "cpu"

    storage_dir: Path = Path("storage")
    max_upload_mb: int = 50
    max_audio_seconds: float = 60.0

    # Comma-separated list of allowed frontend origins for CORS.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings
