import asyncio
from datetime import time
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from src.solve_restaurants.judge import _create_web_search_tool, judge
from src.solve_restaurants.state import JudgeVerdict, RestaurantSuggestion, Verdict, person_to_payload
from src.person import Person


def _run__run_judge(payload):
    return asyncio.run(_run_judge(payload))


def _person():
    return person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))


def _suggestion():
    return RestaurantSuggestion(
        id="r1", name="Veggie Spot", address="1 Main St", coordinates=(-73.0, 40.0), mapbox_feature={}
    )


def test_web_search_tool_returns_joined_content():
    mock_client = MagicMock()
    mock_client.search.return_value = {"results": [{"content": "great vegetarian menu"}]}

    web_search = _create_web_search_tool(mock_client)
    result = web_search.invoke({"query": "Veggie Spot menu vegetarian"})

    mock_client.search.assert_called_once_with(query="Veggie Spot menu vegetarian", max_results=3)
    assert "great vegetarian menu" in result


def test_web_search_tool_returns_error_string_on_exception():
    mock_client = MagicMock()
    mock_client.search.side_effect = RuntimeError("boom")

    web_search = _create_web_search_tool(mock_client)
    result = web_search.invoke({"query": "Veggie Spot"})

    assert "Error researching restaurant" in result
    assert "boom" in result


def test_judge_approves_suggestion_when_agent_returns_approved():
    person = _person()
    suggestion = _suggestion()

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {
        "structured_response": JudgeVerdict(verdict=Verdict.APPROVED, feedback=None)
    }

    with patch("src.solve_restaurants.judge.TavilyClient"):
        with patch("src.solve_restaurants.judge.get_chat_llm"):
            with patch(
                "src.solve_restaurants.judge.create_agent", return_value=mock_agent
            ) as mock_create_agent:
                result = _run_judge({"person": person.model_dump(), "suggestions": [suggestion.model_dump()]})

    mock_create_agent.assert_called_once()
    _, kwargs = mock_create_agent.call_args
    assert kwargs["response_format"] is JudgeVerdict
    assert len(kwargs["middleware"]) == 1
    assert result["verdicts"]["A"]["r1"].verdict == Verdict.APPROVED
    assert len(result["logs"]) == 1
    assert result["errors"] == []


def test_judge_rejects_and_logs_error_on_agent_exception():
    person = _person()
    suggestion = _suggestion()

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.side_effect = RuntimeError("agent exploded")

    with patch("src.solve_restaurants.judge.TavilyClient"):
        with patch("src.solve_restaurants.judge.get_chat_llm"):
            with patch("src.solve_restaurants.judge.create_agent", return_value=mock_agent):
                result = _run_judge({"person": person.model_dump(), "suggestions": [suggestion.model_dump()]})

    verdict = result["verdicts"]["A"]["r1"]
    assert verdict.verdict == Verdict.REJECTED
    assert "agent exploded" in verdict.feedback
    assert len(result["errors"]) == 1
    assert "r1" in result["errors"][0]


def test_judge_emits_evaluating_and_verdict_events():
    person = _person()
    suggestion = _suggestion()

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {
        "structured_response": JudgeVerdict(
            verdict=Verdict.REJECTED, short_reason="Too expensive!", feedback="Prices are high for this budget."
        )
    }

    emitted = []
    with patch(
        "src.solve_restaurants.judge.events.emit",
        side_effect=lambda run_id, event: emitted.append((run_id, event)),
    ):
        with patch("src.solve_restaurants.judge.TavilyClient"):
            with patch("src.solve_restaurants.judge.get_chat_llm"):
                with patch("src.solve_restaurants.judge.create_agent", return_value=mock_agent):
                    _run_judge(
                        {
                            "run_id": "run-1",
                            "person": person.model_dump(),
                            "suggestions": [suggestion.model_dump()],
                        }
                    )

    assert emitted[0] == ("run-1", {"type": "judge_evaluating", "person": "A", "suggestion_id": "r1"})
    assert emitted[1] == (
        "run-1",
        {
            "type": "judge_verdict",
            "person": "A",
            "suggestion_id": "r1",
            "verdict": "rejected",
            "short_reason": "Too expensive!",
            "feedback": "Prices are high for this budget.",
        },
    )


def test_judge_defaults_run_id_when_missing_from_payload():
    person = _person()
    suggestion = _suggestion()

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {
        "structured_response": JudgeVerdict(verdict=Verdict.APPROVED)
    }

    with patch("src.solve_restaurants.judge.events.emit") as mock_emit:
        with patch("src.solve_restaurants.judge.TavilyClient"):
            with patch("src.solve_restaurants.judge.get_chat_llm"):
                with patch("src.solve_restaurants.judge.create_agent", return_value=mock_agent):
                    _run_judge({"person": person.model_dump(), "suggestions": [suggestion.model_dump()]})

    assert mock_emit.call_args_list[0].args[0] == ""


def test_judge_recovers_structured_response_when_agent_returns_none():
    """Regression test mirroring the planner's create_agent bug workaround: when the
    structured-output tool is called more than once alongside other tool calls, the
    agent graph exits without setting `structured_response`. Judge should salvage a
    valid verdict from the raw message history instead of discarding it.
    """
    person = _person()
    suggestion = _suggestion()

    buggy_ai_message = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "web_search",
                "args": {"query": "Veggie Spot vegetarian"},
                "id": "call_1",
                "type": "tool_call",
            },
            {
                "name": "JudgeVerdict",
                "args": {"verdict": "approved", "feedback": None},
                "id": "call_2",
                "type": "tool_call",
            },
            {
                "name": "JudgeVerdict",
                "args": {"verdict": "rejected", "feedback": "duplicate call"},
                "id": "call_3",
                "type": "tool_call",
            },
        ],
    )

    mock_agent = MagicMock(ainvoke=AsyncMock())
    mock_agent.ainvoke.return_value = {
        "messages": [HumanMessage(content="Judge this restaurant."), buggy_ai_message]
    }

    with patch("src.solve_restaurants.judge.TavilyClient"):
        with patch("src.solve_restaurants.judge.get_chat_llm"):
            with patch("src.solve_restaurants.judge.create_agent", return_value=mock_agent):
                result = _run_judge({"person": person.model_dump(), "suggestions": [suggestion.model_dump()]})

    verdict = result["verdicts"]["A"]["r1"]
    assert verdict.verdict == Verdict.REJECTED
    assert verdict.feedback == "duplicate call"
    assert result["errors"] == []
