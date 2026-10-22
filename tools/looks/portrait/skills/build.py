#!/usr/bin/env python3
"""Draws the portrait look of all six skills: icons and effect strips.

  build.py                    # write src/game/art/looks/portrait/skills/<skillId>/*.png + *.json
  build.py north-star         # only some skills
  build.py --check            # rebuild in memory and fail if a committed file differs

Every pixel comes from the generators in `portrait_fx/` (geometry and
hand-placed character art, no image generation), so a rebuild is
deterministic and byte-stable. Output follows the look-asset contract in
ASSETS.md: one row per animation, alpha 0 or 255, a few dozen colours.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path
from typing import List, Sequence

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OUT = REPO / "src" / "game" / "art" / "looks" / "portrait" / "skills"
sys.path.insert(0, str(HERE))

from portrait_fx.sheet import validate_files  # noqa: E402
from portrait_fx.skills import SKILLS  # noqa: E402


def build(skill_ids: Sequence[str], out: Path) -> List[Path]:
    written: List[Path] = []
    for skill_id in skill_ids:
        directory = out / skill_id
        for strip in SKILLS[skill_id].strips():
            png, manifest = strip.write(directory)
            problems = validate_files(png, manifest)
            if problems:
                raise SystemExit("\n".join(problems))
            written += [png, manifest]
    return written


def check(skill_ids: Sequence[str]) -> int:
    """Rebuilds into a scratch directory and compares every byte with the committed assets."""
    stale = []
    with tempfile.TemporaryDirectory() as scratch:
        for path in build(skill_ids, Path(scratch)):
            committed = OUT / path.relative_to(scratch)
            if not committed.exists() or committed.read_bytes() != path.read_bytes():
                stale.append(str(committed.relative_to(REPO)))
        expected = {p.relative_to(scratch) for p in Path(scratch).rglob("*") if p.is_file()}
    for skill_id in skill_ids:
        # Only art is generated; the hand-written index.ts beside it is not ours to judge.
        for path in sorted((OUT / skill_id).glob("*")):
            if path.suffix in (".png", ".json") and path.relative_to(OUT) not in expected:
                stale.append(f"{path.relative_to(REPO)} (not produced by the generators)")
    for line in stale:
        print(f"stale: {line}")
    return 1 if stale else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("skills", nargs="*", help=f"skill ids (default: all of {', '.join(SKILLS)})")
    parser.add_argument("--check", action="store_true", help="verify committed assets are up to date")
    args = parser.parse_args()
    unknown = [s for s in args.skills if s not in SKILLS]
    if unknown:
        parser.error(f"unknown skill ids: {', '.join(unknown)}")
    skill_ids = args.skills or list(SKILLS)
    if args.check:
        return check(skill_ids)
    for path in build(skill_ids, OUT):
        print(path.relative_to(REPO))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
