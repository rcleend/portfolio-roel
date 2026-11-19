#!/usr/bin/env python3
"""Builds the arcade look's characters: three heroes, their attack sprites and the Unhappy Customer.

    python3 tools/looks/arcade/characters/build.py            # everything
    python3 tools/looks/arcade/characters/build.py hackerman  # one subject
    python3 tools/looks/arcade/characters/build.py --check    # fail if the checkout's files are stale (PNGs by
                                                              # their pixels, once exported: tools/looks/artfiles.py)

Writes the ASSETS.md format (sheet.png + sheet.json, attack.png + attack.json)
under src/game/art/looks/arcade/. Every pixel comes from the hand-authored kit
in `kit/`; the output is deterministic, so a rebuild of an unchanged recipe is
byte-identical.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path
from typing import Callable, Dict, List

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OUT = REPO / "src" / "game" / "art" / "looks" / "arcade"

for _path in (HERE, HERE.parents[1]):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

import artfiles  # noqa: E402

from kit import customer, effects  # noqa: E402
from kit.heroes import artsy, hackerman, strategy  # noqa: E402
from kit.rig import build_frame  # noqa: E402
from kit.sheet import Sheet, SheetAnim  # noqa: E402

HEROES = {"hackerman": hackerman, "artsy": artsy, "strategy": strategy}
HERO_ANIMATIONS = ("idle", "run", "jump", "fall", "attack", "skill", "hurt", "victory")
CUSTOMER_ANIMATIONS = ("walk", "shout", "hurt", "stunned", "happy")


def lifted(anchors, lift: int):
    """Anchors are authored in pose space; the rig raises a lifted figure, so they move with it."""
    return {name: [(x, y - lift) for x, y in points] for name, points in anchors.items()}


def render(pose, outfit, label: str):
    frame, _ = build_frame(pose, outfit)
    lost = frame.clipped()
    if lost:
        raise ValueError(f"{label}: {lost} pixels fall outside the 64x64 frame")
    return frame.render()


def hero_sheet(name: str) -> Sheet:
    module = HEROES[name]
    anims: List[SheetAnim] = []
    for anim in module.animations():
        frames = [render(pose, module.OUTFIT, f"{name}.{anim.name}[{i}]") for i, pose in enumerate(anim.poses)]
        anims.append(SheetAnim(anim.name, anim.fps, anim.loop, frames, lifted(anim.anchors, module.OUTFIT.lift)))
    names = tuple(a.name for a in anims)
    if names != HERO_ANIMATIONS:
        raise ValueError(f"{name}: animations {names} != {HERO_ANIMATIONS}")
    return Sheet(64, 64, (32, 64), anims)


def customer_sheet() -> Sheet:
    anims: List[SheetAnim] = []
    for anim, outfit in customer.animations():
        frames = [render(pose, outfit, f"customer.{anim.name}[{i}]") for i, pose in enumerate(anim.poses)]
        anims.append(SheetAnim(anim.name, anim.fps, anim.loop, frames, lifted(anim.anchors, outfit.lift)))
    names = tuple(a.name for a in anims)
    if names != CUSTOMER_ANIMATIONS:
        raise ValueError(f"customer: animations {names} != {CUSTOMER_ANIMATIONS}")
    return Sheet(64, 64, (32, 64), anims)


def targets() -> Dict[str, Callable[[Path], None]]:
    jobs: Dict[str, Callable[[Path], None]] = {}
    for name in HEROES:
        def job(root: Path, name: str = name) -> None:
            directory = root / "characters" / name
            hero_sheet(name).write(directory, "sheet")
            effects.attack_sheet(name).write(directory, "attack")

        jobs[name] = job
    jobs["customer"] = lambda root: customer_sheet().write(root / "customer", "sheet")
    return jobs


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("subjects", nargs="*", help="hackerman, artsy, strategy, customer (default: all)")
    parser.add_argument("--check", action="store_true", help="rebuild into a temp dir and compare with the repo")
    args = parser.parse_args(argv)
    jobs = targets()
    chosen = args.subjects or list(jobs)
    for subject in chosen:
        if subject not in jobs:
            parser.error(f"unknown subject {subject!r}")
    if not args.check:
        for subject in chosen:
            jobs[subject](OUT)
            print(f"built {subject}")
        return 0
    stale: List[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for subject in chosen:
            jobs[subject](root)
        fresh = [path for path in sorted(root.rglob("*")) if path.is_file()]
        # The PNGs are in the checkout only while exported (artfiles.py): without them the JSON is all there is to check.
        exported = artfiles.exported(OUT / path.relative_to(root) for path in fresh)
        for path in fresh:
            committed = OUT / path.relative_to(root)
            if (exported or path.suffix != ".png") and not artfiles.same(committed, path):
                stale.append(str(committed.relative_to(REPO)))
    if stale:
        print("stale or missing (run build.py):\n  " + "\n  ".join(stale))
    if not exported:
        print(artfiles.EXPORT_HINT)
        return 1 if stale else 2
    if stale:
        return 1
    print("up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
