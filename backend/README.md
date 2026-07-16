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

## Development

Add new dependencies:
```bash
uv add <package-name>
```

Add development dependencies:
```bash
uv add --dev <package-name>
```
