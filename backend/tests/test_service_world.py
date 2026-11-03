import pytest
import json
from app.cache import FileCache
from app.llm import LLMError
from app.mock import prompt_seed
from app.prompts import PROMPT_VERSION
from app.schemas import FIXTURES_DIR
from app.service import AIUnavailable, WorldService
from tests.conftest import FakeLLM


def test_live_then_cache(tmp_path, valley_json):
    llm = FakeLLM(valley_json)
    svc = WorldService(llm, FileCache(tmp_path))
    out = svc.generate("a misty valley")
    assert out["source"] == "live" and out["recipe"]["seed"] == prompt_seed("a misty valley")
    again = svc.generate("a misty valley")
    assert again["source"] == "cache" and len(llm.calls) == 1


def test_retry_after_invalid_answer(tmp_path, valley_json):
    llm = FakeLLM('{"type": "recipe", "recipe": {"version": 2}}', valley_json)
    out = WorldService(llm, FileCache(tmp_path)).generate("valley")
    assert out["source"] == "live" and len(llm.calls) == 2
    assert "invalid" in llm.calls[1][1]


def test_two_bad_answers_raise_instead_of_faking_a_world(tmp_path):
    with pytest.raises(AIUnavailable):
        WorldService(FakeLLM("garbage", "still garbage"), FileCache(tmp_path)).generate("desert canyon")


def test_unsupported_passes_through(tmp_path):
    no = json.dumps({"type": "unsupported", "reason": "nope"})
    out = WorldService(FakeLLM(no, no), FileCache(tmp_path)).generate("x y z")
    assert out == {"type": "unsupported", "reason": "nope", "source": "live"}


def test_llm_error_raises(tmp_path):
    class Broken:
        model = "b"

        def complete(self, s, u):
            raise LLMError("down")

    with pytest.raises(AIUnavailable):
        WorldService(Broken(), FileCache(tmp_path)).generate("island")


def test_no_llm_uses_mock(tmp_path):
    assert WorldService(None, FileCache(tmp_path)).generate("island")["source"] == "mock"


@pytest.mark.parametrize("notes,expected", [(None, []), (7, []), ("abc", []), (["ok", 3, "fine"], ["ok", "fine"])])
def test_odd_notes_are_ignored(tmp_path, notes, expected):
    data = json.loads(json.dumps({"type": "recipe", "notes": notes}))
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    data["recipe"] = recipe
    out = WorldService(FakeLLM(json.dumps(data)), FileCache(tmp_path)).generate("valley")
    assert out["source"] == "live" and out["notes"] == expected


def test_corrupt_cache_entry_is_a_miss(tmp_path, valley_json):
    cache = FileCache(tmp_path)
    key = cache.key("world", PROMPT_VERSION, "fake-model", "valley")
    (tmp_path / f"{key}.json").write_text("{half", encoding="utf-8")
    llm = FakeLLM(valley_json)
    assert WorldService(llm, cache).generate("valley")["source"] == "live"
    assert cache.get(key)["source"] == "live"


def test_cache_put_leaves_no_temp_files(tmp_path):
    cache = FileCache(tmp_path)
    cache.put("k", {"a": 1})
    assert [p.name for p in tmp_path.iterdir()] == ["k.json"]


def test_unexpected_type_error_raises(tmp_path, caplog):
    class Odd:
        model = "o"

        def complete(self, s, u):
            return ["not", "a", "string"]

    with caplog.at_level("WARNING"):
        with pytest.raises(AIUnavailable):
            WorldService(Odd(), FileCache(tmp_path)).generate("island")
    assert "AI unavailable" in caplog.text


def test_unsupported_is_challenged_once_then_accepted(tmp_path, valley_json):
    llm = FakeLLM(json.dumps({"type": "unsupported", "reason": "not a city engine"}), valley_json)
    out = WorldService(llm, FileCache(tmp_path)).generate("a big modern city")
    assert out["type"] == "recipe" and len(llm.calls) == 2
    assert "only for harmful" in llm.calls[1][1]


def test_unsupported_twice_is_respected(tmp_path):
    no = json.dumps({"type": "unsupported", "reason": "harmful"})
    out = WorldService(FakeLLM(no, no), FileCache(tmp_path)).generate("something harmful")
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
    out = WorldService(llm, FileCache(tmp_path)).generate("an apple orchard")
    assert out["type"] == "recipe" and llm.backup_calls == 1


def test_unusable_answers_say_so_not_busy(tmp_path):
    with pytest.raises(AIUnavailable) as e:
        WorldService(BackupLLM("{x", "{y", backup=["{z"]), FileCache(tmp_path)).generate("an apple orchard")
    assert "could not be used" in str(e.value)

    class Down:
        model = "d"

        def complete(self, s, u):
            raise LLMError("429")

    with pytest.raises(AIUnavailable) as e:
        WorldService(Down(), FileCache(tmp_path)).generate("an orchard")
    assert "busy" in str(e.value)


def test_notes_put_inside_the_recipe_are_moved_not_rejected(tmp_path, valley_json):
    data = json.loads(valley_json)
    data["recipe"]["notes"] = ["The grid is approximate."]
    data["notes"] = ["ok"]
    llm = FakeLLM(json.dumps(data))
    out = WorldService(llm, FileCache(tmp_path)).generate("a valley")
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
