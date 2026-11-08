# How OASIS Works

This page explains what happens between typing a sentence and walking around the world it describes. The [README](README.md) covers what the app does and how to run it.

## The big idea: the AI suggests, the code decides

Language models are good at ideas and bad at geometry. Ask one to place 30 buildings by writing coordinates and some end up in rivers, on cliffs, or inside each other.

So in OASIS the AI never writes coordinates and never writes code. It writes a short structured description of the world, called a **recipe**: what exists, what it is like, and how things relate to each other ("a fishing village by the river", "a watchtower on the highest hill, visible from the village"). Ordinary, predictable code then turns that recipe into a world. The same recipe always gives exactly the same world.

The one exception is when the player points at a spot ("put a lighthouse *here*"). Then the browser sends the spot it measured, never a coordinate the AI made up.

```mermaid
flowchart LR
    A[Your prompt] --> B[AI: world brief]
    B --> C[AI: recipe JSON]
    C --> D{Validated<br/>Pydantic + Zod}
    D --> E[World builder<br/>terrain, water, placement, roads]
    E --> F[Renderer + physics<br/>three.js, Rapier]
    F --> G[You walk in]
    G -- "make it night" --> H[AI: edit ops]
    H --> D
```

## 1. From prompt to recipe (backend)

The backend is a small Python **FastAPI** server (`backend/app`). It talks to any OpenAI-compatible LLM. By default that is Sarvam, with `sarvam-105b-conversations` for briefs and edits and `glm5.3-flash` for whole worlds.

Making a world takes two AI calls:

1. **Brief** (`POST /api/brief`). A short prompt like "a snowy village" is expanded into a detailed world brief with named places and the details around them. The player's own words always win over the brief.
2. **Recipe** (`POST /api/world`). The brief and the original prompt are turned into a recipe in JSON.

A recipe (`web/src/core/recipe.ts`, mirrored in `backend/app/schemas.py`) holds:

| Part | What it says |
|---|---|
| `terrain` | The shape (plains, hills, valley, mountains, island, canyon, archipelago, ocean), roughness, height, sea level |
| `climate`, `water` | Temperature and moisture (these decide the biomes), and whether there is a river and a lake |
| `atmosphere` | Time of day, weather (clear, rain, snow, mist, storm), fog, wind |
| `palette` | Optional colours for ground, water and sky, for worlds that are not Earth-like ("a red planet") |
| `nature`, `flora` | How many trees, plants and rocks, and optionally which plants grow ("twisted spooky trees") |
| `places` | Up to 24 named places, each with a kind, a model name, a size, what you can do with it, and where it goes, as relations |
| `scenery`, `paths`, `life` | Things found out in the open, roads between places, and animals |

A place that comes in numbers, like a city or a camp, is a **group** with a layout the AI picks: a village street, a city grid, a ring around a centre piece, a line, or a loose scatter (up to 60 members).

**Validation.** Every answer is checked twice: with Pydantic on the server and Zod in the browser. Harmless slips are repaired first (a colour written as a word, a size outside small/medium/large, a relation to a place that does not exist). If the answer is still wrong, the error goes back to the AI for one more try. After two unusable answers the backend tries a backup model once. If that also fails, the player is told the AI is unavailable and no world is made. There are no preset or offline worlds.

## 2. From recipe to world (browser, deterministic)

Everything in `web/src/world` and `web/src/core` is plain TypeScript with no graphics code. It uses a seeded random generator (`mulberry32`), never `Math.random()`, so a recipe always builds the same world.

- **Terrain** (`world/field.ts`, `world/noise.ts`). Layered simplex noise is shaped by the recipe's terrain type. The map is 1024 m × 1024 m, and the land rises into a ring of mountains at the edge so the world has a natural border.
- **Water** (`world/river.ts`, `world/waterSheet.ts`). A river follows the steepest way down from high ground and is carved into the land. If it gets stuck in a hollow, it fills into a lake.
- **Biomes** (`world/biome.ts`). Each spot becomes sand, grass, forest, pine, snow, rock, desert or marsh, based on height, slope, temperature and moisture.
- **Placement solver** (`world/placement.ts`). For each place it tests 1,500 candidate sites. It throws out sites in water, on steep slopes or overlapping another place, then scores the rest against the place's relations (highest, lowest, flat, by water, near, far from, north/south/east/west of, visible from). The winner keeps its reasons, which is what the in-game place card shows as **"why here"**. Limits are relaxed only as a last resort, and a warning is noted when they are.
- **Settlements** (`world/settlement.ts`, `world/layouts.ts`). Groups are laid out as streets, grids, rings, lines or scatters on levelled ground, with farm fields, street lamps and small props around them (`world/props.ts`).
- **Roads** (`world/roads.ts`). A* pathfinding connects the places and the spawn point. It avoids water and steep ground, and crosses rivers and canyons on bridges.
- **Scatter** (`world/scatter.ts`). Trees, bushes, flowers and rocks are placed per biome, on a fixed grid with seeded jitter, with up to 8 model variants per kind so a forest is never one tree repeated.
- **Checks** (`world/checks.ts`). Every place is checked for solid ground and for being reachable on foot from the spawn. Press **C** in the game to see the list.

## 3. Rendering, physics and play

