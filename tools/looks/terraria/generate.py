#!/usr/bin/env python3
"""Terraria-style default designs of the three Roels: one standing frame each, shown on /playground.

    python3 tools/looks/terraria/generate.py           # write src/game/art/looks/terraria/designs/
    python3 tools/looks/terraria/generate.py --check   # fail if the committed files differ from what this writes

A design is a stack of layers composed back to front the way Terraria composes a player: back arm,
legs, shoes, torso, head, hair, eye, glasses, headgear, front arm and hand. Every hero shares the
same head, hair, eye and glasses, so they are one man in three outfits; the DESIGNER's cap swaps the
hair for the shorter mass that sticks out under it. The layers stay separate so the animation phase
can pose the same parts frame by frame.

Each layer is text art over the whole 32 x 40 frame, starting at a given row, one character per pixel.
Body characters name a tone of a fixed material (K is the skin's outline, w the white of the eye);
cloth characters name a tone of the ramp the design dresses that layer in, so one cut of trousers or
one cap can be worn in several colours. As in Terraria, every material is outlined in the darkest tone
of its own ramp rather than in one shared black.

Writes <id>.png (RGBA, alpha only 0 or 255) and <id>.json (docs/LOOKS.md) per design. Python 3.9+ and
Pillow only; the same code writes the same bytes, which is what --check relies on.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Sequence, Tuple

from PIL import Image

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / 'src' / 'game' / 'art' / 'looks' / 'terraria' / 'designs'

FRAME = (32, 40)
# Bottom-centre, the feet line, as every hero sheet has it (docs/LOOKS.md).
ORIGIN = (16, 40)

# Ramps run from the outline (darkest) up to the highlight.
BODY_RAMPS: Dict[str, Tuple[str, ...]] = {
    'skin': ('#55271c', '#d48c6c', '#f0b393', '#ffd3b8'),
    # Ash blonde: light brown with sun-bleached highlights, never yellow (CAST notes).
    'hair': ('#3d2b1c', '#6e573d', '#9b8160', '#c4a97f', '#e5d3a8'),
    'eye': ('#f6f4f0', '#3f6470'),
    # Panto frames: a heavy dark upper rim over a lighter, thinner lower rim.
    'glasses': ('#1f1a1b', '#5e5250'),
}
BODY_TONES: Dict[str, Tuple[str, int]] = {
    'K': ('skin', 0), 'S': ('skin', 1), 's': ('skin', 2), 'L': ('skin', 3),
    'O': ('hair', 0), 'd': ('hair', 1), 'm': ('hair', 2), 'l': ('hair', 3), 'h': ('hair', 4),
    'w': ('eye', 0), 'i': ('eye', 1),
    'G': ('glasses', 0), 'g': ('glasses', 1),
}
# Cloth tones, outline first; a ramp needs as many colours as the highest tone its layers use.
CLOTH_TONES = {'#': 0, 'x': 1, 'o': 2, '+': 3, '*': 4, '~': 5}

CLOTH_RAMPS: Dict[str, Tuple[str, ...]] = {
    # Outline, shade, base, light, highlight, then the drawstrings: a cloth green, not neon.
    'hoodie': ('#0b2619', '#1a4c32', '#266d44', '#368f5a', '#55b277', '#cde6d4'),
    'jeans': ('#111827', '#1d2a44', '#2a3d60', '#3d5682'),
    'sneakers-dark': ('#111115', '#2a2b33', '#44464f', '#c9c9cf'),
    # The black and grey tie-dye knit from the cap photo: dark base, pale blotches.
    'knit': ('#141518', '#26282c', '#383b40', '#62666b', '#8f9396'),
    'trousers-brown': ('#20130a', '#382215', '#4f321f', '#6a472c'),
    'sneakers-light': ('#3a3530', '#a49d90', '#d9d3c7', '#f2eee6'),
    'cap-berry': ('#3b0f27', '#6d1f4b', '#a1386f', '#cc5a92', '#f3b6d2'),
    'cap-charcoal': ('#18191c', '#303338', '#454950', '#5f646c', '#a9aeb5'),
    'blazer': ('#0e1018', '#1b1f2d', '#282e42', '#3b4360', '#56618a'),
    'shirt': ('#5b6272', '#b7bdca', '#e9ecf2', '#ffffff'),
    'trousers-dark': ('#0e1017', '#191c27', '#252a38', '#363c50'),
    'leather': ('#22120a', '#472815', '#6b3f22', '#985f35'),
}


class Layer(NamedTuple):
    """One part's pixels, (x, y, tone character) over the frame; cloth characters wait for a ramp."""
    name: str
    pixels: Tuple[Tuple[int, int, str], ...]
    cloth: bool


