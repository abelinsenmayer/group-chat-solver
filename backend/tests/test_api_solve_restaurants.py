from unittest.mock import patch

from fastapi.testclient import TestClient

from src.solve_restaurants import events
from src.api import app

client = TestClient(app)


def test_solve_restaurants_endpoint_returns_200_and_run_id():
    request = {
        "people": [
            {
                "name": "A",
                "availability": {"start": "17:00", "end": "20:00"},
                "location": {"latitude": 40.0, "longitude": -73.0},
                "preferences": "vegetarian",
            }
        ],
        "overlap": {
            "type": "Polygon",
            "coordinates": [[[-74, 40], [-72, 40], [-72, 41], [-74, 41], [-74, 40]]],
        },
    }

    with patch("src.api.start_solve_restaurants", return_value=("run-123", None)):
        response = client.post("/api/solve-restaurants", json=request)

    assert response.status_code == 200
    assert response.json() == {"run_id": "run-123", "status": "started"}


def test_solve_restaurants_events_streams_emitted_events():
    events.create_run("run-events-1")
    events.emit("run-events-1", {"type": "planner_started", "round": 1})
    events.close_run("run-events-1")

    with client.stream("GET", "/api/solve-restaurants/run-events-1/events") as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())

    assert 'data: {"type": "planner_started", "round": 1}\n\n' in body


def test_solve_restaurants_events_returns_404_for_unknown_run_id():
    response = client.get("/api/solve-restaurants/unknown-run/events")
    assert response.status_code == 404


def test_solve_restaurants_events_calls_cancel_on_disconnect():
    events.create_run("run-cancel-2")
    events.emit("run-cancel-2", {"type": "planner_started", "round": 1})

    with patch("src.api.cancel_solve_restaurants") as mock_cancel:
        with client.stream("GET", "/api/solve-restaurants/run-cancel-2/events") as response:
            for chunk in response.iter_text():
                if "planner_started" in chunk:
                    break

    assert mock_cancel.call_args == (("run-cancel-2",),)
    events.discard("run-cancel-2")
