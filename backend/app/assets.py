from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol
from urllib.parse import quote

import httpx

from .llm import extract_json
from .schemas import AssetRequest

STOP = {"a", "an", "the", "of", "with", "and", "on", "in", "small", "big", "large", "old", "new", "tiny", "huge", "some"}
SYNONYMS = {"cottage": "house", "cabin": "house", "hut": "house", "home": "house", "lodge": "house", "shack": "house",
            "boulder": "rock", "oak": "tree", "lamp": "lantern", "watchtower": "tower", "stag": "deer", "bunny": "rabbit"}


def tokens(text: str) -> list[str]:
    out: list[str] = []
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in STOP:
            continue
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        w = SYNONYMS.get(w, w)
        if w not in out:
            out.append(w)
    return out


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


_BAD = re.compile(r"\bnc\b|non-?commercial|\bnd\b|no-?deriv|share-?alike|\bby[- ]?sa\b|\bsa\b", re.I)
_GOOD = re.compile(r"cc0|public domain|cc[- ]?by|attribution", re.I)


def license_ok(label: str) -> bool:
    return bool(label) and bool(_GOOD.search(label)) and not _BAD.search(label)


@dataclass
class Candidate:
    title: str
    download: str
    license: str
    author: str
    source: str
    tris: int | None = None
    uid: str | None = None

    @property
    def credit(self) -> str:
        return f"{self.title} by {self.author or 'unknown'} ({self.license}, {self.source})"


class Finder(Protocol):
    name: str

    def search(self, query: str, limit: int = 8) -> list[Candidate]: ...

    def download(self, cand: Candidate, dest: Path) -> None: ...


def _first(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ""):
            return d[k]
    return default


class PolyPizzaFinder:
    """Poly Pizza: free low-poly CC0/CC-BY GLBs. Free API key at https://poly.pizza/settings/api."""

    name = "Poly Pizza"
    BASE = "https://api.poly.pizza/v1"

    def __init__(self, key: str, transport: httpx.BaseTransport | None = None):
        self.key, self.transport = key, transport

    def search(self, query: str, limit: int = 8) -> list[Candidate]:
        with httpx.Client(timeout=6, transport=self.transport) as c:
            r = c.get(f"{self.BASE}/search/{quote(query)}", params={"limit": limit, "format": "glb"}, headers={"X-Auth-Token": self.key})
            r.raise_for_status()
            data = r.json()
        items = data.get("results", []) if isinstance(data, dict) else data
        out: list[Candidate] = []
        for m in items:
            creator = _first(m, "Creator", "creator", default={})
            author = _first(creator, "Username", "username", default="") if isinstance(creator, dict) else str(creator)
            tris = _first(m, "Tri Count", "triCount", "tricount")
            out.append(Candidate(
                title=str(_first(m, "Title", "title", "name", default="model")),
                download=str(_first(m, "Download", "download", default="")),
                license=str(_first(m, "Licence", "License", "license", default="")),
                author=author, source=self.name, tris=int(tris) if tris else None,
            ))
        return [c for c in out if c.download]

    def download(self, cand: Candidate, dest: Path) -> None:
        with httpx.Client(timeout=15, transport=self.transport, follow_redirects=True) as c:
            r = c.get(cand.download)
            r.raise_for_status()
            dest.write_bytes(r.content)


