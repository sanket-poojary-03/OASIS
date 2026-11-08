"""Model finder: exact library -> cache -> analysis -> library -> online + vision over several search terms -> Meshy (landmarks) -> manual."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from itertools import zip_longest
from pathlib import Path
from typing import Callable
from urllib.parse import quote

import httpx

from .asset_sources import (  # noqa: F401 - re-exported for main.py
    ONLINE_MAX_TRIS, Candidate, MeshyClient, PolyPizzaFinder, SketchfabFinder, license_ok, tokens,
)
from .asset_analyse import Analysis
from .asset_match import LLMPicker, default_pick, scene_like, shape_ok  # noqa: F401 - re-exported for main.py
from .asset_store import AssetLibrary, ModelCache, _atomic_write_json
from .asset_vision import Verdict
from .schemas import AssetRequest

log = logging.getLogger(__name__)

# How long one request may spend on search terms, so the browser's wait still has room for what comes after.
SEARCH_SECONDS = 20.0
MAX_POOL = 8
NO_MESHY_KEY = "Meshy API key is missing"
NO_MESHY_CREDITS = "Meshy has no credits left"
TOO_MANY = {"status": "none", "notices": ["Too many new 3D models at once. Try this one again in a few minutes"]}
BUDGET_PAUSED = "New 3D models are paused for now (the AI budget is used up), so the closest model we have stands in"
# What a building stands in as when nothing alike is at hand, so a district never shows empty plots. A landmark or a small
# thing with nothing alike is left out rather than shown as something else.
_STAND_IN = {"structure": "house", "settlement": "house"}


def _building(query: str) -> str:
    return f"Building {query} manually"


def _meshy_problem(e: Exception, query: str) -> str:
    status = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else 0
    if status == 402:
        return NO_MESHY_CREDITS
    if status in (401, 403):
        return "Meshy API key was rejected"
    return f"Meshy could not make {query}"


def _thread(fn: Callable, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


_NONE = {"status": "none"}


class AssetService:
    def __init__(self, library: AssetLibrary, cache: ModelCache, finders: list, meshy=None, max_generations: int = 5,
                 refine: bool = False, pick: Callable[[str, list[Candidate]], int] = default_pick, spawn: Callable = _thread,
                 analyse: Callable[[str], Analysis] | None = None, vision: Callable[[str, list[Candidate]], Verdict | None] | None = None,
                 designer: Callable[[str, str | None], list[dict]] | None = None, clock: Callable[[], float] = time.monotonic):
        self.library, self.cache, self.finders, self.meshy = library, cache, finders, meshy
        self.max_generations, self.refine, self.pick, self.spawn = max_generations, refine, pick, spawn
        self.analyse, self.vision, self.designer, self.clock = analyse, vision, designer, clock
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()
        self._inflight: dict[str, threading.Lock] = {}
        # Remembered AI verdicts: a partial library match (query tokens -> chosen file, or None) and each request's analysis.
        self._lib_verdicts: dict[str, str | None] = {}
        self._analyses: dict[str, Analysis] = {}

    def _ready(self, e: dict) -> dict:
        out: dict = {"status": "ready", "source": e["source"]}
        if e["source"] == "procedural":
            out["parts"] = json.loads((self.cache.root / e["file"]).read_text(encoding="utf-8"))
        else:
            out["url"] = f"/files/generated/{quote(e['file'])}"
        if e.get("credit"):
            out["credit"] = e["credit"]
        if e.get("tint"):
            out["tint"] = e["tint"]
        return out

    def _trusted(self, entry: dict) -> bool:
        """An online model found before the vision check has no verdict yet: it is looked at again on its next request."""
        return not self.vision or entry["source"] != "online" or bool(entry.get("verified"))

    def resolve(self, req: AssetRequest, gate: Callable[[], bool] | None = None, pick_gate: Callable[[], bool] | None = None) -> dict:
        """_find, except that a request a budget refused gets the closest model already at hand instead of nothing: a city of
        a hundred kinds of building spent the day's AI budget and its last streets stood empty."""
        refused: list[bool] = []

        def watched(g: Callable[[], bool] | None) -> Callable[[], bool] | None:
            if g is None:
                return None

            def ask() -> bool:
                ok = g()
                if not ok:
                    refused.append(True)
                return ok
            return ask

        res = self._find(req, watched(gate), watched(pick_gate))
        if not refused or res.get("status") != "none":
            return res
        return self._closest(req) or {**res, "notices": res.get("notices") or [BUDGET_PAUSED]}

    def _closest(self, req: AssetRequest) -> dict | None:
        """Free, asking no one: the library model of the same kind, else a model stored for something alike, else (for a
        building) a plain house. The player is told new models are paused. None when nothing can stand in."""
        told = {"notices": [BUDGET_PAUSED]}
        entry = self.library.closest(req.query, req.variant)
        if entry:
            return {**self._library_ready(entry), **told}
        hit = self.cache.similar(req.query)
        if hit and self._trusted(hit):
            return {**self._ready(hit), **told}
        entry = self.library.search(_STAND_IN[req.kind], req.variant)[0] if req.kind in _STAND_IN else None
        return {**self._library_ready(entry), **told} if entry else None

    def _find(self, req: AssetRequest, gate: Callable[[], bool] | None = None, pick_gate: Callable[[], bool] | None = None) -> dict:
        """An exact library match or an approved cached model, free. Then the request is analysed: a plain shape is built in
        code; anything else tries the library and online search with vision, under each of its search terms, against the
        original request. After that a landmark may wait for Meshy, and whatever is left is built manually.

        `gate` is asked before each external path (online search, Meshy); `pick_gate` before an LLM call. A refusal
        returns status none, or the unchecked model when there is one.
        """
        if not tokens(req.query):
            return dict(_NONE)
        entry = self._exact_library(req.query, req.variant)
        if entry:
            return self._library_ready(entry)
        hit = self.cache.get(req.query)
        if hit and self._trusted(hit):
            return self._ready(hit)
        key = self.cache.key(req.query)
        if key in self.jobs:
            return self.job(key)
        if not req.allowOnline and not req.allowGenerate:  # the base art: the library or its own built-in fallback, at no cost
            return self._library_ready(entry) if (entry := self._library(req.query, req.variant, pick_gate)) else dict(_NONE)
        if hit and pick_gate is not None and not pick_gate():
            return self._ready(hit)  # no budget to check it: better than nothing
        analysis = self._analysis(req.query, pick_gate)
        if analysis.plain_shape and self.designer and req.allowGenerate:
            return self._start_manual(key, req.query, analysis.color, [])
        entry = self._library(req.query, req.variant, pick_gate)
        if entry:
            return self._library_ready(entry)
        online = req.allowOnline and bool(self.finders)
        if online and gate is not None and not gate():
            return self._ready(hit) if hit else dict(TOO_MANY)  # say so: this looked like a world with objects missing
        deadline = self.clock() + SEARCH_SECONDS
        asked = set(tokens(req.query))
        terms = list(dict.fromkeys([analysis.search, *analysis.alternatives]))
        for term in terms:
            if set(tokens(term)) != asked:
                entry = self._library(term, req.variant, pick_gate)
                if entry:
                    return self._library_ready(entry)
            if not online or self.clock() > deadline:
                continue
            with self._key_lock(key):  # concurrent identical lookups share one search and download
                again = self.cache.get(req.query)
                if again and self._trusted(again):
                    return self._ready(again)
                found = self._find_online(key, term, req.query, analysis, req.kind, pick_gate)
                if found:
                    return found
        return self._last_resort(key, req, analysis, gate, pick_gate)

    def _last_resort(self, key: str, req: AssetRequest, analysis: Analysis, gate, pick_gate) -> dict:
        """Nothing found: only a landmark may wait for Meshy (5 credits go fast: a village would spend them all). Without Meshy
        the player is told why, and it is built manually."""
        notices: list[str] = []
        if req.kind == "landmark" and req.allowGenerate:
            if not self.meshy:
                notices.append(NO_MESHY_KEY)
            elif gate is not None and not gate():
                return dict(TOO_MANY)
            else:
                with self.lock:  # cap check, paid-attempt reservation and job insert are one step
                    if key in self.jobs:
                        return self.job(key)
                    started = self.cache.reserve_attempt(self.max_generations)
                    if started:
                        self.jobs[key] = {"status": "pending"}
                if started:
                    self.spawn(self._generate, key, req.query, analysis.color)
                    return {"status": "pending", "jobId": key}
                notices.append(NO_MESHY_CREDITS)
        if not req.allowGenerate or not self.designer or (pick_gate is not None and not pick_gate()):
            return dict(_NONE)
        return self._start_manual(key, req.query, analysis.color, [*notices, _building(req.query)])

    def _start_manual(self, key: str, query: str, color: str | None, notices: list[str]) -> dict:
        with self.lock:
            if key in self.jobs:
                return self.job(key)
            self.jobs[key] = {"status": "pending", "notices": notices}
        self.spawn(self._design, key, query, color, notices)
        out: dict = {"status": "pending", "jobId": key}
        if notices:
            out["notices"] = notices
        return out

    def _design(self, key: str, query: str, color: str | None, notices: list[str]) -> None:
        try:
            parts = self.designer(query, color)
            file = f"{key}.parts.json"
            _atomic_write_json(self.cache.root / file, parts)
            self.cache.add(key, query, file, "procedural", verified=True)
            done = self._ready(self.cache.index[key])
        except Exception as e:  # noqa: BLE001 - no design: nothing to show, and the player is told
            log.warning("could not build %r manually: %s: %s", query, type(e).__name__, e)
            done = {"status": "none"}
            notices = [*notices, f"Could not build {query}"]
        if notices:
            done["notices"] = notices
        self.jobs[key] = done

    @staticmethod
    def _library_ready(entry: dict) -> dict:
        return {"status": "ready", "source": "library", "url": f"/files/library/{quote(entry['file'])}"}

    def _exact_library(self, query: str, variant: int) -> dict | None:
        """A library model carrying every word of the request: taken without asking anyone."""
        ranked = self.library.ranked(query)
        return self.library.search(query, variant)[0] if ranked and ranked[0][0][0] >= 1 else None

    def _library(self, query: str, variant: int, pick_gate: Callable[[], bool] | None) -> dict | None:
        """The library model for `query`. A full match is taken as is; a partial one ("statue of a knight" vs a stag
        statue) is shown to the AI picker with the other close entries, which may choose one or none (remembered)."""
        ranked = [(k, e) for k, e in self.library.ranked(query) if k[0] >= 0.5]
        if not ranked:
            return None
        if ranked[0][0][0] >= 1 or not getattr(self.pick, "uses_llm", False):
            return self.library.search(query, variant)[0]
        q = " ".join(sorted(tokens(query)))
        if q not in self._lib_verdicts:
            if pick_gate is not None and not pick_gate():
                return self.library.search(query, variant)[0]  # no budget to ask: the closest, as before
            cands = [e for _, e in ranked[:6]]
            shown = [Candidate(title=f"{e.get('title') or e['id']} ({', '.join(e.get('tags', []))})", download="",
                               license=str(e.get("license", "")), author="library", source="library") for e in cands]
            i = self.pick(query, shown)
            self._lib_verdicts[q] = cands[i]["file"] if 0 <= i < len(cands) else None
        file = self._lib_verdicts[q]
        if file is None:
            return None
        chosen = next(e for _, e in ranked if e["file"] == file)
        folder = file.rsplit("/", 1)[0]
        same = [e for _, e in ranked if e.get("title") == chosen.get("title") and e["file"].rsplit("/", 1)[0] == folder]
        return same[variant % len(same)]  # house 0, 1, 2… of a village still differ

    def _analysis(self, query: str, pick_gate: Callable[[], bool] | None) -> Analysis:
        """What the request means, asked once per request."""
        if not self.analyse:
            return Analysis(search=query)
        q = " ".join(tokens(query))
        if q not in self._analyses:
            if getattr(self.analyse, "uses_llm", False) and pick_gate is not None and not pick_gate():
                return Analysis(search=query)
            self._analyses[q] = self.analyse(query)
        return self._analyses[q]

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

    def _pool(self, term: str, original: str) -> list[tuple[object, Candidate]]:
        """Every source's usable results for one search, taken in turns, so they are compared rather than first come first served."""
        lists: list[list[tuple[object, Candidate]]] = []
        for finder in self.finders:
            try:
                found = [c for c in finder.search(term)
                         if license_ok(c.license) and (c.tris is None or c.tris <= ONLINE_MAX_TRIS) and not scene_like(c.title, f"{term} {original}")][:5]
            except Exception as e:  # noqa: BLE001 - a failing source just means fewer results
                log.warning("asset finder %s failed for %r: %s: %s", getattr(finder, "name", type(finder).__name__), term, type(e).__name__, e)
                continue
            lists.append([(finder, c) for c in found])
        return [p for group in zip_longest(*lists) for p in group if p][:MAX_POOL]

    def _take(self, key: str, finder, c: Candidate, query: str, kind: str) -> str | None:
        """Download one candidate; None when it fails or has the wrong shape (a flat cover picked for a building)."""
        try:
            file = self._fetch(key, lambda dest: finder.download(c, dest))
        except Exception as e:  # noqa: BLE001
            log.warning("asset %r: %s download failed (%s), trying the next one", query, c.title, e)
            return None
        if not shape_ok(self.cache.root / file, kind):
            log.warning("asset %r: %s is the wrong shape for a %s, trying the next one", query, c.title, kind)
            (self.cache.root / file).unlink(missing_ok=True)
            return None
        return file

    def _find_online(self, key: str, term: str, original: str, analysis: Analysis, kind: str, pick_gate: Callable[[], bool] | None) -> dict | None:
        pool = self._pool(term, original)
        if not pool:
            return None
        if self.vision and (pick_gate is None or pick_gate()):
            verdict = self.vision(original, [c for _, c in pool])  # always the original: "lighthouse building" must not approve any building
            if verdict is not None:
                for i, differs in verdict.order:
                    finder, c = pool[i]
                    file = self._take(key, finder, c, original, kind)
                    if file:
                        self.cache.add(key, original, file, "online", c.credit, verified=True, tint=analysis.color if differs else None)
                        return self._ready(self.cache.index[key])
                return None
        pick = default_pick if self.vision else self.pick
        if getattr(pick, "uses_llm", False) and pick_gate is not None and not pick_gate():
            pick = default_pick
        for _ in range(3):  # a pick that fails (too large, broken, wrongly shaped) gives way to the next best
            if not pool:
                break
            i = pick(term, [c for _, c in pool])
            if i < 0:
                break
            finder, c = pool.pop(i)
            file = self._take(key, finder, c, original, kind)
            if file:
                self.cache.add(key, original, file, "online", c.credit)
                return self._ready(self.cache.index[key])
        return None

    def job(self, job_id: str) -> dict:
        j = self.jobs.get(job_id)
        if not j:
            return dict(_NONE)
        if j["status"] == "pending":
            out = {"status": "pending", "jobId": job_id}
            if j.get("notices"):
                out["notices"] = j["notices"]
            return out
        return {k: v for k, v in j.items() if k in {"status", "source", "url", "credit", "parts", "tint", "notices"}}

    def _generate(self, key: str, query: str, color: str | None = None) -> None:
        try:
            task_id = self.meshy.create_preview(f"{query}, low-poly game asset, single object, centered, no ground plane")
            task = self.meshy.wait(task_id)
            if self.refine:
                task = self.meshy.wait(self.meshy.create_refine(task_id))
            url = task["model_urls"]["glb"]
            file = self._fetch(key, lambda dest: self.meshy.download(url, dest))
            self.cache.add(key, query, file, "generated", "Generated with Meshy", verified=True)
            self.jobs[key] = self._ready(self.cache.index[key])
        except Exception as e:  # noqa: BLE001 - no model from Meshy: it is built manually if it can be
            log.warning("Meshy generation failed for %r: %s: %s", query, type(e).__name__, e)
            if self.designer:
                self._design(key, query, color, [_meshy_problem(e, query), _building(query)])
            else:
                self.jobs[key] = {"status": "none", "error": str(e)[:200]}
