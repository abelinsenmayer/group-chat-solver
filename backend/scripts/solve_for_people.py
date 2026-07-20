"""CLI for calling solve_group_chat with selected sample people."""

import argparse
import importlib.util
import sys
from pathlib import Path

from src.person import Person
from src.solver import solve_group_chat


def _load_sample_people() -> list[Person]:
    sample_data_path = Path(__file__).resolve().parent.parent / "sample-data" / "sample_people.py"
    spec = importlib.util.spec_from_file_location("sample_people", sample_data_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load sample_people.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.sample_people


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run solve_group_chat for the named sample people."
    )
    parser.add_argument(
        "names",
        nargs="+",
        help="First names of the sample people to include, e.g. Elena James Priya",
    )

    args = parser.parse_args()

    sample_people = _load_sample_people()
    selected: list[Person] = []
    available_names = [p.name for p in sample_people]

    for name in args.names:
        matches = [p for p in sample_people if p.name.lower() == name.lower()]
        if not matches:
            print(
                f"Error: '{name}' not found in sample data. "
                f"Available: {', '.join(available_names)}",
                file=sys.stderr,
            )
            return 1
        selected.extend(matches)

    result = solve_group_chat(selected)
    print(f"Involved: {', '.join(p.name for p in selected)}")
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
