// Copies the models the start screen needs into the site, so it never has to wait for the backend.
//   node scripts/bundle_models.mjs <keys.json>      keys.json: ["prop:sheep#0", "structure:farm barn#0", ...]
//   node scripts/bundle_models.mjs                  refreshes the models already in web/src/api/bundledModels.json
// Needs the backend running on port 8000. Run it after changing the menu's world (web/src/ui/showcase.ts), the base art
// (shared/fixtures/art-queries.json) or the library; web/tests/ui/menuFlight.test.ts fails when something is missing.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = join(ROOT, 'web/src/api/bundledModels.json');
const OUT = join(ROOT, 'web/public/models/bundled');
const API = process.env.API ?? 'http://localhost:8000';

const keys = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : Object.keys(JSON.parse(readFileSync(TABLE, 'utf8')));
const table = {};
const files = new Map();
for (const key of [...new Set(keys)].sort()) {
  const [, kind, query, variant] = key.match(/^(\w+):(.*)#(\d+)$/);
  const res = await fetch(`${API}/api/assets/resolve`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, kind, allowGenerate: false, allowOnline: true, variant: Number(variant) }),
  }).then((r) => r.json());
  if (res.status !== 'ready' || !res.url?.startsWith('/files/')) { console.warn(`skipped ${key}: ${res.status} ${res.source ?? ''}`); continue; }
  if (res.source !== 'library' && !res.credit) throw new Error(`${key} has no credit: only credited models may ship`);
  // Library files keep a readable name; a cached find keeps its hash.
  const source = join(ROOT, 'backend/assets', res.url.replace('/files/', ''));
  const name = basename(res.url);
  if (files.has(name) && files.get(name) !== source) throw new Error(`two models named ${name}`);
  files.set(name, source);
  table[key] = { url: `/models/bundled/${name}`, source: res.source, ...(res.credit ? { credit: res.credit } : {}) };
}

if (existsSync(OUT)) for (const f of readdirSync(OUT)) rmSync(join(OUT, f));
mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [name, source] of files) {
  copyFileSync(source, join(OUT, name));
  bytes += readFileSync(source).length;
}
writeFileSync(TABLE, `${JSON.stringify(table, null, 1)}\n`);
console.log(`${Object.keys(table).length} keys, ${files.size} files, ${(bytes / 1e6).toFixed(1)} MB`);
for (const credit of new Set(Object.values(table).flatMap((e) => (e.credit ? [e.credit] : [])))) console.log(`credit: ${credit}`);
