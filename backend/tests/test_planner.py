import asyncio
from datetime import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.solve_restaurants.planner import (
    NoRestaurantsFoundError,
    PlannerSelectionError,
    SelectedSuggestion,
    SuggestionSelection,
    _create_search_tool,
    _planner_system_prompt,
    planner,
)
from src.solve_restaurants.state import SolveRestaurantsState, person_to_payload
from src.person import Person


def _run__run_planner(state):
    return asyncio.run(_run_planner(state))


def test_suggestion_selection_uses_gemini_compatible_coordinate_schema():
    schema = SuggestionSelection.model_json_schema()
    coordinates = schema["$defs"]["SelectedSuggestion"]["properties"]["coordinates"]

    assert coordinates["items"] == {"type": "number"}
    assert coordinates["minItems"] == 2
    assert coordinates["maxItems"] == 2
    assert "prefixItems" not in coordinates


def test_search_restaurants_tool_formats_results():
    raw_features = [
        {
            "properties": {
                "mapbox_id": "abc123",
                "name": "Test Place",
                "address": "123 Main St",
                "coordinates": {"longitude": -73.0, "latitude": 40.0},
            }
        }
    ]
    polygon_coords = [(-74.0, 40.0), (-72.0, 40.0), (-72.0, 41.0), (-74.0, 41.0)]
    accumulated_features: list[dict] = []

    with patch(
        "src.solve_restaurants.planner.find_pois_in_polygon", return_value=raw_features
    ) as mock_pois:
        search_tool = _create_search_tool(polygon_coords, accumulated_features)
        result = search_tool.invoke({"query": "vegetarian", "category": "restaurant"})

    mock_pois.assert_called_once_with(
        polygon_coords=polygon_coords,
        search_term="vegetarian",
        limit=10,
        category="restaurant",
    )
    assert "Test Place" in result
    assert "abc123" in result
    assert accumulated_features == raw_features


def test_search_restaurants_tool_returns_error_string_on_exception():
    polygon_coords = [(-74.0, 40.0), (-72.0, 40.0), (-72.0, 41.0), (-74.0, 41.0)]
    accumulated_features: list[dict] = []

    with patch(
        "src.solve_restaurants.planner.find_pois_in_polygon", side_effect=RuntimeError("boom")
    ):
        search_tool = _create_search_tool(polygon_coords, accumulated_features)
        result = search_tool.invoke({"query": "vegetarian"})

    assert "Error searching for restaurants" in result
    assert "boom" in result
    assert accumulated_features == []


def test_planner_returns_agent_selected_suggestions():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    state = SolveRestaurantsState(people=people, overlap=overlap)

    raw_features = [
        {
            "properties": {
                "mapbox_id": f"r{i}",
                "name": f"Restaurant {i}",
                "address": f"{i} Main St",
                "coordinates": {"longitude": -73.0, "latitude": 40.0},
            }
        }
        for i in range(3)
    ]
    selected_from_llm = [
        SelectedSuggestion(
            id=f"r{i}", name=f"Restaurant {i}", address=f"{i} Main St", coordinates=(-73.0, 40.0)
        )
        for i in range(3)
    ]

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {
        "structured_response": SuggestionSelection(selected=selected_from_llm)
    }

    def fake_create_agent(*, tools, **kwargs):
        # Simulate the LLM calling search_restaurants before finalizing its selection.
        tools[0].invoke({"query": "vegetarian"})
        return mock_agent

    with patch("src.solve_restaurants.planner.find_pois_in_polygon", return_value=raw_features):
        with patch("src.solve_restaurants.planner.get_chat_llm"):
            with patch(
                "src.solve_restaurants.planner.create_agent", side_effect=fake_create_agent
            ) as mock_create_agent:
                result = _run_planner(state)

    mock_create_agent.assert_called_once()
    _, kwargs = mock_create_agent.call_args
    assert kwargs["response_format"] is SuggestionSelection
    assert len(kwargs["middleware"]) == 1
    assert len(result["suggestions"]) == 3
    assert result["suggestions"][0].mapbox_feature == raw_features[0]
    assert result["verdicts"] == {}
    assert len(result["logs"]) == 1


