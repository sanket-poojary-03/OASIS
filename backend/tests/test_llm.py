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
    client = LLMClient("https://example.test/v1", "k", "m", transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    with pytest.raises(LLMError):
        client.complete("s", "u")
