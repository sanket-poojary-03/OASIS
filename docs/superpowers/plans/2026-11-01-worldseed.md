# WorldSeed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser app that turns a plain-language description into an endless, walkable, interactive 3D world, editable live by typing.

**Architecture:**
- An LLM (Python FastAPI backend) turns text into a validated JSON *recipe* or edit *ops*. It never writes code.
- Deterministic TypeScript world code in the browser builds terrain, water, biomes, placements, settlements, roads and scatter from the recipe.
- three.js renders it in streamed chunks generated in a Web Worker. Rapier provides physics and the character controller.
- Shared JSON fixtures are the contract between the two sides.

**Tech Stack:**
- Web: Vite, TypeScript, three.js, @dimforge/rapier3d-compat, simplex-noise, zod, vitest
- Backend: Python 3.11+, FastAPI, Pydantic v2, httpx, pytest

**Spec:** `docs/superpowers/specs/2026-11-01-worldseed-design.md`. Read it first.

## Global Constraints

- Deadline: **2026-11-11 16:30 CEST**. Submission needs a public repo, a hosted demo, a video under 3 minutes, and a written description.
- Units: metres, y up, **north = −z**. `CORE_HALF = 512`. `CHUNK_SIZE = 64`, `CHUNK_RES = 32`, `VIEW = 3`.
- The LLM never emits code. Every LLM output is validated (Pydantic server-side, Zod client-side) before use.
- World generation is deterministic for a given recipe. Never use `Math.random()` in `web/src/world/**`; use `mulberry32`.
- `web/src/core/**` and `web/src/world/**` are pure (no `three`, no DOM) and unit-tested.
- Pydantic dumps sent to the browser always use `model_dump(exclude_none=True)`, because Zod optional fields reject `null`.
- Secrets (`LLM_API_KEY`, `MESHY_API_KEY`) live only in the backend env. Never commit `.env`.
- Shell: Git Bash on Windows. Python venv activation is `source .venv/Scripts/activate` (Windows) or `source .venv/bin/activate` (macOS and Linux).
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keep files small and single-purpose. If a file passes about 400 lines, split it.
- **Art:** one CC0 art family (Quaternius first, KayKit for the player). Procedural shapes are only a fallback. Online models must be CC0 or CC-BY (never NC/ND) and are credited in the place card. Meshy is the last resort, capped.

## File Structure

```
VICTORIA/
  CLAUDE.md                         project rules for Claude Code
  README.md                         run, deploy, submission info
  .gitignore
  docs/
    DECISIONS.md                    dated decision log
    research/                       competitor analysis + research report
    superpowers/specs/…design.md    spec
    superpowers/plans/…worldseed.md this plan
  shared/fixtures/
    recipes/{fishing-valley,desert-canyon,snowy-mountains,tropical-island}.json
    ops/{add-lighthouse-at,make-winter}.json
  web/
    index.html  package.json  tsconfig.json  vite.config.ts
    src/
      main.ts                       boot
      app.ts                        orchestrator (load, edit, undo, frame loop)
      styles.css
      core/rng.ts                   hashString, mulberry32
      core/recipe.ts                Zod recipe schema + types + parseRecipe
      core/ops.ts                   Zod ops schema + applyOps + describeOps
      world/noise.ts                fbm, ridged, clamp, smoothstep, lerp
      world/river.ts                traceRiver, SegmentIndex, segmentDistance
      world/field.ts                createField, snapshotField, restoreField
      world/biome.ts                classifyBiome, biomeAt, BIOME_COLOR
      world/placement.ts            solvePlacements, findSpawn, placeRadius
      world/roads.ts                findPath, chaikin
      world/settlement.ts           layoutSettlement
      world/scatter.ts              scatterChunk, SCATTER_RULES
      world/chunkData.ts            computeChunk (worker-safe)
      world/checks.ts               runChecks
      world/build.ts                buildWorld
      render/engine.ts              renderer, scene, camera, loop
      render/atmosphere.ts          sky, sun, fog, time, precipitation
      render/scatterAssets.ts       procedural scatter geometry + instancing
      render/chunkWorker.ts         Web Worker: computeChunk
      render/chunkManager.ts        stream chunks, colliders
      render/water.ts               sea, river ribbon, lakes
      render/roads.ts               road ribbons, bridges
      render/placeholders.ts        procedural models by asset keywords
      render/worldObjects.ts        places/buildings → meshes, models, colliders
      render/assetModels.ts         GLB loading via the backend model finder
      render/grass.ts               instanced wind grass (Task 24b)
      render/postfx.ts              bloom + tone mapping (Task 24b)
      render/animated.ts            rigged model clones + animation clips (Task 24b)
      render/artLoader.ts           loads pack models for scatter, player, animals (Task 24b)
      player/avatar.ts              animated third-person player (Task 24b)
      physics/physics.ts            Rapier world wrapper
      player/player.ts              pointer lock + character controller
      logic/interactions.ts         E-to-interact system
      logic/wildlife.ts             deer + birds
      logic/director.ts             self-running demo
      api/client.ts                 backend calls with offline fallback
      api/localMock.ts              offline recipe + edit mock
      ui/ui.ts                      start screen, HUD, command bar, place card, checks
    tests/                          vitest specs mirroring src/
  backend/
    requirements.txt  .env.example  Dockerfile
    app/__init__.py
    app/schemas.py                  Pydantic mirror of recipe + ops + API models
    app/prompts.py                  system prompts
    app/llm.py                      OpenAI-compatible client + extract_json
    app/cache.py                    file cache
    app/mock.py                     mock world + mock edit
    app/service.py                  generate_world, edit_world
    app/assets.py                   model finder: library → cache → Poly Pizza → Sketchfab → Meshy
    app/ratelimit.py                per-IP + daily cap
    app/main.py                     FastAPI app factory
    assets/library/manifest.json    tagged CC0 models (GLBs live beside it)
    scripts/build_manifest.py
    tests/                          pytest
```

---

## Phase 0: Repo setup

### Task 0: Initialise the repository and tooling

**Files:**
- Create: `.gitignore`, `README.md`, `docs/DECISIONS.md`
- Create: `web/package.json` (via npm), `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/styles.css`, `web/src/main.ts`
- Create: `backend/requirements.txt`, `backend/.env.example`, `backend/app/__init__.py`, `backend/tests/__init__.py`

**Interfaces:**
- Produces: a working `npm test` (vitest) in `web/` and `pytest` in `backend/`.

- [x] **Step 1: git init and ignore file**

```bash
cd /c/Users/sanke/Desktop/VICTORIA
git init
```

`.gitignore`:
```
node_modules/
dist/
.env
.venv/
__pycache__/
*.pyc
backend/.cache/
backend/assets/generated/
*.log
.DS_Store
```

Library models (CC0) are committed so the deployed backend can serve them. Commit only the models you use, and keep the total under 30 MB (Task 19).

- [x] **Step 2: web scaffold**

```bash
mkdir -p web/src web/tests && cd web
npm init -y
npm install three zod simplex-noise @dimforge/rapier3d-compat
npm install -D typescript vite vitest @types/three @types/node
npm pkg set type=module
npm pkg set scripts.dev="vite" scripts.build="tsc --noEmit && vite build" scripts.preview="vite preview" scripts.test="vitest run" scripts.typecheck="tsc --noEmit"
cd ..
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests"]
}
```

`web/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { fs: { allow: ['..'] } },
  worker: { format: 'es' },
  test: { environment: 'node', testTimeout: 20000 },
});
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WorldSeed</title>
  </head>
  <body>
    <canvas id="view"></canvas>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`web/src/styles.css`:
```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #0b1020; font-family: system-ui, sans-serif; color: #eef2ff; }
#view { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
#ui { position: fixed; inset: 0; pointer-events: none; }
#ui > * { pointer-events: auto; }
```

`web/src/main.ts` (temporary; replaced in Task 12):
```ts
import './styles.css';
document.querySelector('#ui')!.textContent = 'WorldSeed booting…';
```

- [x] **Step 3: backend scaffold**

```bash
mkdir -p backend/app backend/tests backend/assets/library backend/scripts
cd backend
python -m venv .venv
source .venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
```

`backend/requirements.txt`:
```
fastapi>=0.115
uvicorn[standard]>=0.30
pydantic>=2.7
httpx>=0.27
python-dotenv>=1.0
pytest>=8.0
```

```bash
pip install -r requirements.txt
touch app/__init__.py tests/__init__.py
echo '[]' > assets/library/manifest.json
cd ..
```

`backend/.env.example`:
```
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=
LLM_MODEL=google/gemini-2.5-flash-lite
LLM_DAILY_CAP=300
MESHY_API_KEY=
MESHY_MAX_GENERATIONS=5
MESHY_REFINE=0
CORS_ORIGINS=*
```

- [x] **Step 4: README and decision log stubs**

`README.md`:
```markdown
# WorldSeed

Describe a world. Walk into it. Change it by talking to it.

Victoria VR AI Builder Hackathon 2026 entry. Focus category: Prompt-to-World Creation.

## Run locally
    cd backend && source .venv/Scripts/activate && uvicorn app.main:app --reload --port 8000
    cd web && npm run dev    # http://localhost:5173

Without `LLM_API_KEY` the backend runs in mock mode. Without the backend the web app uses its offline mock.

## Docs
- Spec: docs/superpowers/specs/2026-11-01-worldseed-design.md
- Plan: docs/superpowers/plans/2026-11-01-worldseed.md
- Decisions: docs/DECISIONS.md
```

`docs/DECISIONS.md`:
```markdown
# Decisions

## 2026-11-01
- The LLM writes a validated recipe of relations, never coordinates or code (competitors that let the LLM write coordinates suffer overlaps and objects in water).
- Terrain and placement run in the browser (real-time streaming); AI and model work run in Python.
- Endless chunked noise terrain plus a 1024 m authored core.
```

- [x] **Step 5: verify the tooling runs**

```bash
cd web && npx vitest run --passWithNoTests && cd ../backend && source .venv/Scripts/activate && pytest -q; cd ..
```

Expected: vitest reports "No test files found, exiting with code 0", and pytest reports "no tests ran".

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold web (vite+ts) and backend (fastapi) projects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 1: Shared contract

### Task 1: Recipe and ops schemas (TypeScript) + fixtures

**Files:**
- Create: `web/src/core/rng.ts`, `web/src/core/recipe.ts`, `web/src/core/ops.ts`
- Create: `shared/fixtures/recipes/fishing-valley.json`, `desert-canyon.json`, `snowy-mountains.json`, `tropical-island.json`
- Create: `shared/fixtures/ops/add-lighthouse-at.json`, `make-winter.json`
- Test: `web/tests/core/recipe.test.ts`, `web/tests/core/ops.test.ts`, `web/tests/core/rng.test.ts`, `web/tests/fixtures.ts`

**Interfaces:**
- Produces:
  - `hashString(s: string): number`
  - `mulberry32(seed: number): () => number`
  - `CORE_HALF = 512`
  - `recipeSchema`, `placeSchema`, `relationSchema`, `atmosphereSchema`
  - types `Recipe`, `Place`, `Relation`, `Atmosphere`, `Interaction`, `PlaceKind`, `PlaceSize`
  - `parseRecipe(data: unknown): { ok: true; recipe: Recipe } | { ok: false; error: string }`
  - `opSchema`, `opsSchema`, type `Op`
  - `applyOps(recipe: Recipe, ops: Op[]): ApplyResult`
  - `describeOps(ops: Op[]): string[]`
  - `OpError`
  - test helper `loadRecipeFixture(name: string): Recipe`, `loadOpsFixture(name: string): unknown`

- [x] **Step 1: Write the fixtures**

`shared/fixtures/recipes/fishing-valley.json`:
```json
{
  "version": 1,
  "title": "Misty Pine Valley",
  "seed": 4821,
  "terrain": { "shape": "valley", "roughness": 0.55, "height": 0.7, "seaLevel": 0 },
  "climate": { "temperature": 0.4, "moisture": 0.7 },
  "water": { "river": true, "lake": false },
  "atmosphere": { "time": "dawn", "weather": "mist", "fog": 0.6, "wind": 0.3 },
  "places": [
    { "id": "village", "kind": "settlement", "label": "Riverside fishing village", "asset": "wooden fishing cottage", "style": "wooden fishing", "size": "small", "interaction": "door", "where": [{ "rel": "by_water" }, { "rel": "flat" }] },
    { "id": "tower", "kind": "landmark", "label": "Old watchtower", "asset": "ruined stone watchtower", "size": "medium", "interaction": "none", "description": "A crumbling stone tower that once watched the valley road.", "where": [{ "rel": "highest" }, { "rel": "visible_from", "target": "village" }] },
    { "id": "campfire", "kind": "prop", "label": "Fishermen's campfire", "asset": "campfire with stones", "size": "small", "interaction": "fire", "where": [{ "rel": "near", "target": "village", "maxDist": 30 }] }
  ],
  "paths": [{ "from": "village", "to": "tower" }],
  "life": [{ "kind": "deer", "count": 6 }, { "kind": "birds", "count": 10 }]
}
```

`shared/fixtures/recipes/desert-canyon.json`:
```json
{
  "version": 1,
  "title": "Red Canyon Oasis",
  "seed": 9137,
  "terrain": { "shape": "canyon", "roughness": 0.6, "height": 0.75, "seaLevel": 0 },
  "climate": { "temperature": 0.9, "moisture": 0.15 },
  "water": { "river": true, "lake": false },
  "atmosphere": { "time": "dusk", "weather": "clear", "fog": 0.2, "wind": 0.5 },
  "places": [
    { "id": "oasis", "kind": "settlement", "label": "Oasis camp", "asset": "desert tent", "style": "nomad", "size": "small", "interaction": "door", "where": [{ "rel": "by_water" }, { "rel": "flat" }] },
    { "id": "obelisk", "kind": "landmark", "label": "Weathered obelisk", "asset": "weathered stone obelisk", "size": "large", "interaction": "none", "description": "Nobody remembers who carved it.", "where": [{ "rel": "highest" }] },
    { "id": "bell", "kind": "prop", "label": "Caravan bell", "asset": "bronze bell on wooden post", "size": "small", "interaction": "sound", "where": [{ "rel": "near", "target": "oasis", "maxDist": 25 }] }
  ],
  "paths": [{ "from": "oasis", "to": "obelisk" }],
  "life": [{ "kind": "birds", "count": 6 }, { "kind": "rabbits", "count": 5 }]
}
```

`shared/fixtures/recipes/snowy-mountains.json`:
```json
{
  "version": 1,
  "title": "Frozen Peaks",
  "seed": 2210,
  "terrain": { "shape": "mountains", "roughness": 0.7, "height": 0.9, "seaLevel": 0 },
  "climate": { "temperature": 0.12, "moisture": 0.5 },
  "water": { "river": false, "lake": true },
  "atmosphere": { "time": "night", "weather": "snow", "fog": 0.3, "wind": 0.6 },
  "places": [
    { "id": "castle", "kind": "landmark", "label": "Castle of the peaks", "asset": "stone castle with towers", "size": "large", "interaction": "none", "description": "Its banners have frozen stiff.", "where": [{ "rel": "highest" }] },
    { "id": "lodge", "kind": "structure", "label": "Hunter's lodge", "asset": "wooden log cabin", "size": "medium", "interaction": "door", "where": [{ "rel": "flat" }, { "rel": "by_water" }] },
    { "id": "lantern", "kind": "prop", "label": "Lodge lantern", "asset": "iron lantern on post", "size": "small", "interaction": "light", "where": [{ "rel": "near", "target": "lodge", "maxDist": 12 }] }
  ],
  "paths": [{ "from": "lodge", "to": "castle" }],
  "life": [{ "kind": "deer", "count": 4 }]
}
```

`shared/fixtures/recipes/tropical-island.json`:
```json
{
  "version": 1,
  "title": "Lighthouse Isle",
  "seed": 7404,
  "terrain": { "shape": "island", "roughness": 0.45, "height": 0.55, "seaLevel": 0.32 },
  "climate": { "temperature": 0.85, "moisture": 0.6 },
  "water": { "river": false, "lake": false },
  "atmosphere": { "time": "day", "weather": "clear", "fog": 0.1, "wind": 0.4 },
  "places": [
    { "id": "village", "kind": "settlement", "label": "Beach village", "asset": "thatched beach hut", "style": "tropical", "size": "small", "interaction": "door", "where": [{ "rel": "by_water" }, { "rel": "flat" }] },
    { "id": "lighthouse", "kind": "landmark", "label": "Lighthouse", "asset": "white stone lighthouse", "size": "medium", "interaction": "light", "where": [{ "rel": "direction", "dir": "east" }, { "rel": "by_water" }] },
    { "id": "barrels", "kind": "prop", "label": "Cargo barrels", "asset": "wooden barrel", "size": "small", "interaction": "push", "where": [{ "rel": "near", "target": "village", "maxDist": 20 }] }
  ],
  "paths": [{ "from": "village", "to": "lighthouse" }],
  "life": [{ "kind": "birds", "count": 12 }]
}
```

`shared/fixtures/ops/add-lighthouse-at.json`:
```json
[
  { "op": "addPlace", "place": { "id": "beacon", "kind": "landmark", "label": "Beacon tower", "asset": "white stone lighthouse", "size": "medium", "interaction": "light", "where": [{ "rel": "at", "x": 120, "z": -40 }] } },
  { "op": "setAtmosphere", "time": "night" }
]
```

`shared/fixtures/ops/make-winter.json`:
```json
[
  { "op": "setClimate", "temperature": 0.1 },
  { "op": "setAtmosphere", "weather": "snow" }
]
```

- [x] **Step 2: Write the failing tests**

`web/tests/fixtures.ts`:
```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recipeSchema, type Recipe } from '../src/core/recipe';

const root = fileURLToPath(new URL('../../shared/fixtures/', import.meta.url));

export const RECIPE_FIXTURES = ['fishing-valley', 'desert-canyon', 'snowy-mountains', 'tropical-island'] as const;

export function loadRecipeFixture(name: string): Recipe {
  return recipeSchema.parse(JSON.parse(readFileSync(resolve(root, 'recipes', `${name}.json`), 'utf8')));
}

export function loadOpsFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(root, 'ops', `${name}.json`), 'utf8'));
}
```

`web/tests/core/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from '../../src/core/rng';

describe('rng', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('hashString is stable and spreads', () => {
    expect(hashString('village')).toBe(hashString('village'));
    expect(hashString('village')).not.toBe(hashString('tower'));
  });
});
```

`web/tests/core/recipe.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/recipe';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

describe('recipe schema', () => {
  it.each(RECIPE_FIXTURES)('fixture %s is valid', (name) => {
    expect(loadRecipeFixture(name).version).toBe(1);
  });

  it('fills defaults (size, interaction, where, paths, life)', () => {
    const base = loadRecipeFixture('fishing-valley');
    const raw = { ...base, paths: undefined, life: undefined, places: [{ id: 'x1', kind: 'prop', label: 'X', asset: 'crate' }] };
    const res = parseRecipe(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recipe.places[0].size).toBe('medium');
      expect(res.recipe.places[0].interaction).toBe('none');
      expect(res.recipe.places[0].where).toEqual([]);
      expect(res.recipe.paths).toEqual([]);
    }
  });

  it('rejects unknown fields', () => {
    const r = { ...loadRecipeFixture('fishing-valley'), extra: 1 };
    expect(parseRecipe(r).ok).toBe(false);
  });

  it('rejects dangling relation targets and path endpoints', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places[1].where = [{ rel: 'visible_from', target: 'nowhere' }];
    expect(parseRecipe(r).ok).toBe(false);
    const r2 = loadRecipeFixture('fishing-valley');
    r2.paths = [{ from: 'village', to: 'ghost' }];
    expect(parseRecipe(r2).ok).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places.push({ ...r.places[0] });
    expect(parseRecipe(r).ok).toBe(false);
  });

  it('rejects out-of-range at coordinates', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places[2].where = [{ rel: 'at', x: 9999, z: 0 }];
    expect(parseRecipe(r).ok).toBe(false);
  });
});
```

`web/tests/core/ops.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyOps, describeOps, OpError, opsSchema } from '../../src/core/ops';
import { loadOpsFixture, loadRecipeFixture } from '../fixtures';

describe('ops', () => {
  it('fixture ops parse', () => {
    expect(opsSchema.parse(loadOpsFixture('add-lighthouse-at')).length).toBe(2);
    expect(opsSchema.parse(loadOpsFixture('make-winter')).length).toBe(2);
  });

  it('addPlace + setAtmosphere', () => {
    const r = loadRecipeFixture('fishing-valley');
    const res = applyOps(r, opsSchema.parse(loadOpsFixture('add-lighthouse-at')));
    expect(res.recipe.places.map((p) => p.id)).toContain('beacon');
    expect(res.recipe.atmosphere.time).toBe('night');
    expect(res.changedPlaces.has('beacon')).toBe(true);
    expect(res.terrainChanged).toBe(false);
    expect(res.atmosphereChanged).toBe(true);
    expect(r.places.length).toBe(3); // input not mutated
  });

  it('setClimate marks terrain changed', () => {
    const res = applyOps(loadRecipeFixture('fishing-valley'), opsSchema.parse(loadOpsFixture('make-winter')));
    expect(res.terrainChanged).toBe(true);
    expect(res.recipe.climate.temperature).toBe(0.1);
  });

  it('removePlace drops paths and relations that reference it', () => {
    const res = applyOps(loadRecipeFixture('fishing-valley'), [{ op: 'removePlace', id: 'village' }]);
    expect(res.recipe.places.map((p) => p.id)).toEqual(['tower', 'campfire']);
    expect(res.recipe.paths).toEqual([]);
    expect(res.recipe.places[0].where).toEqual([{ rel: 'highest' }]);
    expect(res.removedPlaces.has('village')).toBe(true);
  });

  it('throws OpError on unknown id and duplicate id', () => {
    const r = loadRecipeFixture('fishing-valley');
    expect(() => applyOps(r, [{ op: 'removePlace', id: 'ghost' }])).toThrow(OpError);
    expect(() => applyOps(r, [{ op: 'addPlace', place: { ...r.places[0] } }])).toThrow(OpError);
  });

  it('describeOps gives plain language', () => {
    const lines = describeOps(opsSchema.parse(loadOpsFixture('add-lighthouse-at')));
    expect(lines[0]).toContain('Beacon tower');
    expect(lines[1]).toContain('night');
  });
});
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/core`
Expected: FAIL with "Cannot find module '../../src/core/rng'" (and similar).

- [x] **Step 4: Implement**

`web/src/core/rng.ts`:
```ts
/** FNV-1a 32-bit string hash. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small fast seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`web/src/core/recipe.ts`:
```ts
import { z } from 'zod';

export const CORE_HALF = 512;

export const idSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/, 'id must be 2-32 chars [a-z0-9_-], starting with a letter');
const unit = z.number().min(0).max(1);
const coord = z.number().min(-CORE_HALF).max(CORE_HALF);

export const SHAPES = ['plains', 'hills', 'valley', 'mountains', 'island', 'canyon'] as const;
export const PLACE_KINDS = ['settlement', 'landmark', 'structure', 'prop'] as const;
export const PLACE_SIZES = ['small', 'medium', 'large'] as const;
export const INTERACTIONS = ['none', 'door', 'light', 'fire', 'sound', 'sit', 'push'] as const;
export const TIMES = ['dawn', 'day', 'dusk', 'night'] as const;
export const WEATHERS = ['clear', 'rain', 'snow', 'mist', 'storm'] as const;
export const LIFE_KINDS = ['deer', 'birds', 'rabbits'] as const;
export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;

export const relationSchema = z.discriminatedUnion('rel', [
  z.strictObject({ rel: z.literal('highest') }),
  z.strictObject({ rel: z.literal('lowest') }),
  z.strictObject({ rel: z.literal('flat') }),
  z.strictObject({ rel: z.literal('by_water') }),
  z.strictObject({ rel: z.literal('near'), target: idSchema, maxDist: z.number().min(5).max(600).default(80) }),
  z.strictObject({ rel: z.literal('far_from'), target: idSchema, minDist: z.number().min(20).max(800).default(200) }),
  z.strictObject({ rel: z.literal('direction'), dir: z.enum(DIRECTIONS), of: idSchema.optional() }),
  z.strictObject({ rel: z.literal('visible_from'), target: idSchema }),
  z.strictObject({ rel: z.literal('at'), x: coord, z: coord, y: z.number().min(-200).max(1000).optional() }),
]);

export const placeSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(PLACE_KINDS),
  label: z.string().min(1).max(60),
  asset: z.string().min(2).max(120),
  style: z.string().max(40).optional(),
  size: z.enum(PLACE_SIZES).default('medium'),
  interaction: z.enum(INTERACTIONS).default('none'),
  description: z.string().max(280).optional(),
  where: z.array(relationSchema).max(4).default([]),
});

export const atmosphereSchema = z.strictObject({
  time: z.enum(TIMES),
  weather: z.enum(WEATHERS),
  fog: unit,
  wind: unit,
});

export const recipeSchema = z
  .strictObject({
    version: z.literal(1),
    title: z.string().min(1).max(80),
    seed: z.number().int().min(0).max(2147483647),
    terrain: z.strictObject({ shape: z.enum(SHAPES), roughness: unit, height: unit, seaLevel: unit }),
    climate: z.strictObject({ temperature: unit, moisture: unit }),
    water: z.strictObject({ river: z.boolean(), lake: z.boolean() }),
    atmosphere: atmosphereSchema,
    places: z.array(placeSchema).max(12),
    paths: z.array(z.strictObject({ from: idSchema, to: idSchema })).max(12).default([]),
    life: z.array(z.strictObject({ kind: z.enum(LIFE_KINDS), count: z.number().int().min(1).max(20) })).max(4).default([]),
  })
  .superRefine((r, ctx) => {
    const ids = new Set<string>();
    for (const p of r.places) {
      if (ids.has(p.id)) ctx.addIssue({ code: 'custom', message: `duplicate place id "${p.id}"` });
      ids.add(p.id);
    }
    for (const p of r.places) {
      for (const rel of p.where) {
        const target = 'target' in rel ? rel.target : rel.rel === 'direction' ? rel.of : undefined;
        if (target !== undefined && !ids.has(target)) ctx.addIssue({ code: 'custom', message: `place "${p.id}" refers to unknown place "${target}"` });
      }
    }
    for (const path of r.paths) {
      if (!ids.has(path.from) || !ids.has(path.to)) ctx.addIssue({ code: 'custom', message: `path ${path.from}→${path.to} refers to an unknown place` });
    }
  });

export type Recipe = z.infer<typeof recipeSchema>;
export type Place = z.infer<typeof placeSchema>;
export type Relation = z.infer<typeof relationSchema>;
export type Atmosphere = z.infer<typeof atmosphereSchema>;
export type Interaction = (typeof INTERACTIONS)[number];
export type PlaceKind = (typeof PLACE_KINDS)[number];
export type PlaceSize = (typeof PLACE_SIZES)[number];
export type LifeKind = (typeof LIFE_KINDS)[number];

export function parseRecipe(data: unknown): { ok: true; recipe: Recipe } | { ok: false; error: string } {
  const res = recipeSchema.safeParse(data);
  if (res.success) return { ok: true, recipe: res.data };
  return { ok: false, error: res.error.issues.map((i) => `${i.path.join('.') || 'recipe'}: ${i.message}`).join('; ') };
}
```

`web/src/core/ops.ts`:
```ts
import { z } from 'zod';
import {
  DIRECTIONS, idSchema, INTERACTIONS, LIFE_KINDS, placeSchema, recipeSchema, relationSchema, SHAPES, TIMES, WEATHERS,
  type Recipe,
} from './recipe';

const unit = z.number().min(0).max(1);

export const opSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('addPlace'), place: placeSchema }),
  z.strictObject({ op: z.literal('removePlace'), id: idSchema }),
  z.strictObject({ op: z.literal('movePlace'), id: idSchema, where: z.array(relationSchema).min(1).max(4) }),
  z.strictObject({
    op: z.literal('updatePlace'), id: idSchema,
    label: z.string().min(1).max(60).optional(), asset: z.string().min(2).max(120).optional(),
    interaction: z.enum(INTERACTIONS).optional(), description: z.string().max(280).optional(),
  }),
  z.strictObject({ op: z.literal('setAtmosphere'), time: z.enum(TIMES).optional(), weather: z.enum(WEATHERS).optional(), fog: unit.optional(), wind: unit.optional() }),
  z.strictObject({ op: z.literal('setClimate'), temperature: unit.optional(), moisture: unit.optional() }),
  z.strictObject({ op: z.literal('setTerrain'), shape: z.enum(SHAPES).optional(), roughness: unit.optional(), height: unit.optional(), seaLevel: unit.optional() }),
  z.strictObject({ op: z.literal('setWater'), river: z.boolean().optional(), lake: z.boolean().optional() }),
  z.strictObject({ op: z.literal('addPath'), from: idSchema, to: idSchema }),
  z.strictObject({ op: z.literal('addLife'), kind: z.enum(LIFE_KINDS), count: z.number().int().min(1).max(20) }),
]);
export const opsSchema = z.array(opSchema).min(1).max(20);
export type Op = z.infer<typeof opSchema>;

export class OpError extends Error {}

export interface ApplyResult {
  recipe: Recipe;
  changedPlaces: Set<string>;
  removedPlaces: Set<string>;
  terrainChanged: boolean;
  atmosphereChanged: boolean;
  lifeChanged: boolean;
}

function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function applyOps(recipe: Recipe, ops: Op[]): ApplyResult {
  const next: Recipe = structuredClone(recipe);
  const res = { changedPlaces: new Set<string>(), removedPlaces: new Set<string>(), terrainChanged: false, atmosphereChanged: false, lifeChanged: false };
  const find = (id: string) => {
    const p = next.places.find((q) => q.id === id);
    if (!p) throw new OpError(`There is no place called "${id}".`);
    return p;
  };
  for (const op of ops) {
    switch (op.op) {
      case 'addPlace':
        if (next.places.some((p) => p.id === op.place.id)) throw new OpError(`"${op.place.id}" already exists.`);
        next.places.push(structuredClone(op.place));
        res.changedPlaces.add(op.place.id);
        break;
      case 'removePlace':
        find(op.id);
        next.places = next.places.filter((p) => p.id !== op.id);
        next.paths = next.paths.filter((p) => p.from !== op.id && p.to !== op.id);
        for (const p of next.places) {
          p.where = p.where.filter((r) => !('target' in r && r.target === op.id) && !(r.rel === 'direction' && r.of === op.id));
        }
        res.removedPlaces.add(op.id);
        break;
      case 'movePlace':
        find(op.id).where = structuredClone(op.where);
        res.changedPlaces.add(op.id);
        break;
      case 'updatePlace': {
        const { op: _op, id, ...rest } = op;
        Object.assign(find(id), defined(rest));
        res.changedPlaces.add(id);
        break;
      }
      case 'setAtmosphere': {
        const { op: _op, ...rest } = op;
        Object.assign(next.atmosphere, defined(rest));
        res.atmosphereChanged = true;
        break;
      }
      case 'setClimate': {
        const { op: _op, ...rest } = op;
        Object.assign(next.climate, defined(rest));
        res.terrainChanged = true;
        break;
      }
      case 'setTerrain': {
        const { op: _op, ...rest } = op;
        Object.assign(next.terrain, defined(rest));
        res.terrainChanged = true;
        break;
      }
      case 'setWater': {
        const { op: _op, ...rest } = op;
        Object.assign(next.water, defined(rest));
        res.terrainChanged = true;
        break;
      }
      case 'addPath':
        find(op.from);
        find(op.to);
        next.paths.push({ from: op.from, to: op.to });
        break;
      case 'addLife':
        next.life.push({ kind: op.kind, count: op.count });
        res.lifeChanged = true;
        break;
    }
  }
  const parsed = recipeSchema.safeParse(next);
  if (!parsed.success) throw new OpError(parsed.error.issues.map((i) => i.message).join('; '));
  return { recipe: parsed.data, ...res };
}

function whereText(rels: z.infer<typeof relationSchema>[]): string {
  return rels.map((r) => {
    switch (r.rel) {
      case 'at': return 'where you pointed';
      case 'near': return `near ${r.target}`;
      case 'far_from': return `far from ${r.target}`;
      case 'direction': return `${r.dir} of ${r.of ?? 'the centre'}`;
      case 'visible_from': return `visible from ${r.target}`;
      case 'by_water': return 'by the water';
      default: return `on the ${r.rel} ground`;
    }
  }).join(', ');
}

export function describeOps(ops: Op[]): string[] {
  return ops.map((op) => {
    switch (op.op) {
      case 'addPlace': return `Add ${op.place.kind} “${op.place.label}” (${op.place.asset}) ${whereText(op.place.where)}`.trim();
      case 'removePlace': return `Remove ${op.id}`;
      case 'movePlace': return `Move ${op.id} ${whereText(op.where)}`;
      case 'updatePlace': return `Change ${op.id}`;
      case 'setAtmosphere': return `Set ${Object.entries(defined({ time: op.time, weather: op.weather, fog: op.fog, wind: op.wind })).map(([k, v]) => `${k} to ${v}`).join(', ')}`;
      case 'setClimate': return `Change climate (${Object.entries(defined({ temperature: op.temperature, moisture: op.moisture })).map(([k, v]) => `${k} ${v}`).join(', ')}) — rebuilds terrain`;
      case 'setTerrain': return `Reshape terrain — rebuilds the world`;
      case 'setWater': return `Change water (${op.river === undefined ? '' : `river ${op.river ? 'on' : 'off'}`}${op.lake === undefined ? '' : ` lake ${op.lake ? 'on' : 'off'}`}) — rebuilds terrain`;
      case 'addPath': return `Build a road from ${op.from} to ${op.to}`;
      case 'addLife': return `Add ${op.count} ${op.kind}`;
    }
  });
}

export { DIRECTIONS };
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/core`
Expected: PASS (all tests in rng, recipe, ops).

- [x] **Step 6: Commit**

```bash
git add shared web/src/core web/tests
git commit -m "feat(core): recipe + ops zod schemas, seeded rng, shared fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Pydantic mirror + contract test

**Files:**
- Create: `backend/app/schemas.py`
- Test: `backend/tests/test_contract.py`

**Interfaces:**
- Consumes: `shared/fixtures/**` from Task 1.
- Produces (Python):
  - models `Recipe`, `Place`, `Relation`, `Op`, `OpsList`
  - request models `WorldRequest`, `EditRequest`, `EditContext`, `XZ`, `PlacementSummary`, `AssetRequest`
  - helpers `dump(model) -> dict` (always `exclude_none=True`), `ops_adapter: TypeAdapter[list[Op]]`, `FIXTURES_DIR: Path`

- [x] **Step 1: Write the failing test**

`backend/tests/test_contract.py`:
```python
import json
import pytest
from pydantic import ValidationError
from app.schemas import FIXTURES_DIR, Recipe, dump, ops_adapter

RECIPES = sorted((FIXTURES_DIR / "recipes").glob("*.json"))
OPS = sorted((FIXTURES_DIR / "ops").glob("*.json"))


@pytest.mark.parametrize("path", RECIPES, ids=lambda p: p.stem)
def test_recipe_fixtures_valid(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    recipe = Recipe.model_validate(data)
    out = dump(recipe)
    assert "null" not in json.dumps(out)
    assert Recipe.model_validate(out) == recipe


@pytest.mark.parametrize("path", OPS, ids=lambda p: p.stem)
def test_ops_fixtures_valid(path):
    ops = ops_adapter.validate_python(json.loads(path.read_text(encoding="utf-8")))
    assert len(ops) >= 1


def test_rejects_unknown_field_and_dangling_target():
    data = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    with pytest.raises(ValidationError):
        Recipe.model_validate({**data, "extra": 1})
    data["places"][1]["where"] = [{"rel": "visible_from", "target": "nowhere"}]
    with pytest.raises(ValidationError):
        Recipe.model_validate(data)


def test_defaults_match_zod():
    data = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    data["places"] = [{"id": "x1", "kind": "prop", "label": "X", "asset": "crate"}]
    data.pop("paths")
    r = Recipe.model_validate(data)
    assert r.places[0].size == "medium" and r.places[0].interaction == "none" and r.places[0].where == []
    assert r.paths == []
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd backend && source .venv/Scripts/activate && pytest tests/test_contract.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas'`.

- [x] **Step 3: Implement**

`backend/app/schemas.py`:
```python
from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "shared" / "fixtures"
CORE_HALF = 512

Id = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_-]{1,31}$")]
Unit = Annotated[float, Field(ge=0, le=1)]
Coord = Annotated[float, Field(ge=-CORE_HALF, le=CORE_HALF)]
Shape = Literal["plains", "hills", "valley", "mountains", "island", "canyon"]
Kind = Literal["settlement", "landmark", "structure", "prop"]
Size = Literal["small", "medium", "large"]
Interaction = Literal["none", "door", "light", "fire", "sound", "sit", "push"]
Time = Literal["dawn", "day", "dusk", "night"]
Weather = Literal["clear", "rain", "snow", "mist", "storm"]
LifeKind = Literal["deer", "birds", "rabbits"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Highest(Strict):
    rel: Literal["highest"]


class Lowest(Strict):
    rel: Literal["lowest"]


class Flat(Strict):
    rel: Literal["flat"]


class ByWater(Strict):
    rel: Literal["by_water"]


class Near(Strict):
    rel: Literal["near"]
    target: Id
    maxDist: Annotated[float, Field(ge=5, le=600)] = 80


class FarFrom(Strict):
    rel: Literal["far_from"]
    target: Id
    minDist: Annotated[float, Field(ge=20, le=800)] = 200


class Direction(Strict):
    rel: Literal["direction"]
    dir: Literal["north", "south", "east", "west"]
    of: Id | None = None


class VisibleFrom(Strict):
    rel: Literal["visible_from"]
    target: Id


class At(Strict):
    rel: Literal["at"]
    x: Coord
    z: Coord
    y: Annotated[float, Field(ge=-200, le=1000)] | None = None  # surface height for props placed "on" something


Relation = Annotated[
    Union[Highest, Lowest, Flat, ByWater, Near, FarFrom, Direction, VisibleFrom, At],
    Field(discriminator="rel"),
]


class Place(Strict):
    id: Id
    kind: Kind
    label: Annotated[str, Field(min_length=1, max_length=60)]
    asset: Annotated[str, Field(min_length=2, max_length=120)]
    style: Annotated[str, Field(max_length=40)] | None = None
    size: Size = "medium"
    interaction: Interaction = "none"
    description: Annotated[str, Field(max_length=280)] | None = None
    where: Annotated[list[Relation], Field(max_length=4)] = []


class Terrain(Strict):
    shape: Shape
    roughness: Unit
    height: Unit
    seaLevel: Unit


class Climate(Strict):
    temperature: Unit
    moisture: Unit


class Water(Strict):
    river: bool
    lake: bool


class Atmosphere(Strict):
    time: Time
    weather: Weather
    fog: Unit
    wind: Unit


class Path_(Strict):
    from_: Id = Field(alias="from")
    to: Id
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Life(Strict):
    kind: LifeKind
    count: Annotated[int, Field(ge=1, le=20)]


class Recipe(Strict):
    version: Literal[1]
    title: Annotated[str, Field(min_length=1, max_length=80)]
    seed: Annotated[int, Field(ge=0, le=2147483647)]
    terrain: Terrain
    climate: Climate
    water: Water
    atmosphere: Atmosphere
    places: Annotated[list[Place], Field(max_length=12)]
    paths: Annotated[list[Path_], Field(max_length=12)] = []
    life: Annotated[list[Life], Field(max_length=4)] = []

    @model_validator(mode="after")
    def _references(self) -> "Recipe":
        ids: set[str] = set()
        for p in self.places:
            if p.id in ids:
                raise ValueError(f'duplicate place id "{p.id}"')
            ids.add(p.id)
        for p in self.places:
            for r in p.where:
                target = getattr(r, "target", None) or (r.of if isinstance(r, Direction) else None)
                if target is not None and target not in ids:
                    raise ValueError(f'place "{p.id}" refers to unknown place "{target}"')
        for path in self.paths:
            if path.from_ not in ids or path.to not in ids:
                raise ValueError(f"path {path.from_}->{path.to} refers to an unknown place")
        return self


# ---- ops ----
class AddPlace(Strict):
    op: Literal["addPlace"]
    place: Place


class RemovePlace(Strict):
    op: Literal["removePlace"]
    id: Id


class MovePlace(Strict):
    op: Literal["movePlace"]
    id: Id
    where: Annotated[list[Relation], Field(min_length=1, max_length=4)]


class UpdatePlace(Strict):
    op: Literal["updatePlace"]
    id: Id
    label: Annotated[str, Field(min_length=1, max_length=60)] | None = None
    asset: Annotated[str, Field(min_length=2, max_length=120)] | None = None
    interaction: Interaction | None = None
    description: Annotated[str, Field(max_length=280)] | None = None


class SetAtmosphere(Strict):
    op: Literal["setAtmosphere"]
    time: Time | None = None
    weather: Weather | None = None
    fog: Unit | None = None
    wind: Unit | None = None


class SetClimate(Strict):
    op: Literal["setClimate"]
    temperature: Unit | None = None
    moisture: Unit | None = None


class SetTerrain(Strict):
    op: Literal["setTerrain"]
    shape: Shape | None = None
    roughness: Unit | None = None
    height: Unit | None = None
    seaLevel: Unit | None = None


class SetWater(Strict):
    op: Literal["setWater"]
    river: bool | None = None
    lake: bool | None = None


class AddPath(Strict):
    op: Literal["addPath"]
    from_: Id = Field(alias="from")
    to: Id
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class AddLife(Strict):
    op: Literal["addLife"]
    kind: LifeKind
    count: Annotated[int, Field(ge=1, le=20)]


Op = Annotated[
    Union[AddPlace, RemovePlace, MovePlace, UpdatePlace, SetAtmosphere, SetClimate, SetTerrain, SetWater, AddPath, AddLife],
    Field(discriminator="op"),
]
OpsList = Annotated[list[Op], Field(min_length=1, max_length=20)]
ops_adapter: TypeAdapter[list[Op]] = TypeAdapter(OpsList)


# ---- API models ----
class WorldRequest(Strict):
    prompt: Annotated[str, Field(min_length=3, max_length=600)]


class XZ(Strict):
    x: float
    z: float
    y: float | None = None


class PlacementSummary(Strict):
    id: Id
    label: str
    x: float
    z: float


class EditContext(Strict):
    player: XZ
    lookAt: XZ | None = None
    lookingAt: Id | None = None
    placements: list[PlacementSummary] = []


class EditRequest(Strict):
    recipe: Recipe
    prompt: Annotated[str, Field(min_length=2, max_length=400)]
    context: EditContext


class AssetRequest(Strict):
    query: Annotated[str, Field(min_length=2, max_length=120)]
    kind: Kind = "prop"
    allowGenerate: bool = False


def dump(model: BaseModel) -> dict:
    """Serialize for the browser: aliases ('from') and no nulls (Zod optional rejects null)."""
    return model.model_dump(by_alias=True, exclude_none=True)


def dump_ops(ops: list) -> list[dict]:
    return [ops_adapter.dump_python([o], by_alias=True, exclude_none=True)[0] for o in ops]
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_contract.py -q`
Expected: PASS (4 recipes + 2 ops + 2 extra tests).

- [x] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(backend): pydantic mirror of recipe/ops + contract tests on shared fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 2: World core (pure TypeScript, deterministic)

### Task 3: Noise helpers

**Files:**
- Create: `web/src/world/noise.ts`
- Test: `web/tests/world/noise.test.ts`

**Interfaces:**
- Produces:
  - `clamp(v, lo, hi)`, `lerp(a, b, t)`, `smoothstep(e0, e1, x)`
  - `fbm(noise: NoiseFunction2D, x, z, octaves, gain = 0.5, lacunarity = 2): number`, in [-1, 1]
  - `ridged(noise, x, z, octaves): number`, in [0, 1]

- [x] **Step 1: Write the failing test**

`web/tests/world/noise.test.ts`:
```ts
import { createNoise2D } from 'simplex-noise';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/rng';
import { clamp, fbm, ridged, smoothstep } from '../../src/world/noise';

describe('noise', () => {
  const n = createNoise2D(mulberry32(1));
  it('fbm stays in [-1, 1] and ridged in [0, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.37, z = i * 0.91;
      const f = fbm(n, x, z, 5, 0.5);
      const r = ridged(n, x, z, 5);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThanOrEqual(1);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
  it('smoothstep and clamp', () => {
    expect(smoothstep(0, 10, -5)).toBe(0);
    expect(smoothstep(0, 10, 15)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5);
    expect(clamp(5, 0, 1)).toBe(1);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run tests/world/noise.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

`web/src/world/noise.ts`:
```ts
import type { NoiseFunction2D } from 'simplex-noise';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Fractal Brownian motion, normalized to [-1, 1]. */
export function fbm(noise: NoiseFunction2D, x: number, z: number, octaves: number, gain = 0.5, lacunarity = 2): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1]: sharp crests for mountains. */
export function ridged(noise: NoiseFunction2D, x: number, z: number, octaves: number): number {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const r = 1 - Math.abs(noise(x * freq, z * freq));
    sum += r * r * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/world/noise.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add web/src/world/noise.ts web/tests/world/noise.test.ts
git commit -m "feat(world): fbm/ridged noise helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: River tracing and segment index

**Files:**
- Create: `web/src/world/river.ts`
- Test: `web/tests/world/river.test.ts`

**Interfaces:**
- Produces:
  - types `Vec2 = { x: number; z: number }`, `Lake = { x; z; radius; levelY }`, `RiverResult = { path: Vec2[]; lake: Lake | null }`
  - `traceRiver(height: (x: number, z: number) => number, start: Vec2, opts: { seaLevelY: number; bound: number; step?: number; maxSteps?: number; maxClimb?: number; lakeRadius?: number }): RiverResult`
  - `segmentDistance(px, pz, a: Vec2, b: Vec2): number`
  - `class SegmentIndex { constructor(cell?: number); addPolyline(points: Vec2[]): void; distance(x, z, maxRange?: number): number /* Infinity if nothing in range */ }`

- [x] **Step 1: Write the failing test**

`web/tests/world/river.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SegmentIndex, segmentDistance, traceRiver } from '../../src/world/river';

describe('traceRiver', () => {
  it('flows downhill to the sea on a tilted plane', () => {
    const res = traceRiver((x) => -x * 0.1, { x: 0, z: 0 }, { seaLevelY: -30, bound: 500 });
    expect(res.lake).toBeNull();
    const last = res.path[res.path.length - 1];
    expect(last.x).toBeGreaterThan(290);
    for (let i = 1; i < res.path.length; i++) expect(res.path[i].x).toBeGreaterThan(res.path[i - 1].x - 0.001);
  });

  it('forms a lake at the bottom of a bowl', () => {
    const res = traceRiver((x, z) => (x * x + z * z) * 0.01, { x: 100, z: 0 }, { seaLevelY: -100, bound: 500 });
    expect(res.lake).not.toBeNull();
    expect(Math.hypot(res.lake!.x, res.lake!.z)).toBeLessThan(10);
  });

  it('stops at the bound', () => {
    const res = traceRiver((x) => -x, { x: 0, z: 0 }, { seaLevelY: -1e9, bound: 100 });
    expect(Math.abs(res.path[res.path.length - 1].x)).toBeLessThanOrEqual(108);
  });
});

describe('SegmentIndex', () => {
  it('measures distance to a polyline', () => {
    expect(segmentDistance(0, 10, { x: -50, z: 0 }, { x: 50, z: 0 })).toBeCloseTo(10);
    const idx = new SegmentIndex(32);
    idx.addPolyline([{ x: -50, z: 0 }, { x: 50, z: 0 }, { x: 50, z: 80 }]);
    expect(idx.distance(0, 10)).toBeCloseTo(10);
    expect(idx.distance(60, 40)).toBeCloseTo(10);
    expect(idx.distance(1000, 1000)).toBe(Infinity);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/world/river.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

`web/src/world/river.ts`:
```ts
export type Vec2 = { x: number; z: number };
export interface Lake { x: number; z: number; radius: number; levelY: number }
export interface RiverResult { path: Vec2[]; lake: Lake | null }

const DIRS: Vec2[] = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 8), z: Math.sin((i * Math.PI) / 8) }));

