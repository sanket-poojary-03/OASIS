# OASIS: project guide for Claude Code

Victoria VR **AI Builder Hackathon 2026** entry, focus category **Prompt-to-World Creation**.
**Deadline: 2026-11-11 16:30 CEST.** Winners are announced Nov 25. Submission needs a public repo, a hosted browser demo, a video under 3 minutes, and a short description.

## What we're building
Describe a world in plain language, walk into it right away, and change it by typing while you play.

- An LLM (Python FastAPI backend) turns text into a validated JSON **recipe**, or into **edit ops** while you play. It never writes code, and never writes coordinates unless the user gives them.
- Deterministic TypeScript in the browser builds a fixed map (1 km across, with mountains at its edge) from the recipe: noise terrain, rivers and lakes, biomes, a relation-based **placement solver** that shows "why here" reasons, villages, A* roads, and instanced scatter.
- three.js renders it in chunks from a Web Worker, and Rapier handles physics and the first-person controller.
- The environment has working logic: day/night, weather, doors, lights, fire, bells, seats, pushable props, and wildlife.
- There are **no quests, keys or puzzles**, by the user's explicit choice.

## Source of truth: read these before working
1. Spec: `docs/superpowers/specs/2026-11-01-worldseed-design.md`
2. Plan: `docs/superpowers/plans/2026-11-01-worldseed.md`. There are 30 tasks (0–27, plus 19b art catalogue and 24b art pass), each with tests and code. **Follow it task by task**, tick the checkboxes as you go, and commit after every task.
3. Research and competitor analysis: `docs/research/competitor-analysis.md` and `docs/research/reports/Prompt to world scene generation.md`
4. Decision log: `docs/DECISIONS.md`. Add a dated entry for every non-obvious choice.

Recommended way to run the plan: `superpowers:subagent-driven-development`, or `superpowers:executing-plans` inline.

## Hard rules
- **The LLM proposes, code decides.** Validate every LLM output: Pydantic on the server, Zod in the browser. The LLM never emits executable code.
- **Determinism:** no `Math.random()` in `web/src/core/**` or `web/src/world/**`; use `mulberry32`. The same recipe always gives the same world.
- `web/src/core/**` and `web/src/world/**` are pure (no three.js, no DOM) and unit-tested with vitest.
- Units are metres, y is up, **north is −z**. `CORE_HALF = 512`, `CHUNK_SIZE = 64`, `CHUNK_RES = 32`, `VIEW = 3`.
- The recipe and ops schemas exist twice: `web/src/core/{recipe,ops}.ts` (Zod) and `backend/app/schemas.py` (Pydantic). **Change both together.** `shared/fixtures/**` is the contract, and both test suites validate it.
- **No mock or offline worlds, by the user's explicit choice.** Without an LLM (no key, or the backend unreachable) the player sees "LLM not available" and no world is made. `shared/fixtures` are only the prompt example, test data and dev `?w=` links.
- **Only 3D models are cached.** Every prompt gets a fresh brief and world from the AI.
- Python responses sent to the browser go through `dump()` or `dump_ops()`, so no `null` values reach the browser.
- Show model-written text with `textContent` only, never `innerHTML`.
- Secrets live only in `backend/.env`. Never commit `.env`.
- Keep files small and single-purpose. Split any file that passes about 400 lines.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Commands
```bash
# web
cd web && npm run dev            # http://localhost:5173  (?w=fishing-valley|desert-canyon|snowy-mountains|tropical-island in early harnesses)
cd web && npx vitest run && npx tsc --noEmit && npm run build
# backend (Git Bash on Windows)
cd backend && source .venv/Scripts/activate && uvicorn app.main:app --reload --port 8000
cd backend && pytest -q
python scripts/build_manifest.py # after adding CC0 models to backend/assets/library/
```
Without `LLM_API_KEY`, or without the backend, the app says "LLM not available" and makes no world.

## Stack
- **Web:** Vite, TypeScript, three.js, @dimforge/rapier3d-compat, simplex-noise, zod, vitest
- **Backend:** Python 3.11+, FastAPI, Pydantic v2, httpx, pytest
- **LLM:** any OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`; default Sarvam `sarvam-105b-conversations` (1–4 s), backup `sarvam-105b` (reasoning, slower))
- **Art:** one CC0 family. Quaternius Stylized Nature, Medieval Village (house prefabs) and Animated Animals, plus Microsoft Rocketbox players (MIT, realistic people, `scripts/convert_rocketbox.mjs`). Wind grass, bloom, and a third-person animated player (V).
- **Model finder** (any object, even unexpected): library → approved cache → LLM analysis → Poly Pizza (`POLY_PIZZA_KEY`) + Sketchfab (`SKETCHFAB_TOKEN`) with a vision check (`VISION_MODEL`, default `glm5.3-flash` on Sarvam `/v2`), over up to 4 search terms → Meshy (landmarks only, `MESHY_MAX_GENERATIONS=5`) → a manual build from AI-written parts (JSON, never code). The player is told when Meshy is unavailable and when something is built manually. Online models must be CC0 or CC-BY only, and are credited in the place card. `python scripts/eval_finder.py` scores it on 100 live requests.
- **Placing on things:** `at` carries an optional `y` (crosshair surface height) so props can sit on tables. "Near this" uses `lookingAt`.
- **Start screen:** one hand-written world (`web/src/ui/showcase.ts`) flown through by `web/src/ui/menuFlight.ts`. Its models ship with the site (`web/public/models/bundled`, written by `scripts/bundle_models.mjs`), so it needs no backend. Retake `web/public/menu-poster.webp` if it changes.
- **Deploy:** backend on Render (Docker, `backend/Dockerfile`, build context = repo root), frontend on Vercel (root `web`, include files outside root)

## Competitors to beat (see the research)
- **LevelProof:** a 16×16 grid with sine-wave decorative terrain; scatter floats on its hills.
- **WorldOps:** a flat board; raw LLM coordinates with no overlap check.
- **prompt-to-playable:** flat 60×60 with 24 objects.
- **Anima:** one fixed splat scene.
- LevelProof's props are all built in code from three.js primitives; its only loaded file is one CC0 character. Its look comes from polish (rounded edges, colour variants, bloom) on a small, close-framed board.
- **Our edge:** a large walkable map, relation-based placement that explains itself, real CC0 pack models, a model finder that fetches anything you ask for, and live edits with undo.
