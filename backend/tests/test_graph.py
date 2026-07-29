import asyncio
from datetime import time
from unittest.mock import patch

from src.solve_restaurants.graph import create_graph, run_solve_restaurants
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
                final_state = asyncio.run(run_solve_restaurants(people, overlap))

    assert final_state.result is not None
    assert final_state.result.status == "consensus"
    assert final_state.result.suggestions[0].id == "r1"
    mock_save.assert_called_once()
