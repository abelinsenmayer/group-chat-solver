# Frontend

TypeScript/React (Vite) frontend for the Group Chat Solver project, using yarn (Berry, via Corepack) for dependency management, Tailwind CSS for styling, and shadcn/ui components.

## Prerequisites

- Node.js 18 or higher
- [Corepack](https://nodejs.org/api/corepack.html) enabled (ships with Node 18+; run `corepack enable` once) so `corepack yarn` resolves the pinned Yarn Berry version

## Installation

```bash
cd frontend
corepack yarn install
```

## Configuration

Create `frontend/.env.local` with a browser-scoped Mapbox token so Mapbox GL JS can render the map:

```bash
VITE_MAPBOX_ACCESS_TOKEN=<mapbox public token>
```

Optionally override the backend API base URL (defaults to `http://127.0.0.1:8000` in development, and same-origin in production):

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Do not commit `.env.local` or any real tokens.

## Development

Start the dev server (with hot reload):

```bash
corepack yarn dev
```

The app runs at `http://localhost:5173` and expects the backend to be running at `http://127.0.0.1:8000` (see [`../backend/README.md`](../backend/README.md)).

## Tests

```bash
corepack yarn test        # single run (vitest)
corepack yarn test:watch  # watch mode
```

## Building

Build for production (type-checks then bundles with Vite):

```bash
corepack yarn build
```

Preview the production build locally:

```bash
corepack yarn preview
```

## Project structure

```
frontend/
  src/
    pages/         Top-level routed views (landing, person picker, event timeline,
                    reachable-area map, solve-restaurants, meet-the-agents)
    components/     Shared UI building blocks (PersonCard, popovers, shadcn/ui primitives in components/ui/)
    lib/            API client (people-api.ts) and utilities (circle layout, person colors)
    test/          Vitest setup
  public/         Static assets
  components.json  shadcn/ui configuration
```
