# OASIS: session handoff (2026-11-04)

Read this first in a new session, together with `CLAUDE.md`. The full decision log is `docs/DECISIONS.md` (the newest entries are under `## 2026-11-04` and `## 2026-11-04 (later)`). The project was renamed **WorldSeed → OASIS** on 2026-11-04 (user-facing names only; the branch, spec and plan file names keep `worldseed`).

**Deadline: 2026-11-11 16:30 CEST.**

## Where things stand
- **Branch:** `feat/worldseed`, 104 commits ahead of `main`.
  - `main` holds only the docs base (26620a5).
  - There is **no git remote yet**, so nothing has been pushed.
- **The plan is code-complete.** All 30 plan tasks from `docs/superpowers/plans/2026-11-01-worldseed.md` were implemented and reviewed using subagent-driven development, except Task 19b (art download).
  - A final whole-branch review found 1 Critical, 7 Important and 13 Minor issues. All were fixed (up to 2230904), and the re-review was clean.
- **Tests at the last commit:**
  - Web: vitest 343 passing, tsc clean, build OK.
  - Backend: `pytest -q` 152 passed.
- **Browser checks:** a headless-Chrome loop (puppeteer-core driving the installed Chrome on the GPU) screenshots worlds and runs the plan's acceptance checks through `window.__ws` (dev builds). The scripts live in the session scratchpad, not the repo; DECISIONS 2026-11-04 (later) lists what was measured. Claude in Chrome also works for live checks (automation cannot take pointer lock; set `player.controls.isLocked = true`).
- **Ledger and SDD workspace:** `.superpowers/sdd/2026-11-01-worldseed/` is git-ignored. It holds `progress.md` (the ledger), `rulings.md`, and the task briefs and reports, including the Task 19b manual steps.
- **Extra worktrees** (all merged and safe to remove): `../VICTORIA-backend` (feat/backend), `../VICTORIA-render` (feat/web2), `../VICTORIA-web3` (feat/web3).
- **Run locally:**
  - Backend (Git Bash): `backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --port 8000`. Use `--app-dir`, because background shells ignore `cd`.
  - Web: `cd web && npm run dev` (http://localhost:5173).

## AI provider: Sarvam (since 2026-11-03)
- **Settings** (in `backend/.env`, never committed; the user's Sarvam key is there):
  - `LLM_BASE_URL=https://api.sarvam.ai/v1`
  - `LLM_MODEL=sarvam-105b-conversations`: answers in 1–4 s, no reasoning step.
  - `LLM_FALLBACK_MODELS=sarvam-105b`: reasons first, 15–85 s. Used for busy errors and as the last try after two unusable answers.
  - `LLM_WORLD_MODEL=glm5.3-flash` with `LLM_WORLD_BASE_URL=https://api.sarvam.ai/v2` (since 2026-11-04, the user's choice): whole worlds only, 13–43 s, about twice the places and props. Briefs and live edits stay on `LLM_MODEL`. Unset both to go back.
  - `LLM_REASONING_EFFORT` is unset. Measured: `low` was worse (7.5k thinking tokens, cut off), and `none` is rejected with HTTP 400.
  - `LLM_MAX_TOKENS` defaults to 8000. The per-call timeout is 75 s, and the browser waits 90 s.
- **Old provider:** the OpenRouter settings are kept *commented out* in `backend/.env`. That account had $0 credit, and Google's shared pool returned 429 on about 1 in 3 calls.
- **Latest eval** (8 varied prompts): 8/8 usable, about 5.2 places per world, about 2.5 s each. Live edits (night/rain, lantern, tent camp, remove) take about 3 s.
- **Poly Pizza key** is in `backend/.env`, so the online model finder works.

## What changed this session (after the plan finished), by commit
| Commit | Change |
|---|---|
| b35a2b9 | **AI only.** Retry busy models, then the backup model. If all fail, the API returns 503 "AI is busy" and the browser shows it and keeps the world. Offline mode only when the backend is unreachable. No silent keyword-mock worlds behind a live backend. |
| 2791c90 | **Online model picks.** Skip interior/room/scene titles, cap downloads at 8 MB and fall through to the next candidate, and the picker asks for "one object seen from outside". Also `max_tokens` on every LLM call. |
| 1bafbb6 | **Doors follow the loaded model.** The model's own part named like a door gets hinged. With no door part there's no interaction and no floating slab. Interactions re-register after a model swap. |
| 027ff0a | **Bloom only at dusk and night.** Fixes the daytime white glare near the sun (`bloomFor`). |
| 4eb8d36 | **No refusals for ordinary places.** One "unsupported" answer is questioned once. |
| 71f51f5 | **Groups of anything.** `place.layout {pattern: village\|grid\|ring\|line\|scatter, count ≤60, height low\|mixed\|tall, centre}` in both schemas, the prompt and both mocks. Cities get a street grid with towers rising to the centre; camps and colonies are rings; harbours are lines; orchards and graveyards are scatters. Tower placeholders are built at their real height, and models are fitted to their plot. Code: `web/src/world/layouts.ts`. |
| 799169d | **Groups can be added while playing.** `check_targets` sends edits that name unknown places back to the AI. |
| 74a3ad4, c2ed538 | **Switch to Sarvam**, then fix the model roles from measurements. Notes the model puts inside the recipe are moved out instead of rejected. |
| 066ba03 | **Parked minors closed.** `clientip` unwraps IPv4-mapped hops and skips every non-global address; `httpx2` dropped, pytest moved to `requirements-dev.txt`; the health line corrects itself after a late backend wake; test warn spies restored. |
| 2d179b5 | **Prompt colours.** Optional recipe `palette {ground, water, sky}` (#rrggbb) and a `setPalette` op in both schemas (fixture `ops/red-planet.json`). It tints biomes, grass, water and a translucent sky dome. Colour words are repaired to hex. Prompt p6. Tests: web 283, backend 111 + 10 skipped. |
| 354b603 | **No stand-in house while an added asset loads.** Places added with T wait for their model; a top-right spinner notice per place, then a tick or "no model found, simple shape". |
| 3594255 | **Characters.** Three bundled Quaternius CC0 animated characters (Adventurer, Astronaut, Hooded Ranger) in `web/public/models/characters/`; B switches. |
| f5de08b | **Rocket booster.** Hold Space in the air (after 0.2 s) to fly; fuel 4 s, refills on the ground; flames, glow, roar, BOOST bar. |
| (next) | **Driveable cars.** `drive` interaction (both schemas, prompts p7, mocks, repair safety net); bundled sports car parked at every spawn; E in/out, WASD, Space brake, Shift boost, chase camera. |
| 3bedfe4 | **Nothing floats.** Model-shaped (trimesh) colliders for placed models; cars sit on the terrain under their wheels (terrain filtered out of their Rapier queries); feet include the controller's 5 cm skin. |
| 2dad3e8 | **Model library.** 186 curated Quaternius CC0 models (`backend/scripts/curate_library.py`), textures 512 px WebP, 40 MB. Trees, rocks and bushes are real models when the backend is up. No rabbit model (Quaternius' are upright characters). |
| c3040ef | **Smarter finder.** AI-confirmed partial library matches, alternative search words, flat models rejected for buildings, Meshy for any kind. |
| (next) | **No placeholders with a server.** Objects appear only with their real model; misses are left out with a notice; stand-ins only offline; 4x footprint cap. |
| bbe7645 | **Varied nature.** 17 scatter kinds, every library variant, oak/birch/autumn groves, ground cover. |
| 0fb9b84 | **Roads everywhere.** A spanning tree of roads over every place and the spawn, plus the AI's paths. |
| c51a727 | **Prompt enhancer.** `/api/brief`; up to 24 places with props; sturdier repairs; invalid places dropped one by one. |
| 361b08c | **Props around places.** Deterministic, off roads and plots, real models with interactions. |
| 43b4f8f | **GLM-5.3 Flash for worlds, great cities, brief on screen.** World model split; `layout.variants`; paved city blocks; street lamps at crossings; kerb props and parked cars; prompt p9; builds about 2× faster. |
| f7b2783 | **Mountains without needles.** Softer, weighted ridged noise; blended rock and snow edges; fog that ends at the loaded terrain; dev `?w=&t=&wx=` screenshot hook. |
| 4e11a4f | **Nothing hangs in the sky.** `RangeCuller` hides roads, water and objects beyond the loaded terrain; gentler roads (slope cost); at most 4 loading notices. |
| 93ab289 | **Play-tested live cities.** Coasts for seas off islands; compact cities (prompt p10); asphalt; a fountain for open-space centres; readable light; real dusk and dawn; warm haze; scatter detail rings. |
| 1991225 | **OASIS.** Rename; city towers designed in code (`world/towerSpec.ts`, `render/towers.ts`: setbacks, glass/office/apartment façades, roofs, lit windows); a live city turning behind a new title screen (`ui/showcase.ts`, `App.showcase`); prompt p11. |
| 044a02e | **Spawn facing the main place.** Beside the biggest settlement, on its inward side, camera turned toward it. |
| ff5956c | **Playability from measurements.** Convex-hull colliders for detailed group buildings (controller 5 ms → 0.4 ms); adaptive render resolution; thinner outer scatter (1080p on an Iris Xe, sprinting: 45–59 fps); slim houses widened to person scale; a named time completes atmosphere edits (the demo ends at day). |
| cb9689e | **Fuller worlds.** Prompt p5 asks for 5–9 places and treats repeated things as groups. `repair_recipe` fixes harmless slips (a stray `of`, size words like "huge"). |

## User preferences (also in memory)
- **Status after every task:** what was done, findings, and what's next.
- **Anything goes.** The user can ask for *anything*: build general mechanisms, never one-off modes. What matters is natural language → 3D creation → functional interaction.
- **AI only.** No fake or hardcoded worlds when the AI fails. Show an honest message.
- Get the user's approval before any push, deploy or account action.

## Open items / next steps
1. **Merge decision:** merge `feat/worldseed` into `main` locally, push and open a PR (needs a GitHub remote), or keep it as is. The user hasn't chosen yet.
2. **Art packs** (user downloads; itch.io needs a browser):
   - Quaternius Stylized Nature MegaKit
   - Medieval Village MegaKit
   - Animated Animals (Google Drive)
   - KayKit Adventurers
   - **Suggested for walk-in houses:** Retro House Pack (elegantcrow.itch.io/retro-house-pack, CC0, interiors and separate doors).

   Then re-dispatch Task 19b (tagging contract in `rulings.md`). Possible follow-up: houses you can enter (wall colliders with a doorway gap), or houses assembled from the Quaternius modular kit.
3. **Visual polish ideas:**
   - **Browser check needed** for this session's features: the loading notices (T → "add a giraffe here"), B characters, holding Space to fly, E on the parked car, and driving up hills, into a house and toward water.
   - ~~Ground and sea colour should follow the prompt~~ (done, 2d179b5). Needs a visual check in the browser: "a red planet…", then "make the sky orange", at day and at night.
   - Fill empty outer city plots with parks or trees.
   - The zen garden came out backwards (the temple as a scatter group, trees placed singly), so tune the prompt further.
4. **Deploy (needs user approval and accounts):**
   - Create a public GitHub repo.
   - Render (Docker, `backend/Dockerfile`, context = repo root; set the Sarvam env vars, and **don't** set `MESHY_API_KEY` on free instances).
   - Vercel (root `web`, include files outside root, `VITE_API_URL`).
   - The Docker image has never been built (Docker Desktop wasn't running).
5. **Manual checks still open** (the rest of the plan's browser checks were measured and ticked on 2026-11-04):
   - By eye: grass sway, the walk/run animation, night bloom (Task 24b Step 9); the 50° cliff limit and Esc (Task 14); the demo in offline mode (Task 25).
   - Doors on library houses do not open (no door part in the models); decide whether to add stand-in doors to loaded houses.
   - The snowy valley floor reads teal under dawn light, and bright green grass grows in snowy valleys.
   - From high up (jetpack) the edge of the loaded land is still faintly visible.
6. **Submission:**
   - A video under 3 minutes.
   - `docs/SUBMISSION.md` now mentions Sarvam, group layouts, palettes and the AI-only behaviour. It still needs the demo, repo and video URLs.
   - Push and submit before 2026-11-11 16:30 CEST.
7. ~~Parked minor items~~: all closed in 066ba03.
