import json

from fastapi.testclient import TestClient

from app.cache import FileCache
from app.main import create_app
from app.service import WorldService
from tests.conftest import FakeLLM

BRIEF = json.dumps({"title": "Neon Harbour City", "brief": "A rain-soaked harbour city of glass towers rising to a central spire, docks to the east..."})


def test_brief_is_written_once_then_cached(tmp_path):
    llm = FakeLLM(BRIEF)
    svc = WorldService(llm, FileCache(tmp_path))
    out = svc.brief("a futuristic city")
    assert out == {"brief": json.loads(BRIEF)["brief"], "title": "Neon Harbour City", "source": "live"}
    assert "world designer" in llm.calls[0][0] and llm.calls[0][1] == "a futuristic city"
    assert svc.brief("a futuristic city")["source"] == "cache" and len(llm.calls) == 1


def test_a_failed_brief_is_empty_never_an_error(tmp_path):
    class Broken:
        model = "x"

        def complete(self, system, user):
            raise RuntimeError("busy")

    assert WorldService(Broken(), FileCache(tmp_path)).brief("a city") == {"brief": "", "source": "none"}
    assert WorldService(FakeLLM("not json at all"), FileCache(tmp_path / "b")).brief("a city") == {"brief": "", "source": "none"}
    assert WorldService(None, FileCache(tmp_path / "c")).brief("a city") == {"brief": "", "source": "mock"}


def test_the_world_is_built_from_the_brief_with_the_players_words(tmp_path, valley_json):
    llm = FakeLLM(valley_json)
    svc = WorldService(llm, FileCache(tmp_path))
    out = svc.generate("a misty valley", brief="A deep valley with a river and 15 places...")
    assert out["source"] == "live"
    user = llm.calls[0][1]
    assert "A deep valley with a river and 15 places" in user and "a misty valley" in user
    assert "12-20 places" in llm.calls[0][0] and "props" in llm.calls[0][0]


def test_brief_route_and_world_route_take_a_brief(tmp_path):
    client = TestClient(create_app(llm=None, cache_dir=tmp_path))
    assert client.post("/api/brief", json={"prompt": "a valley"}).json() == {"brief": "", "source": "mock"}
    r = client.post("/api/world", json={"prompt": "a valley", "brief": "A long brief."})
    assert r.status_code == 200 and r.json()["type"] == "recipe"
    assert client.post("/api/brief", json={"prompt": "x"}).status_code == 422
