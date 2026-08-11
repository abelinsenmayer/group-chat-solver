from datetime import datetime, timezone
import logging

from langchain.agents import create_agent
from langchain.agents.middleware import ToolCallLimitMiddleware
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langsmith import traceable
from pydantic import BaseModel

from src.mapping_utils import find_pois_in_polygon

from . import events
from .config import get_settings
from .state import PersonPayload, RestaurantSuggestion, StepLog, suggestion_event_payload


logger = logging.getLogger(__name__)


class PlannerSelectionError(RuntimeError):
    """Raised when the planner LLM does not select any restaurant suggestions."""


class NoRestaurantsFoundError(PlannerSelectionError):
    """Raised when the planner LLM cannot find any suitable restaurants."""


def _extract_exterior_ring(overlap: dict) -> list[tuple[float, float]]:
    if overlap.get("type") == "Polygon":
        coords = overlap["coordinates"][0]
    elif overlap.get("type") == "MultiPolygon":
        coords = overlap["coordinates"][0][0]
    else:
        raise ValueError("overlap must be Polygon or MultiPolygon")
    return [(float(lon), float(lat)) for lon, lat in coords]


def _create_search_tool(
    polygon_coords: list[tuple[float, float]],
    accumulated_features: list[dict],
    excluded_ids: set[str] | None = None,
):
    excluded_ids = excluded_ids or set()

    @tool
    def search_restaurants(query: str, category: str = "restaurant") -> str:
        """Search Mapbox for restaurants (or other POIs) inside the group's shared area.

        Use this to find real candidate restaurants before making your final selection.
        Call it again with a different, simpler, or broader query if it returns no results.

        Args:
            query: Search terms describing what to look for (e.g. "vegetarian italian").
            category: Mapbox POI category to filter by, e.g. "restaurant" or "cafe".
        """
        try:
            logger.debug("Searching for restaurants with query=%r, category=%r", query, category)
            raw_features = find_pois_in_polygon(
                polygon_coords=polygon_coords,
                search_term=query,
                limit=10,
                category=category,
            )
        except Exception as error:
            return f"Error searching for restaurants: {error}"

        filtered_features = [
            feature
            for feature in raw_features
            if feature.get("properties", {}).get("mapbox_id") not in excluded_ids
        ]
        
        if len(filtered_features) < len(raw_features):
            logger.debug("Filtered out %d restaurants that were already used", len(raw_features) - len(filtered_features))

        if not filtered_features:
            logger.debug("No restaurants found for query=%r, category=%r", query, category)
            return "No restaurants found for this query. Try a different query or category."

        logger.debug("Found %d restaurants for query=%r, category=%r", len(filtered_features), query, category)
        accumulated_features.extend(filtered_features)

        lines = []
        for feature in filtered_features:
            props = feature.get("properties", {})
            coords = props.get("coordinates", {})
            lines.append(
                f"- mapbox_id={props.get('mapbox_id')}, name={props.get('name', 'Unknown')}, "
                f"address={props.get('address', props.get('place_formatted', 'unknown'))}, "
                f"coordinates=({coords.get('longitude')}, {coords.get('latitude')})"
            )
        return "\n".join(lines)

    return search_restaurants


class SelectedSuggestion(BaseModel):
    id: str
    name: str
    address: str | None = None
    coordinates: tuple[float, float]


class SuggestionSelection(BaseModel):
    selected: list[SelectedSuggestion]


def planner(state) -> dict:
    events.emit(state.run_id, {"type": "planner_started", "round": state.round})
    settings = get_settings()
    polygon_coords = _extract_exterior_ring(state.overlap)
    accumulated_features: list[dict] = []
    excluded_ids = getattr(state, "past_suggestion_ids", set()) or set()
    search_tool = _create_search_tool(
        polygon_coords, accumulated_features, excluded_ids=excluded_ids
    )

    llm = ChatOllama(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
        temperature=0.2,
    )
    agent = create_agent(
        model=llm,
        tools=[search_tool],
        system_prompt=_planner_system_prompt(
            state.people, state.feedback_summary, excluded_ids=excluded_ids
        ),
        middleware=[ToolCallLimitMiddleware(tool_name="search_restaurants", run_limit=3)],
        response_format=SuggestionSelection,
    )
    result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Find and select the best restaurant suggestions for this group.",
                }
            ]
        },
        config={"recursion_limit": 24},
    )
    logger.debug("Planner result: %s", result)
    selection = result.get("structured_response") or _recover_structured_response(
        result.get("messages", [])
    )
    if selection is None:
        raise PlannerSelectionError(
            "Planner LLM did not return a usable structured response"
        )
    if not selection.selected:
        raise NoRestaurantsFoundError(
            "No restaurants found in the selected area that satisfy the group's preferences."
        )

    feature_by_id = {
        feature.get("properties", {}).get("mapbox_id"): feature for feature in accumulated_features
    }

    selected: list[RestaurantSuggestion] = []
    for item in selection.selected:
        if item.id in excluded_ids:
            logger.warning("Planner selected previously used mapbox_id %r; skipping", item.id)
            continue
        feature = feature_by_id.get(item.id)
        if feature is None:
            logger.warning("Planner selected unknown mapbox_id %r; skipping", item.id)
            continue
        props = feature.get("properties", {})
        coords = props.get("coordinates", {})
        selected.append(
            RestaurantSuggestion(
                id=item.id,
                name=props.get("name", item.name),
                address=props.get("address", props.get("place_formatted", item.address)),
                coordinates=(
                    coords.get("longitude", item.coordinates[0]),
                    coords.get("latitude", item.coordinates[1]),
                ),
                mapbox_feature=feature,
            )
        )
        if len(selected) >= 5:
            break

    logger.debug("accumulated_features: %s; selected: %s", accumulated_features, selected)

    if not selected:
        raise PlannerSelectionError("Planner LLM did not select any restaurant suggestions")

    logger.debug("Selected %d suggestions via tool-calling search", len(selected))

    events.emit(
        state.run_id,
        {
            "type": "planner_suggestions",
            "round": state.round,
            "suggestions": [suggestion_event_payload(s) for s in selected],
        },
    )

    log = StepLog(
        node="planner",
        timestamp=datetime.now(timezone.utc).isoformat(),
        state_snapshot={
            "round": state.round,
            "selected_ids": [s.id for s in selected],
            "excluded_ids": sorted(excluded_ids),
        },
        notes=[f"Selected {len(selected)} suggestions via tool-calling search"],
    )

    return {
        "suggestions": selected,
        "past_suggestion_ids": {s.id for s in selected},
        "verdicts": {},
        "logs": [log],
    }


