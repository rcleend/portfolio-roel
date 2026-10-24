#!/usr/bin/env python3
"""Three Terraria Unhappy Customer concepts, each in its two key poses: shouting and won over.

    python3 tools/looks/terraria/customer/generate.py           # write src/game/art/looks/terraria/customer-concepts/
    python3 tools/looks/terraria/customer/generate.py --check   # fail if the committed files differ from what this writes

Every frame is composed from the layers in customer_kit/ (one module per customer), hung from their joints
by customer_kit/rig.py the way the Terraria heroes are posed (tools/looks/terraria), so the concepts are
ready to animate: a new pose is a choice of drawings, never a redrawn figure. Writes, per concept,
<id>.png + .json: a sheet as docs/LOOKS.md describes one, 64 x 64 frames with the feet on the bottom-centre
origin, one frame each of `shout` and `happy`, marking the `mouth` (where a complaint would leave) and the
top of the `head`. The concepts are not a look: nothing registers them, and only the development lineup
shows them (?scene=lineup&params={"cast":"customers"}).
Python 3.9+ and Pillow only; the same code writes the same bytes, which is what --check relies on.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OUT = REPO / 'src' / 'game' / 'art' / 'looks' / 'terraria' / 'customer-concepts'

# The heroes' kit owns the sheet format (kit/sheet.py), so both write sheets byte for byte alike.
for path in (HERE, HERE.parent):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from customer_kit.art import FRAME, GROUND, ORIGIN, paint, to_frame  # noqa: E402
from customer_kit.concepts import CONCEPTS, KEY_POSES  # noqa: E402
from customer_kit.rig import pose  # noqa: E402
from kit.sheet import Strip, pack  # noqa: E402


def strips(concept: str) -> List[Strip]:
    """The concept's key poses, one still frame each, standing on the feet line."""
    module = CONCEPTS[concept]
    missing = [name for name in KEY_POSES if name not in module.POSES]
    if missing:
        raise ValueError(f'{concept}: has no {missing} pose')
    out = []
    for name in KEY_POSES:
        where = f'{concept} {name}'
        posed = pose(module.FIGURE, module.POSES[name], where)
        picture = paint(posed.strokes, where)
        bottom = picture.getbbox()[3] - 1
        if bottom != to_frame((0, GROUND))[1]:
            raise ValueError(f'{where}: stands on row {bottom}, not on the feet line')
        anchors = {
            'mouth': (to_frame(posed.head.point('mouth')),),
            'head': (to_frame(posed.head.point('crown')),),
        }
        out.append(Strip(name, 1, True, (picture,), anchors))
    return out


def outputs() -> Dict[str, bytes]:
    files: Dict[str, bytes] = {}
    for concept in CONCEPTS:
        png, json = pack(strips(concept), FRAME, ORIGIN)
        files[f'{concept}.png'] = png
        files[f'{concept}.json'] = json
    return files


def written() -> List[Path]:
    """Every sheet already on disk, so --check also catches a stale leftover."""
    return sorted(path for path in OUT.glob('*') if path.suffix in ('.png', '.json'))


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='verify the committed files instead of writing')
    args = parser.parse_args(argv)
    files = outputs()
    if args.check:
        stale = [name for name, data in files.items() if not (OUT / name).exists() or (OUT / name).read_bytes() != data]
        extra = [path.name for path in written() if path.name not in files]
        for name in stale + extra:
            print(f'stale: {(OUT / name).relative_to(REPO)}', file=sys.stderr)
        return 1 if stale or extra else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (OUT / name).write_bytes(data)
    print(f'wrote {len(files)} files to {OUT.relative_to(REPO)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
