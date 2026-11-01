# Open-world prompt-to-world: build plan

**Goal:** describe a world in plain language, then walk around and interact with it in the browser. No quests, keys or puzzles. Just a living environment you can explore, touch and change by talking to it.

**Hackathon requirement:** plain language → 3D scene **and working logic**. Here "working logic" means the environment behaves: day and night, weather, doors and lights you can use, objects you can push, animals that react, and live edits by voice or text.

**Deadline:** Nov 11, 2026, 16:30 CEST. Needs a public repo, a hosted browser demo, a video under 3 minutes, and a short description.

---

## 1. How the competitors build terrain and place things (read from their source)

### LevelProof ([fexx301/levelproof](https://github.com/fexx301/levelproof), no license: ideas only, no code reuse)

**Terrain** (`src/render/scenery.ts`, `terrain()`):
- One round flat mesh (`RingGeometry`, 96×28 segments) under the level.
- Its height is just **two sine waves multiplied together**, `sin(x)·cos(z) + sin(x+z)`, scaled by a fixed number per environment (desert 90, snow 45, others 38, city 0).
- It is pushed flat near the level so the grid sits on level ground.
- Colour per environment, with small sine-based shading.
- Water ("sea") is a separate flat plane with sine waves; each piece of land in the sea is a sand **cylinder**.
- The far "horizon" is a fake ring of silhouettes.

**Placement:**
- The AI picks a grid square (x, z from 0 to 15) for each landmark.
- Code puts it at the centre of that square, on top of the highest floor there or on the ground.
- Up to 4 props share a square by using its 4 corners.
- Each prop is turned to face the nearest floor tile.

**Scatter (trees, rocks, plants):**
- Squares up to 6 around the level are visited one by one.
- A random roll decides whether something goes there, with a higher chance further out.
- What goes there is a weighted pick from a per-environment table.
- Tall things are kept off the side the camera looks from.
- **Capped at 64 items** (46 in the city).
- Static items are merged into one mesh per material, which keeps draw calls low.

**Objects:** all built from three.js basic shapes (about 44 cylinders, 39 boxes, 19 cones…), with no model files except one character.

**Movement:** you hop from tile to tile (turn-based). There's no free walking.

### WorldOps ([bolajiev/worldops-ai](https://github.com/bolajiev/worldops-ai), MIT)

- **Ground:** a **flat 260×260 plane** plus a raised box "board" the town sits on, like a tabletop. No terrain height at all.
- **Placement:** the AI writes **raw `[x, y, z]` coordinates** for every object (prompt: "all positions must be inside [-width/2, width/2]").
- Code only **clamps** them inside the world limits (`scene-normalize.ts`) and adds a main road if the AI forgot one. **There is no overlap check**, so two buildings can end up in the same spot.
- Limits: 100 objects and 30 characters. All objects come from a fixed catalogue of shapes.

### prompt-to-playable ([bolajiev/prompt-to-playable](https://github.com/bolajiev/prompt-to-playable), MIT)

- Has an **"open world" mode**, but the terrain is **always flat** (`terrain: { type: "flat" }`).
- The world is about 60×60 units and capped at **24 objects**.
- The AI writes raw coordinates and is told to keep props "at least 4 units apart".
- Objects are made from basic shapes (box, sphere, cone, "tree" and so on).
- **A good idea worth taking:** every world gets **interactive controls**, such as a "Night mode" toggle, a "Wind" slider that spins a windmill, and buttons that spawn things. Clicking a labelled prop opens an info panel.
- It also checks reachability on a coarse grid (`pathExistsOnGrid` in `sanity.ts`).

### ai-game-engine ([sumitaich1998/ai-game-engine](https://github.com/sumitaich1998/ai-game-engine), MIT)

- One **procedural city** (a 5×5 grid of blocks, roads and a beach) built by code at startup. Same city every time, so it isn't generated from your words.
- Things you spawn by chat appear **"near the player"**, with no ground or overlap check.
- Ten hard-coded famous landmarks.
- **`run_code` lets the AI run any JavaScript in your tab.**
- The AI only works with a **local bridge on your own machine** (the Cursor CLI). The public demo has no AI.

### Others

- **Anima:** a fixed photo-scanned splat (`nike.splat`) plus 10 prop types around a table.
- **Procedural Detective:** 5 hand-made room kits.
- **TransitLab:** one fixed intersection.

---

## 2. Their weak spots and how we beat each one

