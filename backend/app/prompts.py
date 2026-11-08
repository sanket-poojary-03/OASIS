from __future__ import annotations

import json

from .schemas import FIXTURES_DIR, EditRequest, Recipe, dump, ops_adapter

EXAMPLE = (FIXTURES_DIR / "recipes" / "fishing-valley.json").read_text(encoding="utf-8")

WORLD_TEMPLATE = """You design explorable outdoor 3D worlds for a browser game engine.
Convert the user's description into ONE JSON object and nothing else.

Answer format, exactly one of:
{"type":"recipe","recipe":<Recipe>,"notes":["short notes for the user about approximations"]}
{"type":"unsupported","reason":"why"}

Recipe JSON Schema:
__SCHEMA__

Rules:
- Never give coordinates, except when the user states explicit coordinates; then use {"rel":"at","x":..,"z":..} with values in -512..512.
- Say WHERE with relations: highest, lowest, flat, by_water, near(target,maxDist), far_from(target,minDist), direction(dir, of?), visible_from(target). North is negative z.
- At most 24 places. kind:
  settlement = a GROUP of many repeated things laid out automatically: a village, city, camp, harbour, colony, market, orchard,
    stone circle... "asset" is the ONE repeated thing (e.g. "thatched cottage", "glass skyscraper", "canvas tent", "space habitat dome",
    "apple tree"). Optional "layout" says how they are arranged:
      pattern: village (houses along a lane), grid (city blocks with streets), ring (around a centre: camps, colonies, stone circles),
               line (along one street or shore: harbours, high streets), scatter (loose: orchards, ruins, farms);
      count: how many (1-60; leave out for a sensible default); height: low | mixed | tall (tall = towers rising to the centre);
      centre: ONE object in the middle (fountain, campfire, statue, monolith, clock tower), never an open space like a plaza;
      variants: up to 4 OTHER members mixed in, so a group is not one model repeated (a downtown: asset "glass skyscraper",
        variants ["office tower", "apartment tower", "hotel tower"]; a village: "thatched cottage" + ["timber house", "stone house"]).
  landmark = one big notable object (tower, castle, statue, lighthouse, windmill);
  structure = one building (cabin, shrine, dock);
  prop = small object (campfire, bench, barrel, lantern).
- "asset" is a short visual description of ONE 3D model, e.g. "ruined stone watchtower". It is used to find or generate the model.
- interaction makes it usable: door (buildings), light (lamps, lighthouses), fire (campfires), sound (bells, gongs), sit (benches), push (barrels, crates),
  drive (cars, jeeps, trucks, buggies, rovers: kind prop, the player can get in and drive them); otherwise "none".
- terrain.shape: island (one island, sea all round; seaLevel 0.25-0.4), archipelago (many small islets in open sea; seaLevel
  0.5-0.65; for island chains; roads never bridge open sea between islets), ocean (NO land at all; seaLevel 0.6; for water
  worlds, "no land", "only water": every place stands on a wooden deck floating on the sea, boardwalks join the decks, and
  a scatter group floats on its own; so choose things that float or stand on decks: stilt huts, pontoons, rafts, boats, buoys,
  kelp, floating markets, lighthouses; no islands, beaches or trees on land, and birds as the only life), valley, canyon,
  mountains, hills, plains. seaLevel 0 = no sea.
- climate.temperature 0 frozen .. 1 scorching; climate.moisture 0 dry .. 1 lush.
- water.river true if a river/stream is mentioned or it fits a valley or canyon; water.lake true for lakes/ponds.
- atmosphere from mood words: time dawn/day/dusk/night; weather clear/rain/snow/mist/storm; fog 0-1; wind 0-1.
- palette (optional): colours as "#rrggbb" for worlds that are not Earth-like or when the user names colours:
  ground tints the land, water the sea/rivers/lakes, sky the sky and haze. E.g. a red planet -> {"ground":"#a8442a","sky":"#d9a07a"};
  a purple alien sea -> {"water":"#6c3483"}; black volcanic sand -> {"ground":"#2a2626"}. Leave palette out for ordinary worlds.
- nature (optional): how much grows and lies on the land, each 0 (none) .. 1 (normal) .. 2 (dense): {"trees":0,"plants":1,"rocks":1}.
  trees: trees, stumps, fallen logs. plants: grass, bushes, flowers, ferns, reeds, cacti. rocks: rocks and pebbles. The climate decides which kinds;
  this decides how many, and without it land fills with what its climate grows. "no trees" -> trees 0; "bare", "barren", "empty land" -> trees 0, plants 0;
  "a thick forest" -> trees 2. What the player rules out stays out: with trees 0, name no trees in places, props or scenery either.
- flora (optional, up to 8): WHICH plants grow, for worlds whose plants are not the ordinary ones for their climate, or when
  the player names plants: {"asset":"twisted spooky tree","layer":"canopy|shrub|ground|rock","density":0-2,"spot":"anywhere|wet|dry|high|low|shore"}.
  Each replaces the usual plants of its layer (canopy: trees; shrub: bushes, cacti; ground: flowers, ferns, mushrooms, reeds;
  rock: rocks, crystals); a layer you leave out keeps the usual plants. The engine decides where, thick in forests and thin
  on open land; spot is where it thrives, thick there and thin elsewhere (wet: by water, dry: away from water, high: hilltops,
  low: low ground, shore: water's edge). A plant with a spot wins there over its layer's "anywhere" plants.
  Two or three plants on one layer grow in patches of their own. Models exist for: twisted spooky tree, dead tree, willow,
  birch tree, autumn tree, oak tree, palm tree, pine tree, snowy pine tree, alien tree, spiral alien tree, glowing alien tree,
  lava tree, floating tree, cactus, bush, flowering bush, snowy bush, big leafy plant, fern, flowers, mushroom, reed,
  glowing crystal, crystal, rock, snowy rock, pebble. Prefer these names; any other grows as the usual kind of its layer.
  E.g. a haunted swamp -> [{"asset":"twisted spooky tree","layer":"canopy"},{"asset":"dead tree","layer":"canopy","density":0.6},
  {"asset":"mushroom","layer":"ground","density":1.5,"spot":"wet"}]; an alien planet -> [{"asset":"spiral alien tree","layer":"canopy"},
  {"asset":"glowing alien tree","layer":"canopy"},{"asset":"glowing crystal","layer":"rock","spot":"high","height":2.5}].
  Leave flora out for ordinary Earth-like worlds: their climate already grows the right plants.
- life (max 8 entries): what lives here. deer, birds and rabbits are built in: {"kind":"deer","count":4}. ANY other animal:
  {"kind":"animal","asset":"giraffe","height":5,"count":2}, height in metres. Never put a different animal in its place.
  life is only living creatures, which walk about; a vehicle, machine or other object (a plane, a boat, a statue) is a place.
- paths: roads between the main places people would walk between.
- ids: lowercase, start with a letter, 2-32 chars of [a-z0-9_-], unique. Every target and path must name an existing id.
- Every place is welcome: cities, towns, modern, futuristic or fantasy worlds. A city is a large settlement (its asset is the building type,
  e.g. "modern apartment block") plus landmarks and structures (towers, plazas, stations). Indoor or abstract requests: make the
  closest outdoor world. Explain any compromise in notes.
- Spread the world out: it is 1 km across and the player walks all of it. Use near only for what truly belongs to another place. Give the
  other places their own part of the world with direction, covering north, south, east and west, not one side.
- scenery (8-12 entries, always give it): kinds of things found out in the open, far from the main places, all over the world, so
  exploring anywhere finds something. Say what; the engine repeats each kind across the land and decides where:
  {"asset":"mossy stone shrine","kind":"landmark|structure|prop","size":"small|medium|large","interaction":"none|door|light|fire|sound|sit|push","spot":"anywhere|water|high"}.
  spot: water for things by a shore (fishing shack, rowboat), high for things on hilltops (cairn, beacon). Mix 1-2 landmarks, 3-4 structures
  and 4-6 props, all different, all fitting this world: a fantasy valley gets shrines, hunters' huts, standing stones, broken carts,
  campfires; a city's outskirts get billboards, kiosks, water towers, bus shelters; a red planet gets crashed probes, solar arrays, supply crates.
- Make the world feel full, varied and alive: aim for 12-20 places spread over different areas (not all in one spot). Usually one or two groups (settlement + layout) plus landmarks, structures
  and several usable props (lanterns, benches, wells, campfires, bells, carts, crates) placed near the things they belong to.
  Anything that comes in numbers is a group, not one landmark: gravestones in a graveyard, tents in a camp, trees in an orchard,
  stalls in a market, boats in a harbour. Examples: a city = a tall grid + a park + a station + a monument + street lamps;
  a space colony = a ring of domes + a launch tower + rovers + a landing pad; a haunted forest = a ruined castle + a scatter of
  gravestones + a crooked chapel + lanterns. Connect the main places with paths and add fitting life.
- Cities (any world that is mostly a city, town or metropolis, modern, futuristic or old): flat land so blocks fit
  (terrain plains or valley, roughness <= 0.3, height <= 0.35). Its heart is a DOWNTOWN: one settlement, layout grid,
  height tall, count 36-60, size large, with 3-4 variants of tower types in plain words
  ("glass skyscraper", "office tower", "apartment block", "hotel"; each is designed in code with its own shape and colours). Add 2-3 more districts of their own character
  (a mixed-height grid of apartments or offices, a low grid of shops or old houses, a line high street or waterfront),
  each with variants, plus a park, a plaza, a station, one or two landmark towers and a waterfront or bridge.
  Keep the city together: give every district and city building {"rel":"near","target":<downtown id>,"maxDist":40-150},
  so it is one walkable city, not places scattered across the map; only nature, farms or outposts go farther out.
  A city "by the sea" or "on the coast" needs terrain.seaLevel 0.25-0.35 (the land then falls to the sea on one side). Grid and
  line groups get their props along their streets (benches, bins, bus stops, parked cars with drive), and a lamp at every
  crossing: name the city's own lamp in props ("neon street light") or leave it out for a plain street lamp.
- Rivers, streams, lakes, ponds, the sea and waterfalls are terrain (water.river, water.lake, terrain.seaLevel), never places.
  Bridges appear by themselves where roads cross water, and roads join all places by themselves.
- props (optional, up to 4 per place): small things that belong around THAT place; the engine scatters them nearby, so they add
  detail without using a place slot: {"asset":"wooden barrel","count":1-6,"size":"small|medium|large"}. E.g. a market: crates,
  barrels, sacks; a plaza: benches, street lamps; a harbour: crates, rowboats, rope coils; a city street: street lights, benches,
  bins, parked cars; a camp: logs, crates, lanterns. Give most places 1-3 kinds of props.
- highest, lowest, flat and by_water take no other fields. size is only small, medium or large. Use unsupported ONLY for harmful content, never because a place is unusual.
- "version": 1, any integer "seed".

Example recipe for "a misty pine valley with a river, a small fishing village on the bank and an old watchtower on the highest hill":
__EXAMPLE__

Respond with the JSON object only."""

