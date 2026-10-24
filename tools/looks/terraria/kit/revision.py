"""The Terraria Roels' revision: new head layers over the same bodies, drawn beside the designs the look plays.

The captain compares the two in the playground before either replaces the other, so the look's own parts
(body.py, outfits.py) stay as they are and the revision only swaps layers on top of them:
- the hair, after the Terraria player hairstyle he picked (hairstyle 143 of the character creator): a round
  mop a pixel behind the skull, its fringe swept forward over the brow and parted near the front, where a
  lock falls past the face; it now covers the top of the ear, so only the lobe shows. Same ramp as before.
- the glasses, drawn the way Terraria draws eyewear on a player head: one flat, heavy upper rim, an arm back
  towards the ear, a lighter lower rim showing at the sides and lower corners, and nothing standing on the
  rim: the fringe rests on it in mid tones.
- the DESIGNER's cap with only its front spot, and the hair pushed out behind it as a Terraria cap pushes it.
- a fourth design, the ENGINEER with his black hood pulled up, after Terraria's hood vanity: a round hood
  over the revised head, lit down its side and dark inside its opening, the fringe and its lock falling out
  at the front.
Every frame of every animation is composed from these exactly as the look's are (pose.py), so each design is
a full sheet and the same head in all of its frames.
"""
from __future__ import annotations

from typing import Dict, NamedTuple

from .art import Art, Dye, full
from .outfits import OUTFITS, Outfit

#                    01234567890123456789012345678901
# Hairstyle 143 at the body's size: the crown lit along its top and front, a lit streak curving down the back
# lobe, which falls into shade below it, a darker valley where the fringe parts from the front lock, and the
# outline lighter where the light hits the front. Behind the parting the fringe comes down onto the glasses,
# in mid tones where it rests on the rim; in front of it a notch of forehead shows, in the fringe's shade
# rather than the lit edge the bare head has there. At the nape the mop curves in above the ear.
HAIR = full('swept hair', 10, '''
                     ................OOOOO...........
                     ..............OOlhHhlOd.........
                     ............OOmlhlnmlhHd........
                     ...........OOdmnhlmdnhhO........
                     ...........OdmnlnmdmOnlO........
                     ...........OmnlnmdOdsmlO........
                     ...........Odnnnmm..smnO........
                     ...........Odmmd......nO........
                     ............Oddd......O.........
''')

# Pushed out under the cap's back edge, as a Terraria cap pushes the hair beneath it: a tuft two pixels
# behind it at its underside, curving back in to the nape.
TUFT = full('tuft under the cap', 16, '''
                     .........Odm....................
                     ..........Od....................
                     ...........O....................
''')

# Under the cap, what the hair leaves below its underside and behind the glasses, so the forehead row between
# the brim and the rim stays clear, with the tuft over it.
CAPPED_HAIR = Art('swept hair under a cap', tuple(
    (x, y, tone) for x, y, tone in HAIR.pixels if y >= 16 and x <= 15 and not TUFT.covers((x, y))
) + TUFT.pixels)

# The hair falls over the top of the ear: only its lobe shows below it.
EAR = full('ear lobe', 19, '''
                     ............KsS.................
                     ............KS..................
''')

# Panto glasses as Terraria draws eyewear: a flat, heavy dark rim straight across the top of the near lens
# out to the bridge at the face's front edge, its arm leaving the lens's back corner for the ear, and the
# lighter, thinner lower rim at the lens's sides and lower corners only, so nothing under the eye reads as a
# mouth.
GLASSES = full('panto glasses', 17, '''
                     ..............GGGGGGGG..........
                     ...............G....G...........
                     ...............g....g...........
                     ................g..g............
''')

# The look's cap with its back spot painted over in the knit's base tone: the same crown and brim, and only
# the glossy spot over the brim.
CAP = full('cap with one spot', 10, '''
                     ............##xxxxxx............
                     ...........#xooooooo*x..........
                     ...........#xooooo~~+x..........
                     ...........#xooooooooxxxx.......
                     ...........#xxoooooooo++*x......
                     ...........##############.......
''')

# The hoodie's hood pulled up, as Terraria draws a hood: round over the head and a pixel behind the hair, lit
# over the crown and down its side, and its lip over the brow lit towards the front, where it comes down
# over the forehead. Inside its opening the dark lining shows, deepest at the top behind the fringe, so the
# face sits inside the hood rather than on it; the cloth gathers in a fold low on the back and comes forward
# under the jaw into the collar. It is worn over the bare head's hair, so the fringe in the face is the same
# one and its lock falls out under the lip; the near arm hangs over its back as it does over the hood lying
# down.
HOOD = full('hood up', 10, '''
                     ...............######...........
                     .............##o+**+###.........
                     ............#o+++ooo+*##........
                     ...........#o+oooooooo*#........
                     ..........#xo+oooo++++*#........
                     ..........#xo+oxx.....+#........
                     ..........#xo+ox................
                     ..........#xo+x.................
                     ..........#xo+x.................
                     ..........#xx+x.................
                     ..........#xxox.................
                     ..........#xox+.................
                     ...........#x#+.................
''')


class Design(NamedTuple):
    """A revised design: the hero whose moves it plays, in an outfit of the revision's layers."""
    hero: str
    outfit: Outfit


def revised(hero: str, **layers: object) -> Outfit:
    """The hero's outfit with the revision's head: its hair, ear and glasses, and any other layer named."""
    return OUTFITS[hero]._replace(**{'hair': HAIR, 'ear': EAR, 'glasses': GLASSES, **layers})


# By the folder each sheet is written to (revised/<design>/), the heroes in the select order, then the hood.
DESIGNS: Dict[str, Design] = {
    'hackerman': Design('hackerman', revised('hackerman')),
    'artsy': Design('artsy', revised('artsy', hair=CAPPED_HAIR, headgear=((CAP, Dye('knit')),))),
    'strategy': Design('strategy', revised('strategy')),
    # With the hood over his head, none lies on his shoulders, and it covers his ear.
    'hackerman-hooded': Design(
        'hackerman', revised('hackerman', headgear=((HOOD, Dye('hoodie')),), front=(), ear=None),
    ),
}
