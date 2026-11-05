"""Smarter matching for the model finder (no placeholders: a place shows a real model or nothing).

- `shape_ok`: a downloaded model must be shaped like what was asked for (a flat manhole cover is never a building).
- `default_pick`, `scene_like`, `LLMPicker`: choosing among models by title, when no thumbnail can be judged.
- `cheap_llm`: the shared set-up for these small, fast LLM calls.
"""
from __future__ import annotations

import copy
import json
import logging
import math
import re
import struct
from pathlib import Path

from .asset_sources import Candidate, tokens
from .llm import extract_json

log = logging.getLogger(__name__)

# Buildings and landmarks at least this tall for their width; anything flatter is a floor, a decal or a cover.
MIN_UPRIGHT = 0.12
UPRIGHT_KINDS = {"landmark", "structure", "settlement"}


def _trs(t=(0, 0, 0), r=(0, 0, 0, 1), s=(1, 1, 1)) -> list[list[float]]:
    x, y, z, w = r
    m = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[m[i][0] * s[0], m[i][1] * s[1], m[i][2] * s[2], t[i]] for i in range(3)] + [[0, 0, 0, 1]]


def _mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def glb_size(data: bytes) -> tuple[float, float, float] | None:
    """Width, height, depth (glTF is y-up) of a .glb's meshes with node transforms applied; skins ignored. None if unreadable."""
    try:
        n = struct.unpack_from("<I", data, 12)[0]
        j = json.loads(data[20:20 + n])
        lo, hi = [math.inf] * 3, [-math.inf] * 3

        def visit(i: int, parent) -> None:
            nd = j["nodes"][i]
            if "matrix" in nd:  # column-major
                mm = nd["matrix"]
                local = [[mm[c * 4 + r] for c in range(4)] for r in range(4)]
            else:
                local = _trs(nd.get("translation", (0, 0, 0)), nd.get("rotation", (0, 0, 0, 1)), nd.get("scale", (1, 1, 1)))
            m = _mul(parent, local)
            if "mesh" in nd:
                for p in j["meshes"][nd["mesh"]]["primitives"]:
                    a = j["accessors"][p["attributes"]["POSITION"]]
                    for cx in (a["min"][0], a["max"][0]):
                        for cy in (a["min"][1], a["max"][1]):
                            for cz in (a["min"][2], a["max"][2]):
                                for k in range(3):
                                    v = m[k][0] * cx + m[k][1] * cy + m[k][2] * cz + m[k][3]
                                    lo[k], hi[k] = min(lo[k], v), max(hi[k], v)
            for c in nd.get("children", []):
                visit(c, m)

        for r in j["scenes"][j.get("scene", 0)]["nodes"]:
            visit(r, _trs())
    except (ValueError, KeyError, IndexError, TypeError, struct.error):
        return None
    if lo[0] == math.inf:
        return None
    return (hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])


def shape_ok(path: Path, kind: str) -> bool:
    """Buildings and landmarks must stand up: reject one far wider than it is tall. Props and unreadable files pass."""
    if kind not in UPRIGHT_KINDS:
        return True
    size = glb_size(path.read_bytes())
    if not size:
        return True
    w, h, d = size
    return h >= MIN_UPRIGHT * max(w, d, 1e-6)


def cheap_llm(llm, timeout: float = 8.0, max_tokens: int = 1500):
    """A copy of the client for one small, fast call: short timeout, one try, a capped (reasoning-sized) answer."""
    c = copy.copy(llm)
    if hasattr(c, "timeout"):
        c.timeout = min(float(c.timeout), timeout)
    if hasattr(c, "retries"):
        c.retries = 1  # one try per model: a busy AI must not hold up model loading
    if hasattr(c, "max_tokens"):
        c.max_tokens = max_tokens  # reasoning models (Sarvam) think first and count that against the cap
    if getattr(c, "reasoning_effort", ""):
        c.reasoning_effort = "low"  # the least Sarvam accepts ("none" is rejected with HTTP 400)
    return c


_TAIL = {"with", "on", "of", "in", "near", "by", "beside", "at", "from", "next"}
# Title words that say nothing about what the object is.
_GENERIC = {"building", "model", "low", "poly", "lowpoly", "game", "asset", "prop", "object", "stylized", "simple"}


def head_noun(text: str) -> str | None:
    """The noun the request is about: the last token before 'with/on/of/near...' ("campfire with stones" -> campfire)."""
    words: list[str] = []
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in _TAIL and words:
            break
        words.append(w)
    toks = tokens(" ".join(words))
    return toks[-1] if toks else None


def default_pick(query: str, cands: list[Candidate]) -> int:
    """By title, when nothing better can judge. The title must name the requested thing and nothing else: a "Light Cube"
    is a lamp, not a "red cube". Closest title first, then the shorter one; no fit means -1."""
    q = set(tokens(query))
    head = head_noun(query)
    best, best_key = -1, (0.0, 0)
    for i, c in enumerate(cands):
        t = set(tokens(c.title))
        if head not in t or t - q - _GENERIC:
            continue
        key = (len(q & t) / len(q | t), -len(c.title))
        if best < 0 or key > best_key:
            best, best_key = i, key
    return best


_SCENE_WORDS = {"interior", "interiors", "inside", "room", "rooms", "scene", "diorama", "environment"}


def scene_like(title: str, query: str) -> bool:
    """A whole room or scene rather than one object, unless the player asked for exactly that."""
    words = lambda t: set(re.findall(r"[a-z]+", t.lower()))  # noqa: E731
    return bool((words(title) & _SCENE_WORDS) - words(query))


class LLMPicker:
    """One cheap LLM call to choose among models by title: library models that only partly match the request
    ("statue of a knight" vs a stag statue), or online results when no vision check is set up."""

    uses_llm = True

    def __init__(self, llm, timeout: float = 8.0):
        # The answer is {"index": n}, but reasoning models (Sarvam) think ~200 tokens first and count that against the cap.
        self.llm = cheap_llm(llm, timeout, 1500)

    def __call__(self, query: str, cands: list[Candidate]) -> int:
        lines = "\n".join(f"{i}: {c.title} ({c.tris or '?'} triangles)" for i, c in enumerate(cands))
        try:
            raw = self.llm.complete('Pick the 3D model that best matches the request. It will stand in an open-world game, so choose ONE whole '
                                    'object seen from outside (for a building: its exterior, never an interior, a room or a scene). When two fit '
                                    'equally, prefer the lower triangle count. It must BE the requested thing, not merely related to it (a manhole cover '
                                    'is not a metro station, a stag statue is not a knight statue). Reply with JSON {"index": n}, '
                                    'or {"index": -1} if none fits.',
                                    f"Request: {query}\nCandidates:\n{lines}")
            idx = int(extract_json(raw).get("index", -1))
        except Exception as e:  # noqa: BLE001 - fall back to title matching
            log.warning("LLM picker failed (%s: %s); using title matching", type(e).__name__, e)
            return default_pick(query, cands)
        return idx if -1 <= idx < len(cands) else -1