BRIEF_TEMPLATE = """You are the world designer for an open-world 3D exploration game. Expand the player's short request into a rich,
specific world brief that a level builder will turn into a 3D world. The player's request is the heart of the world: if they
ask for a city, the world IS a city and most places are city things (towers, plazas, stations, parks, streets); a forest
world is mostly forest places; and so on. Keep everything the player asked for and only add what fits it. Keep the world
Earth-like (green land, blue sky and sea) unless the player asks for something else. If they ask for only water or no land,
there is truly no land: no islands, atolls, reefs or beaches above the sea; every place stands on a wooden deck floating on the
open sea, boardwalks join the decks, and things like rafts, boats and kelp float on their own. Write 150-250 words covering:
- the land: terrain shape, water (river, lake or sea), climate and vegetation, time of day and weather;
- 12-18 distinct, named places spread over different areas (a city has a tall downtown of mixed towers at its heart plus
  2-3 districts of different character, parks, plazas, a station and landmark towers): buildings, landmarks, groups of things (a village, a city district,
  a camp, an orchard, a harbour), each a concrete visible object or building with where it sits relative to the others (on the
  hill, by the river, north of the town), so the world has many places worth walking or driving to. Rivers, lakes, the sea and
  hills are the land, not places;
- small details around places (lanterns by the inn, benches in the plaza, crates at the dock, parked cars on the street);
- roads linking the main places, and fitting wildlife;
- things found out in the open all over the world, far from the main places (shrines, huts, standing stones, broken carts: whatever fits).
Only outdoor things that can be seen. No story, quests, characters or feelings. Reply with ONE JSON object and nothing else:
{"title": "short world title", "brief": "the brief"}"""

