import importlib.util
from pathlib import Path

from fastapi import FastAPI
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
    allow_methods=["GET"],
    allow_headers=[],
)


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
