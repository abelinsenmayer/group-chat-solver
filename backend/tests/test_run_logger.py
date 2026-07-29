import json
import tempfile
from datetime import time

from src.solve_restaurants.run_logger import save_run
from src.solve_restaurants.state import SolveRestaurantsState, person_to_payload
from src.person import Person


def test_save_run_writes_json_file(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp_dir:
        monkeypatch.setenv("LOG_DIR", tmp_dir)
        from src.solve_restaurants import config
        config.get_settings.cache_clear()

        person = person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegan"))
        state = SolveRestaurantsState(people=[person], overlap={"type": "Polygon", "coordinates": []})
        path = save_run("run-123", state, state)

        assert path.exists()
        data = json.loads(path.read_text())
        assert data["run_id"] == "run-123"
        assert data["request"]["people"][0]["name"] == "A"
        assert "final_state" in data


def test_save_run_elides_coordinates_array(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp_dir:
        monkeypatch.setenv("LOG_DIR", tmp_dir)
        from src.solve_restaurants import config
        config.get_settings.cache_clear()

        person = person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegan"))
        overlap = {
            "type": "Polygon",
            "coordinates": [[[[-73.0, 40.0], [-73.1, 40.1], [-73.2, 40.2], [-73.0, 40.0]]]],
        }
        state = SolveRestaurantsState(people=[person], overlap=overlap)
        path = save_run("run-456", state, state)

        data = json.loads(path.read_text())
        assert data["request"]["overlap"]["coordinates"] == "..."
        assert data["final_state"]["overlap"]["coordinates"] == "..."
