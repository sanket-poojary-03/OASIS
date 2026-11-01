from __future__ import annotations

import hashlib
import json
import re

from .schemas import FIXTURES_DIR, Recipe, dump

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
