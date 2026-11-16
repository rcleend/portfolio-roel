#!/usr/bin/env python3
"""The Terraria looks' heroes: every animation of the three Roels and their attack sprites.

    python3 tools/looks/terraria/generate.py           # write src/game/art/looks/terraria*/
    python3 tools/looks/terraria/generate.py --check   # fail if the committed files differ from what this writes

Every frame is composed from the hand-placed parts in kit/ (body.py, outfits.py, limbs.py, props.py), posed
the way Terraria poses its player (pose.py, moves.py, heroes.py), so no frame is ever drawn twice by hand
and the head is the same pixels in all of them. Writes, per hero, characters/<hero>/sheet.png + .json (the
eight hero animations, any skill he poses his own way and their layers, 64 x 64 frames, feet on the bottom-centre
origin)
and attack.png + .json (its projectile, impact and muzzle strip), both as docs/LOOKS.md describes them, in
looks/terraria/. Beside it the revision's looks (kit/revision.py), terraria-revised and terraria-hooded, get
characters/<hero>/sheet.png + .json, the same moves in the revision's head; their attack is the look's own.
Python 3.9+ and Pillow only; the same code writes the same pixels and JSON, which is what --check relies on
(the PNGs are in the checkout only while exported: tools/looks/artfiles.py).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Tuple

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = REPO / 'src' / 'game' / 'art' / 'looks'
# The look whose heroes and attack strips this writes; the revision's looks are named in kit/revision.py.
LOOK = 'terraria'

for _path in (HERE, HERE.parent):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

import artfiles  # noqa: E402

from kit import attacks, revision  # noqa: E402
from kit.art import FRAME, GROUND, ORIGIN, to_frame  # noqa: E402
from kit.heroes import MOVES  # noqa: E402
from kit.moves import CROWN, Animation, fall, hurt, idle, jump, run, victory  # noqa: E402
from kit.outfits import OUTFITS, Outfit  # noqa: E402
from kit.pose import carried, compose, grounded  # noqa: E402
from kit.sheet import Strip, pack  # noqa: E402

HERO_ANIMATIONS = ('idle', 'run', 'jump', 'fall', 'attack', 'skill', 'hurt', 'victory')
# The moves whose legs the hero keeps while he attacks or casts, as Terraria keeps a walking or airborne
# player's legs and swings the item with the arms: each is split into `<move>-legs`, and every attack and skill
# pose into `<pose>-upper`, which the game draws over them (docs/LOOKS.md).
LAYERED_MOVES = ('run', 'jump', 'fall')


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


def layers(hero: str) -> List[Tuple[Animation, str]]:
    """The split rows after the whole-figure ones: each layered move's legs, then every action's upper body."""
    moves = {move.name: move for move in animations(hero)}
    actions = [move for move in moves.values() if move.name == 'attack' or move.name.startswith('skill')]
    return [(moves[name], 'legs') for name in LAYERED_MOVES] + [(move, 'upper') for move in actions]


def strip(design: str, outfit: Outfit, animation: Animation, layer: str = 'whole') -> Strip:
    """`animation` worn in `outfit`, or one `layer` of it as `<name>-<layer>`; `design` names the sheet in errors."""
    row = animation.name if layer == 'whole' else f'{animation.name}-{layer}'
    pictures = []
    for index, frame in enumerate(animation.frames):
        where = f'{design} {row}[{index}]'
        picture = compose(outfit, frame.pose, where, layer)
        if layer != 'upper':
            check_feet(picture, frame.pose, where)
        pictures.append(picture)
    if layer == 'legs':
        # The legs mark nothing: the game reads every anchor off the pose drawn over them.
        return Strip(row, animation.fps, animation.loop, tuple(pictures), {})
    names = sorted({name for frame in animation.frames for name in frame.anchors})
    anchors = {}
    for name in names:
        missing = [index for index, frame in enumerate(animation.frames) if name not in frame.anchors]
        if missing:
            raise ValueError(f'{design} {animation.name}: frames {missing} have no {name} anchor')
        anchors[name] = tuple(to_frame(frame.anchors[name]) for frame in animation.frames)
    # Every frame marks the top of his head, since the hero is drawn smaller than his frame (docs/LOOKS.md).
    anchors['head'] = tuple(to_frame(carried(CROWN, frame.pose)) for frame in animation.frames)
    return Strip(row, animation.fps, animation.loop, tuple(pictures), anchors)


def check_feet(picture, pose, where: str) -> None:
    """A grounded frame stands on the feet line; an airborne one may leave it, but never sinks below."""
    bottom = picture.getbbox()[3] - 1
    if grounded(pose) and bottom != to_frame((0, GROUND))[1]:
        raise ValueError(f'{where}: stands on row {bottom}, not on the feet line')


def sheet(design: str, hero: str, outfit: Outfit) -> Tuple[bytes, bytes]:
    """The PNG and JSON of the sheet at `design`: every animation of `hero`, worn in `outfit`, then its layers."""
    whole = [strip(design, outfit, animation) for animation in animations(hero)]
    split = [strip(design, outfit, animation, layer) for animation, layer in layers(hero)]
    return pack(whole + split, FRAME, ORIGIN)


def outputs() -> Dict[str, bytes]:
    files: Dict[str, bytes] = {}
    for hero, outfit in OUTFITS.items():
        where = f'{LOOK}/characters/{hero}'
        files[f'{where}/sheet.png'], files[f'{where}/sheet.json'] = sheet(where, hero, outfit)
        png, json = pack(attacks.strips(hero), attacks.FRAME, attacks.ORIGIN)
        files[f'{where}/attack.png'] = png
        files[f'{where}/attack.json'] = json
    for look, heroes in revision.LOOKS.items():
        for hero, outfit in heroes.items():
            where = f'{look}/characters/{hero}'
            files[f'{where}/sheet.png'], files[f'{where}/sheet.json'] = sheet(where, hero, outfit)
    return files


# Sheets in those folders that no generator writes: the revised DESIGNER's music notes were drawn by hand.
BY_HAND = ('terraria-revised/characters/artsy/attack.png', 'terraria-revised/characters/artsy/attack.json')


def written() -> List[Path]:
    """Every file this script owns that is already on disk, so --check also catches a stale leftover.

    It owns the looks' characters/ folders only: looks/terraria/ also holds files other generators write
    (the customer concepts, tools/looks/terraria/customer/).
    """
    owned = [path for look in (LOOK, *revision.LOOKS) for path in (OUT / look / 'characters').glob('**/*')]
    return sorted(
        path for path in owned if path.suffix in ('.png', '.json') and str(path.relative_to(OUT)) not in BY_HAND
    )


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='verify the committed files instead of writing')
    args = parser.parse_args(argv)
    files = outputs()
    if args.check:
        # The PNGs are in the checkout only while exported (artfiles.py): without them the JSON is all there is to
        # check. A PNG is compared by its pixels, the JSON byte for byte.
        exported = artfiles.exported(OUT / name for name in files)
        stale = [
            name
            for name, data in files.items()
            if (exported or not name.endswith('.png')) and not artfiles.same(OUT / name, data)
        ]
        extra = [str(path.relative_to(OUT)) for path in written() if str(path.relative_to(OUT)) not in files]
        for name in stale + extra:
            print(f'stale: {(OUT / name).relative_to(REPO)}', file=sys.stderr)
        if not exported:
            print(artfiles.EXPORT_HINT, file=sys.stderr)
            return 1 if stale or extra else 2
        return 1 if stale or extra else 0
    for name, data in files.items():
        (OUT / name).parent.mkdir(parents=True, exist_ok=True)
        (OUT / name).write_bytes(data)
    print(f'wrote {len(files)} files to {OUT.relative_to(REPO)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
