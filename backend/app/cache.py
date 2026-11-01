from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path


class FileCache:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def key(*parts: str) -> str:
        return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()

    def get(self, key: str) -> dict | None:
        p = self.root / f"{key}.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    def put(self, key: str, value: dict) -> None:
        fd, tmp = tempfile.mkstemp(dir=self.root, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(json.dumps(value))
            os.replace(tmp, self.root / f"{key}.json")
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
