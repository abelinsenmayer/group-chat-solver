from collections.abc import Callable
from importlib import import_module


def _ollama_prompt(prompt: str) -> str:
    return import_module("src.ollama").direct_prompt(prompt)


_BACKENDS: dict[str, Callable[[str], str]] = {
    "ollama": _ollama_prompt,
}


def direct_prompt(prompt: str, backend: str = "ollama") -> str:
    try:
        prompt_backend = _BACKENDS[backend]
    except KeyError as error:
        raise ValueError(f"Unsupported model backend: {backend}") from error
    return prompt_backend(prompt)
