import os

from src.solve_restaurants.config import Settings, configure_langsmith_tracing, get_settings


def test_settings_load_required_env_vars(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.mapbox_access_token == "mapbox-token"
    assert settings.tavily_api_key == "tavily-key"
    assert settings.ai_provider == "ollama"
    assert settings.google_api_key is None
    assert settings.gemini_model == "gemini-2.0-flash"
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_model == "gemma4:12b"
    assert settings.log_dir.endswith(os.path.join("logs", "runs"))
    assert settings.langsmith_api_key is None
    assert settings.langsmith_project == "group-chat-solver"


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
