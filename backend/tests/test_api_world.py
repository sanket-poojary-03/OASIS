from fastapi.testclient import TestClient
from app.main import create_app
from app.ratelimit import RateLimiter


def test_without_an_llm_there_is_no_world_only_the_message(tmp_path):
    client = TestClient(create_app(llm=None))
    assert client.get("/api/health").json() == {"ok": True, "provider": "none"}  # no null model (m5)
    r = client.post("/api/world", json={"prompt": "a tropical island"})
    assert r.status_code == 503 and r.json() == {"detail": "LLM not available."}


def test_validation_and_rate_limit(tmp_path):
    client = TestClient(create_app(llm=None, limiter=RateLimiter(per_ip=1)))
    assert client.post("/api/world", json={"prompt": "x"}).status_code == 422
    assert client.post("/api/world", json={"prompt": "valley"}).status_code == 503
    assert client.post("/api/world", json={"prompt": "valley"}).status_code == 429


def test_ai_failure_is_503_not_a_fake_world(tmp_path):
    from tests.conftest import FakeLLM
    client = TestClient(create_app(llm=FakeLLM("garbage", "garbage")))
    r = client.post("/api/world", json={"prompt": "a quiet island"})
    assert r.status_code == 503 and "AI" in r.json()["detail"]
