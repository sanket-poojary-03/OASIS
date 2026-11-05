"""Index backend/assets/library/**.glb|.gltf into manifest.json, tags from folder and file names.

Hand-edited tags survive re-runs: entries already in manifest.json keep their "tags".
Usage: python scripts/build_manifest.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "assets" / "library"
LICENSES = {"kenney": "CC0 1.0 (kenney.nl)", "quaternius": "CC0 1.0 (quaternius.com)", "kaykit": "CC0 1.0 (Kay Lousberg)", "prefabs": "CC0 1.0 (assembled from Quaternius pieces)"}
DROP = {"glb", "gltf", "models", "model", "format", "fbx", "obj"}


def split_words(name: str) -> list[str]:
    name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    return [w.lower() for w in re.split(r"[^A-Za-z]+", name) if len(w) > 1]


def main() -> None:
    manifest = ROOT / "manifest.json"
    old = {e["file"]: e for e in json.loads(manifest.read_text(encoding="utf-8"))} if manifest.exists() else {}
    entries = []
    for f in sorted(ROOT.rglob("*")):
        if f.suffix.lower() not in {".glb", ".gltf"}:
            continue
        rel = f.relative_to(ROOT).as_posix()
        parts = rel.split("/")
        tags = sorted((set(split_words(" ".join(parts[:-1]))) | set(split_words(f.stem))) - DROP)
        entries.append({
            "id": re.sub(r"[^a-z0-9]+", "-", rel.lower()).strip("-"),
            "file": rel,
            "tags": old.get(rel, {}).get("tags", tags),
            **({"needs": old[rel]["needs"]} if "needs" in old.get(rel, {}) else {}),
            "license": LICENSES.get(parts[0].lower(), "check the source"),
            "source": parts[0],
        })
    manifest.write_text(json.dumps(entries, indent=1), encoding="utf-8")
    print(f"{len(entries)} models indexed")


if __name__ == "__main__":
    main()
