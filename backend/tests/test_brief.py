import json

from fastapi.testclient import TestClient

from app.main import create_app
from app.service import WorldService
from tests.conftest import FakeLLM

BRIEF = json.dumps({"title": "Neon Harbour City", "brief": "A rain-soaked harbour city of glass towers rising to a central spire, docks to the east..."})


def test_every_brief_is_a_fresh_answer(tmp_path):
    llm = FakeLLM(BRIEF, BRIEF)
    svc = WorldService(llm)
    out = svc.brief("a futuristic city")
    assert out == {"brief": json.loads(BRIEF)["brief"], "title": "Neon Harbour City", "source": "live"}
    assert "world designer" in llm.calls[0][0] and llm.calls[0][1] == "a futuristic city"
    assert svc.brief("a futuristic city")["source"] == "live" and len(llm.calls) == 2


def test_a_failed_brief_is_empty_never_an_error(tmp_path):
    class Broken:
        model = "x"

        def complete(self, system, user):
            raise RuntimeError("busy")

    assert WorldService(Broken()).brief("a city") == {"brief": "", "source": "none"}
    assert WorldService(FakeLLM("not json at all")).brief("a city") == {"brief": "", "source": "none"}
    assert WorldService(None).brief("a city") == {"brief": "", "source": "none"}


def test_the_world_is_built_from_the_brief_with_the_players_words(tmp_path, valley_json):
    llm = FakeLLM(valley_json)
    svc = WorldService(llm)
    out = svc.generate("a misty valley", brief="A deep valley with a river and 15 places...")
    assert out["source"] == "live"
    user = llm.calls[0][1]
    assert "A deep valley with a river and 15 places" in user and "a misty valley" in user
    assert "12-20 places" in llm.calls[0][0] and "props" in llm.calls[0][0]


def test_brief_route_and_world_route_take_a_brief(tmp_path):
    client = TestClient(create_app(llm=None))
    assert client.post("/api/brief", json={"prompt": "a valley"}).json() == {"brief": "", "source": "none"}
    assert client.post("/api/world", json={"prompt": "a valley", "brief": "A long brief."}).json() == {"detail": "LLM not available."}
    assert client.post("/api/brief", json={"prompt": "x"}).status_code == 422


def test_worlds_use_the_world_model_briefs_and_edits_the_fast_one(tmp_path, valley_json):
    fast, strong = FakeLLM(BRIEF), FakeLLM(valley_json)
    strong.model = "strong-model"
    svc = WorldService(fast, world_llm=strong)
    svc.brief("a city")
    assert svc.generate("a city", brief="A city of towers...")["source"] == "live"
    assert len(fast.calls) == 1 and len(strong.calls) == 1
    assert "world designer" in fast.calls[0][0] and "Recipe JSON Schema" in strong.calls[0][0]


def test_layout_variants_are_repaired_not_fatal():
    from app.service import repair_recipe
    raw = {"places": [{"id": "d", "kind": "settlement", "layout": {"pattern": "grid", "variants": "office tower"}},
                      {"id": "e", "kind": "settlement", "layout": {"pattern": "grid", "variants": ["Office Tower", "office tower", {"asset": "hotel"}, 3, "x", "a", "b", "c", "d"]}}]}
    out = repair_recipe(raw)["places"]
    assert out[0]["layout"]["variants"] == ["office tower"]
    assert out[1]["layout"]["variants"] == ["Office Tower", "hotel"]
