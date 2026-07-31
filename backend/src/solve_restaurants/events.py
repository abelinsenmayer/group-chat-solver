import queue
import threading
from typing import Any

SENTINEL = object()

_lock = threading.Lock()
_queues: dict[str, "queue.Queue[Any]"] = {}


def create_run(run_id: str) -> None:
    """Register a new event queue for a run. Call before any events can be emitted."""
    with _lock:
        _queues[run_id] = queue.Queue()


def emit(run_id: str, event: dict[str, Any]) -> None:
    """Push an event onto the run's queue. No-ops silently if the run is unknown
    (e.g. already closed and discarded), since node code shouldn't fail just
    because a subscriber isn't listening anymore.
    """
    with _lock:
        run_queue = _queues.get(run_id)
    if run_queue is not None:
        run_queue.put_nowait(event)


def close_run(run_id: str) -> None:
    """Signal that no more events will be emitted for this run."""
    with _lock:
        run_queue = _queues.get(run_id)
    if run_queue is not None:
        run_queue.put_nowait(SENTINEL)


def subscribe(run_id: str) -> "queue.Queue[Any]":
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