class SketchfabFinder:
    """Sketchfab Data API v3: downloadable Creative Commons models. Token from your Sketchfab account settings."""

    name = "Sketchfab"
    BASE = "https://api.sketchfab.com/v3"

    def __init__(self, token: str, transport: httpx.BaseTransport | None = None):
        self.token, self.transport = token, transport

    def search(self, query: str, limit: int = 8) -> list[Candidate]:
        with httpx.Client(timeout=6, transport=self.transport) as c:
            r = c.get(f"{self.BASE}/search", params={"type": "models", "q": query, "downloadable": "true", "count": limit, "max_face_count": 30000},
                      headers={"Authorization": f"Token {self.token}"})
            r.raise_for_status()
            items = r.json().get("results", [])
        out: list[Candidate] = []
        for m in items:
            lic = m.get("license")
            out.append(Candidate(
                title=str(m.get("name", "model")), download="", license=str(_first(lic, "label", default="") if isinstance(lic, dict) else lic or ""),
                author=str((m.get("user") or {}).get("username", "")), source=self.name, tris=m.get("faceCount"), uid=m.get("uid"),
            ))
        return [c for c in out if c.uid]

    def download(self, cand: Candidate, dest: Path) -> None:
        with httpx.Client(timeout=20, transport=self.transport, follow_redirects=True) as c:
            r = c.get(f"{self.BASE}/models/{cand.uid}/download", headers={"Authorization": f"Token {self.token}"})
            r.raise_for_status()
            url = (r.json().get("glb") or {}).get("url")
            if not url:
                raise RuntimeError("no GLB download offered")
            f = c.get(url)
            f.raise_for_status()
            dest.write_bytes(f.content)


class MeshyClient:
    BASE = "https://api.meshy.ai/openapi/v2/text-to-3d"

    def __init__(self, api_key: str, transport: httpx.BaseTransport | None = None):
        self.api_key, self.transport = api_key, transport

    def _client(self, timeout: float = 30) -> httpx.Client:
        return httpx.Client(timeout=timeout, transport=self.transport, headers={"Authorization": f"Bearer {self.api_key}"}, follow_redirects=True)

    def create_preview(self, prompt: str) -> str:
        with self._client() as c:
            r = c.post(self.BASE, json={"mode": "preview", "prompt": prompt[:600], "art_style": "realistic", "should_remesh": True})
            r.raise_for_status()
            return r.json()["result"]

    def create_refine(self, preview_id: str) -> str:
        with self._client() as c:
            r = c.post(self.BASE, json={"mode": "refine", "preview_task_id": preview_id})
            r.raise_for_status()
            return r.json()["result"]

    def get(self, task_id: str) -> dict:
        with self._client() as c:
            r = c.get(f"{self.BASE}/{task_id}")
            r.raise_for_status()
            return r.json()

    def wait(self, task_id: str, poll: float = 5.0, timeout: float = 600.0) -> dict:
        start = time.time()
        while time.time() - start < timeout:
            task = self.get(task_id)
            status = task.get("status")
            if status == "SUCCEEDED":
                return task
            if status in {"FAILED", "EXPIRED", "CANCELED"}:
                raise RuntimeError(f"Meshy task {task_id} {status}")
            time.sleep(poll)
        raise TimeoutError(f"Meshy task {task_id} timed out")

    def download(self, url: str, dest: Path) -> None:
        with httpx.Client(timeout=120, transport=self.transport, follow_redirects=True) as c:
            r = c.get(url)
            r.raise_for_status()
            dest.write_bytes(r.content)


class AssetLibrary:
    def __init__(self, root: Path):
        self.root = root
        manifest = root / "manifest.json"
        self.entries: list[dict] = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else []
        self._tags = [set(tokens(" ".join(e.get("tags", [])))) for e in self.entries]

    def search(self, query: str, variant: int = 0) -> tuple[dict | None, float]:
        """Best entry by (coverage of the query, Jaccard); the head noun must be among its tags.

        Returns (entry, coverage). Equally good entries rotate with `variant`.
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
    """Every model fetched online or generated, stored once and reused by its normalized description."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.index_path = root / "index.json"
        self.index: dict[str, dict] = json.loads(self.index_path.read_text(encoding="utf-8")) if self.index_path.exists() else {}
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
            self.index_path.write_text(json.dumps(self.index, indent=1), encoding="utf-8")

    def count(self, source: str | None = None) -> int:
        return sum(1 for e in self.index.values() if source is None or e["source"] == source)


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


