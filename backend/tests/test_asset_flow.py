"""The finder's full order: analyse, library, online + vision over several search terms, Meshy for landmarks, then manual."""
import base64
import json
from pathlib import Path

import httpx
import pytest

from app.asset_analyse import Analysis, RequestAnalyser
from app.asset_procedural import PartsDesigner, ProceduralModel
from app.asset_sources import PolyPizzaFinder, SketchfabFinder
from app.asset_vision import Verdict, VisionPicker
from app.assets import AssetService, ModelCache, default_pick
from app.schemas import AssetRequest

from .test_assets import FakeFinder, FakeMeshy, cand, make_lib

FIXTURE = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "assets" / "procedural-lighthouse.json"
PARTS = json.loads(FIXTURE.read_text(encoding="utf-8"))
WEBP = b"RIFF\x10\x00\x00\x00WEBPVP8 "


def thumbed(title, **kw):
    c = cand(title, **kw)
    c.thumbnail = f"https://img/{title.replace(' ', '-')}.webp"
    return c


class Vision:
    """Answers per search: a Verdict, or None for "the vision model could not say"."""
    uses_llm = True

    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, request, cands):
        self.calls.append((request, [c.title for c in cands]))
        return self.answers.pop(0) if self.answers else Verdict([])


class Designer:
    uses_llm = True

    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def __call__(self, query, color=None):
        self.calls.append((query, color))
        if self.fail:
            raise ValueError("no usable parts")
        return PARTS


def service(tmp_path, finders=(), **kw):
    kw.setdefault("spawn", lambda f, *a: f(*a))
    return AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), list(finders), **kw)


def analysed(search, *alts, plain=False, color=None):
    return lambda q: Analysis(search=search, alternatives=list(alts), plain_shape=plain, color=color)


def finish(svc, out):
    return svc.job(out["jobId"]) if out["status"] == "pending" else out


def test_the_vision_verdict_decides_not_the_title(tmp_path):
    f = FakeFinder("Poly Pizza", [thumbed("Light Cube"), thumbed("Stone Cube")])
    vision = Vision(Verdict([(1, False)]))
    out = service(tmp_path, [f], vision=vision).resolve(AssetRequest(query="cube"))
    assert out["credit"].startswith("Stone Cube by")
    assert vision.calls == [("cube", ["Light Cube", "Stone Cube"])]


def test_every_term_is_judged_against_the_original_request(tmp_path):
    f = FakeFinder("Poly Pizza", [thumbed("Lighthouse"), thumbed("Signal Beacon")])
    vision = Vision(Verdict([]), Verdict([(0, False)]))
    svc = service(tmp_path, [f], vision=vision, analyse=analysed("lighthouse", "signal beacon"))
    out = svc.resolve(AssetRequest(query="red lighthouse", kind="landmark"))
    assert out["credit"].startswith("Signal Beacon by")
    assert [c[0] for c in vision.calls] == ["red lighthouse", "red lighthouse"]


def test_alternatives_run_before_meshy(tmp_path):
    f = FakeFinder("Poly Pizza", [thumbed("Signal Beacon")])
    meshy = FakeMeshy()
    svc = service(tmp_path, [f], meshy=meshy, vision=Vision(Verdict([(0, False)])), analyse=analysed("lighthouse", "signal beacon"))
    assert svc.resolve(AssetRequest(query="red lighthouse", kind="landmark", allowGenerate=True))["status"] == "ready"
    assert meshy.created == []


def test_right_object_wrong_colour_keeps_the_model_and_asks_for_a_tint(tmp_path):
    f = FakeFinder("Poly Pizza", [thumbed("Lighthouse")])
    svc = service(tmp_path, [f], vision=Vision(Verdict([(0, True)])), analyse=analysed("lighthouse", color="#cc2222"))
    out = svc.resolve(AssetRequest(query="red lighthouse"))
    assert out["status"] == "ready" and out["tint"] == "#cc2222"
    assert svc.resolve(AssetRequest(query="red lighthouse"))["tint"] == "#cc2222"  # kept in the cache


