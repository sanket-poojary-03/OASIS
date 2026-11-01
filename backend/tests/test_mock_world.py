from app.mock import mock_world, pick_fixture, prompt_seed
from app.schemas import Recipe


def test_pick_fixture_by_keywords():
    assert pick_fixture("a sandy desert canyon with an oasis") == "desert-canyon"
    assert pick_fixture("frozen mountains with a castle") == "snowy-mountains"
    assert pick_fixture("tropical island with a lighthouse") == "tropical-island"
    assert pick_fixture("something completely different") == "fishing-valley"


def test_mock_world_is_valid_and_seeded_by_prompt():
    out = mock_world("a snowy castle")
    assert out["type"] == "recipe" and out["source"] == "mock"
    r = Recipe.model_validate(out["recipe"])
    assert r.seed == prompt_seed("a snowy castle")
    assert prompt_seed("A snowy castle ") == prompt_seed("a snowy castle")
