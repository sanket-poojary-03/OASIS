# Decisions

## 2026-11-01
- The LLM writes a validated recipe of relations, never coordinates or code (competitors that let the LLM write coordinates suffer overlaps and objects in water).
- Terrain and placement run in the browser (real-time streaming); AI and model work run in Python.
- Endless chunked noise terrain plus a 1024 m authored core.

## 2026-11-02
- Pin zod to v3: npm resolved zod 4, whose API differs (ZodError.errors → .issues, z.record needs key and value schemas); the plan's schemas are written for zod 3. TypeScript 7, vite 8 and vitest 5 are kept as installed.
- Ops contract test asserts each fixture's exact op-type sequence and that `dump_ops` output has no nulls and re-validates, instead of the vacuous `len(ops) >= 1` (OpsList already enforces min_length=1).
- Task 17 robustness: `_notes` accepts only a list of strings; corrupt cache entries count as misses and `FileCache.put` writes atomically (temp file + `os.replace`); LLM list-shaped message content is joined and odd types raise `LLMError`; the retry loop also catches `TypeError`; failures and the mock fallback are logged at WARNING (never the key). `httpx2` added to requirements.txt to silence the Starlette TestClient deprecation without filters.
- Task 18 (I6): the mock edit parser supports spec section 7. `bring` is an add verb; "near/next to/beside/by this|that|it" is stripped from the asset and, when `lookingAt` is set, gives `where: [near(lookingAt, 30), flat]`; "on this|that|it|top of ..." is stripped and sets `at.y` only then and only for props, so "put a barrel here" never copies a wall-hit y; `candle` counts as a light. EDIT_TEMPLATE gained a near-this rule. Task 22 mirrors these constants.
- Task 18 (M8): `WorldService.generate` and `.edit` share a private `_ask(system, user, validate)` helper that keeps Task 17's catch list, WARNING logs and mock fallback; only recipe results are cached.
- Task 18 (M11): `mock_edit` output is built through `dump_ops(ops_adapter.validate_python(...))`, so mock ops obey the same no-null, schema-valid contract as live ops.
- Task 18 (I7): service/main/mock import edits only added names; all existing imports kept.
- Task 19 (I7): main.py/schemas.py edits were targeted additions (new imports, `assets` kwarg, two routes); all existing imports and behaviour kept.
- Task 19 (I4): `AssetLibrary.search` ranks by (query coverage, Jaccard) and requires the query's head noun (last token before with/on/of/near/..., via `head_noun`) among an entry's tags, so "pine tree" gives the pine, "dead tree" the dead tree, and "campfire with stones" never a well. Returned score stays the coverage.
- Task 19 (I5): `default_pick` ranks by title Jaccard, then shorter title, and returns -1 on zero overlap; the test now asserts the exact "Candle" wins (`== 1`).
- Task 19 (M19): `license_ok` also rejects ShareAlike (`sharealike`, `by-sa`, `BY SA`), on top of NC/ND; only CC0 and CC-BY pass.
- Task 19 (M20): `/api/assets/resolve` calls `guard()` like the AI routes (library hits share the per-IP and daily budget, so large villages may need a higher `LLM_DAILY_CAP`); Meshy generation is server-enforced for `kind == "landmark"` only, whatever `allowGenerate` says.
- Task 19: Poly Pizza and Sketchfab response field names follow the plan and are unverified against the live APIs (tested with `httpx.MockTransport` only); `_first(...)` accepts several spellings. Live check (plan Step 6) is pending a key.
