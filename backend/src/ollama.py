import ollama


def direct_prompt(prompt: str, model: str = "gemma4:12b") -> str:
    try:
        response = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as error:
        raise RuntimeError(f"Ollama request failed for model '{model}': {error}") from error
    return response.message.content
