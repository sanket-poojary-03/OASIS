"""Model finder: library -> cache -> online (Poly Pizza, Sketchfab) -> Meshy (landmarks only) -> placeholder."""
from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Callable
from urllib.parse import quote

from .asset_sources import (  # noqa: F401 - re-exported for callers and tests
    Candidate, Finder, MeshyClient, PolyPizzaFinder, SketchfabFinder, license_ok, tokens,
)
from .llm import extract_json
from .schemas import AssetRequest

log = logging.getLogger(__name__)

_TAIL = {"with", "on", "of", "in", "near", "by", "beside", "at", "from", "next"}


def head_noun(text: str) -> str | None:
    """The noun the request is about: the last token before 'with/on/of/near...' ("campfire with stones" -> campfire)."""
    words: list[str] = []
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in _TAIL and words:
            break
        words.append(w)
    toks = tokens(" ".join(words))
    return toks[-1] if toks else None


def _atomic_write_json(path: Path, data) -> None:
    tmp = path.with_name(f"{path.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def _read_json(path: Path, default):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, type(default)) else default
    except FileNotFoundError:
        return default
    except (OSError, ValueError) as e:
        log.warning("ignoring unreadable %s: %s", path.name, e)
        return default


class AssetLibrary:
    def __init__(self, root: Path):
        self.root = root
        self.entries: list[dict] = _read_json(root / "manifest.json", [])
        self._tags = [set(tokens(" ".join(e.get("tags", [])))) for e in self.entries]

    def search(self, query: str, variant: int = 0) -> tuple[dict | None, float]:
        """Best entry by (coverage of the query, Jaccard); the query's head noun must be among its tags.

        TAGGING CONTRACT: a kind-specific model also carries its category noun, e.g. pine -> ["pine", "tree"],
        dead -> ["dead", "tree"], plain tree -> ["tree"]. Then "tree" -> the plain tree (highest Jaccard),
        "pine"/"pine tree" -> the pine. Equally good entries rotate with `variant`. Returns (entry, coverage).
        """
        q = set(tokens(query))
        if not q:
            return None, 0.0
        head = head_noun(query)
        scored = []
        for e, tags in zip(self.entries, self._tags):
            if head and head not in tags:
                continue
            scored.append(((len(q & tags) / len(q), len(q & tags) / len(q | tags)), e))
        if not scored:
            return None, 0.0
        best = max(k for k, _ in scored)
        if best[0] < 0.5:
            return None, best[0]
        ties = [e for k, e in scored if k == best]
        return ties[variant % len(ties)], best[0]


class ModelCache:
    """Every model fetched online or generated, stored once and reused by its normalized description.

    The index and the paid-attempts counter live next to the served folder, never inside it.
    """

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.index_path = root.parent / f".{root.name}-index.json"
        self.attempts_path = root.parent / f".{root.name}-attempts.json"
        self.index: dict[str, dict] = _read_json(self.index_path, {})
        self.attempts: int = int(_read_json(self.attempts_path, {}).get("meshy", 0) or 0)
        self.lock = threading.Lock()

    @staticmethod
    def key(query: str) -> str:
        return hashlib.sha1(" ".join(sorted(set(tokens(query)))).encode("utf-8")).hexdigest()[:16]

    def get(self, query: str) -> dict | None:
        e = self.index.get(self.key(query))
        return e if e and (self.root / e["file"]).exists() else None

    def add(self, key: str, query: str, file: str, source: str, credit: str | None = None) -> None:
        with self.lock:
            self.index[key] = {"file": file, "query": query, "source": source, "credit": credit, "created": time.time()}
            _atomic_write_json(self.index_path, self.index)

    def count(self, source: str | None = None) -> int:
        return sum(1 for e in self.index.values() if source is None or e["source"] == source)

    def reserve_attempt(self, limit: int) -> bool:
        """Count one paid generation BEFORE it starts; False when the budget is spent. Persisted atomically."""
        with self.lock:
            if self.attempts >= limit:
                return False
            self.attempts += 1
            _atomic_write_json(self.attempts_path, {"meshy": self.attempts})
            return True


def default_pick(query: str, cands: list[Candidate]) -> int:
    """Closest title wins: Jaccard of tokens, then the shorter title. No overlap at all means -1."""
    q = set(tokens(query))
    best, best_key = -1, (0.0, 0)
    for i, c in enumerate(cands):
        t = set(tokens(c.title))
        if not (q & t):
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
    """One cheap LLM call to choose among search results by title (only for things not in the library)."""

    uses_llm = True

    def __init__(self, llm, timeout: float = 8.0):
        self.llm = copy.copy(llm)
        if hasattr(self.llm, "timeout"):
            self.llm.timeout = min(float(self.llm.timeout), timeout)
        if hasattr(self.llm, "retries"):
            self.llm.retries = 1  # one try per model: a busy AI must not hold up model loading
        if hasattr(self.llm, "max_tokens"):
            # The answer is {"index": n}, but reasoning models (Sarvam) think ~200 tokens first and count that against the cap.
            self.llm.max_tokens = 1500
        if getattr(self.llm, "reasoning_effort", ""):
            self.llm.reasoning_effort = "low"  # the least Sarvam accepts ("none" is rejected with HTTP 400)

    def __call__(self, query: str, cands: list[Candidate]) -> int:
        lines = "\n".join(f"{i}: {c.title} ({c.tris or '?'} triangles)" for i, c in enumerate(cands))
        try:
            raw = self.llm.complete('Pick the 3D model that best matches the request. It will stand in an open-world game, so choose ONE whole '
                                    'object seen from outside (for a building: its exterior, never an interior, a room or a scene). When two fit '
                                    'equally, prefer the lower triangle count. Reply with JSON {"index": n}, or {"index": -1} if none fits.',
                                    f"Request: {query}\nCandidates:\n{lines}")
            idx = int(extract_json(raw).get("index", -1))
        except Exception as e:  # noqa: BLE001 - fall back to title matching
            log.warning("LLM picker failed (%s: %s); using title matching", type(e).__name__, e)
            return default_pick(query, cands)
        return idx if -1 <= idx < len(cands) else -1


def _thread(fn: Callable, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


_NONE = {"status": "none"}


class AssetService:
    def __init__(self, library: AssetLibrary, cache: ModelCache, finders: list, meshy=None, max_generations: int = 5,
                 refine: bool = False, pick: Callable[[str, list[Candidate]], int] = default_pick, spawn: Callable = _thread):
        self.library, self.cache, self.finders, self.meshy = library, cache, finders, meshy
        self.max_generations, self.refine, self.pick, self.spawn = max_generations, refine, pick, spawn
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()
        self._inflight: dict[str, threading.Lock] = {}

    @staticmethod
    def _ready(e: dict) -> dict:
        out = {"status": "ready", "source": e["source"], "url": f"/files/generated/{quote(e['file'])}"}
        if e.get("credit"):
            out["credit"] = e["credit"]
        return out

    def resolve(self, req: AssetRequest, gate: Callable[[], bool] | None = None, pick_gate: Callable[[], bool] | None = None) -> dict:
        """Library and cache hits are free. `gate` is asked before each external path (online search, Meshy);
        `pick_gate` before an LLM pick. A refusal returns status none, so the browser keeps its placeholder."""
        if not tokens(req.query):
            return dict(_NONE)
        entry, _ = self.library.search(req.query, req.variant)
        if entry:
            return {"status": "ready", "source": "library", "url": f"/files/library/{quote(entry['file'])}"}
        hit = self.cache.get(req.query)
        if hit:
            return self._ready(hit)
        key = self.cache.key(req.query)
        if key in self.jobs:
            return self.job(key)
        if req.allowOnline and self.finders:
            with self._key_lock(key):  # concurrent identical lookups share one search and download
                hit = self.cache.get(req.query)
                if hit:
                    return self._ready(hit)
                if gate is not None and not gate():
                    return dict(_NONE)
                found = self._find_online(key, req.query, pick_gate)
                if found:
                    return found
        if not (req.allowGenerate and req.kind == "landmark" and self.meshy):
            return dict(_NONE)
        if gate is not None and not gate():
            return dict(_NONE)
        with self.lock:  # cap check, paid-attempt reservation and job insert are one step
            if key in self.jobs:
                return self.job(key)
            if not self.cache.reserve_attempt(self.max_generations):
                return dict(_NONE)
            self.jobs[key] = {"status": "pending"}
        self.spawn(self._generate, key, req.query)
        return {"status": "pending", "jobId": key}

    def _key_lock(self, key: str) -> threading.Lock:
        with self.lock:
            return self._inflight.setdefault(key, threading.Lock())

    def _fetch(self, key: str, download: Callable[[Path], None]) -> str:
        """Download to a temp file, check it is a glTF binary, then move it into place."""
        file = f"{key}.glb"
        tmp = self.cache.root / f"{key}.{uuid.uuid4().hex[:8]}.part"
        try:
            download(tmp)
            with tmp.open("rb") as f:
                if f.read(4) != b"glTF":
                    raise ValueError("download is not a glTF binary")
            os.replace(tmp, self.cache.root / file)
        finally:
            tmp.unlink(missing_ok=True)
        return file

    def _find_online(self, key: str, query: str, pick_gate: Callable[[], bool] | None = None) -> dict | None:
        for finder in self.finders:
            name = getattr(finder, "name", type(finder).__name__)
            try:
                cands = [c for c in finder.search(query)
                         if license_ok(c.license) and (c.tris is None or c.tris <= 30000) and not scene_like(c.title, query)][:5]
                pick = self.pick
                if getattr(pick, "uses_llm", False) and pick_gate is not None and not pick_gate():
                    pick = default_pick
                for _ in range(3):  # a pick that fails to download (too large, broken) gives way to the next best
                    if not cands:
                        break
                    i = pick(query, cands)
                    if i < 0:
                        break
                    try:
                        file = self._fetch(key, lambda dest, f=finder, c=cands[i]: f.download(c, dest))
                    except Exception as e:  # noqa: BLE001
                        log.warning("asset %r: %s download failed (%s), trying the next one", query, cands[i].title, e)
                        cands = cands[:i] + cands[i + 1:]
                        continue
                    self.cache.add(key, query, file, "online", cands[i].credit)
                    return self._ready(self.cache.index[key])
            except Exception as e:  # noqa: BLE001 - a failing source just means "try the next one"
                log.warning("asset finder %s failed for %r: %s: %s", name, query, type(e).__name__, e)
                continue
        return None

    def job(self, job_id: str) -> dict:
        j = self.jobs.get(job_id)
        if not j:
            return dict(_NONE)
        if j["status"] == "pending":
            return {"status": "pending", "jobId": job_id}
        return {k: v for k, v in j.items() if k in {"status", "source", "url", "credit"}}

    def _generate(self, key: str, query: str) -> None:
        try:
            task_id = self.meshy.create_preview(f"{query}, low-poly game asset, single object, centered, no ground plane")
            task = self.meshy.wait(task_id)
            if self.refine:
                task = self.meshy.wait(self.meshy.create_refine(task_id))
            url = task["model_urls"]["glb"]
            file = self._fetch(key, lambda dest: self.meshy.download(url, dest))
            self.cache.add(key, query, file, "generated", "Generated with Meshy")
            self.jobs[key] = self._ready(self.cache.index[key])
        except Exception as e:  # noqa: BLE001 - no model means the placeholder stays
            log.warning("Meshy generation failed for %r: %s: %s", query, type(e).__name__, e)
            self.jobs[key] = {"status": "none", "error": str(e)[:200]}
