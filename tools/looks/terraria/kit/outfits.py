"""What each hero wears over the shared body: a torso, sleeves, trousers and shoes, and a cap or a hood.

Sleeves, trousers and shoes are cut once (limbs.py) and dyed per hero; only the torso and headgear are
each hero's own drawings. The standing sleeve is each hero's own too, the cut the approved designs wear.
"""
from __future__ import annotations

from typing import Dict, NamedTuple, Tuple

from .art import Art, Dye, art, full
from .body import CAPPED_HAIR, HAIR, NECK

#                    01234567890123456789012345678901
# ── ENGINEER: a black hoodie ─────────────────────────────────────────────────────────────────────
# The hood's opening rolls under the chin as a lit band, two drawstrings hang from it with green tips,
# a pouch pocket opens at the front, and a ribbed hem closes the body above the jeans.
HOODIE = full('hoodie', 22, '''
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
''')

# Hood down: bunched round the back of the neck and lying over the near shoulder, drawn over the near arm
# as Terraria draws a cloak's front; its lit rim folds into the dark of its opening.
HOOD = full('hood', 19, '''
                     .........###....................
                     .......##*+*#...................
                     ......#*++oox#..................
                     ......#+oox##o#.................
                     ......#oxx#..x#.................
                     .......#x#......................
                     ........#.......................
''')

# The near sleeve standing: rounded at the shoulder, a pixel fuller there than below, lighter than the
# body because the near arm is nearer the light, and ending in a ribbed cuff over the hand.
HOODIE_HANG = art('hoodie sleeve hanging', 8, 21, '''
                     ..##..
                     .#**#.
                     #o+*+#
                     #o++*#
                     #o+*#.
                     #o+*#.
                     #o++#.
                     #xox#.
                     KSSSSK
                     KsLsSK
                     KsssSK
                     .KKKK.
''')

# ── DESIGNER: a tie-dye knit and a cap of the same colour ────────────────────────────────────────
# A crew-neck knit: irregular sage patches placed straight onto the charcoal with hard edges, as the
# crumpled tie-dye in his photo has them, and ribbing at the neck and hem.
KNIT = full('knit sweater', 22, '''
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
''')

KNIT_HANG = art('knit sleeve hanging', 8, 21, '''
                     ..##..
                     .#++#.
                     #o*~+#
                     #o**+#
                     #xo+#.
                     #xo+#.
                     #xo*#.
                     #oxo#.
                     KSSSSK
                     KsLsSK
                     KsssSK
                     .KKKK.
''')

# Terraria's Green Cap dyed in the knit: a flat crown with a straight back, its top's front half lit, a
# glossy spot at the front, and a brim that steps forward with a light tip over a dark underside the
# cap's width. It sits a row higher than the hair would, so a row of forehead parts that underside from
# the glasses' heavy top rim, the likeness the cap leaves him once it hides the hair.
CAP = full('cap', 10, '''
                     ............##xxxxxx............
                     ...........#xo+ooooo*x..........
                     ...........#xo**oo~~+x..........
                     ...........#xooooooooxxxx.......
                     ...........#xxoooooooo++*x......
                     ...........##############.......
''')

# ── STRATEGIST: a white shirt ─────────────────────────────────────────────────────────────────────
# An open collar standing up behind the neck, its front point over an open V, a straight placket below
# it, and the shirt bloused a little over the belt.
SHIRT = full('white shirt', 22, '''
                     ...........#+#.......#..........
                     ...........#o+#.....+#..........
                     ...........#oo+#...#+#..........
                     ...........#xoo+#.#+o#..........
                     ...........#xooo+#+o+#..........
                     ...........#xoooo+xo+#..........
                     ...........#xoxooox++#..........
                     ...........#xooooxo+#...........
                     ...........#xxoxoxoo#...........
''')

SHIRT_HANG = art('shirt sleeve hanging', 8, 21, '''
                     ..##..
                     .#++#.
                     #xo++#
                     #xoo+#
                     #xo+#.
                     #xxo#.
                     #xo+#.
                     #x+x#.
                     KSSSSK
                     KsLsSK
                     KsssSK
                     .KKKK.
''')

BELT = full('belt', 31, '''
                     ...........#xoooo+*o#...........
''')


class Outfit(NamedTuple):
    """One hero's clothes. Torso and headgear are drawn in order over the body; `front` over the near arm."""
    torso: Tuple[Tuple[Art, Dye], ...]
    hair: Art
    headgear: Tuple[Tuple[Art, Dye], ...]
    front: Tuple[Tuple[Art, Dye], ...]
    # What the sleeves, trousers and shoes are dyed in.
    top: str
    legs: str
    shoes: str
    # The near arm standing, in the hero's own sleeve.
    hang: Art


def outfit(
    *, torso: Tuple[Tuple[Art, Dye], ...], top: str, legs: str, shoes: str, hang: Art,
    hair: Art = HAIR, headgear: Tuple[Tuple[Art, Dye], ...] = (), front: Tuple[Tuple[Art, Dye], ...] = (),
) -> Outfit:
    return Outfit(torso, hair, headgear, front, top, legs, shoes, hang)


# By the heroes' ids, in the select order.
OUTFITS: Dict[str, Outfit] = {
    'hackerman': outfit(
        torso=((HOODIE, Dye('hoodie')),), top='hoodie', legs='jeans', shoes='sneakers-dark', hang=HOODIE_HANG,
        front=((HOOD, Dye('hoodie')),),
    ),
    'artsy': outfit(
        torso=((KNIT, Dye('knit')),), top='knit', legs='trousers-brown', shoes='sneakers-light', hang=KNIT_HANG,
        hair=CAPPED_HAIR, headgear=((CAP, Dye('knit')),),
    ),
    # A white shirt rather than a blazer: a dark jacket sinks into menu navy and into the DESIGNER's knit.
    'strategy': outfit(
        torso=((SHIRT, Dye('shirt')), (BELT, Dye('belt')), (NECK, Dye())),
        top='shirt', legs='trousers-dark', shoes='leather', hang=SHIRT_HANG,
    ),
}

