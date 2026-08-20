import asyncio
import threading
from typing import Any

SENTINEL = object()

_lock = threading.Lock()
_queues: dict[str, "asyncio.Queue[Any]"] = {}
_loops: dict[str, asyncio.AbstractEventLoop | None] = {}


def _put_nowait(run_id: str, item: Any) -> None:
    with _lock:
        run_queue = _queues.get(run_id)
    if run_queue is not None:
        run_queue.put_nowait(item)


def _running_loop() -> asyncio.AbstractEventLoop | None:
    try:
        return asyncio.get_running_loop()
    except RuntimeError:
        return None


def create_run(run_id: str) -> None:
    """Register a new event queue for a run. Call before any events can be emitted."""
    with _lock:
        _queues[run_id] = asyncio.Queue()
        _loops[run_id] = _running_loop()


def emit(run_id: str, event: dict[str, Any]) -> None:
    """Push an event onto the run's queue. No-ops silently if the run is unknown
    (e.g. already closed and discarded). Schedules the put on the host event loop
    when emitting from a worker thread so the consumer can be woken up safely.
    """
    with _lock:
        loop = _loops.get(run_id)
    if loop is not None:
        loop.call_soon_threadsafe(_put_nowait, run_id, event)
    else:
        _put_nowait(run_id, event)


def close_run(run_id: str) -> None:
    """Signal that no more events will be emitted for this run."""
    with _lock:
        loop = _loops.get(run_id)
    if loop is not None:
        loop.call_soon_threadsafe(_put_nowait, run_id, SENTINEL)
    else:
        _put_nowait(run_id, SENTINEL)


def subscribe(run_id: str) -> "asyncio.Queue[Any]":
    """Return the queue for a run. Raises KeyError if the run is unknown."""
    with _lock:
        run_queue = _queues.get(run_id)
    if run_queue is None:
        raise KeyError(run_id)
    return run_queue


def discard(run_id: str) -> None:
    """Remove bookkeeping for a run once its subscriber has consumed the sentinel."""
    with _lock:
        _queues.pop(run_id, None)
        _loops.pop(run_id, None)
