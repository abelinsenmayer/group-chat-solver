from dataclasses import dataclass
from datetime import time


@dataclass
class Person:
    # The participant's name.
    name: str
    # The participant's available start and end times, in that order.
    availability: tuple[time, time]
    # The participant's departure coordinates as latitude and longitude.
    location: tuple[float, float]
    # The participant's meal constraints and preferences.
    preferences: str