/**
 * Steepest-descent river. The bed may climb small bumps (it is carved later);
 * once the total climb exceeds maxClimb the river pools into a lake at the
 * lowest point it reached, and the path is cut there.
 */
export function traceRiver(
  height: (x: number, z: number) => number,
  start: Vec2,
  opts: { seaLevelY: number; bound: number; step?: number; maxSteps?: number; maxClimb?: number; lakeRadius?: number },
): RiverResult {
  const step = opts.step ?? 8;
  const maxSteps = opts.maxSteps ?? 600;
  const maxClimb = opts.maxClimb ?? 15;
  const path: Vec2[] = [{ ...start }];
  let p = { ...start };
  let prev: Vec2 | null = null;
  let h = height(p.x, p.z);
  let climb = 0;
  let lowest = { h, index: 0 };
  for (let i = 0; i < maxSteps; i++) {
    if (h <= opts.seaLevelY) return { path, lake: null };
    if (Math.abs(p.x) > opts.bound || Math.abs(p.z) > opts.bound) return { path, lake: null };
    let best: Vec2 | null = null, bestScore = Infinity, bestH = Infinity;
    for (const d of DIRS) {
      const dot = prev ? d.x * prev.x + d.z * prev.z : 1;
      if (dot < -0.2) continue;
      const nh = height(p.x + d.x * step, p.z + d.z * step);
      const score = nh + (1 - dot) * 0.6;
      if (score < bestScore) { bestScore = score; best = d; bestH = nh; }
    }
    if (!best) break;
    if (bestH > h) climb += bestH - h;
    if (climb > maxClimb) {
      const at = path[lowest.index];
      return { path: path.slice(0, lowest.index + 1), lake: { x: at.x, z: at.z, radius: opts.lakeRadius ?? 36, levelY: lowest.h + 0.5 } };
    }
    p = { x: p.x + best.x * step, z: p.z + best.z * step };
    prev = best;
    h = bestH;
    path.push({ ...p });
    if (h < lowest.h) lowest = { h, index: path.length - 1 };
  }
  return { path, lake: null };
}

export function segmentDistance(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

/** Spatial hash of polyline segments for fast "distance to river/road" queries. */
export class SegmentIndex {
  private cells = new Map<string, Array<[Vec2, Vec2]>>();
  constructor(private readonly cell = 32) {}

  addPolyline(points: Vec2[]): void {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const x0 = Math.floor(Math.min(a.x, b.x) / this.cell), x1 = Math.floor(Math.max(a.x, b.x) / this.cell);
      const z0 = Math.floor(Math.min(a.z, b.z) / this.cell), z1 = Math.floor(Math.max(a.z, b.z) / this.cell);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const key = `${cx},${cz}`;
        const list = this.cells.get(key) ?? [];
        list.push([a, b]);
        this.cells.set(key, list);
      }
    }
  }

  distance(x: number, z: number, maxRange = 96): number {
    const r = Math.ceil(maxRange / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = Infinity;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const list = this.cells.get(`${cx + dx},${cz + dz}`);
      if (!list) continue;
      for (const [a, b] of list) best = Math.min(best, segmentDistance(x, z, a, b));
    }
    return best <= maxRange ? best : Infinity;
  }
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/world/river.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add web/src/world/river.ts web/tests/world/river.test.ts
git commit -m "feat(world): steepest-descent river tracing + segment spatial index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: World field (height, water, pads, roads)

**Files:**
- Create: `web/src/world/field.ts`
- Test: `web/tests/world/field.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `CORE_HALF` (Task 1); noise helpers (Task 3); `traceRiver`, `SegmentIndex`, `Vec2`, `Lake` (Task 4).
- Produces:
  - `interface Pad { x; z; radius; y }`
  - `interface Road { points: Vec2[]; width: number; bridges: boolean[] }`
  - `interface WorldField { recipe; amplitude; seaLevelY; hasSea; river: Vec2[]; lakes: Lake[]; pads: Pad[]; roads: Road[]; meander(z); baseHeight(x,z); heightAt(x,z); slopeAt(x,z); isWater(x,z); waterDistance(x,z); waterSurfaceAt(x,z): number | null; detailNoise(x,z); addPad(p); addRoad(r); isReserved(x,z,margin) }`
  - `createField(recipe: Recipe): WorldField`
  - `type FieldSnapshot = { recipe: Recipe; pads: Pad[]; roads: Road[] }`
  - `snapshotField(f): FieldSnapshot`, `restoreField(s): WorldField`

- [x] **Step 1: Write the failing test**

`web/tests/world/field.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createField, restoreField, snapshotField } from '../../src/world/field';
import { loadRecipeFixture } from '../fixtures';

