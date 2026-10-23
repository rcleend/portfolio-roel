#!/usr/bin/env python3
"""Terraria-style default designs of the three Roels: one standing frame each, shown on /playground.

    python3 tools/looks/terraria/generate.py           # write src/game/art/looks/terraria/designs/
    python3 tools/looks/terraria/generate.py --check   # fail if the committed files differ from what this writes

A design is a stack of layers composed back to front the way Terraria composes a player: far hand,
legs, shoes, torso, head, hair, ear, eye, glasses, headgear, then the near sleeve and hand. As in
Terraria's standing pose, the near arm hangs along the back of the torso, lit and drawn over it,
while the far hand only peeks out at the front; that keeps the torso's front edge and its details
clear. Every hero shares the same body, head, hair, eye and glasses, so they are one man in three
outfits; the DESIGNER's cap swaps the hair for what sticks out under it. The proportions are
Terraria's player at 4/3 of its art-pixel size, which stands the heroes as tall as the classic ones.
The layers stay separate so the animation phase can pose the same parts frame by frame.

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
    # Light, warm and a little pink (CAST notes), still outlined in its own dark red-brown.
    'skin': ('#5a2722', '#dc9a80', '#f3c3a7', '#fddcc8'),
    # Ash blonde: light brown with sun-bleached highlights, never yellow (CAST notes).
    'hair': ('#3b2a1b', '#67523a', '#937859', '#bb9f77', '#ddc99e'),
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
# Cloth tones: outline, shade, base, light, highlight, accent. A layer may give a tone its own meaning
# (the shoes' shade is the sole, the hoodie's accent its drawstrings, the cap's its glossy spot, the
# belt's highlight its buckle, the knit's light tones its tie-dye); a ramp needs as many colours as
# the highest tone its layers use.
CLOTH_TONES = {'#': 0, 'x': 1, 'o': 2, '+': 3, '*': 4, '~': 5}

CLOTH_RAMPS: Dict[str, Tuple[str, ...]] = {
    # A cloth green after Terraria's green hooded cloak, nudged toward its teal, and the ENGINEER's class colour.
    'hoodie': ('#0a2620', '#184b3a', '#226b4f', '#318c64', '#4fae82', '#d3e8dc'),
    'jeans': ('#111827', '#1d2a44', '#2a3d60', '#3d5682'),
    'sneakers-dark': ('#111115', '#bfc0c6', '#30313a', '#4c4e59'),
    # The black and sage tie-dye knit from the cap photo: a charcoal that still parts from menu navy,
    # with soft sage blotches edged in a mid tone.
    'knit': ('#141518', '#2b2d31', '#3a3c41', '#5c6158', '#86907b', '#adb6a0'),
    'trousers-brown': ('#20130a', '#382215', '#4f321f', '#6a472c'),
    'sneakers-light': ('#3a3530', '#9c9588', '#ddd7cb', '#f4f1ea'),
    # Terraria's Green Cap recoloured: the DESIGNER's class pink as a muted fabric, and Roel's washed charcoal.
    'cap-berry': ('#3b0f27', '#6d1f4b', '#a1386f', '#cc5a92', '#ea8fbb', '#fbe6f0'),
    'cap-charcoal': ('#18191c', '#2e3135', '#43464c', '#5b5f66', '#7f848b', '#c9cdd2'),
    # Outlined as dark as Terraria's white cloth, so the shirt keeps its edge on a mid-value stage.
    'shirt': ('#3f4658', '#b7bdca', '#e9ecf2', '#ffffff'),
    'trousers-dark': ('#0e1017', '#191c27', '#252a38', '#363c50'),
    'leather': ('#22120a', '#3a2010', '#6b3f22', '#9a6136', '#d3a957'),
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
# The far hand, behind the body: a sliver of shaded skin where every torso's front edge steps in at the
# hip, as Terraria draws it.
FAR_HAND = layer('far hand', 28, '''
                     .....................SK.........
                     .....................SK.........
                     .....................SK.........
                     .....................K..........
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
                     ............KSSSsssssK..........
                     .............KSSSsssK...........
                     ..............KKKKK.............
''')

# Swept up off the forehead and back, short at the sides so the ear shows. As Terraria shades hair: a
# darker rim under the outline, a sheen band across the middle, the lifted front tuft catching the
# light, and the hairline outlined against the forehead.
HAIR = layer('hair', 9, '''
                     ..................OOOO..........
                     .............OOOOOdlhlO.........
                     ...........OOdmmmdmhhlmO........
                     .........OOmmlhhllmllmlO........
                     ........OldmlmmlmmdmmOO.........
                     ........OOmdmmdmmdOdO...........
                     .........OmdmmddOO..............
                     .........OmdmdOO................
                     .........OmdO...................
                     .........OdmO...................
                     .........OddO...................
                     ..........OO....................
''')

# What sticks out under a cap, in the same tones as the bare head: a flick out of the back edge, the
# short hair behind the ear, and a tuft at the temple above the ear.
CAPPED_HAIR = layer('capped hair', 14, '''
                     .........O......................
                     ........OlO.....................
                     ........Ohl.....................
                     ........OmllO.ml................
                     .........OmdO...................
                     .........OddO...................
                     ..........OO....................
''')

EAR = layer('ear', 17, '''
                     .............sS.................
                     .............sS.................
                     .............SK.................
                     .............K..................
''')

EYE = layer('eye', 18, '''
                     .................wi.............
                     .................wi.............
''')

# Large round panto lenses, as Roel wears them: the near ring leaves skin either side of the eye, and
# its heavy upper rim curves down into a thin lower rim that shows only at its corners, so no bar under
# the eye reads as a mouth. The bridge and far lens show at the face's front edge.
GLASSES = layer('glasses', 17, '''
                     ................GGGG.G..........
                     ...............G....GG..........
                     ...............g....g...........
                     ................g..g............
''')

# The near hand, at the end of the near sleeve: shaded where it meets the torso.
NEAR_HAND = layer('near hand', 28, '''
                     .......KSSSK....................
                     .......KssSK....................
                     .......KssSK....................
                     ........KKK.....................
''')

# The throat in an open collar, below the chin.
NECK = layer('neck', 23, '''
                     ................ss..............
                     ................S...............
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
                     ...........#oo+##ooo+#..........
                     ...........#xxxx#xxxxx#.........
                     ...........############.........
''', cloth=True)

# A shirt's near sleeve, the shoulder rounding off under the head.
SLEEVE = layer('sleeve', 22, '''
                     ........###.....................
                     .......#o++#....................
                     .......#o++#....................
                     .......#xo+#....................
                     .......#xoo#....................
                     .......#xox#....................
''', cloth=True)

# Hood down: bunched behind the neck, its lit rim over a dark fold of lining, then wrapped forward
# under the chin as a lit roll the drawstrings hang from. The pouch pocket sits low, over a ribbed hem
# that hangs a row over the jeans.
HOODIE = layer('hoodie', 18, '''
                     ........##......................
                     ......##+*#.....................
                     .....#+*+*+#....................
                     ....#x###xo##...................
                     ....#xxoo+++++++++*++#..........
                     .....##xoo+++++*+++++#..........
                     ...........#xxxxx~x~x#..........
                     ...........#xoooo~o~+#..........
                     ...........#xoooo~ooo#..........
                     ...........#xo######+#..........
                     ...........#xo#oooox#...........
                     ...........#xoo#oooo#...........
                     ...........#x+x+x+x+#...........
                     ...........#x+x+x+x+x#..........
                     ...........###########..........
''', cloth=True)

# The hoodie's near sleeve starts under the hood's roll.
HOODIE_SLEEVE = layer('hoodie sleeve', 24, '''
                     .......#o+o#....................
                     .......#o+o#....................
                     .......#x+o#....................
                     .......#xoo#....................
''', cloth=True)

# A crew-neck knit in black and sage tie-dye: a few large soft clouds rather than speckle, the lightest
# by the front shoulder, each edged in a mid tone.
KNIT = layer('knit sweater', 22, '''
                     ...........##xxxxxxxx#..........
                     ...........#xooo+**+o#..........
                     ...........#xoo+*~~*+#..........
                     ...........#xoo+*~**+#..........
                     ...........#xooo+**+o#..........
                     ...........#x++oo+++o#..........
                     ...........#+*+ooooo#...........
                     ...........#+**+oooo#...........
                     ...........#xoxoxoxo#...........
                     ...........##########...........
''', cloth=True)

KNIT_SLEEVE = layer('knit sleeve', 22, '''
                     ........###.....................
                     .......#ooo#....................
                     .......#o++#....................
                     .......#+*+#....................
                     .......#x+o#....................
                     .......#oxo#....................
''', cloth=True)

# An open collar, standing up behind the neck, over a placket; tucked in.
SHIRT = layer('white shirt', 21, '''
                     ...........#+...................
                     ...........#x+#...#++#..........
                     ...........#xo+#..#+o#..........
                     ...........#xo+#.#+o+#..........
                     ...........#xoo+#+oo+#..........
                     ...........#xoooxooo+#..........
                     ...........#xooooooo+#..........
                     ...........#xoooxooo#...........
                     ...........#xxoooooo#...........
                     ...........#xxxxxxxx#...........
''', cloth=True)

BELT = layer('belt', 31, '''
                     ...........#xoooo+*o#...........
                     ...........##########...........
''', cloth=True)

CAP = layer('cap', 11, '''
                     ............#######.............
                     ...........#xoooo+*#............
                     ..........#xooooo~~+#...........
                     ..........#xxoooooo++###........
                     ..........#xxoooooooo+**#.......
                     ..........###############.......
''', cloth=True)


class Part(NamedTuple):
    """A layer as one design wears it: cloth layers name the ramp they are dyed in."""
    layer: Layer
    ramp: Optional[str] = None


def outfit(
    *, torso: Sequence[Part], sleeve: Part, legs: str, shoes: str,
    hair: Layer = HAIR, headgear: Sequence[Part] = (),
) -> Tuple[Part, ...]:
    """One hero, back to front, in the order Terraria draws a player; `sleeve` is the near arm's."""
    return (
        Part(FAR_HAND), Part(LEGS, legs), Part(SHOES, shoes), *torso,
        Part(HEAD), Part(hair), Part(EAR), Part(EYE), Part(GLASSES), *headgear,
        sleeve, Part(NEAR_HAND),
    )


