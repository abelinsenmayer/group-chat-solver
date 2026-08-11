import asyncio
import logging
import uuid
from datetime import datetime, timezone

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from src.person import Person

from . import events, run_logger
from .judge import judge
from .planner import NoRestaurantsFoundError, planner
from .state import FinalResult, SolveRestaurantsState, person_to_payload
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
                    "run_id": state.run_id,
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


async def run_solve_restaurants(people: list[Person], overlap: dict, run_id: str) -> SolveRestaurantsState:
    graph = create_graph()
    initial_state = SolveRestaurantsState(
        people=[person_to_payload(p) for p in people],
        overlap=overlap,
        run_id=run_id,
    )
    final_state: SolveRestaurantsState | None = None
    logger.info("Starting solve-restaurants run %s with %d people", run_id, len(people))
    try:
        final_state_dict = await graph.ainvoke(initial_state)
        final_state = SolveRestaurantsState.model_validate(final_state_dict)
    except NoRestaurantsFoundError as error:
        logger.info("No restaurants found for run %s: %s", run_id, error)
        final_state = SolveRestaurantsState.model_validate(initial_state.model_dump())
        final_state.result = FinalResult(status="no_restaurants_found", suggestions=[])
        events.emit(
            run_id,
            {"type": "final_result", "status": "no_restaurants_found", "suggestions": []},
        )
    except Exception as error:
        logger.exception("solve-restaurants run %s failed", run_id)
        events.emit(run_id, {"type": "error", "message": str(error)})
        raise
    finally:
        events.close_run(run_id)
    if final_state is None:
        raise RuntimeError(f"solve-restaurants run {run_id} did not produce a final state")
    logger.info("Completed solve-restaurants run %s", run_id)
    run_logger.save_run(run_id, initial_state, final_state)
    return final_state


def start_solve_restaurants(people: list[Person], overlap: dict) -> tuple[str, asyncio.Task]:
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"
    events.create_run(run_id)
    task = asyncio.create_task(run_solve_restaurants(people, overlap, run_id))
    return run_id, task
