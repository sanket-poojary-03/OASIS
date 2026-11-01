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
