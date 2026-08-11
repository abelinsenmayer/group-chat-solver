from datetime import time, timedelta

from scipy.optimize import minimize_scalar

from src.mapping_utils import approximate_overlapping_reachable_area
from src.person import Person


MIN_WINDOW_DURATION = timedelta(hours=1, minutes=30)

_MICROSECONDS_PER_HOUR = 3_600_000_000
_MICROSECONDS_PER_MINUTE = 60_000_000
_MICROSECONDS_PER_SECOND = 1_000_000
_MIN_WINDOW_MICROSECONDS = int(MIN_WINDOW_DURATION.total_seconds() * _MICROSECONDS_PER_SECOND)


def _time_to_microseconds(t: time) -> int:
    return (
        t.hour * _MICROSECONDS_PER_HOUR
        + t.minute * _MICROSECONDS_PER_MINUTE
        + t.second * _MICROSECONDS_PER_SECOND
        + t.microsecond
    )


def _microseconds_to_time(us: int) -> time:
    hours, rem = divmod(us, _MICROSECONDS_PER_HOUR)
    minutes, rem = divmod(rem, _MICROSECONDS_PER_MINUTE)
    seconds, micro = divmod(rem, _MICROSECONDS_PER_SECOND)
    return time(hours, minutes, seconds, micro)


def find_common_window(persons: list[Person]) -> tuple[tuple[time, time] | None, list[Person]]:
    """Return the longest availability window shared by the most people.

    The returned window is at least ``MIN_WINDOW_DURATION`` long and must
    include at least two people, unless only one person was given, in which
    case their own availability is used as the window. If no such window
    exists, ``None`` is returned along with the full input list as excluded.

    Args:
        persons: A list of people with availability intervals.

    Returns:
        A tuple of ``(window, excluded)``. ``window`` is a ``(start, end)`` pair
        of ``datetime.time`` values, or ``None``. ``excluded`` lists the people
        who could not be included in the chosen window.
    """
    if not persons:
        return None, []

    intervals = []
    for person in persons:
        start, end = person.availability
        start_us = _time_to_microseconds(start)
        end_us = _time_to_microseconds(end)
        intervals.append((start_us, end_us, person))

    candidates = set()
    for start_us, end_us, _ in intervals:
        candidates.add(start_us)
        end_minus = end_us - _MIN_WINDOW_MICROSECONDS
        if end_minus >= 0:
            candidates.add(end_minus)

    best_count = 0
    best_length = -1
    best_start = 0
    best_end = 0
    best_active = []

    for s in sorted(candidates):
        active_intervals = []
        active_persons = []
        for start_us, end_us, person in intervals:
            if start_us <= s and end_us >= s + _MIN_WINDOW_MICROSECONDS:
                active_intervals.append((start_us, end_us))
                active_persons.append(person)

        if not active_intervals:
            continue

        count = len(active_intervals)
        max_start = max(start for start, _ in active_intervals)
        min_end = min(end for _, end in active_intervals)
        length = min_end - max_start

        if count > best_count or (count == best_count and length > best_length):
            best_count = count
            best_length = length
            best_start = max_start
            best_end = min_end
            best_active = active_persons

    min_required_count = 1 if len(persons) == 1 else 2
    if best_count < min_required_count:
        return None, list(persons)

    window = (_microseconds_to_time(best_start), _microseconds_to_time(best_end))
    excluded = [person for person in persons if person not in best_active]
    return window, excluded


def find_ideal_start_time(window: tuple[time, time], people: list[Person]) -> time:
    window_start, window_end = window
    start_us = _time_to_microseconds(window_start)
    end_us = _time_to_microseconds(window_end)
    latest_start_us = end_us - _MICROSECONDS_PER_HOUR

    if latest_start_us < start_us:
        raise ValueError("window must be at least one hour long")
    if latest_start_us == start_us:
        return window_start

    def objective(offset_us: float) -> float:
        candidate_time = _microseconds_to_time(start_us + round(offset_us))
        return -approximate_overlapping_reachable_area(people, candidate_time)

    result = minimize_scalar(
        objective,
        bounds=(0, latest_start_us - start_us),
        method="bounded",
        options={"xatol": 1.0},
    )
    return _microseconds_to_time(start_us + round(result.x))


