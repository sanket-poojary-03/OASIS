# WorldSeed: design spec

**Status:** approved for build · **Date:** 2026-11-01 · **Deadline:** 2026-11-11 16:30 CEST (Victoria VR AI Builder Hackathon 2026)

WorldSeed is a working name; rename freely.

## 1. What we are building

A browser app where you **describe a world in plain language and then walk around inside it straight away**.

1. You type a prompt, for example "a misty pine valley with a river, a small fishing village on the bank, and an old watchtower on the highest hill".
2. An LLM turns it into a short **world recipe** (JSON). It never writes code, and never writes coordinates unless the user gives them.
3. Deterministic code builds an **endless 3D world** from the recipe: noise terrain, rivers, biomes, intelligently placed landmarks and villages, roads, and trees and rocks.
4. You **walk, run, jump and swim** in first person, and interact: open doors, switch lights, light campfires, ring bells, sit, and push barrels. Day turns to night, weather changes, and animals react to you.
5. You **change the world by typing while you play** ("make it night", "put a lighthouse there", "remove that tower"). The edit is previewed, confirmed, applied live, and can be undone.

No quests, keys or puzzles. The "working logic" is the environment itself: time, weather, interactive objects, physics, wildlife, and live edits.

## 2. Hackathon requirements (must all be true at submission)

- Turns plain language into 3D scenes **and working logic**.
- Runs in the browser. A separate backend is allowed.
- Public code repository.
- Hosted browser demo that judges can open; the backend must stay up during judging.
- Demo video **under 3 minutes**.
- Short written description: what was built, the problem, how AI is used, and the chosen focus category (**Prompt-to-World Creation**).
- Judged on originality, intelligent interaction, real browser functionality, extensible AI workflows, polished UX, performance, and visual quality.

## 3. Why this wins (competitor gaps, see `docs/research/competitor-analysis.md`)

| Competitor weakness | Our answer |
|---|---|
| Terrain is sine waves or a flat plane, decorative, not walkable | Noise terrain (fBm, ridged), rivers, lakes, biomes, a physics collider |
| Small fixed boxes (16×16 grid, 72×52, 60×60) | Endless 64 m chunks streamed around the player |
| The LLM writes raw coordinates and code only clamps them: overlaps, objects in water | Relations ("highest", "by_water", "near X") resolved by a placement solver with hard constraints |
| Props float or sink on hills | Every placement samples the real terrain height; a pad is flattened under buildings |
| 24–100 object caps, everything blocky | Instanced scatter (thousands), CC0 model library plus generated hero models |
| Tile-hop movement | Free first-person controller (Rapier) |
| LLM can run arbitrary JS (`run_code`) | Typed operations only, validated by Zod and Pydantic |
| AI needs a local install | Hosted API plus an offline mock, so the demo always works |

## 4. Architecture

```
┌────────────────────────── Browser (web/, TypeScript + three.js) ──────────────────────────┐
│ UI (start screen, command bar, place card, checks)                                         │
│   │ prompt / edit text                                                                     │
│   ▼                                                                                        │
│ api/client.ts ──HTTP──► backend (falls back to api/localMock.ts when offline)              │
│   │ Recipe | Op[]                                                                          │
│   ▼                                                                                        │
│ core/recipe.ts + core/ops.ts (Zod validation, applyOps)                                    │
│   ▼                                                                                        │
│ world/ (pure, deterministic, unit-tested)                                                  │
│   field.ts (height, water, pads, roads) → placement.ts → settlement.ts → roads.ts          │
│   → checks.ts → build.ts (BuiltWorld)                                                      │
│   ▼ FieldSnapshot                                                                          │
│ render/chunkWorker.ts (Web Worker: chunk mesh + scatter) → render/chunkManager.ts          │
│ render/: atmosphere (sky, sun, fog, rain, snow), water, roads, scatterAssets, worldObjects │
│ physics/ (Rapier trimesh terrain, building colliders, dynamic props)                       │
│ player/ (pointer lock + kinematic character controller, swimming)                          │
│ logic/ (interactions, wildlife)                                                            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────── Backend (backend/, Python FastAPI) ────────────────┐
│ /api/world  prompt → Recipe       (LLM → JSON → Pydantic → retry)  │
│ /api/edit   recipe + text + context → Op[]                         │
│ /api/assets/resolve  description → library | cache | Poly Pizza | │
│                      Sketchfab | Meshy job (model finder, §10)     │
│ mock provider (no API key), file cache, rate limit                 │
│ /files/library, /files/generated (GLB static files)                │
└────────────────────────────────────────────────────────────────────┘
shared/fixtures/  recipes + ops JSON validated by BOTH Zod and Pydantic (the contract)
```