def layer(name: str, top: int, art: str, cloth: bool = False) -> Layer:
    """Full-width rows of `art`, the first at frame row `top`; '.' is transparent."""
    rows = [row.strip() for row in art.strip('\n').split('\n')]
    known = CLOTH_TONES if cloth else BODY_TONES
    pixels = []
    for dy, row in enumerate(rows):
        if len(row) != FRAME[0]:
            raise ValueError(f'{name}: row {top + dy} is {len(row)} wide, not {FRAME[0]}')
        for x, char in enumerate(row):
            if char == '.':
                continue
            if char not in known:
                raise ValueError(f'{name}: unknown pixel {char!r} at ({x}, {top + dy})')
            pixels.append((x, top + dy, char))
    return Layer(name, tuple(pixels), cloth)


# ── Body: shared by every hero ───────────────────────────────────────────────────────────────
#                    01234567890123456789012345678901
BACK_HAND = layer('back hand', 28, '''
                     .......KSSK.....................
                     .......KSSK.....................
                     .......KSSK.....................
                     ........KK......................
''')

HEAD = layer('head', 12, '''
                     .............KKKKKKK............
                     ............KssssssLK...........
                     ............KssssssLK...........
                     ............KsssssssLK..........
                     ............KSssssssLK..........
                     ............KSsssssssK..........
                     ............KSsssssssK..........
                     ............KSssssssLK..........
                     .............KSSsssssK..........
                     ..............KSSsssK...........
                     ...............KKKK.............
''')

# Swept up off the forehead and back, short at the sides so the ear shows.
HAIR = layer('hair', 10, '''
                     .................OOOO...........
                     ............OOOOOlhhlO..........
                     ..........OOmllllhhlllO.........
                     .........OmllhllmllllhlO........
                     ........OdmmllmllmlOOOOO........
                     ........OddmmdmmOOO.............
                     ........OdddmOO.................
                     ........OdddO...................
                     ........OdddO...................
                     ........OdddO...................
                     ........OOddO...................
                     .........OOO....................
''')

# What sticks out under a cap: the back and the sides.
CAPPED_HAIR = layer('capped hair', 14, '''
                     ........OmmO....................
                     ........OdmmdO..................
                     ........OddmOO..................
                     ........OdddO...................
                     ........OdddO...................
                     ........OdddO...................
                     ........OOddO...................
                     .........OOO....................
''')

EAR = layer('ear', 17, '''
                     .............sS.................
                     .............SS.................
                     .............sK.................
                     .............K..................
''')

EYE = layer('eye', 18, '''
                     .................wi.............
                     .................wi.............
''')

GLASSES = layer('glasses', 17, '''
                     ................GGGG.G..........
                     ...............GG..GGG..........
                     ................G..G.g..........
                     .................gg.............
''')

HAND = layer('hand', 28, '''
                     .................KSssK..........
                     .................KSssK..........
                     .................KSsLK..........
                     ..................KKK...........
''')

# ── Outfits ───────────────────────────────────────────────────────────────────────────────────
#                    01234567890123456789012345678901
LEGS = layer('legs', 32, '''
                     ............#xx#ooo+#...........
                     ............#xx#ooo+#...........
                     ............#xx#ooo+#...........
                     ............#xx#oooo+#..........
                     ............#xx#oooo+#..........
''', cloth=True)

SHOES = layer('shoes', 37, '''
                     ...........#ooo##oooo#..........
                     ...........#oooo#ooooo#.........
                     ...........############.........
''', cloth=True)

SLEEVE_BACK = layer('back sleeve', 22, '''
                     ........###.....................
                     .......#xxo#....................
                     .......#xxo#....................
                     .......#xxo#....................
                     .......#xxo#....................
                     .......#xxx#....................
''', cloth=True)

SLEEVE_FRONT = layer('front sleeve', 22, '''
                     ..................####..........
                     .................#oo++#.........
                     .................#xo++#.........
                     .................#xoo+#.........
                     .................#xoo+#.........
                     .................#xxxx#.........
''', cloth=True)

# Hood down, bunched behind the neck; pouch pocket; drawstrings.
HOODIE = layer('hoodie', 21, '''
                     .........###....................
                     ........#xoo#######.............
                     ........#xooo#oooo##............
                     .........#oooo~o~o+#............
                     ..........#ooo~o~o+#............
                     ..........#ooooooo+#............
                     ..........#o#####o+#............
                     ..........#o#xxx#o+#............
                     ..........#ooooooo+#............
                     ..........#xxxxxxxx#............
                     ...........#########............
''', cloth=True)

KNIT = layer('knit sweater', 22, '''
                     ............########............
                     ..........##xo####o##...........
                     ..........#xoo+oooo+#...........
                     ..........#xo*oo+ooo#...........
                     ..........#xoo+o*+oo#...........
                     ..........#x+oooo*+o#...........
                     ..........#xo*+oooo+#...........
                     ..........#xoo+o*ooo#...........
                     ..........#xxxxxxxxx#...........
                     ...........#########............
''', cloth=True)

