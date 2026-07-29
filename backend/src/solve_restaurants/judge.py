from datetime import datetime, timezone

from langchain_ollama import ChatOllama
from tavily import TavilyClient

from .config import get_settings
from .state import JudgeVerdict, PersonPayload, RestaurantSuggestion, StepLog, Verdict


def _search_restaurant(client: TavilyClient, name: str, address: str | None, preferences: str) -> str:
    query = f"{name} {address or ''} menu {preferences}".strip()
    try:
        response = client.search(query=query, max_results=3)
        results = response.get("results", [])
        return "\n".join(r.get("content", "") for r in results)
    except Exception as error:
        return f"Error researching restaurant: {error}"


def judge(payload: dict) -> dict:
    person = PersonPayload.model_validate(payload["person"])
    suggestions = [RestaurantSuggestion.model_validate(s) for s in payload["suggestions"]]
    settings = get_settings()
    client = TavilyClient(api_key=settings.tavily_api_key)
    llm = ChatOllama(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
        temperature=0.2,
    )
    structured = llm.with_structured_output(JudgeVerdict)

    verdicts = {}
    notes = []
    errors = []
    for suggestion in suggestions:
        research = _search_restaurant(client, suggestion.name, suggestion.address, person.preferences)
        try:
            verdict = structured.invoke(_judge_prompt(person, suggestion, research))
        except Exception as error:
            verdict = JudgeVerdict(verdict=Verdict.REJECTED, feedback=f"unable to verify: {error}")
            errors.append(f"Judge for {person.name} failed on {suggestion.id}: {error}")
        verdicts[suggestion.id] = verdict
        notes.append(f"{person.name} -> {suggestion.name}: {verdict.verdict.value}")

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


def _judge_prompt(person: PersonPayload, suggestion, research: str) -> str:
    return (
        f"You are representing {person.name} and their preferences: {person.preferences}.\n\n"
        f"Evaluate whether the following restaurant satisfies these preferences.\n\n"
        f"Restaurant: {suggestion.name}\n"
        f"Address: {suggestion.address or 'unknown'}\n\n"
        f"Research results:\n{research}\n\n"
        "Return 'approved' if the restaurant clearly satisfies the preferences. "
        "Return 'rejected' with a short feedback paragraph (at most a few sentences) if it does not."
    )
