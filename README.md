# OASIS

Describe a world. Walk into it. Change it by talking to it.

Victoria VR AI Builder Hackathon 2026 entry. Focus category: Prompt-to-World Creation.

## How it works
- **The LLM proposes, code decides.** A FastAPI backend asks an LLM for a world recipe (what is there and how things relate, not coordinates) or, while you play, for edit operations. Every answer is validated with Pydantic on the server and Zod in the browser. The LLM never writes code.
- **Deterministic world building.** TypeScript in the browser builds a 1 km map from the recipe: noise terrain, rivers and lakes, biomes, a placement solver that explains why each place is where it is, villages, A* roads and instanced scatter. The same recipe always gives the same world.
- **Rendering and physics.** three.js renders the world in chunks built in a Web Worker. Rapier handles physics, the player, cars and solid trees.
- **A living environment.** Day and night, weather, doors, lights, fire, bells, seats, pushable props and wildlife.
- **A model finder for any object.** The bundled CC0 library first, then the model cache, Poly Pizza and Sketchfab (CC0 or CC-BY only, with a vision check), optional Meshy text-to-3D for landmarks, and finally a model built from parts the AI describes as data.

## Run locally

Requirements: Python 3.11+, Node 20.19+, and an OpenAI-compatible LLM API key.

Backend:

    cd backend
    python -m venv .venv
    source .venv/Scripts/activate      # Windows Git Bash; on macOS/Linux: source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env               # then set LLM_API_KEY (and optionally POLY_PIZZA_KEY, SKETCHFAB_TOKEN)
    uvicorn app.main:app --port 8000

Web (in a second terminal):

    cd web
    npm install
    cp .env.example .env               # VITE_API_URL=http://localhost:8000
    npm run dev                        # http://localhost:5173

Production build: `cd web && npm run build` (output in `web/dist`).

Without `LLM_API_KEY`, or without the backend, the app shows "LLM not available" and makes no world. There are no preset or offline worlds: every world and edit comes from the AI, and only 3D models are cached.

## Controls
| Key | Action |
|---|---|
| Mouse | Look around (click the world to take control, Esc gives the mouse back) |
| W A S D | Move, or steer a car |
| Shift | Run (dive in water) |
| Space | Jump and swim |
| F | Rocket booster |
| E | Use things: doors, lights, bells, seats, cars |
| T | Talk to the world, for example "make it night" or "put a giraffe here" |
| Enter / Esc | Confirm or cancel a previewed edit |
| U | Undo a change |
| V | Switch between first and third person |
| B | Change character |
| C | See the world checks |
| M | Open the mini-map large |
| R | Choose the resolution |
| N | Make a new world |
| H | Show the controls again |

## Deploy
**Backend (Render, Docker):** Dockerfile `backend/Dockerfile`, build context `.` (repo root), health check `/api/health`. Set the variables from `backend/.env.example`, with `CORS_ORIGINS=https://<vercel-domain>`.

Do not set `MESHY_API_KEY` on Render's free (ephemeral) instances: the Meshy spend cap is counted in `backend/assets/.generated-attempts.json`, which is wiped on every restart, so the cap would reset. Set it only if `backend/assets/generated/` and the `backend/assets/.generated-*.json` files are on persistent storage.

**Frontend (Vercel):** root directory `web`, framework Vite, enable "Include files outside the Root Directory in the Build Step", env `VITE_API_URL=https://<render-service>.onrender.com`.

## Credits and licenses

**3D art**
- Quaternius, CC0 1.0: Stylized Nature MegaKit, Medieval Village MegaKit, Ultimate Animated Animal Pack, the Sports Car, and the 186 models in `backend/assets/library/quaternius/` (from https://poly.pizza/u/Quaternius). CC0 needs no attribution; we credit Quaternius anyway.
- Microsoft Rocketbox (https://github.com/microsoft/Microsoft-Rocketbox), MIT, Copyright (c) 2020 Microsoft: the playable characters Street, Tourist, Builder, Police and Woman. License notice in `web/public/models/characters/ROCKETBOX-LICENSE.txt`.
- Poly by Google, CC-BY 3.0, via Poly Pizza (https://poly.pizza): Cow, Sheep and Fountain, used on the start screen.
- Models found while you play come from Poly Pizza or Sketchfab and are CC0 or CC-BY only (never NC, ND or SA). Each one is credited in the in-game place card with its author, license and source. Models made with Meshy are labelled "Generated with Meshy".

**Software**
three.js (MIT), Rapier / @dimforge/rapier3d-compat (Apache-2.0), simplex-noise (MIT), Zod (MIT), Vite (MIT), FastAPI (MIT), Pydantic (MIT), httpx (BSD-3-Clause), Uvicorn (BSD-3-Clause), thinking-orbs by Jakub Antalik (MIT, Copyright (c) 2026 Jakub Antalik).
