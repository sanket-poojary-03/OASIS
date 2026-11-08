# OASIS: session handoff (2026-11-06)

Read this first in a new session, together with `CLAUDE.md`. The full decision log is `docs/DECISIONS.md` (newest entries: `## 2026-11-05`). The project was renamed **WorldSeed → OASIS** on 2026-11-04 (user-facing names only; the branch, spec and plan file names keep `worldseed`).

**Deadline: 2026-11-11 16:30 CEST.**

## Newest work (2026-11-08): recipe `flora`, the AI names what grows
- **What:** an optional `flora` list (up to 8 `{asset, layer: canopy|shrub|ground|rock, density 0-2, spot}`) and a `setFlora` edit op, in both schemas. Each plant replaces the preset kinds of its layer. The biome still decides how much grows where; a layer it did not name keeps its preset plants. Models come from the **library only** (`loadFlora` in `render/artLoader.ts`); a plant the library lacks grows as its layer's preset kind and the player is told. Reasons: `docs/DECISIONS.md`, entry "Recipe flora".
- **Guard:** `web/tests/world/golden.test.ts` hashes what the 4 fixture worlds draw. A world without `flora` must stay exactly that.
- **Deploy order:** the browser's recipe schema is strict, so an old frontend rejects a world with `flora` (and a `setFlora` edit). **Deploy the frontend (Vercel) before, or with, the backend (Render).**
- **Checked live** (headless Chrome over CDP, port 8001 backend with the new code, because the 8000 one was started without `--reload`): a haunted swamp (twisted and dead trees, mushrooms), an alien planet (glowing and spiral alien trees in patches on purple ground), an ordinary valley (willows; "alder tree" fell back to oaks), and a fixture without flora (unchanged).

## Earlier work (2026-11-07)
Start screen rebuilt: `web/src/ui/showcase.ts` (one world: village and city), `web/src/ui/menuFlight.ts` (camera and clock), `web/public/menu-poster.webp` (shown until the live world is ready). The reasons and the general generator fixes are in `docs/DECISIONS.md`, entry "The start screen's world".
- **After changing the menu's world:** run `node scripts/bundle_models.mjs` (backend up) if it asks for new models, and retake the poster: a 2160×900 capture at the first beat from `MENU_START_ANGLE`.
- **Testing in Chrome automation:** an unfocused tab gets about 1 frame a second, and a minimized window reports `innerWidth` 0 (which also selects the low-tier view distance). Do not read load times or frame rates from it without saying so.
- **Backend restart on Windows:** port 8000 can be held by a `multiprocessing` child of the process you stopped. Stop that too.
- **Floating models, invisible walls, resolution menu (R):** `render/fit.ts` (`drawnBox`), `world/groundPose.ts`, `render/meshCollider.ts`, `render/resolution.ts`, `ui/resolutionMenu.ts`. Reasons and measurements: `docs/DECISIONS.md`, last entry. Never size a model with plain `setFromObject`: it overstates anything tipped inside its file.

- **Water reaches its shores (not committed):** `world/waterSheet.ts` draws rivers and lakes as one sheet on the terrain grid. Banks and lakes no longer raise land out of the sea. Reasons and measurements: `docs/DECISIONS.md`, entry "Water reaches its shores".

- **Roads and canyons (not committed):** a road crosses a gap in the land on a high span from lip to lip, stops at cliffs, and a city's streets stop at them too. `world/roads.ts` (`spansGap`, `CLIFF`, `WALL`), `render/roads.ts` (piers, `deckSurface`), `logic/vehicles.ts`. Cars now cross all bridges. Reasons and measurements: `docs/DECISIONS.md`, entry "Roads and canyons".

- **Roads stay off the water (not committed):** crossings are real bridges (`render/roads.ts`), one straight span each, and the road network avoids them. Cars still stop at water, so they cannot use a bridge. Reasons: `docs/DECISIONS.md`, entry "Roads stay off the water".

