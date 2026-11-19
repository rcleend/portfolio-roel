#!/usr/bin/env python3
"""Builds the arcade look's skill art: every icon and effect strip, as PNG + JSON (ASSETS.md).

    python3 tools/looks/arcade/skills/build.py                 # all six skills
    python3 tools/looks/arcade/skills/build.py north-star      # just one
    python3 tools/looks/arcade/skills/build.py --check         # fail if the checkout's files are stale (PNGs by
                                                               # their pixels, once exported: tools/looks/artfiles.py)

Everything is drawn by code in ``skillart/`` (no generated images), so the
output is deterministic: the same checkout always writes the same bytes.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path
from typing import List, Sequence

HERE = Path(__file__).resolve().parent
for _path in (HERE, HERE.parents[1]):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

import artfiles  # noqa: E402

from pixkit import sheet  # noqa: E402
from skillart import SKILLS  # noqa: E402

REPO_ROOT = HERE.parents[3]
OUTPUT = REPO_ROOT / "src/game/art/looks/arcade/skills"


def build(skill_ids: Sequence[str], output: Path) -> List[Path]:
    written: List[Path] = []
    for skill_id in skill_ids:
        for name, strip in SKILLS[skill_id]().items():
            written.extend(sheet.write(strip, output / skill_id, name))
    return written


def exported(skill_ids: Sequence[str]) -> bool:
    """Whether the skills' PNGs are in the checkout (tools/looks/artfiles.py): they are only while exported."""
    return artfiles.exported(path for skill_id in skill_ids for path in (OUTPUT / skill_id).glob("*.png"))


def stale(skill_ids: Sequence[str]) -> List[str]:
    """Files a fresh build would change, or that a fresh build no longer writes.

    Manifests must match byte for byte and images pixel for pixel; while the PNGs are not exported, only the
    manifests are compared.
    """
    problems: List[str] = []
    pngs = exported(skill_ids)
    with tempfile.TemporaryDirectory() as scratch:
        fresh = Path(scratch)
        for path in build(skill_ids, fresh):
            relative = path.relative_to(fresh)
            if (pngs or path.suffix != ".png") and not artfiles.same(OUTPUT / relative, path):
                problems.append(str(relative))
        for skill_id in skill_ids:
            expected = {p.name for p in (fresh / skill_id).iterdir()}
            # Only the sheets are generated: the art modules and the hand-written index.ts beside them are not.
            for path in sorted((OUTPUT / skill_id).glob("*")):
                if path.suffix in (".png", ".json") and path.name not in expected:
                    problems.append(f"{skill_id}/{path.name} (no longer generated)")
    return problems


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("skills", nargs="*", help=f"skill ids (default: all): {', '.join(SKILLS)}")
    parser.add_argument("--check", action="store_true", help="verify instead of writing")
    args = parser.parse_args(argv)
    unknown = [skill for skill in args.skills if skill not in SKILLS]
    if unknown:
        parser.error(f"unknown skill ids: {', '.join(unknown)}")
    skill_ids = args.skills or list(SKILLS)
    if args.check:
        problems = stale(skill_ids)
        for problem in problems:
            print(f"stale: {problem}", file=sys.stderr)
        if not exported(skill_ids):
            print(artfiles.EXPORT_HINT, file=sys.stderr)
            return 1 if problems else 2
        return 1 if problems else 0
    for path in build(skill_ids, OUTPUT):
        print(path.relative_to(REPO_ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
