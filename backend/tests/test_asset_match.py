import json

from app.asset_match import LLMAlternatives, glb_size, shape_ok
from app.assets import AssetService, ModelCache
from app.schemas import AssetRequest

from .test_assets import FakeFinder, FakeMeshy, cand, make_lib


def glb(w, h, d):
    """A minimal .glb whose one mesh spans w x h x d (glb_size reads only the JSON chunk)."""
    doc = {"scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}], "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
           "accessors": [{"min": [-w / 2, 0, -d / 2], "max": [w / 2, h, d / 2], "count": 8, "type": "VEC3", "componentType": 5126}]}
    body = json.dumps(doc).encode()
    body += b" " * (-len(body) % 4)
    return b"glTF" + (2).to_bytes(4, "little") + (20 + len(body)).to_bytes(4, "little") + len(body).to_bytes(4, "little") + b"JSON" + body


class ShapedFinder(FakeFinder):
    def __init__(self, name, results, shapes):
        super().__init__(name, results)
        self.shapes = shapes

    def download(self, c, dest):
        self.downloads += 1
        dest.write_bytes(glb(*self.shapes[c.title]))


def test_glb_size_and_shape_check(tmp_path):
    assert glb_size(glb(2, 3, 4)) == (2, 3, 4)
    assert glb_size(b"glTF garbage") is None
    flat, tall = tmp_path / "flat.glb", tmp_path / "tall.glb"
    flat.write_bytes(glb(1, 0.05, 1))
    tall.write_bytes(glb(6, 5, 4))
    assert not shape_ok(flat, "structure") and not shape_ok(flat, "landmark")
    assert shape_ok(flat, "prop") and shape_ok(tall, "structure")


def test_flat_download_is_rejected_for_a_building_and_the_next_one_is_used(tmp_path):
    f = ShapedFinder("Poly Pizza", [cand("Metro Station Cover"), cand("Station Building")],
                     {"Metro Station Cover": (1, 0.05, 1), "Station Building": (6, 5, 4)})
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [f])
    out = svc.resolve(AssetRequest(query="metro station", kind="structure"))
    assert out["status"] == "ready" and "Station Building" in out["credit"]
    assert not list((tmp_path / "gen").glob("*.part"))


def test_a_flat_prop_is_fine(tmp_path):
    g = ShapedFinder("Poly Pizza", [cand("Rug")], {"Rug": (2, 0.02, 1.5)})
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [g])
    assert svc.resolve(AssetRequest(query="rug", kind="prop"))["status"] == "ready"


def test_alternative_search_words_are_tried_before_generating_and_the_answer_is_cached(tmp_path):
    f = FakeFinder("Poly Pizza", [cand("Subway Entrance")])
    asked = []

    def alts(q):
        asked.append(q)
        return ["subway entrance", "train station"]

    meshy = FakeMeshy()
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [f], meshy=meshy, alternatives=alts)
    out = svc.resolve(AssetRequest(query="metro station", kind="structure", allowGenerate=True))
    assert out["status"] == "ready" and "Subway Entrance" in out["credit"]
    assert meshy.created == []
    assert svc.resolve(AssetRequest(query="metro station", kind="structure", allowGenerate=True))["status"] == "ready"
    assert asked == ["metro station"]  # the second time comes from the cache


def test_alternatives_can_land_in_the_library(tmp_path):
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [], alternatives=lambda q: ["stone tower"])
    out = svc.resolve(AssetRequest(query="lighthouse", kind="landmark"))
    assert out["status"] == "ready" and out["source"] == "library" and "tower" in out["url"]


def test_nothing_anywhere_then_generate_any_kind(tmp_path):
    meshy = FakeMeshy()
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [], meshy=meshy, alternatives=lambda q: [], spawn=lambda f, *a: f(*a))
    assert svc.resolve(AssetRequest(query="purple dragon", kind="prop", allowGenerate=False)) == {"status": "none"}
    for kind in ("prop", "structure", "settlement", "landmark"):
        assert svc.resolve(AssetRequest(query=f"purple {kind} thing", kind=kind, allowGenerate=True))["status"] in ("pending", "ready")
    assert len(meshy.created) == 4


class FakeLLMPick:
    uses_llm = True

    def __init__(self, answer):
        self.answer, self.calls = answer, []

    def __call__(self, query, cands):
        self.calls.append((query, [c.title for c in cands]))
        return self.answer


def test_partial_library_matches_are_confirmed_by_the_ai_exact_ones_are_not(tmp_path):
    no = FakeLLMPick(-1)
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [], pick=no)
    assert svc.resolve(AssetRequest(query="glass tower", kind="landmark"))["status"] == "none"  # a stone tower is not a glass tower
    assert no.calls and "tower" in no.calls[0][1][0]
    assert svc.resolve(AssetRequest(query="glass tower", kind="landmark"))["status"] == "none"
    assert len(no.calls) == 1  # the verdict is remembered
    assert svc.resolve(AssetRequest(query="stone tower", kind="landmark"))["source"] == "library"  # exact: nothing to ask
    assert len(no.calls) == 1
    yes = FakeLLMPick(0)
    (tmp_path / "c").mkdir()
    svc2 = AssetService(make_lib(tmp_path / "c"), ModelCache(tmp_path / "gen3"), [], pick=yes)
    assert svc2.resolve(AssetRequest(query="old tower", kind="landmark"))["source"] == "library"


def test_llm_alternatives_parses_and_cleans():
    class LLM:
        timeout, retries, max_tokens = 30.0, 3, 8000

        def complete(self, system, user, **kw):
            return '{"queries": ["Subway Entrance", "metro station", "", "train station", "station building", "extra"]}'

    assert LLMAlternatives(LLM())("metro station") == ["subway entrance", "train station", "station building"]

    class Broken(LLM):
        def complete(self, system, user, **kw):
            raise RuntimeError("busy")

    assert LLMAlternatives(Broken())("x y") == []
