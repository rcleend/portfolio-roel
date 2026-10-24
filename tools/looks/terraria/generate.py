#!/usr/bin/env python3
"""The Terraria look's heroes: every animation of the three Roels and their attack sprites.

    python3 tools/looks/terraria/generate.py           # write src/game/art/looks/terraria/
    python3 tools/looks/terraria/generate.py --check   # fail if the committed files differ from what this writes

Every frame is composed from the hand-placed parts in kit/ (body.py, outfits.py, limbs.py, props.py), posed
the way Terraria poses its player (pose.py, moves.py, heroes.py), so no frame is ever drawn twice by hand
and the head is the same pixels in all of them. Writes, per hero, characters/<hero>/sheet.png + .json (the
eight hero animations and any skill he poses his own way, 64 x 64 frames, feet on the bottom-centre origin)
and attack.png + .json (its projectile, impact and muzzle strip), both as docs/LOOKS.md describes them.
Beside them it writes revised/<design>/sheet.png + .json, the revision's designs (kit/revision.py) posed
in every animation of their hero, which the playground compares with the look's and the game never loads.
Python 3.9+ and Pillow only; the same code writes the same bytes, which is what --check relies on.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Tuple

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = REPO / 'src' / 'game' / 'art' / 'looks' / 'terraria'

if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from kit import attacks, revision  # noqa: E402
from kit.art import FRAME, GROUND, ORIGIN, to_frame  # noqa: E402
from kit.heroes import MOVES  # noqa: E402
from kit.moves import CROWN, Animation, fall, hurt, idle, jump, run, victory  # noqa: E402
from kit.outfits import OUTFITS, Outfit  # noqa: E402
from kit.pose import carried, compose, grounded  # noqa: E402
from kit.sheet import Strip, pack  # noqa: E402

HERO_ANIMATIONS = ('idle', 'run', 'jump', 'fall', 'attack', 'skill', 'hurt', 'victory')


def animations(hero: str) -> List[Animation]:
    """The eight hero animations in the contract's order, then the skills he poses his own way."""
    moves = MOVES[hero]
    shared = [idle(), run(), jump(), fall(), moves.attack(), moves.skill(), hurt(), victory()]
    names = tuple(move.name for move in shared)
    if names != HERO_ANIMATIONS:
        raise ValueError(f'{hero}: animations are {names}, not {HERO_ANIMATIONS}')
    own = [pose() for pose in moves.own]
    for move in own:
        if not move.name.startswith('skill-'):
            raise ValueError(f'{hero}: {move.name} is not a skill pose (skill-<skillId>)')
    return shared + own


def strip(design: str, outfit: Outfit, animation: Animation) -> Strip:
    """`animation` worn in `outfit`; `design` names the sheet in errors."""
    pictures = []
    for index, frame in enumerate(animation.frames):
        where = f'{design} {animation.name}[{index}]'
        picture = compose(outfit, frame.pose, where)
        check_feet(picture, frame.pose, where)
        pictures.append(picture)
    names = sorted({name for frame in animation.frames for name in frame.anchors})
    anchors = {}
    for name in names:
        missing = [index for index, frame in enumerate(animation.frames) if name not in frame.anchors]
        if missing:
            raise ValueError(f'{design} {animation.name}: frames {missing} have no {name} anchor')
        anchors[name] = tuple(to_frame(frame.anchors[name]) for frame in animation.frames)
    # Every frame marks the top of his head, since the hero is drawn smaller than his frame (docs/LOOKS.md).
    anchors['head'] = tuple(to_frame(carried(CROWN, frame.pose)) for frame in animation.frames)
    return Strip(animation.name, animation.fps, animation.loop, tuple(pictures), anchors)


def check_feet(picture, pose, where: str) -> None:
    """A grounded frame stands on the feet line; an airborne one may leave it, but never sinks below."""
    bottom = picture.getbbox()[3] - 1
    if grounded(pose) and bottom != to_frame((0, GROUND))[1]:
        raise ValueError(f'{where}: stands on row {bottom}, not on the feet line')


def sheet(design: str, hero: str, outfit: Outfit) -> Tuple[bytes, bytes]:
    """The PNG and JSON of the sheet at `design`: every animation of `hero`, worn in `outfit`."""
    return pack([strip(design, outfit, animation) for animation in animations(hero)], FRAME, ORIGIN)


def outputs() -> Dict[str, bytes]:
    files: Dict[str, bytes] = {}
    for hero, outfit in OUTFITS.items():
        where = f'characters/{hero}'
        files[f'{where}/sheet.png'], files[f'{where}/sheet.json'] = sheet(where, hero, outfit)
        png, json = pack(attacks.strips(hero), attacks.FRAME, attacks.ORIGIN)
        files[f'{where}/attack.png'] = png
        files[f'{where}/attack.json'] = json
    for name, design in revision.DESIGNS.items():
        where = f'revised/{name}'
        files[f'{where}/sheet.png'], files[f'{where}/sheet.json'] = sheet(where, design.hero, design.outfit)
    return files


def written() -> List[Path]:
    """Every file this script owns that is already on disk, so --check also catches a stale leftover."""
    owned = [*OUT.glob('characters/*/*'), *OUT.glob('revised/*/*')]
    return sorted(path for path in owned if path.suffix in ('.png', '.json'))


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='verify the committed files instead of writing')
    args = parser.parse_args(argv)
    files = outputs()
    if args.check:
        stale = [name for name, data in files.items() if not (OUT / name).exists() or (OUT / name).read_bytes() != data]
        extra = [str(path.relative_to(OUT)) for path in written() if str(path.relative_to(OUT)) not in files]
        for name in stale + extra:
            print(f'stale: {(OUT / name).relative_to(REPO)}', file=sys.stderr)
        return 1 if stale or extra else 0
    for name, data in files.items():
        (OUT / name).parent.mkdir(parents=True, exist_ok=True)
        (OUT / name).write_bytes(data)
    print(f'wrote {len(files)} files to {OUT.relative_to(REPO)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