def test_a_matching_colour_is_not_tinted(tmp_path):
    f = FakeFinder("Poly Pizza", [thumbed("Lighthouse")])
    svc = service(tmp_path, [f], vision=Vision(Verdict([(0, False)])), analyse=analysed("lighthouse", color="#cc2222"))
    assert "tint" not in svc.resolve(AssetRequest(query="red lighthouse"))


def test_vision_down_uses_strict_title_matching(tmp_path):
    f = FakeFinder("Poly Pizza", [thumbed("Light Cube"), thumbed("Lighthouse")])
    svc = service(tmp_path, [f], vision=Vision(None))
    assert svc.resolve(AssetRequest(query="lighthouse"))["credit"].startswith("Lighthouse by")
    f2 = FakeFinder("Poly Pizza", [thumbed("Light Cube")])
    assert default_pick("red cube", f2.results) == -1


def test_title_fallback_needs_the_head_noun_and_no_other_object_words():
    assert default_pick("red cube", [cand("Light Cube")]) == -1
    assert default_pick("cube", [cand("Light Cube")]) == -1
    assert default_pick("red lighthouse", [cand("Lighthouse")]) == 0
    assert default_pick("metro station", [cand("Station Building")]) == 0
    assert default_pick("lighthouse", [cand("House"), cand("Lighthouse")]) == 1


def test_sources_are_compared_together(tmp_path):
    poly = FakeFinder("Poly Pizza", [thumbed("Giraffe plush")])
    sketch = FakeFinder("Sketchfab", [thumbed("Giraffe", src="Sketchfab")])
    vision = Vision(Verdict([(1, False)]))
    out = service(tmp_path, [poly, sketch], vision=vision).resolve(AssetRequest(query="giraffe"))
    assert vision.calls[0][1] == ["Giraffe plush", "Giraffe"]
    assert "Sketchfab" in out["credit"] and poly.downloads == 0


def test_a_rejected_shape_falls_to_the_next_approved_model(tmp_path):
    class Broken(FakeFinder):
        def download(self, c, dest):
            if c.title == "Giraffe big":
                raise ValueError("too large")
            super().download(c, dest)

    f = Broken("Poly Pizza", [thumbed("Giraffe big"), thumbed("Giraffe")])
    out = service(tmp_path, [f], vision=Vision(Verdict([(0, False), (1, False)]))).resolve(AssetRequest(query="giraffe"))
    assert out["credit"].startswith("Giraffe by")


def test_plain_shapes_skip_the_search(tmp_path):
    f = FakeFinder("Poly Pizza", [thumbed("Cube")])
    vision, designer = Vision(), Designer()
    svc = service(tmp_path, [f], vision=vision, designer=designer, analyse=analysed("cube", plain=True, color="#cc2222"))
    out = finish(svc, svc.resolve(AssetRequest(query="red cube", allowGenerate=True)))
    assert out["status"] == "ready" and out["source"] == "procedural" and out["parts"] == PARTS
    assert vision.calls == [] and f.downloads == 0 and designer.calls == [("red cube", "#cc2222")]
    assert "notices" not in out


def test_no_meshy_key_tells_the_player_then_builds_manually(tmp_path):
    svc = service(tmp_path, designer=Designer())
    out = svc.resolve(AssetRequest(query="giant robot", kind="landmark", allowGenerate=True))
    assert out["status"] == "pending"
    assert out["notices"] == ["Meshy API key is missing", "Building giant robot manually"]
    done = svc.job(out["jobId"])
    assert done["source"] == "procedural" and done["notices"] == out["notices"]


def test_no_meshy_credits_tells_the_player_then_builds_manually(tmp_path):
    svc = service(tmp_path, meshy=FakeMeshy(), max_generations=0, designer=Designer())
    out = svc.resolve(AssetRequest(query="giant robot", kind="landmark", allowGenerate=True))
    assert out["notices"] == ["Meshy has no credits left", "Building giant robot manually"]