Rules:
- **The LLM proposes, code decides.** Every LLM output is validated (Pydantic on the server, Zod in the browser) before it is used.
- **World generation is deterministic.** The same recipe and seed give the same world, which is what makes undo, caching and tests work.
- **Terrain and placement run in the browser**, because they must run in real time as you walk. **AI and model work runs in Python.**

## 5. Units and constants

- 1 unit = 1 metre; y is up; **north is −z**.
- `CORE_HALF = 512`: authored places live in the 1024 × 1024 m core. Terrain continues endlessly beyond it as procedural filler.
- Chunks are 64 m with 32 segments (2 m vertex spacing). The view radius is 3 chunks (7 × 7). Colliders exist only for the 3 × 3 around the player.
- Terrain amplitude is `20 + terrain.height × 140` m; sea level is `seaLevel × amplitude`.

## 6. The world recipe (the contract)

TypeScript source of truth: `web/src/core/recipe.ts`. Python mirror: `backend/app/schemas.py`. Examples: `shared/fixtures/recipes/*.json`.

```jsonc
{
  "version": 1,
  "title": "Misty Pine Valley",
  "seed": 4821,                                   // the server overrides it with a hash of the prompt
  "terrain":   { "shape": "plains|hills|valley|mountains|island|canyon",
                 "roughness": 0-1, "height": 0-1, "seaLevel": 0-1 },
  "climate":   { "temperature": 0-1, "moisture": 0-1 },
  "water":     { "river": bool, "lake": bool },
  "atmosphere":{ "time": "dawn|day|dusk|night", "weather": "clear|rain|snow|mist|storm",
                 "fog": 0-1, "wind": 0-1 },
  "places": [ {                                   // max 12
      "id": "village",                            // ^[a-z][a-z0-9_-]{1,31}$
      "kind": "settlement|landmark|structure|prop",
      "label": "Riverside fishing village",
      "asset": "wooden fishing cottage",          // model description, used for model lookup
      "style": "wooden fishing",                  // optional
      "size": "small|medium|large",               // default medium
      "interaction": "none|door|light|fire|sound|sit|push",
      "description": "…",                        // optional, shown on the place card
      "where": [ Relation, … ]                    // max 4
  } ],
  "paths": [ { "from": "village", "to": "tower" } ],          // max 12, roads
  "life":  [ { "kind": "deer|birds|rabbits", "count": 1-20 } ] // max 4
}
```

**Relations:**
- `highest`, `lowest`, `flat`, `by_water`
- `near {target, maxDist=80}`, `far_from {target, minDist=200}`
- `direction {dir: north|south|east|west, of?}`
- `visible_from {target}`
- `at {x, z, y?}`: exact; used for "here/there" and explicit coordinates. The optional `y` is the surface height under the crosshair, used for small props placed **on** something ("put a candle on this table"). It only applies to `kind: "prop"`.

**Validation:** ids must be unique, every path endpoint and relation target must exist, and unknown fields are rejected.

## 7. Edit operations

`web/src/core/ops.ts`, mirrored in Python:

- `addPlace {place}`, `removePlace {id}`, `movePlace {id, where}`
- `updatePlace {id, label?, asset?, interaction?, description?}`
- `setAtmosphere {time?, weather?, fog?, wind?}`
- `setClimate {temperature?, moisture?}`, `setTerrain {shape?, roughness?, height?, seaLevel?}`, `setWater {river?, lake?}`
- `addPath {from, to}`, `addLife {kind, count}`

