import logging
import os
from datetime import time
from functools import reduce
from typing import Optional

import geopandas as gpd
import requests
from shapely.geometry import Point, mapping, shape
from shapely.geometry.base import BaseGeometry

from src.person import Person
from src.time_util import add_hours_to_time, hours_between

logger = logging.getLogger(__name__)


def compute_bounding_box(
    polygon_coords: list[tuple[float, float]],
) -> tuple[float, float, float, float]:
    """Return the minimum bounding box that encloses all points in ``polygon_coords``.

    Parameters
    ----------
    polygon_coords:
        A list of ``(longitude, latitude)`` pairs defining the polygon vertices.

    Returns
    -------
    tuple
        ``(min_lon, min_lat, max_lon, max_lat)``
    """
    if not polygon_coords:
        raise ValueError("polygon_coords must not be empty")

    lons = [p[0] for p in polygon_coords]
    lats = [p[1] for p in polygon_coords]
    return (min(lons), min(lats), max(lons), max(lats))


def intersect_polygons(polygons: list[dict]) -> dict | None:
    if not polygons:
        return None

    geometries: list[BaseGeometry] = []
    for polygon in polygons:
        try:
            geometry = shape(polygon)
        except (AttributeError, TypeError, ValueError) as error:
            raise ValueError("polygons must contain valid GeoJSON geometries") from error
        if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            raise ValueError("polygons must contain Polygon or MultiPolygon geometries")
        geometries.append(geometry)

    intersection = reduce(
        lambda current, next_geometry: current.intersection(next_geometry), geometries
    )
    if intersection.is_empty or intersection.area == 0:
        return None

    return mapping(intersection)


def point_in_polygon(
    point: tuple[float, float],
    polygon_coords: list[tuple[float, float]],
) -> bool:
    """Determine whether ``point`` lies inside the polygon using ray-casting.

    Parameters
    ----------
    point:
        ``(longitude, latitude)`` of the point to test.
    polygon_coords:
        A list of ``(longitude, latitude)`` pairs defining the polygon vertices.
        The polygon is implicitly closed (last vertex connects to first).

    Returns
    -------
    bool
        ``True`` if the point is inside the polygon.
    """
    x, y = point
    n = len(polygon_coords)
    inside = False

    j = n - 1
    for i in range(n):
        xi, yi = polygon_coords[i]
        xj, yj = polygon_coords[j]

        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside


def find_pois_in_polygon(
    polygon_coords: list[tuple[float, float]],
    search_term: str,
    limit: int = 10,
    category: Optional[str] = None,
) -> list[dict]:
    """Find Points of Interest inside a polygon using the Mapbox Search Box API.

    The function computes the minimum bounding box enclosing the polygon, queries
    the Mapbox Search Box ``/forward`` endpoint constrained to that bounding box,
    and then filters results to only those whose coordinates fall inside the
    original polygon.

    Parameters
    ----------
    polygon_coords:
        A list of ``(longitude, latitude)`` pairs defining the polygon to search
        within. This is typically the exterior ring of a GeoJSON Polygon geometry
        (e.g. as returned by :func:`find_reachable_area`).
    search_term:
        The search query string to pass to the API (e.g. ``"coffee"``).
    limit:
        Maximum number of results to request from the API (max 10). The final
        number of results may be fewer after polygon filtering.
    category:
        Optional POI category string to further filter results
        (e.g. ``"coffee_shop"``).

    Returns
    -------
    list[dict]
        A list of GeoJSON Feature dicts for POIs that are inside the polygon.
    """
    access_token = os.environ.get("MAPBOX_ACCESS_TOKEN")
    if not access_token:
        raise ValueError("MAPBOX_ACCESS_TOKEN environment variable is required")

    if not polygon_coords:
        raise ValueError("polygon_coords must not be empty")

    if not search_term:
        raise ValueError("search_term must not be empty")

    limit = max(1, min(int(limit), 10))

    bbox = compute_bounding_box(polygon_coords)
    bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"

    # Compute centroid for proximity bias
    center_lon = (bbox[0] + bbox[2]) / 2
    center_lat = (bbox[1] + bbox[3]) / 2

    url = "https://api.mapbox.com/search/searchbox/v1/forward"
    params: dict = {
        "q": search_term,
        "bbox": bbox_str,
        "limit": str(limit),
        "proximity": f"{center_lon},{center_lat}",
        "types": "poi",
        "access_token": access_token,
    }

    if category:
        params["poi_category"] = category

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()

    data = response.json()
    features = data.get("features", [])

    # Filter to only those POIs whose coordinates fall inside the polygon
    results = []
    for feature in features:
        coords = feature.get("properties", {}).get("coordinates", {})
        lon = coords.get("longitude")
        lat = coords.get("latitude")
        if lon is not None and lat is not None:
            if point_in_polygon((lon, lat), polygon_coords):
                results.append(feature)

    return results


