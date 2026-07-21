from datetime import time

import pytest

from src.person_json import PersonPayload, person_from_json, person_to_json


PAYLOAD = {
    "name": "Elena",
    "availability": {"start": "17:30", "end": "20:00"},
    "location": {"latitude": 40.7589, "longitude": -73.9851},
    "preferences": "Outdoor seating preferred",
}


def test_person_payload_parses_nested_api_payload():
    payload = PersonPayload.model_validate(PAYLOAD)

    assert payload.availability.start == time(17, 30)
    assert payload.location.longitude == -73.9851
    assert payload.to_person().location == (40.7589, -73.9851)


def test_person_from_json_parses_api_payload():
    person = person_from_json(PAYLOAD)

    assert person.name == "Elena"
    assert person.availability == (time(17, 30), time(20, 0))
    assert person.location == (40.7589, -73.9851)


def test_person_from_json_rejects_invalid_time():
    payload = {**PAYLOAD, "availability": {"start": "noon", "end": "20:00"}}

    with pytest.raises(ValueError, match=r"availability\.start"):
        person_from_json(payload)


def test_person_to_json_uses_frontend_location_shape():
    assert person_to_json(person_from_json(PAYLOAD))["location"] == {
        "latitude": 40.7589,
        "longitude": -73.9851,
    }
