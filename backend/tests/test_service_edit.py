import json
import pytest
from app.cache import FileCache
from app.schemas import FIXTURES_DIR, EditRequest
from app.service import AIUnavailable, WorldService
from tests.conftest import FakeLLM

RECIPE = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
REQ = EditRequest.model_validate({"recipe": RECIPE, "prompt": "make it night", "context": {"player": {"x": 0, "z": 0}}})


def test_live_edit(tmp_path):
    llm = FakeLLM(json.dumps({"type": "ops", "ops": [{"op": "setAtmosphere", "time": "night"}], "notes": []}))
    out = WorldService(llm, FileCache(tmp_path)).edit(REQ)
    assert out == {"type": "ops", "ops": [{"op": "setAtmosphere", "time": "night"}], "notes": [], "source": "live"}
    assert "lookAt" in llm.calls[0][0]


def test_invalid_twice_raises_instead_of_mock(tmp_path):
    with pytest.raises(AIUnavailable):
        WorldService(FakeLLM('{"type":"ops","ops":[{"op":"explode"}]}', "nope"), FileCache(tmp_path)).edit(REQ)


def test_unsupported_passes_through(tmp_path):
    out = WorldService(FakeLLM('{"type":"unsupported","reason":"no"}'), FileCache(tmp_path)).edit(REQ)
    assert out == {"type": "unsupported", "reason": "no", "source": "live"}
