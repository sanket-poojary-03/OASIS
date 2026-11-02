# WorldSeed

Describe a world. Walk into it. Change it by talking to it.

Victoria VR AI Builder Hackathon 2026 entry. Focus category: Prompt-to-World Creation.

## Run locally
    cd backend && source .venv/Scripts/activate && uvicorn app.main:app --reload --port 8000
    cd web && npm run dev    # http://localhost:5173

Without `LLM_API_KEY` the backend runs in mock mode. Without the backend the web app uses its offline mock.

## How AI is used
The LLM writes a validated world recipe (relations, not coordinates) and live edit operations; code validates and places everything. It never emits code. Any requested object goes through a model finder: bundled CC0 library, cache, Poly Pizza, Sketchfab (CC0 or CC-BY only, credited in the place card), then optional Meshy text-to-3D for landmarks, then a procedural placeholder.

## Architecture
Browser (Vite, TypeScript, three.js, Rapier) builds an endless deterministic world from the recipe in a Web Worker. A FastAPI backend turns text into a recipe or edit ops (Pydantic-validated, Zod-validated again in the browser) and serves models. Full diagram: spec section 4.

## Controls
WASD move, mouse look (click the view to lock the pointer), Space jump/swim, Shift run, E interact, T type a command (for example "make it night", "put a giraffe here"; Enter sends, Esc closes), Enter/Esc confirm or cancel the previewed edit, U undo, V switch between first and third person, C show checks, N (or the "New world" button) back to the start screen to describe another world ("Back to my world" returns). Esc stops the demo.

## Offline mode
If the backend is unreachable the web app falls back to a local mock using `shared/fixtures`, so it always works.

## Deploy
Backend (Render, Docker): Dockerfile `backend/Dockerfile`, build context `.` (repo root), health check `/api/health`. Env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_JSON_MODE`, `LLM_DAILY_CAP=300`, `POLY_PIZZA_KEY`, `SKETCHFAB_TOKEN`, `ASSET_LLM_PICK`, `ASSET_DAILY_CAP=500`, `ASSET_PICK_DAILY_CAP=200`, `CORS_ORIGINS=https://<vercel-domain>`.

**Do not set `MESHY_API_KEY` on Render's free (ephemeral) instances.** The Meshy spend cap (`MESHY_MAX_GENERATIONS`) is counted in `backend/assets/.generated-attempts.json`, which is wiped on every restart and deploy, so the cap would reset each time. `MESHY_API_KEY` is optional and meant for local use: with it set locally, generate the demo's hero landmarks once and move them into `backend/assets/library/` (plan Task 26 Step 2), so the deployed backend serves them from the library for free. Set it on Render only if `backend/assets/generated/` and the `backend/assets/.generated-*.json` counter files are on persistent storage.
Frontend (Vercel): root directory `web`, Vite, enable "Include files outside the Root Directory in the Build Step", env `VITE_API_URL=https://<render-service>.onrender.com`.
Verify: start screen shows "AI online"; a new prompt gives "AI: live"; "make it night", "put a lantern here" and "put a giraffe here" work; the start screen fits a phone-width window.

Live demo: (TBD) / API: (TBD)/api/health

## Credits and licenses
Quaternius (CC0: Stylized Nature, Medieval Village, Animated Animals), KayKit (CC0: Adventurers), models found online via Poly Pizza / Sketchfab (CC0 or CC-BY, credited in-app), three.js (MIT), Rapier (Apache-2.0). Full list: docs/CREDITS.md.

## Docs
- Spec: docs/superpowers/specs/2026-11-01-worldseed-design.md
- Plan: docs/superpowers/plans/2026-11-01-worldseed.md
- Decisions: docs/DECISIONS.md
