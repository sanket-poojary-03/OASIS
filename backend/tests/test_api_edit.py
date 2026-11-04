import json
from fastapi.testclient import TestClient
from app.main import create_app
from app.schemas import FIXTURES_DIR
from tests.conftest import FakeLLM

NIGHT = json.dumps({"type": "ops", "ops": [{"op": "setAtmosphere", "time": "night"}], "notes": []})


def test_edit_route(tmp_path):
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    body = {"recipe": recipe, "prompt": "make it night", "context": {"player": {"x": 0, "z": 0}, "lookAt": {"x": 5, "z": 6}}}
    r = TestClient(create_app(llm=FakeLLM(NIGHT))).post("/api/edit", json=body)
    assert r.status_code == 200 and r.json()["ops"] == [{"op": "setAtmosphere", "time": "night"}]
    r = TestClient(create_app(llm=None)).post("/api/edit", json=body)
    assert r.status_code == 503 and r.json() == {"detail": "LLM not available."}


def test_edit_context_is_bounded(tmp_path):
    client = TestClient(create_app(llm=FakeLLM(NIGHT)))
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))

    def post(placements):
        return client.post("/api/edit", json={"recipe": recipe, "prompt": "make it night", "context": {"player": {"x": 0, "z": 0}, "placements": placements}})

    spot = {"id": "spot", "label": "x" * 60, "x": 1, "z": 2}
    assert post([spot] * 200).status_code == 200
    assert post([spot] * 201).status_code == 422
    assert post([{**spot, "label": "x" * 61}]).status_code == 422
