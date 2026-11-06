import json

import httpx
from fastapi.testclient import TestClient

from app.assets import AssetLibrary, AssetService, Candidate, MeshyClient, ModelCache, PolyPizzaFinder, SketchfabFinder, default_pick, license_ok, tokens
from app.main import create_app
from app.ratelimit import RateLimiter
from app.schemas import AssetRequest


def make_lib(tmp_path):
    root = tmp_path / "library"
    root.mkdir()
    (root / "manifest.json").write_text(json.dumps([
        {"id": "house-a", "file": "prefabs/house_a.glb", "tags": ["house", "wooden", "village"], "license": "CC0", "source": "quaternius"},
        {"id": "house-b", "file": "prefabs/house_b.glb", "tags": ["house", "wooden", "village"], "license": "CC0", "source": "quaternius"},
        {"id": "tower", "file": "kenney/castle/tower.glb", "tags": ["tower", "stone", "castle"], "license": "CC0", "source": "kenney"},
    ]))
    return AssetLibrary(root)


class FakeFinder:
    def __init__(self, name, results):
        self.name, self.results, self.downloads = name, results, 0

    def search(self, query, limit=8):
        return [c for c in self.results if set(tokens(query)) & set(tokens(c.title))]

    def download(self, cand, dest):
        self.downloads += 1
        dest.write_bytes(b"glTF")


class FakeMeshy:
    def __init__(self):
        self.created = []

    def create_preview(self, prompt):
        self.created.append(prompt)
        return "t1"

    def create_refine(self, preview_id):
        return "r1"

    def wait(self, task_id):
        return {"status": "SUCCEEDED", "model_urls": {"glb": "https://x/m.glb"}}

    def download(self, url, dest):
        dest.write_bytes(b"glTF")


def cand(title, lic="CC-BY 3.0", src="Poly Pizza"):
    return Candidate(title=title, download="https://cdn/x.glb", license=lic, author="ana", source=src, tris=900)


def test_tokens_and_licenses():
    assert tokens("The old Stone Towers of a castle") == ["stone", "tower", "castle"]
    assert tokens("wooden fishing cottage") == ["wooden", "fishing", "house"]
    assert license_ok("CC0 1.0") and license_ok("CC-BY 3.0") and license_ok("Creative Commons Attribution")
    assert not license_ok("CC BY-NC 4.0") and not license_ok("CC-BY-ND") and not license_ok("")


def test_license_rejects_sharealike():
    for bad in ("CC BY-SA 4.0", "CC-BY-SA", "Attribution-ShareAlike 4.0", "CC BY-NC-SA", "CC BY SA 3.0"):
        assert not license_ok(bad), bad
    assert license_ok("CC-BY 4.0") and license_ok("CC0 1.0 Universal")


def test_library_search_and_variants(tmp_path):
    lib = make_lib(tmp_path)
    entry, score = lib.search("stone tower")
    assert entry["id"] == "tower" and score == 1.0
    picks = {lib.search("wooden cottage", variant=v)[0]["id"] for v in range(4)}
    assert picks == {"house-a", "house-b"}
    assert lib.search("purple dragon")[0] is None


def lib_from(tmp_path, entries):
    root = tmp_path / "lib2"
    root.mkdir()
    (root / "manifest.json").write_text(json.dumps([
        {"id": e[0], "file": f"{e[0]}.glb", "tags": e[1], "license": "CC0", "source": "q"} for e in entries]))
    return AssetLibrary(root)


def test_library_multiword_queries_prefer_the_closest_model(tmp_path):
    # Tagging contract: kind-specific models also carry their category noun. Listing order is chosen so that
    # coverage-only ranking (ties -> first entry) would pick the wrong model for "tree" and "campfire with stones".
    lib = lib_from(tmp_path, [
        ("well", ["well", "stone"]), ("pine-tree", ["pine", "tree"]), ("dead-tree", ["dead", "tree"]),
        ("common-tree", ["tree"]), ("campfire", ["campfire", "fire"]),
    ])
    assert lib.search("tree")[0]["id"] == "common-tree"
    assert lib.search("pine")[0]["id"] == "pine-tree"
    assert lib.search("pine tree")[0]["id"] == "pine-tree"
    assert lib.search("dead tree")[0]["id"] == "dead-tree"
    assert lib.search("campfire with stones")[0]["id"] == "campfire"


def test_library_requires_the_head_noun(tmp_path):
    lib = lib_from(tmp_path, [("well", ["well", "stone"]), ("tree", ["tree"])])
    assert lib.search("campfire with stones")[0] is None  # "stone" alone must not give a well
    assert lib.search("stone well")[0]["id"] == "well"
    assert lib.search("pine tree")[0]["id"] == "tree"  # head noun "tree" matches


