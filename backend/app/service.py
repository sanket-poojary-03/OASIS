from __future__ import annotations

import hashlib
import logging
import re
from typing import Callable, Protocol

from pydantic import ValidationError

from .llm import LLMError, LLMKeyRejected, extract_json
from .asset_match import cheap_llm
from .prompts import brief_system_prompt, edit_system_prompt, world_system_prompt, world_user_message
from .schemas import MAX_LIFE_HEIGHT, MAX_SCENERY, EditRequest, Recipe, dump, dump_ops, ops_adapter

# Time-of-day words in a request (complete_time) and words naming a drivable vehicle (repair_*: a vehicle the AI left as scenery can still be driven).
TIME_WORDS = [(r"\b(night|midnight)\b", "night"), (r"\b(dawn|sunrise|morning)\b", "dawn"), (r"\b(dusk|sunset|evening)\b", "dusk"), (r"\b(noon|midday|daytime|day)\b", "day")]
VEHICLE = re.compile(r"\b(?:car|jeep|truck|buggy|rover|kart|van|tractor|motorbike)s?\b")


def prompt_seed(prompt: str) -> int:
    """The world's seed: the same prompt builds its terrain from the same seed."""
    return int(hashlib.sha256(prompt.strip().lower().encode("utf-8")).hexdigest()[:8], 16) & 0x7FFFFFFF


class Completer(Protocol):
    model: str

    def complete(self, system: str, user: str) -> str: ...


log = logging.getLogger(__name__)


class AIUnavailable(Exception):
    """No LLM is configured, or it could not give a usable answer (busy, down, or invalid twice). There is no stand-in:
    the player is told, and no world is made up."""

    NO_LLM = "LLM not available."
    MESSAGE ="The AI is busy right now. Please try again in a moment."
    BAD_ANSWER = "The AI's answer could not be used. Please try again, perhaps in different words."
    KEY_REJECTED = "Your API key was rejected. Check it on the start screen, or remove it to use the free AI."


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
# Relations with a target, and the extra field each may carry (models write the target as "of"/"from" too).
_TARGET_RELATIONS = {"near": ("maxDist",), "far_from": ("minDist",), "visible_from": ()}
_KIND_WORDS = {"building": "structure", "house": "structure", "shop": "structure", "group": "settlement", "village": "settlement",
               "town": "settlement", "city": "settlement", "district": "settlement", "camp": "settlement", "monument": "landmark",
               "tower": "landmark", "object": "prop", "item": "prop", "decoration": "prop", "furniture": "prop"}
_ROAD_KINDS = {"path", "road", "street", "route", "trail"}
_SCENERY_KINDS = {"landmark", "structure", "prop"}
_SCENERY_SPOTS = {"anywhere", "water", "high"}
_INTERACTIONS = {"none", "door", "light", "fire", "sound", "sit", "push", "drive"}
_LIFE_KINDS = {"deer", "birds", "rabbits", "animal"}
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


def complete_time(prompt: str, ops: list) -> None:
    """The request names a time of day and the answer changes the atmosphere but forgot the time ("make it a clear
    day" came back as weather clear only, so the demo ended at night): the named time is added. Answers that do not
    touch the atmosphere ("add a day market") are left alone."""
    text = prompt.lower()
    named = next((t for pattern, t in TIME_WORDS if re.search(pattern, text)), None)
    atmos = [o for o in ops if getattr(o, "op", None) == "setAtmosphere"]
    if named and atmos and all(o.time is None for o in atmos):
        atmos[0].time = named


def _repair_palette(pal: dict) -> dict:
    """Repair the colours; unknown keys stay, so the schema still rejects them (and the model is told why)."""
    out = {}
    for k, v in pal.items():
        c = _colour(v) if k in _PALETTE_KEYS else v
        if c is not None:
            out[k] = c
    return out


def _drivable(place) -> None:
    """A car, jeep, truck, buggy or rover the model left without an interaction can be driven: the LLM proposes, code decides."""
    if isinstance(place, dict) and place.get("interaction", "none") == "none" and VEHICLE.search(str(place.get("asset", "")).lower()):
        place["interaction"] = "drive"


def repair_ops(raw):
    """Colour slips in setPalette ops (the same repair as a recipe palette), vehicles left undrivable, and flora slips."""
    if isinstance(raw, list):
        for i, op in enumerate(raw):
            if isinstance(op, dict) and op.get("op") == "setPalette":
                raw[i] = {"op": "setPalette", **_repair_palette({k: v for k, v in op.items() if k != "op"})}
            elif isinstance(op, dict) and op.get("op") == "addPlace":
                _drivable(op.get("place"))
                _repair_height(op.get("place"))
            elif isinstance(op, dict) and op.get("op") == "updatePlace":
                _repair_height(op)
            elif isinstance(op, dict) and op.get("op") == "addLife":
                _repair_at(op)
                _repair_height(op, MAX_LIFE_HEIGHT)
            elif isinstance(op, dict) and op.get("op") == "setFlora":
                raw[i] = {"op": "setFlora", "flora": _repair_flora(op.get("flora"))}
    return raw


