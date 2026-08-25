from datetime import datetime, timezone
import logging
from pathlib import Path

from langchain.agents import create_agent

from . import events
from .llm import get_chat_llm
from .prompt_utils import load_security_rules
from .state import JudgeResearchQuestions, PersonPayload, RestaurantSuggestion, StepLog

logger = logging.getLogger(__name__)


async def question_gatherer(payload: dict) -> dict:
    run_id = payload.get("run_id", "")
    person = PersonPayload.model_validate(payload["person"])
    suggestion = RestaurantSuggestion.model_validate(payload["suggestion"])

    events.emit(
        run_id,
        {"type": "judge_questioning", "person": person.name, "suggestion_id": suggestion.id},
    )

    llm = get_chat_llm(temperature=0.2, stage="question_gatherer")
    agent = create_agent(
        model=llm,
        tools=[],
        system_prompt=_question_gatherer_prompt(person, suggestion),
        response_format=JudgeResearchQuestions,
    )
    try:
        result = await agent.ainvoke(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": "What research questions should be answered about this restaurant?",
                    }
                ]
            },
            config={"recursion_limit": 12},
        )
        logger.debug("Question gatherer result for %s on %s: %s", person.name, suggestion.id, result)
        questions = result.get("structured_response")
        if questions is None:
            questions = _recover_structured_response(result.get("messages", []))
        if questions is None:
            questions = JudgeResearchQuestions(questions=[])
    except Exception as error:
        logger.exception("Question gatherer failed for %s on %s", person.name, suggestion.id)
        questions = JudgeResearchQuestions(questions=[])

    log = StepLog(
        node="question_gatherer",
        timestamp=datetime.now(timezone.utc).isoformat(),
        state_snapshot={
            "person": person.name,
            "suggestion_id": suggestion.id,
            "questions": questions.questions,
        },
        notes=[f"{person.name} asked {len(questions.questions)} research questions about {suggestion.name}"],
    )

    return {
        "research_questions": {suggestion.id: {person.name: questions.questions}},
        "logs": [log],
    }


def _recover_structured_response(messages: list) -> JudgeResearchQuestions | None:
    recovered: JudgeResearchQuestions | None = None
    for message in messages:
        tool_calls = getattr(message, "tool_calls", None)
        if not tool_calls:
            continue
        for tool_call in tool_calls:
            if tool_call.get("name") != JudgeResearchQuestions.__name__:
                continue
            try:
                recovered = JudgeResearchQuestions.model_validate(tool_call["args"])
            except Exception:
                continue
    return recovered


def _question_gatherer_prompt(person: PersonPayload, suggestion: RestaurantSuggestion) -> str:
    template_path = Path(__file__).parent / "prompts" / "question_gatherer_prompt.md"
    template = template_path.read_text(encoding="utf-8")
    return template.format(
        person_preferences=person.preferences,
        restaurant_name=suggestion.name,
        restaurant_address=suggestion.address or "unknown",
        security_rules=load_security_rules(),
    )
