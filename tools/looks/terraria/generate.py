#!/usr/bin/env python3
"""Terraria-style default designs of the three Roels: one standing frame each, shown on /playground.

    python3 tools/looks/terraria/generate.py           # write src/game/art/looks/terraria/designs/
    python3 tools/looks/terraria/generate.py --check   # fail if the committed files differ from what this writes

A design is a stack of parts composed back to front in the order Terraria composes a player: the far
arm, the legs, the torso, the head with its hair, ear, eye, glasses and headgear, then the near arm.
Every hero shares the same body, head, hair, eye and glasses, so they are one man in three outfits; the
DESIGNER's cap swaps the hair for what sticks out under it.

The limbs are built the way Terraria's own sprites build them, measured from its player and town NPC
sheets at about 5/4 of their art-pixel size (Terraria stands 23 art pixels tall, these 30):
- Standing, the body is turned a little toward the viewer, so the near limbs sit at the back and the
  far ones peek out in front. The near arm hangs over the back of the torso from a shoulder that rises
  beside the jaw; only the far hand shows, where the torso steps in at the waist. The near leg is the
  wide one at the back; the far leg is a lit one-pixel sliver ahead of it.
- An arm is a sleeve that is fuller at the shoulder than below it, ending in a hand a pixel wider than
  the sleeve, outlined all round and shaded under the cuff and on its front edge. A foot is the leg's
  last rows: its toe a pixel ahead of the shin on the sole row, its heel a pixel behind the calf.
- Light falls from the front and above, so every part is lit on its front edge and shaded at its back.

Each limb is its own part on its own bone, which knows the joint it hangs from, so an animation can move
or redraw a limb about that joint and compose every frame from the same parts, as Terraria poses its
player's arms and legs frame by frame. The standing frame is the pose that moves nothing.

Each part is text art over the whole 32 x 40 frame, starting at a given row, one character per pixel.
Body characters name a tone of a fixed material (K is the skin's outline, w the white of the eye);
cloth characters name a tone of the ramp the design dresses that part in, so one cut of trousers or one
sleeve can be worn in several colours. As in Terraria, every material is outlined in the darkest tone
of its own ramp rather than in one shared black.

Writes <hero>.png (RGBA, alpha only 0 or 255) and <hero>.json (docs/LOOKS.md) per design. Python 3.9+
and Pillow only; the same code writes the same bytes, which is what --check relies on.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path
from typing import Dict, List, Mapping, NamedTuple, Optional, Sequence, Tuple

from PIL import Image

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / 'src' / 'game' / 'art' / 'looks' / 'terraria' / 'designs'

FRAME = (32, 40)
# Bottom-centre, the feet line, as every hero sheet has it (docs/LOOKS.md).
ORIGIN = (16, 40)

# Ramps run from the outline (darkest) up to the highlight.
BODY_RAMPS: Dict[str, Tuple[str, ...]] = {
    # Light, warm and a little pink (CAST notes), outlined in a deep brown as Terraria outlines skin.
    'skin': ('#3d1c17', '#d99a82', '#f3c3a7', '#fddcc8'),
    # Ash blonde: light brown with sun-bleached highlights, never yellow (CAST notes). Seven tones, as many as
    # Terraria shades its hair with, so neighbouring strands can differ the way its strands do.
    'hair': ('#2e2118', '#4f3e2c', '#6b5640', '#8a7353', '#a8906a', '#c6af85', '#e0cfa2'),
    'eye': ('#f4f1ec', '#3f6470'),
    # Panto frames: a heavy dark upper rim over a lighter, thinner lower rim.
    'glasses': ('#1d1819', '#5e5250'),
}
BODY_TONES: Dict[str, Tuple[str, int]] = {
    'K': ('skin', 0), 'S': ('skin', 1), 's': ('skin', 2), 'L': ('skin', 3),
    'O': ('hair', 0), 'd': ('hair', 1), 'm': ('hair', 2), 'n': ('hair', 3), 'l': ('hair', 4), 'h': ('hair', 5),
    'H': ('hair', 6),
    'w': ('eye', 0), 'i': ('eye', 1),
    'G': ('glasses', 0), 'g': ('glasses', 1),
}
# Cloth tones: outline, shade, base, light, highlight, accent. A part may give a tone its own meaning
# (the shoes' highlight is the sole, the hoodie's accent the tips of its drawstrings, the cap's its glossy
# spot, the belt's highlight its buckle); a ramp needs as many colours as the highest tone its parts use.
CLOTH_TONES = {'#': 0, 'x': 1, 'o': 2, '+': 3, '*': 4, '~': 5}

CLOTH_RAMPS: Dict[str, Tuple[str, ...]] = {
    # Black, as Terraria draws black cloth: a dark grey base between a near-black outline and grey lights,
    # so its folds and edges still read on the dark stages. The drawstrings' tips are the ENGINEER's green.
    'hoodie': ('#111115', '#23242b', '#32333c', '#4a4c58', '#6f7282', '#3ddc84'),
    'jeans': ('#10172a', '#233559', '#31497a', '#4a68a0'),
    'sneakers-dark': ('#0f0f13', '#26272e', '#383a44', '#555867', '#d9dbe0'),
    # The black and sage tie-dye knit from the cap photo: a charcoal that still parts from menu navy, with
    # sage patches; the DESIGNER's cap is dyed in it too, so cap and sweater are one colour.
    'knit': ('#141518', '#2b2d31', '#3a3c41', '#5c6158', '#86907b', '#adb6a0'),
    'trousers-brown': ('#1e110a', '#3d2617', '#573823', '#765034'),
    'sneakers-light': ('#3a3530', '#9c9588', '#cfc8bb', '#ebe6dc', '#8a8273'),
    # Cool whites below pure white, as Terraria's cloth whites are, outlined dark enough to keep the shirt's
    # edge on a mid-value stage.
    'shirt': ('#3f4658', '#9ea8bb', '#d4dae5', '#eef1f6'),
    'trousers-dark': ('#0c0e15', '#1f2433', '#2e3446', '#454d66'),
    'leather': ('#22120a', '#3a2010', '#6b3f22', '#9a6136', '#2b170c'),
    'belt': ('#22120a', '#3a2010', '#6b3f22', '#9a6136', '#d3a957'),
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


class Bone(NamedTuple):
    """What carries a part: the bone it rides on, if any, and the joint it hangs from in the standing frame."""
    parent: Optional[str]
    joint: Tuple[int, int]


# The body carries the head and both arms, so a walk's bob lifts them together while the feet stay on the
# ground, as in Terraria; each limb hangs from its shoulder or hip, at the top of its drawing.
BONES: Dict[str, Bone] = {
    'body': Bone(None, (16, 31)),
    'near arm': Bone('body', (10, 22)),
    'far arm': Bone('body', (19, 23)),
    'near leg': Bone(None, (14, 32)),
    'far leg': Bone(None, (18, 32)),
}

# How far each bone moves from the standing frame, in pixels, on top of the bone it rides on; a bone a
# pose leaves out stays put.
Pose = Mapping[str, Tuple[int, int]]
STANDING: Pose = {}


def offset(bone: str, pose: Pose) -> Tuple[int, int]:
    """Where `pose` moves the bone: its own move plus every move of the bones it rides on."""
    dx, dy = pose.get(bone, (0, 0))
    parent = BONES[bone].parent
    if parent is None:
        return dx, dy
    px, py = offset(parent, pose)
    return dx + px, dy + py


# ── Body: shared by every hero ───────────────────────────────────────────────────────────────
#                    01234567890123456789012345678901
# A slim, long-ish face: the forehead slopes back at the top, a one-pixel nose bump sits a row below the
# eye as on every Terraria head, and the jaw steps back diagonally to a chin outlined in the skin's
# darkest brown.
HEAD = layer('head', 13, '''
                     ..............KKKKK.............
                     ............KKsssssLK...........
                     ............KsssssssLK..........
                     ............KSssssssLK..........
                     ............KSsssssssK..........
                     ............KSsssssssK..........
                     ............KSsssssssK..........
                     ............KSSssssssLK.........
                     .............KSSsssssK..........
                     ..............KSSsssK...........
                     ...............KKKKK............
''')

# Swept up off the forehead and back, short at the sides so the ear shows. Shaded as Terraria shades
# hair: the quiff's top catches the light, strands part in the outline's dark, the back and nape fall
# into shadow, and a loose strand drops onto the forehead, as in his photos.
HAIR = layer('hair', 10, '''
                     ..................OOOO..........
                     .............OOOOOlHhlO.........
                     ...........OOdmlnlHhlhlO........
                     .........OOdnlmOnhlnhHlO........
                     ........OdmndnlndnlnhlOO........
                     ........OmdnmOdnmOdnOOO.........
                     ........OdmndmdnO..O............
                     ........OmdOmdO.................
                     .........OdndO..................
                     .........OmdO...................
                     ..........OdO...................
                     ...........O....................
''')

# Drawn over the hair: a lit rim and a shaded lobe, outlined only where it meets the hair, so it reads
# as an ear rather than a dark smudge.
EAR = layer('ear', 18, '''
                     ............KLs.................
                     ............KsS.................
                     ............KS..................
''')

# Terraria's eye: a white and an iris, each a pixel wide and two tall, the iris forward; no mouth.
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

# The near hand, below the near sleeve's cuff: a pixel wider than the sleeve, toward the front.
NEAR_HAND = layer('near hand', 29, '''
                     ........KSSSSK..................
                     ........KsLsSK..................
                     ........KsssSK..................
                     .........KKKK...................
''')

# Behind the torso, so standing only its front pixel and outline show at the waist.
FAR_HAND = layer('far hand', 29, '''
                     ...................KSSK.........
                     ...................KsSK.........
                     ...................KsSK.........
                     ....................KK..........
''')

# The throat in an open collar, below the chin.
NECK = layer('neck', 24, '''
                     ................Sss.............
                     .................S..............
''')

# ── Legs: one cut, dyed per hero ───────────────────────────────────────────────────────────────
#                    01234567890123456789012345678901
# The near leg is lit at its front; its calf and heel swell a pixel behind the thigh.
NEAR_LEG = layer('near leg', 32, '''
                     ............#xo++#..............
                     ............#xoo+#..............
                     ............#xxo+#..............
                     ...........#xxoo+#..............
''', cloth=True)

# The far leg standing is the lit sliver ahead of the near leg, which hides the rest of it.
FAR_LEG = layer('far leg', 32, '''
                     .................#+#............
                     .................#+#............
                     .................#+#............
                     .................#+#............
''', cloth=True)

# A shoe is the leg's last rows recoloured: its upper, then the sole row, which steps a pixel forward.
NEAR_SHOE = layer('near shoe', 36, '''
                     ...........#xoo++#..............
                     ...........#xxoo+#..............
                     ...........#******#.............
                     ...........########.............
''', cloth=True)

FAR_SHOE = layer('far shoe', 36, '''
                     .................#+#............
                     .................#+#............
                     ..................#*#...........
                     ..................###...........
''', cloth=True)

# ── ENGINEER: a black hoodie ─────────────────────────────────────────────────────────────────────
#                    01234567890123456789012345678901
# The hood's opening rolls under the chin as a lit band, two drawstrings hang from it with green tips,
# a pouch pocket opens at the front, and a ribbed hem closes the body above the jeans.
HOODIE = layer('hoodie', 22, '''
                     ...........#o#.......#..........
                     ...........#o+#.....+#..........
                     ...........#oo+**+*+*#..........
                     ...........#oxxxx*x*+#..........
                     ...........#oxoxo*o*+#..........
                     ...........#ooxoo~o~+#..........
                     ...........#oox++++x+#..........
                     ...........#oxoxoo#+#...........
                     ...........#oxooxoox#...........
                     ...........#xoxoxoxo#...........
''', cloth=True)

# Hood down: bunched round the back of the neck and lying over the near shoulder, drawn over the near arm
# as Terraria draws a cloak's front; its lit rim folds into the dark of its opening.
HOOD = layer('hood', 19, '''
                     .........###....................
                     .......##*+*#...................
                     ......#*++oox#..................
                     ......#+oox##o#.................
                     ......#oxx#..x#.................
                     .......#x#......................
                     ........#.......................
''', cloth=True)

# A sleeve: rounded at the shoulder, a pixel fuller there than below, lighter than the body because the
# near arm is nearer the light, and ending in a ribbed cuff.
HOODIE_SLEEVE = layer('hoodie sleeve', 21, '''
                     ..........##....................
                     .........#**#...................
                     ........#o+*+#..................
                     ........#o++*#..................
                     ........#o+*#...................
                     ........#o+*#...................
                     ........#o++#...................
                     ........#xox#...................
''', cloth=True)

# The far sleeve is hidden behind the torso standing; it is drawn whole so a swing can bring it out.
HOODIE_FAR_SLEEVE = layer('hoodie far sleeve', 23, '''
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xox#..........
''', cloth=True)

# ── DESIGNER: a tie-dye knit and a cap of the same colour ────────────────────────────────────────
#                    01234567890123456789012345678901
# A crew-neck knit: irregular sage patches placed straight onto the charcoal with hard edges, as the
# crumpled tie-dye in his photo has them, and ribbing at the neck and hem.
KNIT = layer('knit sweater', 22, '''
                     ...........#x#.......#..........
                     ...........#xo#.....+#..........
                     ...........#ox+x+x+x+#..........
                     ...........#oxooo**o+#..........
                     ...........#oxox**~*+#..........
                     ...........#oxoxx**o+#..........
                     ...........#ox*oxooo+#..........
                     ...........#o*~*oox+#...........
                     ...........#ox*oooox#...........
                     ...........#xoxoxoxo#...........
''', cloth=True)

KNIT_SLEEVE = layer('knit sleeve', 21, '''
                     ..........##....................
                     .........#++#...................
                     ........#o*~+#..................
                     ........#o**+#..................
                     ........#xo+#...................
                     ........#xo+#...................
                     ........#xo*#...................
                     ........#oxo#...................
''', cloth=True)

KNIT_FAR_SLEEVE = layer('knit far sleeve', 23, '''
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xox#..........
''', cloth=True)

# Terraria's Green Cap dyed in the knit: a flat crown with a straight back, its top's front half lit, a
# glossy spot at the front, and a brim that steps forward with a light tip over a dark underside the
# cap's width. It sits a row higher than the hair would, so a row of forehead parts that underside from
# the glasses' heavy top rim, the likeness the cap leaves him once it hides the hair.
CAP = layer('cap', 10, '''
                     ............##xxxxxx............
                     ...........#xo+ooooo*x..........
                     ...........#xo**oo~~+x..........
                     ...........#xooooooooxxxx.......
                     ...........#xxoooooooo++*x......
                     ...........##############.......
''', cloth=True)

# What sticks out under the cap: a tuft no more than three pixels behind its back edge, starting at the
# underside, then the bare head's own short hair behind the ear, so below the cap the head is the bare one.
CAPPED_HAIR = layer('capped hair', 15, '''
                     ........Omd.....................
                     ........OdmndmdO................
                     ........OmdOmdO.................
                     .........OdndO..................
                     .........OmdO...................
                     ..........OdO...................
                     ...........O....................
''')

# ── STRATEGIST: a white shirt ─────────────────────────────────────────────────────────────────────
#                    01234567890123456789012345678901
# An open collar standing up behind the neck, its front point over an open V, a straight placket below
# it, and the shirt bloused a little over the belt.
SHIRT = layer('white shirt', 22, '''
                     ...........#+#.......#..........
                     ...........#o+#.....+#..........
                     ...........#oo+#...#+#..........
                     ...........#xoo+#.#+o#..........
                     ...........#xooo+#+o+#..........
                     ...........#xoooo+xo+#..........
                     ...........#xoxooox++#..........
                     ...........#xooooxo+#...........
                     ...........#xxoxoxoo#...........
''', cloth=True)

SHIRT_SLEEVE = layer('shirt sleeve', 21, '''
                     ..........##....................
                     .........#++#...................
                     ........#xo++#..................
                     ........#xoo+#..................
                     ........#xo+#...................
                     ........#xxo#...................
                     ........#xo+#...................
                     ........#x+x#...................
''', cloth=True)

SHIRT_FAR_SLEEVE = layer('shirt far sleeve', 23, '''
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xo+#..........
                     .................#xox#..........
''', cloth=True)

BELT = layer('belt', 31, '''
                     ...........#xoooo+*o#...........
''', cloth=True)


class Part(NamedTuple):
    """A layer as one design wears it, on the bone that carries it; cloth layers name the ramp they are dyed in."""
    layer: Layer
    bone: str
    ramp: Optional[str] = None


def outfit(
    *, torso: Sequence[Part], sleeve: Layer, far_sleeve: Layer, top: str, legs: str, shoes: str,
    hair: Layer = HAIR, headgear: Sequence[Part] = (), front: Sequence[Part] = (),
) -> Tuple[Part, ...]:
    """One hero, back to front, in the order Terraria draws a player; the sleeves are dyed in `top`, and
    `front` is drawn over the near arm."""
    return (
        Part(FAR_HAND, 'far arm'), Part(far_sleeve, 'far arm', top),
        Part(FAR_LEG, 'far leg', legs), Part(FAR_SHOE, 'far leg', shoes),
        Part(NEAR_LEG, 'near leg', legs), Part(NEAR_SHOE, 'near leg', shoes),
        *torso,
        Part(HEAD, 'body'), Part(hair, 'body'), Part(EAR, 'body'), Part(EYE, 'body'), Part(GLASSES, 'body'),
        *headgear,
        Part(NEAR_HAND, 'near arm'), Part(sleeve, 'near arm', top),
        *front,
    )


# By the heroes' ids, as src/game/art/looks/terraria/designs.ts lists them.
DESIGNS: Dict[str, Tuple[Part, ...]] = {
    'hackerman': outfit(
        torso=(Part(HOODIE, 'body', 'hoodie'),), sleeve=HOODIE_SLEEVE, far_sleeve=HOODIE_FAR_SLEEVE,
        top='hoodie', legs='jeans', shoes='sneakers-dark', front=(Part(HOOD, 'body', 'hoodie'),),
    ),
    'artsy': outfit(
        torso=(Part(KNIT, 'body', 'knit'),), sleeve=KNIT_SLEEVE, far_sleeve=KNIT_FAR_SLEEVE,
        top='knit', legs='trousers-brown', shoes='sneakers-light',
        hair=CAPPED_HAIR, headgear=(Part(CAP, 'body', 'knit'),),
    ),
    # A white shirt rather than a blazer: a dark jacket sinks into menu navy and into the DESIGNER's knit.
    'strategy': outfit(
        torso=(Part(SHIRT, 'body', 'shirt'), Part(BELT, 'body', 'belt'), Part(NECK, 'body')),
        sleeve=SHIRT_SLEEVE, far_sleeve=SHIRT_FAR_SLEEVE, top='shirt', legs='trousers-dark', shoes='leather',
    ),
}


def check_joints(design_id: str) -> None:
    """Every bone is drawn over its own joint, so a limb redrawn about that joint attaches where the standing one does."""
    parts = DESIGNS[design_id]
    for bone in sorted({part.bone for part in parts}):
        drawn = {(x, y) for part in parts if part.bone == bone for x, y, _ in part.layer.pixels}
        if BONES[bone].joint not in drawn:
            raise ValueError(f'{design_id}: nothing on the {bone} covers its joint {BONES[bone].joint}')


def rgba(value: str) -> Tuple[int, int, int, int]:
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), 255)


def compose(design_id: str, pose: Pose = STANDING) -> Image.Image:
    """The design in `pose`: every part painted over the ones behind it, moved with its bone."""
    image = Image.new('RGBA', FRAME, (0, 0, 0, 0))
    for part in DESIGNS[design_id]:
        dx, dy = offset(part.bone, pose)
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
            if not (0 <= x + dx < FRAME[0] and 0 <= y + dy < FRAME[1]):
                raise ValueError(f'{design_id}: {part.layer.name} leaves the frame in this pose')
            image.putpixel((x + dx, y + dy), rgba(ramp[tone]))
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
        check_joints(design_id)
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
