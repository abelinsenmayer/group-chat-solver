from src.person import Person
from src.when import *
from src.mapping_utils import *


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
