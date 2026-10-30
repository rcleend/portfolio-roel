#!/usr/bin/env python3
"""The terraria look's Unhappy Customer, and the three concepts it was chosen from, each in its two key poses.

    python3 tools/looks/terraria/customer/generate.py           # write the sheets
    python3 tools/looks/terraria/customer/generate.py --check   # fail if the committed files differ from what this writes

Every frame is composed from the layers in customer_kit/ (one module per customer), hung from their joints
by customer_kit/rig.py the way the Terraria heroes are posed (tools/looks/terraria): a new pose is a choice of
drawings, never a redrawn figure. Every sheet is one docs/LOOKS.md describes, 64 x 64 frames with the feet on
the bottom-centre origin, marking on every frame the `mouth` (where a complaint leaves) and the `head`.
Writes:
- src/game/art/looks/terraria/customer/sheet.png + .json: ON THE PHONE, the concept the judges chose, in the
  five customer animations (customer_kit/moves.py), its `head` the top of whatever stands on his head (the
  phone's antenna), which everything the game shows above a customer clears.
- src/game/art/looks/terraria/customer-concepts/<id>.png + .json: each concept in one frame of `shout` and
  `happy`, its `head` the crown. The concepts are not a look: only the development lineup shows them
  (?scene=lineup&params={"cast":"customers"}).
Python 3.9+ and Pillow only; the same code writes the same bytes, which is what --check relies on.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Tuple

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
LOOKS = REPO / 'src' / 'game' / 'art' / 'looks' / 'terraria'
LOOK = LOOKS / 'customer'
CONCEPTS_OUT = LOOKS / 'customer-concepts'

# The heroes' kit owns the sheet format (kit/sheet.py), so both write sheets byte for byte alike.
for path in (HERE, HERE.parent):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from customer_kit import on_the_phone  # noqa: E402
from customer_kit.art import FRAME, GROUND, ORIGIN, Point, paint, to_frame  # noqa: E402
from customer_kit.concepts import CONCEPTS, KEY_POSES  # noqa: E402
from customer_kit.moves import ANIMATIONS  # noqa: E402
from customer_kit.rig import Figure, Pose, pose, top  # noqa: E402
from kit.sheet import Strip, pack  # noqa: E402
from PIL import Image  # noqa: E402

# The look's customer, by the concept the judges chose.
CHOSEN = on_the_phone


def frame(figure: Figure, posed: Pose, where: str) -> Tuple[Image.Image, Point, Point]:
    """A pose painted in its frame, with its mouth and the top of its head in frame pixels. It stands on the feet
    line unless it hops clear of it."""
    resolved = pose(figure, posed, where)
    picture = paint(resolved.strokes, where)
    bottom = picture.getbbox()[3] - 1
    if bottom != to_frame((0, GROUND - posed.lift))[1]:
        raise ValueError(f'{where}: stands on row {bottom}, not {posed.lift} px over the feet line')
    return picture, to_frame(resolved.head.point('mouth')), to_frame(top(resolved))


def animated() -> List[Strip]:
    """The chosen customer's five animations, in docs/LOOKS.md's order."""
    out = []
    for name, animation in ANIMATIONS.items():
        painted = [frame(CHOSEN.FIGURE, posed, f'{name}[{index}]') for index, posed in enumerate(animation.frames)]
        anchors = {'mouth': tuple(mouth for _, mouth, _ in painted), 'head': tuple(head for _, _, head in painted)}
        out.append(Strip(name, animation.fps, animation.loop, tuple(picture for picture, _, _ in painted), anchors))
    return out


def strips(concept: str) -> List[Strip]:
    """The concept's key poses, one still frame each, standing on the feet line."""
    module = CONCEPTS[concept]
    missing = [name for name in KEY_POSES if name not in module.POSES]
    if missing:
        raise ValueError(f'{concept}: has no {missing} pose')
    out = []
    for name in KEY_POSES:
        where = f'{concept} {name}'
        resolved = pose(module.FIGURE, module.POSES[name], where)
        picture, mouth, _ = frame(module.FIGURE, module.POSES[name], where)
        anchors = {'mouth': (mouth,), 'head': (to_frame(resolved.head.point('crown')),)}
        out.append(Strip(name, 1, True, (picture,), anchors))
    return out


def outputs() -> Dict[Path, bytes]:
    files: Dict[Path, bytes] = {}
    png, json = pack(animated(), FRAME, ORIGIN)
    files[LOOK / 'sheet.png'] = png
    files[LOOK / 'sheet.json'] = json
    for concept in CONCEPTS:
        png, json = pack(strips(concept), FRAME, ORIGIN)
        files[CONCEPTS_OUT / f'{concept}.png'] = png
        files[CONCEPTS_OUT / f'{concept}.json'] = json
    return files


def written() -> List[Path]:
    """Every sheet already on disk, so --check also catches a stale leftover."""
    return sorted(path for folder in (LOOK, CONCEPTS_OUT) for path in folder.glob('*') if path.suffix in ('.png', '.json'))


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='verify the committed files instead of writing')
    args = parser.parse_args(argv)
    files = outputs()
    if args.check:
        stale = [path for path, data in files.items() if not path.exists() or path.read_bytes() != data]
        extra = [path for path in written() if path not in files]
        for path in stale + extra:
            print(f'stale: {path.relative_to(REPO)}', file=sys.stderr)
        return 1 if stale or extra else 0
    for path, data in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(f'wrote {len(files)} files to {LOOK.relative_to(REPO)} and {CONCEPTS_OUT.relative_to(REPO)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
