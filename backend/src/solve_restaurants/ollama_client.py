"""Simple chat client used by the LangGraph restaurant solver."""

from .llm import get_chat_llm


def simple_chat_query(
    prompt: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.2,
) -> str:
    """Send a simple user prompt to the configured chat model.

    This uses the same client configuration as the ``planner`` and ``judge``
    nodes in the solve-restaurants LangGraph, so it can be used to verify that
    the model is reachable and responding before running a full solve.
    """
    llm = get_chat_llm(model=model, base_url=base_url, temperature=temperature)
    response = llm.invoke([{"role": "user", "content": prompt}])
    return str(response.content)
