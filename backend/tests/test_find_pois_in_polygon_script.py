import importlib.util
import json
from pathlib import Path
from unittest.mock import Mock

import pytest


SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "find_pois_in_polygon.py"
SPEC = importlib.util.spec_from_file_location("find_pois_in_polygon_script", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
script = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(script)


def test_load_polygon_coordinates_returns_exterior_ring(tmp_path):
    geometry_path = tmp_path / "area.json"
    geometry_path.write_text(
        '{"type": "Polygon", "coordinates": [[[-74.0, 40.7], [-73.9, 40.7], [-74.0, 40.7]]]}',
        encoding="utf-8",
    )

    assert script._load_polygon_coordinates(geometry_path) == [
        (-74.0, 40.7),
        (-73.9, 40.7),
        (-74.0, 40.7),
    ]


@pytest.mark.parametrize(
    ("contents", "message"),
    [
        ("not json", "valid JSON"),
        ('{"type": "MultiPolygon", "coordinates": []}', "Polygon"),
        ('{"type": "Polygon", "coordinates": []}', "coordinate ring"),
    ],
)
def test_load_polygon_coordinates_rejects_invalid_geometry(tmp_path, contents, message):
    geometry_path = tmp_path / "area.json"
    geometry_path.write_text(contents, encoding="utf-8")

    with pytest.raises(ValueError, match=message):
        script._load_polygon_coordinates(geometry_path)


def test_main_calls_mapping_utility_and_prints_pretty_json(tmp_path, monkeypatch, capsys):
    geometry_path = tmp_path / "area.json"
    geometry_path.write_text(
        '{"type": "Polygon", "coordinates": [[[-74.0, 40.7], [-73.9, 40.7], [-74.0, 40.7]]]}',
        encoding="utf-8",
    )
    find_pois = Mock(return_value=[{"properties": {"name": "Cafe"}}])
    monkeypatch.setattr(script, "find_pois_in_polygon", find_pois)
    monkeypatch.setenv("MAPBOX_ACCESS_TOKEN", "test-token")
    monkeypatch.setattr(
        "sys.argv",
        [
            "find_pois_in_polygon.py",
            str(geometry_path),
            "coffee",
            "--limit",
            "3",
            "--category",
            "coffee_shop",
            "--pretty",
        ],
    )

    assert script.main() == 0
    assert json.loads(capsys.readouterr().out) == [{"properties": {"name": "Cafe"}}]
    find_pois.assert_called_once_with(
        [(-74.0, 40.7), (-73.9, 40.7), (-74.0, 40.7)],
        "coffee",
        limit=3,
        category="coffee_shop",
    )


def test_main_returns_one_when_token_is_missing(tmp_path, monkeypatch, capsys):
    geometry_path = tmp_path / "area.json"
    geometry_path.write_text(
        '{"type": "Polygon", "coordinates": [[[-74.0, 40.7], [-73.9, 40.7], [-74.0, 40.7]]]}',
        encoding="utf-8",
    )
    monkeypatch.delenv("MAPBOX_ACCESS_TOKEN", raising=False)
    monkeypatch.setattr("sys.argv", ["find_pois_in_polygon.py", str(geometry_path), "coffee"])

    assert script.main() == 1
    assert "MAPBOX_ACCESS_TOKEN" in capsys.readouterr().err
