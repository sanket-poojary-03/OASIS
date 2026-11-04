import json
import pytest
from app.schemas import FIXTURES_DIR, EditRequest
from app.service import AIUnavailable, WorldService
from tests.conftest import FakeLLM

RECIPE = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
REQ = EditRequest.model_validate({"recipe": RECIPE, "prompt": "make it night", "context": {"player": {"x": 0, "z": 0}}})


def test_live_edit(tmp_path):
    llm = FakeLLM(json.dumps({"type": "ops", "ops": [{"op": "setAtmosphere", "time": "night"}], "notes": []}))
    out = WorldService(llm).edit(REQ)
    assert out == {"type": "ops", "ops": [{"op": "setAtmosphere", "time": "night"}], "notes": [], "source": "live"}
    assert "lookAt" in llm.calls[0][0]


def test_invalid_twice_raises(tmp_path):
    with pytest.raises(AIUnavailable):
        WorldService(FakeLLM('{"type":"ops","ops":[{"op":"explode"}]}', "nope")).edit(REQ)


def test_unsupported_passes_through(tmp_path):
    out = WorldService(FakeLLM('{"type":"unsupported","reason":"no"}')).edit(REQ)
    assert out == {"type": "unsupported", "reason": "no", "source": "live"}


def test_edit_prompt_explains_groups():
    from app.prompts import edit_system_prompt
    p = edit_system_prompt(REQ)
    assert "layout" in p and "grid" in p and "ring" in p


def test_ops_naming_unknown_places_are_sent_back_to_the_ai(tmp_path):
    bad = json.dumps({"type": "ops", "ops": [{"op": "addPlace", "place": {"id": "camp", "kind": "settlement", "label": "Camp", "asset": "tent",
                                                                        "where": [{"rel": "near", "target": "bonfire", "maxDist": 50}]}}]})
    good = json.dumps({"type": "ops", "ops": [{"op": "addPlace", "place": {"id": "camp", "kind": "settlement", "label": "Camp", "asset": "tent",
                                                                         "where": [{"rel": "near", "target": "village", "maxDist": 80}]}},
                                              {"op": "movePlace", "id": "camp", "where": [{"rel": "near", "target": "camp", "maxDist": 5}]}]})
    llm = FakeLLM(bad, good)
    out = WorldService(llm).edit(REQ)
    assert out["ops"][0]["place"]["where"][0]["target"] == "village" and len(llm.calls) == 2
    assert 'unknown place "bonfire"' in llm.calls[1][1]


def test_check_targets_follows_adds_and_removes():
    from app.schemas import Recipe, ops_adapter
    from app.service import check_targets
    recipe = Recipe.model_validate(RECIPE)
    ok = ops_adapter.validate_python([{"op": "addPlace", "place": {"id": "camp", "kind": "prop", "label": "C", "asset": "tent"}},
                                      {"op": "movePlace", "id": "village", "where": [{"rel": "near", "target": "camp", "maxDist": 9}]}])
    check_targets(recipe, ok)
    gone = ops_adapter.validate_python([{"op": "removePlace", "id": "village"},
                                        {"op": "addPlace", "place": {"id": "camp", "kind": "prop", "label": "C", "asset": "tent", "where": [{"rel": "near", "target": "village", "maxDist": 9}]}}])
    with pytest.raises(ValueError):
        check_targets(recipe, gone)


def test_a_named_time_is_added_when_the_answer_forgot_it(tmp_path):
    clear = json.dumps({"type": "ops", "ops": [{"op": "setAtmosphere", "weather": "clear"}], "notes": []})
    req = EditRequest.model_validate({**REQ.model_dump(), "prompt": "make it a clear day"})
    out = WorldService(FakeLLM(clear)).edit(req)
    assert out["ops"] == [{"op": "setAtmosphere", "weather": "clear", "time": "day"}]
    # an answer that does not touch the atmosphere is left alone
    add = json.dumps({"type": "ops", "ops": [{"op": "addPlace", "place": {"id": "market", "kind": "structure", "label": "Day market", "asset": "market stall"}}], "notes": []})
    req = EditRequest.model_validate({**REQ.model_dump(), "prompt": "add a day market"})
    out = WorldService(FakeLLM(add)).edit(req)
    assert all(o["op"] != "setAtmosphere" for o in out["ops"])
