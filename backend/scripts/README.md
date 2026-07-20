# Scripts

Run the commands below from the backend repository root after `uv sync`.

## Direct prompt

Send a prompt to the selected model backend.

```bash
uv run python scripts/direct_prompt.py "What time works for everyone?" --backend ollama
```

## Reachable area

Set `MAPBOX_ACCESS_TOKEN` before running this script. Fetch a GeoJSON drive-time area from a longitude and latitude.

```bash
uv run python scripts/find_reachable_area.py -73.9857 40.7484 --minutes 30 --profile driving --pretty
```

## POIs in polygon

Set `MAPBOX_ACCESS_TOKEN` before running this script. Search a saved GeoJSON Polygon for points of interest.

```bash
uv run python scripts/find_pois_in_polygon.py sample-data/reachable-area.json coffee --limit 10 --category coffee_shop --pretty
```

## Solve for sample people

Run the group-chat solver for one or more names from `sample-data/sample_people.py`.

```bash
uv run python scripts/solve_for_people.py Elena James Priya
```
