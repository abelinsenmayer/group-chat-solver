import asyncio
from datetime import time
from unittest.mock import patch

from src.solve_restaurants import events
from src.solve_restaurants.graph import create_graph, run_solve_restaurants, start_solve_restaurants
from src.solve_restaurants.state import JudgeVerdict, RestaurantSuggestion, Verdict, person_to_payload
from src.person import Person


def test_graph_compiles():
    graph = create_graph()
    assert "planner" in graph.nodes
    assert "judge" in graph.nodes
    assert "success_check" in graph.nodes


def test_graph_runs_to_consensus_with_mocks():
    people = [
        Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"),
        Person("B", (time(17), time(20)), (40.1, -73.1), "Italian"),
    ]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    suggestion = RestaurantSuggestion(
        id="r1", name="Veggie Spot", address="1 Main", coordinates=(-73.0, 40.0), mapbox_feature={}
    )

    with patch("src.solve_restaurants.graph.planner") as mock_planner:
        mock_planner.return_value = {"suggestions": [suggestion], "verdicts": {}, "logs": []}
        with patch("src.solve_restaurants.graph.judge") as mock_judge:
            mock_judge.return_value = {
                "verdicts": {
                    "A": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
                    "B": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)},
                },
                "logs": [],
            }
            with patch("src.solve_restaurants.graph.run_logger.save_run") as mock_save:
                events.create_run("run-1")
                final_state = asyncio.run(run_solve_restaurants(people, overlap, "run-1"))
                events.discard("run-1")

    assert final_state.result is not None
    assert final_state.result.status == "consensus"
    assert final_state.result.suggestions[0].id == "r1"
    mock_save.assert_called_once()


def test_run_solve_restaurants_passes_run_id_into_state_and_send_payload():
    people = [Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian")]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    suggestion = RestaurantSuggestion(
        id="r1", name="Veggie Spot", address="1 Main", coordinates=(-73.0, 40.0), mapbox_feature={}
    )

    seen_run_ids = []

    def fake_judge(payload):
        seen_run_ids.append(payload["run_id"])
        return {
            "verdicts": {"A": {"r1": JudgeVerdict(verdict=Verdict.APPROVED)}},
            "logs": [],
        }

    with patch("src.solve_restaurants.graph.planner") as mock_planner:
        mock_planner.return_value = {"suggestions": [suggestion], "verdicts": {}, "logs": []}
        with patch("src.solve_restaurants.graph.judge", side_effect=fake_judge):
            with patch("src.solve_restaurants.graph.run_logger.save_run"):
                events.create_run("run-2")
                final_state = asyncio.run(run_solve_restaurants(people, overlap, "run-2"))
                events.discard("run-2")

    assert final_state.run_id == "run-2"
    assert seen_run_ids == ["run-2"]


def test_start_solve_restaurants_uses_the_same_run_id_for_events_and_return_value():
    people = [Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian")]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }

    async def _start():
        with patch("src.solve_restaurants.graph.run_solve_restaurants") as mock_run:
            run_id, task = start_solve_restaurants(people, overlap)
            task.cancel()

            events.subscribe(run_id)  # does not raise: create_run was called with this exact run_id
            events.discard(run_id)
            mock_run.assert_called_once()
            assert mock_run.call_args.args[2] == run_id

    asyncio.run(_start())
