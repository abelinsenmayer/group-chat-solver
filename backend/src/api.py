import asyncio
import importlib.util
import json
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.logging_config import configure_logging
from src.person_json import person_from_json, person_to_json
from src.solve_restaurants import events
from src.solve_restaurants.config import configure_langsmith_tracing
from src.solve_restaurants.graph import start_solve_restaurants
from src.solver import solve_event_timeline, solve_reachable_areas
from fastapi.middleware.cors import CORSMiddleware

configure_logging()
configure_langsmith_tracing()

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


class EventTimelineRequest(BaseModel):
    people: list[dict[str, object]] = Field(min_length=1)


class ReachableAreasRequest(BaseModel):
    people: list[dict[str, object]] = Field(min_length=1)
    event_start_time: str | None = None


class SolveRestaurantsRequest(BaseModel):
    people: list[dict[str, object]] = Field(min_length=1)
    overlap: dict[str, object]


def people_from_request(payload: list[dict[str, object]]):
    try:
        return [person_from_json(person) for person in payload]
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/event-timeline")
def get_event_timeline(request: EventTimelineRequest) -> dict[str, object]:
    return solve_event_timeline(people_from_request(request.people))


@app.post("/api/reachable-areas")
def get_reachable_areas(request: ReachableAreasRequest) -> dict[str, object]:
    event_start_time = None
    if request.event_start_time is not None:
        try:
            event_start_time = datetime.strptime(request.event_start_time, "%H:%M").time()
        except ValueError as error:
            raise HTTPException(status_code=422, detail="event_start_time must use HH:MM format") from error

    result = solve_reachable_areas(people_from_request(request.people), event_start_time)
    result["people"] = [
        {**entry, "person": person_to_json(entry["person"])}
        for entry in result["people"]
    ]
    return result


@app.post("/api/solve-restaurants")
async def solve_restaurants(request: SolveRestaurantsRequest) -> dict[str, object]:
    people = people_from_request(request.people)
    run_id, _ = start_solve_restaurants(people, request.overlap)
    return {"run_id": run_id, "status": "started"}


@app.get("/api/solve-restaurants/{run_id}/events")
async def stream_solve_restaurants_events(run_id: str) -> StreamingResponse:
    try:
        run_queue = events.subscribe(run_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Unknown run_id") from error

    async def event_stream():
        try:
            while True:
                item = await asyncio.to_thread(run_queue.get)
                if item is events.SENTINEL:
                    break
                yield f"data: {json.dumps(item)}\n\n"
        finally:
            events.discard(run_id)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
