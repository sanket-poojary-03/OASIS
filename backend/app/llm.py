from __future__ import annotations

import copy
import json
import os
import logging
import re
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Callable, Iterator

import httpx


log = logging.getLogger(__name__)


class LLMError(Exception):
    pass


class LLMKeyRejected(LLMError):
    """The provider refused the player's own key (401/403): theirs to fix, not a busy AI."""


# Bring your own key: a player's key for the current request only. Set per request, never stored or logged.
USER_KEY: ContextVar[str | None] = ContextVar("USER_KEY", default=None)


@contextmanager
def using_key(key: str | None) -> Iterator[None]:
    token = USER_KEY.set(key)
    try:
        yield
    finally:
        USER_KEY.reset(token)


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


# Worth another try: rate limits (shared provider pools), server errors and timeouts. Anything else is final.
RETRYABLE = {408, 429, 500, 502, 503, 504}


class LLMClient:
    """Any OpenAI-compatible /chat/completions endpoint (OpenRouter, Gemini, DeepSeek, ...).

    A busy model is retried with a short wait, then each backup model in turn, before giving up.
    """

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 75.0, transport: httpx.BaseTransport | None = None,
                 fallback_models: list[str] | None = None, retries: int = 2, sleep: Callable[[float], None] = time.sleep,
                 max_tokens: int | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.fallback_models = fallback_models or []
        self.retries = retries
        self.timeout = timeout
        self.transport = transport
        self.sleep = sleep
        # Always cap the answer (OpenRouter reserves its cost up front). 8000 leaves room for a reasoning model's ~2500 thinking tokens.
        self.max_tokens = max_tokens or int(os.getenv("LLM_MAX_TOKENS", "8000"))
        self.reasoning_effort = os.getenv("LLM_REASONING_EFFORT", "").strip()
        # A player's own key (USER_KEY) replaces api_key; off for a client with a key of its own (VISION_API_KEY).
        self.byok = True

    @classmethod
    def from_env(cls) -> "LLMClient | None":
        key = os.getenv("LLM_API_KEY", "").strip()
        if not key:
            return None
        # Default provider: Sarvam (OpenAI-compatible). Any other compatible endpoint works through the same three settings.
        # Measured 2026-11-03: sarvam-105b-conversations answers in 1-4 s; sarvam-105b reasons first (15-85 s) and is the
        # stronger backup for unusable answers.
        backups = [m.strip() for m in os.getenv("LLM_FALLBACK_MODELS", "sarvam-105b").split(",") if m.strip()]
        return cls(os.getenv("LLM_BASE_URL", "https://api.sarvam.ai/v1"), key, os.getenv("LLM_MODEL", "sarvam-105b-conversations"), fallback_models=backups)

    def for_world(self) -> "LLMClient":
        """The client for whole worlds: LLM_WORLD_MODEL (on LLM_WORLD_BASE_URL) when set, with this client's models as its
        backups; otherwise this client. Measured 2026-11-04: glm5.3-flash builds twice the places and props of
        sarvam-105b-conversations with fewer slips, in ~25 s instead of ~6 s; edits and briefs stay on the fast model."""
        model = os.getenv("LLM_WORLD_MODEL", "").strip()
        if not model or model == self.model:
            return self
        c = copy.copy(self)
        c.model = model
        c.base_url = os.getenv("LLM_WORLD_BASE_URL", self.base_url).strip().rstrip("/") or self.base_url
        c.fallback_models = [m for m in [self.model, *self.fallback_models] if m != model]
        c.timeout = max(self.timeout, float(os.getenv("LLM_WORLD_TIMEOUT", "120")))
        return c

    def for_vision(self) -> "LLMClient":
        """The client that looks at thumbnails. Sarvam's own models read no images and its /v1 refuses them, so: an image
        model on /v2 with the same key (measured 2026-11-05). One model, no backups: a failure falls back to titles."""
        c = copy.copy(self)
        c.model = os.getenv("VISION_MODEL", "glm5.3-flash").strip()
        c.base_url = os.getenv("VISION_BASE_URL", "https://api.sarvam.ai/v2").strip().rstrip("/")
        own = os.getenv("VISION_API_KEY", "").strip()
        c.api_key = own or self.api_key
        c.byok = self.byok and not own
        c.fallback_models = []
        c.reasoning_effort = ""
        return c

    def complete(self, system: str, user: str | list[dict], prefer_backup: bool = False) -> str:
        """`prefer_backup`: start with the backup models (a last try after the main model's answers were unusable)."""
        last: Exception | None = None
        backups = [m for m in self.fallback_models if m != self.model]
        for model in [*backups, self.model] if prefer_backup and backups else [self.model, *backups]:
            for attempt in range(self.retries):
                try:
                    started = time.monotonic()
                    answer = self._call(model, system, user)
                    # Which provider really answered: health only says a key is set, and busy models fall back silently.
                    log.info("LLM answered: model=%s at %s in %.1fs%s", model, self.base_url, time.monotonic() - started,
                             " (backup)" if model != self.model else "")
                    return answer
                except httpx.HTTPStatusError as e:
                    if e.response.status_code not in RETRYABLE:
                        log.warning("LLM call failed: %s", e)
                        if e.response.status_code in (401, 403) and self._players_key():
                            raise LLMKeyRejected(str(e)) from e
                        raise LLMError(str(e)) from e
                    last = e
                except httpx.TransportError as e:  # timeouts, refused connections
                    last = e
                except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError, AttributeError) as e:
                    log.warning("LLM call failed: %s", e)
                    raise LLMError(str(e)) from e
                log.warning("LLM %s busy (%s), attempt %d", model, last, attempt + 1)
                if attempt + 1 < self.retries:
                    self.sleep(1.5 * (attempt + 1))
        raise LLMError(f"all AI models busy: {last}")

    def _players_key(self) -> str | None:
        return USER_KEY.get() if self.byok else None

    def _call(self, model: str, system: str, user: str | list[dict]) -> str:
        body: dict = {
            "model": model,
            "temperature": 0.4,
            "max_tokens": self.max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if os.getenv("LLM_JSON_MODE", "1") == "1":
            body["response_format"] = {"type": "json_object"}
        # Reasoning models (Sarvam, OpenAI o-series) spend answer tokens thinking first; "low" keeps a recipe inside max_tokens.
        if self.reasoning_effort:
            body["reasoning_effort"] = self.reasoning_effort
        with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
            key = self._players_key() or self.api_key
            r = client.post(f"{self.base_url}/chat/completions", json=body, headers={"Authorization": f"Bearer {key}"})
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"] or ""
            if isinstance(content, list):
                content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
            if not isinstance(content, str):
                raise TypeError("unexpected content type")
            return content