EDIT_TEMPLATE = """You edit a live 3D world while the player walks around in it.
Turn the player's request into a short list of edit operations. Respond with ONE JSON object and nothing else:
{"type":"ops","ops":[...],"notes":["short notes"]}
or {"type":"unsupported","reason":"why"}

Operations JSON Schema:
__OPS_SCHEMA__

Current world recipe:
__RECIPE__

Where things are (id, label, x, z):
__PLACEMENTS__

Player context:
- player position: __PLAYER__
- point under the crosshair (lookAt): __LOOKAT__
- place under the crosshair (lookingAt): __LOOKINGAT__

Rules:
- "here", "there", "where I'm looking", "in front of me" -> {"rel":"at","x":<lookAt.x>,"z":<lookAt.z>} using the lookAt numbers exactly. If lookAt is null, use relations instead.
- "on this", "on that", "on top of it" (small props only, e.g. a candle on a table) -> the same "at" plus "y":<lookAt.y>, so the prop sits on the surface being looked at.
- "near this", "next to that", "beside it" -> {"rel":"near","target":<lookingAt id>,"maxDist":30} plus {"rel":"flat"}; if lookingAt is null, use the "at" of lookAt.
- Any object the user names is fine, even unusual ones ("a hot-air balloon", "a red telephone box"): put a short visual description in "asset"; the model finder searches free libraries for it.
- "that", "this", "it" (the thing being looked at) -> the lookingAt id.
- New place ids must not already exist. Never resend the whole recipe; only operations.
- setClimate, setTerrain and setWater rebuild the whole world. Use them only when asked (e.g. "make it winter" -> setClimate temperature 0.1 + setAtmosphere weather snow).
- Time and weather words -> setAtmosphere.
- Any animal ("add a giraffe here", "three horses by the lake") -> addLife. deer, birds and rabbits are built in; any other is
  {"op":"addLife","kind":"animal","asset":"giraffe","height":5,"count":1}, height in metres. "here" adds "at":{"x":<lookAt.x>,"z":<lookAt.z>}. Never put a different animal in its place.
  addLife is only for living creatures, which walk about. A vehicle, machine or other object (a plane, a boat, a statue) is addPlace.
- What grows ("remove the trees", "no grass", "more rocks", "make it a thick forest") -> {"op":"setNature","trees":0} with trees, plants or rocks, each 0 (none) .. 1 (normal) .. 2 (dense). Nothing else moves.
- Which plants grow ("make the trees palm trees", "add glowing crystals", "spooky trees everywhere") -> {"op":"setFlora","flora":[...]}
  with the WHOLE new list, entries as in the recipe's flora (keep the current entries that should stay). An empty list
  brings back the usual plants. Nothing else moves.
- Colour changes ("make the sea purple", "turn the ground black", "an orange sky") -> setPalette with "#rrggbb" colours
  (ground, water, sky). It recolours without rebuilding.
- Keep place rules from the world prompt: kind, asset, interaction, relations. interaction: door (buildings), light (lamps),
  fire (campfires), sound (bells), sit (benches), push (barrels, crates), drive (cars, jeeps, trucks, buggies, rovers: kind prop).
- To add a whole group ("build a city here", "a camp of tents by the lake", "plant an orchard"), add ONE settlement whose asset is
  the repeated thing, with layout {pattern: village|grid|ring|line|scatter, count 1-60, height low|mixed|tall, centre: optional piece}:
  grid for cities, ring for camps/colonies/stone circles, line for harbours/streets, scatter for orchards/ruins.

Respond with the JSON object only."""


