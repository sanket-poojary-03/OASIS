"""Bring your own key: a player's key, sent per request, is used instead of the server's, and never stored or logged."""
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.llm import LLMClient, LLMError, LLMKeyRejected, USER_KEY, using_key
from app.main import create_app
from app.ratelimit import RateLimiter


def _client(seen: list[str], status: int = 200, content: str = '{"ok": true}') -> LLMClient:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["authorization"])
        return httpx.Response(status, json={"choices": [{"message": {"content": content}}]})

    return LLMClient("https://x.test/v1", "server-key", "m1", transport=httpx.MockTransport(handler), sleep=lambda s: None)


def test_a_players_key_replaces_the_servers_only_inside_its_request():
    seen: list[str] = []
    client = _client(seen)
    with using_key("player-key"):
        client.complete("s", "u")
    client.complete("s", "u")
    assert seen == ["Bearer player-key", "Bearer server-key"]


def test_no_players_key_leaves_the_servers():
    seen: list[str] = []
    with using_key(None):
        _client(seen).complete("s", "u")
    assert seen == ["Bearer server-key"]


def test_the_vision_client_keeps_its_own_key_when_one_is_set(monkeypatch):
    monkeypatch.setenv("VISION_API_KEY", "vision-key")
    seen: list[str] = []
    with using_key("player-key"):
        _client(seen).for_vision().complete("s", "u")
    assert seen == ["Bearer vision-key"]


def test_the_vision_client_uses_the_players_key_when_it_shares_the_servers(monkeypatch):
    monkeypatch.delenv("VISION_API_KEY", raising=False)
    seen: list[str] = []
    with using_key("player-key"):
        _client(seen).for_vision().complete("s", "u")
    assert seen == ["Bearer player-key"]


@pytest.mark.parametrize("status", [401, 403])
def test_a_rejected_players_key_is_named_as_such(status):
    with using_key("player-key"), pytest.raises(LLMKeyRejected):
        _client([], status=status).complete("s", "u")


def test_a_rejected_server_key_is_an_ordinary_failure():
    with pytest.raises(LLMError) as e:
        _client([], status=401).complete("s", "u")
    assert not isinstance(e.value, LLMKeyRejected)


def test_the_players_key_is_never_logged(caplog):
    with caplog.at_level("DEBUG"), using_key("sk_player_secret"):
        with pytest.raises(LLMKeyRejected):
            _client([], status=401).complete("s", "u")
    assert "sk_player_secret" not in caplog.text


# --- the API ---

BRIEF = json.dumps({"brief": "A long enough world brief: a harbour town on a bay, with a lighthouse and fishing boats.", "title": "Bay"})


def test_the_header_reaches_the_llm():
    seen: list[str] = []
    api = TestClient(create_app(llm=_client(seen, content=BRIEF)))
    assert api.post("/api/brief", json={"prompt": "a harbour"}, headers={"X-LLM-Key": "player-key"}).json()["source"] == "live"
    api.post("/api/brief", json={"prompt": "a harbour"})
    assert seen == ["Bearer player-key", "Bearer server-key"]


def test_the_key_does_not_leak_into_the_next_request():
    api = TestClient(create_app(llm=_client([], content=BRIEF)))
    api.post("/api/brief", json={"prompt": "a harbour"}, headers={"X-LLM-Key": "player-key"})
    assert USER_KEY.get() is None


@pytest.mark.parametrize("bad", ["short", "has space inside it", "x" * 301])
def test_a_malformed_key_is_refused_before_any_ai_call(bad):
    seen: list[str] = []
    api = TestClient(create_app(llm=_client(seen, content=BRIEF)))
    r = api.post("/api/brief", json={"prompt": "a harbour"}, headers={"X-LLM-Key": bad})
    assert r.status_code == 400 and "key" in r.json()["detail"].lower()
    assert seen == []


def test_a_rejected_players_key_is_told_to_the_player():
    api = TestClient(create_app(llm=_client([], status=401)))
    r = api.post("/api/world", json={"prompt": "a harbour"}, headers={"X-LLM-Key": "player-key"})
    assert r.status_code == 401 and "your" in r.json()["detail"].lower() and "key" in r.json()["detail"].lower()


def test_a_players_key_is_not_held_to_the_servers_daily_budget():
    api = TestClient(create_app(llm=_client([], content=BRIEF), limiter=RateLimiter(per_ip=100, daily_cap=0)))
    assert api.post("/api/brief", json={"prompt": "a harbour"}).status_code == 429
    assert api.post("/api/brief", json={"prompt": "a harbour"}, headers={"X-LLM-Key": "player-key"}).status_code == 200


def test_a_players_key_is_still_held_to_the_per_ip_limit():
    api = TestClient(create_app(llm=_client([], content=BRIEF), limiter=RateLimiter(per_ip=1)))
    headers = {"X-LLM-Key": "player-key"}
    assert api.post("/api/brief", json={"prompt": "a harbour"}, headers=headers).status_code == 200
    assert api.post("/api/brief", json={"prompt": "a harbour"}, headers=headers).status_code == 429


def test_the_daily_budget_message_asks_to_come_back_and_names_no_hidden_feature():
    # The key field is hidden until after the hackathon (ui.ts BRING_YOUR_OWN_KEY), so the message must not point to it.
    msg = RateLimiter(daily_cap=0).check("a")
    assert "tomorrow" in msg and "key" not in msg and "preset" not in msg


def test_model_lookups_run_with_the_players_key():
    class Recorder:
        def __init__(self):
            self.keys = []

        def resolve(self, req, gate=None, pick_gate=None):
            self.keys.append(USER_KEY.get())
            return {"status": "none"}

    rec = Recorder()
    api = TestClient(create_app(llm=None, assets=_assets_stub(rec)))
    api.post("/api/assets/resolve", json={"query": "a lighthouse"}, headers={"X-LLM-Key": "player-key"})
    api.post("/api/assets/resolve", json={"query": "a lighthouse"})
    assert rec.keys == ["player-key", None]


def _assets_stub(rec):
    """create_app mounts the asset folders; give the recorder a library and cache root it can mount."""
    import tempfile
    from pathlib import Path
    from types import SimpleNamespace

    root = Path(tempfile.mkdtemp())
    rec.library = SimpleNamespace(root=root / "library")
    rec.cache = SimpleNamespace(root=root / "generated")
    (root / "generated").mkdir()
    rec.job = lambda job_id: {"status": "none"}
    return rec
