import os
import urllib.parse
from datetime import time

import pytest
import responses
from requests.exceptions import HTTPError

from src.mapping_utils import (
    approximate_overlapping_reachable_area,
    compute_bounding_box,
    intersect_polygons,
    find_pois_in_polygon,
    find_reachable_area,
    point_in_polygon,
)
from src.person import Person

ACCESS_TOKEN = "pk.test_token"


@pytest.fixture(autouse=True)
def set_token(monkeypatch):
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", ACCESS_TOKEN)


def _assert_query_param(request, name, expected):
    parsed = urllib.parse.urlparse(request.url)
    params = urllib.parse.parse_qs(parsed.query)
    assert params.get(name) == [expected]


@responses.activate
def test_find_reachable_area_returns_geometry():
    geometry = {
        "type": "Polygon",
        "coordinates": [
            [
                [-73.99, 40.75],
                [-73.98, 40.75],
                [-73.98, 40.74],
                [-73.99, 40.74],
                [-73.99, 40.75],
            ]
        ],
    }
    responses.get(
        "https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/-73.9857,40.7484",
        json={"features": [{"geometry": geometry}]},
        status=200,
    )

    result = find_reachable_area((-73.9857, 40.7484), 30)

    assert result == geometry
    _assert_query_param(responses.calls[0].request, "contours_minutes", "30")
    _assert_query_param(responses.calls[0].request, "polygons", "true")
    _assert_query_param(responses.calls[0].request, "access_token", ACCESS_TOKEN)


@responses.activate
def test_caps_max_drive_time_at_60():
    geometry = {"type": "Polygon", "coordinates": []}
    responses.get(
        "https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/-73.9857,40.7484",
        json={"features": [{"geometry": geometry}]},
        status=200,
    )

    find_reachable_area((-73.9857, 40.7484), 90)

    _assert_query_param(responses.calls[0].request, "contours_minutes", "60")


@responses.activate
def test_non_positive_drive_time_raises():
    with pytest.raises(ValueError, match="max_drive_time must be a positive number"):
        find_reachable_area((-73.9857, 40.7484), 0)


@responses.activate
def test_missing_access_token_raises(monkeypatch):
    monkeypatch.delenv("MAPBOX_ACCESS_TOKEN")
    with pytest.raises(ValueError, match="MAPBOX_ACCESS_TOKEN environment variable"):
        find_reachable_area((-73.9857, 40.7484), 30)


@responses.activate
def test_api_http_error_raises():
    responses.get(
        "https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/-73.9857,40.7484",
        json={"message": "Internal Server Error"},
        status=500,
    )

    with pytest.raises(HTTPError):
        find_reachable_area((-73.9857, 40.7484), 30)


@responses.activate
def test_empty_features_raises():
    responses.get(
        "https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/-73.9857,40.7484",
        json={"features": []},
        status=200,
    )

    with pytest.raises(RuntimeError, match="did not contain any features"):
        find_reachable_area((-73.9857, 40.7484), 30)


@responses.activate
def test_missing_geometry_raises():
    responses.get(
        "https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/-73.9857,40.7484",
        json={"features": [{}]},
        status=200,
    )

    with pytest.raises(RuntimeError, match="did not contain geometry"):
        find_reachable_area((-73.9857, 40.7484), 30)


# ---------------------------------------------------------------------------
# compute_bounding_box tests
# ---------------------------------------------------------------------------


class TestComputeBoundingBox:
    def test_returns_min_enclosing_rectangle(self):
        coords = [(-10.0, -5.0), (10.0, 5.0), (0.0, 0.0)]
        assert compute_bounding_box(coords) == (-10.0, -5.0, 10.0, 5.0)

    def test_single_point(self):
        coords = [(1.5, 2.5)]
        assert compute_bounding_box(coords) == (1.5, 2.5, 1.5, 2.5)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            compute_bounding_box([])


