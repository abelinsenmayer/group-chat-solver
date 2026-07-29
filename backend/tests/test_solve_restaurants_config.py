import os

from src.solve_restaurants.config import Settings, get_settings


def test_settings_load_required_env_vars(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "mapbox-token")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-key")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.mapbox_access_token == "mapbox-token"
    assert settings.tavily_api_key == "tavily-key"
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_model == "gemma4:12b"
    assert settings.log_dir.endswith(os.path.join("logs", "runs"))