## Start here: where things stand
- **Branch:** `feat/worldseed`, 109 commits ahead of `main`. **No git remote yet**, so nothing has been pushed.
- **Latest commit:** `30c4554` "one fixed 1 km map; the AI says what grows and which animals; missing models are found or explained". It is the last thing the user asked for. The fixed map was checked in a headless browser (edge stop and message); the user has not yet generated a world on it.
- **Tests:**
  - Working tree: web vitest 991 passing (2026-11-07), backend pytest 197 passing.
  - The commit `30c4554` alone (without the other session's files): web 463, backend 195.
  - `tsc --noEmit` clean, `npm run build` OK.
- **Running now:**
  - Backend on port 8000, started **without `--reload`**. Restart it by hand after any backend change (`--reload` did not pick up changes).
  - Web dev server on port 5173.
  - Background shell `bp6d6gj3s`, a live check of the parts designer on two Sarvam models. At handoff its output had only "ok". Its output file: `C:\Users\sanke\AppData\Local\Temp\claude\c--Users-sanke-Desktop-VICTORIA\f3694509-d52b-4f29-b23f-ac0d786f0354\tasks\bp6d6gj3s.output`. Stop it with TaskStop if it isn't needed.
- **Uncommitted work from another session (`victoria-fa`) is in the same working tree.** Do not commit it without checking with the user:
  - Modified: `backend/app/{prompts,schemas,service}.py`, `backend/tests/test_service_world.py`, `docs/CREDITS.md`, `docs/DECISIONS.md`, `shared/fixtures/recipes/fishing-valley.json`, `web/package*.json`, `web/src/{app,main,styles.css}`, `web/src/core/recipe.ts`, `web/src/render/{atmosphere,postfx,ripples,worldObjects}.ts`, `web/src/ui/ui.ts`, `web/src/world/{build,placement,props}.ts`, and three web tests.
  - Untracked: `web/public/oasis-logo.webp`, `web/src/render/nightSky.ts`, `web/src/ui/busy.ts`, `web/src/ui/busyWords.ts`, `web/src/world/scenery.ts`, `web/tests/ui/busyWords.test.ts`, `web/tests/world/scenery.test.ts`.
  - Two small edits in those files are mine: `busy.ts` `hold()` returns early when the canvas is 0 px (fixes "Could not build that world" in a background tab), and `scenery.test.ts` exempts finds near a new road.
- **Partial-commit technique (used for 30c4554):** stage HEAD plus my transform with `git hash-object -w --stdin` and `git update-index --cacheinfo`, so the other session's lines are never staged. Check the staged file list before committing. An earlier attempt committed only 3 of the files because a failed staging step did not stop the commit (`ab078f8`); it was undone with `git reset --soft` and redone correctly.
- **Commit trailer:** `CLAUDE.md` says `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Keep that line on commits in this repo.

## Latest session (2026-11-05 to 06): what changed
| Commit | Change |
|---|---|
| e37fa7d | **Animated sea.** three.js `Water.js` (ripples, sun glints, reflections, fades into the sky at the horizon); ripples on rivers and lakes; shore foam that stops at the waterline. Grass and distant trees are left out of the reflection. |
| 1e60d20 | **AI only.** No mock or offline worlds. With no LLM, the player sees "LLM not available" and no world is made. Only 3D models are cached. |
| 5dc0cc5 | **Model finder** (order below). Parts designer, vision picker, library and cache, and a notice queue. `backend/scripts/eval_finder.py` scores it on live requests. |
| d5e6074 | **Water has a body.** Rivers are carved below the water with a bed, bank and blend; lakes form only above the sea; Shift dives. Themed models (pirate, sci-fi, cyberpunk) are asked for only when the theme is named. |
| 30c4554 | **One fixed 1 km map** and **the AI decides nature and animals** (details below). |

### Model finder: the order it tries things (`backend/app/assets.py`)
1. **Library and cache.** The bundled CC0 library, then approved cached models.
2. **LLM analysis** (`asset_analyse.py`): what the object is, its size and colour, and whether it can be found online.
3. **Online search** (Poly Pizza; Sketchfab if `SKETCHFAB_TOKEN` is set), over up to 4 search terms. Each result is checked by a **vision model** (`VISION_MODEL`, default `glm5.3-flash` on Sarvam `/v2`; vision is Sarvam only). The right object in the wrong colour is accepted and recoloured in code (`render/tint.ts`).
4. **Semantic alternatives:** if search fails, the AI suggests other terms (e.g. red lighthouse → coastal lighthouse → beacon tower).
5. **Meshy** (landmarks only, `MESHY_MAX_GENERATIONS=5`). The player waits for it and no stand-in shows first. If there is no key or no credit, a notice says so, then a second notice says "building manually".
6. **Manual build** from AI-written parts (JSON, never code), `asset_procedural.py`.

Current keys: `POLY_PIZZA_KEY` is set. `MESHY_API_KEY` and `SKETCHFAB_TOKEN` are **not** set, so Meshy always reports "key missing" and Sketchfab is skipped. Both are optional.

**Eval (100 live requests, title-scored, which favours the old picker):** old 78 right / 9 wrong / 2 missed / 11 declined; GLM 82 / 11 / 3 / 4.

### Fixed map (30c4554)
- **Size:** 1024 m × 1024 m. `CORE_HALF = 512`, `CHUNK_SIZE = 64`, `CHUNK_RES = 32`, `VIEW = 3`. To change it, change `CORE_HALF` in both schemas, `web/src/core/recipe.ts` and `backend/app/schemas.py`. Not tested at another size.
- **Edge:** `web/src/world/mapBounds.ts` keeps everything inside the map. Land rises into a ring of mountains over the last 80 m (`rimAt` in `field.ts`), but only where there is land, so a sea stays open. Chunks outside the map are not loaded (`chunkManager.ts`).
- **Player and cars:** the player stops at the edge and sees "This is the edge of the map" (repeated every 15 s). Cars stop at the edge too.
- **"Here" past the edge** is refused, and the "Placed" toast gives the distance.

### Nature and animals (30c4554)
- **Nature:** `recipe.nature` has `trees`, `plants` and `rocks`, each 0–2, default 1. It scales the scatter (`web/src/world/scatter.ts`, `chunkData.ts`). The LLM sets it from the words used ("no trees" → 0; "thick forest" → 2). The `setNature` op changes it live and keeps the placements.
- **Animals:** life kinds gained `animal`. Any animal name works (giraffe, horse, elephant, dragon). Each animal names its asset, and wanders around `life.at`. Life max is 8. Wildlife is in `web/src/logic/wildlife.ts`.

### Invisible objects: the three causes, all fixed
1. **Browser queue:** browsers open about 6 connections to one server, so in a world of 30+ new models most requests timed out and were never retried. Now 5 at a time, with a retry (`render/assetModels.ts`). A test world loaded 197 objects with 0 misses.
2. **Hidden limit:** the search budget was 60 per 10 minutes and refused silently. Now 400 (`main.py`), and a refusal shows a notice.
3. **Past the old edge:** "here" was clamped to the map edge, so an object landed 188 m away while the toast said "placed where you asked".

### World speed
A format slip made nearly every world call the LLM a second time. Fixed; worlds went from about 40 s to **15–28 s**, with 0 rejected answers in the last run.

## Known limits (tell the user)
- Beige haze shows past the mountains from high on the jetpack.
- The browser sends 5 models at a time, so a world's first load of 30+ new models can take around 2 minutes (estimate, not measured). Cached models load almost at once.
- Flying animals the AI names (e.g. vulture) walk on the ground.
- Found animal models glide and bob, with no walk animation.
- Plain "cabin" gets a silo house.
- Steep rivers look stepped.
- A place on the floor of a sheer canyon gets no road down to it, and the log says so.
- Whether the AI picks a canyon for a prompt is its own choice; placement still lets a settlement sit on a canyon floor.
- Diving and floating were not checked at full frame rate (the test tab ran at about 1 fps).

## Open items and next steps
1. **Placement improvements (on hold, not started).** The user first asked for these: road and building overlap, real footprints, prop placement, and hard relations. Explain the current logic first, as asked.
2. **"Did you hardcode anything?"** This question was answered, with a proposal the user has not yet responded to:
   - Let the AI choose bed objects.
   - Remove the bug-specific examples from the vision prompt, then re-run `eval_finder.py`.
   - Later, replace the themed-model rule with vision-checked library thumbnails.
3. **Give the user a browser check** of this session's work: generate a new world. Check a "no trees" world, "add a giraffe here", "add a bike here", walking to the map edge, and the jetpack view.
4. **Merge decision:** merge `feat/worldseed` into `main` locally, push and open a PR (needs a GitHub remote), or keep it as is. Not chosen yet.
5. **Art packs** (user downloads; itch.io needs a browser):
   - Quaternius Stylized Nature MegaKit
   - Medieval Village MegaKit
   - Animated Animals (Google Drive)
   - KayKit Adventurers
   - Suggested for walk-in houses: Retro House Pack (elegantcrow.itch.io/retro-house-pack, CC0).
   Then re-dispatch Task 19b (tagging contract in `rulings.md`).
6. **Manual checks still open:**
   - By eye: grass sway, the walk/run animation, night bloom; the 50° cliff limit and Esc; the demo with no LLM shows only the message.
   - Doors on library houses do not open (no door part in those models).
   - The snowy valley floor reads teal under dawn light, and bright green grass grows in snowy valleys.
7. **Deploy (needs user approval and accounts):** public GitHub repo; Render (Docker, `backend/Dockerfile`, context = repo root; set the Sarvam env vars, and **don't** set `MESHY_API_KEY` on free instances); Vercel (root `web`, include files outside root, `VITE_API_URL`). The Docker image has never been built.
8. **Submission:** a video under 3 minutes. `docs/SUBMISSION.md` still needs the demo, repo and video URLs. Push and submit before 2026-11-11 16:30 CEST.

## Settings (`backend/.env`, never committed)
- `LLM_BASE_URL=https://api.sarvam.ai/v1`, `LLM_MODEL=sarvam-105b-conversations` (1–4 s, no reasoning step). Briefs and live edits use it.
- `LLM_FALLBACK_MODELS=sarvam-105b` (reasons first, 15–85 s). Used for busy errors and as the last try after two unusable answers.
- `LLM_WORLD_MODEL=glm5.3-flash` with `LLM_WORLD_BASE_URL=https://api.sarvam.ai/v2`: whole worlds only, 13–43 s, about twice the places and props. Unset both to go back.
- `VISION_MODEL=glm5.3-flash` on `/v2`: image checks in the finder. `/v1` rejects image content, and `/v2` accepts inline base64 only. The `sarvam-105b*` models are text only.
- `LLM_REASONING_EFFORT` is unset. `low` was worse, and `none` is rejected with HTTP 400.
- `LLM_MAX_TOKENS` 8000. Per-call timeout 75 s; the browser waits 90 s.
- OpenRouter settings are kept commented out. That account had no credit.
- Optional: `MESHY_API_KEY`, `SKETCHFAB_TOKEN`.

## User preferences (also in memory)
- **Status after every task:** what was done, findings, and what's next.
- **Anything goes.** Build general mechanisms, never one-off modes. The chain is natural language → 3D creation → functional interaction.
- **AI only.** No mock, offline or hardcoded worlds, and no world caching (only 3D models). With no LLM, say "LLM not available". Avoid keyword rules that override the AI.
- **Ask before** any push, deploy or account action.
- **Secrets:** only in `backend/.env`. Never print keys, and never send the user's email to an unrelated service.

## Rules (from CLAUDE.md, still in force)
- The LLM proposes and code decides. Validate with Pydantic on the server and Zod in the browser. The LLM never emits code.
- No `Math.random()` in `web/src/core/**` or `web/src/world/**`; use `mulberry32`.
- `web/src/core/**` and `web/src/world/**` stay pure (no three.js, no DOM) and are unit-tested with vitest.
- Metres, y up, north is −z.
- Schemas exist twice (`web/src/core/{recipe,ops}.ts` and `backend/app/schemas.py`); change both together. `shared/fixtures/**` is the contract.
- Python responses to the browser go through `dump()` or `dump_ops()`. Model-written text uses `textContent`, never `innerHTML`.
- Keep files under about 400 lines. Add a dated `docs/DECISIONS.md` entry for each non-obvious choice.

## Commands
```bash
cd web && npm run dev            # http://localhost:5173
cd web && npx vitest run && npx tsc --noEmit && npm run build
cd backend && source .venv/Scripts/activate && uvicorn app.main:app --port 8000 --log-level warning   # no --reload
cd backend && pytest -q
cd backend && python scripts/eval_finder.py   # live finder eval, 100 requests
cd backend && python scripts/build_manifest.py # after adding CC0 models to backend/assets/library/
```
Dev links: `?w=fishing-valley|desert-canyon|snowy-mountains|tropical-island` (fixtures), plus `?w=&t=&wx=` for screenshots. Vitest needs `--silent=false` to show `console.log`.

## Older history (through ff5956c; some rows describe the mock modes removed on 2026-11-04)
| Commit | Change |
|---|---|
| 862589e | Handoff through ff5956c; browser checks ticked with notes. |
| ff5956c | Convex-hull colliders for group buildings (controller 5 ms → 0.4 ms); adaptive render resolution; thinner outer scatter (1080p on an Iris Xe, sprinting 45–59 fps); person-scale houses; a named time completes atmosphere edits. |
| 044a02e | Spawn beside the biggest settlement on its inward side, facing it. |
| 1991225 | OASIS rename; city towers designed in code (`world/towerSpec.ts`, `render/towers.ts`); title screen (`ui/showcase.ts`). |
| 93ab289 | Coasts for seas off islands; compact cities; asphalt; a fountain for open-space centres; real dusk and dawn. |
| 4e11a4f | `RangeCuller` hides roads, water and objects beyond the loaded terrain. |
| f7b2783 | Softer ridged mountains; blended rock and snow; fog that ends at the loaded terrain. |
| 43b4f8f | GLM-5.3 Flash for worlds; paved city blocks; street lamps; kerb props and parked cars. |
| 361b08c | Props around places (deterministic, off roads and plots, with interactions). |
| 0fb9b84 | Roads over every place and the spawn, plus the AI's paths. |
| bbe7645 | 17 scatter kinds; oak, birch and autumn groves; ground cover. |
| 2dad3e8 | 186 curated Quaternius CC0 models (`backend/scripts/curate_library.py`), 512 px WebP textures. |
| 3bedfe4 | Model-shaped colliders; cars sit on the terrain; the controller's 5 cm skin. |
| f5de08b | Rocket booster (hold Space in the air; 4 s of fuel; flames and BOOST bar). |
| 3594255 | Three CC0 animated characters; B switches. |
| (next) | Driveable cars (`drive` interaction; E in/out, WASD, Space brake, Shift boost). |
| 2d179b5 | Prompt colours: recipe `palette {ground, water, sky}`, `setPalette` op. |
| 354b603 | No stand-in house while an added asset loads; a spinner notice per place. |
| 71f51f5 | Groups: `place.layout {pattern, count ≤60, height, centre}` (village, grid, ring, line, scatter). Code: `web/src/world/layouts.ts`. |
| 799169d | Groups can be added while playing (`check_targets`). |
| 74a3ad4, c2ed538 | Switch to Sarvam; model roles fixed from measurements. |
| 066ba03 | Parked minors closed (IPv4-mapped client IPs, pytest moved to `requirements-dev.txt`). |
| 027ff0a | Bloom only at dusk and night. |
| 4eb8d36 | One "unsupported" answer is questioned once. |
| 1bafbb6 | Doors follow the loaded model; interactions re-register after a swap. |
| 2791c90 | Online model picks: skip interiors, cap downloads at 8 MB, `max_tokens` on every call. |
| b35a2b9 | Retry busy models, then the backup. Busy → 503 "AI is busy". (Its offline fallback was later removed.) |
