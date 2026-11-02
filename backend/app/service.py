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
    BAD_ANSWER = "The AI's answer could not be used. Please try again, perhaps in different words."


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

        out = self._ask(world_system_prompt(), prompt, validate, challenge=True)
        if out["type"] == "recipe":
            self.cache.put(key, out)
        return out

    def edit(self, req: EditRequest) -> dict:
        if self.llm is None:
            return mock_edit(req)

        def validate(data: dict) -> dict:
            ops = ops_adapter.validate_python(data.get("ops"))
            return {"type": "ops", "ops": dump_ops(ops), "notes": _notes(data), "source": "live"}

        return self._ask(edit_system_prompt(req), req.prompt, validate)

    def _ask(self, system: str, user: str, validate: Callable[[dict], dict], challenge: bool = False) -> dict:
        """Ask the LLM, validate, retry once with the error; after two unusable answers, one last try on the backup
        model when the client has one. Raises AIUnavailable (busy, or unusable answers), never returns a fake world.

        `challenge`: a refusal is questioned once (models refuse ordinary requests like "a modern city"); a second
        refusal stands.
        """
        prompt = user
        backup = bool(getattr(self.llm, "fallback_models", None))
        tries, failure = 0, AIUnavailable.MESSAGE
        while tries < (3 if backup else 2):  # a challenged refusal does not use up a try
            tries += 1
            try:
                raw = self.llm.complete(system, user, prefer_backup=True) if tries == 3 else self.llm.complete(system, user)
                data = extract_json(raw)
                if data.get("type") == "unsupported":
                    reason = str(data.get("reason", "Not supported"))[:300]
                    if challenge:
                        challenge = False
                        tries -= 1
                        log.warning("World refused (%s); asking once more", reason[:120])
                        user = (f"{prompt}\n\nYou answered unsupported ({reason[:200]}). Unsupported is only for harmful requests. "
                                "Make the closest world you can with the available kinds and explain the compromise in notes.")
                        continue
                    return {"type": "unsupported", "reason": reason, "source": "live"}
                return validate(data)
            except (ValidationError, ValueError, TypeError) as e:
                log.warning("LLM answer rejected: %s", str(e)[:300])
                failure = AIUnavailable.BAD_ANSWER
                user = f"{prompt}\n\nYour previous answer was invalid:\n{str(e)[:1500]}\nReturn corrected JSON only."
            except LLMError as e:
                log.warning("LLM request failed: %s", e)
                failure = AIUnavailable.MESSAGE
                break
        log.warning("AI unavailable: %s", failure)
        raise AIUnavailable(failure)
