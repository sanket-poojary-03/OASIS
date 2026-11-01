"""Online model sources: Poly Pizza, Sketchfab, Meshy, plus token and licence helpers."""
from __future__ import annotations

import os
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

import httpx

MAX_DOWNLOAD = 25 * 1024 * 1024  # bytes; one model file


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


def stream_to_file(client: httpx.Client, url: str, dest: Path, headers: dict | None = None, cap: int = MAX_DOWNLOAD) -> None:
    """Stream a download to `dest`, refusing anything over `cap` bytes (Content-Length and running total)."""
    tmp = dest.with_name(f"{dest.name}.{uuid.uuid4().hex[:8]}.part")
    try:
        with client.stream("GET", url, headers=headers) as r:
            r.raise_for_status()
            if int(r.headers.get("content-length") or 0) > cap:
                raise ValueError("model file too large")
            total = 0
            with tmp.open("wb") as f:
                for chunk in r.iter_bytes():
                    total += len(chunk)
                    if total > cap:
                        raise ValueError("model file too large")
                    f.write(chunk)
        os.replace(tmp, dest)
    finally:
        tmp.unlink(missing_ok=True)


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
            stream_to_file(c, cand.download, dest)


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
            stream_to_file(c, url, dest)


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
            stream_to_file(c, url, dest)