def test_order_library_then_online_then_cache(tmp_path):
    poly = FakeFinder("Poly Pizza", [cand("Giraffe"), cand("Giraffe NC", lic="CC BY-NC")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly])
    assert svc.resolve(AssetRequest(query="wooden cottage"))["source"] == "library"
    first = svc.resolve(AssetRequest(query="giraffe"))
    assert first["status"] == "ready" and first["source"] == "online" and first["url"].startswith("/files/generated/")
    assert "Giraffe by ana (CC-BY 3.0, Poly Pizza)" == first["credit"]
    again = svc.resolve(AssetRequest(query="a giraffe"))
    assert again["source"] == "online" and poly.downloads == 1


def test_falls_through_to_sketchfab_and_respects_allow_online(tmp_path):
    poly = FakeFinder("Poly Pizza", [cand("Balloon", lic="CC BY-NC 4.0")])
    sketch = FakeFinder("Sketchfab", [cand("Hot air balloon", lic="CC Attribution", src="Sketchfab")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly, sketch])
    assert svc.resolve(AssetRequest(query="hot air balloon", allowOnline=False)) == {"status": "none"}
    out = svc.resolve(AssetRequest(query="hot air balloon"))
    assert out["source"] == "online" and "Sketchfab" in out["credit"]


def test_generate_with_meshy_then_budget(tmp_path):
    meshy = FakeMeshy()
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [], meshy=meshy, max_generations=1, spawn=lambda f, *a: f(*a))
    first = svc.resolve(AssetRequest(query="purple dragon statue", kind="landmark", allowGenerate=True))
    assert first == {"status": "pending", "jobId": first["jobId"]}
    done = svc.job(first["jobId"])
    assert done["status"] == "ready" and done["source"] == "generated"
    assert svc.resolve(AssetRequest(query="dragon statue purple", kind="landmark", allowGenerate=True))["status"] == "ready"
    assert svc.resolve(AssetRequest(query="giant robot", kind="landmark", allowGenerate=True)) == {"status": "none"}
    assert "low-poly" in meshy.created[0]


# Generation is for landmarks (the user's choice, 2026-11-05): tests/test_asset_match.py::test_only_a_landmark_is_generated


def test_default_pick_prefers_title_match():
    assert default_pick("candle", [cand("Candle holder building"), cand("Candle")]) == 1
    assert default_pick("candle", [cand("Candle"), cand("Candle holder building")]) == 0
    assert default_pick("candle", [cand("Tree"), cand("Rock")]) == -1


def test_poly_pizza_finder_parses_and_downloads(tmp_path):
    def handler(req: httpx.Request) -> httpx.Response:
        if "search" in req.url.path:
            assert req.headers["X-Auth-Token"] == "k"
            return httpx.Response(200, json={"results": [
                {"Title": "Giraffe", "Download": "https://cdn/g.glb", "Licence": "CC-BY 3.0", "Creator": {"Username": "ana"}, "Tri Count": 800},
                {"Title": "No file", "Licence": "CC0"},
            ]})
        return httpx.Response(200, content=b"glTFdata")

    f = PolyPizzaFinder("k", transport=httpx.MockTransport(handler))
    out = f.search("giraffe")
    assert len(out) == 1 and out[0].author == "ana" and out[0].tris == 800 and out[0].license == "CC-BY 3.0"
    dest = tmp_path / "g.glb"
    f.download(out[0], dest)
    assert dest.read_bytes() == b"glTFdata"


def test_sketchfab_finder_parses_and_downloads(tmp_path):
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/search"):
            assert req.headers["Authorization"] == "Token t"
            return httpx.Response(200, json={"results": [
                {"name": "Balloon", "uid": "u1", "license": {"label": "CC Attribution"}, "user": {"username": "bo"}, "faceCount": 5000},
                {"name": "broken"},
            ]})
        if req.url.path.endswith("/download"):
            return httpx.Response(200, json={"glb": {"url": "https://cdn/b.glb"}})
        return httpx.Response(200, content=b"glTFballoon")

    f = SketchfabFinder("t", transport=httpx.MockTransport(handler))
    out = f.search("balloon")
    assert len(out) == 1 and out[0].uid == "u1" and license_ok(out[0].license)
    dest = tmp_path / "b.glb"
    f.download(out[0], dest)
    assert dest.read_bytes() == b"glTFballoon"


