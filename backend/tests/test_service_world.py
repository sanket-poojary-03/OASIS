import pytest
import json
from app.llm import LLMError
from app.schemas import FIXTURES_DIR
from app.service import AIUnavailable, WorldService, prompt_seed
from tests.conftest import FakeLLM


def test_every_world_is_a_fresh_answer(tmp_path, valley_json):
    llm = FakeLLM(valley_json, valley_json)
    svc = WorldService(llm)
    out = svc.generate("a misty valley")
    assert out["source"] == "live" and out["recipe"]["seed"] == prompt_seed("a misty valley")
    again = svc.generate("a misty valley")
    assert again["source"] == "live" and len(llm.calls) == 2  # never cached: the same prompt asks the AI again


def test_retry_after_invalid_answer(tmp_path, valley_json):
    llm = FakeLLM('{"type": "recipe", "recipe": {"version": 2}}', valley_json)
    out = WorldService(llm).generate("valley")
    assert out["source"] == "live" and len(llm.calls) == 2
    assert "invalid" in llm.calls[1][1]


def test_two_bad_answers_raise_instead_of_faking_a_world(tmp_path):
    with pytest.raises(AIUnavailable):
        WorldService(FakeLLM("garbage", "still garbage")).generate("desert canyon")


def test_unsupported_passes_through(tmp_path):
    no = json.dumps({"type": "unsupported", "reason": "nope"})
    out = WorldService(FakeLLM(no, no)).generate("x y z")
    assert out == {"type": "unsupported", "reason": "nope", "source": "live"}


def test_llm_error_raises(tmp_path):
    class Broken:
        model = "b"

        def complete(self, s, u):
            raise LLMError("down")

    with pytest.raises(AIUnavailable):
        WorldService(Broken()).generate("island")


def test_no_llm_raises_instead_of_making_up_a_world(tmp_path):
    with pytest.raises(AIUnavailable, match="LLM not available"):
        WorldService(None).generate("island")


@pytest.mark.parametrize("notes,expected", [(None, []), (7, []), ("abc", []), (["ok", 3, "fine"], ["ok", "fine"])])
def test_odd_notes_are_ignored(tmp_path, notes, expected):
    data = json.loads(json.dumps({"type": "recipe", "notes": notes}))
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    data["recipe"] = recipe
    out = WorldService(FakeLLM(json.dumps(data))).generate("valley")
    assert out["source"] == "live" and out["notes"] == expected


def test_unexpected_type_error_raises(tmp_path, caplog):
    class Odd:
        model = "o"

        def complete(self, s, u):
            return ["not", "a", "string"]

    with caplog.at_level("WARNING"):
        with pytest.raises(AIUnavailable):
            WorldService(Odd()).generate("island")
    assert "AI unavailable" in caplog.text


def test_unsupported_is_challenged_once_then_accepted(tmp_path, valley_json):
    llm = FakeLLM(json.dumps({"type": "unsupported", "reason": "not a city engine"}), valley_json)
    out = WorldService(llm).generate("a big modern city")
    assert out["type"] == "recipe" and len(llm.calls) == 2
    assert "only for harmful" in llm.calls[1][1]


def test_unsupported_twice_is_respected(tmp_path):
    no = json.dumps({"type": "unsupported", "reason": "harmful"})
    out = WorldService(FakeLLM(no, no)).generate("something harmful")
    assert out == {"type": "unsupported", "reason": "harmful", "source": "live"}


def test_world_prompt_welcomes_cities():
    from app.prompts import world_system_prompt
    p = world_system_prompt()
    assert "city" in p and "modern" in p


class BackupLLM(FakeLLM):
    """A client with a backup model: prefer_backup=True answers from the backup queue."""

    fallback_models = ["backup"]

    def __init__(self, *replies, backup=()):
        super().__init__(*replies)
        self.backup = list(backup)
        self.backup_calls = 0

    def complete(self, system, user, prefer_backup=False):
        if prefer_backup:
            self.backup_calls += 1
            return self.backup.pop(0)
        return super().complete(system, user)


def test_broken_answers_get_one_try_on_the_backup_model(tmp_path, valley_json):
    llm = BackupLLM("{broken", "{still broken", backup=[valley_json])
    out = WorldService(llm).generate("an apple orchard")
    assert out["type"] == "recipe" and llm.backup_calls == 1


