from __future__ import annotations

import json
import os
import logging
import re

import httpx


log = logging.getLogger(__name__)


class LLMError(Exception):
    pass


FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def extract_json(text: str) -> dict:
    m = FENCE.search(text)
    candidate = m.group(1) if m else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the answer")
    data = json.loads(candidate[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("answer is not a JSON object")
    return data


class LLMClient:
    """Any OpenAI-compatible /chat/completions endpoint (OpenRouter, Gemini, DeepSeek, ...)."""

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 45.0, transport: httpx.BaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.transport = transport

    @classmethod
    def from_env(cls) -> "LLMClient | None":
        key = os.getenv("LLM_API_KEY", "").strip()
        if not key:
            return None
        return cls(os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1"), key, os.getenv("LLM_MODEL", "google/gemini-2.5-flash-lite"))

    def complete(self, system: str, user: str) -> str:
        body: dict = {
            "model": self.model,
            "temperature": 0.4,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if os.getenv("LLM_JSON_MODE", "1") == "1":
            body["response_format"] = {"type": "json_object"}
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                r = client.post(f"{self.base_url}/chat/completions", json=body, headers={"Authorization": f"Bearer {self.api_key}"})
                r.raise_for_status()
                content = r.json()["choices"][0]["message"]["content"] or ""
                if isinstance(content, list):
                    content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
                if not isinstance(content, str):
                    raise TypeError("unexpected content type")
                return content
        except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError, AttributeError) as e:
            log.warning("LLM call failed: %s", e)
            raise LLMError(str(e)) from e