def test_planner_skips_selections_with_unknown_mapbox_id():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    state = SolveRestaurantsState(people=people, overlap=overlap)

    raw_features = [
        {
            "properties": {
                "mapbox_id": "r0",
                "name": "Restaurant 0",
                "address": "0 Main St",
                "coordinates": {"longitude": -73.0, "latitude": 40.0},
            }
        }
    ]
    selected_from_llm = [
        SelectedSuggestion(id="r0", name="Restaurant 0", address="0 Main St", coordinates=(-73.0, 40.0)),
        SelectedSuggestion(
            id="hallucinated", name="Made Up Place", address="nowhere", coordinates=(0.0, 0.0)
        ),
    ]

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {
        "structured_response": SuggestionSelection(selected=selected_from_llm)
    }

    def fake_create_agent(*, tools, **kwargs):
        tools[0].invoke({"query": "vegetarian"})
        return mock_agent

    with patch("src.solve_restaurants.planner.find_pois_in_polygon", return_value=raw_features):
        with patch("src.solve_restaurants.planner.get_chat_llm"):
            with patch("src.solve_restaurants.planner.create_agent", side_effect=fake_create_agent):
                result = _run_planner(state)

    assert len(result["suggestions"]) == 1
    assert result["suggestions"][0].id == "r0"


def test_planner_recovers_structured_response_when_agent_returns_none():
    """Regression test for a langchain create_agent bug: when the model calls the
    structured-output tool more than once in the same turn (alongside other tool calls),
    the agent graph exits without ever setting `structured_response`, even if one of the
    duplicate calls had perfectly valid args. The planner should salvage it from the raw
    message history instead of crashing or discarding valid suggestions.
    """
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    state = SolveRestaurantsState(people=people, overlap=overlap)

    raw_features = [
        {
            "properties": {
                "mapbox_id": "mapbox_id_1",
                "name": "Restaurant 1",
                "address": "123 Main St",
                "coordinates": {"longitude": 12.34, "latitude": 56.78},
            }
        }
    ]

    # Mirrors the real AIMessage.tool_calls shape logged from the buggy run: two
    # duplicate SuggestionSelection calls alongside a search_restaurants call.
    buggy_ai_message = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "search_restaurants",
                "args": {"query": "vegetarian", "category": "restaurant"},
                "id": "call_1",
                "type": "tool_call",
            },
            {
                "name": "SuggestionSelection",
                "args": {
                    "selected": [
                        {
                            "id": "mapbox_id_1",
                            "name": "Restaurant 1",
                            "coordinates": [12.34, 56.78],
                            "address": "123 Main St",
                        }
                    ]
                },
                "id": "call_2",
                "type": "tool_call",
            },
            {
                "name": "SuggestionSelection",
                "args": {"selected": []},
                "id": "call_3",
                "type": "tool_call",
            },
        ],
    )

    mock_agent = MagicMock(ainvoke=AsyncMock())
    # No "structured_response" key at all - this is the bug being reproduced.
    mock_agent.ainvoke.return_value = {
        "messages": [HumanMessage(content="Find restaurants."), buggy_ai_message]
    }

    def fake_create_agent(*, tools, **kwargs):
        tools[0].invoke({"query": "vegetarian"})
        return mock_agent

    with patch("src.solve_restaurants.planner.find_pois_in_polygon", return_value=raw_features):
        with patch("src.solve_restaurants.planner.get_chat_llm"):
            with patch("src.solve_restaurants.planner.create_agent", side_effect=fake_create_agent):
                result = _run_planner(state)

    assert len(result["suggestions"]) == 1
    assert result["suggestions"][0].id == "mapbox_id_1"


def test_planner_emits_started_and_suggestions_events():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    state = SolveRestaurantsState(people=people, overlap=overlap, run_id="run-1", round=2)

    raw_features = [
        {
            "properties": {
                "mapbox_id": "r0",
                "name": "Restaurant 0",
                "address": "0 Main St",
                "coordinates": {"longitude": -73.0, "latitude": 40.0},
            }
        }
    ]
    selected_from_llm = [
        SelectedSuggestion(id="r0", name="Restaurant 0", address="0 Main St", coordinates=(-73.0, 40.0))
    ]

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {
        "structured_response": SuggestionSelection(selected=selected_from_llm)
    }

    def fake_create_agent(*, tools, **kwargs):
        tools[0].invoke({"query": "vegetarian"})
        return mock_agent

    emitted = []
    with patch(
        "src.solve_restaurants.planner.events.emit",
        side_effect=lambda run_id, event: emitted.append((run_id, event)),
    ):
        with patch("src.solve_restaurants.planner.find_pois_in_polygon", return_value=raw_features):
            with patch("src.solve_restaurants.planner.get_chat_llm"):
                with patch("src.solve_restaurants.planner.create_agent", side_effect=fake_create_agent):
                    _run_planner(state)

    assert emitted[0] == ("run-1", {"type": "planner_started", "round": 2})
    assert emitted[1] == (
        "run-1",
        {
            "type": "planner_suggestions",
            "round": 2,
            "suggestions": [
                {"id": "r0", "name": "Restaurant 0", "address": "0 Main St", "coordinates": [-73.0, 40.0]}
            ],
        },
    )