def test_unusable_answers_say_so_not_busy(tmp_path):
    with pytest.raises(AIUnavailable) as e:
        WorldService(BackupLLM("{x", "{y", backup=["{z"])).generate("an apple orchard")
    assert "could not be used" in str(e.value)

    class Down:
        model = "d"

        def complete(self, s, u):
            raise LLMError("429")

    with pytest.raises(AIUnavailable) as e:
        WorldService(Down()).generate("an orchard")
    assert "busy" in str(e.value)


def test_notes_put_inside_the_recipe_are_moved_not_rejected(tmp_path, valley_json):
    data = json.loads(valley_json)
    data["recipe"]["notes"] = ["The grid is approximate."]
    data["notes"] = ["ok"]
    llm = FakeLLM(json.dumps(data))
    out = WorldService(llm).generate("a valley")
    assert out["type"] == "recipe" and len(llm.calls) == 1
    assert out["notes"] == ["ok", "The grid is approximate."] and "notes" not in out["recipe"]


def test_harmless_slips_are_repaired_not_rejected():
    from app.service import repair_recipe
    raw = {"places": [
        {"id": "a", "kind": "landmark", "label": "A", "asset": "tower", "size": "huge", "where": [{"rel": "highest", "of": "b"}, {"rel": "by_water", "of": "x"}]},
        {"id": "b", "kind": "prop", "label": "B", "asset": "lamp", "size": "tiny", "where": [{"rel": "direction", "dir": "north", "of": "a"}]},
        {"id": "c", "kind": "prop", "label": "C", "asset": "cart", "size": "weird"},
    ]}
    out = repair_recipe(raw)
    a, b, c = out["places"]
    assert a["size"] == "large" and a["where"] == [{"rel": "highest"}, {"rel": "by_water"}]
    assert b["size"] == "small" and b["where"][0]["of"] == "a"  # direction keeps its "of"
    assert c["size"] == "medium"
    assert repair_recipe("not a dict") == "not a dict"


def test_palette_colour_names_and_short_hex_are_repaired_unknown_ones_dropped():
    from app.service import repair_ops, repair_recipe
    out = repair_recipe({"places": [], "palette": {"ground": "Red", "water": "#4ad", "sky": "sort of moody"}})
    assert out["palette"] == {"ground": "#b03a2e", "water": "#44aadd"}
    assert repair_recipe({"places": [], "palette": "red"})["places"] == []  # a non-object palette is dropped
    assert "palette" not in repair_recipe({"places": [], "palette": "red"})
    ops = repair_ops([{"op": "setPalette", "ground": "purple", "sky": "#FFAA00"}, {"op": "removePlace", "id": "x"}])
    assert ops == [{"op": "setPalette", "ground": "#6c3483", "sky": "#FFAA00"}, {"op": "removePlace", "id": "x"}]
    assert repair_ops("nope") == "nope"


def test_vehicles_are_made_drivable_when_the_model_forgets():
    from app.service import repair_ops, repair_recipe
    raw = {"places": [{"id": "j", "kind": "prop", "label": "Jeep", "asset": "red jeep", "interaction": "none"},
                      {"id": "c", "kind": "prop", "label": "Cart", "asset": "wooden cart"},
                      {"id": "b", "kind": "structure", "label": "Bus stop", "asset": "bus stop shelter", "interaction": "none"}]}
    out = repair_recipe(raw)["places"]
    assert [p.get("interaction") for p in out] == ["drive", None, "none"]
    ops = repair_ops([{"op": "addPlace", "place": {"id": "t", "kind": "prop", "label": "Truck", "asset": "pickup truck", "interaction": "none"}}])
    assert ops[0]["place"]["interaction"] == "drive"


def test_bigger_worlds_slips_are_repaired_extra_fields_and_unknown_targets():
    from app.service import repair_recipe
    raw = {"places": [
        {"id": "spire", "kind": "landmark", "label": "Spire", "asset": "glass spire", "where": [{"rel": "highest", "target": "obsidian"}, {"rel": "flat", "maxDist": 5}]},
        {"id": "canal", "kind": "structure", "label": "Canal", "asset": "canal lock", "where": [{"rel": "near", "target": "river", "maxDist": 40}, {"rel": "direction", "dir": "east", "of": "sea"}, {"rel": "near", "target": "spire"}]},
    ], "paths": [{"from": "spire", "to": "canal"}, {"from": "canal", "to": "harbour"}]}
    out = repair_recipe(raw)
    spire, canal = out["places"]
    assert spire["where"] == [{"rel": "highest"}, {"rel": "flat"}]
    assert canal["where"] == [{"rel": "direction", "dir": "east"}, {"rel": "near", "target": "spire"}]
    assert out["paths"] == [{"from": "spire", "to": "canal"}]


