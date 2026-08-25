from pathlib import Path
from Levenshtein import ratio
from src.person import Person


def load_security_rules() -> str:
    """Load security rules which should be included in every LLM prompt."""
    return (Path(__file__).parent / "prompts" / "security_rules.md").read_text(
        encoding="utf-8"
    )


def check_people_for_input_risks(people: list[Person]) -> None:
    for person in people:
        if contains_prompt_injection_risk(person.name):
            raise ValueError(f"Person name '{person.name}' contains prompt injection risk")
        if contains_prompt_injection_risk(person.preferences):
            raise ValueError(f"Person preferences '{person.preferences}' contains prompt injection risk")


def contains_prompt_injection_risk(input: str) -> bool:
    """Check if the input contains prompt injection risks."""
    dangerous_words = [
        "ignore",
        "bypass",
        "instructions",
        "forget",
        "reveal",
        "delete",
        "system",
        "override",
    ]
    input_lower = input.lower()
    for word in dangerous_words:
        if ratio(word, input_lower) >= 0.8:
            return True
    return False
