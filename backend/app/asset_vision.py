"""Looks at candidates' thumbnails: titles cannot tell a lamp in a wire cube from a cube. The model proposes, code decides."""
from __future__ import annotations

import base64
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import httpx

from .asset_match import cheap_llm
from .asset_sources import Candidate
from .llm import extract_json

log = logging.getLogger(__name__)

MAX_IMAGES = 8
MAX_THUMBNAIL = 512 * 1024
VERDICTS = {"exact", "right_object_wrong_colour", "no"}

PROMPT = (
    'A 3D game needs this: "{request}". Below are {n} candidate models, images numbered from 0 in order. Judge only what the images show.\n'
    "First write down what each image literally shows, in a few words. Then ask: would someone who sees only this image, with no title, "
    "call it the requested thing? If they would use another word for it, it is not. Be strict: showing nothing is better than showing the wrong thing.\n"
    '- "exact": it IS the requested thing and looks like the request.\n'
    '- "right_object_wrong_colour": it IS the requested thing, but its colour or material differs.\n'
    '- "no": anything else. A related thing, a part of it, or something that merely shares a shape is "no": a manhole cover is not a '
    "transit entrance, a lamp in a cube frame is not a cube, a wall is not a lighthouse.\n"
    'Reply with JSON only: {{"seen": ["..."], "verdicts": ["..."], "best": n}}. One verdict per image. best is the best usable image, or -1 when all are "no".'
)


@dataclass
class Verdict:
    """Approved candidates, best first: (index in the list given, its colour or material differs from the request)."""
    order: list[tuple[int, bool]]


def image_type(data: bytes) -> str | None:
    """From the bytes: the image host labels some of its WebP files binary/octet-stream, which the model's API refuses."""
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return None


class VisionPicker:
    uses_llm = True

    def __init__(self, llm, transport: httpx.BaseTransport | None = None):
        self.llm = cheap_llm(llm, 12.0)
        self.transport = transport

    def _image(self, url: str | None) -> str | None:
        if not url or not url.startswith("https://"):
            return None
        try:
            with httpx.Client(timeout=5, transport=self.transport, follow_redirects=True) as c:
                r = c.get(url)
                r.raise_for_status()
        except httpx.HTTPError as e:
            log.info("thumbnail %s not fetched: %s", url, e)
            return None
        kind = image_type(r.content)
        if not kind or len(r.content) > MAX_THUMBNAIL:
            return None
        return f"data:{kind};base64,{base64.b64encode(r.content).decode()}"

    def __call__(self, request: str, cands: list[Candidate]) -> Verdict | None:
        """None when it cannot say (no images, no usable answer): the caller falls back to titles."""
        cands = cands[:MAX_IMAGES]
        with ThreadPoolExecutor(MAX_IMAGES) as pool:
            images = list(pool.map(self._image, [c.thumbnail for c in cands]))
        shown = [(i, url) for i, url in enumerate(images) if url]
        if not shown:
            return None
        parts: list[dict] = [{"type": "text", "text": PROMPT.format(request=request, n=len(shown))}]
        parts += [{"type": "image_url", "image_url": {"url": url}} for _, url in shown]
        try:
            data = extract_json(self.llm.complete("You judge 3D model thumbnails for a game. Reply with JSON only.", parts))
            verdicts = data["verdicts"]
            best = int(data.get("best", -1))
        except Exception as e:  # noqa: BLE001 - an unusable answer means "cannot say"
            log.warning("vision check failed for %r (%s: %s)", request, type(e).__name__, e)
            return None
        if not isinstance(verdicts, list) or len(verdicts) != len(shown) or not all(v in VERDICTS for v in verdicts):
            log.warning("vision check for %r gave an unusable verdict list", request)
            return None
        usable = [k for k, v in enumerate(verdicts) if v != "no"]
        # The model's best first when it is usable; then exact matches before recolourable ones.
        usable.sort(key=lambda k: (k != best, verdicts[k] != "exact", k))
        return Verdict([(shown[k][0], verdicts[k] != "exact") for k in usable])