def test_relation_keys_and_kind_words_are_repaired_and_road_places_dropped():
    from app.service import repair_recipe
    raw = {"places": [
        {"id": "town", "kind": "district", "label": "Town", "asset": "house"},
        {"id": "spire", "kind": "monument", "label": "Spire", "asset": "spire", "where": [{"rel": "visible_from", "of": "town"}, {"rel": "near", "from": "town", "maxDist": 50, "minDist": 3}]},
        {"id": "main-road", "kind": "path", "label": "Main road", "asset": "road"},
        {"id": "shop", "kind": "building", "label": "Shop", "asset": "shop", "where": [{"rel": "near", "target": "main-road"}]},
    ], "paths": [{"from": "town", "to": "main-road"}]}
    out = repair_recipe(raw)
    assert [p["id"] for p in out["places"]] == ["town", "spire", "shop"]  # roads are built automatically
    assert [p["kind"] for p in out["places"]] == ["settlement", "landmark", "structure"]
    assert out["places"][1]["where"] == [{"rel": "visible_from", "target": "town"}, {"rel": "near", "target": "town", "maxDist": 50}]
    assert out["places"][2]["where"] == [] and out["paths"] == []


def test_compass_words_are_repaired_and_unknown_directions_dropped():
    from app.service import repair_recipe
    raw = {"places": [{"id": "a", "kind": "landmark", "label": "A", "asset": "x"},
                      {"id": "b", "kind": "prop", "label": "B", "asset": "y", "where": [{"rel": "direction", "dir": "SouthWest", "of": "a"}, {"rel": "direction", "dir": "inland"}, {"rel": "direction", "dir": "northern"}]}]}
    assert repair_recipe(raw)["places"][1]["where"] == [{"rel": "direction", "dir": "south", "of": "a"}, {"rel": "direction", "dir": "north"}]


def test_a_few_bad_places_are_left_out_not_the_whole_world(tmp_path, valley_json):
    from app.service import keep_valid_places
    data = json.loads(valley_json)["recipe"]
    data["places"].append({"id": "odd", "kind": "landmark", "label": "Odd", "asset": "thing", "size": 7})
    data["places"].append({"id": "odd2", "kind": "prop", "label": "", "asset": "thing", "where": [{"rel": "near", "target": "odd"}]})
    recipe, dropped = keep_valid_places(data)
    assert [p.id for p in recipe.places] == ["village", "tower", "campfire"] and dropped == ["Odd", "odd2"]
    reply = json.loads(valley_json)
    reply["recipe"] = data
    out = WorldService(FakeLLM(json.dumps(reply))).generate("valley")
    # in the service the size slip of "Odd" is repaired first, so only the nameless one is left out
    assert len(out["recipe"]["places"]) == 4 and any("Left out 1 place" in n and "odd2" in n for n in out["notes"])


def test_scenery_keeps_good_entries_and_drops_bad_ones():
    from app.service import repair_recipe
    raw = {"places": [], "scenery": [
        {"asset": "stone shrine", "kind": "Building", "size": "huge", "interaction": "pray", "spot": "somewhere"},
        "wooden cart",
        {"kind": "prop"},
        {"asset": "x"},
        7,
        {"asset": "a village of huts", "kind": "settlement"},
    ]}
    assert repair_recipe(raw)["scenery"] == [
        {"asset": "stone shrine", "kind": "structure", "size": "large", "interaction": "none", "spot": "anywhere"},
        {"asset": "wooden cart", "kind": "prop", "size": "medium", "interaction": "none", "spot": "anywhere"},
        {"asset": "a village of huts", "kind": "structure", "size": "medium", "interaction": "none", "spot": "anywhere"},
    ]


def test_scenery_that_is_unusable_or_too_long_cannot_cost_the_world():
    from app.schemas import MAX_SCENERY
    from app.service import repair_recipe
    assert "scenery" not in repair_recipe({"places": [], "scenery": "lots of shrines"})
    long = repair_recipe({"places": [], "scenery": [{"asset": f"thing {i}"} for i in range(30)]})
    assert len(long["scenery"]) == MAX_SCENERY