describe('field', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const r = loadRecipeFixture('fishing-valley');
    const a = createField(r), b = createField(r), c = createField({ ...r, seed: r.seed + 1 });
    let diff = 0;
    for (let i = 0; i < 50; i++) {
      const x = i * 13 - 300, z = i * 7 - 150;
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
      diff += Math.abs(a.heightAt(x, z) - c.heightAt(x, z));
    }
    expect(diff).toBeGreaterThan(1);
  });

  it('island: centre above sea, rim below', () => {
    const f = createField(loadRecipeFixture('tropical-island'));
    expect(f.hasSea).toBe(true);
    expect(f.heightAt(0, 0)).toBeGreaterThan(f.seaLevelY);
    expect(f.heightAt(500, 0)).toBeLessThan(f.seaLevelY);
    expect(f.isWater(500, 0)).toBe(true);
    expect(f.waterSurfaceAt(500, 0)).toBe(f.seaLevelY);
  });

  it('valley: floor lower than walls, river carved and wet', () => {
    const f = createField(loadRecipeFixture('fishing-valley'));
    let floor = 0, wall = 0, n = 0;
    for (let z = -400; z <= 400; z += 40) {
      floor += f.baseHeight(f.meander(z), z);
      wall += f.baseHeight(f.meander(z) + 300, z);
      n++;
    }
    expect(floor / n).toBeLessThan(wall / n - 10);
    expect(f.river.length).toBeGreaterThan(30);
    const p = f.river[10];
    expect(f.isWater(p.x, p.z)).toBe(true);
    expect(f.heightAt(p.x, p.z)).toBeLessThan(f.baseHeight(p.x, p.z) - 3);
    expect(f.waterDistance(p.x, p.z)).toBe(0);
  });

  it('mountains with lake=true get a lake', () => {
    const f = createField(loadRecipeFixture('snowy-mountains'));
    expect(f.lakes.length).toBe(1);
    const l = f.lakes[0];
    expect(f.isWater(l.x, l.z)).toBe(true);
  });

  it('pads flatten terrain; roads reserve space; snapshot round-trips', () => {
    const f = createField(loadRecipeFixture('tropical-island'));
    f.addPad({ x: 0, z: 0, radius: 10, y: 60 });
    expect(f.heightAt(0, 0)).toBe(60);
    expect(f.heightAt(6, 0)).toBe(60);
    f.addRoad({ points: [{ x: -50, z: 30 }, { x: 50, z: 30 }], width: 4, bridges: [false] });
    expect(f.isReserved(0, 31, 0)).toBe(true);
    expect(f.isReserved(0, 0, 0)).toBe(true); // pad
    expect(f.isReserved(0, 100, 0)).toBe(false);
    const g = restoreField(JSON.parse(JSON.stringify(snapshotField(f))));
    expect(g.heightAt(3, 2)).toBe(f.heightAt(3, 2));
    expect(g.isReserved(0, 31, 0)).toBe(true);
  });

  it('slope is ~0 on a pad and positive on hills', () => {
    const f = createField(loadRecipeFixture('snowy-mountains'));
    let maxSlope = 0;
    for (let i = 0; i < 200; i++) maxSlope = Math.max(maxSlope, f.slopeAt(i * 5 - 500, i * 3 - 300));
    expect(maxSlope).toBeGreaterThan(0.2);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/world/field.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

`web/src/world/field.ts`:
```ts
import { createNoise2D } from 'simplex-noise';
import { CORE_HALF, type Recipe } from '../core/recipe';
import { mulberry32 } from '../core/rng';
import { clamp, fbm, lerp, ridged, smoothstep } from './noise';
import { SegmentIndex, traceRiver, type Lake, type Vec2 } from './river';

export interface Pad { x: number; z: number; radius: number; y: number }
export interface Road { points: Vec2[]; width: number; bridges: boolean[] }

export interface WorldField {
  readonly recipe: Recipe;
  readonly amplitude: number;
  readonly seaLevelY: number;
  readonly hasSea: boolean;
  readonly river: Vec2[];
  readonly lakes: Lake[];
  readonly pads: Pad[];
  readonly roads: Road[];
  meander(z: number): number;
  baseHeight(x: number, z: number): number;
  heightAt(x: number, z: number): number;
  slopeAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  waterDistance(x: number, z: number): number;
  waterSurfaceAt(x: number, z: number): number | null;
  detailNoise(x: number, z: number): number;
  addPad(p: Pad): void;
  addRoad(r: Road): void;
  isReserved(x: number, z: number, margin: number): boolean;
}

export type FieldSnapshot = { recipe: Recipe; pads: Pad[]; roads: Road[] };

const RIVER_WET = 16;
const RIVER_CARVE_WIDTH = 26;
const RIVER_DEPTH = 5;

export function createField(recipe: Recipe): WorldField {
  const { terrain, seed } = recipe;
  const nA = createNoise2D(mulberry32(seed));
  const nB = createNoise2D(mulberry32(seed ^ 0x9e3779b9));
  const nD = createNoise2D(mulberry32(seed ^ 0x85ebca6b));
  const amplitude = 20 + terrain.height * 140;
  const seaLevelY = terrain.seaLevel * amplitude;
  const hasSea = terrain.seaLevel > 0;
  const freq = 1 / (420 - terrain.roughness * 260);
  const gain = 0.42 + terrain.roughness * 0.18;

  const meander = (z: number) => 140 * nB(z * 0.0015, 11.7);

  const shape01 = (x: number, z: number): number => {
    const n = (fbm(nA, x * freq, z * freq, 5, gain) + 1) / 2;
    const tilt = -0.06 * (z / CORE_HALF);
    switch (terrain.shape) {
      case 'plains': return 0.3 + 0.25 * n;
      case 'hills': return n;
      case 'mountains': return 0.25 * n + 0.75 * Math.pow(ridged(nB, x * freq * 0.7, z * freq * 0.7, 5), 1.6);
      case 'valley': {
        const wall = smoothstep(30, 260, Math.abs(x - meander(z)));
        return 0.15 + 0.2 * n + 0.65 * wall * (0.6 + 0.4 * n) + tilt;
      }
      case 'canyon': {
        const cut = 1 - smoothstep(25, 70, Math.abs(x - meander(z)));
        return 0.65 + 0.15 * n - 0.55 * cut + tilt;
      }
      case 'island': {
        const r = Math.hypot(x, z) / (CORE_HALF * 0.9);
        return clamp(0.55 + 0.35 * n - r * r * 0.75, 0, 1);
      }
    }
  };
  const baseHeight = (x: number, z: number) => shape01(x, z) * amplitude;

  // ---- water ----
  const riverIndex = new SegmentIndex(32);
  let river: Vec2[] = [];
  const lakes: Lake[] = [];
  if (recipe.water.river) {
    let start: Vec2;
    if (terrain.shape === 'valley' || terrain.shape === 'canyon') {
      start = { x: meander(-CORE_HALF + 16), z: -CORE_HALF + 16 };
    } else {
      start = { x: 0, z: 0 };
      let best = -Infinity;
      const lim = CORE_HALF * 0.75;
      for (let x = -lim; x <= lim; x += 32) for (let z = -lim; z <= lim; z += 32) {
        const h = baseHeight(x, z);
        if (h > best) { best = h; start = { x, z }; }
      }
    }
    const res = traceRiver(baseHeight, start, { seaLevelY: hasSea ? seaLevelY : -Infinity, bound: CORE_HALF });
    river = res.path;
    if (res.lake) lakes.push(res.lake);
    if (river.length > 1) riverIndex.addPolyline(river);
  }
  if (recipe.water.lake && lakes.length === 0) {
    let best = Infinity, at: Vec2 = { x: 0, z: 0 };
    const lim = CORE_HALF * 0.7;
    for (let x = -lim; x <= lim; x += 32) for (let z = -lim; z <= lim; z += 32) {
      const h = baseHeight(x, z);
      if (h < best) { best = h; at = { x, z }; }
    }
    lakes.push({ x: at.x, z: at.z, radius: 45, levelY: best + 0.5 });
  }

  const riverDist = (x: number, z: number, range = 48) => (river.length > 1 ? riverIndex.distance(x, z, range) : Infinity);

  const carved = (x: number, z: number): number => {
    let h = baseHeight(x, z);
    const d = riverDist(x, z);
    if (d < RIVER_CARVE_WIDTH) h -= RIVER_DEPTH * (1 - smoothstep(5, RIVER_CARVE_WIDTH, d));
    for (const l of lakes) {
      const dl = Math.hypot(x - l.x, z - l.z);
      if (dl < l.radius * 1.4) h = Math.min(h, lerp(l.levelY - 5, h, smoothstep(l.radius * 0.5, l.radius * 1.4, dl)));
    }
    return h;
  };

  // ---- pads & roads ----
  const pads: Pad[] = [];
  const roads: Road[] = [];
  const roadIndex = new SegmentIndex(32);

  const nearWaterChannel = (x: number, z: number) =>
    riverDist(x, z) < RIVER_WET + 4 || lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius * 1.2);

  const heightAt = (x: number, z: number): number => {
    let h = carved(x, z);
    if (pads.length === 0 || nearWaterChannel(x, z)) return h;
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.radius) h = p.y;
      else if (d < p.radius * 1.8) h = lerp(p.y, h, smoothstep(p.radius, p.radius * 1.8, d));
    }
    return h;
  };

  const slopeAt = (x: number, z: number): number => {
    const e = 1;
    const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  };

  const isWater = (x: number, z: number): boolean => {
    if (riverDist(x, z) < RIVER_WET) return true;
    for (const l of lakes) if (Math.hypot(x - l.x, z - l.z) < l.radius) return true;
    return hasSea && heightAt(x, z) < seaLevelY;
  };

  const waterSurfaceAt = (x: number, z: number): number | null => {
    for (const l of lakes) if (Math.hypot(x - l.x, z - l.z) < l.radius) return l.levelY;
    if (riverDist(x, z) < RIVER_WET) return baseHeight(x, z) - 1.5;
    if (hasSea && heightAt(x, z) < seaLevelY) return seaLevelY;
    return null;
  };

  const waterDistance = (x: number, z: number): number => {
    if (isWater(x, z)) return 0;
    let d = riverDist(x, z, 160) - RIVER_WET;
    for (const l of lakes) d = Math.min(d, Math.hypot(x - l.x, z - l.z) - l.radius);
    if (hasSea) {
      const h = heightAt(x, z);
      d = Math.min(d, (h - seaLevelY) / Math.max(slopeAt(x, z), 0.08));
    }
    return Math.max(0, Math.min(d, 999));
  };

  return {
    recipe, amplitude, seaLevelY, hasSea, river, lakes, pads, roads,
    meander, baseHeight, heightAt, slopeAt, isWater, waterDistance, waterSurfaceAt,
    detailNoise: (x, z) => nD(x, z),
    addPad: (p) => { pads.push({ ...p }); },
    addRoad: (r) => { roads.push(r); roadIndex.addPolyline(r.points); },
    isReserved: (x, z, margin) => {
      for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < p.radius + margin) return true;
      return roads.length > 0 && roadIndex.distance(x, z, 16 + margin) < 2 + margin;
    },
  };
}

export function snapshotField(f: WorldField): FieldSnapshot {
  return { recipe: f.recipe, pads: f.pads.map((p) => ({ ...p })), roads: f.roads.map((r) => ({ ...r, points: [...r.points], bridges: [...r.bridges] })) };
}

export function restoreField(s: FieldSnapshot): WorldField {
  const f = createField(s.recipe);
  for (const p of s.pads) f.addPad(p);
  for (const r of s.roads) f.addRoad(r);
  return f;
}
```

Note: `isReserved` uses a fixed road half-width of 2 m. All roads are 4 m wide (Tasks 8 and 9).

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/world/field.test.ts`
Expected: PASS. If the valley river is shorter than 30 points, the river pooled early: raise `maxClimb` in the `traceRiver` call to `25`, and record that in `docs/DECISIONS.md`.

- [x] **Step 5: Commit**

```bash
git add web/src/world/field.ts web/tests/world/field.test.ts
git commit -m "feat(world): terrain field with shapes, river/lake carving, pads, roads, snapshots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Biomes

**Files:**
- Create: `web/src/world/biome.ts`
- Test: `web/tests/world/biome.test.ts`

**Interfaces:**
- Consumes: `WorldField` (Task 5).
- Produces:
  - `type Biome = 'sand'|'grass'|'forest'|'pine'|'snow'|'rock'|'desert'|'marsh'`
  - `interface BiomeSample { height01; slope; temperature; moisture; nearWater: boolean; nearSea: boolean }`
  - `classifyBiome(s: BiomeSample): Biome`
  - `biomeAt(field: WorldField, x, z): Biome`
  - `BIOME_COLOR: Record<Biome, [number, number, number]>` (linear 0–1 RGB)

- [x] **Step 1: Write the failing test**

`web/tests/world/biome.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { classifyBiome, type BiomeSample } from '../../src/world/biome';

const base: BiomeSample = { height01: 0.1, slope: 0.1, temperature: 0.6, moisture: 0.5, nearWater: false, nearSea: false };

describe('classifyBiome', () => {
  it.each([
    [{ slope: 0.9 }, 'rock'],
    [{ nearSea: true }, 'sand'],
    [{ height01: 0.95, temperature: 0.3 }, 'snow'],
    [{ height01: 0.4, temperature: 0.4 }, 'pine'],
    [{ temperature: 0.9, moisture: 0.1 }, 'desert'],
    [{ temperature: 0.4, moisture: 0.1 }, 'grass'],
    [{ moisture: 0.7, nearWater: true }, 'marsh'],
    [{ moisture: 0.55 }, 'forest'],
    [{ moisture: 0.35 }, 'grass'],
  ] as const)('%o → %s', (patch, expected) => {
    expect(classifyBiome({ ...base, ...patch })).toBe(expected);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/world/biome.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

`web/src/world/biome.ts`:
```ts
import type { WorldField } from './field';
import { clamp } from './noise';

export type Biome = 'sand' | 'grass' | 'forest' | 'pine' | 'snow' | 'rock' | 'desert' | 'marsh';

export interface BiomeSample {
  height01: number;
  slope: number;
  temperature: number;
  moisture: number;
  nearWater: boolean;
  nearSea: boolean;
}

export function classifyBiome(s: BiomeSample): Biome {
  if (s.slope > 0.75) return 'rock';
  if (s.nearSea) return 'sand';
  const t = s.temperature - s.height01 * 0.55;
  const m = s.moisture + (s.nearWater ? 0.2 : 0);
  if (t < 0.05) return 'snow';
  if (t < 0.2) return 'pine';
  if (m < 0.25) return t > 0.55 ? 'desert' : 'grass';
  if (m > 0.75 && s.nearWater) return 'marsh';
  if (m > 0.45) return 'forest';
  return 'grass';
}

export function biomeAt(field: WorldField, x: number, z: number): Biome {
  const h = field.heightAt(x, z);
  const n = field.detailNoise(x * 0.01, z * 0.01) * 0.08;
  return classifyBiome({
    height01: clamp(h / field.amplitude, 0, 1),
    slope: field.slopeAt(x, z),
    temperature: field.recipe.climate.temperature + n,
    moisture: field.recipe.climate.moisture + n,
    nearWater: field.waterDistance(x, z) < 25,
    nearSea: field.hasSea && h < field.seaLevelY + 2.5,
  });
}

export const BIOME_COLOR: Record<Biome, [number, number, number]> = {
  sand: [0.86, 0.79, 0.6],
  grass: [0.42, 0.6, 0.28],
  forest: [0.25, 0.45, 0.2],
  pine: [0.22, 0.36, 0.24],
  snow: [0.93, 0.95, 0.98],
  rock: [0.47, 0.45, 0.42],
  desert: [0.85, 0.6, 0.38],
  marsh: [0.36, 0.42, 0.26],
};
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/world/biome.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add web/src/world/biome.ts web/tests/world/biome.test.ts
git commit -m "feat(world): biome classification and colours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Placement solver (the "intelligent" part)

**Files:**
- Create: `web/src/world/placement.ts`
- Test: `web/tests/world/placement.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `Place`, `Relation`, `CORE_HALF` (Task 1); `hashString`, `mulberry32` (Task 1); `WorldField`, `Pad` (Task 5); `clamp` (Task 3).
- Produces:
  - `interface Placement { id; kind: PlaceKind; x; z; y; rotation; radius; reasons: string[]; warnings: string[] }`
  - `placeRadius(place: Place): number`
  - `orderPlaces(places: Place[]): Place[]`
  - `solvePlacements(recipe: Recipe, field: WorldField, fixed?: Placement[]): Placement[]`. It mutates `field` by adding pads for every non-prop placement, fixed ones included.
  - `findSpawn(field: WorldField, placements: Placement[]): { x; y; z }`

- [x] **Step 1: Write the failing test**

`web/tests/world/placement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { findSpawn, orderPlaces, solvePlacements } from '../../src/world/placement';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

describe('placement', () => {
  it.each(RECIPE_FIXTURES)('%s: on land, no overlaps, not floating', (name) => {
    const recipe = loadRecipeFixture(name);
    const field = createField(recipe);
    const pls = solvePlacements(recipe, field);
    expect(pls.map((p) => p.id).sort()).toEqual(recipe.places.map((p) => p.id).sort());
    for (const p of pls) {
      expect(field.isWater(p.x, p.z)).toBe(false);
      expect(Math.abs(p.y - field.heightAt(p.x, p.z))).toBeLessThan(0.5);
      expect(p.reasons.length + p.warnings.length).toBeGreaterThan(0);
    }
    for (let i = 0; i < pls.length; i++) for (let j = i + 1; j < pls.length; j++) {
      const a = pls[i], b = pls[j];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius - 1e-6);
    }
  });

  it('is deterministic', () => {
    const r = loadRecipeFixture('fishing-valley');
    const a = solvePlacements(r, createField(r));
    const b = solvePlacements(r, createField(r));
    expect(a).toEqual(b);
  });

  it('respects relations: tower higher than village, campfire near village', () => {
    const r = loadRecipeFixture('fishing-valley');
    const pls = solvePlacements(r, createField(r));
    const v = pls.find((p) => p.id === 'village')!, t = pls.find((p) => p.id === 'tower')!, c = pls.find((p) => p.id === 'campfire')!;
    expect(t.y).toBeGreaterThan(v.y);
    expect(Math.hypot(c.x - v.x, c.z - v.z)).toBeLessThanOrEqual(v.radius + c.radius + 4 + 30 + 1);
  });

  it('honours an exact "at" position', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places.push({ id: 'marker', kind: 'prop', label: 'Marker', asset: 'stone marker', size: 'small', interaction: 'none', where: [{ rel: 'at', x: 100, z: 50 }] });
    const field = createField(r);
    const m = solvePlacements(r, field).find((p) => p.id === 'marker')!;
    expect(m.x).toBe(100);
    expect(m.z).toBe(50);
    expect(m.reasons).toContain('placed where you asked');
  });

  it('puts a prop on top of a surface when "at" carries y (e.g. a candle on a table)', () => {
    const r = loadRecipeFixture('fishing-valley');
    r.places.push({ id: 'candle', kind: 'prop', label: 'Candle', asset: 'candle', size: 'small', interaction: 'light', where: [{ rel: 'at', x: 100, z: 50, y: 123.45 }] });
    const c = solvePlacements(r, createField(r)).find((p) => p.id === 'candle')!;
    expect(c.y).toBe(123.45);
  });

  it('keeps fixed placements and orders by dependency', () => {
    const r = loadRecipeFixture('fishing-valley');
    expect(orderPlaces([...r.places].reverse()).map((p) => p.id).indexOf('village')).toBeLessThan(
      orderPlaces([...r.places].reverse()).map((p) => p.id).indexOf('campfire'),
    );
    const first = solvePlacements(r, createField(r));
    const village = first.find((p) => p.id === 'village')!;
    const again = solvePlacements(r, createField(r), [village]);
    expect(again.find((p) => p.id === 'village')).toEqual(village);
  });

  it('spawn is on dry gentle ground', () => {
    const r = loadRecipeFixture('tropical-island');
    const field = createField(r);
    const s = findSpawn(field, solvePlacements(r, field));
    expect(field.isWater(s.x, s.z)).toBe(false);
    expect(s.y).toBeGreaterThan(field.heightAt(s.x, s.z));
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/world/placement.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

`web/src/world/placement.ts`:
```ts
import { CORE_HALF, type Place, type PlaceKind, type PlaceSize, type Recipe, type Relation } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { Pad, WorldField } from './field';
import { clamp } from './noise';

export interface Placement {
  id: string;
  kind: PlaceKind;
  x: number;
  z: number;
  y: number;
  rotation: number;
  radius: number;
  reasons: string[];
  warnings: string[];
}

const RADIUS: Record<PlaceKind, Record<PlaceSize, number>> = {
  settlement: { small: 40, medium: 65, large: 95 },
  landmark: { small: 8, medium: 12, large: 18 },
  structure: { small: 6, medium: 9, large: 13 },
  prop: { small: 1.5, medium: 2.5, large: 4 },
};
const MAX_SLOPE: Record<PlaceKind, number> = { settlement: 0.22, landmark: 0.5, structure: 0.32, prop: 0.6 };
const GAP = 4;
const CANDIDATES = 1500;
const DIR: Record<'north' | 'south' | 'east' | 'west', { x: number; z: number }> = {
  north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 },
};

type Rel<K extends Relation['rel']> = Extract<Relation, { rel: K }>;
interface Candidate { x: number; z: number; h: number; slope: number }

export function placeRadius(place: Place): number {
  return RADIUS[place.kind][place.size];
}

function targetsOf(place: Place): string[] {
  return place.where.flatMap((r) => ('target' in r ? [r.target] : r.rel === 'direction' && r.of ? [r.of] : []));
}

export function orderPlaces(places: Place[]): Place[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const done = new Set<string>(), visiting = new Set<string>();
  const out: Place[] = [];
  const visit = (p: Place) => {
    if (done.has(p.id) || visiting.has(p.id)) return;
    visiting.add(p.id);
    for (const t of targetsOf(p)) { const q = byId.get(t); if (q) visit(q); }
    visiting.delete(p.id);
    done.add(p.id);
    out.push(p);
  };
  places.forEach(visit);
  return out;
}

function padFor(p: Placement): Pad {
  return { x: p.x, z: p.z, radius: p.kind === 'settlement' ? p.radius * 0.85 : p.radius, y: p.y };
}

function siteProblem(field: WorldField, x: number, z: number, r: number, maxSlope: number, placed: Map<string, Placement>, relax: boolean): string | null {
  if (Math.abs(x) > CORE_HALF - r || Math.abs(z) > CORE_HALF - r) return 'outside the world core';
  let slope = 0;
  for (const [dx, dz] of [[0, 0], [r * 0.7, 0], [-r * 0.7, 0], [0, r * 0.7], [0, -r * 0.7]]) {
    if (field.isWater(x + dx, z + dz)) return 'in water';
    slope = Math.max(slope, field.slopeAt(x + dx, z + dz));
  }
  if (slope > maxSlope * (relax ? 2 : 1)) return 'too steep';
  for (const p of placed.values()) if (Math.hypot(p.x - x, p.z - z) < p.radius + r + (relax ? 0 : GAP)) return `overlapping ${p.id}`;
  return null;
}

function lineOfSight(field: WorldField, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    if (field.heightAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) > a.y + (b.y - a.y) * t) return false;
  }
  return true;
}

interface ScoreCtx { field: WorldField; placed: Map<string, Placement>; minH: number; maxH: number; radius: number }

function scoreRelation(rel: Relation, c: Candidate, ctx: ScoreCtx): { score: number; reason: string } {
  switch (rel.rel) {
    case 'highest': return { score: (c.h - ctx.minH) / Math.max(1e-6, ctx.maxH - ctx.minH), reason: `high ground (${c.h.toFixed(0)} m)` };
    case 'lowest': return { score: 1 - (c.h - ctx.minH) / Math.max(1e-6, ctx.maxH - ctx.minH), reason: `low ground (${c.h.toFixed(0)} m)` };
    case 'flat': return { score: 1 - clamp(c.slope / 0.35, 0, 1), reason: `gentle slope (${Math.round((Math.atan(c.slope) * 180) / Math.PI)}°)` };
    case 'by_water': {
      const d = Math.max(0, ctx.field.waterDistance(c.x, c.z) - ctx.radius);
      return { score: 1 - clamp(d / 80, 0, 1), reason: `${d.toFixed(0)} m from water` };
    }
    case 'near': {
      const t = ctx.placed.get(rel.target);
      if (!t) return { score: 0.5, reason: `${rel.target} not placed yet` };
      const d = Math.max(0, Math.hypot(t.x - c.x, t.z - c.z) - t.radius - ctx.radius);
      return { score: 1 - clamp(d / rel.maxDist, 0, 1), reason: `${d.toFixed(0)} m from ${t.id}` };
    }
    case 'far_from': {
      const t = ctx.placed.get(rel.target);
      if (!t) return { score: 0.5, reason: `${rel.target} not placed yet` };
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      return { score: clamp(d / rel.minDist, 0, 1), reason: `${d.toFixed(0)} m from ${t.id}` };
    }
    case 'direction': {
      const o = rel.of ? ctx.placed.get(rel.of) : undefined;
      const dx = c.x - (o?.x ?? 0), dz = c.z - (o?.z ?? 0);
      const len = Math.hypot(dx, dz) || 1;
      const v = DIR[rel.dir];
      const dot = (dx * v.x + dz * v.z) / len;
      return { score: dot > 0.3 ? (dot + 1) / 2 : ((dot + 1) / 2) * 0.3, reason: `${rel.dir} of ${o?.id ?? 'the centre'}` };
    }
    case 'visible_from': {
      const t = ctx.placed.get(rel.target);
      if (!t) return { score: 0.5, reason: `${rel.target} not placed yet` };
      const ok = lineOfSight(ctx.field, { x: t.x, y: t.y + 3, z: t.z }, { x: c.x, y: c.h + 8, z: c.z });
      return { score: ok ? 1 : 0, reason: ok ? `visible from ${t.id}` : `hidden from ${t.id}` };
    }
    case 'at': return { score: 1, reason: 'placed where you asked' };
  }
}

function sampleCandidates(place: Place, placed: Map<string, Placement>, rng: () => number): Array<{ x: number; z: number }> {
  const near = place.where.find((r): r is Rel<'near'> => r.rel === 'near' && placed.has(r.target));
  const out: Array<{ x: number; z: number }> = [];
  const r = placeRadius(place);
  for (let i = 0; i < CANDIDATES; i++) {
    if (near) {
      const t = placed.get(near.target)!;
      const a = rng() * Math.PI * 2;
      const d = t.radius + r + GAP + Math.sqrt(rng()) * near.maxDist;
      out.push({ x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d });
    } else {
      const lim = CORE_HALF * 0.9;
      out.push({ x: (rng() * 2 - 1) * lim, z: (rng() * 2 - 1) * lim });
    }
  }
  return out;
}

function finish(place: Place, field: WorldField, x: number, z: number, radius: number, reasons: string[], warnings: string[], placed: Map<string, Placement>, yOverride?: number): Placement {
  const pts = [[0, 0], [radius * 0.5, 0], [-radius * 0.5, 0], [0, radius * 0.5], [0, -radius * 0.5]];
  const avg = pts.reduce((s, [dx, dz]) => s + field.heightAt(x + dx, z + dz), 0) / pts.length;
  const targetId = targetsOf(place).find((id) => placed.has(id));
  const face = targetId ? placed.get(targetId)! : { x: 0, z: 0 };
  const rotation = Math.atan2(face.x - x, face.z - z);
  return { id: place.id, kind: place.kind, x, z, y: yOverride ?? (place.kind === 'prop' ? field.heightAt(x, z) : avg), rotation, radius, reasons, warnings };
}

function placeOne(place: Place, field: WorldField, placed: Map<string, Placement>, seed: number): Placement {
  const radius = placeRadius(place);
  const warnings: string[] = [];
  for (const id of targetsOf(place)) if (!placed.has(id)) warnings.push(`${id} was not placed before ${place.id}`);
  const at = place.where.find((r): r is Rel<'at'> => r.rel === 'at');
  if (at) {
    const problem = siteProblem(field, at.x, at.z, radius, MAX_SLOPE[place.kind], placed, false);
    if (problem) warnings.push(`requested spot is ${problem}`);
    return finish(place, field, at.x, at.z, radius, ['placed where you asked'], warnings, placed, place.kind === 'prop' ? at.y : undefined);
  }
  const rng = mulberry32(seed ^ hashString(place.id));
  for (const relax of [false, true]) {
    const cands: Candidate[] = [];
    for (const p of sampleCandidates(place, placed, rng)) {
      if (siteProblem(field, p.x, p.z, radius, MAX_SLOPE[place.kind], placed, relax) === null) {
        cands.push({ ...p, h: field.heightAt(p.x, p.z), slope: field.slopeAt(p.x, p.z) });
      }
    }
    if (cands.length === 0) continue;
    if (relax) warnings.push('no ideal spot; relaxed slope and spacing limits');
    let minH = Infinity, maxH = -Infinity;
    for (const c of cands) { minH = Math.min(minH, c.h); maxH = Math.max(maxH, c.h); }
    const ctx: ScoreCtx = { field, placed, minH, maxH, radius };
    let best = cands[0], bestScore = -Infinity, bestScored: Array<{ score: number; reason: string }> = [];
    for (const c of cands) {
      const scored = place.where.map((r) => scoreRelation(r, c, ctx));
      const mean = scored.length ? scored.reduce((s, x) => s + x.score, 0) / scored.length : 0.5;
      const total = mean + 0.05 * (1 - clamp(c.slope / 0.5, 0, 1));
      if (total > bestScore) { bestScore = total; best = c; bestScored = scored; }
    }
    const reasons = bestScored.map((s) => s.reason);
    place.where.forEach((r, i) => { if (bestScored[i] && bestScored[i].score < 0.3) warnings.push(`could not fully satisfy "${r.rel}"`); });
    if (reasons.length === 0) reasons.push('open, gentle ground');
    return finish(place, field, best.x, best.z, radius, reasons, warnings, placed);
  }
  warnings.push('no valid spot found; placed at the centre');
  return finish(place, field, 0, 0, radius, [], warnings, placed);
}

export function solvePlacements(recipe: Recipe, field: WorldField, fixed: Placement[] = []): Placement[] {
  const placed = new Map<string, Placement>();
  for (const p of fixed) {
    placed.set(p.id, p);
    if (p.kind !== 'prop') field.addPad(padFor(p));
  }
  for (const place of orderPlaces(recipe.places)) {
    if (placed.has(place.id)) continue;
    const pl = placeOne(place, field, placed, recipe.seed);
    placed.set(pl.id, pl);
    if (place.kind !== 'prop') field.addPad(padFor(pl));
  }
  return recipe.places.map((p) => placed.get(p.id)!).filter(Boolean);
}

export function findSpawn(field: WorldField, placements: Placement[]): { x: number; y: number; z: number } {
  const s = placements.find((p) => p.kind === 'settlement') ?? placements[0];
  const cx = s?.x ?? 0, cz = s?.z ?? 0, r = (s?.radius ?? 0) + 6;
  for (let i = 0; i < 96; i++) {
    const a = i * 0.7, d = r + i * 2;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (!field.isWater(x, z) && field.slopeAt(x, z) < 0.5) return { x, y: field.heightAt(x, z) + 1.2, z };
  }
  return { x: cx, y: field.heightAt(cx, cz) + 2, z: cz };
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/world/placement.test.ts`
Expected: PASS. If the "not floating" assertion fails for a prop, it means a later pad covered the prop. Check that props are placed after pads (`orderPlaces` keeps dependents last); if a fixture still fails, set the prop's `y` from `field.heightAt` after all placements, at the end of `solvePlacements`.

- [x] **Step 5: Commit**

```bash
git add web/src/world/placement.ts web/tests/world/placement.test.ts
git commit -m "feat(world): relation-based placement solver with hard constraints and reasons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Roads (A* + smoothing)

**Files:**
- Create: `web/src/world/roads.ts`
- Test: `web/tests/world/roads.test.ts`

**Interfaces:**
- Consumes: `WorldField`, `Road` (Task 5); `Vec2` (Task 4); `CORE_HALF`.
- Produces:
  - `findPath(field: WorldField, from: Vec2, to: Vec2, cell?: number): Road | null` (width 4)
  - `chaikin(points: Vec2[], iterations?: number): Vec2[]`

- [x] **Step 1: Write the failing test**

`web/tests/world/roads.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { chaikin, findPath } from '../../src/world/roads';
import { loadRecipeFixture } from '../fixtures';

describe('roads', () => {
  it('chaikin keeps endpoints and adds points', () => {
    const out = chaikin([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], 2);
    expect(out[0]).toEqual({ x: 0, z: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, z: 10 });
    expect(out.length).toBeGreaterThan(3);
  });

  it('connects two placements on the valley', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const pls = solvePlacements(r, field);
    const v = pls.find((p) => p.id === 'village')!, t = pls.find((p) => p.id === 'tower')!;
    const road = findPath(field, v, t);
    expect(road).not.toBeNull();
    const pts = road!.points;
    expect(Math.hypot(pts[0].x - v.x, pts[0].z - v.z)).toBeLessThan(12);
    expect(Math.hypot(pts[pts.length - 1].x - t.x, pts[pts.length - 1].z - t.z)).toBeLessThan(12);
    expect(road!.bridges.length).toBe(pts.length - 1);
    expect(road!.width).toBe(4);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/world/roads.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

`web/src/world/roads.ts`:
```ts
import { CORE_HALF } from '../core/recipe';
import type { Road, WorldField } from './field';
import type { Vec2 } from './river';

class MinHeap {
  private items: Array<[number, number]> = [];
  get size() { return this.items.length; }
  push(f: number, v: number) {
    const a = this.items;
    a.push([f, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0][1];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function chaikin(points: Vec2[], iterations = 2): Vec2[] {
  let out = points;
  for (let it = 0; it < iterations; it++) {
    if (out.length < 3) break;
    const next: Vec2[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, z: 0.75 * a.z + 0.25 * b.z });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, z: 0.25 * a.z + 0.75 * b.z });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

export function findPath(field: WorldField, from: Vec2, to: Vec2, cell = 8): Road | null {
  const pad = 160;
  const minX = Math.max(-CORE_HALF, Math.min(from.x, to.x) - pad), maxX = Math.min(CORE_HALF, Math.max(from.x, to.x) + pad);
  const minZ = Math.max(-CORE_HALF, Math.min(from.z, to.z) - pad), maxZ = Math.min(CORE_HALF, Math.max(from.z, to.z) + pad);
  const cols = Math.ceil((maxX - minX) / cell) + 1, rows = Math.ceil((maxZ - minZ) / cell) + 1;
  const n = cols * rows;
  const px = (c: number) => minX + c * cell, pz = (r: number) => minZ + r * cell;
  const slope = new Float32Array(n), water = new Uint8Array(n);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    slope[i] = field.slopeAt(px(c), pz(r));
    water[i] = field.isWater(px(c), pz(r)) ? 1 : 0;
  }
  const cellOf = (p: Vec2) => {
    const c = Math.max(0, Math.min(cols - 1, Math.round((p.x - minX) / cell)));
    const r = Math.max(0, Math.min(rows - 1, Math.round((p.z - minZ) / cell)));
    return r * cols + c;
  };
  const start = cellOf(from), goal = cellOf(to);
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const gc = goal % cols, gr = Math.floor(goal / cols);
  const h = (i: number) => Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr) * cell;
  g[start] = 0;
  heap.push(h(start), start);
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % cols, cr = Math.floor(cur / cols);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nb = nr * cols + nc;
      if (closed[nb]) continue;
      const step = (dr && dc ? Math.SQRT2 : 1) * cell;
      const cost = g[cur] + step * (1 + 12 * slope[nb]) + (water[nb] ? 60 : 0);
      if (cost < g[nb]) { g[nb] = cost; came[nb] = cur; heap.push(cost + h(nb), nb); }
    }
  }
  if (start !== goal && came[goal] === -1) return null;
  const cells: number[] = [];
  for (let i = goal; i !== -1; i = came[i]) { cells.push(i); if (i === start) break; }
  cells.reverse();
  const raw = cells.map((i) => ({ x: px(i % cols), z: pz(Math.floor(i / cols)) }));
  const points = chaikin(raw, 2);
  const bridges: boolean[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    bridges.push(field.isWater((points[i].x + points[i + 1].x) / 2, (points[i].z + points[i + 1].z) / 2));
  }
  return { points, width: 4, bridges };
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/world/roads.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add web/src/world/roads.ts web/tests/world/roads.test.ts
git commit -m "feat(world): A* roads over slope/water cost with chaikin smoothing and bridges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Settlement layout

**Files:**
- Create: `web/src/world/settlement.ts`
- Test: `web/tests/world/settlement.test.ts`

**Interfaces:**
- Consumes: `Place`, `Interaction` (Task 1); `WorldField`, `Road` (Task 5); `Placement` (Task 7); rng (Task 1).
- Produces:
  - `interface Building { id: string; placeId: string; x; z; y; rotation; kind: 'house'|'well'|'market'; asset: string; footprint: number; interaction: Interaction }`
  - `layoutSettlement(place: Place, pl: Placement, field: WorldField, seed: number): { buildings: Building[]; spine: Road }`

- [x] **Step 1: Write the failing test**

`web/tests/world/settlement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { layoutSettlement } from '../../src/world/settlement';
import { loadRecipeFixture } from '../fixtures';

describe('settlement', () => {
  it('lays out a dry, non-overlapping village inside its radius', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const pl = solvePlacements(r, field).find((p) => p.id === 'village')!;
    const place = r.places.find((p) => p.id === 'village')!;
    const { buildings, spine } = layoutSettlement(place, pl, field, r.seed);
    expect(buildings.length).toBeGreaterThanOrEqual(3);
    expect(buildings.length).toBeLessThanOrEqual(7);
    expect(buildings.filter((b) => b.kind === 'well').length).toBe(1);
    for (const b of buildings) {
      expect(field.isWater(b.x, b.z)).toBe(false);
      expect(Math.hypot(b.x - pl.x, b.z - pl.z)).toBeLessThanOrEqual(pl.radius * 1.05);
      expect(b.y).toBeCloseTo(field.heightAt(b.x, b.z), 5);
    }
    for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
      expect(Math.hypot(buildings[i].x - buildings[j].x, buildings[i].z - buildings[j].z)).toBeGreaterThanOrEqual(6);
    }
    expect(spine.points.length).toBe(2);
    expect(buildings.filter((b) => b.kind === 'house').every((b) => b.interaction === 'door')).toBe(true);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/world/settlement.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

`web/src/world/settlement.ts`:
```ts
import type { Interaction, Place } from '../core/recipe';
import { hashString, mulberry32 } from '../core/rng';
import type { Road, WorldField } from './field';
import type { Placement } from './placement';

export interface Building {
  id: string;
  placeId: string;
  x: number;
  z: number;
  y: number;
  rotation: number;
  kind: 'house' | 'well' | 'market';
  asset: string;
  footprint: number;
  interaction: Interaction;
}

const CAP = { small: 6, medium: 12, large: 20 } as const;

export function layoutSettlement(place: Place, pl: Placement, field: WorldField, seed: number): { buildings: Building[]; spine: Road } {
  const rng = mulberry32(seed ^ hashString(`${place.id}:layout`));
  const angle = rng() * Math.PI;
  const dir = { x: Math.cos(angle), z: Math.sin(angle) };
  const side = { x: -dir.z, z: dir.x };
  const half = pl.radius * 0.9;
  const spine: Road = {
    points: [{ x: pl.x - dir.x * half, z: pl.z - dir.z * half }, { x: pl.x + dir.x * half, z: pl.z + dir.z * half }],
    width: 4,
    bridges: [false],
  };
  const centreKind = place.size === 'large' ? 'market' : 'well';
  const cx = pl.x + side.x * 7, cz = pl.z + side.z * 7;
  const buildings: Building[] = [{
    id: `${place.id}-centre`, placeId: place.id, x: cx, z: cz, y: field.heightAt(cx, cz),
    rotation: Math.atan2(-side.x, -side.z), kind: centreKind,
    asset: centreKind === 'market' ? 'market stall' : 'stone well', footprint: 3, interaction: 'none',
  }];
  const houseInteraction: Interaction = place.interaction !== 'none' ? place.interaction : 'door';
  let n = 0;
  for (let t = -half + 8; t <= half - 8 && n < CAP[place.size]; t += 13) {
    for (const s of [-1, 1]) {
      if (n >= CAP[place.size]) break;
      const jitter = (rng() - 0.5) * 3;
      const x = pl.x + dir.x * (t + jitter) + side.x * s * 10;
      const z = pl.z + dir.z * (t + jitter) + side.z * s * 10;
      if (Math.hypot(x - cx, z - cz) < 9) continue;
      if (Math.hypot(x - pl.x, z - pl.z) > pl.radius) continue;
      if (field.isWater(x, z) || field.slopeAt(x, z) > 0.4) continue;
      buildings.push({
        id: `${place.id}-house-${n}`, placeId: place.id, x, z, y: field.heightAt(x, z),
        rotation: Math.atan2(-side.x * s, -side.z * s), kind: 'house',
        asset: place.asset, footprint: 5, interaction: houseInteraction,
      });
      n++;
    }
  }
  return { buildings, spine };
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/world/settlement.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add web/src/world/settlement.ts web/tests/world/settlement.test.ts
git commit -m "feat(world): settlement layout along a spine road

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Scatter and chunk data

**Files:**
- Create: `web/src/world/scatter.ts`, `web/src/world/chunkData.ts`
- Test: `web/tests/world/scatter.test.ts`, `web/tests/world/chunkData.test.ts`

**Interfaces:**
- Consumes: `WorldField` (Task 5); `biomeAt`, `BIOME_COLOR`, `Biome` (Task 6); `hashString`, `mulberry32`.
- Produces:
  - `type ScatterKind = 'tree'|'pine'|'dead_tree'|'bush'|'rock'|'cactus'|'reed'|'grass'`
  - `interface ScatterItem { kind: ScatterKind; x; y; z; rotation; scale }`
  - `SCATTER_RULES: Record<Biome, Array<[ScatterKind, number]>>`
  - `scatterChunk(field, cx, cz, size?: number): ScatterItem[]`
  - `CHUNK_SIZE = 64`, `CHUNK_RES = 32`
  - `interface ChunkData { cx; cz; positions: Float32Array; normals: Float32Array; colors: Float32Array; indices: Uint32Array; scatter: ScatterItem[] }`
  - `computeChunk(field, cx, cz): ChunkData`

- [x] **Step 1: Write the failing tests**

`web/tests/world/scatter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createField } from '../../src/world/field';
import { solvePlacements } from '../../src/world/placement';
import { scatterChunk } from '../../src/world/scatter';
import { loadRecipeFixture } from '../fixtures';

describe('scatter', () => {
  it('is deterministic, stays in the chunk, avoids water and reserved ground', () => {
    const r = loadRecipeFixture('fishing-valley');
    const field = createField(r);
    const village = solvePlacements(r, field).find((p) => p.id === 'village')!;
    const cx = Math.floor(village.x / 64), cz = Math.floor(village.z / 64);
    const a = scatterChunk(field, cx, cz), b = scatterChunk(field, cx, cz);
    expect(a).toEqual(b);
    for (const it of a) {
      expect(it.x).toBeGreaterThanOrEqual(cx * 64);
      expect(it.x).toBeLessThan(cx * 64 + 64);
      expect(field.isWater(it.x, it.z)).toBe(false);
      expect(field.isReserved(it.x, it.z, 2)).toBe(false);
    }
    let total = 0;
    for (let i = -2; i <= 2; i++) total += scatterChunk(field, i, 3).length;
    expect(total).toBeGreaterThan(20);
  });
});
```

`web/tests/world/chunkData.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CHUNK_RES, computeChunk } from '../../src/world/chunkData';
import { createField } from '../../src/world/field';
import { loadRecipeFixture } from '../fixtures';

describe('computeChunk', () => {
  it('builds a consistent grid with unit normals and matching heights', () => {
    const field = createField(loadRecipeFixture('snowy-mountains'));
    const c = computeChunk(field, 1, -2);
    const n = CHUNK_RES + 1;
    expect(c.positions.length).toBe(n * n * 3);
    expect(c.normals.length).toBe(n * n * 3);
    expect(c.colors.length).toBe(n * n * 3);
    expect(c.indices.length).toBe(CHUNK_RES * CHUNK_RES * 6);
    for (let i = 0; i < n * n; i += 37) {
      const len = Math.hypot(c.normals[i * 3], c.normals[i * 3 + 1], c.normals[i * 3 + 2]);
      expect(len).toBeCloseTo(1, 4);
      expect(c.positions[i * 3 + 1]).toBeCloseTo(field.heightAt(c.positions[i * 3], c.positions[i * 3 + 2]), 4);
    }
    expect(c.positions[0]).toBe(64);
    expect(c.positions[2]).toBe(-128);
  });
});
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/world/scatter.test.ts tests/world/chunkData.test.ts`
Expected: FAIL, modules not found.

- [x] **Step 3: Implement**

`web/src/world/scatter.ts`:
```ts
import { hashString, mulberry32 } from '../core/rng';
import { biomeAt, type Biome } from './biome';
import type { WorldField } from './field';

export type ScatterKind = 'tree' | 'pine' | 'dead_tree' | 'bush' | 'rock' | 'cactus' | 'reed' | 'grass';
export interface ScatterItem { kind: ScatterKind; x: number; y: number; z: number; rotation: number; scale: number }

export const SCATTER_CELL = 4;

/** Probability per 4 m cell; first match wins. */
export const SCATTER_RULES: Record<Biome, Array<[ScatterKind, number]>> = {
  sand: [['rock', 0.02], ['grass', 0.03]],
  grass: [['grass', 0.3], ['bush', 0.05], ['tree', 0.04], ['rock', 0.02]],
  forest: [['tree', 0.22], ['bush', 0.08], ['grass', 0.15], ['rock', 0.02]],
  pine: [['pine', 0.24], ['rock', 0.04], ['grass', 0.06]],
  snow: [['pine', 0.06], ['rock', 0.05]],
  rock: [['rock', 0.08]],
  desert: [['cactus', 0.03], ['rock', 0.04], ['dead_tree', 0.01]],
  marsh: [['reed', 0.3], ['dead_tree', 0.03], ['grass', 0.1]],
};

export function scatterChunk(field: WorldField, cx: number, cz: number, size = 64): ScatterItem[] {
  const out: ScatterItem[] = [];
  const n = size / SCATTER_CELL;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gx = cx * n + i, gz = cz * n + j;
    const rng = mulberry32(hashString(`${field.recipe.seed}:${gx}:${gz}`));
    const x = gx * SCATTER_CELL + rng() * SCATTER_CELL;
    const z = gz * SCATTER_CELL + rng() * SCATTER_CELL;
    const roll = rng();
    let acc = 0, kind: ScatterKind | null = null;
    for (const [k, p] of SCATTER_RULES[biomeAt(field, x, z)]) {
      acc += p;
      if (roll < acc) { kind = k; break; }
    }
    if (!kind) continue;
    if (field.isWater(x, z)) continue;
    if (kind !== 'rock' && field.slopeAt(x, z) > 0.6) continue;
    if (field.isReserved(x, z, 2)) continue;
    out.push({ kind, x, y: field.heightAt(x, z), z, rotation: rng() * Math.PI * 2, scale: 0.75 + rng() * 0.6 });
  }
  return out;
}
```

`web/src/world/chunkData.ts`:
```ts
import { BIOME_COLOR, biomeAt } from './biome';
import type { WorldField } from './field';
import { scatterChunk, type ScatterItem } from './scatter';

export const CHUNK_SIZE = 64;
export const CHUNK_RES = 32;

export interface ChunkData {
  cx: number;
  cz: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  scatter: ScatterItem[];
}

export function computeChunk(field: WorldField, cx: number, cz: number): ChunkData {
  const n = CHUNK_RES + 1;
  const step = CHUNK_SIZE / CHUNK_RES;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx * CHUNK_SIZE + i * step, z = cz * CHUNK_SIZE + j * step;
    const k = (j * n + i) * 3;
    const h = field.heightAt(x, z);
    positions[k] = x; positions[k + 1] = h; positions[k + 2] = z;
    const dx = (field.heightAt(x + 1, z) - field.heightAt(x - 1, z)) / 2;
    const dz = (field.heightAt(x, z + 1) - field.heightAt(x, z - 1)) / 2;
    const len = Math.hypot(dx, 1, dz);
    normals[k] = -dx / len; normals[k + 1] = 1 / len; normals[k + 2] = -dz / len;
    const [r, g, b] = BIOME_COLOR[biomeAt(field, x, z)];
    const shade = 1 + field.detailNoise(x * 0.05, z * 0.05) * 0.06;
    colors[k] = r * shade; colors[k + 1] = g * shade; colors[k + 2] = b * shade;
  }
  const indices = new Uint32Array(CHUNK_RES * CHUNK_RES * 6);
  let p = 0;
  for (let j = 0; j < CHUNK_RES; j++) for (let i = 0; i < CHUNK_RES; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    indices[p++] = a; indices[p++] = c; indices[p++] = b;
    indices[p++] = b; indices[p++] = c; indices[p++] = d;
  }
  return { cx, cz, positions, normals, colors, indices, scatter: scatterChunk(field, cx, cz, CHUNK_SIZE) };
}
```

- [x] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/world/scatter.test.ts tests/world/chunkData.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add web/src/world/scatter.ts web/src/world/chunkData.ts web/tests/world/scatter.test.ts web/tests/world/chunkData.test.ts
git commit -m "feat(world): biome-driven scatter and chunk mesh data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Checks and buildWorld orchestrator

**Files:**
- Create: `web/src/world/checks.ts`, `web/src/world/build.ts`
- Test: `web/tests/world/build.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 5, 7, 8 and 9.
- Produces:
  - `interface Check { id: string; label: string; status: 'pass'|'warn'|'fail'; detail: string }`
  - `runChecks(field, placements, spawn): Check[]`
  - `interface BuiltWorld { recipe; field: WorldField; placements: Placement[]; buildings: Building[]; roads: Road[]; spawn: { x; y; z }; checks: Check[]; log: string[] }`
  - `buildWorld(recipe: Recipe, keep?: Placement[]): BuiltWorld`

- [ ] **Step 1: Write the failing test**

`web/tests/world/build.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../src/core/ops';
import { buildWorld } from '../../src/world/build';
import { loadRecipeFixture, RECIPE_FIXTURES } from '../fixtures';

describe('buildWorld', () => {
  it.each(RECIPE_FIXTURES)('%s builds with no failing checks', (name) => {
    const w = buildWorld(loadRecipeFixture(name));
    expect(w.placements.length).toBe(w.recipe.places.length);
    expect(w.field.isWater(w.spawn.x, w.spawn.z)).toBe(false);
    expect(w.checks.filter((c) => c.status === 'fail')).toEqual([]);
    expect(w.log.length).toBeGreaterThan(2);
  });

  it('valley has village buildings and two roads (spine + path)', () => {
    const w = buildWorld(loadRecipeFixture('fishing-valley'));
    expect(w.buildings.length).toBeGreaterThan(2);
    expect(w.roads.length).toBe(2);
  });

  it('keeps unchanged placements across an edit', () => {
    const r = loadRecipeFixture('fishing-valley');
    const before = buildWorld(r);
    const { recipe } = applyOps(r, [{ op: 'addPlace', place: { id: 'shrine', kind: 'structure', label: 'Shrine', asset: 'small stone shrine', size: 'small', interaction: 'sound', where: [{ rel: 'near', target: 'tower', maxDist: 40 }] } }]);
    const after = buildWorld(recipe, before.placements);
    for (const id of ['village', 'tower', 'campfire']) {
      const a = before.placements.find((p) => p.id === id)!, b = after.placements.find((p) => p.id === id)!;
      expect(b.x).toBe(a.x);
      expect(b.z).toBe(a.z);
    }
    expect(after.placements.find((p) => p.id === 'shrine')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/world/build.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`web/src/world/checks.ts`:
```ts
import { CORE_HALF } from '../core/recipe';
import type { WorldField } from './field';
import type { Placement } from './placement';

export interface Check { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }

const CELL = 8;

/** Cells reachable on foot (swimming allowed) from the spawn: slope < 0.9 between cells. */
function reachable(field: WorldField, spawn: { x: number; z: number }): { ok: (x: number, z: number, r: number) => boolean } {
  const n = Math.floor((CORE_HALF * 2) / CELL) + 1;
  const toIdx = (x: number, z: number) => {
    const c = Math.round((x + CORE_HALF) / CELL), r = Math.round((z + CORE_HALF) / CELL);
    return c < 0 || r < 0 || c >= n || r >= n ? -1 : r * n + c;
  };
  const walk = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    walk[r * n + c] = field.slopeAt(c * CELL - CORE_HALF, r * CELL - CORE_HALF) < 0.9 ? 1 : 0;
  }
  const seen = new Uint8Array(n * n);
  const start = toIdx(spawn.x, spawn.z);
  const queue: number[] = start >= 0 ? [start] : [];
  if (start >= 0) seen[start] = 1;
  while (queue.length) {
    const cur = queue.pop()!;
    const c = cur % n, r = Math.floor(cur / n);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= n || nr >= n) continue;
      const nb = nr * n + nc;
      if (!seen[nb] && walk[nb]) { seen[nb] = 1; queue.push(nb); }
    }
  }
  return {
    ok: (x, z, radius) => {
      for (let dz = -radius - CELL; dz <= radius + CELL; dz += CELL) for (let dx = -radius - CELL; dx <= radius + CELL; dx += CELL) {
        const i = toIdx(x + dx, z + dz);
        if (i >= 0 && seen[i]) return true;
      }
      return false;
    },
  };
}

export function runChecks(field: WorldField, placements: Placement[], spawn: { x: number; z: number }): Check[] {
  const checks: Check[] = [];
  const reach = reachable(field, spawn);
  for (const p of placements) {
    const wet = field.isWater(p.x, p.z);
    checks.push({
      id: `${p.id}-site`,
      label: `${p.id}: solid ground`,
      status: wet ? 'fail' : p.warnings.length ? 'warn' : 'pass',
      detail: wet ? 'centre is in water' : p.warnings.length ? p.warnings.join('; ') : p.reasons.join(', '),
    });
    const ok = reach.ok(p.x, p.z, p.radius);
    checks.push({
      id: `${p.id}-reach`,
      label: `${p.id}: reachable on foot`,
      status: ok ? 'pass' : 'warn',
      detail: ok ? 'a walkable route exists from the start point' : 'cliffs cut it off from the start point',
    });
  }
  return checks;
}
```

`web/src/world/build.ts`:
```ts
import type { Recipe } from '../core/recipe';
import { runChecks, type Check } from './checks';
import { createField, type Road, type WorldField } from './field';
import { findSpawn, solvePlacements, type Placement } from './placement';
import { findPath } from './roads';
import { layoutSettlement, type Building } from './settlement';

export interface BuiltWorld {
  recipe: Recipe;
  field: WorldField;
  placements: Placement[];
  buildings: Building[];
  roads: Road[];
  spawn: { x: number; y: number; z: number };
  checks: Check[];
  log: string[];
}

export function buildWorld(recipe: Recipe, keep: Placement[] = []): BuiltWorld {
  const log: string[] = [];
  const field = createField(recipe);
  log.push(`Shaped ${recipe.terrain.shape} terrain (${field.amplitude.toFixed(0)} m relief)`);
  if (field.river.length > 1) log.push(`Carved a river ${(field.river.length * 8).toFixed(0)} m long`);
  if (field.lakes.length) log.push(`Filled ${field.lakes.length === 1 ? 'a lake' : `${field.lakes.length} lakes`}`);

  const ids = new Set(recipe.places.map((p) => p.id));
  const placements = solvePlacements(recipe, field, keep.filter((p) => ids.has(p.id)));
  for (const p of placements) {
    const label = recipe.places.find((q) => q.id === p.id)?.label ?? p.id;
    log.push(`Placed ${label}: ${p.reasons.join(', ') || 'default spot'}`);
  }

  const buildings: Building[] = [];
  const roads: Road[] = [];
  for (const place of recipe.places) {
    if (place.kind !== 'settlement') continue;
    const pl = placements.find((p) => p.id === place.id);
    if (!pl) continue;
    const { buildings: b, spine } = layoutSettlement(place, pl, field, recipe.seed);
    field.addRoad(spine);
    roads.push(spine);
    buildings.push(...b);
    log.push(`Laid out ${b.length} buildings in ${place.label}`);
  }
  for (const path of recipe.paths) {
    const a = placements.find((p) => p.id === path.from), b = placements.find((p) => p.id === path.to);
    if (!a || !b) continue;
    const road = findPath(field, a, b);
    if (road) {
      field.addRoad(road);
      roads.push(road);
      log.push(`Built a road from ${path.from} to ${path.to}${road.bridges.some(Boolean) ? ' (with a bridge)' : ''}`);
    }
  }
  const spawn = findSpawn(field, placements);
  const checks = runChecks(field, placements, spawn);
  return { recipe, field, placements, buildings, roads, spawn, checks, log };
}
```

- [ ] **Step 4: Run all web tests**

Run: `npx vitest run`
Expected: PASS for every suite.

- [ ] **Step 5: Commit**

```bash
git add web/src/world web/tests/world
git commit -m "feat(world): buildWorld orchestrator + site and reachability checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 3: Rendering, physics, player

Rendering code is verified manually in the browser (`npm run dev`). Each task gives the exact thing to look for. Keep `npx vitest run` and `npx tsc --noEmit` green after every task.

### Task 12: Engine and atmosphere (sky, sun, time, fog, rain, snow)

**Files:**
- Create: `web/src/render/engine.ts`, `web/src/render/atmosphere.ts`
- Modify: `web/src/main.ts` (temporary harness; the final version comes in Task 24)

**Interfaces:**
- Consumes: `Atmosphere` type (Task 1).
- Produces:
  - `class Engine { renderer; scene; camera; constructor(canvas); onUpdate(fn: (dt, t) => void): () => void; start(): void }`
  - `TIME_HOURS: Record<Atmosphere['time'], number>`
  - `class AtmosphereSystem { hours; timeScale; sun; hemi; readonly isNight: boolean; constructor(scene); apply(spec, resetTime?: boolean); update(dt, viewer: THREE.Vector3) }`

- [x] **Step 1: Implement the engine**

`web/src/render/engine.ts`:
```ts
import * as THREE from 'three';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 6000);
  private readonly clock = new THREE.Clock();
  private readonly updaters: Array<(dt: number, t: number) => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  onUpdate(fn: (dt: number, t: number) => void): () => void {
    this.updaters.push(fn);
    return () => { const i = this.updaters.indexOf(fn); if (i >= 0) this.updaters.splice(i, 1); };
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      for (const u of this.updaters) u(dt, t);
      this.renderer.render(this.scene, this.camera);
    });
  }
}
```

- [x] **Step 2: Implement the atmosphere**

`web/src/render/atmosphere.ts`:
```ts
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Atmosphere } from '../core/recipe';

export const TIME_HOURS: Record<Atmosphere['time'], number> = { dawn: 6.3, day: 12, dusk: 18.4, night: 23 };
const FOG_DAY: Record<Atmosphere['weather'], number> = { clear: 0xbfd6ea, rain: 0x8a96a3, snow: 0xd8dee8, mist: 0xc9cfd6, storm: 0x5d6670 };
const FOG_EXTRA: Record<Atmosphere['weather'], number> = { clear: 0, rain: 0.004, snow: 0.005, mist: 0.012, storm: 0.008 };
const NIGHT_FOG = new THREE.Color(0x0a0f1e);

export class AtmosphereSystem {
  hours = 12;
  /** Game hours per real second: one day = 24 real minutes. */
  timeScale = 1 / 60;
  readonly sun = new THREE.DirectionalLight(0xfff1dd, 3);
  readonly hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a3f2a, 1);
  private readonly sky = new Sky();
  private readonly fog = new THREE.FogExp2(0xbfd6ea, 0.003);
  private spec: Atmosphere = { time: 'day', weather: 'clear', fog: 0.2, wind: 0.3 };
  private precip: THREE.Points | null = null;
  private precipSpeed = 0;
  private readonly sunDir = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    this.sky.scale.setScalar(5000); // must stay inside the camera far plane (6000); follows the viewer in update()
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.5;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -60; cam.right = 60; cam.top = 60; cam.bottom = -60; cam.near = 1; cam.far = 600;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
  }

  get isNight(): boolean {
    return this.hours < 6 || this.hours > 19.5;
  }

  apply(spec: Atmosphere, resetTime = true): void {
    this.spec = { ...spec };
    if (resetTime) this.hours = TIME_HOURS[spec.time];
    this.setPrecipitation(spec.weather);
  }

  private setPrecipitation(weather: Atmosphere['weather']): void {
    if (this.precip) {
      this.scene.remove(this.precip);
      this.precip.geometry.dispose();
      (this.precip.material as THREE.Material).dispose();
      this.precip = null;
    }
    if (weather !== 'rain' && weather !== 'snow' && weather !== 'storm') return;
    const snow = weather === 'snow';
    const count = snow ? 3000 : 5000;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: snow ? 0xffffff : 0xa8b8cc, size: snow ? 0.18 : 0.07, transparent: true, opacity: snow ? 0.9 : 0.6, depthWrite: false });
    this.precip = new THREE.Points(geo, mat);
    this.precip.frustumCulled = false;
    this.precipSpeed = snow ? 2.2 : weather === 'storm' ? 34 : 24;
    this.scene.add(this.precip);
  }

  update(dt: number, viewer: THREE.Vector3): void {
    this.hours = (this.hours + dt * this.timeScale) % 24;
    const angle = ((this.hours - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(angle), Math.sin(angle), -0.35).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.position.copy(viewer);
    this.sun.position.copy(viewer).addScaledVector(this.sunDir, 250);
    this.sun.target.position.copy(viewer);
    const day = THREE.MathUtils.smoothstep(this.sunDir.y, -0.08, 0.25);
    const overcast = this.spec.weather === 'storm' || this.spec.weather === 'rain' ? 0.5 : 1;
    this.sun.intensity = 3 * day * overcast;
    this.sun.castShadow = day > 0.05;
    this.hemi.intensity = 0.12 + 0.9 * day;
    this.fog.color.set(FOG_DAY[this.spec.weather]).lerp(NIGHT_FOG, 1 - day);
    this.fog.density = 0.0012 + this.spec.fog * 0.01 + FOG_EXTRA[this.spec.weather];
    if (this.precip) {
      const p = this.precip.geometry.getAttribute('position') as THREE.BufferAttribute;
      const drift = this.spec.wind * (this.spec.weather === 'snow' ? 2 : 6);
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - this.precipSpeed * dt;
        let x = p.getX(i) + drift * dt;
        if (y < 0) y += 40;
        if (x > 40) x -= 80;
        p.setY(i, y);
        p.setX(i, x);
      }
      p.needsUpdate = true;
      this.precip.position.set(viewer.x, viewer.y - 10, viewer.z);
    }
  }
}
```

- [x] **Step 3: Temporary harness**

`web/src/main.ts`:
```ts
import './styles.css';
import * as THREE from 'three';
import { AtmosphereSystem } from './render/atmosphere';
import { Engine } from './render/engine';

const engine = new Engine(document.querySelector<HTMLCanvasElement>('#view')!);
const atmo = new AtmosphereSystem(engine.scene);
const weather = (new URLSearchParams(location.search).get('weather') ?? 'clear') as 'clear';
atmo.apply({ time: 'dawn', weather, fog: 0.3, wind: 0.5 });
atmo.timeScale = 1; // fast-forward: 1 game hour per second, for this check only
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x557744 }));
ground.receiveShadow = true;
const box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial({ color: 0xaa8866 }));
box.position.y = 2;
box.castShadow = true;
engine.scene.add(ground, box);
engine.camera.position.set(14, 6, 14);
engine.camera.lookAt(0, 2, 0);
engine.onUpdate((dt) => atmo.update(dt, engine.camera.position));
engine.start();
```

- [ ] **Step 4: Verify in the browser**

Run: `cd web && npm run dev`, then open `http://localhost:5173/` and `http://localhost:5173/?weather=snow`.
Expected:
- The sky goes from dawn to day to dusk to night over about 24 seconds, and the box shadow moves.
- At night the fog turns dark blue.
- `?weather=snow` shows falling snow; `?weather=rain` shows rain streaks.
- The console has no errors.

- [x] **Step 5: Commit**

```bash
git add web/src/render/engine.ts web/src/render/atmosphere.ts web/src/main.ts
git commit -m "feat(render): engine loop + atmosphere (sky, sun path, fog, rain/snow)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Physics wrapper, scatter assets, chunk worker, chunk streaming

**Files:**
- Create: `web/src/physics/physics.ts`, `web/src/render/scatterAssets.ts`, `web/src/render/chunkWorker.ts`, `web/src/render/chunkManager.ts`
- Modify: `web/src/main.ts` (harness)

**Interfaces:**
- Consumes: `computeChunk`, `ChunkData`, `CHUNK_SIZE` (Task 10); `restoreField`, `FieldSnapshot` (Task 5); `ScatterItem`, `ScatterKind` (Task 10).
- Produces:
  - `class Physics { R; world; static create(): Promise<Physics>; addTerrain(positions, indices): Collider; addFixedBox(x, y, z, hx, hy, hz, rotY): Collider; addDynamicBox(x, y, z, hx, hy, hz): RigidBody; removeCollider(c); removeBody(b); step(dt) }`
  - `class ScatterAssets { instance(items: ScatterItem[]): THREE.Group }`
  - `VIEW = 3`
  - `class ChunkManager { group; constructor(scene, physics, scatter); setSnapshot(s: FieldSnapshot): void; update(x, z): void; isReady(x, z): boolean; meshes(): THREE.Object3D[] }`

- [ ] **Step 1: Physics wrapper**

`web/src/physics/physics.ts`:
```ts
import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';

const quatY = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

export class Physics {
  private constructor(readonly R: typeof RAPIER, readonly world: World) {}

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics(RAPIER, new RAPIER.World({ x: 0, y: -20, z: 0 }));
  }

  addTerrain(positions: Float32Array, indices: Uint32Array): Collider {
    return this.world.createCollider(this.R.ColliderDesc.trimesh(positions, indices));
  }

  addFixedBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY: number): Collider {
    return this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation(quatY(rotY)));
  }

  addDynamicBox(x: number, y: number, z: number, hx: number, hy: number, hz: number): RigidBody {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.6).setAngularDamping(0.6));
    this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setDensity(0.5), body);
    return body;
  }

  removeCollider(c: Collider): void { this.world.removeCollider(c, false); }
  removeBody(b: RigidBody): void { this.world.removeRigidBody(b); }

  step(dt: number): void {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }
}
```

- [ ] **Step 2: Scatter assets (procedural low-poly, instanced)**

`web/src/render/scatterAssets.ts`:
```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ScatterItem, ScatterKind } from '../world/scatter';