**Edit context sent to the LLM:**
- player `{x, z}`
- `lookAt {x, z, y}`: the point under the crosshair (terrain or an object's surface)
- `lookingAt`: the id of the place under the crosshair
- placement summaries

"Here", "there" and "where I'm looking" become `{"rel":"at","x":lookAt.x,"z":lookAt.z}`. "On this table" adds `"y":lookAt.y` (props only). "That tower" becomes `lookingAt`. "Bring a house near this" becomes `addPlace` with `near {target: lookingAt}` + `flat`, solved like any other place. Any object name is allowed, even unexpected ones ("a giraffe"); the model finder (§10) fetches a model for it.

**Flow:** the client applies ops with `applyOps`, shows a plain-language preview, applies on Enter and cancels on Esc. Undo restores the previous recipe and placements.

**Rebuild rule:**
- terrain, climate or water changed → re-solve all placements
- otherwise → keep placements of unchanged places and solve only new or moved ones
- atmosphere-only change → no geometry rebuild

## 8. Generation pipeline (deterministic, `web/src/world/`)

1. **Field** (`field.ts`):
   - fBm simplex height shaped by `terrain.shape`. Valley and canyon follow a meandering centreline that tilts down to the south; island falls off radially.
   - River: steepest-descent trace in 8 m steps (`river.ts`), stopping at the sea, the core edge, or a pit (which becomes a lake). It is carved 5 m deep and about 16 m of it is wet.
   - Optional extra lake at the lowest core point.
   - Pads flatten under buildings (never inside water channels). Roads are recorded for scatter exclusion.
   - Queries: `heightAt`, `slopeAt`, `isWater`, `waterDistance`, `waterSurfaceAt`, `isReserved`, `detailNoise`.
2. **Biomes** (`biome.ts`): `classifyBiome` from height, slope, temperature, moisture and nearness to water and sea → sand, grass, forest, pine, snow, rock, desert or marsh.
3. **Placement** (`placement.ts`):
   - Places are ordered by dependency.
   - For each place, sample 1,500 candidates and reject any that are outside the core, wet, too steep, or overlapping.
   - Score each relation 0–1, average the scores, and pick the best. If nothing fits, relax the limits once, then fall back to the centre with a warning.
   - Record **reasons** ("high ground (142 m)", "12 m from water", "visible from village").
   - Flatten a pad under everything except props.
4. **Settlements** (`settlement.ts`): a spine road through the centre, houses on both sides facing it (6, 12 or 20 by size), and a well or market in the middle.
5. **Roads** (`roads.ts`): A* on an 8 m grid with cost `distance × (1 + 12 × slope) + 60 if water`, Chaikin smoothing, and a bridge flag per segment over water.
6. **Spawn**: just outside the first settlement, otherwise near the centre, on dry, gentle ground.
7. **Checks** (`checks.ts`): each place on solid ground with no warnings, and each place reachable on foot from the spawn (BFS on an 8 m grid with slope < 0.9; swimming allowed).
8. **Chunks** (`chunkData.ts`, run in a worker): vertices, analytic normals, biome vertex colours, indices, and scatter (4 m jittered cells seeded by global cell index, so chunk borders are seamless).

## 9. Rendering and play

- **three.js WebGL renderer:** ACES tone mapping, shadows on (a ±60 m shadow box that follows the player), `FogExp2`.
- **Atmosphere:** `Sky` shader, a sun moving with the time of day (one game day = 24 real minutes), hemisphere light, rain and snow particles following the player, fog density from weather. Night is 19:30–06:00.
- **Water:** a sea plane that follows the player, a river ribbon, lake discs.
- **Roads:** a ribbon draped on the terrain; bridges are boxes.
- **Scatter:** CC0 pack models (Quaternius Stylized Nature) per kind, merged and drawn as one InstancedMesh per kind per chunk. Procedural low-poly geometry is only the fallback.
- **Grass:** instanced tufts every ~2 m on grassy biomes in the 3×3 chunks around the player, swaying in a vertex-shader wind driven by `atmosphere.wind`.
- **Objects:** each place, building and prop appears instantly as a procedural placeholder (chosen by keywords in `asset`). It is swapped for the model-finder result (library, online or generated GLB), scaled to a target height, and given a box collider. Village houses use `variant` so each house gets a different prefab.
- **Post-processing:** bloom (stronger at night) plus tone mapping, so windows, lamps, fires and the lighthouse glow.
- **Player:** pointer lock, WASD, Shift to run, Space to jump or swim up, Rapier kinematic character controller (capsule), swimming when below the water surface, and respawn if it falls through the world.
- **Interaction:** `E` raycasts 4 m:
  - door: swings open
  - light: lamp on/off, and automatically on at night
  - fire: campfire flame and light
  - sound: synthesized bell
  - sit: lowers the camera and locks movement
  - push: dynamic rigid-body impulse
  - House windows glow at night.
- **Wildlife:** deer graze, wander, and flee from the player within 15 m. Birds circle in flocks and scatter when the player comes within 20 m. Deer and rabbits use animated pack models (idle, walk and run clips) when available.
- **Player body:** an animated CC0 character (KayKit Adventurers). **V** toggles a third-person camera 5 m behind; idle, walk and run animations follow movement.

### Art direction (the visual bar)
- **One art family:** Quaternius (Stylized Nature MegaKit, Medieval Village MegaKit, Ultimate Animated Animal Pack) plus a KayKit Adventurers player. All are CC0 and glTF, from the official pages. Mixing styles is what makes games look cheap.
- **House prefabs:** 8–10 houses assembled once from the village pieces (or complete buildings if a pack has them), tagged so villages rotate through them.
- **Why not code-built props:** LevelProof builds all its props from three.js primitives (the only file it loads is one CC0 character), polished with rounded edges, colour variants and bloom on a small, close-framed board. Pack models plus grass, bloom and an eye-level camera beat that, in an open world.
- **Out of scope for v1:** terrain texture splatting (blended grass/rock/snow textures by slope). Vertex-coloured biomes stay; texture splatting is a stretch goal.

## 10. Backend (Python 3.11+, FastAPI)

| Endpoint | In | Out |
|---|---|---|
| `GET /api/health` | – | `{ok, provider: "live"\|"mock", model}` |
| `POST /api/world` | `{prompt}` | `{type:"recipe", recipe, notes[], source}` or `{type:"unsupported", reason, source}` |
| `POST /api/edit` | `{recipe, prompt, context}` | `{type:"ops", ops[], notes[], source}` or `{type:"unsupported", reason, source}` |
| `POST /api/assets/resolve` | `{query, kind, allowGenerate, allowOnline, variant}` | `{status:"ready"\|"pending"\|"none", source, url?, jobId?, credit?}` |
| `GET /api/assets/jobs/{id}` | – | same shape as resolve |

`source` is one of `live`, `mock` or `cache` for world and edit calls, and `library`, `online` or `generated` for assets.

**LLM:**
- Any OpenAI-compatible chat endpoint, configured with `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. Use a cheap, fast model, such as Gemini Flash-Lite through OpenRouter or Google's OpenAI-compatible endpoint, or DeepSeek.
- Output is JSON, validated by Pydantic. On failure there is one retry that includes the validation error, then a fallback to the mock.

**Other backend behaviour:**
- **Mock:** keyword match to the four fixture recipes. A regex edit parser handles time, weather and season, add/put X here, and remove that.
- **Cache:** file JSON keyed by sha256 of kind, prompt-version, model and input.
- **Rate limit:** 20 world or edit calls per IP per 10 minutes, plus a global daily cap `LLM_DAILY_CAP` (default 300).
- **Model finder** (for any object, including unexpected ones). It tries, in order:
  1. **Local CC0 library**: manifest tags from `scripts/build_manifest.py` plus hand tags and synonyms (cottage → house), token overlap of at least 0.5, and `variant` choosing among equal matches. Instant.
  2. **Cache** of everything fetched or generated before. Instant.
  3. **Poly Pizza API** (`POLY_PIZZA_KEY`, free): 10k+ low-poly GLBs in the same style family. About 1–2 s.
  4. **Sketchfab Download API** (`SKETCHFAB_TOKEN`, free): downloadable Creative Commons models, GLB. About 2–5 s.
  5. **Meshy** text-to-3D, landmarks only (`allowGenerate`), capped by `MESHY_MAX_GENERATIONS` (default 5). About 30–90 s, run as a polled job.
  6. **Procedural placeholder** in the browser, so the edit never fails.

  Online results:
  - are kept only if licensed **CC0 or CC-BY** (no NC or ND) with 30k triangles or fewer;
  - are picked from the top 5 by title match, or by one cheap LLM call when a key is set (`ASSET_LLM_PICK`);
  - are downloaded once into the cache;
  - carry a `credit` shown in the place card and `docs/CREDITS.md`.

  `allowOnline: false` keeps the base look (scatter, player, animals) library-only.
- **Security:** LLM output is data only. There is no code execution and no file paths from user input, CORS is limited by `CORS_ORIGINS`, and the API keys live only on the server.

## 11. Non-goals (v1)

Multiplayer, VR headset mode, accounts, persistence beyond a share link, quests or objectives, NPC dialogue brains, TRELLIS (its free Hugging Face Spaces are mostly image-to-3D and often queued or down, so it's a possible later free generator between Sketchfab and Meshy), terrain texture splatting, and terrain sculpting by brush.

## 12. Acceptance criteria

1. Each of the four fixture prompts produces a world in under 5 s on a mid-range laptop (mock mode), and the player can walk at 45 fps or better at 1080p.
2. No placed object is in water, overlapping another object, or floating or buried by more than 0.5 m (asserted by unit tests on all fixtures).
3. Live LLM mode: 8 of 10 test prompts give a valid recipe on the first or second attempt.
4. Edits with "here/there" land within 2 m of the crosshair point. Undo restores the exact previous world.
5. With the backend unreachable, the start screen still generates fixture worlds and basic edits (time, weather, add-at-crosshair) still work.
6. `npm test` (web) and `pytest` (backend) pass. `npm run build` succeeds.
7. Deployed: a frontend URL and a backend URL, with health green.
8. Visual bar: at eye level, trees, rocks, houses, animals and the player are pack models (not primitives); grass sways; night lights glow. "Put a giraffe here" shows a real model within about 5 s with a Poly Pizza key set.
