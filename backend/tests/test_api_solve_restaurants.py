from unittest.mock import patch

from fastapi.testclient import TestClient

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
