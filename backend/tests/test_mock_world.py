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


def test_group_words_shape_the_settlement():
    from app.mock import mock_world
    city = next(p for p in mock_world("a big city at night")["recipe"]["places"] if p["kind"] == "settlement")
    assert city["layout"] == {"pattern": "grid", "height": "tall", "centre": "fountain"} and city["asset"] == "modern apartment block"
    camp = next(p for p in mock_world("a desert camp")["recipe"]["places"] if p["kind"] == "settlement")
    assert camp["layout"]["pattern"] == "ring" and camp["asset"] == "canvas tent"
    plain = next(p for p in mock_world("a misty valley")["recipe"]["places"] if p["kind"] == "settlement")
    assert "layout" not in plain
