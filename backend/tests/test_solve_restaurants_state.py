from datetime import time

from src.solve_restaurants.state import (
    FinalResult,
    JudgeVerdict,
    RestaurantSuggestion,
    SolveRestaurantsState,
    Verdict,
    person_to_payload,
)
from src.person import Person


def test_person_to_payload_conversion():
    person = Person("Alice", (time(17, 0), time(20, 0)), (40.0, -73.0), "vegetarian")
    payload = person_to_payload(person)
    assert payload.name == "Alice"
    assert payload.availability.start == time(17, 0)
    assert payload.availability.end == time(20, 0)
    assert payload.location.latitude == 40.0
    assert payload.location.longitude == -73.0
    assert payload.preferences == "vegetarian"


def test_solve_restaurants_state_defaults():
    state = SolveRestaurantsState(people=[], overlap={"type": "Polygon", "coordinates": []})
    assert state.round == 1
    assert state.suggestions == []
    assert state.verdicts == {}
    assert state.feedback_summary == ""
    assert state.result is None
    assert state.logs == []
    assert state.errors == []


def test_final_result_serialization():
    suggestion = RestaurantSuggestion(
        id="r1",
        name="Sushi Spot",
        address="123 Main St",
        coordinates=(-73.0, 40.0),
        mapbox_feature={"type": "Feature"},
    )
    result = FinalResult(status="consensus", suggestions=[suggestion])
    assert result.model_dump()["status"] == "consensus"
    assert result.model_dump()["suggestions"][0]["name"] == "Sushi Spot"


def test_judge_verdict_rejected_requires_feedback():
    verdict = JudgeVerdict(verdict=Verdict.REJECTED, feedback="too expensive")
    assert verdict.verdict == "rejected"
    assert verdict.feedback == "too expensive"
