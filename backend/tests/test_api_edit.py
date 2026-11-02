import json
from fastapi.testclient import TestClient
from app.main import create_app
from app.schemas import FIXTURES_DIR


def test_edit_route(tmp_path):
    client = TestClient(create_app(llm=None, cache_dir=tmp_path))
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    r = client.post("/api/edit", json={"recipe": recipe, "prompt": "add a bench here", "context": {"player": {"x": 0, "z": 0}, "lookAt": {"x": 5, "z": 6}}})
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "ops" and body["ops"][0]["place"]["interaction"] == "sit"


def test_edit_context_is_bounded(tmp_path):
    client = TestClient(create_app(llm=None, cache_dir=tmp_path))
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))

    def post(placements):
        return client.post("/api/edit", json={"recipe": recipe, "prompt": "make it night", "context": {"player": {"x": 0, "z": 0}, "placements": placements}})

    spot = {"id": "spot", "label": "x" * 60, "x": 1, "z": 2}
    assert post([spot] * 200).status_code == 200
    assert post([spot] * 201).status_code == 422
    assert post([{**spot, "label": "x" * 61}]).status_code == 422
