"""Ollama client utilities used by the LangGraph restaurant solver."""

from langchain_ollama import ChatOllama

from .config import get_settings


def simple_chat_query(
    prompt: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.2,
) -> str:
    """Send a simple user prompt to Ollama via ``ChatOllama``.

    This uses the same client configuration as the ``planner`` and ``judge``
    nodes in the solve-restaurants LangGraph, so it can be used to verify that
    the model is reachable and responding before running a full solve.
    """
    settings = get_settings()
    llm = ChatOllama(
        base_url=base_url or settings.ollama_base_url,
        model=model or settings.ollama_model,
        temperature=temperature,
    )
    response = llm.invoke([{"role": "user", "content": prompt}])
    return str(response.content)
