import asyncio
from datetime import time
from unittest.mock import AsyncMock, patch

from src.solve_restaurants import events
from src.solve_restaurants.graph import run_solve_restaurants
from src.solve_restaurants.state import JudgeVerdict, RestaurantSuggestion, Verdict
from src.person import Person


def _build_suggestion(name: str, suggestion_id: str) -> RestaurantSuggestion:
    return RestaurantSuggestion(
        id=suggestion_id,
        name=name,
        address="1 Main",
        coordinates=(-73.0, 40.0),
        mapbox_feature={},
    )


def _make_people() -> list[Person]:
    return [
        Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"),
        Person("B", (time(17), time(20)), (40.1, -73.1), "Italian"),
    ]


def test_full_graph_reaches_consensus_on_first_round():
    people = _make_people()
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    suggestion = _build_suggestion("Veggie Spot", "r1")

    with patch(
        "src.solve_restaurants.graph.planner",
        new=AsyncMock(return_value={"suggestions": [suggestion], "verdicts": {}, "logs": []}),
    ):
        with patch(
            "src.solve_restaurants.graph.judge",
            new=AsyncMock(
                return_value={
                    "verdicts": {
                        "A": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
                        "B": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
                    },
                    "logs": [],
                }
            ),
        ):
            with patch("src.solve_restaurants.graph.run_logger.save_run"):
                events.create_run("run-1")
                final_state = asyncio.run(run_solve_restaurants(people, overlap, "run-1"))
                events.discard("run-1")

    assert final_state.result is not None
    assert final_state.result.status == "consensus"
    assert final_state.result.suggestions[0].id == "r1"


def test_full_graph_exits_with_no_consensus_after_three_rounds():
    people = _make_people()
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    suggestion = _build_suggestion("Steakhouse", "r1")

    with patch(
        "src.solve_restaurants.graph.planner",
        new=AsyncMock(return_value={"suggestions": [suggestion], "verdicts": {}, "logs": []}),
    ):
        with patch(
            "src.solve_restaurants.graph.judge",
            new=AsyncMock(
                return_value={
                    "verdicts": {
                        "A": {"r1": JudgeVerdict(verdict=Verdict.REJECTED, feedback="not vegetarian")},
                        "B": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
                    },
                    "logs": [],
                }
            ),
        ):
            with patch("src.solve_restaurants.graph.run_logger.save_run"):
                events.create_run("run-2")
                final_state = asyncio.run(run_solve_restaurants(people, overlap, "run-2"))
                events.discard("run-2")

    assert final_state.result is not None
    assert final_state.result.status == "no_consensus"
    assert final_state.round == 4
