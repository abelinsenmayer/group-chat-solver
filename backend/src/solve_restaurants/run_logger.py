import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import get_settings
from .state import SolveRestaurantsState

logger = logging.getLogger(__name__)


def _ensure_log_dir() -> Path:
    log_dir = Path(get_settings().log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir


def _elide_coordinates(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            key: "..." if key == "coordinates" and isinstance(value, list) else _elide_coordinates(value)
            for key, value in obj.items()
        }
    if isinstance(obj, list):
        return [_elide_coordinates(item) for item in obj]
    return obj


def _serialize_state(state: SolveRestaurantsState) -> dict[str, Any]:
    return _elide_coordinates(state.model_dump(mode="json"))


def save_run(run_id: str, initial_state: SolveRestaurantsState, final_state: SolveRestaurantsState) -> Path:
    log_dir = _ensure_log_dir()
    path = log_dir / f"{run_id}.json"
    record = {
        "run_id": run_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "request": _serialize_state(initial_state),
        "final_state": _serialize_state(final_state),
        "result": _elide_coordinates(final_state.result.model_dump(mode="json")) if final_state.result else None,
        "logs": [_elide_coordinates(log.model_dump(mode="json")) for log in final_state.logs],
        "errors": final_state.errors,
    }
    for log in final_state.logs:
        logger.debug("[%s] %s: %s", run_id, log.node, log.model_dump(mode="json"))
    path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    return path
