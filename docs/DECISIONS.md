# Decisions

## 2026-11-01
- The LLM writes a validated recipe of relations, never coordinates or code (competitors that let the LLM write coordinates suffer overlaps and objects in water).
- Terrain and placement run in the browser (real-time streaming); AI and model work run in Python.
- Endless chunked noise terrain plus a 1024 m authored core.

## 2026-11-02
- Pin zod to v3: npm resolved zod 4, whose API differs (ZodError.errors → .issues, z.record needs key and value schemas); the plan's schemas are written for zod 3. TypeScript 7, vite 8 and vitest 5 are kept as installed.
- Task 12 (M18, three r187): engine uses `THREE.Timer` (update() then getDelta/getElapsed) instead of deprecated `THREE.Clock`, and `THREE.PCFShadowMap` instead of removed `PCFSoftShadowMap`, keeping the console clean.
- Ops contract test asserts each fixture's exact op-type sequence and that `dump_ops` output has no nulls and re-validates, instead of the vacuous `len(ops) >= 1` (OpsList already enforces min_length=1).
