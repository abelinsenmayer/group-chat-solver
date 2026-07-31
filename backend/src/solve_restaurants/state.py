from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel

from src.person import Person
from src.person_json import AvailabilityPayload, LocationPayload, PersonPayload


def merge_dicts(left: dict, right: dict) -> dict:
    merged = left.copy()
    for key, value in right.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


def add_lists(left: list, right: list) -> list:
    return left + right


class RestaurantSuggestion(BaseModel):
    id: str
    name: str
    address: str | None = None
    coordinates: tuple[float, float]
    mapbox_feature: dict


class Verdict(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class JudgeVerdict(BaseModel):
    verdict: Verdict
    short_reason: str | None = None
    feedback: str | None = None


class FinalResult(BaseModel):
    status: Literal["consensus", "no_consensus"]
    suggestions: list[RestaurantSuggestion]


class StepLog(BaseModel):
    node: str
    timestamp: str
    state_snapshot: dict
    notes: list[str]


class SolveRestaurantsState(BaseModel):
    people: list[PersonPayload]
    overlap: dict
    run_id: str = ""
    round: int = 1
    suggestions: list[RestaurantSuggestion] = []
    verdicts: Annotated[dict[str, dict[str, JudgeVerdict]], merge_dicts] = {}
    feedback_summary: str = ""
    result: FinalResult | None = None
    logs: Annotated[list[StepLog], add_lists] = []
    errors: Annotated[list[str], add_lists] = []


def person_to_payload(person: Person) -> PersonPayload:
    return PersonPayload(
        name=person.name,
        availability=AvailabilityPayload(start=person.availability[0], end=person.availability[1]),
        location=LocationPayload(latitude=person.location[0], longitude=person.location[1]),
        preferences=person.preferences,
    )


def suggestion_event_payload(suggestion: RestaurantSuggestion) -> dict:
    """Trim a RestaurantSuggestion down to the fields the frontend needs for
    animation, dropping the (potentially large) raw mapbox_feature blob.
    """
    return {
        "id": suggestion.id,
        "name": suggestion.name,
        "address": suggestion.address,
        "coordinates": list(suggestion.coordinates),
    }
