"""What the AI can say about a world: what grows, any animal. And that a good answer is not thrown away over its notes."""
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.prompts import world_system_prompt
from app.schemas import Life, Nature, Recipe, ops_adapter
from app.service import WorldService, repair_ops, repair_recipe

ROOT = Path(__file__).resolve().parents[2] / "shared" / "fixtures"
RECIPE = json.loads((ROOT / "recipes" / "desert-canyon.json").read_text(encoding="utf-8"))


def test_nature_is_held_to_its_range_and_keys():
    assert Nature(trees=0).model_dump() == {"trees": 0, "plants": 1, "rocks": 1}
    for bad in ({"trees": 3}, {"trees": -1}, {"oaks": 1}):
        with pytest.raises(ValidationError):
            Nature(**bad)
    assert Recipe.model_validate({**RECIPE, "nature": {"trees": 0}}).nature.trees == 0


def test_an_animal_must_say_which():
    assert Life(kind="animal", asset="giraffe", height=5, count=2).asset == "giraffe"
    assert Life(kind="deer", count=2).asset is None
    with pytest.raises(ValidationError):
        Life(kind="animal", count=1)
    with pytest.raises(ValidationError):
        Life(kind="animal", asset="giraffe", count=1, height=99)
    with pytest.raises(ValidationError):
        Life(kind="unicorn", count=1)


@pytest.mark.parametrize("name", ["no-trees", "add-giraffe"])
def test_the_shared_op_fixtures_are_valid(name):
    assert ops_adapter.validate_python(json.loads((ROOT / "ops" / f"{name}.json").read_text(encoding="utf-8")))


def test_an_animal_with_no_kind_of_its_own_is_kept_as_itself():
    out = repair_recipe({"places": [], "life": [{"kind": "lizard", "count": 3}, {"kind": "deer", "count": 2}, {"kind": "", "count": 1}, "x"]})
    assert out["life"] == [{"kind": "animal", "asset": "lizard", "count": 3}, {"kind": "deer", "count": 2}]


def test_an_animal_at_written_like_a_relation_is_repaired():
    raw = [{"op": "addLife", "kind": "animal", "asset": "giraffe", "count": 1, "at": {"rel": "at", "x": 5, "z": 6}}]
    assert ops_adapter.validate_python(repair_ops(raw))[0].at.x == 5
    out = repair_recipe({"places": [], "life": [{"kind": "deer", "count": 1, "at": {"rel": "at", "x": 1, "z": 2}}]})
    assert out["life"][0]["at"] == {"x": 1, "z": 2}


def test_the_prompt_offers_both():
    p = world_system_prompt()
    assert '"nature"' in p or "nature" in p
    assert '"animal"' in p


class Fake:
    model, fallback_models = "fake", []

    def __init__(self, *answers):
        self.answers, self.calls = list(answers), 0

    def complete(self, system, user, **kw):
        self.calls += 1
        return self.answers.pop(0)


def test_notes_beside_a_recipe_written_flat_do_not_cost_a_second_call():
    # The model often answers with the recipe's own keys at the top and its notes among them.
    llm = Fake(json.dumps({**RECIPE, "notes": ["A note."]}))
    out = WorldService(llm).generate("a canyon")
    assert llm.calls == 1
    assert out["notes"] == ["A note."] and "notes" not in out["recipe"]


def test_notes_nested_or_beside_are_all_kept():
    llm = Fake(json.dumps({"type": "recipe", "recipe": {**RECIPE, "notes": ["Inside."]}, "notes": ["Beside."]}))
    assert WorldService(llm).generate("a canyon")["notes"] == ["Beside.", "Inside."]


def test_a_flat_answer_may_also_carry_its_type():
    llm = Fake(json.dumps({"type": "recipe", **RECIPE}))
    assert WorldService(llm).generate("a canyon")["type"] == "recipe" and llm.calls == 1
