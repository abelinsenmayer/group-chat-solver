import os

import pytest


@pytest.fixture(autouse=True)
def default_env_vars(monkeypatch):
    if "MAPBOX_ACCESS_TOKEN" not in os.environ:
        monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token")
    if "TAVILY_API_KEY" not in os.environ:
        monkeypatch.setenv("TAVILY_API_KEY", "test-tavily-key")
    from src.solve_restaurants.config import get_settings
    get_settings.cache_clear()
