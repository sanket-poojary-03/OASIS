import json
from app.mock import mock_edit
from app.schemas import FIXTURES_DIR, EditRequest


def req(prompt: str, look_at=None, looking_at=None) -> EditRequest:
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    return EditRequest.model_validate({"recipe": recipe, "prompt": prompt, "context": {"player": {"x": 0, "z": 0}, "lookAt": look_at, "lookingAt": looking_at}})


def test_time_and_weather():
    out = mock_edit(req("make it night and rainy"))
    assert {"op": "setAtmosphere", "time": "night"} in out["ops"]
    assert {"op": "setAtmosphere", "weather": "rain"} in out["ops"]


def test_add_here_uses_look_at():
    out = mock_edit(req("put a lantern here", look_at={"x": 12.4, "z": -40}))
    op = out["ops"][0]
    assert op["op"] == "addPlace" and op["place"]["interaction"] == "light" and op["place"]["kind"] == "prop"
    assert op["place"]["where"] == [{"rel": "at", "x": 12.4, "z": -40}]


def test_add_landmark_without_look_at_and_unique_id():
    out = mock_edit(req("build a tower"))
    place = out["ops"][0]["place"]
    assert place["kind"] == "landmark" and place["id"] != "tower" and place["where"] == [{"rel": "flat"}]


def test_remove_that_and_winter_and_unknown():
    assert mock_edit(req("remove that", looking_at="campfire"))["ops"] == [{"op": "removePlace", "id": "campfire"}]
    winter = mock_edit(req("make it winter"))["ops"]
    assert {"op": "setClimate", "temperature": 0.1} in winter
    assert mock_edit(req("tell me a joke"))["type"] == "unsupported"


def test_bring_house_near_this():
    out = mock_edit(req("bring a house near this", look_at={"x": 3, "z": 4}, looking_at="campfire"))
    place = out["ops"][0]["place"]
    assert place["kind"] == "structure" and place["interaction"] == "door"
    assert place["asset"] == "house"
    assert place["where"] == [{"rel": "near", "target": "campfire", "maxDist": 30}, {"rel": "flat"}]


def test_candle_on_this_table_sets_y():
    out = mock_edit(req("put a candle on this table", look_at={"x": 3, "y": 0.95, "z": 4}, looking_at="table"))
    place = out["ops"][0]["place"]
    assert place["interaction"] == "light" and place["asset"] == "candle"
    assert place["where"] == [{"rel": "at", "x": 3, "z": 4, "y": 0.95}]


def test_barrel_here_does_not_copy_y():
    out = mock_edit(req("put a barrel here", look_at={"x": 3, "y": 4.2, "z": 4}, looking_at="wall"))
    assert out["ops"][0]["place"]["where"] == [{"rel": "at", "x": 3, "z": 4}]
