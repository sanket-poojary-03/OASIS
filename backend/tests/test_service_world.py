import pytest
import json
from app.cache import FileCache
from app.llm import LLMError
from app.mock import prompt_seed
from app.prompts import PROMPT_VERSION
from app.schemas import FIXTURES_DIR
from app.service import WorldService
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


def test_falls_back_to_mock_after_two_failures(tmp_path):
    out = WorldService(FakeLLM("garbage", "still garbage"), FileCache(tmp_path)).generate("desert canyon")
    assert out["source"] == "mock" and "preset" in out["notes"][0]


def test_unsupported_passes_through(tmp_path):
    out = WorldService(FakeLLM(json.dumps({"type": "unsupported", "reason": "nope"})), FileCache(tmp_path)).generate("x y z")
    assert out == {"type": "unsupported", "reason": "nope", "source": "live"}


def test_llm_error_falls_back(tmp_path):
    class Broken:
        model = "b"

        def complete(self, s, u):
            raise LLMError("down")

    assert WorldService(Broken(), FileCache(tmp_path)).generate("island")["source"] == "mock"


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


def test_unexpected_type_error_falls_back(tmp_path, caplog):
    class Odd:
        model = "o"

        def complete(self, s, u):
            return ["not", "a", "string"]

    with caplog.at_level("WARNING"):
        out = WorldService(Odd(), FileCache(tmp_path)).generate("island")
    assert out["source"] == "mock" and "Falling back" in caplog.text