class TestIntersectPolygons:
    def test_returns_common_polygon_for_overlapping_polygons(self):
        first = {
            "type": "Polygon",
            "coordinates": [[(0, 0), (2, 0), (2, 2), (0, 2), (0, 0)]],
        }
        second = {
            "type": "Polygon",
            "coordinates": [[(1, 1), (3, 1), (3, 3), (1, 3), (1, 1)]],
        }

        result = intersect_polygons([first, second])

        assert result == {
            "type": "Polygon",
            "coordinates": (
                ((2.0, 2.0), (2.0, 1.0), (1.0, 1.0), (1.0, 2.0), (2.0, 2.0)),
            ),
        }

    def test_returns_none_for_empty_input(self):
        assert intersect_polygons([]) is None

    def test_returns_none_for_disjoint_polygons(self):
        first = {
            "type": "Polygon",
            "coordinates": [[(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]],
        }
        second = {
            "type": "Polygon",
            "coordinates": [[(2, 2), (3, 2), (3, 3), (2, 3), (2, 2)]],
        }

        assert intersect_polygons([first, second]) is None

    def test_raises_for_non_polygon_geometry(self):
        point = {"type": "Point", "coordinates": [0, 0]}

        with pytest.raises(ValueError, match="Polygon or MultiPolygon"):
            intersect_polygons([point])

    def test_preserves_multipolygon_result(self):
        multipolygon = {
            "type": "MultiPolygon",
            "coordinates": [
                [[(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]],
                [[(2, 0), (3, 0), (3, 1), (2, 1), (2, 0)]],
            ],
        }
        covering_polygon = {
            "type": "Polygon",
            "coordinates": [[(-1, -1), (4, -1), (4, 2), (-1, 2), (-1, -1)]],
        }

        result = intersect_polygons([multipolygon, covering_polygon])

        assert result["type"] == "MultiPolygon"
        assert len(result["coordinates"]) == 2


# ---------------------------------------------------------------------------
# point_in_polygon tests
# ---------------------------------------------------------------------------

SQUARE = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]


class TestPointInPolygon:
    def test_point_inside(self):
        assert point_in_polygon((5.0, 5.0), SQUARE) is True

    def test_point_outside(self):
        assert point_in_polygon((15.0, 5.0), SQUARE) is False

    def test_point_outside_above(self):
        assert point_in_polygon((5.0, 15.0), SQUARE) is False

    def test_point_at_edge_near_vertex(self):
        # Just inside the polygon near a corner
        assert point_in_polygon((0.1, 0.1), SQUARE) is True

    def test_concave_polygon(self):
        # L-shaped polygon
        l_shape = [(0.0, 0.0), (10.0, 0.0), (10.0, 5.0), (5.0, 5.0), (5.0, 10.0), (0.0, 10.0)]
        # Inside the bottom part
        assert point_in_polygon((7.0, 2.0), l_shape) is True
        # In the concave notch (outside)
        assert point_in_polygon((7.0, 7.0), l_shape) is False


# ---------------------------------------------------------------------------
# find_pois_in_polygon tests
# ---------------------------------------------------------------------------

TRIANGLE = [(-74.0, 40.7), (-73.9, 40.7), (-73.95, 40.8)]

SEARCH_BOX_URL = "https://api.mapbox.com/search/searchbox/v1/forward"


def _make_feature(lon, lat, name="Test POI"):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "name": name,
            "coordinates": {"longitude": lon, "latitude": lat},
        },
    }