interface PartOpts { x?: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number; rz?: number }

function part(geo: THREE.BufferGeometry, color: number, o: PartOpts = {}): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  if (o.rz) g.rotateZ(o.rz);
  g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function build(kind: ScatterKind): THREE.BufferGeometry {
  const P: THREE.BufferGeometry[] = [];
  switch (kind) {
    case 'tree':
      P.push(part(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6), 0x6b4a2b, { y: 1.2 }));
      P.push(part(new THREE.IcosahedronGeometry(1.7, 0), 0x3f7a32, { y: 3.4 }));
      P.push(part(new THREE.IcosahedronGeometry(1.2, 0), 0x4c8a3a, { y: 4.5 }));
      break;
    case 'pine':
      P.push(part(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), 0x5a3d25, { y: 0.8 }));
      P.push(part(new THREE.ConeGeometry(1.6, 3, 7), 0x2f5a35, { y: 2.6 }));
      P.push(part(new THREE.ConeGeometry(1.2, 2.4, 7), 0x356640, { y: 4.0 }));
      P.push(part(new THREE.ConeGeometry(0.8, 1.8, 7), 0x3b7048, { y: 5.2 }));
      break;
    case 'dead_tree':
      P.push(part(new THREE.CylinderGeometry(0.12, 0.22, 3, 5), 0x5a4a3a, { y: 1.5 }));
      P.push(part(new THREE.CylinderGeometry(0.06, 0.09, 1.4, 4), 0x5a4a3a, { rz: 0.9, x: 0.45, y: 2.3 }));
      P.push(part(new THREE.CylinderGeometry(0.05, 0.08, 1.1, 4), 0x5a4a3a, { rz: -0.8, x: -0.35, y: 2.0 }));
      break;
    case 'bush':
      P.push(part(new THREE.IcosahedronGeometry(0.9, 0), 0x4a7a34, { y: 0.5, sy: 0.7 }));
      break;
    case 'rock':
      P.push(part(new THREE.DodecahedronGeometry(0.9, 0), 0x7a756e, { y: 0.3, sy: 0.6 }));
      break;
    case 'cactus':
      P.push(part(new THREE.CylinderGeometry(0.25, 0.3, 2.6, 8), 0x3d7a3a, { y: 1.3 }));
      P.push(part(new THREE.CylinderGeometry(0.16, 0.16, 1, 6), 0x3d7a3a, { x: 0.5, y: 1.6 }));
      P.push(part(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 6), 0x3d7a3a, { x: -0.45, y: 1.1 }));
      break;
    case 'reed':
      for (const [x, z] of [[0, 0], [0.2, 0.1], [-0.15, 0.18]]) P.push(part(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 3), 0x7a8a46, { x, y: 0.8, z }));
      break;
    case 'grass':
      for (const [x, z] of [[0, 0], [0.15, 0.1], [-0.12, 0.12], [0.05, -0.15]]) P.push(part(new THREE.ConeGeometry(0.08, 0.6, 3), 0x5f8f3a, { x, y: 0.3, z }));
      break;
  }
  return mergeGeometries(P, false)!;
}

const SHADOW: ReadonlySet<ScatterKind> = new Set(['tree', 'pine', 'dead_tree', 'cactus']);

export class ScatterAssets {
  private readonly geos = new Map<ScatterKind, THREE.BufferGeometry>();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  private readonly dummy = new THREE.Object3D();

  private geometry(kind: ScatterKind): THREE.BufferGeometry {
    let g = this.geos.get(kind);
    if (!g) { g = build(kind); this.geos.set(kind, g); }
    return g;
  }

  instance(items: ScatterItem[]): THREE.Group {
    const group = new THREE.Group();
    const byKind = new Map<ScatterKind, ScatterItem[]>();
    for (const it of items) { const list = byKind.get(it.kind) ?? []; list.push(it); byKind.set(it.kind, list); }
    for (const [kind, list] of byKind) {
      const mesh = new THREE.InstancedMesh(this.geometry(kind), this.material, list.length);
      list.forEach((it, i) => {
        this.dummy.position.set(it.x, it.y, it.z);
        this.dummy.rotation.set(0, it.rotation, 0);
        this.dummy.scale.setScalar(it.scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      });
      mesh.castShadow = SHADOW.has(kind);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }
}
```

- [ ] **Step 3: Chunk worker and manager**

`web/src/render/chunkWorker.ts`:
```ts
import { computeChunk } from '../world/chunkData';
import { restoreField, type FieldSnapshot, type WorldField } from '../world/field';

let field: WorldField | null = null;
let generation = 0;

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: 'init'; generation: number; snapshot: FieldSnapshot } | { type: 'chunk'; generation: number; cx: number; cz: number };
  if (m.type === 'init') {
    generation = m.generation;
    field = restoreField(m.snapshot);
    return;
  }
  if (!field || m.generation !== generation) return;
  const data = computeChunk(field, m.cx, m.cz);
  (self as unknown as Worker).postMessage({ type: 'chunk', generation, data }, [data.positions.buffer, data.normals.buffer, data.colors.buffer, data.indices.buffer]);
};
```

`web/src/render/chunkManager.ts`:
```ts
import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import { CHUNK_SIZE, type ChunkData } from '../world/chunkData';
import type { FieldSnapshot } from '../world/field';
import type { ScatterAssets } from './scatterAssets';

export const VIEW = 3;

interface LiveChunk {
  cx: number;
  cz: number;
  mesh: THREE.Mesh;
  scatter: THREE.Group;
  positions: Float32Array;
  indices: Uint32Array;
  collider: Collider | null;
  stale: boolean;
}

const key = (cx: number, cz: number) => `${cx},${cz}`;

export class ChunkManager {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, LiveChunk>();
  private readonly pending = new Set<string>();
  private generation = 0;
  private readonly worker: Worker;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

  constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly scatter: ScatterAssets) {
    scene.add(this.group);
    this.worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => this.receive(e.data);
  }

  /** New world: the worker rebuilds its field; existing chunks stay visible until replaced. */
  setSnapshot(snapshot: FieldSnapshot): void {
    this.generation++;
    this.pending.clear();
    this.worker.postMessage({ type: 'init', generation: this.generation, snapshot });
    for (const c of this.chunks.values()) c.stale = true;
  }

  update(px: number, pz: number): void {
    if (this.generation === 0) return;
    const ccx = Math.floor(px / CHUNK_SIZE), ccz = Math.floor(pz / CHUNK_SIZE);
    const wanted: Array<[number, number, number]> = [];
    for (let dz = -VIEW; dz <= VIEW; dz++) for (let dx = -VIEW; dx <= VIEW; dx++) wanted.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
    wanted.sort((a, b) => a[2] - b[2]);
    let requested = 0;
    for (const [cx, cz] of wanted) {
      if (requested >= 4) break;
      const k = key(cx, cz);
      const c = this.chunks.get(k);
      if ((!c || c.stale) && !this.pending.has(k)) {
        this.pending.add(k);
        this.worker.postMessage({ type: 'chunk', generation: this.generation, cx, cz });
        requested++;
      }
    }
    for (const [k, c] of this.chunks) {
      const far = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
      if (far > VIEW + 1) { this.drop(k); continue; }
      const near = far <= 1;
      if (near && !c.collider) c.collider = this.physics.addTerrain(c.positions, c.indices);
      if (!near && c.collider) { this.physics.removeCollider(c.collider); c.collider = null; }
    }
  }

  isReady(x: number, z: number): boolean {
    const c = this.chunks.get(key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    return !!c && !c.stale && !!c.collider;
  }

  meshes(): THREE.Object3D[] {
    return [...this.chunks.values()].map((c) => c.mesh);
  }

  private receive(msg: { type: 'chunk'; generation: number; data: ChunkData }): void {
    if (msg.generation !== this.generation) return;
    const d = msg.data;
    const k = key(d.cx, d.cz);
    this.pending.delete(k);
    const hadCollider = !!this.chunks.get(k)?.collider;
    this.drop(k);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    const scatter = this.scatter.instance(d.scatter);
    this.group.add(mesh, scatter);
    const chunk: LiveChunk = { cx: d.cx, cz: d.cz, mesh, scatter, positions: d.positions, indices: d.indices, collider: null, stale: false };
    if (hadCollider) chunk.collider = this.physics.addTerrain(d.positions, d.indices);
    this.chunks.set(k, chunk);
  }

  private drop(k: string): void {
    const c = this.chunks.get(k);
    if (!c) return;
    this.group.remove(c.mesh, c.scatter);
    c.mesh.geometry.dispose();
    for (const child of c.scatter.children) (child as THREE.InstancedMesh).dispose();
    if (c.collider) this.physics.removeCollider(c.collider);
    this.chunks.delete(k);
  }
}
```

- [ ] **Step 4: Harness with a fly camera**

`web/src/main.ts`:
```ts
import './styles.css';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { recipeSchema } from './core/recipe';
import { Physics } from './physics/physics';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { Engine } from './render/engine';
import { ScatterAssets } from './render/scatterAssets';
import { buildWorld } from './world/build';
import { snapshotField } from './world/field';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  const recipe = recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]);
  const engine = new Engine(document.querySelector<HTMLCanvasElement>('#view')!);
  const physics = await Physics.create();
  const atmo = new AtmosphereSystem(engine.scene);
  const chunks = new ChunkManager(engine.scene, physics, new ScatterAssets());
  const world = buildWorld(recipe);
  console.log(world.log.join('\n'));
  atmo.apply({ ...recipe.atmosphere, time: 'day' });
  chunks.setSnapshot(snapshotField(world.field));
  const controls = new OrbitControls(engine.camera, engine.renderer.domElement);
  engine.camera.position.set(world.spawn.x + 60, world.spawn.y + 60, world.spawn.z + 60);
  controls.target.set(world.spawn.x, world.spawn.y, world.spawn.z);
  engine.onUpdate((dt) => {
    controls.update();
    chunks.update(controls.target.x, controls.target.z);
    atmo.update(dt, engine.camera.position);
  });
  engine.start();
})();
```

- [ ] **Step 5: Verify in the browser**

Run `npm run dev` and open `/?w=fishing-valley`, `/?w=snowy-mountains`, `/?w=tropical-island`, `/?w=desert-canyon`.
Expected:
- Coloured terrain streams in around the target as you right-drag to pan. Biome colours are visible: snow peaks, green valley, sand beaches, orange desert.
- Trees and rocks are scattered, with none in the village pad area.
- The valley has a carved channel for the river.
- The frame rate stays smooth while chunks load; check with DevTools → Performance → FPS meter.
- The console shows the build log and no errors.

Water isn't drawn yet (Task 15).

- [ ] **Step 6: Commit**

```bash
git add web/src/physics web/src/render web/src/main.ts
git commit -m "feat(render): chunk streaming via web worker, instanced scatter, rapier wrapper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: First-person player (walk, run, jump, swim)

**Files:**
- Create: `web/src/player/player.ts`
- Modify: `web/src/main.ts` (harness)

**Interfaces:**
- Consumes: `Physics` (Task 13); `WorldField` (Task 5).
- Produces: `class Player { controls: PointerLockControls; position: THREE.Vector3; enabled: boolean; seated: boolean; constructor(camera, dom, physics); teleport(x, y, z); spawn(x, y, z); lookRay(): THREE.Ray; update(dt, field) }`

- [ ] **Step 1: Implement**

`web/src/player/player.ts`:
```ts
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import type { WorldField } from '../world/field';

const EYE = 0.75; // capsule centre → eye height offset

export class Player {
  readonly controls: PointerLockControls;
  readonly position = new THREE.Vector3();
  enabled = false;
  seated = false;
  private readonly body: RigidBody;
  private readonly collider: Collider;
  private readonly controller: KinematicCharacterController;
  private vy = 0;
  private readonly keys = new Set<string>();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera, dom: HTMLElement, physics: Physics) {
    this.controls = new PointerLockControls(camera, dom);
    const R = physics.R;
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 200, 0));
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(0.55, 0.35), this.body);
    this.controller = physics.world.createCharacterController(0.05);
    this.controller.enableAutostep(0.6, 0.2, true);
    this.controller.enableSnapToGround(0.6);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    addEventListener('keydown', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.camera.position.set(x, y + EYE, z);
  }

  spawn(x: number, y: number, z: number): void {
    this.body.setTranslation({ x, y: y + 1, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + 1, z });
    this.vy = 0;
    this.teleport(x, y + 1, z);
  }

  lookRay(): THREE.Ray {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return new THREE.Ray(this.camera.position.clone(), dir);
  }

  update(dt: number, field: WorldField): void {
    if (!this.enabled) return;
    const t = this.body.translation();
    this.camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    this.fwd.normalize();
    this.right.crossVectors(this.fwd, THREE.Object3D.DEFAULT_UP);
    this.move.set(0, 0, 0);
    if (!this.seated && this.controls.isLocked) {
      if (this.keys.has('KeyW')) this.move.add(this.fwd);
      if (this.keys.has('KeyS')) this.move.sub(this.fwd);
      if (this.keys.has('KeyD')) this.move.add(this.right);
      if (this.keys.has('KeyA')) this.move.sub(this.right);
    }
    if (this.move.lengthSq() > 0) this.move.normalize();
    const surface = field.waterSurfaceAt(t.x, t.z);
    const swimming = surface !== null && t.y < surface + 0.3;
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = swimming ? 3 : running ? 10 : 5;
    const grounded = this.controller.computedGrounded();
    if (swimming) {
      const target = (surface! - 0.5 - t.y) * 3;
      this.vy += (target - this.vy) * Math.min(1, dt * 4);
      if (this.keys.has('Space')) this.vy = 2.5;
    } else if (grounded && this.vy <= 0) {
      this.vy = this.keys.has('Space') && !this.seated ? 7 : -1;
    } else {
      this.vy -= 20 * dt;
    }
    this.controller.computeColliderMovement(this.collider, { x: this.move.x * speed * dt, y: this.vy * dt, z: this.move.z * speed * dt });
    const m = this.controller.computedMovement();
    const nx = t.x + m.x, nz = t.z + m.z;
    let ny = t.y + m.y;
    const ground = field.heightAt(nx, nz);
    if (ny < ground - 3) { ny = ground + 2; this.vy = 0; } // fell through a missing chunk
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.position.set(nx, ny, nz);
    this.camera.position.set(nx, ny + (this.seated ? 0.1 : EYE), nz);
  }
}
```

- [ ] **Step 2: Harness**

Replace `web/src/main.ts` with:
```ts
import './styles.css';
import { recipeSchema } from './core/recipe';
import { Physics } from './physics/physics';
import { Player } from './player/player';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { Engine } from './render/engine';
import { ScatterAssets } from './render/scatterAssets';
import { buildWorld } from './world/build';
import { snapshotField } from './world/field';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  const recipe = recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]);
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const engine = new Engine(canvas);
  const physics = await Physics.create();
  const atmo = new AtmosphereSystem(engine.scene);
  const chunks = new ChunkManager(engine.scene, physics, new ScatterAssets());
  const player = new Player(engine.camera, canvas, physics);
  const world = buildWorld(recipe);
  atmo.apply(recipe.atmosphere);
  chunks.setSnapshot(snapshotField(world.field));
  player.teleport(world.spawn.x, world.spawn.y, world.spawn.z);
  let pending = true;
  canvas.addEventListener('click', () => player.controls.lock());
  engine.onUpdate((dt) => {
    const p = pending ? world.spawn : player.position;
    chunks.update(p.x, p.z);
    if (pending && chunks.isReady(world.spawn.x, world.spawn.z)) {
      player.spawn(world.spawn.x, world.spawn.y, world.spawn.z);
      player.enabled = true;
      pending = false;
    }
    player.update(dt, world.field);
    physics.step(dt);
    atmo.update(dt, engine.camera.position);
  });
  engine.start();
})();
```

- [ ] **Step 3: Verify in the browser**

Open `/?w=fishing-valley` and click to lock the mouse.
Expected:
- WASD walks, Shift runs, Space jumps, and the mouse looks around.
- You can't walk up cliffs steeper than about 50°.
- Walking into the river channel slows you down and keeps you bobbing near the surface (the water isn't drawn until Task 15).
- Walking far streams new terrain without falling through.
- Esc releases the mouse.

- [ ] **Step 4: Commit**

```bash
git add web/src/player web/src/main.ts
git commit -m "feat(player): rapier kinematic first-person controller with swimming

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Water and roads rendering

**Files:**
- Create: `web/src/render/water.ts`, `web/src/render/roads.ts`
- Modify: `web/src/main.ts` (harness, two additions)

**Interfaces:**
- Consumes: `WorldField`, `Road` (Task 5).
- Produces:
  - `class WaterSystem { group; constructor(scene); rebuild(field): void; update(viewer: THREE.Vector3): void }`
  - `buildRoadMeshes(field: WorldField, roads: Road[]): THREE.Group`
  - `disposeGroup(g: THREE.Object3D): void`

- [ ] **Step 1: Implement water**

`web/src/render/water.ts`:
```ts
import * as THREE from 'three';
import type { WorldField } from '../world/field';

export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
}

export class WaterSystem {
  readonly group = new THREE.Group();
  private sea: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshStandardMaterial({ color: 0x2b6f8f, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82 });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  rebuild(field: WorldField): void {
    disposeGroup(this.group);
    this.group.clear();
    this.sea = null;
    if (field.hasSea) {
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), this.material);
      this.sea.position.y = field.seaLevelY;
      this.group.add(this.sea);
    }
    if (field.river.length > 1) this.group.add(this.riverRibbon(field));
    for (const l of field.lakes) {
      const lake = new THREE.Mesh(new THREE.CircleGeometry(l.radius * 1.25, 48).rotateX(-Math.PI / 2), this.material);
      lake.position.set(l.x, l.levelY, l.z);
      this.group.add(lake);
    }
  }

  private riverRibbon(field: WorldField): THREE.Mesh {
    const pts = field.river;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len, nz = tx / len;
      const y = field.baseHeight(pts[i].x, pts[i].z) - 1.5;
      pos.push(pts[i].x + nx * 18, y, pts[i].z + nz * 18, pts[i].x - nx * 18, y, pts[i].z - nz * 18);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.material.side = THREE.DoubleSide;
    return mesh;
  }

  update(viewer: THREE.Vector3): void {
    if (this.sea) this.sea.position.set(Math.round(viewer.x / 50) * 50, this.sea.position.y, Math.round(viewer.z / 50) * 50);
  }
}
```

- [ ] **Step 2: Implement roads**

`web/src/render/roads.ts`:
```ts
import * as THREE from 'three';
import type { Road, WorldField } from '../world/field';
import type { Vec2 } from '../world/river';

const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

function densify(points: Vec2[], maxStep = 3): Vec2[] {
  const out: Vec2[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / maxStep));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}

export function buildRoadMeshes(field: WorldField, roads: Road[]): THREE.Group {
  const group = new THREE.Group();
  for (const road of roads) {
    const pts = densify(road.points);
    const pos: number[] = [];
    const idx: number[] = [];
    const half = road.width / 2;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len, nz = tx / len;
      const p = pts[i];
      const surface = field.waterSurfaceAt(p.x, p.z);
      const y = surface !== null ? Math.max(surface, field.heightAt(p.x, p.z)) + 1.2 : field.heightAt(p.x, p.z) + 0.12;
      pos.push(p.x + nx * half, y, p.z + nz * half, p.x - nx * half, y, p.z - nz * half);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.material.side = THREE.DoubleSide;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
```

- [ ] **Step 3: Harness additions**

In `web/src/main.ts`, add these imports:
```ts
import { buildRoadMeshes } from './render/roads';
import { WaterSystem } from './render/water';
```

After `chunks.setSnapshot(snapshotField(world.field));` add:
```ts
  const water = new WaterSystem(engine.scene);
  water.rebuild(world.field);
  engine.scene.add(buildRoadMeshes(world.field, world.roads));
```

Inside `engine.onUpdate`, after `atmo.update(dt, engine.camera.position);` add:
```ts
    water.update(engine.camera.position);
```

- [ ] **Step 4: Verify in the browser**

Expected:
- `fishing-valley`: a blue river ribbon runs down the valley floor, and a dirt road runs through the village and up to the tower, raised as a bridge where it crosses water.
- `tropical-island`: sea all around.
- `snowy-mountains`: a lake disc.
- Swimming in the visible water works.

- [ ] **Step 5: Commit**

```bash
git add web/src/render/water.ts web/src/render/roads.ts web/src/main.ts
git commit -m "feat(render): sea, river ribbon, lakes, road ribbons with raised bridges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: Placeholders, world objects and the App runtime

**Files:**
- Create: `web/src/render/placeholders.ts`, `web/src/render/worldObjects.ts`, `web/src/app.ts`
- Modify: `web/src/main.ts` (replaced by a short boot)
- Test: `web/tests/render/placeholders.test.ts`

**Interfaces:**
- Consumes: Tasks 11–15.
- Produces:
  - `WINDOW_MATERIAL: THREE.MeshStandardMaterial` (windows glow when `emissiveIntensity > 0`)
  - `placeholderKind(asset: string): string`
  - `buildPlaceholder(asset: string): THREE.Group`
  - `interface ObjectInfo { placeId; objectId; label; description?; reasons; warnings; source: 'placeholder'|'library'|'generated'; interaction: Interaction; kind: PlaceKind | 'building' }`
  - `interface ModelSource { load(asset: string, kind: PlaceKind): Promise<{ object: THREE.Object3D; source: 'library'|'generated' } | null> }`
  - `class NullModelSource implements ModelSource`
  - `normalizeTo(object, height): THREE.Group` (a group named `content`)
  - `class WorldObjects { group; onReady: Array<(root, info) => void>; onCleared: Array<() => void>; constructor(scene, physics, models); rebuild(world: BuiltWorld): void; pickables(): THREE.Object3D[]; infoFor(o: THREE.Object3D): ObjectInfo | null }`. Each root has `userData.info: ObjectInfo` and `userData.size: THREE.Vector3`.
  - `class App { engine; physics; atmosphere; chunks; water; objects; player; built: BuiltWorld | null; static create(canvas, models?); load(recipe, keep?, respawn?): BuiltWorld }`. It contains two hook comments, `// @hook:after-load` and `// @hook:frame`, used by Tasks 20 and 21.

- [ ] **Step 1: Write the failing test (keyword routing only, no WebGL)**

`web/tests/render/placeholders.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { placeholderKind } from '../../src/render/placeholders';

describe('placeholderKind', () => {
  it.each([
    ['white stone lighthouse', 'lighthouse'],
    ['stone castle with towers', 'castle'],
    ['ruined stone watchtower', 'tower'],
    ['wooden fishing cottage', 'house'],
    ['thatched beach hut', 'house'],
    ['wooden log cabin', 'house'],
    ['campfire with stones', 'campfire'],
    ['bronze bell on wooden post', 'bell'],
    ['iron lantern on post', 'lantern'],
    ['desert tent', 'tent'],
    ['weathered stone obelisk', 'obelisk'],
    ['stone well', 'well'],
    ['market stall', 'stall'],
    ['wooden barrel', 'barrel'],
    ['something unusual', 'generic'],
  ])('%s → %s', (asset, kind) => {
    expect(placeholderKind(asset)).toBe(kind);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/render/placeholders.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement placeholders**

`web/src/render/placeholders.ts`:
```ts
import * as THREE from 'three';

export const WINDOW_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.6 });
const mats = new Map<number, THREE.MeshStandardMaterial>();
const mat = (color: number) => {
  let m = mats.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }); mats.set(color, m); }
  return m;
};

function add(g: THREE.Group, geo: THREE.BufferGeometry, material: THREE.Material | number, x = 0, y = 0, z = 0, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof material === 'number' ? mat(material) : material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (rt: number, rb: number, h: number, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const K = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, s);

const BUILDERS: Record<string, (g: THREE.Group) => void> = {
  house: (g) => {
    add(g, B(6, 3.2, 5), 0xc9b38a, 0, 1.6);
    const roof = add(g, K(4.6, 2.4, 4), 0x7a3b2a, 0, 4.4, 0, Math.PI / 4);
    roof.scale.z = 0.85;
    add(g, B(0.9, 0.8, 0.05), WINDOW_MATERIAL, -1.7, 1.9, 2.53);
    add(g, B(0.9, 0.8, 0.05), WINDOW_MATERIAL, 1.7, 1.9, 2.53);
    add(g, B(0.6, 1.4, 0.6), 0x6e5d4b, 1.6, 4.6, -0.8);
  },
  tent: (g) => { add(g, K(2.5, 3, 6), 0xd8c9a3, 0, 1.5); },
  tower: (g) => {
    add(g, C(2, 2.4, 12), 0x8d8a82, 0, 6);
    add(g, C(2.6, 2.6, 1.2), 0x7d7a72, 0, 12.6);
    add(g, B(0.5, 0.9, 0.1), WINDOW_MATERIAL, 0, 9, 2.15);
  },
  lighthouse: (g) => {
    add(g, C(1.6, 2.4, 14, 16), 0xf2f2ee, 0, 7);
    add(g, C(1.75, 1.85, 1.5, 16), 0xb33a3a, 0, 9);
    add(g, C(1.3, 1.3, 1.6, 12), WINDOW_MATERIAL, 0, 14.8);
    add(g, K(1.6, 1.4, 12), 0x333333, 0, 16.3);
  },
  castle: (g) => {
    add(g, B(10, 10, 10), 0x8a8780, 0, 5);
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      add(g, C(2, 2, 14, 8), 0x7f7c75, x, 7, z);
      add(g, K(2.4, 3, 8), 0x5b3a3a, x, 15.5, z);
    }
    add(g, B(2.4, 3.6, 0.3), 0x4a3726, 0, 1.8, 5.1);
  },
  obelisk: (g) => {
    add(g, C(0.9, 1.4, 10, 4), 0xb9a27a, 0, 5, 0, Math.PI / 4);
    add(g, K(0.9, 1.2, 4), 0xb9a27a, 0, 10.6, 0, Math.PI / 4);
  },
  statue: (g) => {
    add(g, B(2, 1, 2), 0x8f8f88, 0, 0.5);
    add(g, C(0.5, 0.6, 3, 8), 0x9a9a92, 0, 2.5);
    add(g, new THREE.SphereGeometry(0.45, 10, 8), 0x9a9a92, 0, 4.3);
  },
  well: (g) => {
    add(g, C(1.2, 1.2, 1, 12), 0x8d8a82, 0, 0.5);
    add(g, B(0.15, 2.2, 0.15), 0x6b4a2b, -1, 1.1);
    add(g, B(0.15, 2.2, 0.15), 0x6b4a2b, 1, 1.1);
    add(g, K(1.6, 0.9, 4), 0x7a3b2a, 0, 2.6, 0, Math.PI / 4);
  },
  stall: (g) => {
    add(g, B(3, 1, 1.6), 0x8a6a45, 0, 0.5);
    add(g, B(3.4, 0.1, 2), 0xb33a3a, 0, 2.4);
    for (const x of [-1.5, 1.5]) add(g, B(0.12, 2.4, 0.12), 0x6b4a2b, x, 1.2, 0.8);
  },
  campfire: (g) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(g, new THREE.DodecahedronGeometry(0.28, 0), 0x6f6a64, Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8);
    }
    add(g, C(0.1, 0.1, 1.2, 6), 0x5a3d25, 0, 0.2, 0, 0).rotation.z = Math.PI / 2;
    add(g, C(0.1, 0.1, 1.2, 6), 0x5a3d25, 0, 0.25, 0, Math.PI / 2).rotation.z = Math.PI / 2;
  },
  bell: (g) => {
    add(g, B(0.3, 3, 0.3), 0x6b4a2b, 0, 1.5);
    add(g, B(1.6, 0.25, 0.3), 0x6b4a2b, 0.6, 3);
    add(g, K(0.5, 0.8, 10), 0xb08d3a, 1.1, 2.4);
  },
  lantern: (g) => {
    add(g, C(0.07, 0.09, 2.2, 6), 0x333333, 0, 1.1);
    add(g, B(0.35, 0.45, 0.35), WINDOW_MATERIAL, 0, 2.4);
  },
  barrel: (g) => { add(g, C(0.45, 0.45, 1.1, 12), 0x7a5230, 0, 0.55); },
  crate: (g) => { add(g, B(1, 1, 1), 0x9a7445, 0, 0.5); },
  bench: (g) => {
    add(g, B(1.8, 0.12, 0.5), 0x8a6a45, 0, 0.5);
    add(g, B(1.8, 0.5, 0.08), 0x8a6a45, 0, 0.85, -0.22);
    for (const x of [-0.8, 0.8]) add(g, B(0.1, 0.5, 0.45), 0x5a3d25, x, 0.25);
  },
  dock: (g) => {
    add(g, B(3, 0.25, 10), 0x8a6a45, 0, 0.6);
    for (const z of [-4.5, 0, 4.5]) for (const x of [-1.4, 1.4]) add(g, C(0.15, 0.15, 1.6, 6), 0x5a3d25, x, 0, z);
  },
  shrine: (g) => {
    add(g, B(3, 0.6, 3), 0x9a958c, 0, 0.3);
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) add(g, C(0.15, 0.15, 2.2, 8), 0xb0aaa0, x, 1.7, z);
    add(g, K(2.6, 1.5, 4), 0x7a3b2a, 0, 3.5, 0, Math.PI / 4);
  },
  arch: (g) => {
    add(g, B(1.5, 8, 2), 0xc0703a, -4, 4);
    add(g, B(1.5, 8, 2), 0xc0703a, 4, 4);
    add(g, B(9.5, 1.6, 2), 0xb0663a, 0, 8.8);
  },
  windmill: (g) => {
    add(g, C(1.8, 2.6, 8, 8), 0xd9cfbf, 0, 4);
    add(g, K(2.2, 2, 8), 0x7a3b2a, 0, 9);
    const blades = new THREE.Group();
    blades.name = 'rotor';
    blades.position.set(0, 7.5, 2.4);
    for (let i = 0; i < 4; i++) add(blades, B(0.5, 5, 0.1), 0xece4d4, 0, 0, 0).rotation.z = (i * Math.PI) / 2;
    blades.children.forEach((b) => b.translateY(2.5));
    g.add(blades);
  },
  generic: (g) => {
    add(g, B(3, 3, 3), 0xa89a86, 0, 1.5);
    add(g, K(2.4, 1.6, 4), 0x7a3b2a, 0, 3.8, 0, Math.PI / 4);
  },
};

const RULES: Array<[RegExp, string]> = [
  [/lighthouse/, 'lighthouse'],
  [/castle|fort|keep|citadel/, 'castle'],
  [/windmill/, 'windmill'],
  [/obelisk|monolith|pillar|menhir/, 'obelisk'],
  [/statue|sculpture|idol/, 'statue'],
  [/\barch\b/, 'arch'],
  [/tower/, 'tower'],
  [/tent|yurt/, 'tent'],
  [/shrine|altar|temple|chapel/, 'shrine'],
  [/\bwell\b/, 'well'],
  [/market|stall/, 'stall'],
  [/campfire|bonfire|fire ?pit/, 'campfire'],
  [/bell|gong/, 'bell'],
  [/lantern|lamp|torch/, 'lantern'],
  [/barrel/, 'barrel'],
  [/crate|\bbox\b|chest/, 'crate'],
  [/bench|chair|seat/, 'bench'],
  [/dock|pier|jetty/, 'dock'],
  [/house|cottage|\bhut\b|cabin|lodge|home|shack|barn|inn/, 'house'],
];

export function placeholderKind(asset: string): string {
  const a = asset.toLowerCase();
  for (const [re, kind] of RULES) if (re.test(a)) return kind;
  return 'generic';
}

export function buildPlaceholder(asset: string): THREE.Group {
  const g = new THREE.Group();
  BUILDERS[placeholderKind(asset)](g);
  g.userData.placeholder = true;
  return g;
}
```

- [ ] **Step 4: Implement world objects**

`web/src/render/worldObjects.ts`:
```ts
import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Interaction, PlaceKind, PlaceSize } from '../core/recipe';
import type { Physics } from '../physics/physics';
import type { BuiltWorld } from '../world/build';
import { buildPlaceholder } from './placeholders';

export interface ObjectInfo {
  placeId: string;
  objectId: string;
  label: string;
  description?: string;
  reasons: string[];
  warnings: string[];
  source: 'placeholder' | 'library' | 'online' | 'generated';
  /** Attribution for CC-BY models found online, e.g. "Giraffe by X (CC-BY 3.0, Poly Pizza)". */
  credit?: string;
  interaction: Interaction;
  kind: PlaceKind | 'building';
}

export interface ModelSource {
  load(asset: string, kind: PlaceKind): Promise<{ object: THREE.Object3D; source: 'library' | 'online' | 'generated'; credit?: string } | null>;
}

export class NullModelSource implements ModelSource {
  async load(): Promise<null> { return null; }
}

const HEIGHT: Record<PlaceKind, Record<PlaceSize, number>> = {
  settlement: { small: 5, medium: 6, large: 7 },
  landmark: { small: 10, medium: 16, large: 24 },
  structure: { small: 4, medium: 6, large: 9 },
  prop: { small: 1, medium: 1.6, large: 2.4 },
};

/** Scale to a target height, centre on x/z, stand on y = 0. Returns a group named "content". */
export function normalizeTo(object: THREE.Object3D, height: number): THREE.Group {
  object.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  object.scale.multiplyScalar(size.y > 0 ? height / size.y : 1);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const c = box.getCenter(new THREE.Vector3());
  object.position.x -= c.x;
  object.position.z -= c.z;
  object.position.y -= box.min.y;
  const g = new THREE.Group();
  g.name = 'content';
  g.add(object);
  return g;
}

function shadows(o: THREE.Object3D): void {
  o.traverse((m) => { if (m instanceof THREE.Mesh) { m.castShadow = true; m.receiveShadow = true; } });
}

interface Spec { asset: string; kind: PlaceKind; height: number; x: number; y: number; z: number; rotation: number; info: ObjectInfo }
interface Entry { root: THREE.Group; spec: Spec; collider: Collider | null }

export class WorldObjects {
  readonly group = new THREE.Group();
  readonly onReady: Array<(root: THREE.Group, info: ObjectInfo) => void> = [];
  readonly onCleared: Array<() => void> = [];
  private entries: Entry[] = [];
  private version = 0;

  constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly models: ModelSource) {
    scene.add(this.group);
  }

  rebuild(world: BuiltWorld): void {
    this.clear();
    const version = ++this.version;
    const specs: Spec[] = [];
    for (const pl of world.placements) {
      const place = world.recipe.places.find((p) => p.id === pl.id);
      if (!place || place.kind === 'settlement') continue;
      specs.push({
        asset: place.asset, kind: place.kind, height: HEIGHT[place.kind][place.size], x: pl.x, y: pl.y, z: pl.z, rotation: pl.rotation,
        info: { placeId: pl.id, objectId: pl.id, label: place.label, description: place.description, reasons: pl.reasons, warnings: pl.warnings, source: 'placeholder', interaction: place.interaction, kind: place.kind },
      });
    }
    for (const b of world.buildings) {
      const place = world.recipe.places.find((p) => p.id === b.placeId);
      const pl = world.placements.find((p) => p.id === b.placeId);
      if (!place) continue;
      specs.push({
        asset: b.asset, kind: 'structure', height: b.kind === 'house' ? HEIGHT.settlement[place.size] : 3, x: b.x, y: b.y, z: b.z, rotation: b.rotation,
        info: { placeId: place.id, objectId: b.id, label: b.kind === 'house' ? `${place.label} — house` : `${place.label} — ${b.kind}`, description: place.description, reasons: pl?.reasons ?? [], warnings: pl?.warnings ?? [], source: 'placeholder', interaction: b.interaction, kind: 'building' },
      });
    }
    for (const s of specs) this.spawn(s, version);
  }

  pickables(): THREE.Object3D[] {
    return this.entries.map((e) => e.root);
  }

  infoFor(o: THREE.Object3D): ObjectInfo | null {
    for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) if (cur.userData.info) return cur.userData.info as ObjectInfo;
    return null;
  }

  private spawn(s: Spec, version: number): void {
    const root = new THREE.Group();
    root.position.set(s.x, s.y, s.z);
    root.rotation.y = s.rotation;
    root.userData.info = s.info;
    this.setContent(root, normalizeTo(buildPlaceholder(s.asset), s.height));
    this.group.add(root);
    const entry: Entry = { root, spec: s, collider: null };
    this.entries.push(entry);
    this.refreshCollider(entry);
    for (const cb of this.onReady) cb(root, s.info);
    void this.models.load(s.asset, s.kind).then((res) => {
      if (!res || version !== this.version) return;
      this.setContent(root, normalizeTo(res.object.clone(true), s.height));
      s.info.source = res.source;
      s.info.credit = res.credit;
      this.refreshCollider(entry);
    });
  }

  private setContent(root: THREE.Group, content: THREE.Group): void {
    const old = root.getObjectByName('content');
    if (old) root.remove(old);
    content.updateMatrixWorld(true);
    root.userData.size = new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3());
    shadows(content);
    root.add(content);
  }

  private refreshCollider(e: Entry): void {
    if (e.collider) { this.physics.removeCollider(e.collider); e.collider = null; }
    const size = e.root.userData.size as THREE.Vector3;
    if (e.spec.info.interaction === 'push' || size.y < 1.2) return;
    e.collider = this.physics.addFixedBox(e.spec.x, e.spec.y + size.y / 2, e.spec.z, size.x / 2, size.y / 2, size.z / 2, e.spec.rotation);
  }

  private clear(): void {
    for (const e of this.entries) {
      if (e.collider) this.physics.removeCollider(e.collider);
      e.root.traverse((o) => { if (o instanceof THREE.Mesh && o.parent?.userData.placeholder) o.geometry.dispose(); });
      this.group.remove(e.root);
    }
    this.entries = [];
    for (const cb of this.onCleared) cb();
  }
}
```

- [ ] **Step 5: Implement the App runtime and boot**

`web/src/app.ts`:
```ts
import * as THREE from 'three';
import type { Recipe } from './core/recipe';
import { Physics } from './physics/physics';
import { Player } from './player/player';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { Engine } from './render/engine';
import { WINDOW_MATERIAL } from './render/placeholders';
import { buildRoadMeshes } from './render/roads';
import { ScatterAssets } from './render/scatterAssets';
import { disposeGroup, WaterSystem } from './render/water';
import { NullModelSource, WorldObjects, type ModelSource } from './render/worldObjects';
import { buildWorld, type BuiltWorld } from './world/build';
import { snapshotField } from './world/field';
import type { Placement } from './world/placement';

