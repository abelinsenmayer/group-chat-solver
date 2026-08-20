# Group Chat Solver

Your group chat can't decide on anything. Everyone has different constraints, preferences, and schedules. How can you coordinate a meetup that works for everyone?

By operationalizing everyone's needs and representing their preferences through AI agents, this project plans the ultimate hangout experience. The first version is a web application that plans a meal for a group of people: given each person's availability, departing location, and preferences, it finds a meeting time, a reachable area everyone can get to, and a restaurant recommendation.

## Project layout

This is a monorepo with three subprojects, each with its own README containing setup and usage instructions:

- [`backend/`](backend/README.md) — Python/FastAPI service that computes overlapping availability, reachable areas (via Mapbox isochrones), and runs the LangGraph-based restaurant solver.
- [`frontend/`](frontend/README.md) — TypeScript/React single-page app (Vite) that collects people/preferences and visualizes results on a Mapbox map.
- [`infrastructure/`](infrastructure/README.md) — AWS CDK (TypeScript) app that deploys the app to AWS (CloudFront + S3 for the frontend, a containerized FastAPI backend on a Lambda Function URL).

## Quick start (local development)

### Prerequisites

- Node.js 18 or later with [Corepack](https://nodejs.org/api/corepack.html) enabled for Yarn Berry
- Python 3.10 or later
- [uv](https://docs.astral.sh/uv/)

### Install dependencies

```bash
cd frontend && corepack yarn install
cd ../backend && uv sync
```

### Configuration

The backend and frontend each read secrets/config from their own `.env` file — see [`backend/README.md`](backend/README.md#configuration) and [`frontend/README.md`](frontend/README.md#configuration) for the full list of variables (Mapbox tokens, Tavily key, AI provider, LangSmith tracing, etc). Do not commit either `.env` file.

### Run locally

From the repository root, `start-dev.ps1` (or `start-dev.cmd`) launches both dev servers in separate terminals:

```powershell
.\start-dev.ps1
```

Or start them individually:

```bash
# Terminal 1
cd backend
uv run uvicorn src.api:app --reload

# Terminal 2
cd frontend
corepack yarn dev
```

Open the frontend at `http://localhost:5173`. The backend API runs at `http://127.0.0.1:8000`.

### Run tests

```bash
cd frontend && corepack yarn test
cd ../backend && uv run pytest
cd ../infrastructure && npm test
```

## Deploying

See [`infrastructure/README.md`](infrastructure/README.md) for one-time AWS setup and deployment instructions.