def test_meshy_client_flow(tmp_path):
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append((req.method, req.url.path))
        if req.method == "POST":
            return httpx.Response(200, json={"result": "task1"})
        if "task1" in req.url.path:
            return httpx.Response(200, json={"status": "SUCCEEDED", "model_urls": {"glb": "https://x/m.glb"}})
        return httpx.Response(200, content=b"glTFmesh")

    m = MeshyClient("key", transport=httpx.MockTransport(handler))
    tid = m.create_preview("dragon")
    assert m.wait(tid, poll=0)["model_urls"]["glb"].endswith("m.glb")
    dest = tmp_path / "m.glb"
    m.download("https://x/m.glb", dest)
    assert dest.read_bytes() == b"glTFmesh"


def test_failing_finder_falls_through(tmp_path):
    class Boom(FakeFinder):
        def search(self, query, limit=8):
            raise RuntimeError("down")

    good = FakeFinder("Sketchfab", [cand("Giraffe", src="Sketchfab")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [Boom("Poly Pizza", []), good])
    assert svc.resolve(AssetRequest(query="giraffe"))["status"] == "ready"


def test_asset_routes(tmp_path):
    lib = make_lib(tmp_path)
    (lib.root / "prefabs").mkdir()
    (lib.root / "prefabs" / "house_a.glb").write_bytes(b"glTFhouse")
    svc = AssetService(lib, ModelCache(tmp_path / "gen"), [])
    client = TestClient(create_app(llm=None, assets=svc))
    body = client.post("/api/assets/resolve", json={"query": "wooden cottage"}).json()
    assert body["source"] == "library" and body["url"].startswith("/files/library/")
    assert client.get(body["url"]).content == b"glTFhouse"
    assert client.post("/api/assets/resolve", json={"query": "purple dragon"}).json() == {"status": "none"}
    assert client.get("/api/assets/jobs/nope").json() == {"status": "none"}


def test_library_resolves_are_free_and_do_not_drain_the_llm_budget(tmp_path):
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [])
    client = TestClient(create_app(llm=None, assets=svc))
    for _ in range(30):
        assert client.post("/api/assets/resolve", json={"query": "wooden cottage"}).status_code == 200
    assert client.post("/api/world", json={"prompt": "a quiet fishing valley"}).status_code == 503  # not 429: the LLM budget is untouched


def test_external_path_is_gated_and_refusal_is_status_none(tmp_path):
    poly = FakeFinder("Poly Pizza", [cand("Giraffe"), cand("Zebra")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly])
    client = TestClient(create_app(llm=None, assets=svc, asset_limiter=RateLimiter(per_ip=1)))
    assert client.post("/api/assets/resolve", json={"query": "giraffe"}).json()["status"] == "ready"
    searched = []
    poly.search = lambda q, limit=8: searched.append(q) or []
    r = client.post("/api/assets/resolve", json={"query": "zebra"})
    assert r.status_code == 200 and r.json()["status"] == "none" and "Too many" in r.json()["notices"][0] and searched == []
    assert client.post("/api/assets/resolve", json={"query": "wooden cottage"}).json()["source"] == "library"
    assert client.post("/api/assets/resolve", json={"query": "giraffe"}).json()["source"] == "online"  # cache hit is free


def test_meshy_is_gated_too(tmp_path):
    meshy = FakeMeshy()
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [], meshy=meshy, spawn=lambda f, *a: f(*a))
    out = svc.resolve(AssetRequest(query="giant robot", kind="landmark", allowGenerate=True), gate=lambda: False)
    assert out["status"] == "none" and meshy.created == []


def test_refused_llm_pick_falls_back_to_title_match(tmp_path):
    class Picker:
        uses_llm = True

        def __call__(self, q, c):
            raise AssertionError("must not run when the pick budget is spent")

    poly = FakeFinder("Poly Pizza", [cand("Giraffe")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly], pick=Picker())
    assert svc.resolve(AssetRequest(query="giraffe"), pick_gate=lambda: False)["status"] == "ready"  # fell back to title match


def test_llm_picks_have_their_own_budget_and_never_spend_the_world_edit_one(tmp_path):
    class Picker:
        uses_llm = True

        def __init__(self):
            self.calls = 0

        def __call__(self, q, c):
            self.calls += 1
            return 0

    picker = Picker()
    poly = FakeFinder("Poly Pizza", [cand("Giraffe"), cand("Zebra")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly], pick=picker)
    client = TestClient(create_app(llm=None, assets=svc, limiter=RateLimiter(per_ip=1), pick_limiter=RateLimiter(per_ip=1)))
    assert client.post("/api/assets/resolve", json={"query": "giraffe"}).json()["source"] == "online"
    assert picker.calls == 1
    assert client.post("/api/world", json={"prompt": "a quiet fishing valley"}).status_code == 503  # not 429: world budget untouched (I4)
    assert client.post("/api/assets/resolve", json={"query": "zebra"}).json()["source"] == "online"
    assert picker.calls == 1  # pick budget spent: title matching chose instead


