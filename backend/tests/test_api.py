from fastapi.testclient import TestClient

from src.api import app


def test_people_endpoint_returns_serialized_sample_people():
    response = TestClient(app).get("/api/people")

    assert response.status_code == 200
    assert response.json() == [
        {
            "name": "Elena",
            "availability": {"start": "17:30", "end": "20:00"},
            "location": {"latitude": 40.7589, "longitude": -73.9851},
            "preferences": "Outdoor seating preferred",
        },
        {
            "name": "James",
            "availability": {"start": "18:00", "end": "21:30"},
            "location": {"latitude": 40.7308, "longitude": -73.9973},
            "preferences": "Must have Celiac-friendly options",
        },
        {
            "name": "Priya",
            "availability": {"start": "17:00", "end": "19:30"},
            "location": {"latitude": 40.7484, "longitude": -73.9857},
            "preferences": "Vegetarian-friendly Indian or Mexican",
        },
        {
            "name": "Marcus",
            "availability": {"start": "18:30", "end": "22:00"},
            "location": {"latitude": 40.7614, "longitude": -73.9776},
            "preferences": "Prefer quiet spots within 10 minutes of me",
        },
        {
            "name": "Sofia",
            "availability": {"start": "19:00", "end": "21:00"},
            "location": {"latitude": 40.7222, "longitude": -73.9881},
            "preferences": "Pizza or casual Italian, rated above 4.5 stars",
        },
    ]
