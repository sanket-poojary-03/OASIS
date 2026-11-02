import json
import httpx
import pytest
from app.llm import LLMClient, LLMError, extract_json


def test_extract_json_variants():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Sure! {"a": {"b": 2}} hope it helps') == {"a": {"b": 2}}
    with pytest.raises(ValueError):
        extract_json("no json here")
    with pytest.raises(ValueError):
        extract_json("[1, 2]")


def test_client_posts_openai_compatible_request():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    client = LLMClient("https://example.test/v1/", "k123", "m1", transport=httpx.MockTransport(handler))
    assert client.complete("sys", "hi") == '{"ok": true}'
    assert seen["auth"] == "Bearer k123"
    assert seen["body"]["model"] == "m1"
    assert seen["body"]["messages"][0] == {"role": "system", "content": "sys"}


def test_client_wraps_http_errors():
    client = LLMClient("https://example.test/v1", "k", "m", transport=httpx.MockTransport(lambda r: httpx.Response(500)), sleep=lambda s: None)
    with pytest.raises(LLMError):
        client.complete("s", "u")


def test_client_joins_list_shaped_content():
    parts = [{"type": "text", "text": '{"a": '}, {"type": "text", "text": "1}"}]
    client = LLMClient("https://x.test/v1", "k", "m", transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"choices": [{"message": {"content": parts}}]})))
    assert extract_json(client.complete("s", "u")) == {"a": 1}


def test_client_rejects_odd_content_as_llm_error():
    client = LLMClient("https://x.test/v1", "k", "m", transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"choices": [{"message": {"content": 5}}]})))
    with pytest.raises(LLMError):
        client.complete("s", "u")


def _reply(text: str = '{"ok": true}') -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})


def test_busy_model_is_retried_then_succeeds():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content)["model"])
        return httpx.Response(429, json={"error": "busy"}) if len(calls) == 1 else _reply()

    client = LLMClient("https://x.test/v1", "k", "m1", transport=httpx.MockTransport(handler), sleep=lambda s: None)
    assert client.complete("sys", "hi") == '{"ok": true}'
    assert calls == ["m1", "m1"]


def test_busy_model_falls_back_to_backup_model():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        model = json.loads(request.content)["model"]
        calls.append(model)
        return httpx.Response(503) if model == "m1" else _reply()

    client = LLMClient("https://x.test/v1", "k", "m1", fallback_models=["m2"], transport=httpx.MockTransport(handler), sleep=lambda s: None)
    assert client.complete("sys", "hi") == '{"ok": true}'
    assert calls[-1] == "m2" and calls.count("m1") >= 2


def test_bad_request_is_not_retried():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(400)

    client = LLMClient("https://x.test/v1", "k", "m1", fallback_models=["m2"], transport=httpx.MockTransport(handler), sleep=lambda s: None)
    with pytest.raises(LLMError):
        client.complete("sys", "hi")
    assert len(calls) == 1


def test_fallback_models_from_env(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setenv("LLM_FALLBACK_MODELS", " a/b , ,c/d ")
    assert LLMClient.from_env().fallback_models == ["a/b", "c/d"]


def test_requests_cap_the_answer_length(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return _reply()

    monkeypatch.delenv("LLM_MAX_TOKENS", raising=False)
    LLMClient("https://x.test/v1", "k", "m1", transport=httpx.MockTransport(handler)).complete("s", "u")
    assert seen["body"]["max_tokens"] == 8000
    LLMClient("https://x.test/v1", "k", "m1", transport=httpx.MockTransport(handler), max_tokens=200).complete("s", "u")
    assert seen["body"]["max_tokens"] == 200


def test_prefer_backup_tries_the_backup_model_first():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content)["model"])
        return _reply()

    client = LLMClient("https://x.test/v1", "k", "m1", fallback_models=["m2"], transport=httpx.MockTransport(handler), sleep=lambda s: None)
    client.complete("s", "u", prefer_backup=True)
    assert calls == ["m2"]


def test_reasoning_effort_is_sent_only_when_set(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return _reply()

    monkeypatch.delenv("LLM_REASONING_EFFORT", raising=False)
    LLMClient("https://x.test/v1", "k", "m1", transport=httpx.MockTransport(handler)).complete("s", "u")
    assert "reasoning_effort" not in seen["body"]
    monkeypatch.setenv("LLM_REASONING_EFFORT", "low")
    LLMClient("https://x.test/v1", "k", "m1", transport=httpx.MockTransport(handler)).complete("s", "u")
    assert seen["body"]["reasoning_effort"] == "low"


def test_defaults_point_at_sarvam(monkeypatch):
    for k in ("LLM_BASE_URL", "LLM_MODEL", "LLM_FALLBACK_MODELS"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LLM_API_KEY", "k")
    c = LLMClient.from_env()
    assert c.base_url == "https://api.sarvam.ai/v1" and c.model == "sarvam-105b-conversations" and c.fallback_models == ["sarvam-105b"]
