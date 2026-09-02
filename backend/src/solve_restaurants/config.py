import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import logging

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    mapbox_access_token: str
    tavily_api_key: str
    ai_provider: str = "ollama"
    google_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash-lite"
    gemini_planner_model: str | None = "gemini-3.7-flash"
    gemini_question_gatherer_model: str | None = "gemini-2.5-flash-lite"
    gemini_researcher_model: str | None = "gemini-3.7-flash"
    gemini_judge_model: str | None = "gemini-3.1-flash-lite"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:12b"
    log_dir: str = os.path.join(os.path.dirname(__file__), "..", "..", "logs", "runs")
    dev_mode: bool = True
    log_level: str = "DEBUG"
    researcher_search_limit: int = 2
    langsmith_tracing: bool = False
    langsmith_api_key: str | None = None
    langsmith_project: str = "group-chat-solver"
    langsmith_endpoint: str | None = None

    def gemini_model_for_stage(self, stage: str) -> str:
        """Return the Gemini model name for a given pipeline stage.

        Falls back to the global ``gemini_model`` when no stage-specific
        override is configured.
        """
        override = getattr(self, f"gemini_{stage}_model", None)
        return override or self.gemini_model

    @field_validator("ai_provider", mode="before")
    @classmethod
    def _validate_ai_provider(cls, value: object) -> object:
        if value is None:
            return "ollama"
        provider = str(value).lower().strip()
        if provider not in {"gemini", "ollama"}:
            raise ValueError(f"ai_provider must be 'gemini' or 'ollama', got {value!r}")
        logger.debug(f"Using AI provider: {provider}")
        return provider


@lru_cache
def get_settings() -> Settings:
    return Settings()


def configure_langsmith_tracing() -> None:
    """Propagate LangSmith settings to the environment so LangChain/LangGraph's
    built-in tracing picks them up automatically (it reads os.environ directly,
    not our pydantic-settings instance).
    """
    settings = get_settings()
    if not settings.langsmith_tracing or not settings.langsmith_api_key:
        return
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
    if settings.langsmith_endpoint:
        os.environ["LANGSMITH_ENDPOINT"] = settings.langsmith_endpoint
