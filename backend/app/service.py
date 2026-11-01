from __future__ import annotations

import logging
from typing import Protocol

from pydantic import ValidationError

from .cache import FileCache
from .llm import LLMError, extract_json
from .mock import mock_world, prompt_seed
from .prompts import PROMPT_VERSION, world_system_prompt
from .schemas import Recipe, dump


class Completer(Protocol):
    model: str

    def complete(self, system: str, user: str) -> str: ...


log = logging.getLogger(__name__)


def _notes(data: dict) -> list[str]:
    notes = data.get("notes")
    if not isinstance(notes, list):
        return []
    return [n[:200] for n in notes if isinstance(n, str)][:5]


class WorldService:
    def __init__(self, llm: Completer | None, cache: FileCache):
        self.llm = llm
        self.cache = cache

    def generate(self, prompt: str) -> dict:
        if self.llm is None:
            return mock_world(prompt)
        key = self.cache.key("world", PROMPT_VERSION, self.llm.model, prompt.strip().lower())
        try:
            hit = self.cache.get(key)
        except (OSError, ValueError):
            hit = None
        if hit:
            return {**hit, "source": "cache"}
        system, user = world_system_prompt(), prompt
        for _ in range(2):
            try:
                data = extract_json(self.llm.complete(system, user))
                if data.get("type") == "unsupported":
                    return {"type": "unsupported", "reason": str(data.get("reason", "Not supported"))[:300], "source": "live"}
                recipe = Recipe.model_validate(data.get("recipe", data)).model_copy(update={"seed": prompt_seed(prompt)})
                out = {"type": "recipe", "recipe": dump(recipe), "notes": _notes(data), "source": "live"}
                self.cache.put(key, out)
                return out
            except (ValidationError, ValueError, TypeError) as e:
                log.warning("LLM answer rejected: %s", str(e)[:300])
                user = f"{prompt}\n\nYour previous answer was invalid:\n{str(e)[:1500]}\nReturn corrected JSON only."
            except LLMError as e:
                log.warning("LLM request failed: %s", e)
                break
        log.warning("Falling back to mock world")
        out = mock_world(prompt)
        out["notes"] = ["The AI answer was unusable, so a preset world was used.", *out["notes"]]
        return out