export class App {
  built: BuiltWorld | null = null;
  private roads: THREE.Group | null = null;
  private spawnPending: { x: number; y: number; z: number } | null = null;

  private constructor(
    readonly engine: Engine,
    readonly physics: Physics,
    readonly atmosphere: AtmosphereSystem,
    readonly chunks: ChunkManager,
    readonly water: WaterSystem,
    readonly objects: WorldObjects,
    readonly player: Player,
  ) {}

  static async create(canvas: HTMLCanvasElement, models: ModelSource = new NullModelSource()): Promise<App> {
    const engine = new Engine(canvas);
    const physics = await Physics.create();
    const app = new App(
      engine, physics, new AtmosphereSystem(engine.scene), new ChunkManager(engine.scene, physics, new ScatterAssets()),
      new WaterSystem(engine.scene), new WorldObjects(engine.scene, physics, models), new Player(engine.camera, canvas, physics),
    );
    engine.onUpdate((dt, t) => app.frame(dt, t));
    engine.start();
    return app;
  }

  get spawning(): boolean {
    return this.spawnPending !== null;
  }

  load(recipe: Recipe, keep: Placement[] = [], respawn = true): BuiltWorld {
    const built = buildWorld(recipe, keep);
    this.built = built;
    this.chunks.setSnapshot(snapshotField(built.field));
    this.atmosphere.apply(recipe.atmosphere, respawn);
    this.water.rebuild(built.field);
    if (this.roads) { this.engine.scene.remove(this.roads); disposeGroup(this.roads); }
    this.roads = buildRoadMeshes(built.field, built.roads);
    this.engine.scene.add(this.roads);
    this.objects.rebuild(built);
    // @hook:after-load
    if (respawn) {
      this.spawnPending = built.spawn;
      this.player.enabled = false;
      this.player.teleport(built.spawn.x, built.spawn.y, built.spawn.z);
    }
    return built;
  }

  private frame(dt: number, t: number): void {
    const focus = this.spawnPending ?? this.player.position;
    this.chunks.update(focus.x, focus.z);
    if (this.spawnPending && this.chunks.isReady(this.spawnPending.x, this.spawnPending.z)) {
      const s = this.spawnPending;
      this.player.spawn(s.x, s.y, s.z);
      this.player.enabled = true;
      this.spawnPending = null;
    }
    if (this.built) this.player.update(dt, this.built.field);
    this.physics.step(dt);
    this.atmosphere.update(dt, this.engine.camera.position);
    this.water.update(this.engine.camera.position);
    WINDOW_MATERIAL.emissiveIntensity = this.atmosphere.isNight ? 1.4 : 0;
    // @hook:frame
    void t;
  }
}
```

Replace `web/src/main.ts` with:
```ts
import './styles.css';
import { App } from './app';
import { recipeSchema } from './core/recipe';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const app = await App.create(canvas);
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  app.load(recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]));
  canvas.addEventListener('click', () => app.player.controls.lock());
  (window as unknown as { app: App }).app = app;
})();
```

- [ ] **Step 6: Run the tests and verify in the browser**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, with no type errors.

Browser, `/?w=fishing-valley`:
- Village houses face the road, with a well beside it.
- A stone tower stands on a high ridge, and a campfire ring is near the village.
- You can't walk through houses or the tower.

Browser, `/?w=snowy-mountains` (it starts at night):
- House windows glow.
- The castle sits on a peak.
- There's a lodge and a lantern by the lake.

- [ ] **Step 7: Commit**

```bash
git add web/src web/tests
git commit -m "feat(render): procedural placeholders, world objects with colliders, App runtime

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 4: Backend AI (Python)

All backend commands run in `backend/` with the venv active.

### Task 17: LLM client, prompts, cache, mock world, `/api/world`

**Files:**
- Create: `backend/app/llm.py`, `backend/app/cache.py`, `backend/app/prompts.py`, `backend/app/mock.py`, `backend/app/service.py`, `backend/app/ratelimit.py`, `backend/app/main.py`
- Modify: `backend/.env.example` (append `LLM_JSON_MODE=1`)
- Test: `backend/tests/conftest.py`, `backend/tests/test_llm.py`, `backend/tests/test_mock_world.py`, `backend/tests/test_service_world.py`, `backend/tests/test_api_world.py`

**Interfaces:**
- Consumes: `schemas.py` (Task 2).
- Produces:
  - `LLMClient(base_url, api_key, model, timeout=45, transport=None)` with `.model`, `.complete(system, user) -> str`, `from_env() -> LLMClient | None`; `LLMError`; `extract_json(text) -> dict`
  - `FileCache(root)` with `.key(*parts)`, `.get(key)`, `.put(key, value)`
  - `PROMPT_VERSION`, `world_system_prompt() -> str`, `edit_system_prompt(req: EditRequest) -> str`
  - `KEYWORDS`, `pick_fixture(prompt) -> str`, `prompt_seed(prompt) -> int`, `mock_world(prompt) -> dict`
  - `WorldService(llm, cache)` with `.generate(prompt) -> dict` (the response shape in spec §10)
  - `RateLimiter(per_ip=20, window=600, daily_cap=300, clock=time.time)` with `.check(ip) -> str | None`
  - `create_app(llm=None, cache_dir=None, limiter=None) -> FastAPI`; module-level `app`

- [x] **Step 1: Write the failing tests**

`backend/tests/conftest.py`:
```python
import json
import pytest
from app.schemas import FIXTURES_DIR


class FakeLLM:
    """Returns queued replies in order; records calls."""

    def __init__(self, *replies: str):
        self.replies = list(replies)
        self.calls: list[tuple[str, str]] = []
        self.model = "fake-model"

    def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        return self.replies.pop(0)


@pytest.fixture
def valley_json() -> str:
    data = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    return json.dumps({"type": "recipe", "recipe": data, "notes": ["ok"]})
```

`backend/tests/test_llm.py`:
```python
import json
import httpx
import pytest
from app.llm import LLMClient, LLMError, extract_json


def test_extract_json_variants():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Sure! {"a": {"b": 2}} hope it helps') == {"a": {"b": 2}}
    with pytest.raises(ValueError):
        extract_json("no json here")
    with pytest.raises(ValueError):
        extract_json("[1, 2]")


def test_client_posts_openai_compatible_request():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    client = LLMClient("https://example.test/v1/", "k123", "m1", transport=httpx.MockTransport(handler))
    assert client.complete("sys", "hi") == '{"ok": true}'
    assert seen["auth"] == "Bearer k123"
    assert seen["body"]["model"] == "m1"
    assert seen["body"]["messages"][0] == {"role": "system", "content": "sys"}


def test_client_wraps_http_errors():
    client = LLMClient("https://example.test/v1", "k", "m", transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    with pytest.raises(LLMError):
        client.complete("s", "u")
```

`backend/tests/test_mock_world.py`:
```python
from app.mock import mock_world, pick_fixture, prompt_seed
from app.schemas import Recipe


def test_pick_fixture_by_keywords():
    assert pick_fixture("a sandy desert canyon with an oasis") == "desert-canyon"
    assert pick_fixture("frozen mountains with a castle") == "snowy-mountains"
    assert pick_fixture("tropical island with a lighthouse") == "tropical-island"
    assert pick_fixture("something completely different") == "fishing-valley"


def test_mock_world_is_valid_and_seeded_by_prompt():
    out = mock_world("a snowy castle")
    assert out["type"] == "recipe" and out["source"] == "mock"
    r = Recipe.model_validate(out["recipe"])
    assert r.seed == prompt_seed("a snowy castle")
    assert prompt_seed("A snowy castle ") == prompt_seed("a snowy castle")
```

`backend/tests/test_service_world.py`:
```python
import json
from app.cache import FileCache
from app.llm import LLMError
from app.mock import prompt_seed
from app.service import WorldService
from tests.conftest import FakeLLM


def test_live_then_cache(tmp_path, valley_json):
    llm = FakeLLM(valley_json)
    svc = WorldService(llm, FileCache(tmp_path))
    out = svc.generate("a misty valley")
    assert out["source"] == "live" and out["recipe"]["seed"] == prompt_seed("a misty valley")
    again = svc.generate("a misty valley")
    assert again["source"] == "cache" and len(llm.calls) == 1


def test_retry_after_invalid_answer(tmp_path, valley_json):
    llm = FakeLLM('{"type": "recipe", "recipe": {"version": 2}}', valley_json)
    out = WorldService(llm, FileCache(tmp_path)).generate("valley")
    assert out["source"] == "live" and len(llm.calls) == 2
    assert "invalid" in llm.calls[1][1]


def test_falls_back_to_mock_after_two_failures(tmp_path):
    out = WorldService(FakeLLM("garbage", "still garbage"), FileCache(tmp_path)).generate("desert canyon")
    assert out["source"] == "mock" and "preset" in out["notes"][0]


def test_unsupported_passes_through(tmp_path):
    out = WorldService(FakeLLM(json.dumps({"type": "unsupported", "reason": "nope"})), FileCache(tmp_path)).generate("x y z")
    assert out == {"type": "unsupported", "reason": "nope", "source": "live"}


def test_llm_error_falls_back(tmp_path):
    class Broken:
        model = "b"

        def complete(self, s, u):
            raise LLMError("down")

    assert WorldService(Broken(), FileCache(tmp_path)).generate("island")["source"] == "mock"


def test_no_llm_uses_mock(tmp_path):
    assert WorldService(None, FileCache(tmp_path)).generate("island")["source"] == "mock"
```

`backend/tests/test_api_world.py`:
```python
from fastapi.testclient import TestClient
from app.main import create_app
from app.ratelimit import RateLimiter


def test_health_and_world(tmp_path):
    client = TestClient(create_app(llm=None, cache_dir=tmp_path))
    assert client.get("/api/health").json() == {"ok": True, "provider": "mock", "model": None}
    r = client.post("/api/world", json={"prompt": "a tropical island"})
    assert r.status_code == 200 and r.json()["recipe"]["terrain"]["shape"] == "island"


def test_validation_and_rate_limit(tmp_path):
    client = TestClient(create_app(llm=None, cache_dir=tmp_path, limiter=RateLimiter(per_ip=1)))
    assert client.post("/api/world", json={"prompt": "x"}).status_code == 422
    assert client.post("/api/world", json={"prompt": "valley"}).status_code == 200
    assert client.post("/api/world", json={"prompt": "valley"}).status_code == 429
```

- [x] **Step 2: Run to verify they fail**

Run: `pytest -q`
Expected: FAIL with `ModuleNotFoundError` for `app.llm`, `app.mock` and the others.

- [x] **Step 3: Implement**

`backend/app/llm.py`:
```python
from __future__ import annotations

import json
import os
import re

import httpx


class LLMError(Exception):
    pass


FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def extract_json(text: str) -> dict:
    m = FENCE.search(text)
    candidate = m.group(1) if m else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the answer")
    data = json.loads(candidate[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("answer is not a JSON object")
    return data


class LLMClient:
    """Any OpenAI-compatible /chat/completions endpoint (OpenRouter, Gemini, DeepSeek, ...)."""

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 45.0, transport: httpx.BaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.transport = transport

    @classmethod
    def from_env(cls) -> "LLMClient | None":
        key = os.getenv("LLM_API_KEY", "").strip()
        if not key:
            return None
        return cls(os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1"), key, os.getenv("LLM_MODEL", "google/gemini-2.5-flash-lite"))

    def complete(self, system: str, user: str) -> str:
        body: dict = {
            "model": self.model,
            "temperature": 0.4,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if os.getenv("LLM_JSON_MODE", "1") == "1":
            body["response_format"] = {"type": "json_object"}
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                r = client.post(f"{self.base_url}/chat/completions", json=body, headers={"Authorization": f"Bearer {self.api_key}"})
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"] or ""
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
            raise LLMError(str(e)) from e
```

`backend/app/cache.py`:
```python
from __future__ import annotations

import hashlib
import json
from pathlib import Path


class FileCache:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def key(*parts: str) -> str:
        return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()

    def get(self, key: str) -> dict | None:
        p = self.root / f"{key}.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    def put(self, key: str, value: dict) -> None:
        (self.root / f"{key}.json").write_text(json.dumps(value), encoding="utf-8")
```

`backend/app/prompts.py`:
```python
from __future__ import annotations

import json

from .schemas import FIXTURES_DIR, EditRequest, Recipe, dump, ops_adapter

PROMPT_VERSION = "p1"
EXAMPLE = (FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8")

WORLD_TEMPLATE = """You design explorable outdoor 3D worlds for a browser game engine.
Convert the user's description into ONE JSON object and nothing else.

Answer format, exactly one of:
{"type":"recipe","recipe":<Recipe>,"notes":["short notes for the user about approximations"]}
{"type":"unsupported","reason":"why"}

Recipe JSON Schema:
__SCHEMA__

Rules:
- Never give coordinates, except when the user states explicit coordinates; then use {"rel":"at","x":..,"z":..} with values in -512..512.
- Say WHERE with relations: highest, lowest, flat, by_water, near(target,maxDist), far_from(target,minDist), direction(dir, of?), visible_from(target). North is negative z.
- At most 12 places. kind:
  settlement = village/town/camp (houses are generated automatically; "asset" is the house type, e.g. "thatched cottage");
  landmark = one big notable object (tower, castle, statue, lighthouse, windmill);
  structure = one building (cabin, shrine, dock);
  prop = small object (campfire, bench, barrel, lantern).
- "asset" is a short visual description of ONE 3D model, e.g. "ruined stone watchtower". It is used to find or generate the model.
- interaction makes it usable: door (buildings), light (lamps, lighthouses), fire (campfires), sound (bells, gongs), sit (benches), push (barrels, crates); otherwise "none".
- terrain.shape: island (sea all round; seaLevel 0.25-0.4), valley, canyon, mountains, hills, plains. seaLevel 0 = no sea.
- climate.temperature 0 frozen .. 1 scorching; climate.moisture 0 dry .. 1 lush.
- water.river true if a river/stream is mentioned or it fits a valley or canyon; water.lake true for lakes/ponds.
- atmosphere from mood words: time dawn/day/dusk/night; weather clear/rain/snow/mist/storm; fog 0-1; wind 0-1.
- life: deer/birds/rabbits that fit the place (max 4 entries).
- paths: roads between the main places people would walk between.
- ids: lowercase, start with a letter, 2-32 chars of [a-z0-9_-], unique. Every target and path must name an existing id.
- Indoor or abstract requests: make the closest outdoor world and explain in notes. Use unsupported only for harmful content.
- "version": 1, any integer "seed".

Example recipe for "a misty pine valley with a river, a small fishing village on the bank and an old watchtower on the highest hill":
__EXAMPLE__

Respond with the JSON object only."""

EDIT_TEMPLATE = """You edit a live 3D world while the player walks around in it.
Turn the player's request into a short list of edit operations. Respond with ONE JSON object and nothing else:
{"type":"ops","ops":[...],"notes":["short notes"]}
or {"type":"unsupported","reason":"why"}

Operations JSON Schema:
__OPS_SCHEMA__

Current world recipe:
__RECIPE__

Where things are (id, label, x, z):
__PLACEMENTS__

Player context:
- player position: __PLAYER__
- point under the crosshair (lookAt): __LOOKAT__
- place under the crosshair (lookingAt): __LOOKINGAT__

Rules:
- "here", "there", "where I'm looking", "in front of me" -> {"rel":"at","x":<lookAt.x>,"z":<lookAt.z>} using the lookAt numbers exactly. If lookAt is null, use relations instead.
- "on this", "on that", "on top of it" (small props only, e.g. a candle on a table) -> the same "at" plus "y":<lookAt.y>, so the prop sits on the surface being looked at.
- Any object the user names is fine, even unusual ones ("a giraffe", "a hot-air balloon"): put a short visual description in "asset"; the model finder searches free libraries for it.
- "that", "this", "it" (the thing being looked at) -> the lookingAt id.
- New place ids must not already exist. Never resend the whole recipe; only operations.
- setClimate, setTerrain and setWater rebuild the whole world. Use them only when asked (e.g. "make it winter" -> setClimate temperature 0.1 + setAtmosphere weather snow).
- Time and weather words -> setAtmosphere.
- Keep place rules from the world prompt: kind, asset, interaction, relations.

Respond with the JSON object only."""


def world_system_prompt() -> str:
    return WORLD_TEMPLATE.replace("__SCHEMA__", json.dumps(Recipe.model_json_schema())).replace("__EXAMPLE__", EXAMPLE)


def edit_system_prompt(req: EditRequest) -> str:
    ctx = req.context
    placements = "\n".join(f"- {p.id}, {p.label}, {p.x:.0f}, {p.z:.0f}" for p in ctx.placements) or "- (none)"
    look_at = (f"x={ctx.lookAt.x:.0f}, z={ctx.lookAt.z:.0f}" + (f", y={ctx.lookAt.y:.2f}" if ctx.lookAt.y is not None else "")) if ctx.lookAt else "null"
    return (
        EDIT_TEMPLATE.replace("__OPS_SCHEMA__", json.dumps(ops_adapter.json_schema()))
        .replace("__RECIPE__", json.dumps(dump(req.recipe)))
        .replace("__PLACEMENTS__", placements)
        .replace("__PLAYER__", f"x={ctx.player.x:.0f}, z={ctx.player.z:.0f}")
        .replace("__LOOKAT__", look_at)
        .replace("__LOOKINGAT__", ctx.lookingAt or "null")
    )
```

`backend/app/mock.py`:
```python
from __future__ import annotations

import hashlib
import json
import re

from .schemas import FIXTURES_DIR, Recipe, dump

KEYWORDS: dict[str, list[str]] = {
    "fishing-valley": ["valley", "river", "village", "fishing", "pine", "forest", "mist", "misty", "stream", "meadow", "green", "tower"],
    "desert-canyon": ["desert", "canyon", "sand", "sandy", "oasis", "dune", "dunes", "arch", "mesa", "dry", "hot", "cactus", "obelisk"],
    "snowy-mountains": ["snow", "snowy", "mountain", "mountains", "castle", "winter", "ice", "icy", "frozen", "alpine", "lake", "peak", "peaks"],
    "tropical-island": ["island", "beach", "tropical", "lighthouse", "sea", "ocean", "palm", "coast", "bay", "harbor", "harbour"],
}


def prompt_seed(prompt: str) -> int:
    return int(hashlib.sha256(prompt.strip().lower().encode("utf-8")).hexdigest()[:8], 16) & 0x7FFFFFFF


def pick_fixture(prompt: str) -> str:
    words = set(re.findall(r"[a-z]+", prompt.lower()))
    best, best_score = "fishing-valley", 0
    for name, keys in KEYWORDS.items():
        score = len(words & set(keys))
        if score > best_score:
            best, best_score = name, score
    return best


def load_fixture(name: str) -> Recipe:
    return Recipe.model_validate(json.loads((FIXTURES_DIR / "recipes" / f"{name}.json").read_text(encoding="utf-8")))


def mock_world(prompt: str) -> dict:
    recipe = load_fixture(pick_fixture(prompt)).model_copy(update={"seed": prompt_seed(prompt)})
    return {"type": "recipe", "recipe": dump(recipe), "notes": ["Mock mode: used the preset world closest to your description."], "source": "mock"}
```

`backend/app/service.py`:
```python
from __future__ import annotations

from typing import Protocol

from pydantic import ValidationError

from .cache import FileCache
from .llm import LLMError, extract_json
from .mock import mock_world, prompt_seed
from .prompts import PROMPT_VERSION, world_system_prompt
from .schemas import Recipe, dump


class Completer(Protocol):
    model: str

    def complete(self, system: str, user: str) -> str: ...


def _notes(data: dict) -> list[str]:
    return [str(n)[:200] for n in data.get("notes", [])][:5]


class WorldService:
    def __init__(self, llm: Completer | None, cache: FileCache):
        self.llm = llm
        self.cache = cache

    def generate(self, prompt: str) -> dict:
        if self.llm is None:
            return mock_world(prompt)
        key = self.cache.key("world", PROMPT_VERSION, self.llm.model, prompt.strip().lower())
        hit = self.cache.get(key)
        if hit:
            return {**hit, "source": "cache"}
        system, user = world_system_prompt(), prompt
        for _ in range(2):
            try:
                data = extract_json(self.llm.complete(system, user))
                if data.get("type") == "unsupported":
                    return {"type": "unsupported", "reason": str(data.get("reason", "Not supported"))[:300], "source": "live"}
                recipe = Recipe.model_validate(data.get("recipe", data)).model_copy(update={"seed": prompt_seed(prompt)})
                out = {"type": "recipe", "recipe": dump(recipe), "notes": _notes(data), "source": "live"}
                self.cache.put(key, out)
                return out
            except (ValidationError, ValueError) as e:
                user = f"{prompt}\n\nYour previous answer was invalid:\n{str(e)[:1500]}\nReturn corrected JSON only."
            except LLMError:
                break
        out = mock_world(prompt)
        out["notes"] = ["The AI answer was unusable, so a preset world was used.", *out["notes"]]
        return out
```

`backend/app/ratelimit.py`:
```python
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Callable


class RateLimiter:
    def __init__(self, per_ip: int = 20, window: float = 600, daily_cap: int = 300, clock: Callable[[], float] = time.time):
        self.per_ip, self.window, self.daily_cap, self.clock = per_ip, window, daily_cap, clock
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.day: int | None = None
        self.count = 0

    def check(self, ip: str) -> str | None:
        now = self.clock()
        day = int(now // 86400)
        if day != self.day:
            self.day, self.count = day, 0
        if self.count >= self.daily_cap:
            return "Daily AI budget reached. Try again tomorrow or use the preset worlds."
        q = self.hits[ip]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.per_ip:
            return "Too many requests. Wait a few minutes."
        q.append(now)
        self.count += 1
        return None
```

`backend/app/main.py`:
```python
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .cache import FileCache
from .llm import LLMClient
from .ratelimit import RateLimiter
from .schemas import WorldRequest
from .service import WorldService

BACKEND_DIR = Path(__file__).resolve().parents[1]


def create_app(llm=None, cache_dir: Path | None = None, limiter: RateLimiter | None = None) -> FastAPI:
    app = FastAPI(title="WorldSeed API")
    app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
    cache_root = cache_dir or BACKEND_DIR / ".cache"
    world = WorldService(llm, FileCache(cache_root / "llm"))
    limiter = limiter or RateLimiter(daily_cap=int(os.getenv("LLM_DAILY_CAP", "300")))

    def guard(request: Request) -> None:
        msg = limiter.check(request.client.host if request.client else "unknown")
        if msg:
            raise HTTPException(status_code=429, detail=msg)

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "provider": "live" if llm else "mock", "model": getattr(llm, "model", None)}

    @app.post("/api/world")
    def post_world(req: WorldRequest, request: Request) -> dict:
        guard(request)
        return world.generate(req.prompt)

    return app


load_dotenv(BACKEND_DIR / ".env")
app = create_app(LLMClient.from_env())
```

Append to `backend/.env.example`:
```
LLM_JSON_MODE=1
```
(Set it to `0` if your provider rejects `response_format`.)

- [x] **Step 4: Run to verify they pass**

Run: `pytest -q`
Expected: PASS (contract, llm, mock, service, and api tests).

- [ ] **Step 5: Smoke-test the server**

```bash
uvicorn app.main:app --reload --port 8000
curl -s localhost:8000/api/health
curl -s -X POST localhost:8000/api/world -H 'content-type: application/json' -d '{"prompt":"a frozen castle on a mountain"}' | head -c 300
```
Expected: health reports `"provider":"mock"` with no key set; world returns the snowy-mountains recipe. Then put a real key in `backend/.env` (copied from `.env.example`), restart, and check that `provider` is `live` and that a new prompt returns `"source":"live"`.

- [x] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(backend): LLM world generation with validation, retry, cache, mock fallback, rate limit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: Edit endpoint (LLM + mock edit parser)

**Files:**
- Modify: `backend/app/mock.py` (add `mock_edit`), `backend/app/service.py` (add `WorldService.edit`), `backend/app/main.py` (add the route)
- Test: `backend/tests/test_mock_edit.py`, `backend/tests/test_service_edit.py`, `backend/tests/test_api_edit.py`

**Interfaces:**
- Consumes: Task 17.
- Produces:
  - `mock_edit(req: EditRequest) -> dict`
  - `WorldService.edit(req: EditRequest) -> dict`, returning `{type:"ops", ops, notes, source}` or `{type:"unsupported", reason, source}`
  - `POST /api/edit`

- [x] **Step 1: Write the failing tests**

`backend/tests/test_mock_edit.py`:
```python
import json
from app.mock import mock_edit
from app.schemas import FIXTURES_DIR, EditRequest


def req(prompt: str, look_at=None, looking_at=None) -> EditRequest:
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    return EditRequest.model_validate({"recipe": recipe, "prompt": prompt, "context": {"player": {"x": 0, "z": 0}, "lookAt": look_at, "lookingAt": looking_at}})


def test_time_and_weather():
    out = mock_edit(req("make it night and rainy"))
    assert {"op": "setAtmosphere", "time": "night"} in out["ops"]
    assert {"op": "setAtmosphere", "weather": "rain"} in out["ops"]


def test_add_here_uses_look_at():
    out = mock_edit(req("put a lantern here", look_at={"x": 12.4, "z": -40}))
    op = out["ops"][0]
    assert op["op"] == "addPlace" and op["place"]["interaction"] == "light" and op["place"]["kind"] == "prop"
    assert op["place"]["where"] == [{"rel": "at", "x": 12.4, "z": -40}]


def test_add_landmark_without_look_at_and_unique_id():
    out = mock_edit(req("build a tower"))
    place = out["ops"][0]["place"]
    assert place["kind"] == "landmark" and place["id"] != "tower" and place["where"] == [{"rel": "flat"}]


def test_remove_that_and_winter_and_unknown():
    assert mock_edit(req("remove that", looking_at="campfire"))["ops"] == [{"op": "removePlace", "id": "campfire"}]
    winter = mock_edit(req("make it winter"))["ops"]
    assert {"op": "setClimate", "temperature": 0.1} in winter
    assert mock_edit(req("tell me a joke"))["type"] == "unsupported"
```

`backend/tests/test_service_edit.py`:
```python
import json
from app.cache import FileCache
from app.schemas import FIXTURES_DIR, EditRequest
from app.service import WorldService
from tests.conftest import FakeLLM

RECIPE = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
REQ = EditRequest.model_validate({"recipe": RECIPE, "prompt": "make it night", "context": {"player": {"x": 0, "z": 0}}})


def test_live_edit(tmp_path):
    llm = FakeLLM(json.dumps({"type": "ops", "ops": [{"op": "setAtmosphere", "time": "night"}], "notes": []}))
    out = WorldService(llm, FileCache(tmp_path)).edit(REQ)
    assert out == {"type": "ops", "ops": [{"op": "setAtmosphere", "time": "night"}], "notes": [], "source": "live"}
    assert "lookAt" in llm.calls[0][0]


def test_invalid_twice_falls_back_to_mock(tmp_path):
    out = WorldService(FakeLLM('{"type":"ops","ops":[{"op":"explode"}]}', "nope"), FileCache(tmp_path)).edit(REQ)
    assert out["source"] == "mock" and out["ops"] == [{"op": "setAtmosphere", "time": "night"}]
```

`backend/tests/test_api_edit.py`:
```python
import json
from fastapi.testclient import TestClient
from app.main import create_app
from app.schemas import FIXTURES_DIR


def test_edit_route(tmp_path):
    client = TestClient(create_app(llm=None, cache_dir=tmp_path))
    recipe = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    r = client.post("/api/edit", json={"recipe": recipe, "prompt": "add a bench here", "context": {"player": {"x": 0, "z": 0}, "lookAt": {"x": 5, "z": 6}}})
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "ops" and body["ops"][0]["place"]["interaction"] == "sit"
```

- [x] **Step 2: Run to verify they fail**

Run: `pytest -q tests/test_mock_edit.py tests/test_service_edit.py tests/test_api_edit.py`
Expected: FAIL with ImportError on `mock_edit`, AttributeError on `edit`, and 404 on the route.

- [x] **Step 3: Implement**

Append to `backend/app/mock.py`:
```python
from .schemas import CORE_HALF, EditRequest  # noqa: E402

TIME_WORDS = [(r"\b(night|midnight)\b", "night"), (r"\b(dawn|sunrise|morning)\b", "dawn"), (r"\b(dusk|sunset|evening)\b", "dusk"), (r"\b(noon|midday|daytime|day)\b", "day")]
WEATHER_WORDS = [(r"\b(storm|stormy|thunder\w*)\b", "storm"), (r"\b(rain|rainy|raining)\b", "rain"), (r"\b(snow|snowy|snowing)\b", "snow"), (r"\b(mist|misty|fog|foggy)\b", "mist"), (r"\b(clear|sunny)\b", "clear")]
ATMOS_NOUNS = {"rain", "snow", "fog", "mist", "storm", "night", "day", "sunset", "sunrise", "dawn", "dusk"}
ADD = re.compile(r"\b(?:add|put|place|build|spawn|create)\s+(?:(?:an|a|the|some)\s+)?(?P<noun>[a-z][a-z \-]{1,60}?)(?:\s+(?:here|there|in front of me|where i'?m looking|where i am looking|over there))?\s*[.!]?$")
REMOVE = re.compile(r"\b(?:remove|delete|destroy)\b|\bget rid of\b")
LANDMARK = re.compile(r"tower|castle|lighthouse|statue|temple|obelisk|windmill|arch|monument")
STRUCTURE = re.compile(r"house|cabin|hut|shrine|tent|lodge|well|dock|cottage|barn|inn|stall")
INTERACTIONS = [(r"lamp|lantern|light|torch", "light"), (r"campfire|bonfire|fire", "fire"), (r"bell|gong", "sound"), (r"bench|chair|seat|stool", "sit"), (r"barrel|crate|box", "push"), (r"house|cabin|hut|cottage|lodge|barn|inn", "door")]


def _slug(noun: str, existing: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", noun.lower()).strip("-")[:24] or "thing"
    if not base[0].isalpha():
        base = f"p-{base}"
    if len(base) < 2:
        base = f"{base}x"
    out, i = base, 2
    while out in existing:
        out = f"{base}-{i}"
        i += 1
    return out


def _clamp(v: float) -> float:
    return max(-CORE_HALF, min(CORE_HALF, round(v, 1)))


def mock_edit(req: EditRequest) -> dict:
    text = req.prompt.lower().strip()
    ctx = req.context
    existing = {p.id for p in req.recipe.places}
    if REMOVE.search(text):
        target = ctx.lookingAt or next((p.id for p in req.recipe.places if p.label.lower() in text or p.id in text), None)
        if target:
            return {"type": "ops", "ops": [{"op": "removePlace", "id": target}], "notes": [], "source": "mock"}
        return {"type": "unsupported", "reason": "Look at the thing you want to remove, then try again.", "source": "mock"}
    m = ADD.search(text)
    if m and m.group("noun").strip() not in ATMOS_NOUNS:
        noun = m.group("noun").strip()
        kind = "landmark" if LANDMARK.search(noun) else "structure" if STRUCTURE.search(noun) else "prop"
        interaction = next((i for pat, i in INTERACTIONS if re.search(pat, noun)), "none")
        if ctx.lookAt:
            at = {"rel": "at", "x": _clamp(ctx.lookAt.x), "z": _clamp(ctx.lookAt.z)}
            if kind == "prop" and ctx.lookAt.y is not None:
                at["y"] = round(ctx.lookAt.y, 2)
            where = [at]
        elif ctx.lookingAt:
            where = [{"rel": "near", "target": ctx.lookingAt, "maxDist": 30}]
        else:
            where = [{"rel": "flat"}]
        place = {"id": _slug(noun, existing), "kind": kind, "label": noun.title()[:60], "asset": noun[:120], "size": "small" if kind == "prop" else "medium", "interaction": interaction, "where": where}
        return {"type": "ops", "ops": [{"op": "addPlace", "place": place}], "notes": [], "source": "mock"}
    ops: list[dict] = []
    if re.search(r"\bwinter\b", text):
        ops += [{"op": "setClimate", "temperature": 0.1}, {"op": "setAtmosphere", "weather": "snow"}]
    elif re.search(r"\bsummer\b", text):
        ops += [{"op": "setClimate", "temperature": 0.7}, {"op": "setAtmosphere", "weather": "clear"}]
    for pat, value in TIME_WORDS:
        if re.search(pat, text):
            ops.append({"op": "setAtmosphere", "time": value})
            break
    if not any(o.get("weather") for o in ops):
        for pat, value in WEATHER_WORDS:
            if re.search(pat, text):
                ops.append({"op": "setAtmosphere", "weather": value})
                break
    if ops:
        return {"type": "ops", "ops": ops, "notes": [], "source": "mock"}
    return {"type": "unsupported", "reason": "Mock mode understands time, weather, seasons, 'add X here' and 'remove that'.", "source": "mock"}
```

In `backend/app/service.py`, change the imports to:
```python
from .mock import mock_edit, mock_world, prompt_seed
from .prompts import PROMPT_VERSION, edit_system_prompt, world_system_prompt
from .schemas import EditRequest, Recipe, dump, dump_ops, ops_adapter
```
and add this method to `WorldService`:
```python
    def edit(self, req: EditRequest) -> dict:
        if self.llm is None:
            return mock_edit(req)
        system, user = edit_system_prompt(req), req.prompt
        for _ in range(2):
            try:
                data = extract_json(self.llm.complete(system, user))
                if data.get("type") == "unsupported":
                    return {"type": "unsupported", "reason": str(data.get("reason", "Not supported"))[:300], "source": "live"}
                ops = ops_adapter.validate_python(data.get("ops"))
                return {"type": "ops", "ops": dump_ops(ops), "notes": _notes(data), "source": "live"}
            except (ValidationError, ValueError) as e:
                user = f"{req.prompt}\n\nYour previous answer was invalid:\n{str(e)[:1500]}\nReturn corrected JSON only."
            except LLMError:
                break
        return mock_edit(req)
```

In `backend/app/main.py`, change the schemas import to `from .schemas import EditRequest, WorldRequest`, and add this route right after `post_world`:
```python
    @app.post("/api/edit")
    def post_edit(req: EditRequest, request: Request) -> dict:
        guard(request)
        return world.edit(req)
```

- [x] **Step 4: Run to verify they pass**

Run: `pytest -q`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(backend): /api/edit with LLM ops + regex mock parser (time, weather, season, add-here, remove-that)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19: Model finder (library → cache → Poly Pizza → Sketchfab → Meshy → placeholder)

When someone asks for something unexpected ("put a giraffe here"), we never fail and never pay first. The backend tries free sources in order, fastest and most on-style first:

| Step | Source | Speed | Cost |
|---|---|---|---|
| 1 | Local CC0 library (Quaternius, KayKit, Kenney; tagged) | instant | free |
| 2 | Cache of everything fetched or generated before | instant | free |
| 3 | **Poly Pizza** API: 10k+ low-poly CC0/CC-BY GLBs, same style family | 1–2 s | free key |
| 4 | **Sketchfab** Download API: huge catalogue, Creative Commons, GLB | 2–5 s | free token |
| 5 | **Meshy** text-to-3D: landmarks only, capped by `MESHY_MAX_GENERATIONS` | 30–90 s | paid |
| 6 | Procedural placeholder (browser, Task 16): the edit never fails | instant | free |

Online results are filtered to **CC0 and CC-BY only** (no NC/ND) and to 30k triangles or fewer. The best of the top 5 is chosen (token match, or one cheap LLM call when a key is set). The model is downloaded once into the cache and credited in the place card. TRELLIS on Hugging Face is a possible extra free generator, but its public Spaces are mostly image-to-3D and often queued or down, so it is out of v1 (see spec §11).

**Files:**
- Create: `backend/app/assets.py`, `backend/scripts/build_manifest.py`
- Modify: `backend/app/schemas.py` (`AssetRequest`: `allowOnline`, `variant`), `backend/app/main.py` (routes and static files), `backend/.env.example`
- Test: `backend/tests/test_assets.py`

**Interfaces:**
- Consumes: `AssetRequest` (Task 2), `extract_json` (Task 17).
- Produces:
  - `tokens(text) -> list[str]`, `license_ok(label) -> bool`
  - `Candidate(title, download, license, author, source, tris=None, uid=None)` with `.credit`
  - `AssetLibrary(root)` with `.search(query, variant=0) -> tuple[dict | None, float]`. Among equally good matches, `variant` picks a different one, so a village gets varied houses.
  - `ModelCache(root)` with `.key(query)`, `.get(query) -> dict | None`, `.add(key, query, file, source, credit=None)`, `.count(source=None)`
  - `PolyPizzaFinder(key)`, `SketchfabFinder(token)`, each with `.search(query, limit=8) -> list[Candidate]` and `.download(cand, dest)`
  - `MeshyClient(api_key)` (same API as before)
  - `default_pick(query, cands) -> int`, `LLMPicker(llm)`
  - `AssetService(library, cache, finders, meshy=None, max_generations=5, refine=False, pick=default_pick, spawn=thread)` with `.resolve(req) -> dict`, `.job(job_id) -> dict`
  - The response shape is `{status: "ready"|"pending"|"none", source?: "library"|"online"|"generated", url?, jobId?, credit?}`
  - Routes: `POST /api/assets/resolve`, `GET /api/assets/jobs/{job_id}`, static `/files/library/*` and `/files/generated/*`

- [ ] **Step 1: Extend `AssetRequest`**

