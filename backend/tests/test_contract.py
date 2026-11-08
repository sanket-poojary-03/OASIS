import json
import pytest
from pydantic import ValidationError
from app.schemas import FIXTURES_DIR, Recipe, dump, dump_ops, ops_adapter

EXPECTED_OPS = {
    "add-lighthouse-at": ["addPlace", "setAtmosphere"],
    "make-winter": ["setClimate", "setAtmosphere"],
    "red-planet": ["setPalette", "setAtmosphere"],
    "no-trees": ["setNature"],
    "alien-flora": ["setFlora"],
    "add-giraffe": ["addLife"],
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


def test_group_layout_matches_the_browser_schema():
    import pytest as _pytest
    from pydantic import ValidationError as _VE
    from app.schemas import Place, dump
    p = Place.model_validate({"id": "city", "kind": "settlement", "label": "City", "asset": "modern apartment block",
                              "layout": {"pattern": "grid", "count": 40, "height": "tall", "centre": "fountain"}})
    assert dump(p)["layout"] == {"pattern": "grid", "count": 40, "height": "tall", "centre": "fountain"}
    assert dump(Place.model_validate({"id": "camp", "kind": "settlement", "label": "C", "asset": "tent", "layout": {}}))["layout"] == {"pattern": "village", "height": "low"}
    v = Place.model_validate({"id": "downtown", "kind": "settlement", "label": "D", "asset": "glass tower", "layout": {"pattern": "grid", "variants": ["office tower", "hotel"]}})
    assert dump(v)["layout"]["variants"] == ["office tower", "hotel"]
    for bad in ({"pattern": "spiral"}, {"count": 61}, {"count": 0}, {"centre": "x"}, {"pattern": "grid", "extra": 1},
                {"variants": ["a", "b", "c", "d", "e"]}, {"variants": ["x"]}):
        with _pytest.raises(_VE):
            Place.model_validate({"id": "camp", "kind": "settlement", "label": "C", "asset": "tent", "layout": bad})


def test_palette_is_optional_hex_colours():
    from app.schemas import Op  # noqa: F401
    data = json.loads((FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8"))
    assert "palette" not in dump(Recipe.model_validate(data))
    r = Recipe.model_validate({**data, "palette": {"ground": "#A8442A", "water": "#40e0d0"}})
    assert dump(r)["palette"] == {"ground": "#A8442A", "water": "#40e0d0"}
    for bad in ({"ground": "red"}, {"ground": "#abc"}, {"sky": "#12345g"}, {"grass": "#00ff00"}):
        with pytest.raises(ValidationError):
            Recipe.model_validate({**data, "palette": bad})
    with pytest.raises(ValidationError):
        ops_adapter.validate_python([{"op": "setPalette", "water": "blue"}])
