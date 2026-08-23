from unittest.mock import MagicMock, patch

from src.solve_restaurants.config import get_settings
from src.solve_restaurants.llm import get_chat_llm


def test_get_chat_llm_returns_ollama_client_by_default(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    get_settings.cache_clear()

    mock_llm = MagicMock()
    with patch("src.solve_restaurants.llm.ChatOllama", return_value=mock_llm) as mock_chat_ollama:
        llm = get_chat_llm(temperature=0.2)

    mock_chat_ollama.assert_called_once_with(
        base_url="http://localhost:11434",
        model="gemma4:12b",
        temperature=0.2,
    )
    assert llm is mock_llm


def test_get_chat_llm_returns_gemini_client_when_configured(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.5-flash")
    get_settings.cache_clear()

    mock_llm = MagicMock()
    with patch(
        "src.solve_restaurants.llm.ChatGoogleGenerativeAI", return_value=mock_llm
    ) as mock_chat_gemini:
        llm = get_chat_llm(temperature=0.5)

    mock_chat_gemini.assert_called_once_with(
        model="gemini-3.5-flash",
        google_api_key="google-key",
        temperature=0.5,
    )
    assert llm is mock_llm


def test_get_chat_llm_raises_without_google_api_key_for_gemini(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    get_settings.cache_clear()

    try:
        get_chat_llm()
    except ValueError as error:
        assert "GOOGLE_API_KEY is required" in str(error)
    else:
        assert False, "Expected ValueError for missing GOOGLE_API_KEY"


def test_get_chat_llm_uses_overrides_for_ollama(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    get_settings.cache_clear()

    with patch("src.solve_restaurants.llm.ChatOllama") as mock_chat_ollama:
        get_chat_llm(model="llama3.1", base_url="http://other:11434", temperature=0.7)

    mock_chat_ollama.assert_called_once_with(
        base_url="http://other:11434",
        model="llama3.1",
        temperature=0.7,
    )


def test_get_chat_llm_uses_model_override_for_gemini(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")
    get_settings.cache_clear()

    with patch("src.solve_restaurants.llm.ChatGoogleGenerativeAI") as mock_chat_gemini:
        get_chat_llm(model="gemini-2.5-flash")

    mock_chat_gemini.assert_called_once_with(
        model="gemini-2.5-flash",
        google_api_key="google-key",
        temperature=0.2,
    )


def test_get_chat_llm_uses_stage_specific_model_for_gemini(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")
    monkeypatch.setenv("GEMINI_PLANNER_MODEL", "gemini-2.5-pro")
    get_settings.cache_clear()

    with patch("src.solve_restaurants.llm.ChatGoogleGenerativeAI") as mock_chat_gemini:
        get_chat_llm(temperature=0.2, stage="planner")

    mock_chat_gemini.assert_called_once_with(
        model="gemini-2.5-pro",
        google_api_key="google-key",
        temperature=0.2,
    )


def test_get_chat_llm_stage_falls_back_to_global_gemini_model(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.5-flash")
    monkeypatch.setenv("GEMINI_JUDGE_MODEL", "")  # empty = falsy, falls back to global
    get_settings.cache_clear()

    with patch("src.solve_restaurants.llm.ChatGoogleGenerativeAI") as mock_chat_gemini:
        get_chat_llm(temperature=0.2, stage="judge")

    mock_chat_gemini.assert_called_once_with(
        model="gemini-3.5-flash",
        google_api_key="google-key",
        temperature=0.2,
    )


def test_get_chat_llm_explicit_model_overrides_stage(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-key")
    monkeypatch.setenv("GEMINI_PLANNER_MODEL", "gemini-2.5-pro")
    get_settings.cache_clear()

    with patch("src.solve_restaurants.llm.ChatGoogleGenerativeAI") as mock_chat_gemini:
        get_chat_llm(model="gemini-custom", temperature=0.2, stage="planner")

    mock_chat_gemini.assert_called_once_with(
        model="gemini-custom",
        google_api_key="google-key",
        temperature=0.2,
    )


def test_get_chat_llm_stage_ignored_for_ollama(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    get_settings.cache_clear()

    with patch("src.solve_restaurants.llm.ChatOllama") as mock_chat_ollama:
        get_chat_llm(temperature=0.2, stage="planner")

    mock_chat_ollama.assert_called_once_with(
        base_url="http://localhost:11434",
        model="gemma4:12b",
        temperature=0.2,
    )