class LLMPicker:
    """One cheap LLM call to choose among search results by title (only for things not in the library)."""

    def __init__(self, llm):
        self.llm = llm

    def __call__(self, query: str, cands: list[Candidate]) -> int:
        lines = "\n".join(f"{i}: {c.title} ({c.tris or '?'} triangles)" for i, c in enumerate(cands))
        try:
            raw = self.llm.complete('Pick the 3D model that best matches the request. Reply with JSON {"index": n}, or {"index": -1} if none fits.',
                                    f"Request: {query}\nCandidates:\n{lines}")
            idx = int(extract_json(raw).get("index", -1))
        except Exception:  # noqa: BLE001 - fall back to title matching
            return default_pick(query, cands)
        return idx if -1 <= idx < len(cands) else -1


def _thread(fn: Callable, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


class AssetService:
    def __init__(self, library: AssetLibrary, cache: ModelCache, finders: list, meshy=None, max_generations: int = 5,
                 refine: bool = False, pick: Callable[[str, list[Candidate]], int] = default_pick, spawn: Callable = _thread):
        self.library, self.cache, self.finders, self.meshy = library, cache, finders, meshy
        self.max_generations, self.refine, self.pick, self.spawn = max_generations, refine, pick, spawn
        self.jobs: dict[str, dict] = {}

    @staticmethod
    def _ready(e: dict) -> dict:
        out = {"status": "ready", "source": e["source"], "url": f"/files/generated/{e['file']}"}
        if e.get("credit"):
            out["credit"] = e["credit"]
        return out

    def resolve(self, req: AssetRequest) -> dict:
        entry, _ = self.library.search(req.query, req.variant)
        if entry:
            return {"status": "ready", "source": "library", "url": f"/files/library/{entry['file']}"}
        hit = self.cache.get(req.query)
        if hit:
            return self._ready(hit)
        key = self.cache.key(req.query)
        if key in self.jobs:
            return self.job(key)
        if req.allowOnline:
            found = self._find_online(key, req.query)
            if found:
                return found
        running = sum(1 for j in self.jobs.values() if j["status"] == "pending")
        if not (req.allowGenerate and req.kind == "landmark" and self.meshy and self.cache.count("generated") + running < self.max_generations):
            return {"status": "none"}
        self.jobs[key] = {"status": "pending"}
        self.spawn(self._generate, key, req.query)
        return {"status": "pending", "jobId": key}

    def _find_online(self, key: str, query: str) -> dict | None:
        for finder in self.finders:
            try:
                cands = [c for c in finder.search(query) if license_ok(c.license) and (c.tris is None or c.tris <= 30000)][:5]
                if not cands:
                    continue
                i = self.pick(query, cands)
                if i < 0:
                    continue
                file = f"{key}.glb"
                finder.download(cands[i], self.cache.root / file)
                self.cache.add(key, query, file, "online", cands[i].credit)
                return self._ready(self.cache.index[key])
            except Exception:  # noqa: BLE001 - a failing source just means "try the next one"
                continue
        return None

    def job(self, job_id: str) -> dict:
        j = self.jobs.get(job_id)
        if not j:
            return {"status": "none"}
        if j["status"] == "pending":
            return {"status": "pending", "jobId": job_id}
        return {k: v for k, v in j.items() if k in {"status", "source", "url", "credit"}}

    def _generate(self, key: str, query: str) -> None:
        try:
            task_id = self.meshy.create_preview(f"{query}, low-poly game asset, single object, centered, no ground plane")
            task = self.meshy.wait(task_id)
            if self.refine:
                task = self.meshy.wait(self.meshy.create_refine(task_id))
            file = f"{key}.glb"
            self.meshy.download(task["model_urls"]["glb"], self.cache.root / file)
            self.cache.add(key, query, file, "generated", "Generated with Meshy")
            self.jobs[key] = self._ready(self.cache.index[key])
        except Exception as e:  # noqa: BLE001 - no model means the placeholder stays
            self.jobs[key] = {"status": "none", "error": str(e)[:200]}