def _recover_structured_response(messages: list) -> SuggestionSelection | None:
    """Best-effort recovery for a langchain create_agent bug (as of langchain 1.3.x):
    when the model calls the structured-output tool more than once in the same turn
    (alongside other tool calls), the agent graph exits without ever populating
    ``structured_response`` - even if the duplicate calls contained perfectly valid,
    parseable data. Salvage it by unioning every valid structured-output attempt found
    anywhere in the message history, deduplicated by id, instead of discarding
    otherwise-usable output.
    """
    recovered: dict[str, SelectedSuggestion] = {}
    for message in messages:
        tool_calls = getattr(message, "tool_calls", None)
        if not tool_calls:
            continue
        for tool_call in tool_calls:
            if tool_call.get("name") != SuggestionSelection.__name__:
                continue
            try:
                parsed = SuggestionSelection.model_validate(tool_call["args"])
            except Exception:
                continue
            for item in parsed.selected:
                recovered.setdefault(item.id, item)

    if not recovered:
        return None
    return SuggestionSelection(selected=list(recovered.values()))


def _planner_system_prompt(
    people: list[PersonPayload],
    feedback_summary: str,
    excluded_ids: set[str] | None = None,
) -> str:
    preferences = "\n".join(f"- {p.name}: {p.preferences}" for p in people)
    feedback = (
        f"\n\nFeedback from previous round:\n{feedback_summary}"
        if feedback_summary.strip()
        else ""
    )
    excluded_section = ""
    if excluded_ids:
        excluded_list = "\n".join(f"- {rid}" for rid in sorted(excluded_ids))
        excluded_section = (
            f"\n\nPreviously suggested restaurants (do NOT select these again; "
            f"{len(excluded_ids)} total):\n{excluded_list}"
        )
    return (
        "You are a restaurant planner. Use the search_restaurants tool to find real candidate "
        "restaurants that satisfy the group's preferences, then select up to 5 (fewer if you "
        "cannot find enough good options) to recommend. "
        "If you cannot find any suitable restaurants in the shared area, "
        "call the final selection tool with `selected: []`."
        + excluded_section
        + feedback
        + "\n\nGroup preferences:\n"
        + preferences
        + "\n\nThe search_restaurants tool returns candidate restaurants as lines like:\n"
        "- mapbox_id=123abc, name=The Burger Joint, address=123 Main St, coordinates=(-87.623, 41.881)\n"
        "Each result corresponds to a real Mapbox feature. The value after `mapbox_id=` is the "
        "exact ID you must use as `id` in your final selection. Do not make up IDs like `mapbox_id_1` "
        "or `restaurant_2`; copy the real alphanumeric value exactly as shown. "
        "If a result has no `mapbox_id`, do not select it.\n\n"
        "When selecting, produce entries in this form:\n"
        "- id: <real mapbox_id from the result line>\n"
        "  name: <name from the result line>\n"
        "  address: <address from the result line, or null if missing>\n"
        "  coordinates: [<longitude>, <latitude>]  # use the numbers shown in the result line\n\n"
        "Only select candidates that were actually returned by search_restaurants. "
        "If the tool returns no good options, call it again with a simpler or broader query before selecting.\n\n"
        "IMPORTANT: Call the search_restaurants tool as many times as you need first. "
        "Only call the final selection tool by itself, once you are done searching, and "
        "never call it more than once or alongside another tool call."
        "You can only call tools a limited number of times. If you exhaust your allotted tool calls, make your recommendations "
        "based on the best options you have found so far."
    )
