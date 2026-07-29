import asyncio
import logging
import uuid
from datetime import datetime, timezone

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from src.person import Person

from . import run_logger
from .judge import judge
from .planner import planner
from .state import SolveRestaurantsState, person_to_payload
from .success_check import route_after_success_check, success_check

logger = logging.getLogger(__name__)


def create_graph():
    builder = StateGraph(SolveRestaurantsState)
    builder.add_node("planner", planner)
    builder.add_node("judge", judge)
    builder.add_node("success_check", success_check)

    builder.add_edge(START, "planner")
    builder.add_conditional_edges(
        "planner",
        lambda state: [
            Send(
                "judge",
                {
                    "person": person.model_dump(),
                    "suggestions": [s.model_dump() for s in state.suggestions],
                },
            )
            for person in state.people
        ],
    )
    builder.add_edge("judge", "success_check")
    builder.add_conditional_edges(
        "success_check",
        route_after_success_check,
        {
            "planner": "planner",
            "__end__": END,
        },
    )
    return builder.compile()


async def run_solve_restaurants(people: list[Person], overlap: dict) -> SolveRestaurantsState:
    graph = create_graph()
    initial_state = SolveRestaurantsState(
        people=[person_to_payload(p) for p in people],
        overlap=overlap,
    )
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"
    logger.info("Starting solve-restaurants run %s with %d people", run_id, len(people))
    try:
        final_state_dict = await graph.ainvoke(initial_state)
        final_state = SolveRestaurantsState.model_validate(final_state_dict)
    except Exception:
        logger.exception("solve-restaurants run %s failed", run_id)
        raise
    logger.info("Completed solve-restaurants run %s", run_id)
    run_logger.save_run(run_id, initial_state, final_state)
    return final_state


def start_solve_restaurants(people: list[Person], overlap: dict) -> tuple[str, asyncio.Task]:
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"
    task = asyncio.create_task(run_solve_restaurants(people, overlap))
    return run_id, task