| Their weakness | Who has it | What we do instead |
|---|---|---|
| Terrain is **sine waves or a flat plane**, decoration only, and you can't walk on it | LevelProof, WorldOps, prompt-to-playable | **Real noise-based terrain** (fBm simplex: hills, valleys, ridges, rivers) with a physics collider you walk on |
| The world is a **small fixed box** (16×16 grid, 72×52, 60×60) | all | **Endless chunks** generated around the player from a seed |
| **Trees and props float or sink** on hilly ground: LevelProof puts scatter at a fixed `GROUND_Y` while its terrain has waves of up to ±90 units | LevelProof | Sample the terrain height at every placement; tilt to the slope where it fits |
| The AI writes **raw coordinates** and code only clamps them: **overlaps**, objects in water, buildings on cliffs | WorldOps, prompt-to-playable, ai-game-engine | The AI gives **relations** ("on the highest hill", "by the river"); a **placement solver** scores real spots (height, slope, water, distance, free space) |
| **Tiny object budgets** (24, 64, 100) | all | Instanced scatter: thousands of trees and rocks at the cost of a few draw calls |
| **Basic shapes only**, everything looks blocky | all | Tagged CC0 model libraries, open AI 3D models, a few Meshy hero models, and procedural shapes only as fallback |
| Scatter is **random per square** and ignores the land | LevelProof | Scatter follows **biome × height × slope × moisture**: pines high up, reeds by water, nothing on cliffs |
| **No free movement** (tile hops) or a fixed camera | LevelProof | First- and third-person walking, running and jumping (Rapier capsule) |
| **The AI can run arbitrary code** (`run_code`) | ai-game-engine | Never. Typed operations only, validated with Zod |
| **The AI needs a local install** | ai-game-engine | Hosted API, plus an offline mock mode so judges always see it work |
| **Ground isn't shaped to fit buildings** | all | Flatten a pad under each building and blend its edges into the terrain |

---

## 3. Our design: terrain and placement, step by step

```
"a misty pine valley with a river, a small fishing village on the bank,
 and an old stone watchtower on the highest hill"
      │
      ▼
① AI → WORLD RECIPE (small JSON, validated with Zod; the AI never gives coordinates)
      │
      ▼
② TERRAIN      seeded noise → height map, split into chunks around the player
③ WATER        rivers carved along downhill paths, lakes in hollows, a sea level
④ BIOMES       temperature + moisture + height → grass / forest / snow / sand / rock
⑤ PLACE        relations → best spot (solver) → flatten a pad → build
⑥ CONNECT      roads/paths along the cheapest slope route (A*)
⑦ SCATTER      trees, rocks, grass by biome rules, kept out of roads, pads and water
⑧ MODELS       library → cache → open AI model → Meshy (hero objects only)
⑨ LIFE         environment logic: day/night, weather, interactive objects, animals
⑩ PLAY         walk, run, jump; talk to the world to change it live
```

### ① The world recipe (all the AI writes)

```jsonc
{
  "seed": 4821,
  "terrain":   { "shape": "valley", "roughness": 0.55, "height": 0.7, "seaLevel": 0.18 },
  "climate":   { "biome": "pine_forest", "temperature": 0.35, "moisture": 0.7 },
  "water":     [{ "kind": "river", "through": "valley_floor" }],
  "places": [
    { "id": "village", "kind": "settlement", "size": "small", "style": "fishing",
      "where": [{ "by": "river" }, { "on": "flat" }] },
    { "id": "tower", "kind": "landmark", "asset": "stone watchtower, ruined",
      "where": [{ "on": "highest_hill" }, { "visible_from": "village" }] }
  ],
  "paths":     [{ "from": "village", "to": "tower" }],
  "atmosphere":{ "time": "dawn", "weather": "mist", "fog": 0.6 },
  "life":      [{ "kind": "deer", "count": 6, "in": "forest" }, { "kind": "birds", "near": "village" }]
}
```

Edits later are small typed operations (`addPlace`, `movePlace`, `setAtmosphere`, `addWater`, `removePlace`, `setClimate`, `spawnObject`…), validated, previewed, then applied (the TransitLab idea), with undo.

### ② Terrain (code, deterministic)

- **Height:** layered simplex noise (fBm, 5–6 layers). The recipe's `shape` picks a recipe on top: `valley` lowers a corridor, `mountains` adds ridged noise, `island` drops edges below sea level, `plains` flattens it.
- **Chunks:** 64×64 m tiles in a 5×5 ring around the player, built in a Web Worker so the frame rate holds. A low-detail outer ring is shown behind fog. Same seed plus chunk position always gives the same tile, so nothing is stored.
- **Physics:** a Rapier heightfield collider for each nearby chunk.

### ③ Water

- Sea or lake: a water plane at `seaLevel`, with a simple shader.
- River: start at a high point and walk downhill (steepest descent) to the sea, carving the terrain along the way. Also store the river line for placement ("by the river").

### ④ Biomes

Every point gets `(height, temperature, moisture, slope)`. A small rule table picks the ground colour and scatter set, for example:
- high and cold → snow and rock
- low and wet → marsh and reeds
- steep → bare rock with no trees

### ⑤ Placement solver (the "intelligent" part, and where we beat everyone)

For each place in the recipe:
1. Sample about 2,000 candidate points in the loaded area (or the area the relation points to).
2. **Score** each point against its relations:
   - `on: highest_hill` → height
   - `on: flat` → low slope
   - `by: river` → distance to the river line
   - `visible_from: X` → a line-of-sight test against the height map
   - `away_from`, `north_of` and similar → direction and distance
