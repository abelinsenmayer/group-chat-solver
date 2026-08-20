from datetime import time
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.api import app
from src.person import Person


def test_wakeup_endpoint_returns_ok():
    response = TestClient(app).get("/api/wakeup")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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


def test_event_timeline_endpoint_returns_solver_result():
    payload = {
        "people": [
            {
                "name": "Elena",
                "availability": {"start": "17:30", "end": "20:00"},
                "location": {"latitude": 40.7589, "longitude": -73.9851},
                "preferences": "",
            }
        ]
    }
    result = {
        "status": "ok",
        "common_window": {"start": "17:30", "end": "20:00"},
        "optimal_start_time": "18:00",
        "optimal_end_time": "19:00",
    }

    with patch("src.api.solve_event_timeline", return_value=result):
        response = TestClient(app).post("/api/event-timeline", json=payload)

    assert response.status_code == 200
    assert response.json() == result


def test_reachable_areas_endpoint_returns_solver_result():
    payload = {
        "people": [
            {
                "name": "Elena",
                "availability": {"start": "17:30", "end": "20:00"},
                "location": {"latitude": 40.7589, "longitude": -73.9851},
                "preferences": "",
            }
        ]
    }

    with patch("src.api.solve_reachable_areas", return_value={
        "status": "ok",
        "optimal_start_time": "18:00",
        "people": [{
            "person": Person("Elena", (time(17, 30), time(20)), (40.7589, -73.9851), ""),
            "travel_time_minutes": 30,
            "area": {"type": "Polygon", "coordinates": []},
        }],
        "overlap": None,
    }):
        response = TestClient(app).post("/api/reachable-areas", json=payload)

    assert response.status_code == 200
    assert response.json()["people"][0]["person"]["location"] == {
        "latitude": 40.7589,
        "longitude": -73.9851,
    }


def test_reachable_areas_endpoint_uses_confirmed_event_start_time():
    payload = {
        "people": [
            {
                "name": "Elena",
                "availability": {"start": "17:30", "end": "20:00"},
                "location": {"latitude": 40.7589, "longitude": -73.9851},
                "preferences": "",
            }
        ],
        "event_start_time": "18:00",
    }
    result = {"status": "ok", "optimal_start_time": "18:00", "people": [], "overlap": None}

    with patch("src.api.solve_reachable_areas", return_value=result) as solve:
        response = TestClient(app).post("/api/reachable-areas", json=payload)

    assert response.status_code == 200
    assert solve.call_args.args[1] == time(18)


def test_reachable_areas_endpoint_rejects_empty_people():
    response = TestClient(app).post("/api/reachable-areas", json={"people": []})

    assert response.status_code == 422


def test_event_timeline_preflight_allows_frontend_headers():
    response = TestClient(app).options(
        "/api/event-timeline",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type, x-amz-content-sha256",
        },
    )

    assert response.status_code == 200
    allowed_headers = response.headers.get("access-control-allow-headers", "")
    assert "x-amz-content-sha256" in allowed_headers
