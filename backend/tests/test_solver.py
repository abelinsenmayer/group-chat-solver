from datetime import time
from unittest.mock import patch

from src.person import Person
from src.solver import solve_event_timeline, solve_reachable_areas


AREA = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}


def test_solver_returns_each_area_and_overlap_for_common_availability():
    people = [
        Person("A", (time(17), time(20)), (40.0, -73.0), ""),
        Person("B", (time(17), time(20)), (40.1, -73.1), ""),
    ]
    with patch("src.solver.find_ideal_start_time", return_value=time(18)), patch(
        "src.solver.find_reachable_area", return_value=AREA
    ) as find_area, patch("src.solver.intersect_polygons", return_value=AREA):
        result = solve_reachable_areas(people)

    assert result["status"] == "ok"
    assert result["optimal_start_time"] == "18:00"
    assert [entry["travel_time_minutes"] for entry in result["people"]] == [60, 60]
    assert result["overlap"] == AREA
    assert find_area.call_args_list[0].args[0] == (-73.0, 40.0)


def test_event_timeline_returns_common_window_and_one_hour_interval():
    people = [
        Person("A", (time(17), time(20)), (40.0, -73.0), ""),
        Person("B", (time(18), time(21)), (40.1, -73.1), ""),
    ]
    with patch("src.solver.find_ideal_start_time", return_value=time(18, 30)):
        result = solve_event_timeline(people)

    assert result == {
        "status": "ok",
        "common_window": {"start": "18:00", "end": "20:00"},
        "optimal_start_time": "18:30",
        "optimal_end_time": "19:30",
    }


def test_event_timeline_reports_when_all_people_cannot_share_availability():
    people = [
        Person("A", (time(9), time(10)), (40.0, -73.0), ""),
        Person("B", (time(18), time(19)), (40.1, -73.1), ""),
    ]

    assert solve_event_timeline(people) == {
        "status": "no_common_availability",
        "common_window": None,
        "optimal_start_time": None,
        "optimal_end_time": None,
    }


def test_solver_uses_confirmed_event_start_time_without_optimizing():
    people = [
        Person("A", (time(17), time(20)), (40.0, -73.0), ""),
        Person("B", (time(17), time(20)), (40.1, -73.1), ""),
    ]
    with patch("src.solver.find_ideal_start_time") as find_start, patch(
        "src.solver.find_reachable_area", return_value=AREA
    ), patch("src.solver.intersect_polygons", return_value=AREA):
        result = solve_reachable_areas(people, time(18))

    assert result["status"] == "ok"
    assert result["optimal_start_time"] == "18:00"
    find_start.assert_not_called()


def test_solver_keeps_individual_areas_when_no_common_availability():
    people = [
        Person("A", (time(9), time(10)), (40.0, -73.0), ""),
        Person("B", (time(18), time(19)), (40.1, -73.1), ""),
    ]
    with patch("src.solver.find_reachable_area", return_value=AREA):
        result = solve_reachable_areas(people)

    assert result["status"] == "no_common_availability"
    assert result["overlap"] is None
    assert len(result["people"]) == 2
