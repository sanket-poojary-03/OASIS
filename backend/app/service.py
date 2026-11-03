from __future__ import annotations

import logging
import re
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


def _target(rel) -> str | None:
    return getattr(rel, "target", None) or getattr(rel, "of", None)


def check_targets(recipe: Recipe, ops: list) -> None:
    """Every relation in the ops must name a place that exists at that point (the recipe's, or one added earlier in the
    same list). The browser would reject the edit otherwise; raising here sends the error back to the AI to correct."""
    ids = {p.id for p in recipe.places}
    for op in ops:
        kind = getattr(op, "op", "")
        if kind == "removePlace":
            ids.discard(op.id)
            continue
        where = op.place.where if kind == "addPlace" else getattr(op, "where", None) or []
        if kind == "addPlace":
            ids.add(op.place.id)
        for rel in where:
            t = _target(rel)
            if t is not None and t not in ids:
                raise ValueError(f'relation refers to unknown place "{t}"; use one of: {", ".join(sorted(ids))} (or "at" with lookAt for "here")')


_SIZE_WORDS = {"small": "small", "tiny": "small", "little": "small", "medium": "medium", "large": "large", "big": "large", "huge": "large",
               "giant": "large", "massive": "large"}
# Relations that take no arguments: models often add an "of" anyway.
_BARE_RELATIONS = {"highest", "lowest", "flat", "by_water"}


# Colour words models write instead of #rrggbb in a palette (muted, so a "red planet" is rust, not neon).
_COLOUR_WORDS = {"red": "#b03a2e", "crimson": "#8e1b1b", "rust": "#a8442a", "orange": "#d35400", "yellow": "#d4ac0d",
                 "gold": "#c9a227", "golden": "#c9a227", "green": "#3f7d3a", "teal": "#1f7a7a", "turquoise": "#40c0b0",
                 "cyan": "#3cb8c8", "blue": "#2e6da4", "navy": "#1b2f5c", "purple": "#6c3483", "violet": "#7d4cb0",
                 "magenta": "#a0306e", "pink": "#d98aa8", "brown": "#6e4b2a", "black": "#1c1c1f", "white": "#eef0f2",
                 "grey": "#7f8285", "gray": "#7f8285", "silver": "#b8bcc0"}
_HEX6 = re.compile(r"^#[0-9a-fA-F]{6}$")
_HEX3 = re.compile(r"^#[0-9a-fA-F]{3}$")
_PALETTE_KEYS = ("ground", "water", "sky")


def _colour(value) -> str | None:
    """#rrggbb as given, #rgb widened, a colour word looked up; anything else is dropped (the world keeps its colour)."""
    v = str(value).strip()
    if _HEX6.match(v):
        return v
    if _HEX3.match(v):
        return "#" + "".join(c * 2 for c in v[1:]).lower()
    return _COLOUR_WORDS.get(v.lower())


def _repair_palette(pal: dict) -> dict:
    """Repair the colours; unknown keys stay, so the schema still rejects them (and the model is told why)."""
    out = {}
    for k, v in pal.items():
        c = _colour(v) if k in _PALETTE_KEYS else v
        if c is not None:
            out[k] = c
    return out


def repair_ops(raw):
    """Colour slips in setPalette ops (the same repair as a recipe palette); everything else is left to the schema."""
    if isinstance(raw, list):
        for i, op in enumerate(raw):
            if isinstance(op, dict) and op.get("op") == "setPalette":
                raw[i] = {"op": "setPalette", **_repair_palette({k: v for k, v in op.items() if k != "op"})}
    return raw


def repair_recipe(raw):
    """Fix harmless slips before validation instead of rejecting a good world (the schema still decides everything
    else): a stray "of" on argument-less relations, size words outside small/medium/large, and palette colour words."""
    if not isinstance(raw, dict) or not isinstance(raw.get("places"), list):
        return raw
    if "palette" in raw:
        if isinstance(raw["palette"], dict):
            raw["palette"] = _repair_palette(raw["palette"])
        else:
            raw.pop("palette")
    for place in raw["places"]:
        if not isinstance(place, dict):
            continue
        if "size" in place:
            place["size"] = _SIZE_WORDS.get(str(place["size"]).lower(), "medium")
        for rel in place.get("where") or []:
            if isinstance(rel, dict) and rel.get("rel") in _BARE_RELATIONS:
                rel.pop("of", None)
    return raw


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
            raw = data.get("recipe", data)
            # Models often put their notes inside the recipe; move them out instead of rejecting a good world.
            inner = raw.pop("notes", None) if isinstance(raw, dict) and raw is not data else None
            recipe = Recipe.model_validate(repair_recipe(raw)).model_copy(update={"seed": prompt_seed(prompt)})
            notes = _notes(data) + _notes({"notes": inner})
            return {"type": "recipe", "recipe": dump(recipe), "notes": notes[:5], "source": "live"}

        out = self._ask(world_system_prompt(), prompt, validate, challenge=True)
        if out["type"] == "recipe":
            self.cache.put(key, out)
        return out

    def edit(self, req: EditRequest) -> dict:
        if self.llm is None:
            return mock_edit(req)

        def validate(data: dict) -> dict:
            ops = ops_adapter.validate_python(repair_ops(data.get("ops")))
            check_targets(req.recipe, ops)
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
