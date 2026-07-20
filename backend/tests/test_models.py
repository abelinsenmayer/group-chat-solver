from datetime import time
from unittest.mock import patch

import pytest

from src.models import direct_prompt
from src.person import Person


def test_preserves_meal_planning_inputs() -> None:
    availability = (time(16, 0), time(22, 0))
    location = (41.8781, -87.6298)

    person = Person(
        name="Alex",
        availability=availability,
        location=location,
        preferences="Must have gluten-free options",
    )

    assert person.name == "Alex"
    assert person.availability == availability
    assert person.location == location
    assert person.preferences == "Must have gluten-free options"


def test_direct_prompt_uses_ollama_by_default() -> None:
    with patch("src.models._BACKENDS", {"ollama": lambda prompt: "Reply"}):
        assert direct_prompt("Hello") == "Reply"


def test_direct_prompt_rejects_unknown_backend() -> None:
    with pytest.raises(ValueError, match="Unsupported model backend: unknown"):
        direct_prompt("Hello", backend="unknown")
