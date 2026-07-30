# Backend

Python backend for the Group Chat Solver project using uv for dependency management.

## Prerequisites

- Python 3.10 or higher
- [uv](https://github.com/astral-sh/uv) - Install with: `pip install uv` or follow the official installation guide

## Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies using uv:
   ```bash
   uv sync
   ```

## Running

Run the main application:
```bash
uv run python src/main.py
```

## Tracing (LangSmith)

The planner/judge LangGraph agents are traced automatically by LangSmith when enabled.
Set these in your `.env` file (or as environment variables):

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_your_api_key_here
LANGSMITH_PROJECT=group-chat-solver   # optional, defaults to "group-chat-solver"
LANGSMITH_ENDPOINT=https://api.smith.langchain.com   # optional, for self-hosted/EU instances
```

No code changes are needed beyond this configuration — `configure_langsmith_tracing()`
(called on API startup) propagates these settings to the environment so LangChain's
built-in tracing picks them up for every agent/LLM call. The `planner` and `judge`
graph nodes are additionally wrapped with `@traceable` to group each node's work
under a single named trace span.

## Development

Add new dependencies:
```bash
uv add <package-name>
```

Add development dependencies:
```bash
uv add --dev <package-name>
```
