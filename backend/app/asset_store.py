"""What the finder keeps on disk: the curated library, and every model fetched online or generated."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import uuid
from pathlib import Path

from .asset_match import head_noun
from .asset_sources import tokens

log = logging.getLogger(__name__)


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
        scored = self.ranked(query)
        if not scored:
            return None, 0.0
        best = scored[0][0]
        if best[0] < 0.5:
            return None, best[0]
        ties = [e for k, e in scored if k == best]
        return ties[variant % len(ties)], best[0]

    def ranked(self, query: str) -> list[tuple[tuple[float, float], dict]]:
        """Entries carrying the query's head noun, best first by (coverage of the query, Jaccard); manifest order on ties."""
        q = set(tokens(query))
        if not q:
            return []
        head = head_noun(query)
        scored = []
        for i, (e, tags) in enumerate(zip(self.entries, self._tags)):
            if head and head not in tags:
                continue
            scored.append(((len(q & tags) / len(q), len(q & tags) / len(q | tags)), i, e))
        scored.sort(key=lambda s: (-s[0][0], -s[0][1], s[1]))
        return [(k, e) for k, _, e in scored]


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

    def add(self, key: str, query: str, file: str, source: str, credit: str | None = None, verified: bool = False, tint: str | None = None) -> None:
        with self.lock:
            self.index[key] = {"file": file, "query": query, "source": source, "credit": credit, "created": time.time(), "verified": verified}
            if tint:
                self.index[key]["tint"] = tint
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
