"""Scores the model finder on live search results: the old title-only pick against the vision check.

    cd backend && python scripts/eval_finder.py [--models glm5.3-flash,gemma4] [--limit 100]

Costs a few LLM calls per request. `tests/data/finder_eval.json` lists requests with a regex of acceptable titles: a stand-in
for looking at each model, so a title that fits is not proof the model is right, and the numbers compare methods, nothing more.
- right: picked a model whose title fits.
- wrong: picked one whose title does not fit (the Light Cube bug).
- missed: picked nothing though a fitting title was in the results. Softer than wrong: it may have looked wrong for a good reason.
- declined: picked nothing and no title fitted. The correct outcome.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

from app.asset_analyse import RequestAnalyser  # noqa: E402
from app.asset_match import LLMPicker, scene_like  # noqa: E402
from app.asset_sources import PolyPizzaFinder, SketchfabFinder, license_ok  # noqa: E402
from app.asset_vision import VisionPicker  # noqa: E402
from app.llm import LLMClient  # noqa: E402


def score(titles: list[str], picked: str | None, accept: re.Pattern) -> str:
    if picked is not None:
        return "right" if accept.search(picked) else "wrong"
    return "missed" if any(accept.search(t) for t in titles) else "declined"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="glm5.3-flash,gemma4")
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    load_dotenv(BACKEND / ".env")
    llm = LLMClient.from_env()
    if not llm or not os.getenv("POLY_PIZZA_KEY"):
        sys.exit("needs LLM_API_KEY and POLY_PIZZA_KEY in backend/.env")
    finders = [PolyPizzaFinder(os.environ["POLY_PIZZA_KEY"])]
    if os.getenv("SKETCHFAB_TOKEN"):
        finders.append(SketchfabFinder(os.environ["SKETCHFAB_TOKEN"]))
    analyse, title_pick = RequestAnalyser(llm), LLMPicker(llm)
    visions = {}
    for m in args.models.split(","):
        os.environ["VISION_MODEL"] = m
        visions[m] = VisionPicker(llm.for_vision())

    def search(term: str, query: str) -> list:
        out = []
        for f in finders:
            try:
                out += [c for c in f.search(term) if license_ok(c.license) and (c.tris is None or c.tris <= 30000) and not scene_like(c.title, f"{term} {query}")][:5]
            except Exception as e:  # noqa: BLE001
                print(f"  search failed for {term!r}: {e}", file=sys.stderr)
        return out

    def one(case: list[str]) -> dict:
        query, pattern = case
        accept = re.compile(pattern, re.I)
        row: dict = {"query": query}
        raw = search(query, query)
        i = title_pick(query, raw) if raw else -1
        row["old"] = {"picked": raw[i].title if i >= 0 else None, "outcome": score([c.title for c in raw], raw[i].title if i >= 0 else None, accept)}
        a = analyse(query)
        row["analysis"] = {"search": a.search, "alternatives": a.alternatives, "plain": a.plain_shape, "color": a.color}
        pools = [(t, search(t, query)) for t in dict.fromkeys([a.search, *a.alternatives])]
        seen = sorted({c.title for _, p in pools for c in p})
        for model, vision in visions.items():
            t0, picked, unsure, verdicts = time.time(), None, 0, 0
            for _, pool in pools:
                if not pool:
                    continue
                v = vision(query, pool)
                verdicts += 1
                if v is None:
                    unsure += 1
                elif v.order:
                    picked = pool[v.order[0][0]].title
                    break
            row[model] = {"picked": picked, "outcome": score(seen, picked, accept), "seconds": round(time.time() - t0, 1), "unsure": unsure, "calls": verdicts}
        return row

    cases = json.loads((BACKEND / "tests/data/finder_eval.json").read_text(encoding="utf-8"))[: args.limit]
    with ThreadPoolExecutor(5) as pool:
        rows = list(pool.map(one, cases))

    methods = ["old", *visions]
    print(f"\n{len(rows)} requests")
    print(f"{'method':24s} {'right':>6s} {'wrong':>6s} {'missed':>7s} {'declined':>9s} {'unsure':>7s} {'avg s':>6s}")
    for m in methods:
        c = {k: sum(r[m]["outcome"] == k for r in rows) for k in ("right", "wrong", "missed", "declined")}
        secs = [r[m]["seconds"] for r in rows if "seconds" in r[m]]
        print(f"{m:24s} {c['right']:6d} {c['wrong']:6d} {c['missed']:7d} {c['declined']:9d} {sum(r[m].get('unsure', 0) for r in rows):7d} {(sum(secs) / len(secs) if secs else 0):6.1f}")
    for m in methods:
        print(f"\n{m}: wrong")
        for r in rows:
            if r[m]["outcome"] == "wrong":
                print(f"  {r['query']!r} -> {r[m]['picked']!r}")
    print(f"\nplain shapes: {[r['query'] for r in rows if r['analysis']['plain']]}")
    if args.out:
        Path(args.out).write_text(json.dumps(rows, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
