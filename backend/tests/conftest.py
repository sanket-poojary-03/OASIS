import json
import pytest
from app.schemas import FIXTURES_DIR


class FakeLLM:
    """Returns queued replies in order; records calls."""

    def __init__(self, *replies: str):
        self.replies = list(replies)
        self.calls: list[tuple[str, str]] = []
        self.model = "fake-model"

    def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        return self.replies.pop(0)


@pytest.fixture
def valley_json() -> str:
    data = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    return json.dumps({"type": "recipe", "recipe": data, "notes": ["ok"]})