def repair_recipe(raw):
    """Fix harmless slips before validation instead of rejecting a good world (the schema still decides everything
    else): extra fields on argument-less relations, relations and paths naming places that do not exist ("near the
    river" when the river is terrain, not a place), size words outside small/medium/large, and palette colour words."""
    if not isinstance(raw, dict) or not isinstance(raw.get("places"), list):
        return raw
    # Roads are built automatically between all places; a "road" place would only be a stray shape.
    raw["places"] = [p for p in raw["places"] if not (isinstance(p, dict) and str(p.get("kind", "")).lower() in _ROAD_KINDS)]
    for place in raw["places"]:
        if isinstance(place, dict) and isinstance(place.get("kind"), str):
            place["kind"] = _KIND_WORDS.get(place["kind"].lower(), place["kind"])
    ids = {p.get("id") for p in raw["places"] if isinstance(p, dict)}
    if "palette" in raw:
        if isinstance(raw["palette"], dict):
            raw["palette"] = _repair_palette(raw["palette"])
        else:
            raw.pop("palette")
    for place in raw["places"]:
        if not isinstance(place, dict):
            continue
        _drivable(place)
        _repair_height(place)
        _repair_variants(place.get("layout"))
        if "size" in place:
            place["size"] = _SIZE_WORDS.get(str(place["size"]).lower(), "medium")
        if isinstance(place.get("where"), list):
            place["where"] = [r for r in (_repair_relation(r, ids) for r in place["where"]) if r is not None]
    if isinstance(raw.get("paths"), list):
        raw["paths"] = [p for p in raw["paths"] if not isinstance(p, dict) or (p.get("from") in ids and p.get("to") in ids)]
    if isinstance(raw.get("life"), list):
        raw["life"] = _repair_life(raw["life"])
    if "scenery" in raw:
        raw["scenery"] = _repair_scenery(raw["scenery"])
        if not raw["scenery"]:
            raw.pop("scenery")
    if "flora" in raw:
        raw["flora"] = _repair_flora(raw["flora"])
        if not raw["flora"]:
            raw.pop("flora")
    return raw


_FLORA_LAYERS = {
    **dict.fromkeys(("canopy", "tree", "trees", "forest", "woods"), "canopy"),
    **dict.fromkeys(("shrub", "shrubs", "bush", "bushes", "undergrowth"), "shrub"),
    **dict.fromkeys(("ground", "ground cover", "groundcover", "cover", "flower", "flowers", "grass", "plant", "plants", "fern", "ferns"), "ground"),
    **dict.fromkeys(("rock", "rocks", "stone", "stones", "boulder", "boulders", "crystal", "crystals"), "rock"),
}
_FLORA_SPOTS = {"anywhere", "wet", "dry", "high", "low", "shore"}


def _repair_flora(raw) -> list[dict]:
    """The usable plants of a flora list: layer words mapped ("trees" -> canopy), amounts clamped, an unknown spot made
    "anywhere", other keys dropped; a plant with no name or no known layer is left out. At most 8, as the schema says."""
    out: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("asset"), str) or len(item["asset"].strip()) < 2:
            continue
        layer = _FLORA_LAYERS.get(str(item.get("layer", "")).lower().replace("_", " ").replace("-", " ").strip())
        if not layer:
            continue
        plant = {"asset": item["asset"].strip()[:80], "layer": layer}
        if isinstance(item.get("density"), (int, float)):
            plant["density"] = min(2, max(0, item["density"]))
        if "spot" in item:
            plant["spot"] = item["spot"] if item["spot"] in _FLORA_SPOTS else "anywhere"
        if isinstance(item.get("height"), (int, float)):
            plant["height"] = min(30, max(0.1, item["height"]))
        out.append(plant)
    return out[:8]


def _repair_height(item, most: float = 1000) -> None:
    """A height clamped into the schema's limits (the browser keeps it in range per kind), so a wild one costs the edit
    nothing; one that is not a number, or on a settlement (its layout decides), is dropped."""
    if not isinstance(item, dict) or "height" not in item:
        return
    h = item["height"]
    if isinstance(h, bool) or not isinstance(h, (int, float)) or h != h or item.get("kind") == "settlement":
        item.pop("height")
    else:
        item["height"] = min(most, max(0.1, h))


