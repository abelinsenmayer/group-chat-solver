import logging.config
from pathlib import Path

from src.solve_restaurants.config import get_settings


def _build_config(level: str, app_log_path: Path | None) -> dict:
    handlers = ["console"]
    if app_log_path is not None:
        handlers.append("file")

    config: dict = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "standard",
                "level": level,
                "stream": "ext://sys.stdout",
            },
        },
        "loggers": {
            "uvicorn": {"level": level, "handlers": handlers, "propagate": False},
            "uvicorn.access": {"level": level, "handlers": handlers, "propagate": False},
            "uvicorn.error": {"level": level, "handlers": handlers, "propagate": False},
        },
        "root": {
            "level": level,
            "handlers": handlers,
        },
    }

    if app_log_path is not None:
        config["handlers"]["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "formatter": "standard",
            "level": level,
            "filename": str(app_log_path),
            "maxBytes": 10_485_760,
            "backupCount": 5,
            "encoding": "utf-8",
        }

    return config


def configure_logging() -> None:
    try:
        settings = get_settings()
        level = settings.log_level.upper()
        log_dir = Path(settings.log_dir).resolve()
        log_dir.mkdir(parents=True, exist_ok=True)
        app_log_path = log_dir.parent / "app.log" if settings.dev_mode else None
    except Exception:
        level = "INFO"
        app_log_path = None

    logging.config.dictConfig(_build_config(level, app_log_path))