def find_reachable_area(
    start_coords: tuple[float, float],
    max_drive_time: int | float,
    profile: str = "driving-traffic",
) -> dict:
    """Return the reachable area from ``start_coords`` within ``max_drive_time`` minutes.

    Uses the Mapbox Isochrone API. The returned value is a GeoJSON ``geometry``
    object, typically a ``Polygon`` or ``MultiPolygon``.

    Parameters
    ----------
    start_coords:
        The starting location as ``(longitude, latitude)``.
    max_drive_time:
        Maximum drive time in minutes. Values above 60 are capped at 60.
    profile:
        Mapbox routing profile, e.g. ``driving``, ``walking``, or ``cycling``.

    Returns
    -------
    dict
        GeoJSON geometry for the reachable area.
    """
    access_token = os.environ.get("MAPBOX_ACCESS_TOKEN")
    if not access_token:
        raise ValueError("MAPBOX_ACCESS_TOKEN environment variable is required")

    if max_drive_time <= 0:
        raise ValueError("max_drive_time must be a positive number")

    max_drive_time = min(int(max_drive_time), 60)

    lon, lat = start_coords
    url = f"https://api.mapbox.com/isochrone/v1/mapbox/{profile}/{lon},{lat}"
    params = {
        "contours_minutes": str(max_drive_time),
        "contours_colors": "005a32",
        "polygons": "true",
        "access_token": access_token,
    }

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()

    data = response.json()
    features = data.get("features", [])
    if not features:
        raise RuntimeError("Isochrone API response did not contain any features")

    geometry = features[0].get("geometry")
    if not geometry:
        raise RuntimeError("Isochrone API response feature did not contain geometry")

    return geometry


def approximate_overlapping_reachable_area(people: list[Person], start_time: time) -> float:
    """Approximates the intersection of reachable areas for all participants.

    Each participant's reachable distance is based on an assumed travel speed and the smaller
    of the time from their availability start to the meeting start and the time from the meeting
    end to their availability end.

    Return the approximate overlapping area of all reachable radii in square miles, or zero if there is no
    common overlap for all people.
    """
    if not people:
        return 0.0

    # Calculate how far each person can travel
    def calculate_travel_distance_miles(person: Person) -> float:
        pre_hours = hours_between(start_time, person.availability[0])
        post_hours = hours_between(person.availability[1], add_hours_to_time(start_time, 1))
        max_travel_time = max(0.0, min(pre_hours, post_hours))
        travel_speed_mph = 25  # miles per hour
        return max_travel_time * travel_speed_mph

    max_travel_distance_meters = [
        calculate_travel_distance_miles(person) * 1609.34 for person in people
    ]

    # WGS84 (lat/long) uses EPSG:4326
    data = {
        "person": [p.name for p in people],
        "geometry": [Point(p.location[1], p.location[0]) for p in people],
        "max_travel_distance_meters": max_travel_distance_meters,
    }

    # Create a GeoDataFrame in Lat/Long
    gdf = gpd.GeoDataFrame(data, crs="EPSG:4326")

    # Automatically find the correct local UTM zone (meters-based grid)
    # This ensures accuracy based on where the points actually are
    utm_crs = gdf.estimate_utm_crs()
    gdf_metric = gdf.to_crs(utm_crs)

    # Generate the "reachable circles" (Buffers)
    gdf_metric["reachable_circle"] = gdf_metric.geometry.buffer(
        gdf_metric["max_travel_distance_meters"]
    )

    gdf_circles = gdf_metric.set_geometry("reachable_circle")

    # Seed the running intersection with the first circle as a GeoDataFrame
    intersection = gpd.GeoDataFrame(
        geometry=[gdf_circles.geometry.iloc[0]], crs=gdf_circles.crs
    )

    # Iteratively intersect with each remaining circle using gpd.overlay
    for circle_geom in gdf_circles.geometry.iloc[1:]:
        circle_gdf = gpd.GeoDataFrame(geometry=[circle_geom], crs=gdf_circles.crs)
        intersection = gpd.overlay(intersection, circle_gdf, how="intersection")
        if intersection.empty:
            return 0.0

    overlap_sq_meters = intersection.geometry.area.iloc[0]
    overlap_area_sq_miles = overlap_sq_meters / (1609.34 ** 2)
    return overlap_area_sq_miles