def test_meshy_is_waited_for_with_no_procedural_model_first(tmp_path):
    held = []
    meshy, designer = FakeMeshy(), Designer()
    svc = service(tmp_path, meshy=meshy, designer=designer, spawn=lambda f, *a: held.append((f, a)))
    out = svc.resolve(AssetRequest(query="giant robot", kind="landmark", allowGenerate=True))
    assert out == {"status": "pending", "jobId": out["jobId"]}
    assert designer.calls == []  # nothing shown while Meshy works
    f, a = held[0]
    f(*a)
    assert svc.job(out["jobId"])["source"] == "generated" and designer.calls == []


@pytest.mark.parametrize("error, notice", [
    (RuntimeError("boom"), "Meshy could not make giant robot"),
    (httpx.HTTPStatusError("no", request=httpx.Request("POST", "https://x"), response=httpx.Response(402)), "Meshy has no credits left"),
    (httpx.HTTPStatusError("no", request=httpx.Request("POST", "https://x"), response=httpx.Response(401)), "Meshy API key was rejected"),
])
def test_a_failed_meshy_job_builds_manually(tmp_path, error, notice):
    class Failing(FakeMeshy):
        def wait(self, task_id):
            raise error

    svc = service(tmp_path, meshy=Failing(), designer=Designer())
    out = svc.job(svc.resolve(AssetRequest(query="giant robot", kind="landmark", allowGenerate=True))["jobId"])
    assert out["source"] == "procedural" and out["notices"] == [notice, "Building giant robot manually"]


def test_only_landmarks_use_meshy(tmp_path):
    meshy, designer = FakeMeshy(), Designer()
    svc = service(tmp_path, meshy=meshy, designer=designer)
    out = svc.resolve(AssetRequest(query="old barrel thing", kind="prop", allowGenerate=True))
    assert meshy.created == [] and out["notices"] == ["Building old barrel thing manually"]


def test_invalid_design_shows_nothing_and_says_so(tmp_path):
    svc = service(tmp_path, designer=Designer(fail=True))
    out = svc.job(svc.resolve(AssetRequest(query="giant robot", kind="prop", allowGenerate=True))["jobId"])
    assert out["status"] == "none" and out["notices"][-1] == "Could not build giant robot"


def test_a_design_is_cached_like_a_model(tmp_path):
    designer = Designer()
    svc = service(tmp_path, designer=designer)
    svc.resolve(AssetRequest(query="giant robot", kind="prop", allowGenerate=True))
    again = svc.resolve(AssetRequest(query="robot giant", kind="prop", allowGenerate=True))
    assert again["status"] == "ready" and again["parts"] == PARTS and len(designer.calls) == 1
    assert "notices" not in again  # a cached result has nothing new to announce


def test_unverified_cache_entries_are_checked_again(tmp_path):
    cache = ModelCache(tmp_path / "gen")
    key = cache.key("red cube")
    (cache.root / f"{key}.glb").write_bytes(b"glTF")
    cache.add(key, "red cube", f"{key}.glb", "online", "Light Cube by Q")  # as every old entry is: no verdict
    f = FakeFinder("Poly Pizza", [thumbed("Red Cube")])
    vision = Vision(Verdict([(0, False)]))
    svc = AssetService(make_lib(tmp_path), cache, [f], vision=vision)
    assert svc.resolve(AssetRequest(query="red cube"))["credit"].startswith("Red Cube by")
    calls = len(vision.calls)
    assert svc.resolve(AssetRequest(query="red cube"))["credit"].startswith("Red Cube by")
    assert len(vision.calls) == calls  # approved now: free from here on


def test_an_old_cache_entry_is_still_served_when_the_budget_is_spent(tmp_path):
    cache = ModelCache(tmp_path / "gen")
    key = cache.key("red cube")
    (cache.root / f"{key}.glb").write_bytes(b"glTF")
    cache.add(key, "red cube", f"{key}.glb", "online", "Light Cube by Q")
    svc = AssetService(make_lib(tmp_path), cache, [FakeFinder("Poly Pizza", [])], vision=Vision())
    assert svc.resolve(AssetRequest(query="red cube"), pick_gate=lambda: False)["status"] == "ready"


