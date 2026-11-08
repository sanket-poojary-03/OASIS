"""When the model finder's AI budget is spent, it reuses models it already has instead of leaving objects out."""
import json

from app.assets import BUDGET_PAUSED, AssetLibrary, AssetService, ModelCache
from app.schemas import AssetRequest

CLOSED = lambda: False  # noqa: E731 - the day's budget is spent
OPEN = lambda: True  # noqa: E731


class NoResults:
    name = "Somewhere online"

    def search(self, query, limit=8):
        return []


def service(tmp_path, cached: list[tuple[str, str]] = (), online: bool = False):
    root = tmp_path / "library"
    root.mkdir()
    (root / "manifest.json").write_text(json.dumps([
        {"id": "townhouse-a", "file": "townhouse_a.glb", "tags": ["townhouse", "house", "town"], "license": "CC0", "source": "q"},
        {"id": "townhouse-b", "file": "townhouse_b.glb", "tags": ["townhouse", "house", "town", "terraced"], "license": "CC0", "source": "q"},
        {"id": "house", "file": "house.glb", "tags": ["house", "wooden"], "license": "CC0", "source": "q"},
        {"id": "tower", "file": "tower.glb", "tags": ["tower", "stone"], "license": "CC0", "source": "q"},
    ]))
    cache = ModelCache(tmp_path / "gen")
    for i, (query, source) in enumerate(cached):
        (cache.root / f"m{i}.glb").write_bytes(b"glTF")
        cache.add(cache.key(query), query, f"m{i}.glb", source, credit="someone (CC0)", verified=True)
    designs = []
    svc = AssetService(AssetLibrary(root), cache, [NoResults()] if online else [], designer=lambda q, c: designs.append(q) or [])
    return svc, designs


def ask(svc, query, kind="structure", variant=0, gate=OPEN, pick_gate=CLOSED):
    return svc.resolve(AssetRequest(query=query, kind=kind, allowGenerate=True, variant=variant), gate=gate, pick_gate=pick_gate)


def test_a_building_gets_the_closest_library_model_of_its_kind_and_the_player_is_told(tmp_path):
    svc, designs = service(tmp_path)
    res = ask(svc, "brownstone townhouse with bay windows")
    assert res["status"] == "ready" and res["source"] == "library" and "townhouse" in res["url"]
    assert res["notices"] == [BUDGET_PAUSED]
    assert designs == []  # nothing built with the AI


def test_a_street_of_them_still_varies(tmp_path):
    svc, _ = service(tmp_path)
    urls = {ask(svc, "brownstone townhouse with bay windows", variant=v)["url"] for v in range(2)}
    assert len(urls) == 2


def test_a_model_already_found_online_for_something_alike_is_reused(tmp_path):
    svc, _ = service(tmp_path, cached=[("rusty steam locomotive", "online")])
    res = ask(svc, "old steam locomotive", kind="prop")
    assert res["status"] == "ready" and res["source"] == "online" and res["notices"] == [BUDGET_PAUSED]


def test_a_building_with_nothing_alike_still_stands_as_a_house(tmp_path):
    svc, _ = service(tmp_path)
    res = ask(svc, "glass bakery pavilion")
    assert res["status"] == "ready" and res["source"] == "library" and res["notices"] == [BUDGET_PAUSED]


def test_a_small_thing_with_nothing_alike_is_left_out_rather_than_a_random_house(tmp_path):
    svc, _ = service(tmp_path)
    res = ask(svc, "brass cafe heater", kind="prop")
    assert res["status"] == "none" and res["notices"] == [BUDGET_PAUSED]


def test_too_many_online_searches_falls_back_the_same_way(tmp_path):
    svc, _ = service(tmp_path, online=True)
    res = ask(svc, "brownstone townhouse with bay windows", gate=CLOSED, pick_gate=OPEN)
    assert res["status"] == "ready" and "townhouse" in res["url"]


def test_with_budget_left_nothing_changes(tmp_path):
    svc, designs = service(tmp_path)
    res = ask(svc, "glass bakery pavilion", pick_gate=OPEN)
    assert res.get("source") != "library" and "notices" not in res or BUDGET_PAUSED not in res.get("notices", [])
    assert designs  # built manually, as before
