from datetime import time

from src.solve_restaurants.state import (
    FinalResult,
    JudgeVerdict,
    RestaurantSuggestion,
    SolveRestaurantsState,
    Verdict,
    person_to_payload,
)
from src.solve_restaurants.success_check import route_after_success_check, success_check
from src.person import Person


def _state_with_verdicts(verdicts: dict, round_num: int = 1, feedback: str = "") -> SolveRestaurantsState:
    person_a = person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))
    person_b = person_to_payload(Person("B", (time(17), time(20)), (40.1, -73.1), "Italian"))
    suggestion = RestaurantSuggestion(
        id="r1", name="Spot", address="1 Main", coordinates=(-73.0, 40.0), mapbox_feature={}
    )
    return SolveRestaurantsState(
        people=[person_a, person_b],
        overlap={},
        round=round_num,
        suggestions=[suggestion],
        verdicts=verdicts,
        feedback_summary=feedback,
    )


def _apply_node_result(state: SolveRestaurantsState, result: dict) -> SolveRestaurantsState:
    if "result" in result:
        state.result = result["result"]
    if "round" in result:
        state.round = result["round"]
    if "feedback_summary" in result:
        state.feedback_summary = result["feedback_summary"]
    return state


def test_success_check_finds_consensus():
    verdicts = {
        "A": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
        "B": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
    }
    state = _state_with_verdicts(verdicts)
    result = success_check(state)
    assert result["result"].status == "consensus"
    assert result["result"].suggestions[0].id == "r1"
    assert route_after_success_check(_apply_node_result(state, result)) == "__end__"


def test_success_check_loops_when_no_consensus():
    verdicts = {
        "A": {"r1": JudgeVerdict(verdict=Verdict.REJECTED, feedback="not vegetarian")},
        "B": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
    }
    state = _state_with_verdicts(verdicts, round_num=1)
    result = success_check(state)
    assert result["result"] is None
    assert result["round"] == 2
    assert "not vegetarian" in result["feedback_summary"]
    assert route_after_success_check(_apply_node_result(state, result)) == "planner"


def test_success_check_exits_after_three_rounds():
    verdicts = {
        "A": {"r1": JudgeVerdict(verdict=Verdict.REJECTED, feedback="not vegetarian")},
        "B": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
    }
    state = _state_with_verdicts(verdicts, round_num=3)
    result = success_check(state)
    assert result["result"].status == "no_consensus"
    assert result["result"].suggestions == []
    assert result["round"] == 4
    assert route_after_success_check(_apply_node_result(state, result)) == "__end__"
