import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ollama

from src.solve_restaurants.config import get_settings
from src.solve_restaurants.ollama_client import simple_chat_query


def _print_available_models(base_url: str) -> None:
    try:
        client = ollama.Client(host=base_url)
        models = [m.model for m in client.list().models]
    except Exception as error:
        print(f"Could not list available models: {error}", file=sys.stderr)
        return

    if models:
        print("Available Ollama models:")
        for name in models:
            print(f"  - {name}")
    else:
        print("No models are currently available in Ollama.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Test that Ollama is reachable through the ChatOllama client used by the conversation solver."
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        default="Say a one-sentence greeting.",
        help="Prompt to send to the model.",
    )
    parser.add_argument("--model", help="Ollama model name.")
    parser.add_argument("--base-url", help="Ollama base URL.")
    parser.add_argument(
        "--temperature", type=float, default=0.2, help="Sampling temperature."
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Print connection details."
    )
    parser.add_argument(
        "--list-models", action="store_true", help="List available Ollama models and exit."
    )
    args = parser.parse_args()

    settings = get_settings()
    model = args.model or settings.ollama_model
    base_url = args.base_url or settings.ollama_base_url

    if args.list_models:
        _print_available_models(base_url)
        return 0

    if args.verbose:
        print(f"base_url: {base_url}")
        print(f"model: {model}")
        print(f"temperature: {args.temperature}")
        print(f"prompt: {args.prompt!r}")
        print("-" * 40)

    try:
        response = simple_chat_query(
            args.prompt,
            model=model,
            base_url=base_url,
            temperature=args.temperature,
        )
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        message = str(error).lower()
        if "not found" in message and ("model" in message or "404" in message):
            _print_available_models(base_url)
        return 1

    print(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