def test_search_stops_when_its_time_is_up(tmp_path):
    f = FakeFinder("Poly Pizza", [thumbed("Lighthouse"), thumbed("Signal Beacon")])
    ticks = iter([0, 100, 100, 100, 100])
    vision = Vision(Verdict([]), Verdict([(0, False)]))
    svc = service(tmp_path, [f], vision=vision, analyse=analysed("lighthouse", "signal beacon"), clock=lambda: next(ticks))
    assert svc.resolve(AssetRequest(query="red lighthouse")) == {"status": "none"}
    assert len(vision.calls) == 0


# Analysis ---------------------------------------------------------------------------------------------------------------

class FakeLLM:
    timeout, retries, max_tokens, reasoning_effort = 30.0, 3, 8000, ""

    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def complete(self, system, user, **kw):
        self.calls.append((system, user))
        a = self.answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a


def test_analyser_cleans_the_answer():
    llm = FakeLLM('{"search": "Lighthouse", "plainShape": false, "color": "#CC2222", "alternatives": ["Coastal Lighthouse", "lighthouse", "", "signal beacon", "a", "lighthouse building", "extra"]}')
    a = RequestAnalyser(llm)("red lighthouse")
    assert a.search == "lighthouse" and a.color == "#cc2222" and not a.plain_shape
    assert a.alternatives == ["coastal lighthouse", "signal beacon", "lighthouse building"]


def test_analyser_rejects_a_bad_colour_and_survives_a_failure():
    a = RequestAnalyser(FakeLLM('{"search": "cube", "plainShape": true, "color": "red"}'))("red cube")
    assert a.plain_shape and a.color is None
    a = RequestAnalyser(FakeLLM(RuntimeError("busy")))("old red cube")
    assert a == Analysis(search="old red cube")


def test_analysis_is_asked_once_per_request(tmp_path):
    asked = []

    def analyse(q):
        asked.append(q)
        return Analysis(search=q)

    svc = service(tmp_path, analyse=analyse)
    svc.resolve(AssetRequest(query="purple dragon"))
    svc.resolve(AssetRequest(query="purple dragon"))
    assert asked == ["purple dragon"]


# Vision -----------------------------------------------------------------------------------------------------------------

def image_transport(missing=()):
    def handler(req):
        if any(m in str(req.url) for m in missing):
            return httpx.Response(404)
        return httpx.Response(200, content=WEBP)
    return httpx.MockTransport(handler)


def test_vision_sends_inline_images_labelled_by_their_bytes():
    llm = FakeLLM('{"seen": ["a lamp", "a cube"], "verdicts": ["no", "exact"], "best": 1}')
    v = VisionPicker(llm, transport=image_transport())("cube", [thumbed("Light Cube"), thumbed("Stone Cube")])
    assert v == Verdict([(1, False)])
    parts = llm.calls[0][1]
    assert parts[0]["type"] == "text" and "cube" in parts[0]["text"]
    url = parts[1]["image_url"]["url"]
    assert url == "data:image/webp;base64," + base64.b64encode(WEBP).decode()


def test_vision_code_decides_a_no_can_never_win():
    llm = FakeLLM('{"verdicts": ["no", "right_object_wrong_colour", "exact"], "best": 0}')
    v = VisionPicker(llm, transport=image_transport())("cube", [thumbed("A"), thumbed("B"), thumbed("C")])
    assert v == Verdict([(2, False), (1, True)])


def test_vision_keeps_indexes_when_a_thumbnail_is_missing():
    llm = FakeLLM('{"verdicts": ["exact"], "best": 0}')
    v = VisionPicker(llm, transport=image_transport(missing=["Broken"]))("cube", [thumbed("Broken"), thumbed("Good")])
    assert v == Verdict([(1, False)])


@pytest.mark.parametrize("answer", [RuntimeError("down"), "not json", '{"verdicts": ["exact"], "best": 0}'])
def test_vision_that_cannot_say_returns_none(answer):
    # Unreadable, or a verdict for one of the two candidates: never guess which.
    v = VisionPicker(FakeLLM(answer), transport=image_transport())("cube", [thumbed("A"), thumbed("B")])
    assert v is None