def test_planner_raises_when_no_suggestions_selected():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    state = SolveRestaurantsState(people=people, overlap=overlap)

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {"structured_response": SuggestionSelection(selected=[])}

    with patch("src.solve_restaurants.planner.get_chat_llm"):
        with patch("src.solve_restaurants.planner.create_agent", return_value=mock_agent):
            with pytest.raises(NoRestaurantsFoundError):
                _run_planner(state)


def test_search_restaurants_tool_filters_excluded_ids():
    raw_features = [
        {
            "properties": {
                "mapbox_id": "abc123",
                "name": "Test Place",
                "address": "123 Main St",
                "coordinates": {"longitude": -73.0, "latitude": 40.0},
            }
        },
        {
            "properties": {
                "mapbox_id": "excluded-id",
                "name": "Old Place",
                "address": "456 Old St",
                "coordinates": {"longitude": -73.1, "latitude": 40.1},
            }
        },
    ]
    polygon_coords = [(-74.0, 40.0), (-72.0, 40.0), (-72.0, 41.0), (-74.0, 41.0)]
    accumulated_features: list[dict] = []

    with patch(
        "src.solve_restaurants.planner.find_pois_in_polygon", return_value=raw_features
    ) as mock_pois:
        search_tool = _create_search_tool(
            polygon_coords, accumulated_features, excluded_ids={"excluded-id"}
        )
        result = search_tool.invoke({"query": "vegetarian", "category": "restaurant"})

    mock_pois.assert_called_once_with(
        polygon_coords=polygon_coords,
        search_term="vegetarian",
        limit=10,
        category="restaurant",
    )
    assert "Test Place" in result
    assert "abc123" in result
    assert "Old Place" not in result
    assert "excluded-id" not in result
    assert len(accumulated_features) == 1
    assert accumulated_features[0]["properties"]["mapbox_id"] == "abc123"


def test_planner_skips_previously_selected_ids_and_returns_them():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    overlap = {
        "type": "Polygon",
        "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
    }
    state = SolveRestaurantsState(
        people=people, overlap=overlap, past_suggestion_ids={"r0"}
    )

    raw_features = [
        {
            "properties": {
                "mapbox_id": "r0",
                "name": "Restaurant 0",
                "address": "0 Main St",
                "coordinates": {"longitude": -73.0, "latitude": 40.0},
            }
        },
        {
            "properties": {
                "mapbox_id": "r1",
                "name": "Restaurant 1",
                "address": "1 Main St",
                "coordinates": {"longitude": -73.0, "latitude": 40.0},
            }
        },
    ]
    selected_from_llm = [
        SelectedSuggestion(id="r0", name="Restaurant 0", address="0 Main St", coordinates=(-73.0, 40.0)),
        SelectedSuggestion(id="r1", name="Restaurant 1", address="1 Main St", coordinates=(-73.0, 40.0)),
    ]

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {
        "structured_response": SuggestionSelection(selected=selected_from_llm)
    }

    def fake_create_agent(*, tools, **kwargs):
        tools[0].invoke({"query": "vegetarian"})
        return mock_agent

    with patch("src.solve_restaurants.planner.find_pois_in_polygon", return_value=raw_features):
        with patch("src.solve_restaurants.planner.get_chat_llm"):
            with patch(
                "src.solve_restaurants.planner.create_agent", side_effect=fake_create_agent
            ):
                result = _run_planner(state)

    assert len(result["suggestions"]) == 1
    assert result["suggestions"][0].id == "r1"
    assert result["past_suggestion_ids"] == {"r1"}


def test_planner_system_prompt_lists_excluded_ids():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    prompt = _planner_system_prompt(people, "", excluded_ids={"old-id"})
    assert "Previously suggested restaurants" in prompt
    assert "old-id" in prompt
    assert "do NOT select these again" in prompt


def test_planner_system_prompt_coaches_empty_selection_when_no_restaurants():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    prompt = _planner_system_prompt(people, "")
    assert "selected: []" in prompt
    assert "cannot find any" in prompt.lower()


def test_planner_system_prompt_omits_excluded_section_when_empty():
    people = [person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))]
    prompt = _planner_system_prompt(people, "")
    assert "Previously suggested restaurants" not in prompt
