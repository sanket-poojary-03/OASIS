"""The browser's base-art queries (shared/fixtures/art-queries.json, read by web/src/render/artLoader.ts) against the
library search. Ruling I4: the catalogue follows the Task 19b tagging contract (a kind model also carries its category
noun), so the two-word queries 'pine tree' and 'dead tree' pick the pine and the dead tree, and 'tree' the plain tree."""
import json

import pytest

from app.assets import AssetLibrary, tokens
from app.main import BACKEND_DIR
from app.schemas import FIXTURES_DIR

ART = json.loads((FIXTURES_DIR / "art-queries.json").read_text(encoding="utf-8"))
ENTRIES = ART["scatter"] + ART["rigged"]
QUERIES = [e["query"] for e in ENTRIES]
REAL = AssetLibrary(BACKEND_DIR / "assets" / "library")


def test_art_query_list_is_well_formed():
    assert {e["kind"] for e in ART["scatter"]} <= {"tree", "pine", "dead_tree", "bush", "rock", "cactus", "reed"}
    assert {e["use"] for e in ART["rigged"]} == {"player", "deer", "rabbit"}
    assert all(e["height"] > 0 for e in ENTRIES)
    assert all(tokens(q) for q in QUERIES)
    assert "pine tree" in QUERIES and "dead tree" in QUERIES


def test_art_queries_pick_their_model_in_a_catalogue_that_follows_the_tagging_contract(tmp_path):
    # Listed in an order where coverage-only ranking would give "tree" the pine.
    root = tmp_path / "library"
    root.mkdir()
    (root / "manifest.json").write_text(json.dumps([
        {"id": e["query"].replace(" ", "-"), "file": "x.glb", "tags": tokens(e["query"]), "license": "CC0", "source": "q"}
        for e in sorted(ENTRIES, key=lambda e: -len(e["query"]))
    ]))
    lib = AssetLibrary(root)
    for q in QUERIES:
        entry, _ = lib.search(q)
        assert entry is not None and entry["id"] == q.replace(" ", "-"), (q, entry)


@pytest.mark.parametrize("query", QUERIES)
def test_art_queries_against_the_real_manifest(query):
    if not REAL.entries:
        pytest.skip("library manifest is empty: the Task 19b CC0 packs are not downloaded yet")
    q = set(tokens(query))
    exact = [e for e, tags in zip(REAL.entries, REAL._tags) if q <= tags]
    entry, _ = REAL.search(query)
    if exact:
        assert entry is not None and q <= set(tokens(" ".join(entry["tags"]))), (query, entry and entry["id"])
    plain_tree = any("tree" in tags and not tags & {"pine", "dead"} for tags in REAL._tags)
    if query == "tree" and plain_tree:  # "tree" must give the plain tree, not a pine or a dead tree
        assert not set(tokens(" ".join(entry["tags"]))) & {"pine", "dead"}, entry["id"]
