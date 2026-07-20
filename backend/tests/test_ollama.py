from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.ollama import direct_prompt


def test_direct_prompt_uses_default_model_and_returns_assistant_content() -> None:
    response = SimpleNamespace(message=SimpleNamespace(content="Local reply"))

    with patch("src.ollama.ollama.chat", return_value=response) as chat:
        assert direct_prompt("Hello") == "Local reply"

    chat.assert_called_once_with(
        model="gemma4:12b",
        messages=[{"role": "user", "content": "Hello"}],
    )


def test_direct_prompt_accepts_explicit_model() -> None:
    response = SimpleNamespace(message=SimpleNamespace(content="Local reply"))

    with patch("src.ollama.ollama.chat", return_value=response) as chat:
        direct_prompt("Hello", model="custom-model")

    assert chat.call_args.kwargs["model"] == "custom-model"


def test_direct_prompt_identifies_model_when_the_sdk_rejects_it() -> None:
    with patch("src.ollama.ollama.chat", side_effect=RuntimeError("model not found")):
        with pytest.raises(RuntimeError, match="custom-model"):
            direct_prompt("Hello", model="custom-model")
