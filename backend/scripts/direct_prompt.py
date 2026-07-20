import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.models import direct_prompt


def main() -> int:
    parser = argparse.ArgumentParser(description="Send a direct prompt to an AI model backend.")
    parser.add_argument("prompt", help="Prompt text to send to the selected backend.")
    parser.add_argument("--backend", default="ollama", help="Model backend to use.")
    args = parser.parse_args()

    try:
        response = direct_prompt(args.prompt, backend=args.backend)
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    print(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
