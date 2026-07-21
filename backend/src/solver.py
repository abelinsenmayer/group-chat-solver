from src.person import Person
from src.when import *
from src.mapping_utils import *
from src.time_util import add_hours_to_time, hours_between


def solve_group_chat(persons: list[Person]):
    # Figure out when everyone is free
    overlap_time, excluded = find_common_window(persons)

    # Handle any cases where there's no time window which accommodates everyone
    if (len(excluded) > 0):
        raise ValueError("No time window which accommodates everyone")
        # TODO: More sophisticated handling here

    # TODO: Initial pass to see if anyone's preferences describe limits on their travel distance
    # and incorporate that into the distance constraints (also strip these requrements out of the judge agent's criteria)

    # Find the optimal start time for the event (assumed 1hr long minimum) which allows the largest searchable area for candiate restaurants
    optimal_start_time = find_ideal_start_time(overlap_time, persons)

    def _compute_max_travel_time_minutes(person: Person, start_time: time) -> int:
        pre_hours = hours_between(start_time, person.availability[0])
        post_hours = hours_between(person.availability[1], add_hours_to_time(start_time, 1))
        return max(0.0, min(pre_hours, post_hours)) * 60
    max_travel_times = {person.name: _compute_max_travel_time_minutes(person, optimal_start_time) for person in persons}

    # Determine the bounds of the searchable area
    reachable_areas = [find_reachable_area(person.location, max_travel_times[person.name]) for person in persons]
    common_reachable_area = intersect_polygons(reachable_areas)
    if common_reachable_area is None:
        raise ValueError("No commonly-reachable area for everyone")

    # TODO: Begin agent team loop with the location and Persons criteria
    pass


def _availability_duration_minutes(person: Person) -> int:
    start, end = person.availability
    start_minutes = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    return max(1, end_minutes - start_minutes)


def _travel_time_minutes(person: Person, start_time: time) -> int:
    pre_hours = hours_between(start_time, person.availability[0])
    post_hours = hours_between(person.availability[1], add_hours_to_time(start_time, 1))
    return max(1, int(max(0.0, min(pre_hours, post_hours)) * 60))


def solve_reachable_areas(persons: list[Person]) -> dict[str, object]:
    if not persons:
        raise ValueError("at least one person is required")

    window, excluded = find_common_window(persons)
    start_time = None
    status = "no_common_availability"
    if window is not None and not excluded:
        start_time = find_ideal_start_time(window, persons)
        status = "ok"

    results = []
    areas = []
    for person in persons:
        travel_time_minutes = (
            _travel_time_minutes(person, start_time)
            if start_time is not None
            else _availability_duration_minutes(person)
        )
        area = find_reachable_area(
            (person.location[1], person.location[0]), travel_time_minutes
        )
        areas.append(area)
        results.append(
            {
                "person": person,
                "travel_time_minutes": travel_time_minutes,
                "area": area,
            }
        )

    overlap = intersect_polygons(areas) if status == "ok" else None
    if status == "ok" and overlap is None:
        status = "no_common_reachable_area"

    return {
        "status": status,
        "optimal_start_time": start_time.strftime("%H:%M") if start_time else None,
        "people": results,
        "overlap": overlap,
    }
