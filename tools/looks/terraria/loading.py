#!/usr/bin/env python3
"""The NOW LOADING vignette's actors: the shipped Roel and customer, cut from the game's own sheets.

    python3 tools/looks/terraria/loading.py           # write src/app/startup/art/
    python3 tools/looks/terraria/loading.py --check   # fail if the committed files differ from what this writes

The vignette (src/app/startup/loadingArt.ts) shows before any look has loaded, so it carries its two actors
inlined in the visitor's first chunk: Hackerman of the look the game ships for him (`terraria-revised`) running,
cheering and hit, and the shipped customer (`terraria`) walking, shouting and won over. Each animation is the
game's row as committed, every frame cut to the box all of that actor's frames share, so the strips are the same
pixels as the game at a fraction of the bytes. Writes runner.png + .json and chaser.png + .json, sheets as
docs/LOOKS.md describes them with their anchors moved into the cut frame; run it after either source sheet changes.
When `DEFAULT_LOOKS` (src/game/art/looks/selection.ts) ships another look, point ACTORS at it and run it again;
its test fails until then.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, NamedTuple, Sequence, Tuple

from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
LOOKS = REPO / 'src' / 'game' / 'art' / 'looks'
OUT = REPO / 'src' / 'app' / 'startup' / 'art'

if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from kit.sheet import Strip, pack  # noqa: E402


class Actor(NamedTuple):
    name: str
    #: The game sheet this actor is cut from, relative to src/game/art/looks/; its look is the folder it sits in.
    source: str
    animations: Tuple[str, ...]


ACTORS = (
    Actor('runner', 'terraria-revised/characters/hackerman', ('run', 'victory', 'hurt')),
    Actor('chaser', 'terraria/customer', ('walk', 'shout', 'happy')),
)


def cut(actor: Actor) -> Tuple[bytes, bytes]:
    """The actor's sheet: its animations from the game's sheet, every frame cut to the box they all share."""
    spec = json.loads((LOOKS / actor.source / 'sheet.json').read_text())
    image = Image.open(LOOKS / actor.source / 'sheet.png').convert('RGBA')
    w, h = spec['frame']['w'], spec['frame']['h']
    rows = {entry['name']: (row, entry) for row, entry in enumerate(spec['animations'])}
    frames: Dict[str, List[Image.Image]] = {}
    for name in actor.animations:
        row, entry = rows[name]
        frames[name] = [image.crop((c * w, row * h, (c + 1) * w, (row + 1) * h)) for c in range(entry['frames'])]
    left, top, right, bottom = union(picture.getchannel('A').getbbox() for strip in frames.values() for picture in strip)
    strips = [
        Strip(
            name,
            rows[name][1]['fps'],
            rows[name][1]['loop'],
            tuple(picture.crop((left, top, right, bottom)) for picture in frames[name]),
            {
                anchor: tuple((x - left, y - top) for x, y in points)
                for anchor, points in rows[name][1].get('anchors', {}).items()
            },
        )
        for name in actor.animations
    ]
    origin = (spec['origin']['x'] - left, spec['origin']['y'] - top)
    return pack(strips, (right - left, bottom - top), origin)


def union(boxes: Sequence) -> Tuple[int, int, int, int]:
    boxes = [box for box in boxes if box]
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def outputs() -> Dict[str, bytes]:
    files: Dict[str, bytes] = {}
    for actor in ACTORS:
        png, spec = cut(actor)
        files[f'{actor.name}.png'] = png
        files[f'{actor.name}.json'] = spec
    return files


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='verify the committed files instead of writing')
    args = parser.parse_args(argv)
    files = outputs()
    if args.check:
        stale = [name for name, data in files.items() if not (OUT / name).exists() or (OUT / name).read_bytes() != data]
        for name in stale:
            print(f'stale: {(OUT / name).relative_to(REPO)}', file=sys.stderr)
        return 1 if stale else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (OUT / name).write_bytes(data)
    print(f'wrote {len(files)} files to {OUT.relative_to(REPO)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