def _repair_at(item: dict) -> None:
    """An animal's `at` is just x and z; models write it like a place's relation ({"rel":"at",...}), and that cost a retry."""
    if isinstance(item.get("at"), dict):
        item["at"] = {k: v for k, v in item["at"].items() if k in ("x", "z")}


def _repair_life(raw: list) -> list[dict]:
    """An animal written as its own kind ("lizard") is kept as that animal; what names no animal is dropped."""
    out: list[dict] = []
    for item in raw:
        kind = item.get("kind") if isinstance(item, dict) else None
        if not isinstance(kind, str) or len(kind.strip()) < 2:
            continue
        _repair_at(item)
        _repair_height(item, MAX_LIFE_HEIGHT)
        out.append(item if kind in _LIFE_KINDS else {**item, "kind": "animal", "asset": str(item.get("asset") or kind).strip()[:80]})
    return out


def _repair_scenery(raw) -> list[dict]:
    """The usable entries of the scenery list: it is an extra, so a bad entry must not cost the world its places."""
    out: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        asset = item if isinstance(item, str) else item.get("asset") if isinstance(item, dict) else None
        if not isinstance(asset, str) or len(asset.strip()) < 2:
            continue
        src = item if isinstance(item, dict) else {}
        kind = _KIND_WORDS.get(str(src.get("kind", "prop")).lower(), str(src.get("kind", "prop")).lower())
        interaction = str(src.get("interaction", "none")).lower()
        spot = str(src.get("spot", "anywhere")).lower()
        out.append({
            "asset": asset.strip()[:80],
            "kind": kind if kind in _SCENERY_KINDS else "structure" if kind == "settlement" else "prop",
            "size": _SIZE_WORDS.get(str(src.get("size", "medium")).lower(), "medium"),
            "interaction": interaction if interaction in _INTERACTIONS else "none",
            "spot": spot if spot in _SCENERY_SPOTS else "anywhere",
        })
    return out[:MAX_SCENERY]


def _repair_variants(layout) -> None:
    """layout.variants as short, distinct strings (4 at most): a bad list must not cost the world its downtown."""
    if not isinstance(layout, dict) or "variants" not in layout:
        return
    raw = layout["variants"]
    items = raw if isinstance(raw, list) else [raw] if isinstance(raw, str) else []
    out: list[str] = []
    for v in items:
        v = (v.get("asset", "") if isinstance(v, dict) else str(v)).strip()[:80] if isinstance(v, (str, dict)) else ""
        if len(v) >= 2 and v.lower() not in (o.lower() for o in out):
            out.append(v)
    if out:
        layout["variants"] = out[:4]
    else:
        layout.pop("variants")


def _repair_relation(rel, ids: set):
    """Only "rel" on highest/lowest/flat/by_water; a relation to an unknown place is dropped, a direction keeps its
    compass point without the unknown "of". Anything else goes to the schema unchanged."""
    if not isinstance(rel, dict):
        return rel
    kind = rel.get("rel")
    if kind in _BARE_RELATIONS:
        return {"rel": kind}
    if kind in _TARGET_RELATIONS:
        target = next((rel[k] for k in ("target", "of", "from", "to", "place") if rel.get(k) in ids), None)
        if target is None:
            return None
        return {"rel": kind, "target": target, **{k: rel[k] for k in _TARGET_RELATIONS[kind] if k in rel}}
    if kind == "direction":
        compass = next((d for d in ("north", "south", "east", "west") if str(rel.get("dir", "")).lower().startswith(d)), None)
        if compass is None:
            return None  # "inland", "upstream": no compass point to keep
        return {"rel": "direction", "dir": compass, **({"of": rel["of"]} if rel.get("of") in ids else {})}
    return rel


def keep_valid_places(raw: dict) -> tuple[Recipe, list[str]]:
    """Validate; if only some places are invalid, leave those out (and what refers to them) instead of losing the whole
    world. Raises ValidationError when the rest of the recipe is invalid or fewer than 3 places would remain."""
    try:
        return Recipe.model_validate(raw), []
    except ValidationError as e:
        bad = sorted({err["loc"][1] for err in e.errors() if len(err["loc"]) > 1 and err["loc"][0] == "places" and isinstance(err["loc"][1], int)})
        if not bad or len(raw.get("places", [])) - len(bad) < 3:
            raise
    dropped = [raw["places"][i] for i in bad]
    names = [str(p.get("label") or p.get("id") or "a place") if isinstance(p, dict) else "a place" for p in dropped]
    raw = {**raw, "places": [p for i, p in enumerate(raw["places"]) if i not in bad]}
    return Recipe.model_validate(repair_recipe(raw)), names