class TestFindPoisInPolygon:
    @responses.activate
    def test_returns_pois_inside_polygon(self):
        inside_poi = _make_feature(-73.95, 40.73, "Inside Cafe")
        outside_poi = _make_feature(-73.80, 40.73, "Outside Cafe")
        responses.get(
            SEARCH_BOX_URL,
            json={"type": "FeatureCollection", "features": [inside_poi, outside_poi]},
            status=200,
        )

        result = find_pois_in_polygon(TRIANGLE, "coffee")

        assert len(result) == 1
        assert result[0]["properties"]["name"] == "Inside Cafe"

    @responses.activate
    def test_passes_bbox_and_search_term(self):
        responses.get(
            SEARCH_BOX_URL,
            json={"type": "FeatureCollection", "features": []},
            status=200,
        )

        find_pois_in_polygon(TRIANGLE, "pizza", limit=5)

        req = responses.calls[0].request
        _assert_query_param(req, "q", "pizza")
        _assert_query_param(req, "limit", "5")
        _assert_query_param(req, "types", "poi")
        # Verify bbox matches the bounding box of TRIANGLE
        _assert_query_param(req, "bbox", "-74.0,40.7,-73.9,40.8")

    @responses.activate
    def test_passes_category_when_provided(self):
        responses.get(
            SEARCH_BOX_URL,
            json={"type": "FeatureCollection", "features": []},
            status=200,
        )

        find_pois_in_polygon(TRIANGLE, "food", category="restaurant")

        req = responses.calls[0].request
        _assert_query_param(req, "poi_category", "restaurant")

    @responses.activate
    def test_omits_category_when_none(self):
        responses.get(
            SEARCH_BOX_URL,
            json={"type": "FeatureCollection", "features": []},
            status=200,
        )

        find_pois_in_polygon(TRIANGLE, "food")

        req = responses.calls[0].request
        parsed = urllib.parse.urlparse(req.url)
        params = urllib.parse.parse_qs(parsed.query)
        assert "poi_category" not in params

    @responses.activate
    def test_caps_limit_at_10(self):
        responses.get(
            SEARCH_BOX_URL,
            json={"type": "FeatureCollection", "features": []},
            status=200,
        )

        find_pois_in_polygon(TRIANGLE, "coffee", limit=50)

        req = responses.calls[0].request
        _assert_query_param(req, "limit", "10")

    def test_empty_polygon_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            find_pois_in_polygon([], "coffee")

    def test_empty_search_term_raises(self):
        with pytest.raises(ValueError, match="search_term must not be empty"):
            find_pois_in_polygon(TRIANGLE, "")

    def test_missing_token_raises(self, monkeypatch):
        monkeypatch.delenv("MAPBOX_ACCESS_TOKEN")
        with pytest.raises(ValueError, match="MAPBOX_ACCESS_TOKEN"):
            find_pois_in_polygon(TRIANGLE, "coffee")

    @responses.activate
    def test_api_error_propagates(self):
        responses.get(
            SEARCH_BOX_URL,
            json={"message": "Unauthorized"},
            status=401,
        )

        with pytest.raises(HTTPError):
            find_pois_in_polygon(TRIANGLE, "coffee")


# ---------------------------------------------------------------------------
# approximate_overlapping_reachable_area tests
# ---------------------------------------------------------------------------

CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298


def _make_person(name, lat=CHICAGO_LAT, lon=CHICAGO_LON, avail_start=None, avail_end=None):
    if avail_start is None:
        avail_start = time(11, 0)
    # Default end leaves one hour of post-meeting time when start_time is 12:00.
    if avail_end is None:
        avail_end = time(14, 0)
    return Person(
        name=name,
        availability=(avail_start, avail_end),
        location=(lat, lon),
        preferences="",
    )


class TestApproximateOverlappingReachableArea:
    def test_empty_people_returns_zero(self):
        assert approximate_overlapping_reachable_area([], time(12, 0)) == 0.0

    def test_single_person_returns_circle_area(self):
        person = _make_person("A")
        result = approximate_overlapping_reachable_area([person], time(12, 0))

        # 1 hour of travel at 25 mph => radius of 25 miles
        expected_area = 25**2 * 3.141592653589793
        assert result > 0
        assert result == pytest.approx(expected_area, rel=0.05)

    def test_two_people_same_location_overlap(self):
        person_a = _make_person("A")
        person_b = _make_person("B")
        result = approximate_overlapping_reachable_area(
            [person_a, person_b], time(12, 0)
        )

        expected_area = 25**2 * 3.141592653589793
        assert result == pytest.approx(expected_area, rel=0.05)

    def test_two_people_far_apart_return_zero(self):
        # Two minutes of travel => ~0.83 miles of reach; circles do not overlap
        person_a = _make_person("A", avail_start=time(11, 58), avail_end=time(12, 2))
        person_b = _make_person("B", lat=41.8781, lon=-80.0, avail_start=time(11, 58), avail_end=time(12, 2))
        result = approximate_overlapping_reachable_area(
            [person_a, person_b], time(12, 0)
        )

        assert result == 0.0

    def test_three_people_with_one_excluded_return_zero(self):
        person_a = _make_person("A")
        person_b = _make_person("B")
        person_c = _make_person(
            "C", lat=41.8781, lon=-80.0, avail_start=time(11, 0), avail_end=time(13, 0)
        )
        result = approximate_overlapping_reachable_area(
            [person_a, person_b, person_c], time(12, 0)
        )

        assert result == 0.0

    def test_zero_travel_time_returns_zero(self):
        person = _make_person(
            "A", avail_start=time(12, 0), avail_end=time(12, 0)
        )
        result = approximate_overlapping_reachable_area([person], time(12, 0))

        assert result == 0.0
