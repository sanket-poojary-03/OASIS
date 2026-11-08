"""Recipe `flora`: the AI names what grows (mirrors web floraSchema), and small slips are repaired, not rejected."""
import json

import pytest
from pydantic import ValidationError

from app.prompts import edit_system_prompt, world_system_prompt
from app.schemas import FIXTURES_DIR, EditRequest, Flora, Recipe, dump, dump_ops, ops_adapter
from app.service import repair_ops, repair_recipe

RECIPE = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))


def test_defaults_match_zod_and_no_nulls_reach_the_browser():
    assert dump(Flora(asset="alien tree", layer="canopy")) == {"asset": "alien tree", "layer": "canopy", "density": 1, "spot": "anywhere"}
    r = Recipe.model_validate({**RECIPE, "flora": [{"asset": "glowing crystal", "layer": "rock", "spot": "high", "height": 2}]})
    assert dump(r)["flora"] == [{"asset": "glowing crystal", "layer": "rock", "density": 1, "spot": "high", "height": 2}]
    assert "flora" not in dump(Recipe.model_validate(RECIPE))


@pytest.mark.parametrize("bad", [
    {"asset": "alien tree", "layer": "tree"},
    {"asset": "alien tree", "layer": "canopy", "density": 3},
    {"asset": "alien tree", "layer": "canopy", "spot": "everywhere"},
    {"asset": "alien tree", "layer": "canopy", "colour": "red"},
    {"asset": "x", "layer": "canopy"},
])
def test_the_schema_holds_each_plant_to_its_own_keys(bad):
    with pytest.raises(ValidationError):
        Recipe.model_validate({**RECIPE, "flora": [bad]})


def test_at_most_eight():
    with pytest.raises(ValidationError):
        Recipe.model_validate({**RECIPE, "flora": [{"asset": "fern", "layer": "ground"}] * 9})


def test_set_flora_op_round_trips():
    ops = ops_adapter.validate_python([{"op": "setFlora", "flora": [{"asset": "willow", "layer": "canopy"}]}])
    assert dump_ops(ops) == [{"op": "setFlora", "flora": [{"asset": "willow", "layer": "canopy", "density": 1, "spot": "anywhere"}]}]
    assert ops_adapter.validate_python([{"op": "setFlora", "flora": []}])


def test_slips_are_repaired_instead_of_costing_the_world():
    raw = {**RECIPE, "flora": [
        {"asset": "alien tree", "layer": "trees", "density": 5},
        {"asset": "blue fern", "layer": "Ground Cover", "spot": "everywhere"},
        {"asset": "crystal", "layer": "stones", "density": -1},
        {"asset": "", "layer": "canopy"},
        {"layer": "shrub"},
        {"asset": "moss", "layer": "carpet"},
        "willow",
    ]}
    out = repair_recipe(json.loads(json.dumps(raw)))
    assert out["flora"] == [
        {"asset": "alien tree", "layer": "canopy", "density": 2},
        {"asset": "blue fern", "layer": "ground", "spot": "anywhere"},
        {"asset": "crystal", "layer": "rock", "density": 0},
    ]
    assert Recipe.model_validate(out).flora[0].layer == "canopy"
    assert "flora" not in repair_recipe({**json.loads(json.dumps(RECIPE)), "flora": [{"layer": "canopy"}]})
    assert len(repair_recipe({**json.loads(json.dumps(RECIPE)), "flora": [{"asset": "fern", "layer": "ground"}] * 12})["flora"]) == 8


def test_set_flora_slips_are_repaired_too():
    out = repair_ops([{"op": "setFlora", "flora": [{"asset": "palm tree", "layer": "tree"}, {"asset": "", "layer": "rock"}]}])
    assert ops_adapter.validate_python(out)[0].flora[0].layer == "canopy"
    assert len(out[0]["flora"]) == 1


def test_the_prompts_explain_it():
    assert '"flora"' in world_system_prompt() and "canopy" in world_system_prompt()
    req = EditRequest.model_validate({"prompt": "make the trees palms", "recipe": RECIPE, "context": {"player": {"x": 0, "z": 0}, "placements": []}})
    assert "setFlora" in edit_system_prompt(req)
