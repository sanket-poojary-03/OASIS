"""Build backend/assets/library/quaternius/ from Quaternius' CC0 models on Poly Pizza, with hand-written tags.

Every entry below names a Quaternius pack (its Poly Pizza upload day) and a model title; all variants of that title in
that pack are fetched (up to `n`). Tags follow the tagging contract (rulings I4): the category noun is always a tag
("pine" carries "tree") and the most common thing of a kind has the fewest tags, so a bare "tree" picks it.
Only CC0 entries are taken. Re-running skips files already downloaded and rewrites the manifest entries it owns.

Usage (from backend/, with POLY_PIZZA_KEY in .env): python scripts/curate_library.py [catalogue.json]
Then shrink embedded textures (the Stylized Nature trees carry ~2 MB of PNG each) to 512 px WebP, as the committed files
are: for each textured .glb, `npx @gltf-transform/cli resize f.glb t.glb --width 512 --height 512` then
`npx @gltf-transform/cli webp t.glb f.glb` (three.js reads EXT_texture_webp). 95 MB → 40 MB.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.asset_match import glb_size  # noqa: E402

ROOT = Path(__file__).resolve().parents[1] / "assets" / "library"
OUT = ROOT / "quaternius"
LICENSE = "CC0 1.0 (Quaternius, via poly.pizza)"

# Themed families: their houses and buildings are only for a request that names the theme ("wooden cabin" found a pirate
# house shaped like an upturned hull). A generic word on a themed model does not count as asking for it.
THEMED = ("quaternius/buildings/pirate/", "quaternius/buildings/scifi/", "quaternius/buildings/cyberpunk/")
GENERIC = {"house", "building", "hut", "shack", "wooden", "modern", "small", "big", "home"}
# Models whose pack title says one thing and whose shape says another. This "house" is a squat stone block with a flat
# roof: asked for as a cottage, it stood in every village as a black box twice the width of the rest.
RETAGGED = {"quaternius/buildings/medieval/house/fantasy-house-3.glb": ["building", "fantasy", "medieval", "stone", "storehouse", "cellar"]}


def needs_for(rel: str, tags: list[str]) -> dict:
    """`needs` for a manifest entry: the words of which a request must name one, when it is a themed house or building."""
    if not rel.startswith(THEMED) or not set(tags) & {"house", "building"}:
        return {}
    return {"needs": sorted(set(tags) - GENERIC)}


# (pack day, title, folder, tags, max variants)
SPEC: list[tuple[str, str, str, list[str], int]] = [
    # --- nature: Stylized Nature MegaKit (2024-08-02) + Ultimate Nature (2021-08-26) + pirate palms ---
    ("2024-08-02", "Tree", "nature/tree", ["tree"], 5),
    ("2024-08-02", "Pine", "nature/pine", ["pine", "tree", "conifer", "fir"], 5),
    ("2024-08-02", "Dead Tree", "nature/dead-tree", ["dead", "tree", "bare"], 5),
    ("2024-08-02", "Twisted Tree", "nature/twisted-tree", ["twisted", "tree", "spooky", "gnarled"], 5),
    ("2024-08-02", "Bush", "nature/bush", ["bush", "shrub"], 5),
    ("2024-08-02", "Bush with Flowers", "nature/flower-bush", ["bush", "flowers", "flowering", "shrub"], 2),
    ("2024-08-02", "Rock Medium", "nature/rock", ["rock", "stone", "boulder"], 3),
    ("2024-08-02", "Pebble Round", "nature/pebble", ["pebble", "small", "rock", "stone"], 2),
    ("2024-08-02", "Fern", "nature/fern", ["fern", "plant"], 2),
    ("2024-08-02", "Plant Big", "nature/plant", ["plant", "leafy"], 2),
    ("2024-08-02", "Flower Group", "nature/flowers", ["flowers", "flower", "flowerbed"], 2),
    ("2024-08-02", "Mushroom", "nature/mushroom", ["mushroom", "toadstool", "fungus"], 2),
    ("2024-08-02", "Tall Grass", "nature/reed", ["reed", "tall", "grass", "reeds"], 2),
    ("2024-08-02", "Grass", "nature/grass", ["grass", "tuft"], 2),
    ("2021-08-26", "Cactus", "nature/cactus", ["cactus", "desert"], 2),
    ("2021-08-26", "Cactus Flowers", "nature/cactus", ["cactus", "flowering", "desert"], 1),
    ("2021-08-26", "Birch Tree", "nature/birch", ["birch", "tree"], 2),
    ("2021-08-26", "Autumn Tree", "nature/autumn-tree", ["autumn", "tree", "maple", "fall"], 2),
    ("2021-08-26", "Willow", "nature/willow", ["willow", "tree", "weeping"], 1),
    ("2021-08-26", "Pine Tree with Snow", "nature/snowy-pine", ["snowy", "snow", "pine", "tree", "winter"], 1),
    ("2021-08-26", "Bush Snow", "nature/snowy-bush", ["snowy", "snow", "bush", "winter"], 1),
    ("2021-08-26", "Rock Snow", "nature/snowy-rock", ["snowy", "snow", "rock", "winter"], 1),
    ("2021-08-26", "Wood Log with Moss", "nature/log", ["log", "fallen", "wood", "trunk"], 1),
    ("2021-08-26", "Tree Stump with Moss", "nature/stump", ["stump", "tree", "wood"], 1),
    ("2021-08-26", "Lilypad", "nature/lilypad", ["lilypad", "lily", "pond"], 1),
    ("2023-11-05", "Palm Tree", "nature/palm", ["palm", "tree", "tropical", "coconut"], 3),
    ("2023-08-20", "Big Crystal", "nature/crystal", ["crystal", "gem", "magic", "glowing"], 1),
    ("2023-08-20", "Crystal", "nature/crystal", ["crystal", "gem", "magic"], 2),
    # --- alien / sci-fi plants (2023-03-13) ---
    ("2023-03-13", "Tree Blob", "nature/alien-tree", ["alien", "tree", "blob", "scifi", "planet"], 2),
    ("2023-03-13", "Tree Spiral", "nature/alien-tree", ["alien", "tree", "spiral", "scifi"], 2),
    ("2023-03-13", "Tree Light", "nature/alien-tree", ["alien", "tree", "glowing", "light", "scifi"], 1),
    ("2023-03-13", "Tree Lava", "nature/alien-tree", ["lava", "tree", "volcanic", "alien", "burnt"], 1),
    ("2023-03-13", "Tree Floating", "nature/alien-tree", ["floating", "tree", "alien", "magic"], 1),
    # --- medieval / fantasy village (2021-10-03, 2022-07-11) ---
    ("2021-10-03", "Fantasy House", "buildings/medieval/house", ["house", "cottage", "home", "medieval", "village", "fantasy", "building"], 3),
    ("2021-10-03", "Fantasy Inn", "buildings/medieval/inn", ["inn", "tavern", "pub", "medieval", "building"], 1),
    ("2021-10-03", "Fantasy Sawmill", "buildings/medieval/sawmill", ["sawmill", "mill", "lumber", "medieval", "building"], 1),
    ("2021-10-03", "Fantasy Stable", "buildings/medieval/stable", ["stable", "stables", "horse", "medieval", "building"], 1),
    ("2021-10-03", "Fantasy Barracks", "buildings/medieval/barracks", ["barracks", "guardhouse", "medieval", "building"], 1),
    ("2021-10-03", "Bell Tower", "buildings/medieval/bell-tower", ["bell", "tower", "belfry", "church", "chapel", "medieval"], 1),
    ("2021-10-03", "Blacksmith", "buildings/medieval/blacksmith", ["blacksmith", "forge", "smithy", "medieval", "building"], 1),
    ("2021-10-03", "Mill", "buildings/medieval/watermill", ["watermill", "mill", "medieval", "building"], 1),
    ("2021-10-03", "Tent", "props/tent", ["tent", "camp", "canvas"], 1),
    ("2022-07-11", "Well", "props/well", ["well", "water", "village"], 1),
    ("2022-07-11", "Market Stand", "props/market-stall", ["stall", "market", "stand", "booth", "vendor"], 2),
    ("2022-07-11", "Gazebo", "props/gazebo", ["gazebo", "pavilion", "bandstand"], 1),
    ("2022-07-11", "Bench", "props/bench", ["bench", "seat"], 2),
    ("2022-07-11", "Barrel", "props/barrel", ["barrel", "cask"], 1),
    ("2022-07-11", "Crate", "props/crate", ["crate", "box", "wooden"], 1),
    ("2022-07-11", "Cart", "props/cart", ["cart", "wagon", "handcart"], 1),
    ("2022-07-11", "Bell", "props/bell", ["bell", "gong"], 1),
    ("2022-07-11", "Bonfire", "props/campfire", ["campfire", "bonfire", "fire", "firepit"], 1),
    ("2022-07-11", "Hay", "props/hay", ["hay", "haystack", "bale"], 1),
    ("2022-07-11", "Fence", "props/fence", ["fence", "wooden"], 1),
    ("2022-07-11", "Cauldron", "props/cauldron", ["cauldron", "pot", "witch"], 1),
    ("2021-10-03", "Torch", "props/torch", ["torch", "lantern", "light"], 1),
    ("2021-10-03", "Lamp", "props/lamp", ["lamp", "lantern", "light"], 1),
    ("2021-09-30", "Stag Statue", "landmarks/statue", ["statue", "stag", "monument", "sculpture"], 1),
    ("2021-09-30", "Fox Statue", "landmarks/statue", ["statue", "fox", "monument", "sculpture"], 1),
    ("2021-08-31", "Horse Statue", "landmarks/statue", ["statue", "horse", "monument", "sculpture", "equestrian"], 1),
    # --- castles, towers, temples (2022-09-04 strategy kit, 2022-03-04) ---
    ("2022-09-04", "Castle", "landmarks/castle", ["castle", "fortress", "keep"], 2),
    ("2022-09-04", "Castle Fortress", "landmarks/castle", ["castle", "fortress", "citadel"], 1),
    ("2022-09-04", "Watch Tower", "landmarks/watchtower", ["watchtower", "tower", "lookout", "wooden"], 2),
    ("2022-09-04", "Stone Tower", "landmarks/stone-tower", ["tower", "stone", "keep"], 2),
    ("2022-09-04", "Windmill", "landmarks/windmill", ["windmill", "mill"], 2),
    ("2022-09-04", "Temple", "landmarks/temple", ["temple", "shrine", "sanctuary"], 2),
    ("2022-09-04", "Wodden Temple", "landmarks/temple", ["temple", "wooden", "shrine", "pagoda"], 1),
    ("2022-09-04", "Wooden Monument", "landmarks/monument", ["monument", "totem", "wooden", "obelisk"], 1),
    ("2022-09-04", "Mine", "buildings/mine", ["mine", "mineshaft", "cave", "entrance"], 1),
    ("2022-09-04", "Port", "buildings/harbour", ["port", "harbour", "harbor", "dock"], 1),
    ("2022-03-04", "Guard Tower", "landmarks/guard-tower", ["guard", "tower", "watchtower"], 1),
    ("2022-03-04", "Bridge", "props/bridge", ["bridge", "footbridge"], 1),
    ("2023-05-05", "Torii Gate", "landmarks/torii", ["torii", "gate", "japanese", "shrine"], 1),
    # --- farm and countryside (2021-08-15) ---
    ("2021-08-15", "Barn", "buildings/farm/barn", ["barn", "farm", "building"], 1),
    ("2021-08-15", "Big Barn", "buildings/farm/barn", ["barn", "farm", "big", "building"], 1),
    ("2021-08-15", "Small Barn", "buildings/farm/barn", ["barn", "shed", "farm", "small"], 1),
    ("2021-08-15", "Silo", "buildings/farm/silo", ["silo", "grain", "farm"], 1),
    ("2021-08-15", "Silo House", "buildings/farm/farmhouse", ["farmhouse", "farm", "house", "silo"], 1),
    ("2021-08-15", "ChickenCoop", "buildings/farm/chicken-coop", ["chicken", "coop", "henhouse", "farm"], 1),
    ("2021-08-15", "Tower Windmill", "landmarks/windmill", ["windmill", "tower", "farm"], 1),
    # --- modern town and city (2021-08-18, 2024-03-17) ---
    ("2021-08-18", "Building", "buildings/modern/office", ["building", "office", "apartment", "block", "modern", "city", "tower"], 1),
    ("2021-08-18", "Big Building", "buildings/modern/office", ["building", "office", "apartment", "block", "modern", "city", "big", "tower"], 1),
    ("2021-08-18", "Small Building", "buildings/modern/shop", ["building", "shop", "store", "modern", "city", "small"], 1),
    ("2021-08-18", "House", "buildings/modern/house", ["house", "home", "modern", "suburban", "building"], 2),
    ("2021-08-18", "Town House", "buildings/modern/townhouse", ["townhouse", "town", "house", "terraced", "building"], 3),
    ("2021-08-18", "Large Town House", "buildings/modern/townhouse", ["townhouse", "town", "house", "large", "building"], 1),
    ("2024-03-17", "Water Tower", "landmarks/water-tower", ["water", "tower", "tank"], 1),
    ("2024-03-17", "Street Light", "props/streetlight", ["streetlight", "street", "lamp", "light", "lamppost"], 1),
    ("2024-03-17", "Traffic Light", "props/traffic-light", ["traffic", "light", "signal"], 1),
    ("2024-03-17", "Fire Hydrant", "props/hydrant", ["hydrant", "fire"], 1),
    ("2024-03-17", "Traffic Cone", "props/cone", ["cone", "traffic"], 1),
    ("2024-03-17", "Traffic Barrier", "props/barrier", ["barrier", "roadblock", "traffic"], 1),
    ("2024-03-17", "Container Green", "props/dumpster", ["dumpster", "skip", "bin", "container"], 1),
    ("2024-03-17", "Trash Bags", "props/trash", ["trash", "rubbish", "bags", "garbage"], 1),
    ("2024-03-17", "Town Sign", "props/sign", ["sign", "signpost", "town"], 1),
    ("2024-03-17", "Pallet", "props/pallet", ["pallet", "wooden"], 1),
    # --- futuristic / sci-fi colony (2023-03-13, 2022-08-28, 2022-06-21) ---
    ("2023-03-13", "Base Large", "buildings/scifi/base", ["base", "outpost", "scifi", "futuristic", "building", "headquarters", "space"], 1),
    ("2023-03-13", "Building L", "buildings/scifi/building", ["building", "scifi", "futuristic", "modern", "lab", "laboratory"], 1),
    ("2023-03-13", "Geodesic Dome", "buildings/scifi/dome", ["dome", "geodesic", "habitat", "scifi", "futuristic", "greenhouse"], 1),
    ("2023-03-13", "House Pod", "buildings/scifi/habitat", ["habitat", "pod", "house", "scifi", "futuristic", "colony", "space"], 1),
    ("2023-03-13", "House Cylinder", "buildings/scifi/habitat", ["habitat", "house", "cylinder", "scifi", "futuristic", "colony"], 1),
    ("2023-03-13", "House Long", "buildings/scifi/habitat", ["habitat", "house", "long", "scifi", "futuristic", "colony"], 1),
    ("2023-03-13", "House Single", "buildings/scifi/habitat", ["habitat", "house", "scifi", "futuristic", "colony", "module"], 1),
    ("2023-03-13", "Roof Radar", "props/radar", ["radar", "dish", "antenna", "scifi"], 1),
    ("2023-03-13", "Solar Panel Structure", "props/solar-panel", ["solar", "panel", "panels", "energy", "scifi"], 1),
    ("2023-03-13", "Spaceship", "vehicles/spaceship", ["spaceship", "ship", "rocket", "spacecraft", "scifi", "shuttle"], 4),
    ("2023-03-13", "Rover", "vehicles/rover", ["rover", "buggy", "vehicle", "scifi", "moon", "mars"], 2),
    ("2023-03-13", "Round Rover", "vehicles/rover", ["rover", "vehicle", "scifi", "round"], 1),
    ("2023-03-13", "Mech", "props/mech", ["mech", "robot", "walker", "scifi"], 2),
    ("2022-08-28", "Cyberpunk Platform", "buildings/cyberpunk/platform", ["cyberpunk", "platform", "building", "futuristic", "neon", "scifi"], 4),
    ("2022-08-28", "Streetlight", "props/streetlight", ["streetlight", "street", "lamp", "light", "futuristic", "neon"], 2),
    ("2022-08-28", "Cyberpunk Signs", "props/neon-sign", ["sign", "neon", "cyberpunk", "billboard"], 1),
    ("2022-08-28", "TV Tower", "landmarks/tv-tower", ["tower", "antenna", "radio", "broadcast", "futuristic", "tv"], 1),
    ("2022-06-21", "Scifi Container", "props/scifi-container", ["container", "cargo", "scifi"], 1),
    ("2022-06-21", "Scifi Pod", "props/scifi-pod", ["pod", "capsule", "cryo", "scifi"], 1),
    ("2022-06-21", "Teleporter Base", "props/teleporter", ["teleporter", "portal", "pad", "scifi"], 1),
    # --- harbour, ships and boats (2023-11-05, 2022-06-20, 2021-08-17) ---
    ("2023-11-05", "Ship", "vehicles/ship", ["ship", "galleon", "pirate", "sailing", "boat"], 1),
    ("2023-11-05", "Small Ship", "vehicles/ship", ["ship", "sloop", "boat", "sailing"], 1),
    ("2023-11-05", "Dock", "props/dock", ["dock", "pier", "jetty", "wharf"], 1),
    ("2023-11-05", "House", "buildings/pirate/house", ["house", "shack", "wooden", "pirate", "fishing", "hut"], 3),
    ("2023-11-05", "Cannon", "props/cannon", ["cannon", "artillery"], 1),
    ("2023-11-05", "Anchor", "props/anchor", ["anchor"], 1),
    ("2023-11-05", "Chest Gold", "props/treasure-chest", ["chest", "treasure", "gold"], 1),
    ("2022-06-20", "Boat", "vehicles/boat", ["boat", "rowboat", "fishing"], 1),
    ("2022-06-20", "Dock Long", "props/dock", ["dock", "pier", "jetty", "long"], 1),
    ("2021-08-17", "Sail Boat", "vehicles/boat", ["boat", "sailboat", "sailing", "yacht"], 1),
    ("2021-08-17", "Sail Ship", "vehicles/ship", ["ship", "sailing", "tall", "galleon"], 1),
    ("2021-08-17", "Viking Boat", "vehicles/boat", ["boat", "viking", "longship"], 1),
    # --- cars and trains (drivable ones are found by name: car, truck, rover…) ---
    ("2021-08-15", "Car", "vehicles/car", ["car", "sedan", "vehicle"], 2),
    ("2021-08-15", "SUV", "vehicles/car", ["car", "suv", "jeep", "vehicle"], 1),
    ("2021-08-15", "Taxi", "vehicles/car", ["car", "taxi", "cab", "vehicle"], 1),
    ("2021-08-15", "Police Car", "vehicles/car", ["car", "police", "vehicle"], 1),
    ("2024-03-17", "Pickup Truck", "vehicles/truck", ["truck", "pickup", "vehicle"], 1),
    ("2024-03-17", "Truck", "vehicles/truck", ["truck", "lorry", "vehicle"], 1),
    ("2021-08-26", "Locomotive Front", "vehicles/train", ["train", "locomotive", "steam", "engine"], 1),
    ("2021-08-26", "Cargo Train Front", "vehicles/train", ["train", "cargo", "freight", "locomotive"], 1),
    # --- wildlife (rigged, animated) ---
    ("2021-09-07", "Deer", "animals/deer", ["deer", "animal"], 1),
    ("2021-09-07", "Stag", "animals/deer", ["deer", "stag", "animal"], 1),
    # No rabbit: Quaternius' CC0 "Rabbit" and "Bunny" are upright cartoon characters, not wildlife.
]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    catalogue_path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    headers = {"X-Auth-Token": os.environ["POLY_PIZZA_KEY"]}
    with httpx.Client(timeout=30, follow_redirects=True) as c:
        if catalogue_path and catalogue_path.exists():
            models = json.loads(catalogue_path.read_text(encoding="utf-8"))
        else:
            models, seen = [], set()
            for page in range(200):
                batch = [m for m in c.get("https://api.poly.pizza/v1/user/Quaternius", params={"limit": 32, "page": page}, headers=headers).json().get("models", []) if m["ID"] not in seen]
                if not batch:
                    break
                seen.update(m["ID"] for m in batch)
                models += batch
        cc0 = [m for m in models if "publicdomain/zero" in (m.get("Attribution") or "")]
        entries, report = [], []
        for day, title, folder, tags, most in SPEC:
            found = sorted((m for m in cc0 if (m.get("Uploaded") or "")[:10] == day and m["Title"] == title), key=lambda m: m["ID"])[:most]
            if not found:
                report.append(f"MISSING {day} {title}")
            for i, m in enumerate(found):
                rel = f"quaternius/{folder}/{slug(title)}{'-' + str(i + 1) if len(found) > 1 else ''}.glb"
                path = ROOT / rel
                if not path.exists():
                    path.parent.mkdir(parents=True, exist_ok=True)
                    r = c.get(m["Download"])
                    r.raise_for_status()
                    path.write_bytes(r.content)
                size = glb_size(path.read_bytes())
                tags = RETAGGED.get(rel, tags)
                entries.append({"id": slug(rel), "file": rel, "tags": sorted(set(tags)), **needs_for(rel, sorted(set(tags))), "license": LICENSE, "source": "quaternius",
                                "title": title, "poly": m["ID"], "size": [round(v, 3) for v in size] if size else None})
                report.append(f"{rel}  {size}  {path.stat().st_size // 1024} KB")
    manifest = ROOT / "manifest.json"
    old = [e for e in json.loads(manifest.read_text(encoding="utf-8")) if not e["file"].startswith("quaternius/")] if manifest.exists() else []
    manifest.write_text(json.dumps(old + entries, indent=1), encoding="utf-8")
    print("\n".join(report))
    print(f"{len(entries)} curated models; {sum((ROOT / e['file']).stat().st_size for e in entries) // 1024 // 1024} MB")


if __name__ == "__main__":
    main()