def test_vision_with_no_images_returns_none():
    llm = FakeLLM()
    assert VisionPicker(llm, transport=image_transport())("cube", [cand("No thumbnail")]) is None
    assert llm.calls == []


# Sources ----------------------------------------------------------------------------------------------------------------

def test_finders_read_thumbnails():
    pp = httpx.MockTransport(lambda r: httpx.Response(200, json={"results": [
        {"Title": "G", "Download": "https://c/g.glb", "Licence": "CC0", "Thumbnail": "https://img/g.webp"}]}))
    assert PolyPizzaFinder("k", transport=pp).search("g")[0].thumbnail == "https://img/g.webp"
    sf = httpx.MockTransport(lambda r: httpx.Response(200, json={"results": [
        {"name": "G", "uid": "u", "license": {"label": "CC0"}, "thumbnails": {"images": [
            {"url": "https://img/big.jpg", "width": 1024}, {"url": "https://img/mid.jpg", "width": 256}, {"url": "https://img/tiny.jpg", "width": 64}]}}]}))
    assert SketchfabFinder("t", transport=sf).search("g")[0].thumbnail == "https://img/mid.jpg"


# Procedural -------------------------------------------------------------------------------------------------------------

def test_the_shared_fixture_is_valid():
    assert ProceduralModel.model_validate({"parts": PARTS})


@pytest.mark.parametrize("bad", [
    {"parts": []},
    {"parts": [{"shape": "script", "at": [0, 0, 0], "size": [1, 1, 1], "color": "#ffffff"}]},
    {"parts": [{"shape": "box", "at": [0, 0, 0], "size": [1, 1, 1], "color": "red"}]},
    {"parts": [{"shape": "box", "at": [0, 0], "size": [1, 1, 1], "color": "#ffffff"}]},
    {"parts": [{"shape": "box", "at": [0, 0, 0], "size": [0, 1, 1], "color": "#ffffff"}]},
    {"parts": [{"shape": "box", "at": [0, 0, 0], "size": [1, 1, 1], "color": "#ffffff", "code": "x"}]},
])
def test_a_design_is_data_with_limits(bad):
    with pytest.raises(ValueError):
        ProceduralModel.model_validate(bad)


def test_designer_retries_once_then_gives_up():
    good = json.dumps({"parts": PARTS})
    assert PartsDesigner(FakeLLM("not json", good))("lighthouse") == PARTS
    with pytest.raises(ValueError):
        PartsDesigner(FakeLLM("not json", '{"parts": []}'))("lighthouse")


def test_designer_is_told_the_colour():
    llm = FakeLLM(json.dumps({"parts": PARTS}))
    PartsDesigner(llm)("red cube", "#cc2222")
    assert "#cc2222" in llm.calls[0][1]


# The caller's limits -----------------------------------------------------------------------------------------------------

def test_a_library_only_request_costs_nothing_and_builds_nothing(tmp_path):
    # The base art (trees, deer, rabbits) asks like this: missing art keeps its built-in fallback.
    asked = []

    def analyse(q):
        asked.append(q)
        return Analysis(search=q)

    designer = Designer()
    svc = service(tmp_path, designer=designer, analyse=analyse)
    assert svc.resolve(AssetRequest(query="rabbit", allowOnline=False, allowGenerate=False)) == {"status": "none"}
    assert asked == [] and designer.calls == []
    assert svc.resolve(AssetRequest(query="stone tower", allowOnline=False, allowGenerate=False))["source"] == "library"


def test_without_allow_generate_nothing_is_built(tmp_path):
    designer = Designer()
    svc = service(tmp_path, designer=designer, analyse=analysed("cube", plain=True))
    assert svc.resolve(AssetRequest(query="red cube", allowGenerate=False)) == {"status": "none"}
    assert designer.calls == []


def test_designer_is_told_a_bare_shape_has_true_proportions():
    from app.asset_procedural import SYSTEM
    assert "same width, height and depth" in SYSTEM
