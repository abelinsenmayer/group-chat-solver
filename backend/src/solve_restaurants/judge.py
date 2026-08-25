from datetime import datetime, timezone
import logging
from pathlib import Path

from langchain.agents import create_agent

from . import events
from .llm import get_chat_llm
from .state import JudgeVerdict, PersonPayload, ResearchReport, RestaurantSuggestion, StepLog, Verdict


logger = logging.getLogger(__name__)


async def judge(payload: dict) -> dict:
    run_id = payload.get("run_id", "")
    person = PersonPayload.model_validate(payload["person"])
    suggestions = [RestaurantSuggestion.model_validate(s) for s in payload["suggestions"]]
    raw_report = payload.get("research_report")
    research_report = ResearchReport.model_validate(raw_report) if raw_report else ResearchReport(summary="", sources=[])
    llm = get_chat_llm(temperature=0.2, stage="judge")

    verdicts = {}
    notes = []
    errors = []
    for suggestion in suggestions:
        events.emit(run_id, {"type": "judge_evaluating", "person": person.name, "suggestion_id": suggestion.id})
        agent = create_agent(
            model=llm,
            tools=[],
            system_prompt=_judge_prompt(person, suggestion, research_report),
            response_format=JudgeVerdict,
        )
        try:
            result = await agent.ainvoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": "Based on the research report, give your verdict.",
                        }
                    ]
                },
                config={"recursion_limit": 12},
            )
            logger.debug("Judge result for %s on %s: %s", person.name, suggestion.id, result)
            verdict = result.get("structured_response") or _recover_structured_response(
                result.get("messages", [])
            )
            if verdict is None:
                raise ValueError("Judge LLM did not return a usable structured response")
        except Exception as error:
            verdict = JudgeVerdict(
                verdict=Verdict.REJECTED,
                short_reason="Unable to verify",
                feedback=f"unable to verify: {error}",
            )
            errors.append(f"Judge for {person.name} failed on {suggestion.id}: {error}")
        verdicts[suggestion.id] = verdict
        notes.append(f"{person.name} -> {suggestion.name}: {verdict.verdict.value}")
        events.emit(
            run_id,
            {
                "type": "judge_verdict",
                "person": person.name,
                "suggestion_id": suggestion.id,
                "verdict": verdict.verdict.value,
                "short_reason": verdict.short_reason,
                "feedback": verdict.feedback,
            },
        )

    log = StepLog(
        node="judge",
        timestamp=datetime.now(timezone.utc).isoformat(),
        state_snapshot={"person": person.name, "verdicts": {k: v.model_dump() for k, v in verdicts.items()}},
        notes=notes,
    )

    return {
        "verdicts": {person.name: verdicts},
        "logs": [log],
        "errors": errors,
    }


def _recover_structured_response(messages: list) -> JudgeVerdict | None:
    """Best-effort recovery for a langchain create_agent bug (as of langchain 1.3.x):
    when the model calls the structured-output tool more than once in the same turn
    (alongside other tool calls), the agent graph exits without ever populating
    ``structured_response`` - even if one of the duplicate calls contained perfectly
    valid, parseable data. Salvage the last valid structured-output attempt found
    anywhere in the message history, instead of discarding otherwise-usable output.
    """
    recovered: JudgeVerdict | None = None
    for message in messages:
        tool_calls = getattr(message, "tool_calls", None)
        if not tool_calls:
            continue
        for tool_call in tool_calls:
            if tool_call.get("name") != JudgeVerdict.__name__:
                continue
            try:
                recovered = JudgeVerdict.model_validate(tool_call["args"])
            except Exception:
                continue

    return recovered


def _judge_prompt(person: PersonPayload, suggestion: RestaurantSuggestion, report: ResearchReport) -> str:
    template_path = Path(__file__).parent / "prompts" / "judge_prompt.md"
    template = template_path.read_text(encoding="utf-8")
    return template.format(
        person_preferences=person.preferences,
        restaurant_name=suggestion.name,
        restaurant_address=suggestion.address or "unknown",
        report_summary=report.summary or "None",
    )
