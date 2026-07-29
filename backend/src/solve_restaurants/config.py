import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    mapbox_access_token: str
    tavily_api_key: str
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:12b"
    log_dir: str = os.path.join(os.path.dirname(__file__), "..", "..", "logs", "runs")
    dev_mode: bool = True
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