In `backend/app/schemas.py` replace the `AssetRequest` class with:
```python
class AssetRequest(Strict):
    query: Annotated[str, Field(min_length=2, max_length=120)]
    kind: Kind = "prop"
    allowGenerate: bool = False
    allowOnline: bool = True
    variant: Annotated[int, Field(ge=0, le=99)] = 0
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_assets.py`:
```python
import json
from app.assets import AssetLibrary, AssetService, Candidate, ModelCache, default_pick, license_ok, tokens
from app.schemas import AssetRequest


def make_lib(tmp_path):
    root = tmp_path / "library"
    root.mkdir()
    (root / "manifest.json").write_text(json.dumps([
        {"id": "house-a", "file": "prefabs/house_a.glb", "tags": ["house", "wooden", "village"], "license": "CC0", "source": "quaternius"},
        {"id": "house-b", "file": "prefabs/house_b.glb", "tags": ["house", "wooden", "village"], "license": "CC0", "source": "quaternius"},
        {"id": "tower", "file": "kenney/castle/tower.glb", "tags": ["tower", "stone", "castle"], "license": "CC0", "source": "kenney"},
    ]))
    return AssetLibrary(root)


class FakeFinder:
    def __init__(self, name, results):
        self.name, self.results, self.downloads = name, results, 0

    def search(self, query, limit=8):
        return [c for c in self.results if set(tokens(query)) & set(tokens(c.title))]

    def download(self, cand, dest):
        self.downloads += 1
        dest.write_bytes(b"glTF")


class FakeMeshy:
    def __init__(self):
        self.created = []

    def create_preview(self, prompt):
        self.created.append(prompt)
        return "t1"

    def create_refine(self, preview_id):
        return "r1"

    def wait(self, task_id):
        return {"status": "SUCCEEDED", "model_urls": {"glb": "https://x/m.glb"}}

    def download(self, url, dest):
        dest.write_bytes(b"glTF")


def cand(title, lic="CC-BY 3.0", src="Poly Pizza"):
    return Candidate(title=title, download="https://cdn/x.glb", license=lic, author="ana", source=src, tris=900)


def test_tokens_and_licenses():
    assert tokens("The old Stone Towers of a castle") == ["stone", "tower", "castle"]
    assert tokens("wooden fishing cottage") == ["wooden", "fishing", "house"]
    assert license_ok("CC0 1.0") and license_ok("CC-BY 3.0") and license_ok("Creative Commons Attribution")
    assert not license_ok("CC BY-NC 4.0") and not license_ok("CC-BY-ND") and not license_ok("")


def test_library_search_and_variants(tmp_path):
    lib = make_lib(tmp_path)
    entry, score = lib.search("stone tower")
    assert entry["id"] == "tower" and score == 1.0
    picks = {lib.search("wooden cottage", variant=v)[0]["id"] for v in range(4)}
    assert picks == {"house-a", "house-b"}
    assert lib.search("purple dragon")[0] is None


def test_order_library_then_online_then_cache(tmp_path):
    poly = FakeFinder("Poly Pizza", [cand("Giraffe"), cand("Giraffe NC", lic="CC BY-NC")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly])
    assert svc.resolve(AssetRequest(query="wooden cottage"))["source"] == "library"
    first = svc.resolve(AssetRequest(query="giraffe"))
    assert first["status"] == "ready" and first["source"] == "online" and first["url"].startswith("/files/generated/")
    assert "Giraffe by ana (CC-BY 3.0, Poly Pizza)" == first["credit"]
    again = svc.resolve(AssetRequest(query="a giraffe"))
    assert again["source"] == "online" and poly.downloads == 1


def test_falls_through_to_sketchfab_and_respects_allow_online(tmp_path):
    poly = FakeFinder("Poly Pizza", [cand("Balloon", lic="CC BY-NC 4.0")])
    sketch = FakeFinder("Sketchfab", [cand("Hot air balloon", lic="CC Attribution", src="Sketchfab")])
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [poly, sketch])
    assert svc.resolve(AssetRequest(query="hot air balloon", allowOnline=False)) == {"status": "none"}
    out = svc.resolve(AssetRequest(query="hot air balloon"))
    assert out["source"] == "online" and "Sketchfab" in out["credit"]


def test_generate_with_meshy_then_budget(tmp_path):
    meshy = FakeMeshy()
    svc = AssetService(make_lib(tmp_path), ModelCache(tmp_path / "gen"), [], meshy=meshy, max_generations=1, spawn=lambda f, *a: f(*a))
    first = svc.resolve(AssetRequest(query="purple dragon statue", kind="landmark", allowGenerate=True))
    assert first == {"status": "pending", "jobId": first["jobId"]}
    done = svc.job(first["jobId"])
    assert done["status"] == "ready" and done["source"] == "generated"
    assert svc.resolve(AssetRequest(query="dragon statue purple", kind="landmark", allowGenerate=True))["status"] == "ready"
    assert svc.resolve(AssetRequest(query="giant robot", kind="landmark", allowGenerate=True)) == {"status": "none"}
    assert "low-poly" in meshy.created[0]


def test_default_pick_prefers_title_match():
    assert default_pick("candle", [cand("Candle holder building"), cand("Candle")]) in (0, 1)
    assert default_pick("candle", [cand("Tree"), cand("Rock")]) == -1
```

- [ ] **Step 3: Run to verify it fails**

Run: `pytest -q tests/test_assets.py`
Expected: FAIL, `ModuleNotFoundError: app.assets`.

- [ ] **Step 4: Implement**

`backend/app/assets.py`:
```python
from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol
from urllib.parse import quote

import httpx

from .llm import extract_json
from .schemas import AssetRequest

STOP = {"a", "an", "the", "of", "with", "and", "on", "in", "small", "big", "large", "old", "new", "tiny", "huge", "some"}
SYNONYMS = {"cottage": "house", "cabin": "house", "hut": "house", "home": "house", "lodge": "house", "shack": "house",
            "boulder": "rock", "oak": "tree", "lamp": "lantern", "watchtower": "tower", "stag": "deer", "bunny": "rabbit"}


def tokens(text: str) -> list[str]:
    out: list[str] = []
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in STOP:
            continue
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        w = SYNONYMS.get(w, w)
        if w not in out:
            out.append(w)
    return out


_BAD = re.compile(r"\bnc\b|non-?commercial|\bnd\b|no-?deriv", re.I)
_GOOD = re.compile(r"cc0|public domain|cc[- ]?by|attribution", re.I)


def license_ok(label: str) -> bool:
    return bool(label) and bool(_GOOD.search(label)) and not _BAD.search(label)


@dataclass
class Candidate:
    title: str
    download: str
    license: str
    author: str
    source: str
    tris: int | None = None
    uid: str | None = None

    @property
    def credit(self) -> str:
        return f"{self.title} by {self.author or 'unknown'} ({self.license}, {self.source})"


class Finder(Protocol):
    name: str

    def search(self, query: str, limit: int = 8) -> list[Candidate]: ...

    def download(self, cand: Candidate, dest: Path) -> None: ...


def _first(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ""):
            return d[k]
    return default


class PolyPizzaFinder:
    """Poly Pizza: free low-poly CC0/CC-BY GLBs. Free API key at https://poly.pizza/settings/api."""

    name = "Poly Pizza"
    BASE = "https://api.poly.pizza/v1"

    def __init__(self, key: str, transport: httpx.BaseTransport | None = None):
        self.key, self.transport = key, transport

    def search(self, query: str, limit: int = 8) -> list[Candidate]:
        with httpx.Client(timeout=6, transport=self.transport) as c:
            r = c.get(f"{self.BASE}/search/{quote(query)}", params={"limit": limit, "format": "glb"}, headers={"X-Auth-Token": self.key})
            r.raise_for_status()
            data = r.json()
        items = data.get("results", []) if isinstance(data, dict) else data
        out: list[Candidate] = []
        for m in items:
            creator = _first(m, "Creator", "creator", default={})
            author = _first(creator, "Username", "username", default="") if isinstance(creator, dict) else str(creator)
            tris = _first(m, "Tri Count", "triCount", "tricount")
            out.append(Candidate(
                title=str(_first(m, "Title", "title", "name", default="model")),
                download=str(_first(m, "Download", "download", default="")),
                license=str(_first(m, "Licence", "License", "license", default="")),
                author=author, source=self.name, tris=int(tris) if tris else None,
            ))
        return [c for c in out if c.download]

    def download(self, cand: Candidate, dest: Path) -> None:
        with httpx.Client(timeout=15, transport=self.transport, follow_redirects=True) as c:
            r = c.get(cand.download)
            r.raise_for_status()
            dest.write_bytes(r.content)


class SketchfabFinder:
    """Sketchfab Data API v3: downloadable Creative Commons models. Token from your Sketchfab account settings."""

    name = "Sketchfab"
    BASE = "https://api.sketchfab.com/v3"

    def __init__(self, token: str, transport: httpx.BaseTransport | None = None):
        self.token, self.transport = token, transport

    def search(self, query: str, limit: int = 8) -> list[Candidate]:
        with httpx.Client(timeout=6, transport=self.transport) as c:
            r = c.get(f"{self.BASE}/search", params={"type": "models", "q": query, "downloadable": "true", "count": limit, "max_face_count": 30000},
                      headers={"Authorization": f"Token {self.token}"})
            r.raise_for_status()
            items = r.json().get("results", [])
        out: list[Candidate] = []
        for m in items:
            lic = m.get("license")
            out.append(Candidate(
                title=str(m.get("name", "model")), download="", license=str(_first(lic, "label", default="") if isinstance(lic, dict) else lic or ""),
                author=str((m.get("user") or {}).get("username", "")), source=self.name, tris=m.get("faceCount"), uid=m.get("uid"),
            ))
        return [c for c in out if c.uid]

    def download(self, cand: Candidate, dest: Path) -> None:
        with httpx.Client(timeout=20, transport=self.transport, follow_redirects=True) as c:
            r = c.get(f"{self.BASE}/models/{cand.uid}/download", headers={"Authorization": f"Token {self.token}"})
            r.raise_for_status()
            url = (r.json().get("glb") or {}).get("url")
            if not url:
                raise RuntimeError("no GLB download offered")
            f = c.get(url)
            f.raise_for_status()
            dest.write_bytes(f.content)


class MeshyClient:
    BASE = "https://api.meshy.ai/openapi/v2/text-to-3d"

    def __init__(self, api_key: str, transport: httpx.BaseTransport | None = None):
        self.api_key, self.transport = api_key, transport

    def _client(self, timeout: float = 30) -> httpx.Client:
        return httpx.Client(timeout=timeout, transport=self.transport, headers={"Authorization": f"Bearer {self.api_key}"}, follow_redirects=True)

    def create_preview(self, prompt: str) -> str:
        with self._client() as c:
            r = c.post(self.BASE, json={"mode": "preview", "prompt": prompt[:600], "art_style": "realistic", "should_remesh": True})
            r.raise_for_status()
            return r.json()["result"]

    def create_refine(self, preview_id: str) -> str:
        with self._client() as c:
            r = c.post(self.BASE, json={"mode": "refine", "preview_task_id": preview_id})
            r.raise_for_status()
            return r.json()["result"]

    def get(self, task_id: str) -> dict:
        with self._client() as c:
            r = c.get(f"{self.BASE}/{task_id}")
            r.raise_for_status()
            return r.json()

    def wait(self, task_id: str, poll: float = 5.0, timeout: float = 600.0) -> dict:
        start = time.time()
        while time.time() - start < timeout:
            task = self.get(task_id)
            status = task.get("status")
            if status == "SUCCEEDED":
                return task
            if status in {"FAILED", "EXPIRED", "CANCELED"}:
                raise RuntimeError(f"Meshy task {task_id} {status}")
            time.sleep(poll)
        raise TimeoutError(f"Meshy task {task_id} timed out")

    def download(self, url: str, dest: Path) -> None:
        with httpx.Client(timeout=120, transport=self.transport, follow_redirects=True) as c:
            r = c.get(url)
            r.raise_for_status()
            dest.write_bytes(r.content)


class AssetLibrary:
    def __init__(self, root: Path):
        self.root = root
        manifest = root / "manifest.json"
        self.entries: list[dict] = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else []
        self._tags = [set(tokens(" ".join(e.get("tags", [])))) for e in self.entries]

    def search(self, query: str, variant: int = 0) -> tuple[dict | None, float]:
        q = set(tokens(query))
        if not q:
            return None, 0.0
        scored = [(len(q & tags) / len(q), e) for e, tags in zip(self.entries, self._tags)]
        best = max((s for s, _ in scored), default=0.0)
        if best < 0.5:
            return None, best
        ties = [e for s, e in scored if s == best]
        return ties[variant % len(ties)], best


class ModelCache:
    """Every model fetched online or generated, stored once and reused by its normalized description."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.index_path = root / "index.json"
        self.index: dict[str, dict] = json.loads(self.index_path.read_text(encoding="utf-8")) if self.index_path.exists() else {}
        self.lock = threading.Lock()

    @staticmethod
    def key(query: str) -> str:
        return hashlib.sha1(" ".join(sorted(set(tokens(query)))).encode("utf-8")).hexdigest()[:16]

    def get(self, query: str) -> dict | None:
        e = self.index.get(self.key(query))
        return e if e and (self.root / e["file"]).exists() else None

    def add(self, key: str, query: str, file: str, source: str, credit: str | None = None) -> None:
        with self.lock:
            self.index[key] = {"file": file, "query": query, "source": source, "credit": credit, "created": time.time()}
            self.index_path.write_text(json.dumps(self.index, indent=1), encoding="utf-8")

    def count(self, source: str | None = None) -> int:
        return sum(1 for e in self.index.values() if source is None or e["source"] == source)


def default_pick(query: str, cands: list[Candidate]) -> int:
    q = set(tokens(query))
    best, best_score = -1, 0.0
    for i, c in enumerate(cands):
        score = len(q & set(tokens(c.title))) / max(1, len(q))
        if score > best_score:
            best, best_score = i, score
    return best


class LLMPicker:
    """One cheap LLM call to choose among search results by title (only for things not in the library)."""

    def __init__(self, llm):
        self.llm = llm

    def __call__(self, query: str, cands: list[Candidate]) -> int:
        lines = "\n".join(f"{i}: {c.title} ({c.tris or '?'} triangles)" for i, c in enumerate(cands))
        try:
            raw = self.llm.complete('Pick the 3D model that best matches the request. Reply with JSON {"index": n}, or {"index": -1} if none fits.',
                                    f"Request: {query}\nCandidates:\n{lines}")
            idx = int(extract_json(raw).get("index", -1))
        except Exception:  # noqa: BLE001 - fall back to title matching
            return default_pick(query, cands)
        return idx if -1 <= idx < len(cands) else -1


def _thread(fn: Callable, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


class AssetService:
    def __init__(self, library: AssetLibrary, cache: ModelCache, finders: list, meshy=None, max_generations: int = 5,
                 refine: bool = False, pick: Callable[[str, list[Candidate]], int] = default_pick, spawn: Callable = _thread):
        self.library, self.cache, self.finders, self.meshy = library, cache, finders, meshy
        self.max_generations, self.refine, self.pick, self.spawn = max_generations, refine, pick, spawn
        self.jobs: dict[str, dict] = {}

    @staticmethod
    def _ready(e: dict) -> dict:
        out = {"status": "ready", "source": e["source"], "url": f"/files/generated/{e['file']}"}
        if e.get("credit"):
            out["credit"] = e["credit"]
        return out

    def resolve(self, req: AssetRequest) -> dict:
        entry, _ = self.library.search(req.query, req.variant)
        if entry:
            return {"status": "ready", "source": "library", "url": f"/files/library/{entry['file']}"}
        hit = self.cache.get(req.query)
        if hit:
            return self._ready(hit)
        key = self.cache.key(req.query)
        if key in self.jobs:
            return self.job(key)
        if req.allowOnline:
            found = self._find_online(key, req.query)
            if found:
                return found
        running = sum(1 for j in self.jobs.values() if j["status"] == "pending")
        if not (req.allowGenerate and self.meshy and self.cache.count("generated") + running < self.max_generations):
            return {"status": "none"}
        self.jobs[key] = {"status": "pending"}
        self.spawn(self._generate, key, req.query)
        return {"status": "pending", "jobId": key}

    def _find_online(self, key: str, query: str) -> dict | None:
        for finder in self.finders:
            try:
                cands = [c for c in finder.search(query) if license_ok(c.license) and (c.tris is None or c.tris <= 30000)][:5]
                if not cands:
                    continue
                i = self.pick(query, cands)
                if i < 0:
                    continue
                file = f"{key}.glb"
                finder.download(cands[i], self.cache.root / file)
                self.cache.add(key, query, file, "online", cands[i].credit)
                return self._ready(self.cache.index[key])
            except Exception:  # noqa: BLE001 - a failing source just means "try the next one"
                continue
        return None

    def job(self, job_id: str) -> dict:
        j = self.jobs.get(job_id)
        if not j:
            return {"status": "none"}
        if j["status"] == "pending":
            return {"status": "pending", "jobId": job_id}
        return {k: v for k, v in j.items() if k in {"status", "source", "url", "credit"}}

    def _generate(self, key: str, query: str) -> None:
        try:
            task_id = self.meshy.create_preview(f"{query}, low-poly game asset, single object, centered, no ground plane")
            task = self.meshy.wait(task_id)
            if self.refine:
                task = self.meshy.wait(self.meshy.create_refine(task_id))
            file = f"{key}.glb"
            self.meshy.download(task["model_urls"]["glb"], self.cache.root / file)
            self.cache.add(key, query, file, "generated", "Generated with Meshy")
            self.jobs[key] = self._ready(self.cache.index[key])
        except Exception as e:  # noqa: BLE001 - no model means the placeholder stays
            self.jobs[key] = {"status": "none", "error": str(e)[:200]}
```

`backend/scripts/build_manifest.py`:
```python
"""Index backend/assets/library/**.glb|.gltf into manifest.json, tags from folder and file names.

Hand-edited tags survive re-runs: entries already in manifest.json keep their "tags".
Usage: python scripts/build_manifest.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "assets" / "library"
LICENSES = {"kenney": "CC0 1.0 (kenney.nl)", "quaternius": "CC0 1.0 (quaternius.com)", "kaykit": "CC0 1.0 (Kay Lousberg)", "prefabs": "CC0 1.0 (assembled from Quaternius pieces)"}
DROP = {"glb", "gltf", "models", "model", "format", "fbx", "obj"}


def split_words(name: str) -> list[str]:
    name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    return [w.lower() for w in re.split(r"[^A-Za-z]+", name) if len(w) > 1]


def main() -> None:
    manifest = ROOT / "manifest.json"
    old = {e["file"]: e for e in json.loads(manifest.read_text(encoding="utf-8"))} if manifest.exists() else {}
    entries = []
    for f in sorted(ROOT.rglob("*")):
        if f.suffix.lower() not in {".glb", ".gltf"}:
            continue
        rel = f.relative_to(ROOT).as_posix()
        parts = rel.split("/")
        tags = sorted((set(split_words(" ".join(parts[:-1]))) | set(split_words(f.stem))) - DROP)
        entries.append({
            "id": re.sub(r"[^a-z0-9]+", "-", rel.lower()).strip("-"),
            "file": rel,
            "tags": old.get(rel, {}).get("tags", tags),
            "license": LICENSES.get(parts[0].lower(), "check the source"),
            "source": parts[0],
        })
    manifest.write_text(json.dumps(entries, indent=1), encoding="utf-8")
    print(f"{len(entries)} models indexed")


if __name__ == "__main__":
    main()
```

In `backend/app/main.py` (from Task 18), change the imports to:
```python
from fastapi.staticfiles import StaticFiles

from .assets import AssetLibrary, AssetService, LLMPicker, MeshyClient, ModelCache, PolyPizzaFinder, SketchfabFinder, default_pick
from .cache import FileCache
from .llm import LLMClient
from .ratelimit import RateLimiter
from .schemas import AssetRequest, EditRequest, WorldRequest
from .service import WorldService
```
Add, above `create_app`:
```python
def default_assets(llm=None) -> AssetService:
    finders = []
    if key := os.getenv("POLY_PIZZA_KEY", "").strip():
        finders.append(PolyPizzaFinder(key))
    if token := os.getenv("SKETCHFAB_TOKEN", "").strip():
        finders.append(SketchfabFinder(token))
    meshy_key = os.getenv("MESHY_API_KEY", "").strip()
    return AssetService(
        AssetLibrary(BACKEND_DIR / "assets" / "library"),
        ModelCache(BACKEND_DIR / "assets" / "generated"),
        finders,
        MeshyClient(meshy_key) if meshy_key else None,
        max_generations=int(os.getenv("MESHY_MAX_GENERATIONS", "5")),
        refine=os.getenv("MESHY_REFINE", "0") == "1",
        pick=LLMPicker(llm) if llm and os.getenv("ASSET_LLM_PICK", "1") == "1" else default_pick,
    )
```
Change the `create_app` signature to `def create_app(llm=None, cache_dir: Path | None = None, limiter: RateLimiter | None = None, assets: AssetService | None = None) -> FastAPI:`, and right after `limiter = …` add:
```python
    assets = assets or default_assets(llm)
    assets.library.root.mkdir(parents=True, exist_ok=True)
    app.mount("/files/library", StaticFiles(directory=str(assets.library.root)), name="library")
    app.mount("/files/generated", StaticFiles(directory=str(assets.cache.root)), name="generated")
```
After `post_edit`, add:
```python
    @app.post("/api/assets/resolve")
    def post_resolve(req: AssetRequest) -> dict:
        return assets.resolve(req)

    @app.get("/api/assets/jobs/{job_id}")
    def get_job(job_id: str) -> dict:
        return assets.job(job_id)
```

Append to `backend/.env.example`:
```
POLY_PIZZA_KEY=
SKETCHFAB_TOKEN=
ASSET_LLM_PICK=1
```

- [ ] **Step 5: Run to verify it passes**

Run: `pytest -q`
Expected: PASS for all backend tests.

- [ ] **Step 6: Live check of the online finders (2 minutes)**

Get a free Poly Pizza key (poly.pizza → Settings → API) and optionally a Sketchfab token, put them in `backend/.env`, and run:
```bash
python - <<'EOF'
import os
from dotenv import load_dotenv; load_dotenv(".env")
from app.assets import PolyPizzaFinder, SketchfabFinder
for f in [PolyPizzaFinder(os.environ["POLY_PIZZA_KEY"])] + ([SketchfabFinder(os.environ["SKETCHFAB_TOKEN"])] if os.getenv("SKETCHFAB_TOKEN") else []):
    for c in f.search("giraffe")[:3]: print(f.name, c)
EOF
```
Expected: candidates with non-empty `title`, `download` (Poly Pizza) or `uid` (Sketchfab), and `license`. If a field is empty, print one raw result (`r.json()`), add its real key name to the matching `_first(...)` list, and note it in `docs/DECISIONS.md`.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(backend): model finder — CC0 library, cache, Poly Pizza, Sketchfab, Meshy, license filter and credits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19b: Art catalogue (CC0 packs, house prefabs, tags)

The look of the whole game depends on this task. Use **one art family** so the world reads as designed: Quaternius first, KayKit for the player. Everything is CC0 and ships glTF.

**Files:**
- Create: `backend/assets/library/**` (models), `backend/assets/library/manifest.json` (generated, then hand-tuned), `backend/tests/test_catalogue.py`, `docs/CREDITS.md`

- [ ] **Step 1: Download the free versions (official pages only)**

| Folder | Pack | Use |
|---|---|---|
| `quaternius/nature/` | Stylized Nature MegaKit (Standard, free): https://quaternius.com/packs/stylizednaturemegakit.html | trees, pines, bushes, rocks, flowers, grass |
| `quaternius/village/` | Medieval Village MegaKit (Standard, free): https://quaternius.com/packs/medievalvillagemegakit.html | walls, roofs, doors, windows → house prefabs; well, market, props |
| `quaternius/animals/` | Ultimate Animated Animal Pack: https://quaternius.com/packs/ultimateanimatedanimals.html | deer and other wildlife (animated) |
| `kaykit/adventurers/` | KayKit Adventurers (free): https://kaylousberg.itch.io/kaykit-adventurers | the player character (rigged, animated) |
| `kaykit/forest/` (optional) | KayKit Forest Nature Pack (free): https://kaylousberg.itch.io/kaykit-forest | extra trees and rocks if needed |

Keep only the glTF/GLB files you'll use. Keep the library under **30 MB** (`du -sh backend/assets/library`).

- [ ] **Step 2: Build 8–10 house prefabs**

Modular pieces must be assembled into whole houses once, so villages load complete, varied buildings.
1. First check whether the packs already contain complete buildings (look for "house", "building" or "tavern" files). If they do, copy 6–10 of them to `backend/assets/library/prefabs/`.
2. Otherwise, in Blender:
   - Import the MegaKit pieces (File → Import → glTF).
   - Snap together 8–10 small houses: 1–2 floors, different roofs, doors and windows, each about 6×5 m with the door on the +Y side (glTF +Z = front).
   - Join each house, set its origin at the bottom centre, and export each as `backend/assets/library/prefabs/house_<style>_<n>.glb` (glTF Binary, Apply Modifiers).
   - Also make `well.glb` and `market_stall.glb`.

- [ ] **Step 3: Index and tag**

```bash
cd backend && source .venv/Scripts/activate
python scripts/build_manifest.py
```
Then edit `assets/library/manifest.json`. Hand tags survive re-runs.
- Every house prefab gets `["house", "wooden", "village", "cottage", "<style words>"]`. All houses sharing those tags means `variant` rotates through them.
- Scatter models get exactly one clear kind word: `tree`, `pine`, `dead`, `bush`, `rock`, `cactus`, `reed`.
- The player character gets `["adventurer", "character", "player"]`.
- Animals get their species: `["deer"]`, `["rabbit"]`, `["fox"]`.

- [ ] **Step 4: Catalogue test**

`backend/tests/test_catalogue.py`:
```python
import pytest
from app.assets import AssetLibrary
from app.main import BACKEND_DIR

LIB = AssetLibrary(BACKEND_DIR / "assets" / "library")
pytestmark = pytest.mark.skipif(not LIB.entries, reason="no models in the library yet")

MUST_RESOLVE = ["tree", "pine tree", "rock", "bush", "wooden fishing cottage", "thatched beach hut", "stone well", "market stall",
                "campfire with stones", "wooden barrel", "iron lantern on post", "adventurer character", "deer"]


@pytest.mark.parametrize("query", MUST_RESOLVE)
def test_core_requests_resolve_locally(query):
    entry, score = LIB.search(query)
    assert entry is not None, f"'{query}' has no library match — add tags in manifest.json"


def test_houses_have_variants():
    files = {LIB.search("wooden cottage", v)[0]["file"] for v in range(10)}
    assert len(files) >= 4
```
Run: `pytest -q tests/test_catalogue.py`. Expected: PASS. Fix failures by adding tags, not by changing the test.

- [ ] **Step 5: Credits and commit**

`docs/CREDITS.md`: list each pack with its author, URL and "CC0 1.0". Note that online models (Poly Pizza, Sketchfab) are credited per model in the game's place card.
```bash
git add backend/assets/library backend/tests/test_catalogue.py docs/CREDITS.md
git commit -m "feat(art): CC0 art catalogue — Quaternius nature/village/animals, KayKit adventurer, house prefabs, tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 5: Interaction, life, AI in the browser, UI

### Task 20: Interactions (E to use)

**Files:**
- Create: `web/src/logic/interactions.ts`
- Modify: `web/src/main.ts` (temporary wiring)

**Interfaces:**
- Consumes: `Physics` (Task 13); `Player` (Task 14); `ObjectInfo`, `WorldObjects.onReady` and `onCleared` (Task 16).
- Produces: `class InteractionSystem { constructor(physics, player); register(root: THREE.Group, info: ObjectInfo): void; clear(): void; nearest(ray: THREE.Ray, maxDist?: number): InteractItem | null; use(item): void; hint(item): string; update(dt, isNight, t): void }`, plus `type InteractItem`.

- [ ] **Step 1: Implement**

`web/src/logic/interactions.ts`:
```ts
import * as THREE from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { Interaction } from '../core/recipe';
import type { Physics } from '../physics/physics';
import type { Player } from '../player/player';
import type { ObjectInfo } from '../render/worldObjects';

type Usable = Exclude<Interaction, 'none'>;

const LABEL: Record<Usable, [string, string]> = {
  door: ['Open door', 'Close door'],
  light: ['Turn on the light', 'Turn off the light'],
  fire: ['Light the fire', 'Put out the fire'],
  sound: ['Ring', 'Ring'],
  sit: ['Sit down', 'Stand up'],
  push: ['Push', 'Push'],
};
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: 0x5a3d25, roughness: 0.8 });

export interface InteractItem {
  root: THREE.Group;
  info: ObjectInfo;
  type: Usable;
  on: boolean;
  manual: boolean;
  pivot?: THREE.Object3D;
  light?: THREE.PointLight;
  glow?: THREE.Mesh;
  body?: RigidBody;
  halfHeight: number;
}

export class InteractionSystem {
  private items: InteractItem[] = [];
  private audio: AudioContext | null = null;
  private seated: InteractItem | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly dir = new THREE.Vector3();

  constructor(private readonly physics: Physics, private readonly player: Player) {}

  register(root: THREE.Group, info: ObjectInfo): void {
    if (info.interaction === 'none') return;
    const size = root.userData.size as THREE.Vector3;
    const item: InteractItem = { root, info, type: info.interaction, on: info.interaction === 'fire', manual: false, halfHeight: size.y / 2 };
    if (item.type === 'door') {
      const pivot = new THREE.Group();
      pivot.position.set(-0.55, 0, size.z / 2 + 0.06);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.08), DOOR_MAT);
      panel.position.set(0.55, 1, 0);
      panel.castShadow = true;
      pivot.add(panel);
      root.add(pivot);
      item.pivot = pivot;
    }
    if (item.type === 'light' || item.type === 'fire') {
      const isLight = item.type === 'light';
      const y = isLight ? size.y + 0.2 : 0.6;
      const light = new THREE.PointLight(isLight ? 0xffd59a : 0xff8a3d, 0, isLight ? 26 : 14, 1.6);
      light.position.set(0, y, 0);
      const glow = new THREE.Mesh(
        isLight ? new THREE.SphereGeometry(0.18, 10, 8) : new THREE.ConeGeometry(0.4, 1.1, 7),
        new THREE.MeshBasicMaterial({ color: isLight ? 0xffe2a8 : 0xff9a3d, transparent: true, opacity: 0.9 }),
      );
      glow.position.set(0, isLight ? y : 0.7, 0);
      root.add(light, glow);
      item.light = light;
      item.glow = glow;
    }
    if (item.type === 'push') {
      const p = root.position;
      item.body = this.physics.addDynamicBox(p.x, p.y + size.y / 2 + 0.05, p.z, size.x / 2, size.y / 2, size.z / 2);
    }
    this.applyLight(item, 0);
    this.items.push(item);
  }

  clear(): void {
    for (const it of this.items) if (it.body) this.physics.removeBody(it.body);
    this.items = [];
    if (this.seated) { this.player.seated = false; this.seated = null; }
  }

  nearest(ray: THREE.Ray, maxDist = 4): InteractItem | null {
    if (this.items.length === 0) return null;
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = maxDist;
    const hit = this.raycaster.intersectObjects(this.items.map((i) => i.root), true)[0];
    if (!hit) return null;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      const item = this.items.find((i) => i.root === o);
      if (item) return item;
    }
    return null;
  }

  hint(item: InteractItem): string {
    return `E · ${LABEL[item.type][item.on ? 1 : 0]} — ${item.info.label}`;
  }

  use(item: InteractItem): void {
    switch (item.type) {
      case 'door': item.on = !item.on; break;
      case 'light':
      case 'fire': item.on = !item.on; item.manual = true; break;
      case 'sound': this.ring(); break;
      case 'sit':
        if (this.seated === item) { this.player.seated = false; this.seated = null; item.on = false; }
        else {
          this.player.seated = true;
          this.seated = item;
          item.on = true;
          const p = item.root.position;
          this.player.spawn(p.x, p.y, p.z);
        }
        break;
      case 'push':
        if (item.body) {
          this.dir.copy(this.player.lookRay().direction).setY(0).normalize();
          const m = item.body.mass();
          item.body.applyImpulse({ x: this.dir.x * m * 6, y: m * 1.5, z: this.dir.z * m * 6 }, true);
        }
        break;
    }
  }

  update(dt: number, isNight: boolean, t: number): void {
    for (const it of this.items) {
      if (it.pivot) it.pivot.rotation.y += ((it.on ? -1.6 : 0) - it.pivot.rotation.y) * Math.min(1, dt * 6);
      if (it.type === 'light' && !it.manual) it.on = isNight;
      if (it.light) this.applyLight(it, t);
      if (it.body) {
        const tr = it.body.translation(), q = it.body.rotation();
        it.root.quaternion.set(q.x, q.y, q.z, q.w);
        const offset = new THREE.Vector3(0, -it.halfHeight, 0).applyQuaternion(it.root.quaternion);
        it.root.position.set(tr.x + offset.x, tr.y + offset.y, tr.z + offset.z);
      }
    }
  }

  private applyLight(it: InteractItem, t: number): void {
    if (!it.light || !it.glow) return;
    const flicker = it.type === 'fire' ? 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08 : 1;
    it.light.intensity = it.on ? (it.type === 'light' ? 40 : 22) * flicker : 0;
    it.glow.visible = it.on;
    if (it.type === 'fire') it.glow.scale.y = flicker;
  }

  private ring(): void {
    this.audio ??= new AudioContext();
    const ctx = this.audio;
    const now = ctx.currentTime;
    for (const [f, g] of [[523, 0.5], [1046, 0.25], [1568, 0.12]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(g, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.3);
    }
  }
}
```

- [ ] **Step 2: Temporary wiring in main.ts**

Replace `web/src/main.ts` with:
```ts
import './styles.css';
import { App } from './app';
import { recipeSchema } from './core/recipe';
import { InteractionSystem } from './logic/interactions';

const fixtures = import.meta.glob('../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

void (async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const app = await App.create(canvas);
  const interactions = new InteractionSystem(app.physics, app.player);
  app.objects.onReady.push((root, info) => interactions.register(root, info));
  app.objects.onCleared.push(() => interactions.clear());
  app.engine.onUpdate((dt, t) => interactions.update(dt, app.atmosphere.isNight, t));
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE') return;
    const item = interactions.nearest(app.player.lookRay());
    if (item) interactions.use(item);
  });
  const name = new URLSearchParams(location.search).get('w') ?? 'fishing-valley';
  app.load(recipeSchema.parse(fixtures[`../../shared/fixtures/recipes/${name}.json`]));
  canvas.addEventListener('click', () => app.player.controls.lock());
})();
```

- [ ] **Step 3: Verify in the browser**

- `fishing-valley`: walk up to a house and press E. The door swings open; press E again and it closes. The campfire burns and flickers; E puts it out.
- `snowy-mountains` (night): the lantern is lit automatically; E switches it off.
- `desert-canyon`: E on the bell plays a chime.
- `tropical-island`: E on a barrel shoves it along the ground.

- [ ] **Step 4: Commit**

```bash
git add web/src/logic/interactions.ts web/src/main.ts
git commit -m "feat(logic): interactions — doors, lights (auto at night), fire, bell, seats, pushable props

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 21: Wildlife (deer, rabbits, birds)

**Files:**
- Create: `web/src/logic/wildlife.ts`
- Test: `web/tests/logic/wildlife.test.ts`
- Modify: `web/src/main.ts` (wiring)

**Interfaces:**
- Consumes: `BuiltWorld` (Task 11); `WorldField`; rng.
- Produces:
  - `type AnimalMode = 'graze'|'walk'|'flee'`
  - `interface AnimalState { mode; timer; heading }`
  - `interface AnimalTuning { fleeRadius; walkSpeed; fleeSpeed }`
  - `stepAnimal(s, ctx: { dt; playerDist; awayHeading; rng; tuning }): AnimalState`
  - `speedOf(s, tuning): number`
  - `class Wildlife { group; constructor(scene); rebuild(world: BuiltWorld): void; update(dt, t, player: THREE.Vector3, field: WorldField): void }`

- [ ] **Step 1: Write the failing test**

`web/tests/logic/wildlife.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { speedOf, stepAnimal, type AnimalState } from '../../src/logic/wildlife';

const tuning = { fleeRadius: 15, walkSpeed: 1.4, fleeSpeed: 9 };
const rng = () => 0.5;

describe('stepAnimal', () => {
  it('flees when the player is close', () => {
    const s = stepAnimal({ mode: 'graze', timer: 5, heading: 0 }, { dt: 0.1, playerDist: 10, awayHeading: 2, rng, tuning });
    expect(s.mode).toBe('flee');
    expect(s.heading).toBe(2);
    expect(speedOf(s, tuning)).toBe(9);
  });
  it('flee ends in grazing; grazing ends in walking; walking ends in grazing', () => {
    let s: AnimalState = { mode: 'flee', timer: 0.05, heading: 1 };
    s = stepAnimal(s, { dt: 0.1, playerDist: 100, awayHeading: 1, rng, tuning });
    expect(s.mode).toBe('graze');
    expect(speedOf(s, tuning)).toBe(0);
    s = stepAnimal({ ...s, timer: 0.01 }, { dt: 0.1, playerDist: 100, awayHeading: 0, rng, tuning });
    expect(s.mode).toBe('walk');
    expect(speedOf(s, tuning)).toBe(1.4);
    s = stepAnimal({ ...s, timer: 0.01 }, { dt: 0.1, playerDist: 100, awayHeading: 0, rng, tuning });
    expect(s.mode).toBe('graze');
  });
  it('counts its timer down', () => {
    const s = stepAnimal({ mode: 'graze', timer: 3, heading: 0 }, { dt: 0.5, playerDist: 100, awayHeading: 0, rng, tuning });
    expect(s).toEqual({ mode: 'graze', timer: 2.5, heading: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/logic/wildlife.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`web/src/logic/wildlife.ts`:
```ts
import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import type { BuiltWorld } from '../world/build';
import type { WorldField } from '../world/field';

export type AnimalMode = 'graze' | 'walk' | 'flee';
export interface AnimalState { mode: AnimalMode; timer: number; heading: number }
export interface AnimalTuning { fleeRadius: number; walkSpeed: number; fleeSpeed: number }

export function stepAnimal(s: AnimalState, ctx: { dt: number; playerDist: number; awayHeading: number; rng: () => number; tuning: AnimalTuning }): AnimalState {
  if (ctx.playerDist < ctx.tuning.fleeRadius && s.mode !== 'flee') return { mode: 'flee', timer: 4, heading: ctx.awayHeading };
  const timer = s.timer - ctx.dt;
  if (s.mode === 'flee') return timer > 0 ? { mode: 'flee', timer, heading: ctx.awayHeading } : { mode: 'graze', timer: 3 + ctx.rng() * 5, heading: s.heading };
  if (timer > 0) return { ...s, timer };
  if (s.mode === 'graze') return { mode: 'walk', timer: 2 + ctx.rng() * 4, heading: ctx.rng() * Math.PI * 2 };
  return { mode: 'graze', timer: 3 + ctx.rng() * 5, heading: s.heading };
}

export function speedOf(s: AnimalState, tuning: AnimalTuning): number {
  return s.mode === 'flee' ? tuning.fleeSpeed : s.mode === 'walk' ? tuning.walkSpeed : 0;
}

const DEER: AnimalTuning = { fleeRadius: 15, walkSpeed: 1.4, fleeSpeed: 9 };
const RABBIT: AnimalTuning = { fleeRadius: 9, walkSpeed: 1.2, fleeSpeed: 7 };

function part(g: THREE.Group, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

function deerMesh(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.45, 0.55, 1.3), 0x8a5a33, 0, 1.0, 0);
  part(g, new THREE.BoxGeometry(0.18, 0.55, 0.18), 0x8a5a33, 0, 1.45, 0.55).rotation.x = -0.5;
  part(g, new THREE.BoxGeometry(0.22, 0.24, 0.42), 0x7a4e2c, 0, 1.75, 0.78);
  for (const [x, z] of [[0.15, 0.48], [-0.15, 0.48], [0.15, -0.48], [-0.15, -0.48]]) part(g, new THREE.CylinderGeometry(0.05, 0.04, 0.95, 5), 0x6b4428, x, 0.48, z);
  return g;
}

function rabbitMesh(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.SphereGeometry(0.22, 8, 6), 0x9a8a78, 0, 0.2, 0).scale.set(1, 0.8, 1.3);
  part(g, new THREE.SphereGeometry(0.13, 8, 6), 0x9a8a78, 0, 0.35, 0.2);
  part(g, new THREE.BoxGeometry(0.04, 0.22, 0.06), 0x8a7a68, 0.05, 0.52, 0.18);
  part(g, new THREE.BoxGeometry(0.04, 0.22, 0.06), 0x8a7a68, -0.05, 0.52, 0.18);
  return g;
}

