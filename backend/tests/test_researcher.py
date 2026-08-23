import asyncio
from datetime import time
from unittest.mock import AsyncMock, MagicMock, patch

from langchain.agents.middleware import ToolCallLimitMiddleware

from src.person import Person
from src.solve_restaurants.researcher import _create_web_search_tool, researcher
from src.solve_restaurants.state import ResearchReport, person_to_payload


def _suggestion():
    return {
        "id": "r1",
        "name": "Veggie Spot",
        "address": "1 Main St",
        "coordinates": (-73.0, 40.0),
        "mapbox_feature": {},
    }


def _run_researcher(payload):
    return asyncio.run(researcher(payload))


def test_researcher_deduplicates_questions_and_limits_search_calls():
    suggestion = _suggestion()
    questions_by_person = {
        "A": ["does it have vegetarian options?", "is it expensive?"],
        "B": ["does it have vegetarian options?", "does it have gluten-free pasta?"],
    }

    mock_agent = MagicMock()
    mock_agent.ainvoke = AsyncMock(
        return_value={
            "structured_response": ResearchReport(
                summary="Vegetarian friendly, mid-priced.", sources=["https://example.com"]
            )
        }
    )
    captured: dict[str, object] = {}

    def fake_create_agent(*, system_prompt: str, middleware: list, **kwargs):
        captured["system_prompt"] = system_prompt
        captured["middleware"] = middleware
        return mock_agent

    emitted = []
    with patch(
        "src.solve_restaurants.researcher.events.emit",
        side_effect=lambda run_id, event: emitted.append((run_id, event)),
    ):
        with patch("src.solve_restaurants.researcher.TavilyClient"):
            with patch("src.solve_restaurants.researcher.get_chat_llm"):
                with patch(
                    "src.solve_restaurants.researcher.create_agent",
                    side_effect=fake_create_agent,
                ):
                    with patch(
                        "src.solve_restaurants.researcher.get_settings"
                    ) as mock_get_settings:
                        mock_settings = MagicMock()
                        mock_settings.researcher_search_limit = 2
                        mock_settings.tavily_api_key = "fake"
                        mock_get_settings.return_value = mock_settings
                        result = _run_researcher(
                            {
                                "run_id": "run-1",
                                "suggestion": suggestion,
                                "questions_by_person": questions_by_person,
                            }
                        )

    report = result["research_reports"]["r1"]
    assert report.summary == "Vegetarian friendly, mid-priced."
    assert report.sources == ["https://example.com"]
    assert emitted[0] == (
        "run-1",
        {"type": "researcher_started", "suggestion_id": "r1"},
    )
    assert any(e["type"] == "researcher_done" for _rid, e in emitted)

    system_prompt = captured["system_prompt"]
    assert isinstance(system_prompt, str)
    assert "does it have vegetarian options?" in system_prompt
    assert "is it expensive?" in system_prompt
    assert "does it have gluten-free pasta?" in system_prompt
    assert system_prompt.count("does it have vegetarian options?") == 1

    middleware = captured["middleware"]
    assert isinstance(middleware, list)
    assert len(middleware) == 1
    assert isinstance(middleware[0], ToolCallLimitMiddleware)
    assert middleware[0].tool_name == "web_search"
    assert middleware[0].run_limit == 2


def test_researcher_skips_search_when_no_questions_are_asked():
    suggestion = _suggestion()

    emitted = []
    with patch(
        "src.solve_restaurants.researcher.events.emit",
        side_effect=lambda run_id, event: emitted.append((run_id, event)),
    ):
        with patch("src.solve_restaurants.researcher.TavilyClient") as mock_tavily:
            with patch("src.solve_restaurants.researcher.get_chat_llm") as mock_llm:
                with patch(
                    "src.solve_restaurants.researcher.create_agent"
                ) as mock_create_agent:
                    with patch(
                        "src.solve_restaurants.researcher.get_settings"
                    ) as mock_get_settings:
                        mock_settings = MagicMock()
                        mock_settings.researcher_search_limit = 2
                        mock_settings.tavily_api_key = "fake"
                        mock_get_settings.return_value = mock_settings
                        result = _run_researcher(
                            {
                                "run_id": "run-1",
                                "suggestion": suggestion,
                                "questions_by_person": {},
                            }
                        )

    report = result["research_reports"]["r1"]
    assert report.summary == ""
    assert report.sources == []
    mock_tavily.assert_not_called()
    mock_llm.assert_not_called()
    mock_create_agent.assert_not_called()
    assert any(e["type"] == "researcher_started" for _rid, e in emitted)
    assert any(e["type"] == "researcher_done" for _rid, e in emitted)


def test_researcher_falls_back_on_structured_response_failure():
    suggestion = _suggestion()
    questions_by_person = {"A": ["is it expensive?"]}

    mock_agent = MagicMock()
    mock_agent.ainvoke = AsyncMock(return_value={"structured_response": None, "messages": []})

    with patch("src.solve_restaurants.researcher.events.emit"):
        with patch("src.solve_restaurants.researcher.TavilyClient"):
            with patch("src.solve_restaurants.researcher.get_chat_llm"):
                with patch(
                    "src.solve_restaurants.researcher.create_agent",
                    return_value=mock_agent,
                ):
                    with patch(
                        "src.solve_restaurants.researcher.get_settings"
                    ) as mock_get_settings:
                        mock_settings = MagicMock()
                        mock_settings.researcher_search_limit = 2
                        mock_settings.tavily_api_key = "fake"
                        mock_get_settings.return_value = mock_settings
                        result = _run_researcher(
                            {
                                "run_id": "run-1",
                                "suggestion": suggestion,
                                "questions_by_person": questions_by_person,
                            }
                        )

    report = result["research_reports"]["r1"]
    assert report.summary == "Research could not be completed for this restaurant."
    assert report.sources == []


def test_web_search_tool_returns_joined_content():
    mock_client = MagicMock()
    mock_client.search.return_value = {
        "results": [
            {"content": "great vegetarian menu", "url": "https://example.com/1"},
            {"url": "https://example.com/2"},
        ]
    }

    web_search = _create_web_search_tool(mock_client)
    result = web_search.invoke({"query": "Veggie Spot menu vegetarian"})

    mock_client.search.assert_called_once_with(query="Veggie Spot menu vegetarian", max_results=3)
    assert "great vegetarian menu" in result
    assert "https://example.com/1" in result
    assert "https://example.com/2" not in result
