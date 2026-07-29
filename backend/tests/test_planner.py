from datetime import time
from unittest.mock import MagicMock, patch

from src.solve_restaurants.planner import build_query, planner
from src.solve_restaurants.state import RestaurantSuggestion, SolveRestaurantsState, person_to_payload
from src.person import Person


def test_build_query_combines_preferences_and_feedback():
    people = [
        person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian")),
        person_to_payload(Person("B", (time(17), time(20)), (40.1, -73.1), "Italian")),
    ]
    query = build_query(people, "previous feedback")
    assert "vegetarian" in query
    assert "Italian" in query
    assert "previous feedback" in query


def test_planner_returns_exactly_five_suggestions():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    state = SolveRestaurantsState(people=people, overlap=overlap)

    raw_features = [
        {
            "properties": {"name": f"Restaurant {i}", "address": f"{i} Main St"},
            "geometry": {"type": "Point", "coordinates": [-73.0, 40.0]},
        }
        for i in range(10)
    ]
    selected = [
        RestaurantSuggestion(
            id=f"r{i}",
            name=f"Restaurant {i}",
            address=f"{i} Main St",
            coordinates=(-73.0, 40.0),
            mapbox_feature=raw_features[i],
        )
        for i in range(5)
    ]

    with patch("src.solve_restaurants.planner.find_pois_in_polygon", return_value=raw_features) as mock_pois:
        with patch("src.solve_restaurants.planner.ChatOllama") as mock_llm:
            mock_chain = MagicMock()
            mock_chain.invoke.return_value = MagicMock(selected=selected)
            mock_llm.return_value.with_structured_output.return_value = mock_chain
            result = planner(state)

    mock_pois.assert_called_once()
    assert len(result["suggestions"]) == 5
    assert result["verdicts"] == {}