function birdMesh(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.ConeGeometry(0.12, 0.5, 5), 0x2e2e36, 0, 0, 0).rotation.x = Math.PI / 2;
  for (const side of [1, -1]) {
    const wing = new THREE.Group();
    part(wing, new THREE.BoxGeometry(0.6, 0.03, 0.25), 0x2e2e36, 0.3 * side, 0, 0);
    g.add(wing);
  }
  return g;
}

interface Animal { mesh: THREE.Group; state: AnimalState; tuning: AnimalTuning; x: number; z: number; hop: boolean }
interface Bird { mesh: THREE.Group; angle: number; radius: number; speed: number; height: number; phase: number }

export class Wildlife {
  readonly group = new THREE.Group();
  private animals: Animal[] = [];
  private birds: Bird[] = [];
  private readonly flock = new THREE.Vector3();
  private scatter = 0;
  private rng = mulberry32(1);

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  rebuild(world: BuiltWorld): void {
    this.group.clear();
    this.animals = [];
    this.birds = [];
    this.rng = mulberry32(world.recipe.seed ^ 0x5eed);
    const f = world.field;
    const anchor = world.spawn;
    for (const life of world.recipe.life) {
      if (life.kind === 'birds') {
        const c = world.placements[0] ?? anchor;
        this.flock.set(c.x, f.heightAt(c.x, c.z) + 25, c.z);
        for (let i = 0; i < life.count; i++) {
          const mesh = birdMesh();
          this.group.add(mesh);
          this.birds.push({ mesh, angle: this.rng() * Math.PI * 2, radius: 18 + this.rng() * 22, speed: 0.4 + this.rng() * 0.3, height: this.rng() * 10, phase: this.rng() * 6 });
        }
        continue;
      }
      for (let i = 0; i < life.count; i++) {
        let x = anchor.x, z = anchor.z;
        for (let tries = 0; tries < 30; tries++) {
          const a = this.rng() * Math.PI * 2, d = 30 + this.rng() * 150;
          x = anchor.x + Math.cos(a) * d;
          z = anchor.z + Math.sin(a) * d;
          if (!f.isWater(x, z) && f.slopeAt(x, z) < 0.45 && !f.isReserved(x, z, 4)) break;
        }
        const deer = life.kind === 'deer';
        const mesh = deer ? deerMesh() : rabbitMesh();
        this.group.add(mesh);
        this.animals.push({ mesh, x, z, hop: !deer, tuning: deer ? DEER : RABBIT, state: { mode: 'graze', timer: this.rng() * 5, heading: this.rng() * Math.PI * 2 } });
      }
    }
  }

  update(dt: number, t: number, player: THREE.Vector3, field: WorldField): void {
    for (const a of this.animals) {
      const dx = a.x - player.x, dz = a.z - player.z;
      a.state = stepAnimal(a.state, { dt, playerDist: Math.hypot(dx, dz), awayHeading: Math.atan2(dx, dz), rng: this.rng, tuning: a.tuning });
      const sp = speedOf(a.state, a.tuning);
      if (sp > 0) {
        const nx = a.x + Math.sin(a.state.heading) * sp * dt, nz = a.z + Math.cos(a.state.heading) * sp * dt;
        if (!field.isWater(nx, nz) && field.slopeAt(nx, nz) < 0.7) { a.x = nx; a.z = nz; }
        else if (a.state.mode === 'walk') a.state = { ...a.state, heading: a.state.heading + Math.PI };
      }
      a.mesh.position.set(a.x, field.heightAt(a.x, a.z) + (a.hop && sp > 0 ? Math.abs(Math.sin(t * 10)) * 0.25 : 0), a.z);
      a.mesh.rotation.y = a.state.heading;
    }
    if (Math.hypot(player.x - this.flock.x, player.z - this.flock.z) < 20) this.scatter = 6;
    this.scatter = Math.max(0, this.scatter - dt);
    const s = this.scatter > 0;
    for (const b of this.birds) {
      b.angle += b.speed * dt * (s ? 2 : 1);
      const r = b.radius * (s ? 2.2 : 1);
      b.mesh.position.set(this.flock.x + Math.cos(b.angle) * r, this.flock.y + b.height + (s ? 15 : 0) + Math.sin(t + b.phase) * 2, this.flock.z + Math.sin(b.angle) * r);
      b.mesh.rotation.y = -b.angle;
      const flap = Math.sin(t * 14 + b.phase) * 0.6;
      b.mesh.children[1].rotation.z = flap;
      b.mesh.children[2].rotation.z = -flap;
    }
  }
}
```

- [ ] **Step 4: Wire it in and verify**

In `web/src/main.ts` add the import `import { Wildlife } from './logic/wildlife';`. After `const interactions = …` add:
```ts
  const wildlife = new Wildlife(app.engine.scene);
  app.engine.onUpdate((dt, t) => { if (app.built) wildlife.update(dt, t, app.player.position, app.built.field); });
```
After the `app.load(...)` line add:
```ts
  wildlife.rebuild(app.built!);
```

Run: `npx vitest run tests/logic/wildlife.test.ts`. Expected: PASS.

Browser, `fishing-valley`:
- Deer graze, then wander.
- Running toward them makes them bolt away.
- A flock of birds circles over the village and scatters upward when you walk under it.

- [ ] **Step 5: Commit**

```bash
git add web/src/logic/wildlife.ts web/tests/logic web/src/main.ts
git commit -m "feat(logic): wildlife — grazing/fleeing deer and rabbits, scattering bird flocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 22: API client, offline mock and the asset model source

**Files:**
- Create: `web/src/api/types.ts`, `web/src/api/client.ts`, `web/src/api/localMock.ts`, `web/src/render/assetModels.ts`
- Test: `web/tests/api/localMock.test.ts`

**Interfaces:**
- Consumes: `opsSchema`, `parseRecipe`, `recipeSchema`, `Recipe`, `CORE_HALF` (Task 1); `ModelSource` (Task 16).
- Produces:
  - Types: `Source = 'live'|'mock'|'cache'|'offline'`, `WorldResult`, `EditResult`, `EditContext`, `AssetResult`
  - `health(): Promise<{ ok: boolean; provider: string } | null>`
  - `generateWorld(prompt): Promise<WorldResult>`
  - `editWorld(recipe, prompt, ctx): Promise<EditResult>`
  - `resolveAsset(query, kind, allowGenerate): Promise<AssetResult>`
  - `assetJob(id): Promise<AssetResult>`
  - `KEYWORDS`, `pickFixture(prompt)`, `fixtureRecipe(name)`, `localWorld(prompt)`, `localEdit(recipe, prompt, ctx)`
  - `class AssetModelSource implements ModelSource`

- [ ] **Step 1: Write the failing test**

`web/tests/api/localMock.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { localEdit, localWorld, pickFixture } from '../../src/api/localMock';
import type { EditContext } from '../../src/api/types';
import { applyOps } from '../../src/core/ops';
import { loadRecipeFixture } from '../fixtures';

const ctx = (patch: Partial<EditContext> = {}): EditContext => ({ player: { x: 0, z: 0 }, lookAt: null, lookingAt: null, placements: [], ...patch });

describe('localMock', () => {
  it('picks fixtures like the Python mock', () => {
    expect(pickFixture('a sandy desert canyon with an oasis')).toBe('desert-canyon');
    expect(pickFixture('frozen mountains with a castle')).toBe('snowy-mountains');
    expect(pickFixture('tropical island with a lighthouse')).toBe('tropical-island');
    expect(pickFixture('something else')).toBe('fishing-valley');
    const w = localWorld('island');
    expect(w.type === 'recipe' && w.recipe.terrain.shape).toBe('island');
  });

  it('understands time, weather and seasons', () => {
    const r = loadRecipeFixture('fishing-valley');
    const res = localEdit(r, 'make it night and rainy', ctx());
    expect(res.type).toBe('ops');
    if (res.type === 'ops') {
      expect(res.ops).toContainEqual({ op: 'setAtmosphere', time: 'night' });
      expect(res.ops).toContainEqual({ op: 'setAtmosphere', weather: 'rain' });
    }
    const winter = localEdit(r, 'make it winter', ctx());
    expect(winter.type === 'ops' && winter.ops).toContainEqual({ op: 'setClimate', temperature: 0.1 });
  });

  it('adds at the crosshair, and the result applies cleanly', () => {
    const r = loadRecipeFixture('fishing-valley');
    const res = localEdit(r, 'put a lantern here', ctx({ lookAt: { x: 12, z: -40 } }));
    expect(res.type).toBe('ops');
    if (res.type !== 'ops') return;
    const op = res.ops[0];
    expect(op.op === 'addPlace' && op.place.interaction).toBe('light');
    expect(op.op === 'addPlace' && op.place.where).toEqual([{ rel: 'at', x: 12, z: -40 }]);
    expect(() => applyOps(r, res.ops)).not.toThrow();
    const tower = localEdit(r, 'build a tower', ctx());
    expect(tower.type === 'ops' && tower.ops[0].op === 'addPlace' && tower.ops[0].place.id).toBe('tower-2');
    const apple = localEdit(r, 'put an apple tree here', ctx({ lookAt: { x: 1, z: 2 } }));
    expect(apple.type === 'ops' && apple.ops[0].op === 'addPlace' && apple.ops[0].place.asset).toBe('apple tree');
  });

  it('removes what you look at, and refuses nonsense', () => {
    const r = loadRecipeFixture('fishing-valley');
    expect(localEdit(r, 'remove that', ctx({ lookingAt: 'campfire' }))).toMatchObject({ type: 'ops', ops: [{ op: 'removePlace', id: 'campfire' }] });
    expect(localEdit(r, 'tell me a joke', ctx()).type).toBe('unsupported');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/api/localMock.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`web/src/api/types.ts`:
```ts
import type { Op } from '../core/ops';
import type { Recipe } from '../core/recipe';

export type Source = 'live' | 'mock' | 'cache' | 'offline';
export type WorldResult = { type: 'recipe'; recipe: Recipe; notes: string[]; source: Source } | { type: 'unsupported'; reason: string; source: Source };
export type EditResult = { type: 'ops'; ops: Op[]; notes: string[]; source: Source } | { type: 'unsupported'; reason: string; source: Source };
export interface EditContext {
  player: { x: number; z: number };
  lookAt: { x: number; z: number; y?: number } | null;
  lookingAt: string | null;
  placements: Array<{ id: string; label: string; x: number; z: number }>;
}
export interface AssetResult { status: 'ready' | 'pending' | 'none'; source?: 'library' | 'online' | 'generated'; url?: string; jobId?: string; credit?: string }
```

`web/src/api/localMock.ts`:
```ts
import type { Op } from '../core/ops';
import { CORE_HALF, recipeSchema, type Interaction, type Place, type Recipe } from '../core/recipe';
import { hashString } from '../core/rng';
import type { EditContext, EditResult, WorldResult } from './types';