- **Chunks** (`render/chunkManager.ts`, `render/chunkWorker.ts`). The world is split into 64 m chunks. A Web Worker builds each chunk's ground and scatter off the main thread, and only the chunks around the player are loaded.
- **three.js** draws everything: instanced trees and grass that sway in the wind, an animated sea with reflections, rivers and lakes with ripples and shore foam, a day/night sky, weather, and bloom at dusk and night (`render/`).
- **Rapier** handles physics (`physics/physics.ts`): the player controller, model-shaped colliders on buildings and trees, pushable props, and cars.
- **The player** (`player/`) can walk, run, jump, swim, dive, fly with a rocket booster, and switch between first and third person. The five characters are Microsoft Rocketbox avatars with idle, walk and run animations.
- **Things that work** (`logic/`). Doors swing open, lamps and fires light up, bells ring, benches can be sat on, props can be pushed, and cars can be driven (one is parked at every spawn, plus any vehicle the AI adds). Animals graze, wander and run away from you.
- **Performance** (`render/deviceTier.ts`, `render/resolution.ts`). Smaller devices get a shorter view distance. The render resolution drops automatically when the frame rate does, or you can fix it with **R**.

## 4. Changing the world while you play

Press **T** and type a change. The browser sends the request to `POST /api/edit` along with context: the world's places, and what the crosshair is pointing at.

The AI answers with a list of **edit operations** (`web/src/core/ops.ts`), never code:

`addPlace`, `removePlace`, `movePlace`, `updatePlace`, `setAtmosphere`, `setClimate`, `setTerrain`, `setWater`, `setPalette`, `addPath`, `setNature`, `setFlora`, `addLife`

The operations are validated like a recipe, and the change is shown as a preview. **Enter** applies it and **Esc** cancels. **U** undoes it. Changes to time or weather apply instantly, while changes to land or places rebuild the affected world.

## 5. Finding a 3D model for anything

When the AI names something ("giraffe", "red lighthouse", "space rover"), the **model finder** (`backend/app/assets.py`) looks for a model in this order:

1. **The bundled library.** 186 curated Quaternius CC0 models with tags (`backend/assets/library`).
2. **The cache.** Models found earlier and approved.
3. **AI analysis** (`asset_analyse.py`). What the object is, its size and colour, and whether it is likely to exist online.
4. **Online search.** Poly Pizza, and Sketchfab if a token is set, over up to four search terms. Only CC0 or CC-BY models are accepted. A vision model (`asset_vision.py`) looks at each candidate's picture to confirm it is the right object. A model that is right except for its colour is recoloured in code.
5. **Meshy text-to-3D** (optional, landmarks only, capped at `MESHY_MAX_GENERATIONS`).
6. **Built from parts.** If nothing else works, the AI describes the object as simple shapes (boxes, cylinders, cones and so on) in JSON, and the browser builds it (`asset_procedural.py`, `web/src/api/parts.ts`).

Each place card says where its model came from, and credits the author and license of models found online. Only 3D models are cached. Every prompt gets a fresh brief and a fresh world from the AI.

## 6. The start screen

The world behind the start screen (`web/src/ui/showcase.ts`) is hand-written and built by the same engine, with a camera that flies through it (`web/src/ui/menuFlight.ts`). Its models ship with the site (`web/public/models/bundled`), so it works even before the backend has woken up. "Watch the demo" runs a roughly 70-second self-playing tour through the real pipeline (`web/src/logic/director.ts`).

## Project layout

```
backend/
  app/
    main.py           API routes, rate limits, CORS
    service.py        brief, world and edit calls; repair and validation
    prompts.py        the prompts sent to the LLM
    schemas.py        Pydantic recipe and ops schemas
    llm.py            OpenAI-compatible client with retries and backup models
    assets*.py        model finder (library, cache, search, vision, Meshy, parts)
  assets/library/     bundled CC0 models and their manifest
shared/fixtures/      example recipe and art queries shared by both sides
web/
  src/
    core/             recipe and ops schemas (Zod), seeded RNG, sizes
    world/            deterministic world building (pure TypeScript)
    render/           three.js rendering, chunk worker, water, sky, models
    physics/          Rapier world
    player/           controller, avatar, characters, jetpack
    logic/            interactions, vehicles, wildlife, demo director
    api/              backend client
    ui/               start screen, HUD, mini-map, tutorial, notices
  public/models/      bundled characters, car and start-screen models
```

## Deployment

- **Backend on Render (Docker).** Dockerfile `backend/Dockerfile`, build context `.` (the repo root), health check `/api/health`. Set the variables from `backend/.env.example`, with `CORS_ORIGINS=https://<your-vercel-domain>`.
  - Do not set `MESHY_API_KEY` on a free (ephemeral) instance. The Meshy spend cap is counted in `backend/assets/.generated-attempts.json`, which is wiped on every restart.
- **Frontend on Vercel.** Root directory `web`, framework Vite, turn on "Include files outside the Root Directory in the Build Step", and set `VITE_API_URL=https://<your-render-service>.onrender.com`.

## Credits

**3D art**
- **Quaternius** (CC0 1.0): Stylized Nature MegaKit, Medieval Village MegaKit, Ultimate Animated Animal Pack, the Sports Car, and the 186 models in `backend/assets/library/quaternius/` (from https://poly.pizza/u/Quaternius).
- **Microsoft Rocketbox** (MIT, Copyright (c) 2020 Microsoft, https://github.com/microsoft/Microsoft-Rocketbox): the playable characters Street, Tourist, Builder, Police and Woman. License notice in `web/public/models/characters/ROCKETBOX-LICENSE.txt`.
- **Poly by Google** (CC-BY 3.0, via Poly Pizza): Cow, Sheep and Fountain, used on the start screen.
- Models found while you play come from Poly Pizza or Sketchfab and are CC0 or CC-BY only. Each is credited in its in-game place card. Models made with Meshy are labelled "Generated with Meshy".

**Software:** three.js (MIT), Rapier / @dimforge/rapier3d-compat (Apache-2.0), simplex-noise (MIT), Zod (MIT), Vite (MIT), FastAPI (MIT), Pydantic (MIT), httpx (BSD-3-Clause), Uvicorn (BSD-3-Clause), thinking-orbs by Jakub Antalik (MIT).
