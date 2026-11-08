# Credits

## 3D art (one CC0 family)

| Pack | Author | Where | License | Used for |
|---|---|---|---|---|
| Stylized Nature MegaKit | Quaternius | https://quaternius.com/packs/stylizednaturemegakit.html | CC0 1.0 | trees, pines, bushes, rocks, flowers |
| Medieval Village MegaKit | Quaternius | https://quaternius.com/packs/medievalvillagemegakit.html | CC0 1.0 | house prefabs, well, market stall, village props |
| Ultimate Animated Animal Pack | Quaternius | https://quaternius.com/packs/ultimateanimatedanimals.html | CC0 1.0 | deer, rabbits and other animated wildlife |
| Adventurer, Astronaut, Hooded Adventurer (animated) | Quaternius | https://poly.pizza/u/Quaternius | CC0 1.0 | bundled in `web/public/models/characters/` but no longer worn |
| Street, Tourist, Builder, Police, Woman (animated) | Microsoft Rocketbox, https://github.com/microsoft/Microsoft-Rocketbox | MIT (Copyright (c) 2020 Microsoft; notice in `web/public/models/characters/ROCKETBOX-LICENSE.md`) | the playable characters (B switches), avatars and clips converted by `scripts/convert_rocketbox.mjs` |
| Sports Car | Quaternius | https://poly.pizza/u/Quaternius | CC0 1.0 | the driveable car, bundled in `web/public/models/vehicles/` |

The team adds the packs to the repository: it downloads them, copies the chosen models into `backend/assets/library/`
and runs `python scripts/build_manifest.py`. Until a model is there, its object, tree or animal is drawn with a procedural
fallback shape. The characters and the car are bundled with the web app, so they work without the backend. CC0 needs no attribution; we credit the authors anyway.

## The built-in model library

`backend/assets/library/quaternius/`: 186 CC0 models by Quaternius, downloaded from Poly Pizza
(https://poly.pizza/u/Quaternius) and tagged by `backend/scripts/curate_library.py`: Stylized Nature trees, pines,
bushes, rocks and flowers; medieval, farm, modern, sci-fi and cyberpunk buildings; props; boats, ships, cars, trains
and spaceships; an animated deer. Each manifest entry records its Poly Pizza id. CC0 needs no attribution; we credit
Quaternius anyway.

## Models found while you play

Objects that are not in the library can be fetched online through Poly Pizza or Sketchfab. Only CC0 and CC-BY models
are accepted (never NC, ND or SA). Each one is credited per model in the in-game place card (author, license and
source), because CC-BY requires attribution. Models made with Meshy text-to-3D (optional, landmarks only) are labelled
"Generated with Meshy" in the same card.

## Models on the start screen

The world behind the start screen ships with the site (`web/public/models/bundled/`). It uses library models by Quaternius
(CC0, above), plus three models under CC-BY 3.0, found through Poly Pizza (https://poly.pizza):

- **Cow** by Poly by Google (CC-BY 3.0)
- **Sheep** by Poly by Google (CC-BY 3.0)
- **Fountain** by Poly by Google (CC-BY 3.0)

## Software

three.js (MIT), Rapier / @dimforge/rapier3d-compat (Apache-2.0), simplex-noise (MIT), Zod (MIT), Vite (MIT),
FastAPI (MIT), Pydantic (MIT), httpx (BSD-3-Clause), Uvicorn (BSD-3-Clause).

## Interface

- Thinking orb: [thinking-orbs](https://libraries.dev/orbs) by Jakub Antalik, MIT License. Copyright (c) 2026 Jakub Antalik.
