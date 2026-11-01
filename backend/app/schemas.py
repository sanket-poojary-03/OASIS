from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "shared" / "fixtures"
CORE_HALF = 512

Id = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_-]{1,31}$")]
Unit = Annotated[float, Field(ge=0, le=1)]
Coord = Annotated[float, Field(ge=-CORE_HALF, le=CORE_HALF)]
Shape = Literal["plains", "hills", "valley", "mountains", "island", "canyon"]
Kind = Literal["settlement", "landmark", "structure", "prop"]
Size = Literal["small", "medium", "large"]
Interaction = Literal["none", "door", "light", "fire", "sound", "sit", "push"]
Time = Literal["dawn", "day", "dusk", "night"]
Weather = Literal["clear", "rain", "snow", "mist", "storm"]
LifeKind = Literal["deer", "birds", "rabbits"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Highest(Strict):
    rel: Literal["highest"]


class Lowest(Strict):
    rel: Literal["lowest"]


class Flat(Strict):
    rel: Literal["flat"]


class ByWater(Strict):
    rel: Literal["by_water"]


class Near(Strict):
    rel: Literal["near"]
    target: Id
    maxDist: Annotated[float, Field(ge=5, le=600)] = 80


class FarFrom(Strict):
    rel: Literal["far_from"]
    target: Id
    minDist: Annotated[float, Field(ge=20, le=800)] = 200


class Direction(Strict):
    rel: Literal["direction"]
    dir: Literal["north", "south", "east", "west"]
    of: Id | None = None


class VisibleFrom(Strict):
    rel: Literal["visible_from"]
    target: Id


class At(Strict):
    rel: Literal["at"]
    x: Coord
    z: Coord
    y: Annotated[float, Field(ge=-200, le=1000)] | None = None  # surface height for props placed "on" something


Relation = Annotated[
    Union[Highest, Lowest, Flat, ByWater, Near, FarFrom, Direction, VisibleFrom, At],
    Field(discriminator="rel"),
]


class Place(Strict):
    id: Id
    kind: Kind
    label: Annotated[str, Field(min_length=1, max_length=60)]
    asset: Annotated[str, Field(min_length=2, max_length=120)]
    style: Annotated[str, Field(max_length=40)] | None = None
    size: Size = "medium"
    interaction: Interaction = "none"
    description: Annotated[str, Field(max_length=280)] | None = None
    where: Annotated[list[Relation], Field(max_length=4)] = []


class Terrain(Strict):
    shape: Shape
    roughness: Unit
    height: Unit
    seaLevel: Unit


class Climate(Strict):
    temperature: Unit
    moisture: Unit


class Water(Strict):
    river: bool
    lake: bool


class Atmosphere(Strict):
    time: Time
    weather: Weather
    fog: Unit
    wind: Unit


class Path_(Strict):
    from_: Id = Field(alias="from")
    to: Id
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Life(Strict):
    kind: LifeKind
    count: Annotated[int, Field(ge=1, le=20)]


class Recipe(Strict):
    version: Literal[1]
    title: Annotated[str, Field(min_length=1, max_length=80)]
    seed: Annotated[int, Field(ge=0, le=2147483647)]
    terrain: Terrain
    climate: Climate
    water: Water
    atmosphere: Atmosphere
    places: Annotated[list[Place], Field(max_length=12)]
    paths: Annotated[list[Path_], Field(max_length=12)] = []
    life: Annotated[list[Life], Field(max_length=4)] = []

    @model_validator(mode="after")
    def _references(self) -> "Recipe":
        ids: set[str] = set()
        for p in self.places:
            if p.id in ids:
                raise ValueError(f'duplicate place id "{p.id}"')
            ids.add(p.id)
        for p in self.places:
            for r in p.where:
                target = getattr(r, "target", None) or (r.of if isinstance(r, Direction) else None)
                if target is not None and target not in ids:
                    raise ValueError(f'place "{p.id}" refers to unknown place "{target}"')
        for path in self.paths:
            if path.from_ not in ids or path.to not in ids:
                raise ValueError(f"path {path.from_}->{path.to} refers to an unknown place")
        return self


# ---- ops ----
class AddPlace(Strict):
    op: Literal["addPlace"]
    place: Place


class RemovePlace(Strict):
    op: Literal["removePlace"]
    id: Id


class MovePlace(Strict):
    op: Literal["movePlace"]
    id: Id
    where: Annotated[list[Relation], Field(min_length=1, max_length=4)]


class UpdatePlace(Strict):
    op: Literal["updatePlace"]
    id: Id
    label: Annotated[str, Field(min_length=1, max_length=60)] | None = None
    asset: Annotated[str, Field(min_length=2, max_length=120)] | None = None
    interaction: Interaction | None = None
    description: Annotated[str, Field(max_length=280)] | None = None


class SetAtmosphere(Strict):
    op: Literal["setAtmosphere"]
    time: Time | None = None
    weather: Weather | None = None
    fog: Unit | None = None
    wind: Unit | None = None


class SetClimate(Strict):
    op: Literal["setClimate"]
    temperature: Unit | None = None
    moisture: Unit | None = None


class SetTerrain(Strict):
    op: Literal["setTerrain"]
    shape: Shape | None = None
    roughness: Unit | None = None
    height: Unit | None = None
    seaLevel: Unit | None = None


class SetWater(Strict):
    op: Literal["setWater"]
    river: bool | None = None
    lake: bool | None = None


class AddPath(Strict):
    op: Literal["addPath"]
    from_: Id = Field(alias="from")
    to: Id
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class AddLife(Strict):
    op: Literal["addLife"]
    kind: LifeKind
    count: Annotated[int, Field(ge=1, le=20)]


Op = Annotated[
    Union[AddPlace, RemovePlace, MovePlace, UpdatePlace, SetAtmosphere, SetClimate, SetTerrain, SetWater, AddPath, AddLife],
    Field(discriminator="op"),
]
OpsList = Annotated[list[Op], Field(min_length=1, max_length=20)]
ops_adapter: TypeAdapter[list[Op]] = TypeAdapter(OpsList)


# ---- API models ----
class WorldRequest(Strict):
    prompt: Annotated[str, Field(min_length=3, max_length=600)]


class XZ(Strict):
    x: float
    z: float
    y: float | None = None


class PlacementSummary(Strict):
    id: Id
    label: str
    x: float
    z: float


class EditContext(Strict):
    player: XZ
    lookAt: XZ | None = None
    lookingAt: Id | None = None
    placements: list[PlacementSummary] = []


class EditRequest(Strict):
    recipe: Recipe
    prompt: Annotated[str, Field(min_length=2, max_length=400)]
    context: EditContext


class AssetRequest(Strict):
    query: Annotated[str, Field(min_length=2, max_length=120)]
    kind: Kind = "prop"
    allowGenerate: bool = False
    allowOnline: bool = True
    variant: Annotated[int, Field(ge=0, le=99)] = 0


def dump(model: BaseModel) -> dict:
    """Serialize for the browser: aliases ('from') and no nulls (Zod optional rejects null)."""
    return model.model_dump(by_alias=True, exclude_none=True)


def dump_ops(ops: list) -> list[dict]:
    return [ops_adapter.dump_python([o], by_alias=True, exclude_none=True)[0] for o in ops]
