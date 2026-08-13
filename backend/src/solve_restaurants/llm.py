"""Factory for the LangChain chat model used by the restaurant solver.

The provider is selected from ``Settings.ai_provider`` (``ollama`` or ``gemini``),
with Ollama remaining the default so local development continues to work unchanged.
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama

from .config import get_settings


def get_chat_llm(
    *,
    model: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.2,
):
    """Return a LangChain chat model configured from the environment.

    Args:
        model: Override the model name. Falls back to ``gemini_model`` or
            ``ollama_model`` depending on the active provider.
        base_url: Override the Ollama base URL. Ignored when using Gemini.
        temperature: Sampling temperature for model responses.

    Raises:
        ValueError: If ``ai_provider`` is not supported or if Gemini is selected
            without a Google API key.
    """
    settings = get_settings()

    if settings.ai_provider == "gemini":
        if not settings.google_api_key:
            raise ValueError(
                "GOOGLE_API_KEY is required when AI_PROVIDER is set to 'gemini'"
            )
        return ChatGoogleGenerativeAI(
            model=model or settings.gemini_model,
            google_api_key=settings.google_api_key,
            temperature=temperature,
        )

    return ChatOllama(
        base_url=base_url or settings.ollama_base_url,
        model=model or settings.ollama_model,
        temperature=temperature,
    )
