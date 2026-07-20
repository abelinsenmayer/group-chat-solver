import argparse
import json
import os
import sys
from pathlib import Path

from src.mapping_utils import find_pois_in_polygon


def _load_polygon_coordinates(path: Path) -> list[tuple[float, float]]:
    try:
        geometry = json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise ValueError(f"Could not read geometry file: {error}") from error
    except json.JSONDecodeError as error:
        raise ValueError("Geometry file must contain valid JSON") from error

    if not isinstance(geometry, dict) or geometry.get("type") != "Polygon":
        raise ValueError("Geometry file must contain a GeoJSON Polygon")

    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates or not coordinates[0]:
        raise ValueError("GeoJSON Polygon must contain a non-empty coordinate ring")

    try:
        return [(float(lon), float(lat)) for lon, lat in coordinates[0]]
    except (TypeError, ValueError):
        raise ValueError("Polygon coordinates must be longitude-latitude pairs") from None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Find Mapbox POIs inside a saved GeoJSON Polygon."
    )
    parser.add_argument(
        "geometry_file", type=Path, help="Path to a GeoJSON Polygon JSON file"
    )
    parser.add_argument("search_term", help="POI search query, e.g. coffee")
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Maximum results to request (default: 10, max: 10)",
    )
    parser.add_argument("--category", help="Optional Mapbox POI category")
    parser.add_argument(
        "--pretty", action="store_true", help="Pretty-print returned GeoJSON features"
    )
    args = parser.parse_args()

    if not os.environ.get("MAPBOX_ACCESS_TOKEN"):
        print("Error: MAPBOX_ACCESS_TOKEN environment variable is required.", file=sys.stderr)
        return 1

    try:
        polygon_coords = _load_polygon_coordinates(args.geometry_file)
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    pois = find_pois_in_polygon(
        polygon_coords,
        args.search_term,
        limit=args.limit,
        category=args.category,
    )
    print(json.dumps(pois, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
