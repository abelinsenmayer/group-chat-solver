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
from .question_gatherer import question_gatherer
from .researcher import researcher
from .state import FinalResult, ResearchReport, SolveRestaurantsState, person_to_payload
from .success_check import route_after_success_check, success_check

logger = logging.getLogger(__name__)

_tasks: dict[str, asyncio.Task] = {}


def _remove_task(run_id: str, task: asyncio.Task) -> None:
    _tasks.pop(run_id, None)
    try:
        if not task.cancelled():
            exc = task.exception()
            if exc is not None:
                logger.exception("solve-restaurants run %s failed", run_id, exc_info=exc)
    except (asyncio.CancelledError, asyncio.InvalidStateError):
        pass


def _noop(state: SolveRestaurantsState) -> dict:
    """Join node: runs once after all parallel upstream branches finish."""
    return {}


def create_graph():
    builder = StateGraph(SolveRestaurantsState)
    builder.add_node("planner", planner)
    builder.add_node("question_gatherer", question_gatherer)
    builder.add_node("research_dispatch", _noop)
    builder.add_node("researcher", researcher)
    builder.add_node("judge_dispatch", _noop)
    builder.add_node("judge", judge)
    builder.add_node("success_check", success_check)

    builder.add_edge(START, "planner")
    builder.add_conditional_edges(
        "planner",
        lambda state: [
            Send(
                "question_gatherer",
                {
                    "run_id": state.run_id,
                    "person": person.model_dump(),
                    "suggestion": suggestion.model_dump(),
                },
            )
            for person in state.people
            for suggestion in state.suggestions
        ],
    )
    # Plain edge from a fanned-out node creates a fan-in barrier.
    builder.add_edge("question_gatherer", "research_dispatch")
    builder.add_conditional_edges(
        "research_dispatch",
        lambda state: [
            Send(
                "researcher",
                {
                    "run_id": state.run_id,
                    "suggestion": suggestion.model_dump(),
                    "questions_by_person": state.research_questions.get(suggestion.id, {}),
                },
            )
            for suggestion in state.suggestions
        ],
    )
    builder.add_edge("researcher", "judge_dispatch")
    builder.add_conditional_edges(
        "judge_dispatch",
        lambda state: [
            Send(
                "judge",
                {
                    "run_id": state.run_id,
                    "person": person.model_dump(),
                    "suggestions": [suggestion.model_dump()],
                    "research_report": state.research_reports.get(
                        suggestion.id, ResearchReport(summary="", sources=[])
                    ).model_dump(),
                },
            )
            for person in state.people
            for suggestion in state.suggestions
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
    except asyncio.CancelledError:
        logger.info("solve-restaurants run %s was cancelled", run_id)
        raise
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
        _tasks.pop(run_id, None)
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
    _tasks[run_id] = task
    task.add_done_callback(lambda t, rid=run_id: _remove_task(rid, t))
    return run_id, task


def cancel_solve_restaurants(run_id: str) -> bool:
    """Cancel the running solve-restaurants task for a run, if any."""
    task = _tasks.get(run_id)
    if task is None or task.done():
        return False
    task.cancel()
    return True
