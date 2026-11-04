# OASIS: Victoria VR AI Builder Hackathon 2026

**Focus category:** Prompt-to-World Creation
**Live demo:** <vercel url>  ·  **Repo:** <github url>  ·  **Video:** <link>

## What we built
Describe a world in plain language, then walk around inside it a few seconds later. OASIS builds an endless, walkable 3D world (terrain, rivers, biomes, villages, landmarks, roads, wildlife) and lets you change it by typing while you play.

## The problem
Prompt-to-3D tools usually stop at a picture or a small fixed board, and models that write raw coordinates put houses in rivers and on cliffs.

## How AI is used
1. An LLM turns your description into a validated world recipe: *what* exists and *where*, expressed as relations ("a fishing village by the river", "a tower on the highest hill, visible from the village"). It writes coordinates only if you give them. Anything that comes in numbers becomes a group with a layout the AI picks: a city is a street grid with towers rising to the centre, a camp or space colony is a ring, a harbour is a line, an orchard or graveyard is a scatter. Worlds that are not Earth-like get their own colours ("a red planet", "a purple alien sea").
2. Deterministic code solves those relations on real terrain (1,500 candidate sites per place; it rejects water, steep slopes and overlaps, and relaxes the limits only as a last resort) and shows *why* each thing is where it is.
3. While you play, the LLM turns "make it night", "put a lighthouse there", "build a camp of tents by the lake" or "make the sea purple" into typed edit operations, using what you are looking at. Every change is previewed, applied live, and can be undone. The LLM never writes code, and all its output is validated on both server and browser.
4. Any object you ask for goes through a model finder: tagged CC0 library, then cache, then Poly Pizza and Sketchfab (CC0 or CC-BY only, credited in the place card), then Meshy text-to-3D for landmarks only (capped), then a procedural placeholder.

## Working logic
Day/night cycle, weather, doors, lamps that light at night, campfires, bells, seats, pushable props (physics), driveable cars (one parked at every spawn, plus any car, jeep or rover the AI adds), a rocket-booster jetpack, three switchable animated characters, wildlife that flees from you, swimming, and a checks panel that confirms every place is on solid ground and reachable on foot. A self-running demo mode shows the full flow in about a minute.

## Always works
Every world comes from the AI, and there are no preset worlds: with no LLM available the app says so. A fresh answer is generated for every prompt: a busy AI retries, then switches to a backup model, and if that fails too it says so honestly and keeps your world instead of showing a fake one.

## Art and tech
Art is one CC0 family: Quaternius nature, village and animal packs plus a KayKit adventurer, with wind-animated grass, bloom and a third-person animated player. Built with three.js, Rapier, Web Workers, TypeScript, Zod, Vite · Python FastAPI, Pydantic · any OpenAI-compatible LLM (Sarvam `sarvam-105b-conversations` by default, about 2–3 s per world, with `sarvam-105b` as the backup) · Meshy (optional).

---

## For the team (strip before pasting into the form)

### Video script (under 3:00)

| Time | What to show |
|---|---|
| 0:00–0:15 | Hook: "Describe a world. Walk into it." Type a prompt and click Create. |
| 0:15–0:45 | The world builds. Walk through the village and look at the tower: the card shows **why here**. |
| 0:45–1:20 | Use things: open a door, light the campfire, ring the bell, push a barrel. Deer flee. |
| 1:20–2:10 | Talk to the world: "make it night" (windows glow), "put a lighthouse there" (lands at the crosshair), "make it winter" (whole world rebuilds), U to undo. |
| 2:10–2:40 | A second, very different prompt ("a red planet with a research base" or "a neon city") to prove generality: own colours, a grid city or ring colony. "Make the sky orange" recolours it live. Show the checks panel. |
| 2:40–2:55 | Architecture slide: LLM → recipe → solver → world. |

Record at 1080p with OBS, keep it under 3:00, upload as unlisted to YouTube. Recording and form submission are manual.

### Final checklist

- [ ] `cd web && npx vitest run && npx tsc --noEmit && npm run build` passes
- [ ] `cd backend && pytest -q` passes
- [ ] The public repo is visible logged out, and the README links the demo, video and docs
- [ ] The hosted demo works in a fresh private window (live AI), and with the backend down says "LLM not available"
- [ ] The backend stays up for judging (paid instance or warm-up)
- [ ] The video is under 3:00
- [ ] The submission form or Kaggle writeup includes the description, focus category, demo URL, repo URL and video URL
- [ ] Submitted before **2026-11-11 16:30 CEST**
