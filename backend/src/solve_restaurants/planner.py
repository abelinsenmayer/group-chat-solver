from datetime import datetime, timezone
import logging

from langchain_ollama import ChatOllama
from pydantic import BaseModel

from src.mapping_utils import find_pois_in_polygon

from .config import get_settings
from .state import PersonPayload, RestaurantSuggestion, StepLog


logger = logging.getLogger(__name__)


def _extract_exterior_ring(overlap: dict) -> list[tuple[float, float]]:
    if overlap.get("type") == "Polygon":
        coords = overlap["coordinates"][0]
    elif overlap.get("type") == "MultiPolygon":
        coords = overlap["coordinates"][0][0]
    else:
        raise ValueError("overlap must be Polygon or MultiPolygon")
    return [(float(lon), float(lat)) for lon, lat in coords]


def build_query(people: list[PersonPayload], feedback_summary: str) -> str:
    preferences = [p.preferences.strip() for p in people if p.preferences.strip()]
    query = "restaurant"
    # if preferences:
    #     query = " ".join(preferences) + " " + query
    # if feedback_summary.strip():
    #     query = query + " " + feedback_summary.strip()
    return query


class SuggestionSelection(BaseModel):
    selected: list[RestaurantSuggestion]


def planner(state) -> dict:
    settings = get_settings()
    polygon_coords = _extract_exterior_ring(state.overlap)
    query = build_query(state.people, state.feedback_summary)

    raw_features = find_pois_in_polygon(
        polygon_coords=polygon_coords,
        search_term=query,
        limit=10,
        category="restaurant",
    )

    logger.debug("Found %d raw features", len(raw_features))

    selected: list[RestaurantSuggestion] = []
    if raw_features:
        llm = ChatOllama(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            temperature=0.2,
        )
        structured = llm.with_structured_output(SuggestionSelection)
        selection = structured.invoke(
            _planner_prompt(query, state.people, raw_features, state.feedback_summary)
        )
        selected = selection.selected[:5]
        logger.debug("Selected %d suggestions from %d raw features", len(selected), len(raw_features))

    for feature in raw_features:
        if len(selected) >= 5:
            break
        props = feature.get("properties", {})
        coords = props.get("coordinates", {})
        suggestion = RestaurantSuggestion(
            id=props.get("mapbox_id") or props.get("name", "unknown"),
            name=props.get("name", "Unknown"),
            address=props.get("address", props.get("place_formatted")),
            coordinates=(coords.get("longitude", 0.0), coords.get("latitude", 0.0)),
            mapbox_feature=feature,
        )
        if suggestion.id not in {s.id for s in selected}:
            selected.append(suggestion)

    log = StepLog(
        node="planner",
        timestamp=datetime.now(timezone.utc).isoformat(),
        state_snapshot={
            "round": state.round,
            "query": query,
            "raw_poi_count": len(raw_features),
            "selected_ids": [s.id for s in selected],
        },
        notes=[f"Queried Mapbox with '{query}' and selected {len(selected)} suggestions"],
    )

    return {
        "suggestions": selected,
        "verdicts": {},
        "logs": [log],
    }


def _planner_prompt(
    query: str, people: list[PersonPayload], features: list[dict], feedback_summary: str
) -> str:
    preferences = "\n".join(f"- {p.name}: {p.preferences}" for p in people)
    feature_list = "\n".join(
        f"- {i+1}. {f.get('properties', {}).get('name', 'Unknown')} at {f.get('properties', {}).get('address', 'unknown')}"
        for i, f in enumerate(features)
    )
    feedback = (
        f"\nFeedback from previous round:\n{feedback_summary}"
        if feedback_summary.strip()
        else ""
    )
    return (
        "You are a restaurant planner. Given a list of candidate restaurants from Mapbox, select exactly 5 "
        "that best satisfy the group's preferences."
        + feedback
        + "\n\n"
        "Group preferences:\n"
        + preferences
        + "\n\n"
        "Candidate restaurants:\n"
        + feature_list
        + "\n\n"
        "Return exactly 5 suggestions. For each, include id, name, address, and coordinates (longitude, latitude)."
    )
