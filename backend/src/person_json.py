from datetime import time

from pydantic import BaseModel

from src.person import Person


class AvailabilityPayload(BaseModel):
    start: time
    end: time


class LocationPayload(BaseModel):
    latitude: float
    longitude: float


class PersonPayload(BaseModel):
    name: str
    availability: AvailabilityPayload
    location: LocationPayload
    preferences: str

    def to_person(self) -> Person:
        return Person(
            name=self.name,
            availability=(self.availability.start, self.availability.end),
            location=(self.location.latitude, self.location.longitude),
            preferences=self.preferences,
        )


def person_from_json(payload: dict[str, object]) -> Person:
    return PersonPayload.model_validate(payload).to_person()


def person_to_json(person: Person) -> dict[str, object]:
    return {
        "name": person.name,
        "availability": {
            "start": person.availability[0].strftime("%H:%M"),
            "end": person.availability[1].strftime("%H:%M"),
        },
        "location": {
            "latitude": person.location[0],
            "longitude": person.location[1],
        },
        "preferences": person.preferences,
    }
