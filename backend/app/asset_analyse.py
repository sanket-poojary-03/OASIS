"""One small LLM call that reads a request before any search: what to look for, under which other names, in which colour."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from .asset_match import cheap_llm
from .llm import extract_json

log = logging.getLogger(__name__)

HEX = re.compile(r"^#[0-9a-f]{6}$")
MAX_ALTERNATIVES = 3


@dataclass
class Analysis:
    search: str
    alternatives: list[str] = field(default_factory=list)
    plain_shape: bool = False
    color: str | None = None


SYSTEM = (
    "A game looks for a free low-poly 3D model for a request. Read the request and reply with JSON only:\n"
    '{"search": "...", "plainShape": false, "color": null, "alternatives": ["...", "...", "..."]}\n'
    '- search: the object itself in 1-3 words, without colour, material or size ("white stone lighthouse with a red roof" -> "lighthouse").\n'
    '- plainShape: true only when the request is a bare geometric shape and nothing else: a cube, a ball, a sphere, a pyramid, a '
    'cone, a cylinder, a ring. A dice, a crate or a football is a real object: false.\n'
    '- color: "#rrggbb" only when the whole object is one colour ("red lighthouse" -> a red; "white lighthouse with a red roof" -> null). Otherwise null.\n'
    '- alternatives: 3 other short searches (1-3 words) for the SAME thing, most likely to exist first: a more common name, a close kind '
    'of thing, then a plainer description ("lighthouse" -> "coastal lighthouse", "beacon tower", "lighthouse building"). No colours. '
    "Never a different object or a part of it."
)


class RequestAnalyser:
    uses_llm = True

    def __init__(self, llm):
        self.llm = cheap_llm(llm)

    def __call__(self, query: str) -> Analysis:
        try:
            data = extract_json(self.llm.complete(SYSTEM, f"Request: {query}"))
        except Exception as e:  # noqa: BLE001 - without an answer, the request is searched as written
            log.warning("request analysis failed for %r (%s: %s)", query, type(e).__name__, e)
            return Analysis(search=query)
        search = str(data.get("search") or query).strip().lower()[:60] or query
        color = str(data.get("color") or "").strip().lower()
        alts: list[str] = []
        raw = data.get("alternatives")
        for a in raw if isinstance(raw, list) else []:
            a = str(a).strip().lower()[:60]
            if len(a) >= 2 and a != search and a not in alts:
                alts.append(a)
        return Analysis(search=search, alternatives=alts[:MAX_ALTERNATIVES], plain_shape=data.get("plainShape") is True, color=color if HEX.match(color) else None)
