import json
from app.cache import FileCache
from app.llm import LLMError
from app.mock import prompt_seed
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
