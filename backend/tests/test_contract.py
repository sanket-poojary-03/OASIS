import json
import pytest
from pydantic import ValidationError
from app.schemas import FIXTURES_DIR, Recipe, dump, dump_ops, ops_adapter

EXPECTED_OPS = {
    "add-lighthouse-at": ["addPlace", "setAtmosphere"],
    "make-winter": ["setClimate", "setAtmosphere"],
}

RECIPES = sorted((FIXTURES_DIR / "recipes").glob("*.json"))
OPS = sorted((FIXTURES_DIR / "ops").glob("*.json"))


@pytest.mark.parametrize("path", RECIPES, ids=lambda p: p.stem)
def test_recipe_fixtures_valid(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    recipe = Recipe.model_validate(data)
    out = dump(recipe)
    assert "null" not in json.dumps(out)
    assert Recipe.model_validate(out) == recipe


@pytest.mark.parametrize("path", OPS, ids=lambda p: p.stem)
def test_ops_fixtures_valid(path):
    ops = ops_adapter.validate_python(json.loads(path.read_text(encoding="utf-8")))
    assert [o.op for o in ops] == EXPECTED_OPS[path.stem]
    out = dump_ops(ops)
    assert "null" not in json.dumps(out)
    assert ops_adapter.validate_python(out) == ops


def test_rejects_unknown_field_and_dangling_target():
    data = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    with pytest.raises(ValidationError):
        Recipe.model_validate({**data, "extra": 1})
    data["places"][1]["where"] = [{"rel": "visible_from", "target": "nowhere"}]
    with pytest.raises(ValidationError):
        Recipe.model_validate(data)


def test_defaults_match_zod():
    data = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    data["places"] = [{"id": "x1", "kind": "prop", "label": "X", "asset": "crate"}]
    data.pop("paths")
    r = Recipe.model_validate(data)
    assert r.places[0].size == "medium" and r.places[0].interaction == "none" and r.places[0].where == []
    assert r.paths == []
