import asyncio
from datetime import time
from unittest.mock import AsyncMock, patch

from src.person import Person
from src.solve_restaurants.question_gatherer import question_gatherer
from src.solve_restaurants.state import JudgeResearchQuestions, person_to_payload


def _person():
    return person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))


def _suggestion():
    return {
        "id": "r1",
        "name": "Veggie Spot",
        "address": "1 Main St",
        "coordinates": (-73.0, 40.0),
        "mapbox_feature": {},
    }


def _run_question_gatherer(payload):
    return asyncio.run(question_gatherer(payload))


def test_question_gatherer_returns_structured_questions():
    person = _person()
    suggestion = _suggestion()

    mock_agent = AsyncMock()
    mock_agent.ainvoke.return_value = {
        "structured_response": JudgeResearchQuestions(questions=["does it have vegetarian options?"])
    }

    emitted = []
    with patch(
        "src.solve_restaurants.question_gatherer.events.emit",
        side_effect=lambda run_id, event: emitted.append((run_id, event)),
    ):
        with patch("src.solve_restaurants.question_gatherer.get_chat_llm"):
            with patch(
                "src.solve_restaurants.question_gatherer.create_agent",
                return_value=mock_agent,
            ):
                result = _run_question_gatherer(
                    {"run_id": "run-1", "person": person.model_dump(), "suggestion": suggestion}
                )

    assert result["research_questions"]["r1"]["A"] == ["does it have vegetarian options?"]
    assert emitted[0] == (
        "run-1",
        {"type": "judge_questioning", "person": "A", "suggestion_id": "r1"},
    )


def test_question_gatherer_falls_back_to_empty_list_when_no_structured_response():
    person = _person()
    suggestion = _suggestion()

    mock_agent = AsyncMock()
    mock_agent.ainvoke.return_value = {"structured_response": None, "messages": []}

    with patch("src.solve_restaurants.question_gatherer.events.emit"):
        with patch("src.solve_restaurants.question_gatherer.get_chat_llm"):
            with patch(
                "src.solve_restaurants.question_gatherer.create_agent",
                return_value=mock_agent,
            ):
                result = _run_question_gatherer(
                    {"run_id": "run-1", "person": person.model_dump(), "suggestion": suggestion}
                )

    assert result["research_questions"]["r1"]["A"] == []


def test_question_gatherer_returns_empty_questions_on_agent_error():
    person = _person()
    suggestion = _suggestion()

    mock_agent = AsyncMock()
    mock_agent.ainvoke.side_effect = RuntimeError("model unavailable")

    emitted = []
    with patch(
        "src.solve_restaurants.question_gatherer.events.emit",
        side_effect=lambda run_id, event: emitted.append((run_id, event)),
    ):
        with patch("src.solve_restaurants.question_gatherer.get_chat_llm"):
            with patch(
                "src.solve_restaurants.question_gatherer.create_agent",
                return_value=mock_agent,
            ):
                result = _run_question_gatherer(
                    {"run_id": "run-1", "person": person.model_dump(), "suggestion": suggestion}
                )

    assert result["research_questions"]["r1"]["A"] == []
    assert any(e["type"] == "judge_questioning" for _rid, e in emitted)


def test_question_gatherer_includes_node_log():
    person = _person()
    suggestion = _suggestion()

    mock_agent = AsyncMock()
    mock_agent.ainvoke.return_value = {
        "structured_response": JudgeResearchQuestions(questions=["is it expensive?"])
    }

    with patch("src.solve_restaurants.question_gatherer.events.emit"):
        with patch("src.solve_restaurants.question_gatherer.get_chat_llm"):
            with patch(
                "src.solve_restaurants.question_gatherer.create_agent",
                return_value=mock_agent,
            ):
                result = _run_question_gatherer(
                    {"run_id": "run-1", "person": person.model_dump(), "suggestion": suggestion}
                )

    assert len(result["logs"]) == 1
    assert result["logs"][0].node == "question_gatherer"
    assert "A" in result["logs"][0].notes[0]
