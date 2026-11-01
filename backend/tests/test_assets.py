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
    lib = lib_from(tmp_path, [
        ("common-tree", ["tree"]), ("pine-tree", ["pine", "tree"]), ("dead-tree", ["dead", "tree"]),
        ("well", ["well", "stone"]), ("campfire", ["campfire", "fire"]),
    ])
    assert lib.search("pine tree")[0]["id"] == "pine-tree"
    assert lib.search("dead tree")[0]["id"] == "dead-tree"
    assert lib.search("tree")[0]["id"] == "common-tree"
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


def test_generation_is_landmark_only(tmp_path):
    meshy = FakeMeshy()
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [], meshy=meshy, max_generations=5, spawn=lambda f, *a: f(*a))
    for kind in ("prop", "structure", "settlement"):
        assert svc.resolve(AssetRequest(query="purple dragon statue", kind=kind, allowGenerate=True)) == {"status": "none"}
    assert meshy.created == []
    assert svc.resolve(AssetRequest(query="purple dragon statue", kind="landmark", allowGenerate=True))["status"] == "pending"


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
    client = TestClient(create_app(llm=None, cache_dir=tmp_path / "c", assets=svc))
    body = client.post("/api/assets/resolve", json={"query": "wooden cottage"}).json()
    assert body["source"] == "library" and body["url"].startswith("/files/library/")
    assert client.get(body["url"]).content == b"glTFhouse"
    assert client.post("/api/assets/resolve", json={"query": "purple dragon"}).json() == {"status": "none"}
    assert client.get("/api/assets/jobs/nope").json() == {"status": "none"}


def test_resolve_is_rate_limited(tmp_path):
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [])
    client = TestClient(create_app(llm=None, cache_dir=tmp_path / "c", limiter=RateLimiter(per_ip=1), assets=svc))
    assert client.post("/api/assets/resolve", json={"query": "wooden cottage"}).status_code == 200
    assert client.post("/api/assets/resolve", json={"query": "wooden cottage"}).status_code == 429