const fixtures = import.meta.glob('../../../shared/fixtures/recipes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** Keep in sync with backend/app/mock.py KEYWORDS. */
export const KEYWORDS: Record<string, string[]> = {
  'fishing-valley': ['valley', 'river', 'village', 'fishing', 'pine', 'forest', 'mist', 'misty', 'stream', 'meadow', 'green', 'tower'],
  'desert-canyon': ['desert', 'canyon', 'sand', 'sandy', 'oasis', 'dune', 'dunes', 'arch', 'mesa', 'dry', 'hot', 'cactus', 'obelisk'],
  'snowy-mountains': ['snow', 'snowy', 'mountain', 'mountains', 'castle', 'winter', 'ice', 'icy', 'frozen', 'alpine', 'lake', 'peak', 'peaks'],
  'tropical-island': ['island', 'beach', 'tropical', 'lighthouse', 'sea', 'ocean', 'palm', 'coast', 'bay', 'harbor', 'harbour'],
};

export function pickFixture(prompt: string): string {
  const words = new Set(prompt.toLowerCase().match(/[a-z]+/g) ?? []);
  let best = 'fishing-valley', bestScore = 0;
  for (const [name, keys] of Object.entries(KEYWORDS)) {
    const score = keys.filter((k) => words.has(k)).length;
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return best;
}

export function fixtureRecipe(name: string): Recipe {
  return recipeSchema.parse(fixtures[`../../../shared/fixtures/recipes/${name}.json`]);
}

export function localWorld(prompt: string): WorldResult {
  const r = fixtureRecipe(pickFixture(prompt));
  return { type: 'recipe', recipe: { ...r, seed: hashString(prompt.trim().toLowerCase()) & 0x7fffffff }, notes: ['Offline mode: used the preset world closest to your description.'], source: 'offline' };
}

const TIME: Array<[RegExp, 'night' | 'dawn' | 'dusk' | 'day']> = [[/\b(night|midnight)\b/, 'night'], [/\b(dawn|sunrise|morning)\b/, 'dawn'], [/\b(dusk|sunset|evening)\b/, 'dusk'], [/\b(noon|midday|daytime|day)\b/, 'day']];
const WEATHER: Array<[RegExp, 'storm' | 'rain' | 'snow' | 'mist' | 'clear']> = [[/\b(storm|stormy|thunder\w*)\b/, 'storm'], [/\b(rain|rainy|raining)\b/, 'rain'], [/\b(snow|snowy|snowing)\b/, 'snow'], [/\b(mist|misty|fog|foggy)\b/, 'mist'], [/\b(clear|sunny)\b/, 'clear']];
const ATMOS = new Set(['rain', 'snow', 'fog', 'mist', 'storm', 'night', 'day', 'sunset', 'sunrise', 'dawn', 'dusk']);
const ADD = /\b(?:add|put|place|build|spawn|create)\s+(?:(?:an|a|the|some)\s+)?(?<noun>[a-z][a-z \-]{1,60}?)(?:\s+(?:here|there|in front of me|where i'?m looking|where i am looking|over there))?\s*[.!]?$/;
const REMOVE = /\b(?:remove|delete|destroy)\b|\bget rid of\b/;
const LANDMARK = /tower|castle|lighthouse|statue|temple|obelisk|windmill|arch|monument/;
const STRUCTURE = /house|cabin|hut|shrine|tent|lodge|well|dock|cottage|barn|inn|stall/;
const INTERACT: Array<[RegExp, Interaction]> = [[/lamp|lantern|light|torch/, 'light'], [/campfire|bonfire|fire/, 'fire'], [/bell|gong/, 'sound'], [/bench|chair|seat|stool/, 'sit'], [/barrel|crate|box/, 'push'], [/house|cabin|hut|cottage|lodge|barn|inn/, 'door']];

const clampCore = (v: number) => Math.max(-CORE_HALF, Math.min(CORE_HALF, Math.round(v * 10) / 10));
const ok = (ops: Op[]): EditResult => ({ type: 'ops', ops, notes: [], source: 'offline' });
const no = (reason: string): EditResult => ({ type: 'unsupported', reason, source: 'offline' });

function slug(noun: string, existing: Set<string>): string {
  let base = noun.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'thing';
  if (!/^[a-z]/.test(base)) base = `p-${base}`;
  if (base.length < 2) base = `${base}x`;
  let out = base;
  for (let i = 2; existing.has(out); i++) out = `${base}-${i}`;
  return out;
}

export function localEdit(recipe: Recipe, prompt: string, ctx: EditContext): EditResult {
  const text = prompt.toLowerCase().trim();
  const existing = new Set(recipe.places.map((p) => p.id));
  if (REMOVE.test(text)) {
    const target = ctx.lookingAt ?? recipe.places.find((p) => text.includes(p.label.toLowerCase()) || text.includes(p.id))?.id;
    return target ? ok([{ op: 'removePlace', id: target }]) : no('Look at the thing you want to remove, then try again.');
  }
  const noun = ADD.exec(text)?.groups?.noun?.trim();
  if (noun && !ATMOS.has(noun)) {
    const kind: Place['kind'] = LANDMARK.test(noun) ? 'landmark' : STRUCTURE.test(noun) ? 'structure' : 'prop';
    const interaction = INTERACT.find(([re]) => re.test(noun))?.[1] ?? 'none';
    const where: Place['where'] = ctx.lookAt
      ? [{ rel: 'at', x: clampCore(ctx.lookAt.x), z: clampCore(ctx.lookAt.z), ...(kind === 'prop' && ctx.lookAt.y !== undefined ? { y: Math.round(ctx.lookAt.y * 100) / 100 } : {}) }]
      : ctx.lookingAt ? [{ rel: 'near', target: ctx.lookingAt, maxDist: 30 }] : [{ rel: 'flat' }];
    const label = noun.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
    return ok([{ op: 'addPlace', place: { id: slug(noun, existing), kind, label, asset: noun.slice(0, 120), size: kind === 'prop' ? 'small' : 'medium', interaction, where } }]);
  }
  const ops: Op[] = [];
  if (/\bwinter\b/.test(text)) ops.push({ op: 'setClimate', temperature: 0.1 }, { op: 'setAtmosphere', weather: 'snow' });
  else if (/\bsummer\b/.test(text)) ops.push({ op: 'setClimate', temperature: 0.7 }, { op: 'setAtmosphere', weather: 'clear' });
  const time = TIME.find(([re]) => re.test(text));
  if (time) ops.push({ op: 'setAtmosphere', time: time[1] });
  if (!ops.some((o) => o.op === 'setAtmosphere' && o.weather)) {
    const w = WEATHER.find(([re]) => re.test(text));
    if (w) ops.push({ op: 'setAtmosphere', weather: w[1] });
  }
  return ops.length ? ok(ops) : no("Offline mode understands time, weather, seasons, 'add X here' and 'remove that'.");
}
```

`web/src/api/client.ts`:
```ts
import { opsSchema } from '../core/ops';
import { parseRecipe, type PlaceKind, type Recipe } from '../core/recipe';
import { localEdit, localWorld } from './localMock';
import type { AssetResult, EditContext, EditResult, Source, WorldResult } from './types';

export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000').replace(/\/$/, '');

async function post(path: string, body: unknown, timeoutMs = 45000): Promise<Record<string, unknown>> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

export async function health(): Promise<{ ok: boolean; provider: string } | null> {
  try {
    const r = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(6000) });
    return r.ok ? ((await r.json()) as { ok: boolean; provider: string }) : null;
  } catch {
    return null;
  }
}

export async function generateWorld(prompt: string): Promise<WorldResult> {
  try {
    const data = await post('/api/world', { prompt });
    if (data.type === 'unsupported') return { type: 'unsupported', reason: String(data.reason), source: data.source as Source };
    const parsed = parseRecipe(data.recipe);
    if (!parsed.ok) throw new Error(parsed.error);
    return { type: 'recipe', recipe: parsed.recipe, notes: (data.notes as string[]) ?? [], source: data.source as Source };
  } catch (e) {
    console.warn('generateWorld fell back to offline mode:', e);
    return localWorld(prompt);
  }
}

export async function editWorld(recipe: Recipe, prompt: string, ctx: EditContext): Promise<EditResult> {
  try {
    const data = await post('/api/edit', { recipe, prompt, context: ctx });
    if (data.type === 'unsupported') return { type: 'unsupported', reason: String(data.reason), source: data.source as Source };
    const ops = opsSchema.safeParse(data.ops);
    if (!ops.success) throw new Error(ops.error.message);
    return { type: 'ops', ops: ops.data, notes: (data.notes as string[]) ?? [], source: data.source as Source };
  } catch (e) {
    console.warn('editWorld fell back to offline mode:', e);
    return localEdit(recipe, prompt, ctx);
  }
}

const absolute = (res: AssetResult): AssetResult => (res.url && res.url.startsWith('/') ? { ...res, url: `${API_BASE}${res.url}` } : res);

export async function resolveAsset(query: string, kind: PlaceKind, allowGenerate: boolean): Promise<AssetResult> {
  try {
    return absolute((await post('/api/assets/resolve', { query, kind, allowGenerate }, 20000)) as unknown as AssetResult);
  } catch {
    return { status: 'none' };
  }
}

export async function assetJob(id: string): Promise<AssetResult> {
  try {
    const r = await fetch(`${API_BASE}/api/assets/jobs/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
    return absolute((await r.json()) as AssetResult);
  } catch {
    return { status: 'none' };
  }
}
```

`web/src/render/assetModels.ts`:
```ts
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetJob, resolveAsset } from '../api/client';
import type { PlaceKind } from '../core/recipe';
import type { ModelSource } from './worldObjects';

type Loaded = { object: THREE.Object3D; source: 'library' | 'online' | 'generated'; credit?: string } | null;

/** Asks the backend model finder (library → cache → Poly Pizza → Sketchfab → Meshy job for landmarks); polls jobs every 5 s for up to 5 min. */
export class AssetModelSource implements ModelSource {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<Loaded>>();

  constructor(private readonly allowGenerate: (kind: PlaceKind) => boolean = (k) => k === 'landmark') {}

  load(asset: string, kind: PlaceKind): Promise<Loaded> {
    const key = asset.toLowerCase().trim();
    let p = this.cache.get(key);
    if (!p) { p = this.fetch(asset, kind); this.cache.set(key, p); }
    return p;
  }

  private async fetch(asset: string, kind: PlaceKind): Promise<Loaded> {
    let res = await resolveAsset(asset, kind, this.allowGenerate(kind));
    for (let i = 0; res.status === 'pending' && res.jobId && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      res = await assetJob(res.jobId);
    }
    if (res.status !== 'ready' || !res.url) return null;
    try {
      const gltf = await this.loader.loadAsync(res.url);
      return { object: gltf.scene, source: res.source ?? 'generated', credit: res.credit };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/api/localMock.test.ts && npx tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/api web/src/render/assetModels.ts web/tests/api
git commit -m "feat(api): backend client with offline fallback, local mock parser, GLB model source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 23: UI (start screen, HUD, command bar, preview, place card, checks)

**Files:**
- Create: `web/src/ui/ui.ts`
- Modify: `web/src/styles.css` (append)

**Interfaces:**
- Consumes: `ObjectInfo` (Task 16); `Check` (Task 11).
- Produces:
  - `interface UIHandlers { generate(prompt): void; command(text): void; confirm(): void; cancel(): void; director(): void }`
  - `class UI { constructor(root, handlers); readonly commandOpen: boolean; readonly previewOpen: boolean; showStart(show); setHealth(text); setBusy(text | null); log(line); showHud(show); setHint(text | null); setCard(info | null); openCommand(); closeCommand(); showPreview(lines, notes); hidePreview(); setChecks(checks); toggleChecks(); setSource(text); toast(msg); typeStart(text): Promise<void>; typeCommand(text): Promise<void> }`

All model-written text (labels, descriptions, notes) goes in with `textContent`, never `innerHTML`.

- [ ] **Step 1: Implement**

`web/src/ui/ui.ts`:
```ts
import type { ObjectInfo } from '../render/worldObjects';
import type { Check } from '../world/checks';

export interface UIHandlers {
  generate(prompt: string): void;
  command(text: string): void;
  confirm(): void;
  cancel(): void;
  director(): void;
}

const EXAMPLES = [
  'A misty pine valley with a river, a small fishing village on the bank and an old watchtower on the highest hill',
  'A red desert canyon with an oasis camp, a weathered obelisk on the highest mesa, at sunset',
  'Frozen mountains at night with a castle on the tallest peak and a hunter’s lodge by a lake',
  'A tropical island with a beach village, a lighthouse on the east coast and lots of birds',
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class UI {
  private readonly start = el('div', 'start');
  private readonly prompt = el('textarea', 'prompt-input');
  private readonly healthLine = el('div', 'health');
  private readonly busy = el('div', 'busy hidden');
  private readonly busyText = el('div', 'busy-text');
  private readonly logList = el('ul', 'log');
  private readonly hud = el('div', 'hud hidden');
  private readonly hint = el('div', 'hint hidden');
  private readonly card = el('div', 'card hidden');
  private readonly command = el('div', 'command hidden');
  private readonly commandInput = el('input', 'command-input');
  private readonly preview = el('div', 'preview hidden');
  private readonly checks = el('div', 'checks hidden');
  private readonly source = el('div', 'source');
  private readonly toastEl = el('div', 'toast hidden');
  private toastTimer = 0;

  constructor(root: HTMLElement, private readonly h: UIHandlers) {
    // start screen
    this.start.append(el('h1', '', 'WorldSeed'), el('p', 'tagline', 'Describe a world. Walk into it. Change it by talking to it.'));
    this.prompt.placeholder = 'Describe your world…';
    this.prompt.maxLength = 600;
    this.prompt.value = EXAMPLES[0];
    const chips = el('div', 'chips');
    for (const ex of EXAMPLES) {
      const chip = el('button', 'chip', `${ex.slice(0, 42)}…`);
      chip.onclick = () => { this.prompt.value = ex; };
      chips.append(chip);
    }
    const go = el('button', 'primary', 'Create world');
    go.onclick = () => { if (this.prompt.value.trim().length >= 3) h.generate(this.prompt.value.trim()); };
    const demo = el('button', 'secondary', '▶ Watch the demo');
    demo.onclick = () => h.director();
    const actions = el('div', 'actions');
    actions.append(go, demo);
    this.start.append(this.prompt, chips, actions, this.healthLine);
    // busy overlay
    this.busy.append(this.busyText, this.logList);
    // hud
    this.hud.append(el('div', 'crosshair', '+'), el('div', 'help', 'WASD move · Shift run · Space jump/swim · E use · T talk to the world · U undo · C checks'), this.source);
    // command bar
    this.commandInput.placeholder = 'Tell the world what to change… e.g. “make it night”, “put a lighthouse there”';
    this.commandInput.maxLength = 400;
    this.commandInput.onkeydown = (e) => {
      if (e.key === 'Enter' && this.commandInput.value.trim()) { const v = this.commandInput.value.trim(); this.closeCommand(); h.command(v); }
      if (e.key === 'Escape') this.closeCommand();
      e.stopPropagation();
    };
    this.command.append(this.commandInput);
    root.append(this.start, this.busy, this.hud, this.hint, this.card, this.command, this.preview, this.checks, this.toastEl);
  }

  get commandOpen(): boolean { return !this.command.classList.contains('hidden'); }
  get previewOpen(): boolean { return !this.preview.classList.contains('hidden'); }

  showStart(show: boolean): void { this.start.classList.toggle('hidden', !show); }
  setHealth(text: string): void { this.healthLine.textContent = text; }

  setBusy(text: string | null): void {
    this.busy.classList.toggle('hidden', text === null);
    if (text !== null) this.busyText.textContent = text;
    else this.logList.replaceChildren();
  }

  log(line: string): void {
    this.logList.append(el('li', '', line));
  }

  showHud(show: boolean): void { this.hud.classList.toggle('hidden', !show); }

  setHint(text: string | null): void {
    this.hint.classList.toggle('hidden', text === null);
    if (text) this.hint.textContent = text;
  }

  setCard(info: ObjectInfo | null): void {
    this.card.classList.toggle('hidden', info === null);
    if (!info) return;
    const BADGE = { placeholder: 'procedural model', library: 'CC0 library model', online: 'free model found online', generated: 'AI-generated model' } as const;
    const badge = el('span', `badge ${info.source}`, BADGE[info.source]);
    const children: HTMLElement[] = [el('h3', '', info.label), badge];
    if (info.description) children.push(el('p', '', info.description));
    if (info.reasons.length) children.push(el('p', 'why', `Why here: ${info.reasons.join(', ')}`));
    if (info.warnings.length) children.push(el('p', 'warn', `Note: ${info.warnings.join('; ')}`));
    if (info.credit) children.push(el('p', 'why', `Model: ${info.credit}`));
    this.card.replaceChildren(...children);
  }

  openCommand(): void {
    this.command.classList.remove('hidden');
    this.commandInput.value = '';
    setTimeout(() => this.commandInput.focus(), 0);
  }

  closeCommand(): void {
    this.command.classList.add('hidden');
    this.commandInput.blur();
  }

  showPreview(lines: string[], notes: string[]): void {
    const list = el('ul');
    for (const l of lines) list.append(el('li', '', l));
    const children: HTMLElement[] = [el('h3', '', 'Proposed change'), list];
    for (const n of notes) children.push(el('p', 'note', n));
    children.push(el('p', 'keys', 'Enter to apply · Esc to cancel'));
    this.preview.replaceChildren(...children);
    this.preview.classList.remove('hidden');
  }

  hidePreview(): void { this.preview.classList.add('hidden'); }

  setChecks(checks: Check[]): void {
    const list = el('ul');
    for (const c of checks) {
      const li = el('li', c.status, `${c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗'} ${c.label}`);
      li.title = c.detail;
      list.append(li);
    }
    this.checks.replaceChildren(el('h3', '', 'World checks'), list);
  }

  toggleChecks(): void { this.checks.classList.toggle('hidden'); }
  setSource(text: string): void { this.source.textContent = text; }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 4500);
  }

  async typeStart(text: string): Promise<void> {
    this.prompt.value = '';
    for (const ch of text) { this.prompt.value += ch; await wait(18); }
    await wait(400);
  }

  async typeCommand(text: string): Promise<void> {
    this.command.classList.remove('hidden');
    this.commandInput.value = '';
    for (const ch of text) { this.commandInput.value += ch; await wait(45); }
    await wait(500);
    this.closeCommand();
  }
}
```

Append to `web/src/styles.css`:
```css
.hidden { display: none !important; }
button { font: inherit; cursor: pointer; border: 0; border-radius: 10px; padding: 10px 16px; }
.primary { background: #f5c451; color: #1b1405; font-weight: 700; }
.secondary { background: rgba(255,255,255,.12); color: #eef2ff; }
.start { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: radial-gradient(ellipse at top, rgba(30,50,90,.85), rgba(5,8,18,.95)); padding: 16px; }
.start h1 { font-size: clamp(36px, 7vw, 64px); margin: 0; letter-spacing: -1px; }
.tagline { margin: 0; opacity: .8; }
.prompt-input { width: min(720px, 100%); height: 110px; border-radius: 14px; border: 1px solid rgba(255,255,255,.2); background: rgba(0,0,0,.35); color: #fff; padding: 14px; font: 16px/1.4 system-ui; resize: none; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; width: min(720px, 100%); }
.chip { background: rgba(255,255,255,.08); color: #cdd6f4; font-size: 13px; padding: 6px 10px; }
.actions { display: flex; gap: 10px; }
.health { font-size: 12px; opacity: .6; }
.busy { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(5,8,18,.7); gap: 10px; }
.busy-text { font-size: 20px; }
.log { list-style: none; padding: 0; margin: 0; font-size: 13px; opacity: .85; max-width: min(640px, 92vw); text-align: center; }
.hud { position: absolute; inset: 0; pointer-events: none !important; }
.crosshair { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 22px; opacity: .7; }
.help { position: absolute; left: 16px; bottom: 14px; font-size: 12px; opacity: .75; text-shadow: 0 1px 2px #000; }
.source { position: absolute; right: 16px; top: 14px; font-size: 12px; background: rgba(0,0,0,.4); padding: 4px 8px; border-radius: 8px; }
.hint { position: absolute; left: 50%; bottom: 70px; transform: translateX(-50%); background: rgba(0,0,0,.55); padding: 8px 14px; border-radius: 10px; pointer-events: none !important; }
.card { position: absolute; left: 16px; top: 14px; width: min(340px, calc(100vw - 32px)); background: rgba(8,12,24,.72); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 12px 14px; pointer-events: none !important; }
.card h3 { margin: 0 0 6px; } .card p { margin: 6px 0 0; font-size: 13px; } .why { opacity: .85; } .warn { color: #ffcf7a; }
.badge { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,.12); }
.badge.generated { background: #6d4aff; } .badge.library { background: #2f7d5b; } .badge.online { background: #1f6f8b; }
.command { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%); width: min(720px, calc(100vw - 32px)); }
.command-input { width: 100%; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(245,196,81,.6); background: rgba(5,8,18,.85); color: #fff; font-size: 16px; }
.preview { position: absolute; left: 50%; bottom: 90px; transform: translateX(-50%); width: min(560px, calc(100vw - 32px)); background: rgba(8,12,24,.9); border: 1px solid rgba(245,196,81,.5); border-radius: 12px; padding: 12px 16px; }
.preview h3 { margin: 0 0 6px; } .preview ul { margin: 0; padding-left: 18px; } .note { font-size: 13px; opacity: .8; } .keys { font-size: 12px; opacity: .7; }
.checks { position: absolute; right: 16px; top: 48px; width: min(320px, calc(100vw - 32px)); max-height: 60vh; overflow: auto; background: rgba(8,12,24,.85); border-radius: 12px; padding: 10px 14px; font-size: 13px; }
.checks ul { list-style: none; padding: 0; margin: 0; } .checks .pass { color: #8fe3a8; } .checks .warn { color: #ffcf7a; } .checks .fail { color: #ff8a8a; }
.toast { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); background: rgba(8,12,24,.9); padding: 10px 16px; border-radius: 10px; max-width: min(640px, calc(100vw - 32px)); font-size: 14px; }
@media (max-width: 600px) { .help { display: none; } }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (The UI is wired up and checked visually in Task 24.)

- [ ] **Step 3: Commit**

```bash
git add web/src/ui web/src/styles.css
git commit -m "feat(ui): start screen, HUD, command bar, change preview, place card, checks panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 24: Final App (generate, live edits with preview and undo, look-at, cinematic) and boot

**Files:**
- Modify: `web/src/app.ts` (full replacement), `web/src/main.ts` (full replacement)
- Create: `web/src/logic/director.ts` (a stub here; the full version comes in Task 25)

**Interfaces:**
- Consumes: everything above.
- Produces: `class App` adds `ui`, `cinematic: Cinematic | null`, `generate(prompt): Promise<boolean>`, `command(text, lookOverride?): Promise<void>`, `confirm()`, `cancel()`, `undo()`, `interact()`, `editContext(lookOverride?)`. Also `interface Cinematic { x; y; z; radius; height; speed }` and `runDirector(app, ui): Promise<void>`.

- [ ] **Step 1: Replace `web/src/app.ts`**

```ts
import * as THREE from 'three';
import { editWorld, generateWorld } from './api/client';
import type { EditContext, Source } from './api/types';
import { applyOps, describeOps, OpError, type ApplyResult, type Op } from './core/ops';
import { CORE_HALF, type Recipe } from './core/recipe';
import { InteractionSystem } from './logic/interactions';
import { Wildlife } from './logic/wildlife';
import { Physics } from './physics/physics';
import { Player } from './player/player';
import { AssetModelSource } from './render/assetModels';
import { AtmosphereSystem } from './render/atmosphere';
import { ChunkManager } from './render/chunkManager';
import { Engine } from './render/engine';
import { WINDOW_MATERIAL } from './render/placeholders';
import { buildRoadMeshes } from './render/roads';
import { ScatterAssets } from './render/scatterAssets';
import { disposeGroup, WaterSystem } from './render/water';
import { WorldObjects, type ModelSource } from './render/worldObjects';
import type { UI } from './ui/ui';
import { buildWorld, type BuiltWorld } from './world/build';
import { snapshotField } from './world/field';
import type { Placement } from './world/placement';

export interface Cinematic { x: number; y: number; z: number; radius: number; height: number; speed: number }
interface Snapshot { recipe: Recipe; placements: Placement[] }

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const clampCore = (v: number) => Math.max(-CORE_HALF, Math.min(CORE_HALF, Math.round(v * 10) / 10));
const SOURCE_LABEL: Record<Source, string> = { live: 'AI: live', cache: 'AI: cached answer', mock: 'AI: mock mode', offline: 'Offline mode' };

export class App {
  built: BuiltWorld | null = null;
  ui: UI | null = null;
  cinematic: Cinematic | null = null;
  private roads: THREE.Group | null = null;
  private spawnPending: { x: number; y: number; z: number } | null = null;
  private history: Snapshot[] = [];
  private pending: { applied: ApplyResult; ops: Op[] } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private lookTimer = 0;
  private cineAngle = 0;

  private constructor(
    readonly engine: Engine,
    readonly physics: Physics,
    readonly atmosphere: AtmosphereSystem,
    readonly chunks: ChunkManager,
    readonly water: WaterSystem,
    readonly objects: WorldObjects,
    readonly player: Player,
    readonly interactions: InteractionSystem,
    readonly wildlife: Wildlife,
  ) {}

  static async create(canvas: HTMLCanvasElement, models: ModelSource = new AssetModelSource()): Promise<App> {
    const engine = new Engine(canvas);
    const physics = await Physics.create();
    const player = new Player(engine.camera, canvas, physics);
    const objects = new WorldObjects(engine.scene, physics, models);
    const interactions = new InteractionSystem(physics, player);
    objects.onReady.push((root, info) => interactions.register(root, info));
    objects.onCleared.push(() => interactions.clear());
    const app = new App(
      engine, physics, new AtmosphereSystem(engine.scene), new ChunkManager(engine.scene, physics, new ScatterAssets()),
      new WaterSystem(engine.scene), objects, player, interactions, new Wildlife(engine.scene),
    );
    engine.onUpdate((dt, t) => app.frame(dt, t));
    engine.start();
    return app;
  }

  get spawning(): boolean { return this.spawnPending !== null; }

  load(recipe: Recipe, keep: Placement[] = [], respawn = true): BuiltWorld {
    const timeChanged = this.built?.recipe.atmosphere.time !== recipe.atmosphere.time;
    const built = buildWorld(recipe, keep);
    this.built = built;
    this.chunks.setSnapshot(snapshotField(built.field));
    this.atmosphere.apply(recipe.atmosphere, respawn || timeChanged);
    this.water.rebuild(built.field);
    if (this.roads) { this.engine.scene.remove(this.roads); disposeGroup(this.roads); }
    this.roads = buildRoadMeshes(built.field, built.roads);
    this.engine.scene.add(this.roads);
    this.objects.rebuild(built);
    this.wildlife.rebuild(built);
    this.ui?.setChecks(built.checks);
    if (respawn) {
      this.spawnPending = built.spawn;
      this.player.enabled = false;
      this.player.teleport(built.spawn.x, built.spawn.y, built.spawn.z);
    }
    return built;
  }

  async generate(prompt: string): Promise<boolean> {
    const ui = this.ui;
    ui?.setBusy('Imagining your world…');
    const res = await generateWorld(prompt);
    if (res.type === 'unsupported') { ui?.setBusy(null); ui?.toast(res.reason); return false; }
    ui?.setBusy('Shaping terrain, carving rivers, placing everything…');
    await nextFrame();
    const built = this.load(res.recipe);
    for (const line of [...res.notes, ...built.log]) ui?.log(line);
    ui?.setSource(SOURCE_LABEL[res.source]);
    this.history = [];
    while (this.spawning) await nextFrame();
    ui?.setBusy(null);
    ui?.showStart(false);
    ui?.showHud(true);
    return true;
  }

  editContext(lookOverride?: { x: number; z: number }): EditContext {
    const b = this.built!;
    let lookAt: EditContext['lookAt'] = lookOverride ? { x: clampCore(lookOverride.x), z: clampCore(lookOverride.z) } : null;
    let lookingAt: string | null = null;
    if (!lookOverride) {
      const hit = this.pick([...this.objects.pickables(), ...this.chunks.meshes()], 400);
      if (hit) {
        lookAt = { x: clampCore(hit.point.x), z: clampCore(hit.point.z), y: Math.round(hit.point.y * 100) / 100 };
        lookingAt = this.objects.infoFor(hit.object)?.placeId ?? null;
      }
    }
    return {
      player: { x: this.player.position.x, z: this.player.position.z },
      lookAt,
      lookingAt,
      placements: b.placements.map((p) => ({ id: p.id, label: b.recipe.places.find((q) => q.id === p.id)?.label ?? p.id, x: Math.round(p.x), z: Math.round(p.z) })),
    };
  }

  async command(text: string, lookOverride?: { x: number; z: number }): Promise<void> {
    if (!this.built) return;
    const ui = this.ui;
    ui?.setBusy('Thinking…');
    const res = await editWorld(this.built.recipe, text, this.editContext(lookOverride));
    ui?.setBusy(null);
    if (res.type === 'unsupported') { ui?.toast(res.reason); return; }
    try {
      this.pending = { applied: applyOps(this.built.recipe, res.ops), ops: res.ops };
      ui?.showPreview(describeOps(res.ops), res.notes);
    } catch (e) {
      ui?.toast(e instanceof OpError ? e.message : 'That change could not be applied.');
    }
  }

  confirm(): void {
    const p = this.pending, b = this.built;
    if (!p || !b) return;
    this.pending = null;
    this.ui?.hidePreview();
    this.history.push({ recipe: b.recipe, placements: b.placements });
    const a = p.applied;
    if (p.ops.every((o) => o.op === 'setAtmosphere')) {
      const timeChanged = p.ops.some((o) => o.op === 'setAtmosphere' && o.time !== undefined);
      b.recipe = a.recipe;
      this.atmosphere.apply(a.recipe.atmosphere, timeChanged);
      this.ui?.toast('Done');
      return;
    }
    const keep = a.terrainChanged ? [] : b.placements.filter((pl) => !a.changedPlaces.has(pl.id) && !a.removedPlaces.has(pl.id));
    const built = this.load(a.recipe, keep, false);
    const placed = built.placements.filter((pl) => a.changedPlaces.has(pl.id)).map((pl) => `${pl.id}: ${pl.reasons.join(', ')}`);
    this.ui?.toast(placed.length ? `Placed ${placed.join(' · ')}` : 'Done');
  }

  cancel(): void {
    this.pending = null;
    this.ui?.hidePreview();
  }

  undo(): void {
    const prev = this.history.pop();
    if (!prev) { this.ui?.toast('Nothing to undo'); return; }
    this.load(prev.recipe, prev.placements, false);
    this.ui?.toast('Undone');
  }

  interact(): void {
    const item = this.interactions.nearest(this.player.lookRay());
    if (item) this.interactions.use(item);
  }

  private pick(objects: THREE.Object3D[], far: number): THREE.Intersection | null {
    const ray = this.player.lookRay();
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    return this.raycaster.intersectObjects(objects, true)[0] ?? null;
  }

  private frame(dt: number, t: number): void {
    const focus = this.spawnPending ?? this.cinematic ?? this.player.position;
    this.chunks.update(focus.x, focus.z);
    if (this.spawnPending && this.chunks.isReady(this.spawnPending.x, this.spawnPending.z)) {
      const s = this.spawnPending;
      this.player.spawn(s.x, s.y, s.z);
      this.player.enabled = true;
      this.spawnPending = null;
    }
    if (this.cinematic) {
      const c = this.cinematic;
      this.cineAngle += dt * c.speed;
      this.engine.camera.position.set(c.x + Math.cos(this.cineAngle) * c.radius, c.y + c.height, c.z + Math.sin(this.cineAngle) * c.radius);
      this.engine.camera.lookAt(c.x, c.y + 4, c.z);
    } else if (this.built) {
      this.player.update(dt, this.built.field);
    }
    this.physics.step(dt);
    this.atmosphere.update(dt, this.engine.camera.position);
    this.water.update(this.engine.camera.position);
    WINDOW_MATERIAL.emissiveIntensity = this.atmosphere.isNight ? 1.4 : 0;
    this.interactions.update(dt, this.atmosphere.isNight, t);
    if (this.built) this.wildlife.update(dt, t, this.player.position, this.built.field);
    this.lookTimer -= dt;
    if (this.lookTimer <= 0 && this.ui && this.built && !this.cinematic) {
      this.lookTimer = 0.2;
      const item = this.interactions.nearest(this.player.lookRay());
      this.ui.setHint(item ? this.interactions.hint(item) : null);
      const hit = this.pick(this.objects.pickables(), 80);
      this.ui.setCard(hit ? this.objects.infoFor(hit.object) : null);
    }
  }
}
```

- [ ] **Step 2: Director stub (replaced in Task 25)**

`web/src/logic/director.ts`:
```ts
import type { App } from '../app';
import type { UI } from '../ui/ui';

export async function runDirector(app: App, ui: UI): Promise<void> {
  await app.generate('A misty pine valley with a river, a small fishing village on the bank, and an old watchtower on the highest hill');
  ui.toast('Demo mode arrives in the next task.');
}
```

- [ ] **Step 3: Replace `web/src/main.ts`**

```ts
import './styles.css';
import { health } from './api/client';
import { App } from './app';
import { runDirector } from './logic/director';
import { UI } from './ui/ui';

void (async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
  const app = await App.create(canvas);
  const ui = new UI(document.querySelector<HTMLElement>('#ui')!, {
    generate: (prompt) => void app.generate(prompt),
    command: (text) => void app.command(text),
    confirm: () => app.confirm(),
    cancel: () => app.cancel(),
    director: () => void runDirector(app, ui),
  });
  app.ui = ui;
  ui.showStart(true);
  void health().then((h) => ui.setHealth(h ? (h.provider === 'live' ? 'AI online' : 'AI server in mock mode (no API key)') : 'Offline mode: preset worlds and basic edits only'));
  canvas.addEventListener('click', () => {
    if (app.built && !app.spawning && !ui.commandOpen && !ui.previewOpen && !app.cinematic) app.player.controls.lock();
  });
  addEventListener('keydown', (e) => {
    if (!app.built || app.cinematic) return;
    if (ui.previewOpen) {
      if (e.code === 'Enter') app.confirm();
      if (e.code === 'Escape') app.cancel();
      e.preventDefault();
      return;
    }
    if (ui.commandOpen) return;
    if (e.code === 'KeyT') { e.preventDefault(); app.player.controls.unlock(); ui.openCommand(); }
    else if (e.code === 'KeyE') app.interact();
    else if (e.code === 'KeyU') app.undo();
    else if (e.code === 'KeyC') ui.toggleChecks();
  });
  (window as unknown as { app: App }).app = app;
})();
```

- [ ] **Step 4: Verify end to end**

Run the backend (`uvicorn app.main:app --port 8000`, mock or live) and `npm run dev`.
1. The start screen shows. Click a chip, then **Create world**. The busy overlay lists the build log, then you're standing near the village.
2. Look at the tower. A card shows its label, "procedural model" (or the library or AI badge), and **Why here: high ground (…), visible from village**.
3. Press **T** and type "make it night". The preview says "Set time to night". Press Enter: night falls, and windows and lanterns light up.
4. Look at open ground, press **T**, and type "put a lighthouse here". After you press Enter, the lighthouse appears within 2 m of the crosshair, and you can't walk through it.
5. Press **U**. The lighthouse disappears and the world is exactly as before.
6. Press **C**. The checks panel lists a site and reach check for every place.
7. Stop the backend and reload. The start screen says "Offline mode". Creating a world still works, and "make it rain" still works.

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all three pass.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(app): AI world generation, live edits with preview/undo, look-at context, card + hints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 24b: Art pass (pack models everywhere, wind grass, bloom, animated player and animals)

Goal: make the world something people want to explore. Every tree, rock, house, animal and the player come from the CC0 catalogue (Task 19b). Procedural shapes stay only as a fallback. We add wind-swept grass, a glow pass, and a third-person animated character.

**Files:**
- Create: `web/src/render/postfx.ts`, `web/src/render/grass.ts`, `web/src/render/animated.ts`, `web/src/render/artLoader.ts`, `web/src/player/avatar.ts`
- Modify: `web/src/world/chunkData.ts` (grass positions), `web/src/render/chunkWorker.ts`, `web/src/render/chunkManager.ts`, `web/src/render/scatterAssets.ts` (`useModel`), `web/src/render/engine.ts`, `web/src/render/worldObjects.ts` (house variants), `web/src/render/assetModels.ts`, `web/src/api/client.ts`, `web/src/player/player.ts`, `web/src/logic/wildlife.ts`, `web/src/app.ts`, `web/src/main.ts`, `web/src/ui/ui.ts`
- Test: `web/tests/world/chunkData.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 13–24 and the catalogue from Task 19b.
- Produces:
  - `grassChunk(field, cx, cz): Float32Array`, packed as `x, y, z, rotation, scale` per tuft. `ChunkData.grass`.
  - `class GrassSystem { material; build(data): THREE.InstancedMesh; update(t, wind) }`
  - `class PostFX { constructor(renderer, scene, camera); setNight(night); render() }`
  - `interface ModelTemplate { scene; animations; height }`
  - `animatedClone(t): AnimatedModel` with `{ root; mixer; play(name: 'idle'|'walk'|'run'|'jump') }`
  - `ScatterAssets.useModel(kind, object, height)`
  - `loadArt(scatter, wildlife, avatar): Promise<void>`
  - `class Avatar { thirdPerson; use(t); toggle(); update(dt, camera, centre, moving, running) }`
  - `Player.moving`, `Player.running`
  - `Wildlife.useModel(kind: 'deer' | 'rabbit', t)`
  - `resolveAsset(query, kind, allowGenerate, allowOnline = true, variant = 0)`
  - `ModelSource.load(asset, kind, variant?)`

- [ ] **Step 1: Grass positions in chunk data (test first)**

Add to `web/tests/world/chunkData.test.ts`, inside the `describe`:
```ts
  it('packs grass tufts as x,y,z,rot,scale on dry grassy ground, deterministically', () => {
    const field = createField(loadRecipeFixture('fishing-valley'));
    const a = computeChunk(field, 2, 2), b = computeChunk(field, 2, 2);
    expect(a.grass.length % 5).toBe(0);
    expect(Array.from(a.grass)).toEqual(Array.from(b.grass));
    for (let i = 0; i < a.grass.length; i += 5) {
      expect(field.isWater(a.grass[i], a.grass[i + 2])).toBe(false);
      expect(a.grass[i + 1]).toBeCloseTo(field.heightAt(a.grass[i], a.grass[i + 2]), 4);
    }
  });
```
Add the import `import { loadRecipeFixture } from '../fixtures';` if it isn't already there. Run `npx vitest run tests/world/chunkData.test.ts`. Expected: FAIL (`a.grass` is undefined).

In `web/src/world/chunkData.ts`:
- Add the imports `import { hashString, mulberry32 } from '../core/rng';` and `type Biome` to the biome import.
- Add `grass: Float32Array;` to `ChunkData`.
- Add this function:
```ts
const GRASS_BIOMES: ReadonlySet<Biome> = new Set(['grass', 'forest', 'marsh', 'pine']);
const GRASS_CELL = 2;

/** Grass tufts every ~2 m on dry, gentle, grassy ground. Packed as x, y, z, rotation, scale. */
export function grassChunk(field: WorldField, cx: number, cz: number): Float32Array {
  const out: number[] = [];
  const n = CHUNK_SIZE / GRASS_CELL;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gx = cx * n + i, gz = cz * n + j;
    const rng = mulberry32(hashString(`g:${field.recipe.seed}:${gx}:${gz}`));
    const x = gx * GRASS_CELL + rng() * GRASS_CELL, z = gz * GRASS_CELL + rng() * GRASS_CELL;
    if (rng() > 0.7) continue;
    if (field.isWater(x, z) || field.slopeAt(x, z) > 0.7 || field.isReserved(x, z, 0.5)) continue;
    if (!GRASS_BIOMES.has(biomeAt(field, x, z))) continue;
    out.push(x, field.heightAt(x, z), z, rng() * Math.PI * 2, 0.7 + rng() * 0.6);
  }
  return new Float32Array(out);
}
```
- In `computeChunk`'s return, add `grass: grassChunk(field, cx, cz)`.

In `web/src/render/chunkWorker.ts`, add `data.grass.buffer` to the transfer list.
Run the test again. Expected: PASS.

- [ ] **Step 2: Grass system (instanced tufts with wind in the vertex shader)**

`web/src/render/grass.ts`:
```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function blade(angle: number, offset: number): THREE.BufferGeometry {
  const w = 0.07, h = 0.7;
  const pos = [-w, 0, 0, w, 0, 0, -w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, 0, 0, h, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const base = new THREE.Color(0x3f6b2a), tip = new THREE.Color(0x9cc95e), c = new THREE.Color();
  const col: number[] = [];
  for (let i = 0; i < 5; i++) { c.copy(base).lerp(tip, pos[i * 3 + 1] / h); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.rotateY(angle);
  g.translate(Math.cos(angle) * offset, 0, Math.sin(angle) * offset);
  g.computeVertexNormals();
  return g;
}

export class GrassSystem {
  readonly uniforms = { time: { value: 0 }, wind: { value: 0.4 } };
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  private readonly geometry = mergeGeometries([blade(0, 0.05), blade(2.1, 0.08), blade(4.2, 0.06), blade(1.0, 0.12)])!;
  private readonly dummy = new THREE.Object3D();

  constructor() {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.time;
      shader.uniforms.uWind = this.uniforms.wind;
      shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 2.0 + ip.x * 0.15 + ip.z * 0.1) * 0.6 + sin(uTime * 3.7 + ip.x * 0.4) * 0.25;
        float bend = position.y * position.y;
        transformed.x += sway * uWind * bend;
        transformed.z += sway * uWind * 0.5 * bend;`,
      );
    };
  }

  build(data: Float32Array): THREE.InstancedMesh {
    const count = data.length / 5;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    for (let i = 0; i < count; i++) {
      this.dummy.position.set(data[i * 5], data[i * 5 + 1], data[i * 5 + 2]);
      this.dummy.rotation.set(0, data[i * 5 + 3], 0);
      this.dummy.scale.setScalar(data[i * 5 + 4]);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  update(t: number, wind: number): void {
    this.uniforms.time.value = t;
    this.uniforms.wind.value = 0.15 + wind * 0.85;
  }
}
```

- [ ] **Step 3: Chunk manager draws grass on the 3×3 chunks around the player**

In `web/src/render/chunkManager.ts`:
- Import `import type { GrassSystem } from './grass';`
- Add `grassData: Float32Array; grass: THREE.InstancedMesh | null;` to `LiveChunk`.
- Change the constructor to `constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly scatter: ScatterAssets, private readonly grass: GrassSystem)`.
- In `update`, right after the two collider lines inside the loop, add:
```ts
      if (near && !c.grass && c.grassData.length) { c.grass = this.grass.build(c.grassData); this.group.add(c.grass); }
      if (!near && c.grass) { this.group.remove(c.grass); c.grass.dispose(); c.grass = null; }
```
- In `receive`, build the chunk with `grassData: d.grass, grass: null`.
- In `drop`, before deleting, add `if (c.grass) { this.group.remove(c.grass); c.grass.dispose(); }`.

- [ ] **Step 4: Pack models for scatter**

In `web/src/render/scatterAssets.ts`, add the field `private readonly models = new Map<ScatterKind, { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }>();` and this method:
```ts
  /** Replace a procedural kind with a pack model: merged into one geometry (with material groups), scaled to `height`, standing on y = 0. */
  useModel(kind: ScatterKind, object: THREE.Object3D, height: number): void {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const s = size.y > 0 ? height / size.y : 1;
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      g.translate(-centre.x, -box.min.y, -centre.z);
      g.scale(s, s, s);
      geos.push(g);
      mats.push(Array.isArray(o.material) ? o.material[0] : o.material);
    });
    if (geos.length === 0) return;
    const keep = ['position', 'normal', 'uv'].filter((a) => geos.every((g) => g.getAttribute(a)));
    for (const g of geos) for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    const merged = mergeGeometries(geos, true);
    if (merged) this.models.set(kind, { geometry: merged, material: mats.length === 1 ? mats[0] : mats });
  }
```
In `instance()`, replace `new THREE.InstancedMesh(this.geometry(kind), this.material, list.length)` with:
```ts
      const model = this.models.get(kind);
      const mesh = new THREE.InstancedMesh(model?.geometry ?? this.geometry(kind), model?.material ?? this.material, list.length);
```

- [ ] **Step 5: Animated models, avatar and art loader**

`web/src/render/animated.ts`:
```ts
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface ModelTemplate { scene: THREE.Object3D; animations: THREE.AnimationClip[]; height: number }
export type ClipName = 'idle' | 'walk' | 'run' | 'jump';
export interface AnimatedModel { root: THREE.Group; mixer: THREE.AnimationMixer; play(name: ClipName): void }

const CLIPS: Record<ClipName, RegExp> = { idle: /idle|eat|graze/i, walk: /walk/i, run: /run|gallop|sprint/i, jump: /jump/i };

/** Independent copy of a rigged model (own skeleton + mixer), scaled to its template height, feet on y = 0. */
export function animatedClone(t: ModelTemplate): AnimatedModel {
  const model = SkeletonUtils.clone(t.scene);
  model.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.multiplyScalar(size.y > 0 ? t.height / size.y : 1);
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;
  model.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<ClipName, THREE.AnimationAction>();
  for (const [name, re] of Object.entries(CLIPS) as Array<[ClipName, RegExp]>) {
    const clip = t.animations.find((c) => re.test(c.name));
    if (clip) actions.set(name, mixer.clipAction(clip));
  }
  let current: ClipName | null = null;
  const play = (name: ClipName) => {
    if (name === current) return;
    const next = actions.get(name) ?? actions.get('idle');
    if (!next) return;
    if (current) actions.get(current)?.fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    current = name;
  };
  play('idle');
  return { root, mixer, play };
}
```

`web/src/player/avatar.ts`:
```ts
import * as THREE from 'three';
import { animatedClone, type AnimatedModel, type ModelTemplate } from '../render/animated';

const FEET = 0.9; // capsule centre → feet (half-height 0.55 + radius 0.35)

/** Visible animated player. V toggles third person (camera 5 m behind, over the shoulder). */
export class Avatar {
  thirdPerson = false;
  private model: AnimatedModel | null = null;
  private readonly dir = new THREE.Vector3();
  private readonly flat = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {}

  use(t: ModelTemplate): void {
    this.model = animatedClone(t);
    this.model.root.visible = this.thirdPerson;
    this.scene.add(this.model.root);
  }

  toggle(): void {
    this.thirdPerson = !this.thirdPerson;
    if (this.model) this.model.root.visible = this.thirdPerson;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, centre: THREE.Vector3, moving: boolean, running: boolean): void {
    camera.getWorldDirection(this.dir);
    this.flat.set(this.dir.x, 0, this.dir.z).normalize();
    if (this.model) {
      this.model.mixer.update(dt);
      this.model.root.position.set(centre.x, centre.y - FEET, centre.z);
      if (moving) this.model.root.rotation.y = Math.atan2(this.flat.x, this.flat.z);
      this.model.play(moving ? (running ? 'run' : 'walk') : 'idle');
    }
    if (this.thirdPerson) camera.position.set(centre.x - this.flat.x * 5, centre.y + 1.6 - this.dir.y * 3, centre.z - this.flat.z * 5);
  }
}
```

`web/src/render/artLoader.ts`:
```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveAsset } from '../api/client';
import type { Wildlife } from '../logic/wildlife';
import type { Avatar } from '../player/avatar';
import type { ScatterKind } from '../world/scatter';
import type { ModelTemplate } from './animated';
import type { ScatterAssets } from './scatterAssets';

const loader = new GLTFLoader();

/** Library-only (never online or generated): the base look must be consistent and instant. */
async function loadLibrary(query: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null> {
  const res = await resolveAsset(query, 'prop', false, false);
  if (res.status !== 'ready' || !res.url || res.source !== 'library') return null;
  try {
    const g = await loader.loadAsync(res.url);
    return { scene: g.scene, animations: g.animations };
  } catch {
    return null;
  }
}

const SCATTER: Array<[ScatterKind, string, number]> = [
  ['tree', 'tree', 6], ['pine', 'pine tree', 7], ['dead_tree', 'dead tree', 5], ['bush', 'bush', 1.1],
  ['rock', 'rock', 1.2], ['cactus', 'cactus', 2.6], ['reed', 'reed', 1.4],
];

export async function loadArt(scatter: ScatterAssets, wildlife: Wildlife, avatar: Avatar): Promise<void> {
  const template = async (query: string, height: number): Promise<ModelTemplate | null> => {
    const g = await loadLibrary(query);
    return g ? { ...g, height } : null;
  };
  await Promise.all([
    ...SCATTER.map(async ([kind, query, h]) => { const g = await loadLibrary(query); if (g) scatter.useModel(kind, g.scene, h); }),
    template('adventurer character', 1.8).then((t) => { if (t) avatar.use(t); }),
    template('deer', 1.5).then((t) => { if (t) wildlife.useModel('deer', t); }),
    template('rabbit', 0.45).then((t) => { if (t) wildlife.useModel('rabbit', t); }),
  ]);
}
```
Add `import type * as THREE from 'three';` at the top of `artLoader.ts`.

- [ ] **Step 6: Glow pass**

`web/src/render/postfx.ts`:
```ts
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Bloom makes lamps, windows, fires and the lighthouse glow at night; OutputPass applies tone mapping. */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.3, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    addEventListener('resize', () => this.composer.setSize(innerWidth, innerHeight));
  }

  setNight(night: boolean): void {
    this.bloom.strength = night ? 0.9 : 0.25;
  }

  render(): void {
    this.composer.render();
  }
}
```
In `web/src/render/engine.ts`, add the field `postfx: { render(): void } | null = null;` and replace `this.renderer.render(this.scene, this.camera);` in `start()` with `if (this.postfx) this.postfx.render(); else this.renderer.render(this.scene, this.camera);`.

- [ ] **Step 7: Player flags, animal models, house variants, client params**

`web/src/player/player.ts`:
- Add the fields `moving = false;` and `running = false;` next to `seated = false;`.
- Right after the `const speed = …` line, add `this.moving = this.move.lengthSq() > 0; this.running = running && this.moving;`.

`web/src/logic/wildlife.ts`:
- Import `import { animatedClone, type AnimatedModel, type ModelTemplate } from '../render/animated';`.
- Add `anim?: AnimatedModel` to `interface Animal`.
- Add the field `private readonly templates = new Map<'deer' | 'rabbit', ModelTemplate>();` and the method `useModel(kind: 'deer' | 'rabbit', t: ModelTemplate): void { this.templates.set(kind, t); }`.
- In `rebuild`, replace `const mesh = deer ? deerMesh() : rabbitMesh();` with:
```ts
        const template = this.templates.get(deer ? 'deer' : 'rabbit');
        const anim = template ? animatedClone(template) : undefined;
        const mesh = anim?.root ?? (deer ? deerMesh() : rabbitMesh());
```
  and add `anim` to the pushed animal object.
- In `update`, after `a.mesh.rotation.y = a.state.heading;`, add:
```ts
      if (a.anim) { a.anim.mixer.update(dt); a.anim.play(a.state.mode === 'flee' ? 'run' : a.state.mode === 'walk' ? 'walk' : 'idle'); }
```

`web/src/api/client.ts`: change `resolveAsset` to:
```ts
export async function resolveAsset(query: string, kind: PlaceKind, allowGenerate: boolean, allowOnline = true, variant = 0): Promise<AssetResult> {
  try {
    return absolute((await post('/api/assets/resolve', { query, kind, allowGenerate, allowOnline, variant }, 20000)) as unknown as AssetResult);
  } catch {
    return { status: 'none' };
  }
}
```

`web/src/render/assetModels.ts`:
- Change `load(asset, kind)` to `load(asset: string, kind: PlaceKind, variant = 0)`, with cache key `` `${asset.toLowerCase().trim()}#${variant}` ``.
- Pass `variant` to `fetch` and then to `resolveAsset(asset, kind, this.allowGenerate(kind), true, variant)`.

`web/src/render/worldObjects.ts`:
- Add `variant?: number` as the third parameter of `ModelSource.load`, and `variant: number` to `interface Spec`.
- Places get `variant: 0`. Buildings get `variant: Number(b.id.split('-').pop()) || 0`, so `village-house-3` → 3 and every house looks different.
- Call `this.models.load(s.asset, s.kind, s.variant)`.

- [ ] **Step 8: Wire it into the app**

In `web/src/app.ts`:
- Add the imports:
```ts
import { Avatar } from './player/avatar';
import { loadArt } from './render/artLoader';
import { GrassSystem } from './render/grass';
import { PostFX } from './render/postfx';
```
- Append `readonly avatar: Avatar, readonly grass: GrassSystem, readonly postfx: PostFX,` to the constructor parameters (after `wildlife`).
- In `create()`, replace the `const app = new App(...)` statement with:
```ts
    const scatter = new ScatterAssets();
    const grass = new GrassSystem();
    const wildlife = new Wildlife(engine.scene);
    const avatar = new Avatar(engine.scene);
    await Promise.race([loadArt(scatter, wildlife, avatar), new Promise((r) => setTimeout(r, 8000))]);
    const postfx = new PostFX(engine.renderer, engine.scene, engine.camera);
    engine.postfx = postfx;
    const app = new App(
      engine, physics, new AtmosphereSystem(engine.scene), new ChunkManager(engine.scene, physics, scatter, grass),
      new WaterSystem(engine.scene), objects, player, interactions, wildlife, avatar, grass, postfx,
    );
```
- In `frame`, after `this.water.update(this.engine.camera.position);`, add:
```ts
    this.grass.update(t, this.built?.recipe.atmosphere.wind ?? 0.3);
    this.postfx.setNight(this.atmosphere.isNight);
    if (!this.cinematic) this.avatar.update(dt, this.engine.camera, this.player.position, this.player.moving, this.player.running);
```
- Interaction reach grows in third person. In `interact()` and in the `frame` hint code, replace `this.interactions.nearest(this.player.lookRay())` with `this.interactions.nearest(this.player.lookRay(), this.avatar.thirdPerson ? 9 : 4)`.

In `web/src/main.ts`, add `else if (e.code === 'KeyV') app.avatar.toggle();` to the keydown chain. In `web/src/ui/ui.ts`, change the help text to `'WASD move · Shift run · Space jump/swim · E use · T talk to the world · V camera · U undo · C checks'`.

- [ ] **Step 9: Verify the look (the bar for this task)**

Run: `npx vitest run && npx tsc --noEmit`. Expected: PASS.

Browser, with the backend running and the catalogue from Task 19b in place:
1. At eye level in `fishing-valley`: pack trees and rocks (not cones), a meadow of grass swaying in the wind, houses that differ from each other, and water.
2. Press **V**: you see the animated adventurer walking and running.
3. Deer graze and gallop away.
4. Make it night: windows, the lantern and the campfire glow softly (bloom).
5. FPS stays at 45 or above. If not: halve grass density (`rng() > 0.85`), or set `VIEW = 2`.

Take 3 screenshots (valley at dawn, village at night, island beach) and save them to `docs/screenshots/`. They go in the README and the video.

- [ ] **Step 10: Commit**

```bash
git add web/src web/tests docs/screenshots
git commit -m "feat(art): pack models for scatter/houses/animals, wind grass, bloom, animated third-person player

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 25: Director mode (self-running demo)

**Files:**
- Modify: `web/src/logic/director.ts` (full replacement)

**Interfaces:**
- Consumes: `App.generate`, `App.command`, `App.confirm`, `App.cinematic` (Task 24); `UI.typeStart`, `UI.typeCommand`, `UI.toast` (Task 23).
- Produces: `runDirector(app, ui): Promise<void>`

- [ ] **Step 1: Implement**

`web/src/logic/director.ts`:
```ts
import type { App } from '../app';
import type { UI } from '../ui/ui';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PROMPT = 'A misty pine valley with a river, a small fishing village on the bank, and an old stone watchtower on the highest hill. Dawn, light fog, deer in the woods.';

/** A self-running ~60 s demo through the real pipeline: prompt → world → reasons → live edits. */
export async function runDirector(app: App, ui: UI): Promise<void> {
  await ui.typeStart(PROMPT);
  if (!(await app.generate(PROMPT))) return;
  const b = app.built!;
  const village = b.placements.find((p) => p.kind === 'settlement') ?? b.placements[0];
  const tower = b.placements.find((p) => p.kind === 'landmark') ?? village;
  app.cinematic = { x: village.x, y: village.y, z: village.z, radius: village.radius + 35, height: 22, speed: 0.12 };
  ui.toast(`The AI placed the village: ${village.reasons.join(', ')}`);
  await wait(7000);
  app.cinematic = { x: tower.x, y: tower.y, z: tower.z, radius: 45, height: 18, speed: 0.15 };
  ui.toast(`The tower: ${tower.reasons.join(', ')}`);
  await wait(6000);
  const steps: Array<[string, { x: number; z: number } | undefined]> = [
    ['make it night', undefined],
    ['put a lighthouse here', { x: village.x + village.radius + 25, z: village.z }],
    ['make it snow', undefined],
  ];
  app.cinematic = { x: village.x, y: village.y, z: village.z, radius: village.radius + 45, height: 26, speed: 0.1 };
  for (const [text, look] of steps) {
    await ui.typeCommand(text);
    await app.command(text, look);
    await wait(1600);
    app.confirm();
    await wait(5500);
  }
  app.cinematic = null;
  ui.toast('Your turn: click to walk, E to use things, T to talk to the world.');
}
```

- [ ] **Step 2: Verify**

Click **▶ Watch the demo** on the start screen.
Expected:
- The prompt types itself, the world builds, and the camera orbits the village, then the tower, with "why here" toasts.
- "make it night" turns the world to night, "put a lighthouse here" makes a lighthouse appear beside the village, and "make it snow" starts snow.
- Control returns to you at the end.
- It works the same in offline mode.

- [ ] **Step 3: Commit**

```bash
git add web/src/logic/director.ts
git commit -m "feat(demo): self-running director mode through the real pipeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 6: Ship

### Task 26: Performance pass, hero models, deploy

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `web/.env.example`
- Modify: `web/src/render/chunkManager.ts` (`VIEW` by device), `README.md`, `docs/DECISIONS.md`

**Interfaces:**
- Produces: a public frontend URL (Vercel) and backend URL (Render) with `/api/health` green.

- [ ] **Step 1: Performance check and the one tuning knob**

With `npm run build && npm run preview`, open the built app and walk for 60 s in each fixture with DevTools' FPS meter.
- Target: **45 fps or better at 1080p** on a mid-range laptop.
- If you're below target: in `web/src/render/chunkManager.ts` replace `export const VIEW = 3;` with
  ```ts
  export const VIEW = matchMedia('(max-width: 900px)').matches || navigator.hardwareConcurrency <= 4 ? 2 : 3;
  ```
  and in `web/src/render/atmosphere.ts` change `this.sun.shadow.mapSize.set(2048, 2048);` to `set(1024, 1024)`.
- Log the measured fps per fixture in `docs/DECISIONS.md`.

- [ ] **Step 2: Pre-generate hero models (optional, uses Meshy credits)**

With `MESHY_API_KEY` set locally, generate the demo landmarks once and move them into the persistent library. Render's disk is wiped on every deploy, so `assets/generated/` doesn't survive.
```bash
cd backend && source .venv/Scripts/activate
python - <<'EOF'
import time
from app.main import default_assets
from app.schemas import AssetRequest
svc = default_assets()
for q in ["ruined stone watchtower", "white stone lighthouse", "stone castle with towers", "weathered stone obelisk"]:
    r = svc.resolve(AssetRequest(query=q, kind="landmark", allowGenerate=True))
    while r["status"] == "pending":
        time.sleep(5); r = svc.job(r["jobId"])
    print(q, r)
EOF
mkdir -p assets/library/generated-hero && cp assets/generated/*.glb assets/library/generated-hero/
python scripts/build_manifest.py
```
Then edit each `generated-hero/...` entry in `assets/library/manifest.json`: set `"tags"` to the words of its query (for example `["ruined", "stone", "watchtower", "tower"]`) and `"license"` to `"Generated with Meshy (owner's account)"`. Check the result: `du -sh assets/library` should be under 30 MB.

- [ ] **Step 3: Backend container**

`backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/ /app/backend/
COPY shared/ /app/shared/
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

`backend/.dockerignore`:
```
.venv
.cache
__pycache__
assets/generated
tests
.env
```

Test it locally from the repo root:
```bash
docker build -f backend/Dockerfile -t worldseed-api .
docker run --rm -p 8000:8000 -e LLM_API_KEY=$LLM_API_KEY worldseed-api
curl -s localhost:8000/api/health
```

- [ ] **Step 4: Deploy the backend (Render)**

1. Push the repo to GitHub as a **public** repository (the rules require one).
2. In Render, create a New Web Service from the repo:
   - Runtime **Docker**, Dockerfile path `backend/Dockerfile`, Docker build context `.`
   - Health check path `/api/health`
3. Set these env vars:
   - `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_JSON_MODE`
   - `LLM_DAILY_CAP=300`
   - `MESHY_API_KEY` (optional), `MESHY_MAX_GENERATIONS=5`
   - `CORS_ORIGINS=https://<your-vercel-domain>`
4. Free instances sleep when idle. Use a paid instance from Nov 11 to 25 (judging), or keep it warm. The frontend falls back to offline mode either way.

- [ ] **Step 5: Deploy the frontend (Vercel)**

`web/.env.example`:
```
VITE_API_URL=http://localhost:8000
```

In Vercel, add a New Project from the same repo:
- **Root Directory `web`**, framework Vite, build `npm run build`, output `dist`.
- Turn on **"Include files outside the Root Directory in the Build Step"**, which `shared/fixtures` needs.
- Env: `VITE_API_URL=https://<render-service>.onrender.com`.

Then update `CORS_ORIGINS` on Render to the Vercel URL.

- [ ] **Step 6: Verify the deployment**

1. Open the Vercel URL in a private window. The start screen shows "AI online".
2. Create a world from a **new** prompt. The source badge says "AI: live".
3. Run "make it night" and "put a lantern here".
4. On a phone-width window, check that the start screen fits with no horizontal scroll.

- [ ] **Step 7: README + decisions, then commit**

Add to `README.md`:
- **Live demo:** <vercel url> · **API:** <render url>/api/health
- **How AI is used:** the LLM writes a validated world recipe (relations, not coordinates) and live edit operations, and code places everything. Optional Meshy text-to-3D for hero models. The rest are CC0 Kenney/Quaternius models with credits.
- **Architecture** diagram (copy from the spec §4).
- **Controls**, and **Offline mode**.
- **Credits/licenses:** Kenney (CC0), Quaternius (CC0), three.js (MIT), Rapier (Apache-2.0).

Record the deploy URLs and fps numbers in `docs/DECISIONS.md`.
```bash
git add -A
git commit -m "chore: perf tuning, hero models, docker + deploy config, README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 27: Submission package (before 2026-11-11 16:30 CEST)

**Files:**
- Create: `docs/SUBMISSION.md`

- [ ] **Step 1: Write the submission text**

`docs/SUBMISSION.md`:
```markdown
# WorldSeed — Victoria VR AI Builder Hackathon 2026

**Focus category:** Prompt-to-World Creation
**Live demo:** <vercel url>  ·  **Repo:** <github url>  ·  **Video:** <link>

## What we built
Describe a world in plain language, then walk around inside it a few seconds later. WorldSeed builds an endless, walkable 3D world — terrain, rivers, biomes, villages, landmarks, roads, wildlife — and lets you change it by talking to it while you play.

## The problem
Prompt-to-3D tools usually stop at a picture or a small fixed board, and models that write raw coordinates put houses in rivers and on cliffs.

## How AI is used
1. An LLM turns your description into a validated world recipe: *what* exists and *where* in relations ("a fishing village by the river", "a tower on the highest hill, visible from the village") — never raw coordinates.
2. Deterministic code solves those relations on real terrain (1,500 candidate sites per place, hard rules against water, steep slopes and overlaps) and shows *why* each thing is where it is.
3. While you play, the LLM turns "make it night" or "put a lighthouse there" into typed edit operations, using where you are looking. Every change is previewed, applied live, and can be undone.
4. Models come from a tagged CC0 library, with AI text-to-3D (Meshy) for hero landmarks.

## Working logic
Day/night cycle, weather, doors, lamps that light at night, campfires, bells, benches, pushable barrels (physics), wildlife that flees from you, swimming, and checks that every place is on solid ground and reachable.

## Tech
three.js, Rapier, Web Workers, TypeScript, Zod · Python FastAPI, Pydantic · any OpenAI-compatible LLM · Meshy (optional).
```

- [ ] **Step 2: Record the video (under 3:00)**

Script:

| Time | What to show |
|---|---|
| 0:00–0:15 | Hook: "Describe a world. Walk into it." Type a prompt and click Create. |
| 0:15–0:45 | The world builds. Walk through the village and look at the tower: the card shows **why here**. |
| 0:45–1:20 | Use things: open a door, light the campfire, ring the bell, push a barrel. Deer flee. |
| 1:20–2:10 | Talk to the world: "make it night" (windows glow), "put a lighthouse there" (lands at the crosshair), "make it winter" (whole world rebuilds), U to undo. |
| 2:10–2:40 | A second, very different prompt (island or desert) to prove generality. Show the checks panel. |
| 2:40–2:55 | Architecture slide: LLM → recipe → solver → world, offline mode. |

Record at 1080p with OBS. Keep it under 3:00 and upload it as unlisted to YouTube.

- [ ] **Step 3: Final checklist**

- [ ] `cd web && npx vitest run && npx tsc --noEmit && npm run build` passes
- [ ] `cd backend && pytest -q` passes
- [ ] The public repo is visible logged out, and the README links the demo, video and docs
- [ ] The hosted demo works in a fresh private window (live AI) and with the backend down (offline)
- [ ] The backend stays up for judging (paid instance or warm-up)
- [ ] The video is under 3:00
- [ ] The submission form or Kaggle writeup includes the description, focus category, demo URL, repo URL and video URL
- [ ] Submitted before **2026-11-11 16:30 CEST**

- [ ] **Step 4: Commit**

```bash
git add docs/SUBMISSION.md
git commit -m "docs: submission text, video script, final checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Schedule (map tasks to days)

| Day | Date | Tasks |
|---|---|---|
| 1 | Nov 1 | 0, 1, 2, 3, 4 |
| 2 | Nov 2 | 5, 6, 7 |
| 3 | Nov 3 | 8, 9, 10, 11 |
| 4 | Nov 4 | 12, 13 |
| 5 | Nov 5 | 14, 15, 16 |
| 6 | Nov 6 | 17, 18 |
| 7 | Nov 7 | 19, 19b (download packs, house prefabs), 20 |
| 8 | Nov 8 | 21, 22, 23, 24 |
| 9 | Nov 9 | 24b (art pass), 25, 26 |
| 10 | Nov 10 | 27, buffer, polish |
| — | Nov 11 | Submit before 16:30 CEST |

Start the downloads for Task 19b early (any day), because they are manual and the art pass depends on them.

**If time runs out, cut in this order:** wildlife birds → Sketchfab finder → Meshy hero models → director mode → rabbits. **Never cut:** walkable terrain, recipe → placement with reasons, live edits with undo, interactions, offline fallback, **pack models + grass + bloom (Tasks 19b and 24b)**.

## Execution handoff

Run this plan task by task with **superpowers:subagent-driven-development** (a fresh subagent per task, with review between tasks), or inline with **superpowers:executing-plans**. Tasks 17–19 (backend) don't depend on Tasks 12–16 (rendering), so they can run in parallel with them.
