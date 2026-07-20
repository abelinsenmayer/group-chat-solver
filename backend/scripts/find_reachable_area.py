"""CLI for calling find_reachable_area with a real Mapbox access token."""

import argparse
import json
import os
import sys

from src.mapping_utils import find_reachable_area


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch the reachable drive-time area from the Mapbox Isochrone API."
    )
    parser.add_argument(
        "longitude",
        type=float,
        help="Starting longitude",
    )
    parser.add_argument(
        "latitude",
        type=float,
        help="Starting latitude",
    )
    parser.add_argument(
        "--minutes",
        type=float,
        default=30,
        help="Maximum drive time in minutes (default: 30, max: 60)",
    )
    parser.add_argument(
        "--profile",
        type=str,
        default="driving",
        help="Mapbox routing profile (default: driving)",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print the returned GeoJSON geometry",
    )

    args = parser.parse_args()

    if not os.environ.get("MAPBOX_ACCESS_TOKEN"):
        print(
            "Error: MAPBOX_ACCESS_TOKEN environment variable is required.",
            file=sys.stderr,
        )
        return 1

    geometry = find_reachable_area(
        start_coords=(args.longitude, args.latitude),
        max_drive_time=args.minutes,
        profile=args.profile,
    )

    print(json.dumps(geometry, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
