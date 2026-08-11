from datetime import time

import pytest

from src.person import Person
from src.when import find_common_window, find_ideal_start_time


def _person(name: str, start: int | time, end: int | time) -> Person:
    start_time = time(start) if isinstance(start, int) else start
    end_time = time(end) if isinstance(end, int) else end
    return Person(
        name=name,
        availability=(start_time, end_time),
        location=(0.0, 0.0),
        preferences="",
    )


def test_full_overlap() -> None:
    persons = [
        _person("A", 10, 14),
        _person("B", 11, 16),
        _person("C", 12, 15),
    ]
    window, excluded = find_common_window(persons)
    assert window == (time(12), time(14))
    assert excluded == []


def test_partial_overlap_excludes_unavailable() -> None:
    persons = [
        _person("A", 10, 14),
        _person("B", 11, 16),
        _person("C", 17, 22),
    ]
    window, excluded = find_common_window(persons)
    assert window == (time(11), time(14))
    assert excluded == [persons[2]]


def test_disjoint_people_returns_none() -> None:
    persons = [
        _person("A", 10, 12),
        _person("B", 13, 15),
        _person("C", 16, 18),
    ]
    window, excluded = find_common_window(persons)
    assert window is None
    assert excluded == persons


def test_no_one_has_long_enough_availability() -> None:
    persons = [
        _person("A", 10, 11),
        _person("B", 11, 12),
    ]
    window, excluded = find_common_window(persons)
    assert window is None
    assert excluded == persons


def test_empty_list() -> None:
    window, excluded = find_common_window([])
    assert window is None
    assert excluded == []


def test_short_full_overlap_is_rejected_for_longer_pair() -> None:
    persons = [
        _person("A", 10, 13),
        _person("B", 12, 15),
        _person("C", 11, 14),
    ]
    window, excluded = find_common_window(persons)
    assert window == (time(11), time(13))
    assert excluded == [persons[1]]


def test_two_person_exact_minimum_overlap_allowed() -> None:
    persons = [
        _person("A", 10, 14),
        _person("B", time(11, 30), time(13)),
    ]
    window, excluded = find_common_window(persons)
    assert window == (time(11, 30), time(13))
    assert excluded == []


def test_no_two_person_window_long_enough() -> None:
    persons = [
        _person("A", 10, 12),
        _person("B", 11, 13),
        _person("C", time(12, 30), time(14)),
    ]
    window, excluded = find_common_window(persons)
    assert window is None
    assert excluded == persons


def test_longer_pair_preferred_over_shorter_pair() -> None:
    persons = [
        _person("A", 10, 12),
        _person("B", time(11, 30), time(14)),
        _person("C", time(11, 30), time(14)),
    ]
    window, excluded = find_common_window(persons)
    assert window == (time(11, 30), time(14))
    assert excluded == [persons[0]]


def test_single_person_with_long_enough_availability_returns_own_window() -> None:
    persons = [_person("A", 10, 14)]
    window, excluded = find_common_window(persons)
    assert window == (time(10), time(14))
    assert excluded == []


def test_single_person_without_long_enough_availability_returns_none() -> None:
    persons = [_person("A", 10, time(10, 30))]
    window, excluded = find_common_window(persons)
    assert window is None
    assert excluded == persons


def test_find_ideal_start_time_maximizes_reachable_area(monkeypatch) -> None:
    def area(_people: list[Person], start_time: time) -> float:
        offset_seconds = (
            (start_time.hour - 9) * 3_600
            + start_time.minute * 60
            + start_time.second
            + start_time.microsecond / 1_000_000
        )
        return 100.0 - (offset_seconds - 3_600) ** 2

    monkeypatch.setattr("src.when.approximate_overlapping_reachable_area", area)

    result = find_ideal_start_time((time(9), time(12)), [_person("A", 9, 12)])

    assert result == time(10)


def test_find_ideal_start_time_stays_within_valid_event_start_bounds(monkeypatch) -> None:
    evaluated_times = []

    def area(_people: list[Person], start_time: time) -> float:
        evaluated_times.append(start_time)
        return 1.0

    monkeypatch.setattr("src.when.approximate_overlapping_reachable_area", area)

    find_ideal_start_time((time(9), time(12)), [_person("A", 9, 12)])

    assert evaluated_times
    assert all(time(9) <= evaluated_time <= time(11) for evaluated_time in evaluated_times)


def test_find_ideal_start_time_returns_only_valid_start_for_one_hour_window(monkeypatch) -> None:
    monkeypatch.setattr(
        "src.when.approximate_overlapping_reachable_area", lambda _people, _time: 1.0
    )

    result = find_ideal_start_time((time(9), time(10)), [_person("A", 9, 10)])

    assert result == time(9)


def test_find_ideal_start_time_rejects_window_shorter_than_event() -> None:
    with pytest.raises(ValueError, match="at least one hour"):
        find_ideal_start_time((time(9), time(9, 30)), [_person("A", 9, 10)])