BLAZER = layer('blazer', 22, '''
                     ............###..###............
                     ..........##xxo#..#o##..........
                     ..........#xoo#....#o#..........
                     ..........#xoo+#...#+#..........
                     ..........#xooo#..#o+#..........
                     ..........#xooo+##+oo#..........
                     ..........#xoooo##ooo#..........
                     ..........#xooooooooo#..........
                     ..........#xxxxxxxxxx#..........
                     ...........##########...........
''', cloth=True)

SHIRT = layer('shirt', 22, '''
                     ...............#..#.............
                     ..............#oxxo#............
                     ...............oooo.............
                     ................ooo.............
                     ................oo..............
''', cloth=True)

CAP = layer('cap', 10, '''
                     ..............#####.............
                     ............##xoo+*##...........
                     ...........#xxoooo+*+#..........
                     ...........#xooooooo+#..........
                     ..........#xxoooooooo+###.......
                     ..........############+**#......
                     ...........###############......
''', cloth=True)


class Part(NamedTuple):
    layer: Layer
    ramp: Optional[str] = None


class Design(NamedTuple):
    hero: str
    parts: Tuple[Part, ...]


def outfit(
    *, back_sleeve: str, torso: Sequence[Part], front_sleeve: str, legs: str, shoes: str,
    hair: Layer = HAIR, headgear: Sequence[Part] = (),
) -> Tuple[Part, ...]:
    """One hero, back to front, in the order Terraria draws a player."""
    return (
        Part(SLEEVE_BACK, back_sleeve), Part(BACK_HAND), Part(LEGS, legs), Part(SHOES, shoes), *torso,
        Part(HEAD), Part(hair), Part(EAR), Part(EYE), Part(GLASSES), *headgear,
        Part(SLEEVE_FRONT, front_sleeve), Part(HAND),
    )


def designer(cap: str) -> Design:
    return Design('artsy', outfit(
        back_sleeve='knit', torso=(Part(KNIT, 'knit'),), front_sleeve='knit',
        legs='trousers-brown', shoes='sneakers-light', hair=CAPPED_HAIR, headgear=(Part(CAP, cap),),
    ))


DESIGNS: Dict[str, Design] = {
    'hackerman': Design('hackerman', outfit(
        back_sleeve='hoodie', torso=(Part(HOODIE, 'hoodie'),), front_sleeve='hoodie',
        legs='jeans', shoes='sneakers-dark',
    )),
    'artsy-berry': designer('cap-berry'),
    'artsy-charcoal': designer('cap-charcoal'),
    'strategy': Design('strategy', outfit(
        back_sleeve='blazer', torso=(Part(BLAZER, 'blazer'), Part(SHIRT, 'shirt')), front_sleeve='blazer',
        legs='trousers-dark', shoes='leather',
    )),
}


def rgba(value: str) -> Tuple[int, int, int, int]:
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), 255)


def compose(design_id: str) -> Image.Image:
    """The design's one frame: every part painted over the ones behind it."""
    image = Image.new('RGBA', FRAME, (0, 0, 0, 0))
    for part in DESIGNS[design_id].parts:
        for x, y, char in part.layer.pixels:
            if part.layer.cloth:
                if part.ramp is None:
                    raise ValueError(f'{design_id}: {part.layer.name} is cloth but has no ramp')
                ramp, tone = CLOTH_RAMPS[part.ramp], CLOTH_TONES[char]
            else:
                material, tone = BODY_TONES[char]
                ramp = BODY_RAMPS[material]
            if tone >= len(ramp):
                raise ValueError(f'{design_id}: {part.layer.name} uses tone {tone} of {part.ramp}')
            image.putpixel((x, y), rgba(ramp[tone]))
    return image


def spec() -> dict:
    """One `idle` animation of one frame: the default design standing still (docs/LOOKS.md)."""
    return {
        'frame': {'w': FRAME[0], 'h': FRAME[1]},
        'origin': {'x': ORIGIN[0], 'y': ORIGIN[1]},
        'animations': [{'name': 'idle', 'fps': 1, 'loop': True, 'frames': 1}],
    }


def outputs() -> Dict[str, bytes]:
    files: Dict[str, bytes] = {}
    for design_id in DESIGNS:
        buffer = io.BytesIO()
        compose(design_id).save(buffer, format='PNG', optimize=False)
        files[f'{design_id}.png'] = buffer.getvalue()
        files[f'{design_id}.json'] = (json.dumps(spec(), indent=2) + '\n').encode()
    return files


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='verify the committed files instead of writing')
    args = parser.parse_args(argv)
    files = outputs()
    if args.check:
        stale = [name for name, data in files.items() if not (OUT / name).exists() or (OUT / name).read_bytes() != data]
        extra = sorted(p.name for p in OUT.glob('*') if p.name not in files)
        for name in stale + extra:
            print(f'stale: {OUT.relative_to(REPO) / name}', file=sys.stderr)
        return 1 if stale or extra else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (OUT / name).write_bytes(data)
    print(f'wrote {len(files)} files to {OUT.relative_to(REPO)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