3. **Hard rules:** not underwater, slope under the limit, no overlap with already placed things (a circle per footprint).
4. Pick the best spot, **flatten a pad** under the footprint and blend its edge, then place the model at the real ground height.
5. **Settlements:** a small generator lays plots along a short road spine, with house variants and a well or market in the middle.
6. Each placement records *why* it was chosen ("highest point within 300 m, visible from the village"). Show this in the UI: judges can see the intelligence.

### ⑥ Roads and paths

A* over the height map, where cost = distance + slope penalty + water penalty, and bridges are allowed where the path crosses a river. Turn the result into a ribbon mesh on the terrain, and flatten the terrain slightly under it.

### ⑦ Scatter

- Poisson-disc points (even spacing) for each chunk, filtered by biome rules, slope, water, roads and building pads.
- Draw them with **InstancedMesh**: one draw call per model type, so thousands of trees stay smooth.
- Random size and rotation, seeded per chunk so the result is always the same.

### ⑧ Models (cheap first, Meshy last)

| Tier | Source | Cost |
|---|---|---|
| 1 | Tagged CC0 packs: Kenney, Quaternius, Poly Pizza, Poly Haven (trees, rocks, houses, props) | free |
| 2 | Shapes built in code (walls, fences, towers, docks) | free |
| 3 | Open text/image-to-3D: TRELLIS (MIT), Hunyuan3D-2, TripoSR (HF Spaces or rented GPU) | free to cents |
| 4 | Meshy API for 3–5 hero objects in the demo video | paid |

Every generated GLB is saved under its normalized description and reused. Pre-generate the models for the demo prompts ahead of time. Badge each object: `library`, `generated · TRELLIS` or `generated · Meshy`.

### ⑨ Environment logic ("working logic" with no quests)

| System | What the player can do or see |
|---|---|
| Day/night cycle | The sun moves, lamps and windows light up at night, stars come out |
| Weather | Rain, snow, mist and wind change fog and particles; trees sway more in wind |
| Interactive objects | Open and close doors, switch lamps on and off, light a campfire, ring a bell, sit on a bench (press E) |
| Physics objects | Push barrels and crates, knock things over (Rapier rigid bodies) |
| Water | Swim or wade, slow down in water, splashes |
| Wildlife | Deer graze and run away when you get close, birds scatter, fish jump. Simple state machines, no AI calls |
| Live edits | "Make it night", "put a lighthouse on that cliff", "add a bridge here", resolved from where you stand and look (the ai-game-engine idea, done safely) |
| Info on click | Click a landmark to read its AI-written description (the prompt-to-playable idea) |

All of this is data plus fixed code. The AI only sets values or adds objects through typed operations, and never writes code.

### ⑩ Play

- First- and third-person character controller (Rapier capsule): walk, run, jump, and `E` to interact.
- A command bar that opens mid-play (`T`). Every command is sent with the player's position, facing direction and the object under the crosshair, so "here", "that" and "behind me" work.

---

## 4. Checks (cheap, honest, shown in the UI)

- Every place sits on land, under the slope limit, not buried, not overlapping.
- Every place can be reached on foot from the spawn point (A* over walkable terrain).
- Every relation was actually satisfied, or the UI says plainly which one wasn't ("no hill high enough; placed on the highest point found").

---

## 5. Stack

- **Frontend:** Vite + TypeScript + three.js · zod · zustand · @dimforge/rapier3d-compat · simplex-noise · Web Workers for chunk generation.
- **Backend:** a Vercel function `/api/world` that holds the model key, plus a cache.
- **Offline:** a mock provider with 3–4 pre-made recipes.

## 6. 10-day build order (Nov 1 → Nov 11)

| Day | Deliverable |
|---|---|
| 1 | Vite + three.js app, seeded noise terrain in chunks, sky, fog, walking character with Rapier |
| 2 | Biomes, water plane, river carving, instanced scatter, performance pass |
| 3 | Recipe schema (Zod), mock provider with 3 recipes, the recipe drives terrain and climate |
| 4 | Placement solver + pads + "why here" labels; settlement generator |
| 5 | Roads (A*), bridges, CC0 model library with tags, model resolver and cache |
| 6 | `/api/world` with a real model, streaming the build, edit operations, preview and undo |
| 7 | Environment logic: day/night, weather, interactive objects, physics props, wildlife |
| 8 | In-play command bar (context-aware), TRELLIS/Meshy hero models, checks in the UI |
| 9 | Polish, mobile controls, deploy, README + decision log, self-running Director Mode demo |
| 10 | Video (under 3 minutes), description, final test, submit before 16:30 CEST |

**Cut first:** wildlife, bridges, TRELLIS. **Never cut:** walkable terrain, AI recipe → placement, interactive objects, offline demo mode.