def test_non_glb_download_is_rejected_and_nothing_is_cached(tmp_path):
    class Html(FakeFinder):
        def download(self, cand, dest):
            dest.write_bytes(b"<html>")

    cache = ModelCache(tmp_path / "gen")
    svc = AssetService(make_lib(tmp_path), cache, [Html("Poly Pizza", [cand("Giraffe")])])
    assert svc.resolve(AssetRequest(query="giraffe")) == {"status": "none"}
    assert cache.count() == 0 and list((tmp_path / "gen").iterdir()) == []


def test_download_size_cap(tmp_path):
    big = httpx.MockTransport(lambda req: httpx.Response(200, content=b"glTF" + b"0" * 1000))
    from app.asset_sources import stream_to_file
    with httpx.Client(transport=big) as c:
        try:
            stream_to_file(c, "https://x/a.glb", tmp_path / "a.glb", cap=100)
            raise AssertionError("expected ValueError")
        except ValueError:
            pass
        assert list(tmp_path.iterdir()) == []
        stream_to_file(c, "https://x/a.glb", tmp_path / "a.glb", cap=5000)
        assert (tmp_path / "a.glb").read_bytes()[:4] == b"glTF"


def test_corrupt_index_is_treated_as_empty_and_rewritten_atomically(tmp_path):
    (tmp_path / "gen").mkdir()
    (tmp_path / ".gen-index.json").write_text("{not json", encoding="utf-8")
    cache = ModelCache(tmp_path / "gen")
    assert cache.index == {}
    (tmp_path / "gen" / "k.glb").write_bytes(b"glTF")
    cache.add("k", "q", "k.glb", "online")
    assert json.loads((tmp_path / ".gen-index.json").read_text())["k"]["file"] == "k.glb"
    assert not list(tmp_path.glob("*.tmp"))


def test_meshy_attempts_are_persisted_and_counted_before_generation(tmp_path):
    class Failing(FakeMeshy):
        def wait(self, task_id):
            raise RuntimeError("boom")

    lib = make_lib(tmp_path)

    def make():
        return AssetService(lib, ModelCache(tmp_path / "gen"), [], meshy=Failing(), max_generations=1, spawn=lambda f, *a: f(*a))

    assert make().resolve(AssetRequest(query="giant robot", kind="landmark", allowGenerate=True))["status"] == "pending"
    # the paid attempt failed, but it still counts, even after a restart
    assert make().resolve(AssetRequest(query="giant squid", kind="landmark", allowGenerate=True)) == {"status": "none"}


def test_inflight_lookups_share_one_download(tmp_path):
    import threading
    import time as _t

    class Slow(FakeFinder):
        def download(self, cand, dest):
            _t.sleep(0.2)
            super().download(cand, dest)

    poly = Slow("Poly Pizza", [cand("Giraffe")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly])
    out = []
    ts = [threading.Thread(target=lambda: out.append(svc.resolve(AssetRequest(query="giraffe")))) for _ in range(4)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert poly.downloads == 1 and all(o["status"] == "ready" for o in out)


def test_generated_index_is_not_served_and_urls_are_encoded(tmp_path):
    lib = lib_from(tmp_path, [("odd", ["odd"])])
    lib.entries[0]["file"] = "my folder/odd #1.glb"
    svc = AssetService(lib, ModelCache(tmp_path / "gen"), [])
    client = TestClient(create_app(llm=None, assets=svc))
    assert client.post("/api/assets/resolve", json={"query": "odd"}).json()["url"] == "/files/library/my%20folder/odd%20%231.glb"
    svc.cache.add("k", "q", "k.glb", "online")
    assert client.get("/files/generated/index.json").status_code == 404
    assert client.get("/files/generated/.gen-index.json").status_code == 404


def test_query_without_meaningful_tokens_is_none(tmp_path):
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [FakeFinder("P", [cand("a")])])
    assert svc.resolve(AssetRequest(query="the a")) == {"status": "none"}


