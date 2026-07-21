import importlib.util
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.person_json import person_from_json, person_to_json
from src.solver import solve_reachable_areas
from fastapi.middleware.cors import CORSMiddleware

sample_people_path = Path(__file__).resolve().parent.parent / "sample-data" / "sample_people.py"
spec = importlib.util.spec_from_file_location("sample_people", sample_people_path)
if spec is None or spec.loader is None:
    raise RuntimeError("Unable to load sample people.")
sample_people_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sample_people_module)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=[],
)


class ReachableAreasRequest(BaseModel):
    people: list[dict[str, object]] = Field(min_length=1)


@app.post("/api/reachable-areas")
def get_reachable_areas(request: ReachableAreasRequest) -> dict[str, object]:
    try:
        people = [person_from_json(person) for person in request.people]
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    result = solve_reachable_areas(people)
    result["people"] = [
        {**entry, "person": person_to_json(entry["person"])}
        for entry in result["people"]
    ]
    return result


@app.get("/api/people")
def get_people() -> list[dict[str, object]]:
    return [
        {
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
        for person in sample_people_module.sample_people
    ]
