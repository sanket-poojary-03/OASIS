# WorldSeed: session handoff (2026-11-03)

Read this first in a new session, together with `CLAUDE.md`. The full decision log is `docs/DECISIONS.md` (the newest entries are under `## 2026-11-03`).

**Deadline: 2026-11-11 16:30 CEST.**

## Where things stand
- **Branch:** `feat/worldseed`, 80 commits ahead of `main`.
  - `main` holds only the docs base (26620a5).
  - There is **no git remote yet**, so nothing has been pushed.
- **The plan is code-complete.** All 30 plan tasks from `docs/superpowers/plans/2026-11-01-worldseed.md` were implemented and reviewed using subagent-driven development, except Task 19b (art download).
  - A final whole-branch review found 1 Critical, 7 Important and 13 Minor issues. All were fixed (up to 2230904), and the re-review was clean.
- **Tests at the last commit (cb9689e):**
  - Web: vitest 278 passing, tsc clean, build OK.
  - Backend: `pytest -q -W error` 107 passed, 10 skipped. The skipped tests wait for the real art library.
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
   - Ground and sea colour should follow the prompt (a "red planet" is currently sand-coloured).
   - Fill empty outer city plots with parks or trees.
   - The zen garden came out backwards (the temple as a scatter group, trees placed singly), so tune the prompt further.
4. **Deploy (needs user approval and accounts):**
   - Create a public GitHub repo.
   - Render (Docker, `backend/Dockerfile`, context = repo root; set the Sarvam env vars, and **don't** set `MESHY_API_KEY` on free instances).
   - Vercel (root `web`, include files outside root, `VITE_API_URL`).
   - The Docker image has never been built (Docker Desktop wasn't running).
5. **Manual checks:**
   - FPS ≥ 45 at 1080p per fixture, with real art (Task 24b Step 9 / Task 26 Step 1).
   - The MANUAL-PENDING browser checks listed in the ledger.
6. **Submission:**
   - A video under 3 minutes.
   - Update `docs/SUBMISSION.md`: it should mention Sarvam and the group layouts.
   - Push and submit before 2026-11-11 16:30 CEST.
7. **Parked minor items** (from the final re-review, none blocking):
   - `clientip`: use `not ip.is_global` and unwrap IPv4-mapped addresses.
   - The health line stays "Offline mode" after a late backend wake.
   - `wildlifeClass.test` doesn't restore its `console.warn` spy.
   - `httpx2` is a stray runtime dependency, and pytest ships in the Docker image.
