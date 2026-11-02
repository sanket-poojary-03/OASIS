from fastapi.testclient import TestClient
from app.main import create_app
from app.ratelimit import RateLimiter


def test_health_and_world(tmp_path):
    client = TestClient(create_app(llm=None, cache_dir=tmp_path))
    assert client.get("/api/health").json() == {"ok": True, "provider": "mock"}  # no null model (m5)
    r = client.post("/api/world", json={"prompt": "a tropical island"})
    assert r.status_code == 200 and r.json()["recipe"]["terrain"]["shape"] == "island"


def test_validation_and_rate_limit(tmp_path):
    client = TestClient(create_app(llm=None, cache_dir=tmp_path, limiter=RateLimiter(per_ip=1)))
    assert client.post("/api/world", json={"prompt": "x"}).status_code == 422
    assert client.post("/api/world", json={"prompt": "valley"}).status_code == 200
    assert client.post("/api/world", json={"prompt": "valley"}).status_code == 429
