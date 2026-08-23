from datetime import time

from src.solve_restaurants.state import (
    FinalResult,
    JudgeResearchQuestions,
    JudgeVerdict,
    ResearchReport,
    RestaurantSuggestion,
    SolveRestaurantsState,
    Verdict,
    person_to_payload,
    suggestion_event_payload,
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
    assert state.research_questions == {}
    assert state.research_reports == {}
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


def test_final_result_accepts_no_restaurants_found_status():
    result = FinalResult(status="no_restaurants_found", suggestions=[])
    assert result.status == "no_restaurants_found"
    assert result.suggestions == []


def test_judge_verdict_rejected_requires_feedback():
    verdict = JudgeVerdict(verdict=Verdict.REJECTED, feedback="too expensive")
    assert verdict.verdict == "rejected"
    assert verdict.feedback == "too expensive"


def test_solve_restaurants_state_defaults_run_id_to_empty_string():
    state = SolveRestaurantsState(people=[], overlap={"type": "Polygon", "coordinates": []})
    assert state.run_id == ""


def test_judge_verdict_defaults_short_reason_to_none():
    verdict = JudgeVerdict(verdict=Verdict.APPROVED)
    assert verdict.short_reason is None


def test_suggestion_event_payload_omits_mapbox_feature():
    suggestion = RestaurantSuggestion(
        id="r1",
        name="Sushi Spot",
        address="123 Main St",
        coordinates=(-73.0, 40.0),
        mapbox_feature={"type": "Feature", "huge": "blob"},
    )
    payload = suggestion_event_payload(suggestion)
    assert payload == {
        "id": "r1",
        "name": "Sushi Spot",
        "address": "123 Main St",
        "coordinates": [-73.0, 40.0],
    }


def test_union_sets_reducer():
    from src.solve_restaurants.state import union_sets

    assert union_sets({"a", "b"}, {"b", "c"}) == {"a", "b", "c"}


def test_state_tracks_past_suggestion_ids():
    state = SolveRestaurantsState(people=[], overlap={"type": "Polygon", "coordinates": []})
    assert state.past_suggestion_ids == set()


def test_judge_research_questions_model():
    qr = JudgeResearchQuestions(questions=["does it have vegetarian options?", "is it expensive?"])
    assert qr.questions == ["does it have vegetarian options?", "is it expensive?"]


def test_research_report_model():
    report = ResearchReport(summary="Vegetarian friendly, mid-priced.", sources=["https://example.com"])
    assert report.summary == "Vegetarian friendly, mid-priced."
    assert report.sources == ["https://example.com"]


def test_state_has_research_fields():
    state = SolveRestaurantsState(people=[], overlap={"type": "Polygon", "coordinates": []}, run_id="run-1")
    assert state.research_questions == {}
    assert state.research_reports == {}
