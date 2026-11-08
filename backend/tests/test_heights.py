"""Real heights: the LLM may give a place (or an animal) its height in metres; repairs clamp it into the schema's hard limits."""
import pytest
from pydantic import ValidationError

from app.schemas import Place, ops_adapter
from app.service import repair_ops, repair_recipe


def place(**extra):
    return {"id": "plane", "kind": "prop", "label": "Plane", "asset": "small plane", **extra}


def test_a_place_may_carry_a_height_within_hard_limits():
    assert Place.model_validate(place(height=3)).height == 3
    with pytest.raises(ValidationError):
        Place.model_validate(place(height=1001))


def test_update_place_and_animals_take_heights_too():
    ops = ops_adapter.validate_python([
        {"op": "updatePlace", "id": "statue", "height": 25},
        {"op": "addLife", "kind": "animal", "asset": "dragon", "count": 1, "height": 15},
    ])
    assert ops[0].height == 25 and ops[1].height == 15


def test_repairs_clamp_wild_heights_instead_of_failing_the_edit():
    raw = repair_ops([
        {"op": "addPlace", "place": place(height=5000)},
        {"op": "updatePlace", "id": "statue", "height": 0},
        {"op": "addLife", "kind": "animal", "asset": "dragon", "count": 1, "height": 40},
    ])
    assert raw[0]["place"]["height"] == 1000 and raw[1]["height"] == 0.1 and raw[2]["height"] == 15
    ops_adapter.validate_python(raw)


def test_repairs_drop_heights_that_mean_nothing():
    raw = repair_ops([{"op": "addPlace", "place": place(height="tall")}])
    assert "height" not in raw[0]["place"]
    recipe = repair_recipe({"places": [
        {"id": "town", "kind": "settlement", "label": "Town", "asset": "house", "height": 30},  # its layout decides
        place(height=1e9),
    ], "life": [{"kind": "animal", "asset": "dragon", "count": 1, "height": 99}]})
    assert "height" not in recipe["places"][0]
    assert recipe["places"][1]["height"] == 1000
    assert recipe["life"][0]["height"] == 15
