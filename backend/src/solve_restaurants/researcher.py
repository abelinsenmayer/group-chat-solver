from datetime import datetime, timezone
import logging

from langchain.agents import create_agent
from langchain.agents.middleware import ToolCallLimitMiddleware
from langchain_core.tools import tool
from tavily import TavilyClient

from . import events
from .config import get_settings
from .llm import get_chat_llm
from .state import ResearchReport, RestaurantSuggestion, StepLog

logger = logging.getLogger(__name__)


def _create_web_search_tool(client: TavilyClient):
    @tool
    def web_search(query: str) -> str:
        """Search the web for information about a restaurant.

        Use this to research a restaurant (menu, reviews, cuisine, dietary options, etc.).

        Args:
            query: Search terms, e.g. "Veggie Spot 1 Main St menu vegetarian".
        """
        try:
            logger.debug("Running web_search tool")
            response = client.search(query=query, max_results=3)
            results = response.get("results", [])
            lines = []
            for r in results:
                content = r.get("content", "")
                url = r.get("url", "")
                if content:
                    lines.append(f"{content} (source: {url})")
            return "\n".join(lines) or "No results found for this query."
        except Exception as error:
            return f"Error researching restaurant: {error}"

    return web_search


def _deduplicate_questions(questions_by_person: dict[str, list[str]]) -> list[str]:
    all_questions: list[str] = []
    seen: set[str] = set()
    for questions in questions_by_person.values():
        for q in questions:
            normalized = q.strip().lower()
            if normalized and normalized not in seen:
                seen.add(normalized)
                all_questions.append(q.strip())
    return all_questions


async def researcher(payload: dict) -> dict:
    run_id = payload.get("run_id", "")
    suggestion = RestaurantSuggestion.model_validate(payload["suggestion"])
    questions_by_person: dict[str, list[str]] = payload.get("questions_by_person", {})
    all_questions = _deduplicate_questions(questions_by_person)

    events.emit(run_id, {"type": "researcher_started", "suggestion_id": suggestion.id})

    settings = get_settings()

    if not all_questions:
        events.emit(
            run_id,
            {"type": "researcher_done", "suggestion_id": suggestion.id},
        )
        log = StepLog(
            node="researcher",
            timestamp=datetime.now(timezone.utc).isoformat(),
            state_snapshot={
                "suggestion_id": suggestion.id,
                "questions_count": 0,
                "search_limit": settings.researcher_search_limit,
            },
            notes=[f"No research questions for {suggestion.name}; skipping search."],
        )
        return {
            "research_reports": {suggestion.id: ResearchReport(summary="", sources=[])},
            "logs": [log],
        }

    client = TavilyClient(api_key=settings.tavily_api_key)
    web_search_tool = _create_web_search_tool(client)
    llm = get_chat_llm(temperature=0.2)

    agent = create_agent(
        model=llm,
        tools=[web_search_tool],
        system_prompt=_researcher_prompt(suggestion, all_questions),
        middleware=[ToolCallLimitMiddleware(tool_name="web_search", run_limit=settings.researcher_search_limit)],
        response_format=ResearchReport,
    )
    try:
        result = await agent.ainvoke(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": "Research this restaurant and produce a concise report.",
                    }
                ]
            },
            config={"recursion_limit": 12},
        )
        logger.debug("Researcher result for %s: %s", suggestion.id, result)
        report = result.get("structured_response") or _recover_structured_response(
            result.get("messages", [])
        )
        if report is None:
            raise ValueError("Researcher LLM did not return a usable structured response")
    except Exception:
        logger.exception("Researcher failed for %s", suggestion.id)
        report = ResearchReport(
            summary="Research could not be completed for this restaurant.",
            sources=[],
        )

    events.emit(
        run_id,
        {"type": "researcher_done", "suggestion_id": suggestion.id},
    )

    log = StepLog(
        node="researcher",
        timestamp=datetime.now(timezone.utc).isoformat(),
        state_snapshot={
            "suggestion_id": suggestion.id,
            "questions_count": len(all_questions),
            "search_limit": settings.researcher_search_limit,
        },
        notes=[f"Researched {suggestion.name} with up to {settings.researcher_search_limit} searches"],
    )

    return {
        "research_reports": {suggestion.id: report},
        "logs": [log],
    }


def _recover_structured_response(messages: list) -> ResearchReport | None:
    recovered: ResearchReport | None = None
    for message in messages:
        tool_calls = getattr(message, "tool_calls", None)
        if not tool_calls:
            continue
        for tool_call in tool_calls:
            if tool_call.get("name") != ResearchReport.__name__:
                continue
            try:
                recovered = ResearchReport.model_validate(tool_call["args"])
            except Exception:
                continue
    return recovered


def _researcher_prompt(suggestion: RestaurantSuggestion, questions: list[str]) -> str:
    questions_section = "\n".join(f"- {q}" for q in questions) or "- General information about this restaurant"
    return (
        f"You are a research assistant. Research the following restaurant using the web_search tool.\n\n"
        f"Restaurant: {suggestion.name}\n"
        f"Address: {suggestion.address or 'unknown'}\n\n"
        f"The judges want to know:\n{questions_section}\n\n"
        "Use the web_search tool as many times as you need (up to the tool limit). "
        "Then produce a concise ResearchReport with:\n"
        "- summary: a short paragraph of the most relevant findings for the judges' questions\n"
        "- sources: a list of source URLs from the search results\n\n"
        "Only call the final ResearchReport tool by itself, once you are done researching, and "
        "never call it more than once or alongside another tool call."
    )
