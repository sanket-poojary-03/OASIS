"""The last resort for a model: the AI describes simple parts as data (never code), code validates them and the browser builds them."""
from __future__ import annotations

import logging
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .asset_match import cheap_llm
from .llm import extract_json

log = logging.getLogger(__name__)

# Mirrors web/src/render/proceduralModel.ts; shared/fixtures/assets/ is the contract.
MAX_PARTS = 24
Position = Annotated[float, Field(ge=-30, le=30)]
Length = Annotated[float, Field(gt=0, le=30)]
Angle = Annotated[float, Field(ge=-6.3, le=6.3)]


class Part(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shape: Literal["box", "sphere", "cylinder", "cone", "pyramid", "ring"]
    at: tuple[Position, Position, Position]
    size: tuple[Length, Length, Length]
    color: Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
    rotate: tuple[Angle, Angle, Angle] | None = None


class ProceduralModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parts: Annotated[list[Part], Field(min_length=1, max_length=MAX_PARTS)]


SYSTEM = (
    "Design a simple low-poly 3D object for a game out of basic shapes. It stands in an open world and is seen from outside, so it must be "
    "recognisable by its silhouette and colours. Reply with JSON only:\n"
    '{"parts": [{"shape": "box", "at": [x, y, z], "size": [w, h, d], "color": "#rrggbb", "rotate": [rx, ry, rz]}]}\n'
    f"- shape: box, sphere, cylinder, cone, pyramid or ring. 1 to {MAX_PARTS} parts: as few as the thing needs.\n"
    "- A bare shape is exactly 1 part in its true proportions: a cube or a ball has the same width, height and depth, like [2, 2, 2].\n"
    "- Metres, y is up, the ground is y = 0, and the object stands centred on x = 0, z = 0.\n"
    "- at is the CENTRE of the part, so a part resting on the ground has y = half its height. Parts must touch: nothing floats unless the thing floats.\n"
    "- size is its width, height and depth. rotate is optional, in radians.\n"
    "- Use natural, varied colours for each part, unless a colour for the whole object is given."
)


class PartsDesigner:
    uses_llm = True

    def __init__(self, llm):
        self.llm = cheap_llm(llm, 25.0, 3000)

    def __call__(self, query: str, color: str | None = None) -> list[dict]:
        """Validated parts. Raises ValueError after a second unusable answer."""
        user = f"Object: {query}" + (f"\nThe whole object is this colour: {color}" if color else "")
        last: Exception | None = None
        for _ in range(2):
            try:
                model = ProceduralModel.model_validate(extract_json(self.llm.complete(SYSTEM, user)))
                return [p.model_dump(exclude_none=True, mode="json") for p in model.parts]
            except (ValidationError, ValueError, TypeError) as e:
                last = e
            except Exception as e:  # noqa: BLE001 - a busy AI is the same outcome: no design
                log.warning("design of %r failed (%s: %s)", query, type(e).__name__, e)
                last = e
        raise ValueError(f"no usable design for {query!r}: {last}")
