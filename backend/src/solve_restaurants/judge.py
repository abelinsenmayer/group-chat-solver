from datetime import datetime, timezone
import logging

from langchain.agents import create_agent
from langchain.agents.middleware import ToolCallLimitMiddleware
from langchain_core.tools import tool
from langsmith import traceable
from tavily import TavilyClient

from . import events
from .config import get_settings
from .llm import get_chat_llm
from .state import JudgeVerdict, PersonPayload, RestaurantSuggestion, StepLog, Verdict


logger = logging.getLogger(__name__)


def _create_web_search_tool(client: TavilyClient):
    @tool
    def web_search(query: str) -> str:
        """Search the web for information about a restaurant.

        Use this to research a restaurant (menu, reviews, cuisine, dietary options, etc.)
        before deciding whether it satisfies someone's preferences. Call it again with a
        different or more specific query if the first results are not useful.

        Args:
            query: Search terms, e.g. "Veggie Spot 1 Main St menu vegetarian".
        """
        try:
            response = client.search(query=query, max_results=3)
            results = response.get("results", [])
            content = "\n".join(r.get("content", "") for r in results)
            return content or "No results found for this query."
        except Exception as error:
            return f"Error researching restaurant: {error}"

    return web_search


async def judge(payload: dict) -> dict:
    run_id = payload.get("run_id", "")
    person = PersonPayload.model_validate(payload["person"])
    suggestions = [RestaurantSuggestion.model_validate(s) for s in payload["suggestions"]]
    settings = get_settings()
    client = TavilyClient(api_key=settings.tavily_api_key)
    web_search_tool = _create_web_search_tool(client)
    llm = get_chat_llm(temperature=0.2)

    verdicts = {}
    notes = []
    errors = []
    for suggestion in suggestions:
        events.emit(run_id, {"type": "judge_evaluating", "person": person.name, "suggestion_id": suggestion.id})
        agent = create_agent(
            model=llm,
            tools=[web_search_tool],
            system_prompt=_judge_prompt(person, suggestion),
            middleware=[ToolCallLimitMiddleware(tool_name="web_search", run_limit=3)],
            response_format=JudgeVerdict,
        )
        try:
            result = await agent.ainvoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": "Research this restaurant using web_search, then give your verdict.",
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


def _judge_prompt(person: PersonPayload, suggestion: RestaurantSuggestion) -> str:
    return (
        f"You are representing {person.name} and their preferences: {person.preferences}.\n\n"
        "Use the web_search tool to research the following restaurant before deciding.\n\n"
        f"Restaurant: {suggestion.name}\n"
        f"Address: {suggestion.address or 'unknown'}\n\n"
        "Evaluate whether the restaurant satisfies these preferences. "
        "Return 'approved' if the restaurant clearly satisfies the preferences, leaving "
        "short_reason and feedback empty. "
        "Return 'rejected' if it does not, and also provide:\n"
        "- short_reason: a short punchy tag of at most 5 words (e.g. 'Too expensive!', "
        "'No vegetarian options') summarizing why it was rejected.\n"
        "- feedback: a short feedback paragraph (at most a few sentences) explaining the "
        "rejection in more detail.\n\n"
        "IMPORTANT: Call the web_search tool as many times as you need first (up to 3). "
        "Only call the final verdict tool by itself, once you are done researching, and "
        "never call it more than once or alongside another tool call."
    )