def _notes(data: dict) -> list[str]:
    notes = data.get("notes")
    if not isinstance(notes, list):
        return []
    return [n[:200] for n in notes if isinstance(n, str)][:5]


class WorldService:
    def __init__(self, llm: Completer | None, world_llm: Completer | None = None):
        """No answer is cached (the user's choice): every prompt gets a fresh brief and a fresh world from the AI.
        Only 3D models are cached (assets.ModelCache and the model picker's answers)."""
        self.llm = llm
        self.world_llm = world_llm or llm  # whole worlds may use a stronger, slower model than briefs and edits

    def brief(self, prompt: str) -> dict:
        """The prompt enhancer: a short request grown into a detailed world brief (12-18 named places, details around
        them, roads), shown to the player while the world is built from it. Never an error: a failed brief is empty and
        the world is then built from the player's own words."""
        if self.llm is None:
            return {"brief": "", "source": "none"}
        try:
            data = extract_json(cheap_llm(self.llm, timeout=30, max_tokens=2500).complete(brief_system_prompt(), prompt))
            text = str(data.get("brief", "")).strip()[:3000]
        except Exception as e:  # noqa: BLE001 - a missing brief only means a plainer world
            log.warning("world brief failed for %r: %s: %s", prompt[:60], type(e).__name__, e)
            return {"brief": "", "source": "none"}
        if len(text) < 40:
            return {"brief": "", "source": "none"}
        out = {"brief": text, "title": str(data.get("title", "")).strip()[:80]}
        if not out["title"]:
            del out["title"]
        return {**out, "source": "live"}

    def generate(self, prompt: str, brief: str | None = None) -> dict:
        if self.llm is None:
            raise AIUnavailable(AIUnavailable.NO_LLM)

        def validate(data: dict) -> dict:
            raw = data.get("recipe", data)
            if not isinstance(raw, dict):
                raise ValueError("the recipe is not an object")
            # Models often put their notes among the recipe's own keys, inside it or writing the recipe flat. They are moved
            # out, not rejected: rejecting them cost a second full LLM call on nearly every world.
            notes = _notes(data)
            flat = raw is data
            inner = raw.pop("notes", None)
            if flat:
                raw.pop("type", None)
                inner = None
            recipe, dropped = keep_valid_places(repair_recipe(raw))
            recipe = recipe.model_copy(update={"seed": prompt_seed(prompt)})
            notes = notes + _notes({"notes": inner})
            if dropped:
                notes.insert(0, f"Left out {len(dropped)} place{'s' if len(dropped) > 1 else ''} the AI described unclearly: {', '.join(dropped)[:150]}.")
            return {"type": "recipe", "recipe": dump(recipe), "notes": notes[:5], "source": "live"}

        return self._ask(world_system_prompt(), world_user_message(prompt, brief), validate, challenge=True, llm=self.world_llm)

    def edit(self, req: EditRequest) -> dict:
        if self.llm is None:
            raise AIUnavailable(AIUnavailable.NO_LLM)

        def validate(data: dict) -> dict:
            ops = ops_adapter.validate_python(repair_ops(data.get("ops")))
            check_targets(req.recipe, ops)
            complete_time(req.prompt, ops)
            return {"type": "ops", "ops": dump_ops(ops), "notes": _notes(data), "source": "live"}

        return self._ask(edit_system_prompt(req), req.prompt, validate)

    def _ask(self, system: str, user: str, validate: Callable[[dict], dict], challenge: bool = False, llm: Completer | None = None) -> dict:
        """Ask the LLM, validate, retry once with the error; after two unusable answers, one last try on the backup
        model when the client has one. Raises AIUnavailable (busy, or unusable answers), never returns a fake world.

        `challenge`: a refusal is questioned once (models refuse ordinary requests like "a modern city"); a second
        refusal stands.
        """
        llm = llm or self.llm
        prompt = user
        backup = bool(getattr(llm, "fallback_models", None))
        tries, failure = 0, AIUnavailable.MESSAGE
        while tries < (3 if backup else 2):  # a challenged refusal does not use up a try
            tries += 1
            try:
                raw = llm.complete(system, user, prefer_backup=True) if tries == 3 else llm.complete(system, user)
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
            except LLMKeyRejected as e:
                raise AIUnavailable(AIUnavailable.KEY_REJECTED) from e
            except LLMError as e:
                log.warning("LLM request failed: %s", e)
                failure = AIUnavailable.MESSAGE
                break
        log.warning("AI unavailable: %s", failure)
        raise AIUnavailable(failure)