def test_interior_and_scene_models_are_skipped_unless_asked_for(tmp_path):
    from app.assets import scene_like
    assert scene_like("House interior", "house") and scene_like("Living Room", "house") and scene_like("Cafe scene", "cafe")
    assert not scene_like("House interior", "house interior")  # the player asked for one
    assert not scene_like("Coffee Shop", "cafe") and not scene_like("Roomba", "robot")
    poly = FakeFinder("Poly Pizza", [cand("Giraffe interior"), cand("Giraffe")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly], pick=lambda q, cs: 0)
    assert svc.resolve(AssetRequest(query="giraffe"))["credit"].startswith("Giraffe by")


def test_too_large_model_tries_the_next_candidate(tmp_path):
    class Heavy(FakeFinder):
        def download(self, cand, dest):
            self.downloads += 1
            if cand.title == "Giraffe big":
                raise ValueError("model file too large")
            dest.write_bytes(b"glTF")

    poly = Heavy("Poly Pizza", [cand("Giraffe big"), cand("Giraffe")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly], pick=lambda q, cs: 0)
    out = svc.resolve(AssetRequest(query="giraffe"))
    assert out["status"] == "ready" and out["credit"].startswith("Giraffe by") and poly.downloads == 2


def test_online_download_cap_is_small():
    from app.asset_sources import ONLINE_MAX_DOWNLOAD
    assert ONLINE_MAX_DOWNLOAD <= 8 * 1024 * 1024


def test_llm_picker_asks_for_an_outside_view_and_gets_one_try():
    from app.assets import LLMPicker

    class Rec:
        model, timeout, retries, fallback_models = "m", 45.0, 2, ["b"]

        def __init__(self):
            self.system = ""

        def complete(self, s, u):
            self.system = s
            return '{"index": 1}'

    llm = Rec()
    picker = LLMPicker(llm)
    assert picker("cafe", [cand("Coffee Shop"), cand("Coffee Shop")]) == 1
    assert picker.llm.retries == 1 and llm.retries == 2  # the shared client is untouched
    assert "outside" in picker.llm.system and "interior" in picker.llm.system


def test_llm_picker_caps_its_answer():
    from app.assets import LLMPicker

    class Rec:
        model, timeout, retries, fallback_models, max_tokens = "m", 45.0, 2, [], 6000

        def complete(self, s, u):
            return '{"index": 0}'

    assert LLMPicker(Rec()).llm.max_tokens <= 1500


def test_llm_picker_keeps_reasoning_low():
    from app.assets import LLMPicker

    class Rec:
        model, timeout, retries, fallback_models, max_tokens, reasoning_effort = "m", 45.0, 2, [], 4000, "low"

        def complete(self, s, u):
            return '{"index": 0}'

    assert LLMPicker(Rec()).llm.reasoning_effort == "low"


def test_a_themed_model_needs_its_theme_asked_for(tmp_path):
    # Three pirate houses shaped like upturned hulls were a perfect match for "wooden cabin" in a snowy world.
    root = tmp_path / "themed"
    root.mkdir()
    (root / "manifest.json").write_text(json.dumps([
        {"id": "hull", "file": "hull.glb", "tags": ["fishing", "house", "hut", "pirate", "wooden"], "needs": ["fishing", "pirate"], "license": "CC0", "source": "q"},
        {"id": "plain", "file": "plain.glb", "tags": ["house", "home"], "license": "CC0", "source": "q"},
    ]))
    lib = AssetLibrary(root)
    assert lib.search("wooden cabin")[1] < 1.0 or lib.search("wooden cabin")[0]["id"] != "hull"
    assert all(e["id"] != "hull" for _, e in lib.ranked("wooden cabin"))
    assert lib.search("cabin")[0]["id"] == "plain"
    assert lib.search("fishing hut")[0]["id"] == "hull"
    assert lib.search("pirate house")[0]["id"] == "hull"


def test_the_real_library_keeps_its_themed_houses_to_their_theme():
    from pathlib import Path
    lib = AssetLibrary(Path(__file__).resolve().parents[1] / "assets" / "library")
    hulls = "quaternius/buildings/pirate/"
    for q in ("wooden cabin", "wooden hut", "wooden house", "cabin", "shack", "house", "building"):
        assert all(not e["file"].startswith(hulls) for _, e in lib.ranked(q)), q
    assert lib.search("fishing hut")[0]["file"].startswith(hulls)
    assert lib.search("pirate house")[0]["file"].startswith(hulls)
    for q in ("house", "building", "modern building"):
        assert all("scifi" not in e["file"] and "cyberpunk" not in e["file"] for _, e in lib.ranked(q)), q
    assert "scifi" in lib.search("space house")[0]["file"]