def designer(cap: str) -> Tuple[Part, ...]:
    """The DESIGNER in the knit, the cap dyed in `cap`."""
    return outfit(
        torso=(Part(KNIT, 'knit'),), sleeve=Part(KNIT_SLEEVE, 'knit'),
        legs='trousers-brown', shoes='sneakers-light', hair=CAPPED_HAIR, headgear=(Part(CAP, cap),),
    )


# By the ids src/game/art/looks/terraria/designs.ts lists them under: hero id, then the colourway.
DESIGNS: Dict[str, Tuple[Part, ...]] = {
    'hackerman': outfit(
        torso=(Part(HOODIE, 'hoodie'),), sleeve=Part(HOODIE_SLEEVE, 'hoodie'),
        legs='jeans', shoes='sneakers-dark',
    ),
    'artsy-berry': designer('cap-berry'),
    'artsy-charcoal': designer('cap-charcoal'),
    # A white shirt rather than a blazer: a dark jacket sinks into menu navy and into the DESIGNER's knit.
    'strategy': outfit(
        torso=(Part(SHIRT, 'shirt'), Part(BELT, 'leather'), Part(NECK)), sleeve=Part(SLEEVE, 'shirt'),
        legs='trousers-dark', shoes='leather',
    ),
}


def rgba(value: str) -> Tuple[int, int, int, int]:
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), 255)


def compose(design_id: str) -> Image.Image:
    """The design's one frame: every part painted over the ones behind it."""
    image = Image.new('RGBA', FRAME, (0, 0, 0, 0))
    for part in DESIGNS[design_id]:
        for x, y, char in part.layer.pixels:
            if part.layer.cloth:
                if part.ramp is None:
                    raise ValueError(f'{design_id}: {part.layer.name} is cloth but has no ramp')
                ramp, tone = CLOTH_RAMPS[part.ramp], CLOTH_TONES[char]
            else:
                material, tone = BODY_TONES[char]
                ramp = BODY_RAMPS[material]
            if tone >= len(ramp):
                raise ValueError(f'{design_id}: {part.layer.name} needs tone {tone}, but its ramp has {len(ramp)}')
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
