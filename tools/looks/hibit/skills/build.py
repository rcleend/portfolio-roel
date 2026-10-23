#!/usr/bin/env python3
"""Builds the hibit look's six skills into src/game/art/looks/hibit/skills/<skillId>/.

  python3 tools/looks/hibit/skills/build.py                 # every skill
  python3 tools/looks/hibit/skills/build.py north-star      # one skill
  python3 tools/looks/hibit/skills/build.py --check         # committed files == a fresh build?

Every sprite is drawn in code (``hibitfx/skills/*.py``): hand-placed pixel
maps for the objects (the Strat, the potion masks, hearts, notes) and
deterministic whole-pixel geometry for light and motion (beams, rings,
flares, bubbles). No image generation and no randomness, so a rebuild is
pixel-identical. Each skill writes ``icon.png``/``icon.json`` plus its
``fx-*.png``/``fx-*.json`` strips in the looks sheet format.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional, Sequence

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from PIL import Image  # noqa: E402

from hibitfx.sheet import Sheet, dump_json  # noqa: E402
from hibitfx.skills import SKILLS  # noqa: E402

REPO = HERE.parents[3]
OUT = REPO / "src" / "game" / "art" / "looks" / "hibit" / "skills"


def build(skill: str) -> List[Sheet]:
    sheets = SKILLS[skill].sheets()
    names = [s.name for s in sheets]
    if names[0] != "icon" or len(set(names)) != len(names):
        raise ValueError(f"{skill}: expected icon first and unique sheet names, got {names}")
    return sheets


def write(skill: str) -> List[Path]:
    paths: List[Path] = []
    for sheet in build(skill):
        paths.extend(sheet.write(OUT / skill))
    return paths


def check(skill: str) -> List[str]:
    """Differences between the committed files and a fresh build (pixels and JSON text)."""
    problems: List[str] = []
    directory = OUT / skill
    expected = {s.name: s for s in build(skill)}
    present = {p.stem for p in directory.glob("*.json")} if directory.exists() else set()
    for name in sorted(present - set(expected)):
        problems.append(f"{skill}/{name}: committed but no longer generated")
    for name, sheet in expected.items():
        png, manifest = directory / f"{name}.png", directory / f"{name}.json"
        if not png.exists() or not manifest.exists():
            problems.append(f"{skill}/{name}: missing")
            continue
        if manifest.read_text() != dump_json(sheet.manifest()):
            problems.append(f"{skill}/{name}.json differs from a fresh build")
        with Image.open(png) as image:
            committed = image.convert("RGBA")
        fresh = sheet.image()
        if committed.size != fresh.size or committed.tobytes() != fresh.tobytes():
            problems.append(f"{skill}/{name}.png differs from a fresh build")
    return problems


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("skills", nargs="*", metavar="skill", help=f"any of {', '.join(SKILLS)} (default: all)")
    parser.add_argument("--check", action="store_true", help="verify instead of writing")
    args = parser.parse_args(argv)
    unknown = [s for s in args.skills if s not in SKILLS]
    if unknown:
        parser.error(f"unknown skill(s): {', '.join(unknown)}")
    skills = args.skills or list(SKILLS)
    if args.check:
        problems = [p for skill in skills for p in check(skill)]
        for problem in problems:
            print(problem)
        print("ok" if not problems else f"{len(problems)} problem(s)")
        return 1 if problems else 0
    for skill in skills:
        for path in write(skill):
            print(f"  wrote {path.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
