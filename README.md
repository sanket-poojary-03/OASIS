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
WASD move, mouse look, Space jump, Shift run, E interact, T type a command (for example "make it night", "put a giraffe here"), Ctrl+Z undo.

## Offline mode
If the backend is unreachable the web app falls back to a local mock using `shared/fixtures`, so it always works.

## Deploy
Backend (Render, Docker): Dockerfile `backend/Dockerfile`, build context `.` (repo root), health check `/api/health`. Env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_JSON_MODE`, `LLM_DAILY_CAP=300`, `POLY_PIZZA_KEY`, `SKETCHFAB_TOKEN`, `ASSET_LLM_PICK`, `ASSET_DAILY_CAP`, `MESHY_API_KEY` (optional), `MESHY_MAX_GENERATIONS=5`, `CORS_ORIGINS=https://<vercel-domain>`.
Frontend (Vercel): root directory `web`, Vite, enable "Include files outside the Root Directory in the Build Step", env `VITE_API_URL=https://<render-service>.onrender.com`.
Verify: start screen shows "AI online"; a new prompt gives "AI: live"; "make it night", "put a lantern here" and "put a giraffe here" work; the start screen fits a phone-width window.

Live demo: (TBD) / API: (TBD)/api/health

## Credits and licenses
Quaternius (CC0: Stylized Nature, Medieval Village, Animated Animals), KayKit (CC0: Adventurers), models found online via Poly Pizza / Sketchfab (CC0 or CC-BY, credited in-app), three.js (MIT), Rapier (Apache-2.0).

## Docs
- Spec: docs/superpowers/specs/2026-11-01-worldseed-design.md
- Plan: docs/superpowers/plans/2026-11-01-worldseed.md
- Decisions: docs/DECISIONS.md
