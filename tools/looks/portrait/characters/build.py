#!/usr/bin/env python3
"""Builds the portrait look's characters and customer.

  python3 tools/looks/portrait/characters/build.py            # write everything
  python3 tools/looks/portrait/characters/build.py --check    # verify committed outputs are current
  python3 tools/looks/portrait/characters/build.py --only artsy,customer

Writes, under src/game/art/looks/portrait/:
  characters/<id>/sheet.png + sheet.json   the 8 hero animations, 64x64, origin (32, 64)
  characters/<id>/attack.png + attack.json the hero's projectile, impact and muzzle sprites
  customer/sheet.png + sheet.json          the 5 customer animations, 64x64, origin (32, 64)

Python 3.9+ and Pillow only. Output is deterministic: the same code writes
the same bytes, which is what --check relies on.
"""

from __future__ import annotations

import argparse
import importlib
import io
import sys
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(1, str(HERE.parents[1]))

import artfiles  # noqa: E402
from portraitkit import body, customer, effects  # noqa: E402
from portraitkit.sheet import Strip, dumps, pack  # noqa: E402
from portraitkit.skeleton import solve  # noqa: E402

REPO = HERE.parents[3]
OUT = REPO / "src" / "game" / "art" / "looks" / "portrait"
HEROES = ("hackerman", "artsy", "strategy")
HERO_ORDER = ("idle", "run", "jump", "fall", "attack", "skill", "hurt", "victory")
CUSTOMER_ORDER = ("walk", "shout", "hurt", "stunned", "happy")
FRAME = (64, 64)
ORIGIN = (32, 64)


def _round(p: Tuple[float, float]) -> Tuple[int, int]:
    import math

    return (int(math.floor(p[0])), int(math.floor(p[1])))


def hero_strips(hero_id: str) -> List[Strip]:
    mod = importlib.import_module(f"portraitkit.heroes.{hero_id}")
    ch = mod.character()
    anims = {a.name: a for a in mod.animations()}
    strips = []
    for name in HERO_ORDER:
        anim = anims[name]
        frames, anchors = [], {}
        for pose in anim.poses:
            frames.append(body.render(ch, pose).image(ch.palette))
            for key, point in mod.anchors(name, pose, solve(pose, ch.build)).items():
                anchors.setdefault(key, []).append(_round(point))
        strips.append(Strip(name, anim.fps, anim.loop, frames, anchors))
    return strips


def customer_strips() -> List[Strip]:
    anims = {a.name: (a, calm) for a, calm in customer.animations()}
    strips = []
    for name in CUSTOMER_ORDER:
        anim, calm = anims[name]
        ch = customer.character(calm)
        frames, anchors = [], {}
        for pose in anim.poses:
            frames.append(body.render(ch, pose).image(ch.palette))
            for key, point in customer.anchors(name, pose, solve(pose, ch.build)).items():
                anchors.setdefault(key, []).append(_round(point))
        strips.append(Strip(name, anim.fps, anim.loop, frames, anchors))
    return strips


def outputs(only: Sequence[str]) -> Dict[Path, bytes]:
    """Every file this build owns, as bytes, keyed by its path."""
    files: Dict[Path, bytes] = {}

    def add(directory: Path, stem: str, strips: List[Strip], frame, origin) -> None:
        sheet, meta = pack(strips, frame[0], frame[1], origin)
        buf = io.BytesIO()
        sheet.save(buf, format="PNG", optimize=True)
        files[directory / f"{stem}.png"] = buf.getvalue()
        files[directory / f"{stem}.json"] = dumps(meta).encode()

    for hero_id in HEROES:
        if only and hero_id not in only:
            continue
        add(OUT / "characters" / hero_id, "sheet", hero_strips(hero_id), FRAME, ORIGIN)
        strips, frame, origin = effects.attack(hero_id)
        add(OUT / "characters" / hero_id, "attack", strips, frame, origin)
    if not only or "customer" in only:
        add(OUT / "customer", "sheet", customer_strips(), FRAME, ORIGIN)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", default="", help="comma-separated: hackerman,artsy,strategy,customer")
    parser.add_argument("--check", action="store_true", help="fail if committed outputs differ from a fresh build")
    args = parser.parse_args()
    only = [s for s in args.only.split(",") if s]
    files = outputs(only)
    stale = []
    # The PNGs are in the checkout only while exported (artfiles.py): without them the JSON is all there is to check.
    exported = artfiles.exported(files)
    for path, data in sorted(files.items()):
        if args.check:
            if (exported or path.suffix != ".png") and not artfiles.same(path, data):
                stale.append(path)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        print(f"wrote {path.relative_to(REPO)}")
    if stale:
        for path in stale:
            print(f"stale: {path.relative_to(REPO)}", file=sys.stderr)
        return 1
    if args.check and not exported:
        print(artfiles.EXPORT_HINT, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