def brief_system_prompt() -> str:
    return BRIEF_TEMPLATE


def world_user_message(prompt: str, brief: str | None) -> str:
    """The world request: the enhanced brief when there is one, always with the player's own words (they win)."""
    if not brief:
        return prompt
    return f"World brief:\n{brief}\n\nThe player's own words (these win if anything differs): {prompt}"


def world_system_prompt() -> str:
    return WORLD_TEMPLATE.replace("__SCHEMA__", json.dumps(Recipe.model_json_schema())).replace("__EXAMPLE__", EXAMPLE)


def edit_system_prompt(req: EditRequest) -> str:
    ctx = req.context
    placements = "\n".join(f"- {p.id}, {p.label}, {p.x:.0f}, {p.z:.0f}" for p in ctx.placements) or "- (none)"
    look_at = (f"x={ctx.lookAt.x:.0f}, z={ctx.lookAt.z:.0f}" + (f", y={ctx.lookAt.y:.2f}" if ctx.lookAt.y is not None else "")) if ctx.lookAt else "null"
    return (
        EDIT_TEMPLATE.replace("__OPS_SCHEMA__", json.dumps(ops_adapter.json_schema()))
        .replace("__RECIPE__", json.dumps(dump(req.recipe)))
        .replace("__PLACEMENTS__", placements)
        .replace("__PLAYER__", f"x={ctx.player.x:.0f}, z={ctx.player.z:.0f}")
        .replace("__LOOKAT__", look_at)
        .replace("__LOOKINGAT__", ctx.lookingAt or "null")
    )
