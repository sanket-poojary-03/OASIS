# Decisions

## 2026-11-01
- The LLM writes a validated recipe of relations, never coordinates or code (competitors that let the LLM write coordinates suffer overlaps and objects in water).
- Terrain and placement run in the browser (real-time streaming); AI and model work run in Python.
- Endless chunked noise terrain plus a 1024 m authored core.

## 2026-11-02
- Task 7 (M16): `findSpawn` no longer falls back to `placements[0]`. With no settlement it searches outward from (0, 0) for dry, gentle ground (spec 8.6, "otherwise near the centre"); if the ring around a settlement is all wet or steep it does the same centre search before a last-resort (0, 0). Covered by a fallback test.
- Task 5 fix round 1 (field.ts): pad influence now fades continuously with distance from water (`landWeight`) instead of a boolean switch, removing the terrain step; the lake carve starts at `radius` (not 0.5 radius) so the whole lake disc is below `levelY`; `isWater` now means inside the channel/lake/sea AND `heightAt < waterSurfaceAt`. The river surface stays `baseHeight - 1.5` because the carve is at least 2.3 m deep inside the wet width, so it is always below that surface (a flat-across-channel surface was not needed).
- Task 5 (B1): for `valley` and `canyon`, the river is laid directly along the meandering centreline (`z` from -CORE_HALF+16 to CORE_HALF-16 in 8 m steps, 125 points) instead of `traceRiver`: the plan's start walked off the map in 3 steps and raising `maxClimb` did nothing. Other shapes still use `traceRiver`. Matches spec §8.1.
- Pin zod to v3: npm resolved zod 4, whose API differs (ZodError.errors → .issues, z.record needs key and value schemas); the plan's schemas are written for zod 3. TypeScript 7, vite 8 and vitest 5 are kept as installed.
- Task 12 (M18, three r187): engine uses `THREE.Timer` (update() then getDelta/getElapsed) instead of deprecated `THREE.Clock`, and `THREE.PCFShadowMap` instead of removed `PCFSoftShadowMap`, keeping the console clean.
- Ops contract test asserts each fixture's exact op-type sequence and that `dump_ops` output has no nulls and re-validates, instead of the vacuous `len(ops) >= 1` (OpsList already enforces min_length=1).
- Task 17 robustness: `_notes` accepts only a list of strings; corrupt cache entries count as misses and `FileCache.put` writes atomically (temp file + `os.replace`); LLM list-shaped message content is joined and odd types raise `LLMError`; the retry loop also catches `TypeError`; failures and the mock fallback are logged at WARNING (never the key). `httpx2` added to requirements.txt to silence the Starlette TestClient deprecation without filters.
- Task 18 (I6): the mock edit parser supports spec section 7. `bring` is an add verb; "near/next to/beside/by this|that|it" is stripped from the asset and, when `lookingAt` is set, gives `where: [near(lookingAt, 30), flat]`; "on this|that|it|top of ..." is stripped and sets `at.y` only then and only for props, so "put a barrel here" never copies a wall-hit y; `candle` counts as a light. EDIT_TEMPLATE gained a near-this rule. Task 22 mirrors these constants.
- Task 18 (M8): `WorldService.generate` and `.edit` share a private `_ask(system, user, validate)` helper that keeps Task 17's catch list, WARNING logs and mock fallback; only recipe results are cached.
- Task 18 (M11): `mock_edit` output is built through `dump_ops(ops_adapter.validate_python(...))`, so mock ops obey the same no-null, schema-valid contract as live ops.
- Task 18 (I7): service/main/mock import edits only added names; all existing imports kept.
