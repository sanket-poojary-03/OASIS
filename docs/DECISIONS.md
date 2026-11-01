# Decisions

## 2026-11-01
- The LLM writes a validated recipe of relations, never coordinates or code (competitors that let the LLM write coordinates suffer overlaps and objects in water).
- Terrain and placement run in the browser (real-time streaming); AI and model work run in Python.
- Endless chunked noise terrain plus a 1024 m authored core.

## 2026-11-02
- Pin zod to v3: npm resolved zod 4, whose API differs (ZodError.errors → .issues, z.record needs key and value schemas); the plan's schemas are written for zod 3. TypeScript 7, vite 8 and vitest 5 are kept as installed.
- Ops contract test asserts each fixture's exact op-type sequence and that `dump_ops` output has no nulls and re-validates, instead of the vacuous `len(ops) >= 1` (OpsList already enforces min_length=1).
- Task 17 robustness: `_notes` accepts only a list of strings; corrupt cache entries count as misses and `FileCache.put` writes atomically (temp file + `os.replace`); LLM list-shaped message content is joined and odd types raise `LLMError`; the retry loop also catches `TypeError`; failures and the mock fallback are logged at WARNING (never the key). `httpx2` added to requirements.txt to silence the Starlette TestClient deprecation without filters.
