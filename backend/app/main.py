from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .cache import FileCache
from .llm import LLMClient
from .ratelimit import RateLimiter
from .schemas import EditRequest, WorldRequest
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

    @app.post("/api/edit")
    def post_edit(req: EditRequest, request: Request) -> dict:
        guard(request)
        return world.edit(req)

    return app


load_dotenv(BACKEND_DIR / ".env")
app = create_app(LLMClient.from_env())
