import os

from src.solve_restaurants.config import Settings, configure_langsmith_tracing, get_settings


def test_settings_load_required_env_vars(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.mapbox_access_token == "mapbox-token"
    assert settings.tavily_api_key == "tavily-key"
    assert settings.ai_provider == "ollama"
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_model == "gemma4:12b"
    assert settings.log_dir.endswith(os.path.join("logs", "runs"))
    assert settings.langsmith_project == "group-chat-solver"
    assert settings.researcher_search_limit == 2
    # gemini_model has a code default but may be overridden by .env
    assert isinstance(settings.gemini_model, str) and len(settings.gemini_model) > 0


def test_settings_langsmith_endpoint_reads_from_env(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("LANGSMITH_ENDPOINT", "https://custom.langchain.example")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.langsmith_endpoint == "https://custom.langchain.example"


def test_settings_ai_provider_and_gemini_can_be_overridden(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.5-flash")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.ai_provider == "gemini"
    assert settings.google_api_key == "google-key"
    assert settings.gemini_model == "gemini-2.5-flash"


def test_settings_ai_provider_is_case_insensitive_and_normalizes(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "  GEMINI  ")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.ai_provider == "gemini"


def test_settings_ai_provider_rejects_invalid_values(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "openai")
    get_settings.cache_clear()

    try:
        get_settings()
    except ValueError as error:
        assert "must be 'gemini' or 'ollama'" in str(error)
    else:
        assert False, "Expected ValueError for invalid AI_PROVIDER"


def test_settings_per_stage_gemini_models_can_be_configured(monkeypatch):
    """Verify per-stage model fields are populated from env vars."""
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("GEMINI_PLANNER_MODEL", "gemini-2.5-pro")
    monkeypatch.setenv("GEMINI_QUESTION_GATHERER_MODEL", "gemini-3.5-flash")
    monkeypatch.setenv("GEMINI_RESEARCHER_MODEL", "gemini-2.5-flash")
    monkeypatch.setenv("GEMINI_JUDGE_MODEL", "gemini-2.5-pro")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.gemini_planner_model == "gemini-2.5-pro"
    assert settings.gemini_question_gatherer_model == "gemini-3.5-flash"
    assert settings.gemini_researcher_model == "gemini-2.5-flash"
    assert settings.gemini_judge_model == "gemini-2.5-pro"


def test_settings_gemini_model_for_stage_falls_back_to_global(monkeypatch):
    """Every known stage falls back to the global model when its override is blank."""
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.5-flash")
    for stage in ("PLANNER", "QUESTION_GATHERER", "RESEARCHER", "JUDGE"):
        monkeypatch.setenv(f"GEMINI_{stage}_MODEL", "")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.gemini_model_for_stage("planner") == "gemini-3.5-flash"
    assert settings.gemini_model_for_stage("question_gatherer") == "gemini-3.5-flash"
    assert settings.gemini_model_for_stage("researcher") == "gemini-3.5-flash"
    assert settings.gemini_model_for_stage("judge") == "gemini-3.5-flash"


def test_settings_gemini_model_for_stage_uses_override(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.5-flash")
    monkeypatch.setenv("GEMINI_PLANNER_MODEL", "gemini-2.5-pro")
    monkeypatch.setenv("GEMINI_QUESTION_GATHERER_MODEL", "gemini-2.5-flash-lite")
    monkeypatch.setenv("GEMINI_RESEARCHER_MODEL", "gemini-2.5-flash")
    monkeypatch.setenv("GEMINI_JUDGE_MODEL", "gemini-2.5-pro")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.gemini_model_for_stage("planner") == "gemini-2.5-pro"
    assert settings.gemini_model_for_stage("question_gatherer") == "gemini-2.5-flash-lite"
    assert settings.gemini_model_for_stage("researcher") == "gemini-2.5-flash"
    assert settings.gemini_model_for_stage("judge") == "gemini-2.5-pro"


def test_settings_gemini_model_for_stage_unknown_stage_falls_back(monkeypatch):
    """An unrecognized stage name has no matching field, so it uses the global model."""
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.5-flash")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.gemini_model_for_stage("unknown_stage") == "gemini-3.5-flash"


def test_configure_langsmith_tracing_noop_when_disabled(monkeypatch):
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    get_settings.cache_clear()

    configure_langsmith_tracing()

    assert "LANGSMITH_TRACING" not in os.environ
    assert "LANGSMITH_API_KEY" not in os.environ


def test_configure_langsmith_tracing_noop_when_no_api_key(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    get_settings.cache_clear()

    configure_langsmith_tracing()

    assert "LANGSMITH_API_KEY" not in os.environ


def test_configure_langsmith_tracing_sets_env_vars_when_enabled(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    monkeypatch.setenv("LANGSMITH_API_KEY", "lsv2_pt_test_key")
    monkeypatch.setenv("LANGSMITH_PROJECT", "my-test-project")
    get_settings.cache_clear()

    configure_langsmith_tracing()

    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_API_KEY"] == "lsv2_pt_test_key"
    assert os.environ["LANGSMITH_PROJECT"] == "my-test-project"


def test_configure_langsmith_tracing_sets_endpoint_when_provided(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    monkeypatch.setenv("LANGSMITH_API_KEY", "lsv2_pt_test_key")
    monkeypatch.setenv("LANGSMITH_ENDPOINT", "https://custom.langchain.example")
    get_settings.cache_clear()

    configure_langsmith_tracing()

    assert os.environ["LANGSMITH_ENDPOINT"] == "https://custom.langchain.example"
