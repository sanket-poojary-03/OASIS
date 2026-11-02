# Credits

## 3D art (one CC0 family)

| Pack | Author | Where | License | Used for |
|---|---|---|---|---|
| Stylized Nature MegaKit | Quaternius | https://quaternius.com/packs/stylizednaturemegakit.html | CC0 1.0 | trees, pines, bushes, rocks, flowers |
| Medieval Village MegaKit | Quaternius | https://quaternius.com/packs/medievalvillagemegakit.html | CC0 1.0 | house prefabs, well, market stall, village props |
| Ultimate Animated Animal Pack | Quaternius | https://quaternius.com/packs/ultimateanimatedanimals.html | CC0 1.0 | deer, rabbits and other animated wildlife |
| KayKit Adventurers | Kay Lousberg (KayKit) | https://kaylousberg.itch.io/kaykit-adventurers | CC0 1.0 | the animated third-person player |

The team adds the packs to the repository: it downloads them, copies the chosen models into `backend/assets/library/`
and runs `python scripts/build_manifest.py`. Until a model is there, its object, tree, animal or player is drawn with a
procedural fallback shape. CC0 needs no attribution; we credit the authors anyway.

## Models found while you play

Objects that are not in the library can be fetched online through Poly Pizza or Sketchfab. Only CC0 and CC-BY models
are accepted (never NC, ND or SA). Each one is credited per model in the in-game place card (author, license and
source), because CC-BY requires attribution. Models made with Meshy text-to-3D (optional, landmarks only) are labelled
"Generated with Meshy" in the same card.

## Software

three.js (MIT), Rapier / @dimforge/rapier3d-compat (Apache-2.0), simplex-noise (MIT), Zod (MIT), Vite (MIT),
FastAPI (MIT), Pydantic (MIT), httpx (BSD-3-Clause), Uvicorn (BSD-3-Clause).
