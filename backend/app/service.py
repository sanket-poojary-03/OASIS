from __future__ import annotations

import logging
from typing import Callable, Protocol

from pydantic import ValidationError

from .cache import FileCache
from .llm import LLMError, extract_json
from .mock import mock_edit, mock_world, prompt_seed
from .prompts import PROMPT_VERSION, edit_system_prompt, world_system_prompt
from .schemas import EditRequest, Recipe, dump, dump_ops, ops_adapter


class Completer(Protocol):
    model: str

    def complete(self, system: str, user: str) -> str: ...


log = logging.getLogger(__name__)


class AIUnavailable(Exception):
    """The AI could not give a usable answer (busy, down, or invalid twice). Never replaced by a fake keyword world."""

    MESSAGE = "The AI is busy right now. Please try again in a moment."


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
        def validate(data: dict) -> dict:
            recipe = Recipe.model_validate(data.get("recipe", data)).model_copy(update={"seed": prompt_seed(prompt)})
            return {"type": "recipe", "recipe": dump(recipe), "notes": _notes(data), "source": "live"}

        out = self._ask(world_system_prompt(), prompt, validate)
        if out is not None:
            if out["type"] == "recipe":
                self.cache.put(key, out)
            return out
        log.warning("AI unavailable for world prompt")
        raise AIUnavailable(AIUnavailable.MESSAGE)

    def edit(self, req: EditRequest) -> dict:
        if self.llm is None:
            return mock_edit(req)

        def validate(data: dict) -> dict:
            ops = ops_adapter.validate_python(data.get("ops"))
            return {"type": "ops", "ops": dump_ops(ops), "notes": _notes(data), "source": "live"}

        out = self._ask(edit_system_prompt(req), req.prompt, validate)
        if out is not None:
            return out
        log.warning("AI unavailable for edit")
        raise AIUnavailable(AIUnavailable.MESSAGE)

    def _ask(self, system: str, user: str, validate: Callable[[dict], dict]) -> dict | None:
        """Ask the LLM, validate, retry once with the error. None means the AI is unavailable."""
        prompt = user
        for _ in range(2):
            try:
                data = extract_json(self.llm.complete(system, user))
                if data.get("type") == "unsupported":
                    return {"type": "unsupported", "reason": str(data.get("reason", "Not supported"))[:300], "source": "live"}
                return validate(data)
            except (ValidationError, ValueError, TypeError) as e:
                log.warning("LLM answer rejected: %s", str(e)[:300])
                user = f"{prompt}\n\nYour previous answer was invalid:\n{str(e)[:1500]}\nReturn corrected JSON only."
            except LLMError as e:
                log.warning("LLM request failed: %s", e)
                break
        return None
