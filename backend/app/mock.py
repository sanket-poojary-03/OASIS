from __future__ import annotations

import hashlib
import json
import re

from .schemas import CORE_HALF, FIXTURES_DIR, EditRequest, Recipe, dump, dump_ops, ops_adapter

KEYWORDS: dict[str, list[str]] = {
    "fishing-valley": ["valley", "river", "village", "fishing", "pine", "forest", "mist", "misty", "stream", "meadow", "green", "tower"],
    "desert-canyon": ["desert", "canyon", "sand", "sandy", "oasis", "dune", "dunes", "arch", "mesa", "dry", "hot", "cactus", "obelisk"],
    "snowy-mountains": ["snow", "snowy", "mountain", "mountains", "castle", "winter", "ice", "icy", "frozen", "alpine", "lake", "peak", "peaks"],
    "tropical-island": ["island", "beach", "tropical", "lighthouse", "sea", "ocean", "palm", "coast", "bay", "harbor", "harbour"],
}


def prompt_seed(prompt: str) -> int:
    return int(hashlib.sha256(prompt.strip().lower().encode("utf-8")).hexdigest()[:8], 16) & 0x7FFFFFFF


def pick_fixture(prompt: str) -> str:
    words = set(re.findall(r"[a-z]+", prompt.lower()))
    best, best_score = "fishing-valley", 0
    for name, keys in KEYWORDS.items():
        score = len(words & set(keys))
        if score > best_score:
            best, best_score = name, score
    return best


def load_fixture(name: str) -> Recipe:
    return Recipe.model_validate(json.loads((FIXTURES_DIR / "recipes" / f"{name}.json").read_text(encoding="utf-8")))


def mock_world(prompt: str) -> dict:
    recipe = load_fixture(pick_fixture(prompt)).model_copy(update={"seed": prompt_seed(prompt)})
    return {"type": "recipe", "recipe": dump(recipe), "notes": ["Mock mode: used the preset world closest to your description."], "source": "mock"}


# ---- edit parser (the TS mirror in web/src/api/localMock.ts copies these constants exactly) ----
TIME_WORDS = [(r"\b(night|midnight)\b", "night"), (r"\b(dawn|sunrise|morning)\b", "dawn"), (r"\b(dusk|sunset|evening)\b", "dusk"), (r"\b(noon|midday|daytime|day)\b", "day")]
WEATHER_WORDS = [(r"\b(storm|stormy|thunder\w*)\b", "storm"), (r"\b(rain|rainy|raining)\b", "rain"), (r"\b(snow|snowy|snowing)\b", "snow"), (r"\b(mist|misty|fog|foggy)\b", "mist"), (r"\b(clear|sunny)\b", "clear")]
ATMOS_NOUNS = {"rain", "snow", "fog", "mist", "storm", "night", "day", "sunset", "sunrise", "dawn", "dusk"}
NEAR_THIS = re.compile(r"\s+(?:near|next to|beside|by)\s+(?:this|that|it)\b")
ON_THIS = re.compile(r"\s+on\s+(?:(?:this|that|it)(?:\s+[a-z]+)?|top of\s+(?:this|that|it|the)(?:\s+[a-z]+)?)(?=\s*[.!]?$)")
ADD = re.compile(r"\b(?:add|put|place|build|spawn|create|bring)\s+(?:(?:an|a|the|some)\s+)?(?P<noun>[a-z][a-z \-]{1,60}?)(?:\s+(?:here|there|in front of me|where i'?m looking|where i am looking|over there))?\s*[.!]?$")
REMOVE = re.compile(r"\b(?:remove|delete|destroy)\b|\bget rid of\b")
LANDMARK = re.compile(r"tower|castle|lighthouse|statue|temple|obelisk|windmill|arch|monument")
STRUCTURE = re.compile(r"house|cabin|hut|shrine|tent|lodge|well|dock|cottage|barn|inn|stall")
INTERACTIONS = [(r"lamp|lantern|light|torch|candle", "light"), (r"campfire|bonfire|fire", "fire"), (r"bell|gong", "sound"), (r"bench|chair|seat|stool", "sit"), (r"barrel|crate|box", "push"), (r"house|cabin|hut|cottage|lodge|barn|inn", "door")]


def _slug(noun: str, existing: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", noun.lower()).strip("-")[:24] or "thing"
    if not base[0].isalpha():
        base = f"p-{base}"
    if len(base) < 2:
        base = f"{base}x"
    out, i = base, 2
    while out in existing:
        out = f"{base}-{i}"
        i += 1
    return out


def _clamp(v: float) -> float:
    return max(-CORE_HALF, min(CORE_HALF, round(v, 1)))


def _ops(ops: list[dict]) -> dict:
    return {"type": "ops", "ops": dump_ops(ops_adapter.validate_python(ops)), "notes": [], "source": "mock"}


def mock_edit(req: EditRequest) -> dict:
    text = req.prompt.lower().strip()
    ctx = req.context
    existing = {p.id for p in req.recipe.places}
    if REMOVE.search(text):
        target = ctx.lookingAt or next((p.id for p in req.recipe.places if p.label.lower() in text or p.id in text), None)
        if target:
            return _ops([{"op": "removePlace", "id": target}])
        return {"type": "unsupported", "reason": "Look at the thing you want to remove, then try again.", "source": "mock"}
    near_this = bool(NEAR_THIS.search(text))
    on_this = bool(ON_THIS.search(text))
    m = ADD.search(ON_THIS.sub("", NEAR_THIS.sub("", text)).strip())
    if m and m.group("noun").strip() not in ATMOS_NOUNS:
        noun = m.group("noun").strip()
        kind = "landmark" if LANDMARK.search(noun) else "structure" if STRUCTURE.search(noun) else "prop"
        interaction = next((i for pat, i in INTERACTIONS if re.search(pat, noun)), "none")
        if near_this and ctx.lookingAt:
            where = [{"rel": "near", "target": ctx.lookingAt, "maxDist": 30}, {"rel": "flat"}]
        elif ctx.lookAt:
            at = {"rel": "at", "x": _clamp(ctx.lookAt.x), "z": _clamp(ctx.lookAt.z)}
            if on_this and kind == "prop" and ctx.lookAt.y is not None:
                at["y"] = round(ctx.lookAt.y, 2)
            where = [at]
        elif ctx.lookingAt:
            where = [{"rel": "near", "target": ctx.lookingAt, "maxDist": 30}, {"rel": "flat"}]
        else:
            where = [{"rel": "flat"}]
        place = {"id": _slug(noun, existing), "kind": kind, "label": noun.title()[:60], "asset": noun[:120], "size": "small" if kind == "prop" else "medium", "interaction": interaction, "where": where}
        return _ops([{"op": "addPlace", "place": place}])
    ops: list[dict] = []
    if re.search(r"\bwinter\b", text):
        ops += [{"op": "setClimate", "temperature": 0.1}, {"op": "setAtmosphere", "weather": "snow"}]
    elif re.search(r"\bsummer\b", text):
        ops += [{"op": "setClimate", "temperature": 0.7}, {"op": "setAtmosphere", "weather": "clear"}]
    for pat, value in TIME_WORDS:
        if re.search(pat, text):
            ops.append({"op": "setAtmosphere", "time": value})
            break
    if not any(o.get("weather") for o in ops):
        for pat, value in WEATHER_WORDS:
            if re.search(pat, text):
                ops.append({"op": "setAtmosphere", "weather": value})
                break
    if ops:
        return _ops(ops)
    return {"type": "unsupported", "reason": "Mock mode understands time, weather, seasons, 'add X here' and 'remove that'.", "source": "mock"}
