# Backend

Python/FastAPI backend for the Group Chat Solver project, using [uv](https://github.com/astral-sh/uv) for dependency management. It exposes an API that computes overlapping availability windows, reachable ("isochrone") areas via Mapbox, and runs a LangGraph agent pipeline that searches for and judges restaurant recommendations.

## Prerequisites

- Python 3.10 or higher
- [uv](https://github.com/astral-sh/uv) - Install with: `pip install uv` or follow the official installation guide

## Installation

```bash
cd backend
uv sync
```

## Configuration

Settings are loaded from environment variables (or a `backend/.env` file) via `pydantic-settings` — see `src/solve_restaurants/config.py` for the full schema. Create a `backend/.env` file with at least:

```bash
MAPBOX_ACCESS_TOKEN=<mapbox secret token>       # required — used for isochrone/POI requests
TAVILY_API_KEY=<tavily api key>                 # required — used for restaurant web search
AI_PROVIDER=ollama                              # "ollama" (default, local) or "gemini"
GOOGLE_API_KEY=<google api key>                 # required only when AI_PROVIDER=gemini
OLLAMA_BASE_URL=http://localhost:11434          # default shown
OLLAMA_MODEL=gemma4:12b                         # default shown
GEMINI_MODEL=gemini-3.5-flash                   # default shown
```

Do not commit `.env` or any real tokens.

### Tracing (LangSmith)

The planner/judge LangGraph agents can be traced automatically by LangSmith. Add to `backend/.env`:

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_your_api_key_here
LANGSMITH_PROJECT=group-chat-solver   # optional, defaults to "group-chat-solver"
LANGSMITH_ENDPOINT=https://api.smith.langchain.com   # optional, for self-hosted/EU instances
```

No code changes are needed beyond this configuration — `configure_langsmith_tracing()` (called on API startup) propagates these settings to the environment so LangChain's built-in tracing picks them up for every agent/LLM call. The `planner` and `judge` graph nodes are additionally wrapped with `@traceable` to group each node's work under a single named trace span.

## Running locally

Start the API with auto-reload:

```bash
uv run uvicorn src.api:app --reload
```

The API listens on `http://127.0.0.1:8000` and accepts requests from the frontend dev server at `http://localhost:5173` (see CORS config in `src/api.py`). Key endpoints:

- `GET /api/people` — sample people for local testing/demo
- `POST /api/event-timeline` — compute the overlapping availability window for a group
- `POST /api/reachable-areas` — compute each person's Mapbox isochrone and the shared reachable area
- `POST /api/solve-restaurants` — kick off an async LangGraph run that searches for and judges restaurants; returns a `run_id`
- `GET /api/solve-restaurants/{run_id}/events` — Server-Sent Events stream of progress for a `solve-restaurants` run

Alternatively, run the CLI entrypoint:

```bash
uv run python src/main.py
```

## Tests

```bash
uv run pytest
```

## Scripts

Standalone scripts for exercising individual pieces of the system (direct LLM prompts, Mapbox isochrones/POI search, running the solver against sample people) live in `scripts/` — see [`scripts/README.md`](scripts/README.md) for usage.

## Project structure

```
backend/
  src/
    api.py                 FastAPI app and routes
    solver.py               Event timeline / reachable area solving
    mapping_utils.py         Mapbox isochrone/POI helpers
    solve_restaurants/       LangGraph agent pipeline (planner, judge, tools, config)
    person.py, models.py, person_json.py, when.py   Domain models and (de)serialization
  scripts/                  CLI scripts, see scripts/README.md
  sample-data/               Sample people/areas used for local dev and demos
  tests/                    Pytest suite
```

## Development

Add new dependencies:
```bash
uv add <package-name>
```

Add development dependencies:
```bash
uv add --dev <package-name>
```
