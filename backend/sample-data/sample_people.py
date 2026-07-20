import sys
from datetime import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.person import Person

sample_people = [
    Person(
        name="Elena",
        availability=(time(17, 30), time(20, 0)),
        location=(40.7589, -73.9851),
        preferences="Outdoor seating preferred",
    ),
    Person(
        name="James",
        availability=(time(18, 0), time(21, 30)),
        location=(40.7308, -73.9973),
        preferences="Must have Celiac-friendly options",
    ),
    Person(
        name="Priya",
        availability=(time(17, 0), time(19, 30)),
        location=(40.7484, -73.9857),
        preferences="Vegetarian-friendly Indian or Mexican",
    ),
    Person(
        name="Marcus",
        availability=(time(18, 30), time(22, 0)),
        location=(40.7614, -73.9776),
        preferences="Prefer quiet spots within 10 minutes of me",
    ),
    Person(
        name="Sofia",
        availability=(time(19, 0), time(21, 0)),
        location=(40.7222, -73.9881),
        preferences="Pizza or casual Italian, rated above 4.5 stars",
    ),
]
