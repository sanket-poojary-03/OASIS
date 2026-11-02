from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .assets import AssetLibrary, AssetService, LLMPicker, MeshyClient, ModelCache, PolyPizzaFinder, SketchfabFinder, default_pick
from .cache import FileCache
from .clientip import client_ip as forwarded_client
from .llm import LLMClient
from .ratelimit import RateLimiter
from .schemas import AssetRequest, EditRequest, WorldRequest
from .service import AIUnavailable, WorldService

BACKEND_DIR = Path(__file__).resolve().parents[1]


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


def cors_origins(raw: str | None) -> list[str]:
    """CORS_ORIGINS split on commas, entries stripped and empties dropped (m6); unset or empty means "*"."""
    origins = [o.strip() for o in (raw if raw is not None else "*").split(",") if o.strip()]
    return origins or ["*"]


def create_app(llm=None, cache_dir: Path | None = None, limiter: RateLimiter | None = None, assets: AssetService | None = None,
               asset_limiter: RateLimiter | None = None, pick_limiter: RateLimiter | None = None) -> FastAPI:
    app = FastAPI(title="WorldSeed API")
    app.add_middleware(CORSMiddleware, allow_origins=cors_origins(os.getenv("CORS_ORIGINS")), allow_methods=["*"], allow_headers=["*"])
    cache_root = cache_dir or BACKEND_DIR / ".cache"
    world = WorldService(llm, FileCache(cache_root / "llm"))
    limiter = limiter or RateLimiter(daily_cap=int(os.getenv("LLM_DAILY_CAP", "300")))
    # Separate budget for the external asset path (library/cache hits are free and never counted).
    asset_limiter = asset_limiter or RateLimiter(per_ip=60, window=600, daily_cap=int(os.getenv("ASSET_DAILY_CAP", "500")))
    # Its own small budget for LLM model picks (I4): a pick never spends the player's world/edit allowance.
    pick_limiter = pick_limiter or RateLimiter(per_ip=20, window=600, daily_cap=int(os.getenv("ASSET_PICK_DAILY_CAP", "200")))
    assets = assets or default_assets(llm)
    assets.library.root.mkdir(parents=True, exist_ok=True)
    app.mount("/files/library", StaticFiles(directory=str(assets.library.root)), name="library")
    app.mount("/files/generated", StaticFiles(directory=str(assets.cache.root)), name="generated")

    def client_ip(request: Request) -> str:
        return forwarded_client(request.headers.get("x-forwarded-for"), request.client.host if request.client else None)

    def guard(request: Request) -> None:
        msg = limiter.check(client_ip(request))
        if msg:
            raise HTTPException(status_code=429, detail=msg)

    @app.get("/api/health")
    def health() -> dict:
        out = {"ok": True, "provider": "live" if llm else "mock"}
        if model := getattr(llm, "model", None):
            out["model"] = model  # omitted in mock mode: no nulls reach the browser (m5)
        return out

    @app.post("/api/world")
    def post_world(req: WorldRequest, request: Request) -> dict:
        guard(request)
        try:
            return world.generate(req.prompt)
        except AIUnavailable as e:
            raise HTTPException(status_code=503, detail=str(e)) from e

    @app.post("/api/edit")
    def post_edit(req: EditRequest, request: Request) -> dict:
        guard(request)
        try:
            return world.edit(req)
        except AIUnavailable as e:
            raise HTTPException(status_code=503, detail=str(e)) from e

    @app.post("/api/assets/resolve")
    def post_resolve(req: AssetRequest, request: Request) -> dict:
        ip = client_ip(request)
        return assets.resolve(req, gate=lambda: asset_limiter.check(ip) is None, pick_gate=lambda: pick_limiter.check(ip) is None)

    @app.get("/api/assets/jobs/{job_id}")
    def get_job(job_id: str) -> dict:
        return assets.job(job_id)

    return app


load_dotenv(BACKEND_DIR / ".env")
app = create_app(LLMClient.from_env())
