"""Hand-drawn hands for gestures a rendered blob cannot show: typing fingers, a fist,
a thumbs-up, an open palm thrown at the sky.

Each sprite's pivot is the wrist (the end of the forearm bone); the hand extends from it.
Colours are the shared skin ramp, so hands sit in every sheet's palette for free.
"""

from __future__ import annotations

from typing import Dict, Tuple

from .canvas import Sprite
from .ramps import RAMPS

_SKIN = RAMPS["skin"].tones
PALETTE: Dict[str, str] = {"o": _SKIN[0], "S": _SKIN[1], "s": _SKIN[2], "f": _SKIN[3], "F": _SKIN[4]}

# Typing, seen from the front over the keys: fingertips striking or lifted.
TYPE_DOWN = Sprite.parse("""
.oo..
oFFfo
offso
.f.f.
""", PALETTE)
TYPE_UP = Sprite.parse("""
.oo..
oFFfo
offfo
.ooo.
""", PALETTE)

# A clenched fist and a thumbs-up, knuckles towards the viewer.
FIST = Sprite.parse("""
.oo.
oFfo
offo
.oo.
""", PALETTE)
THUMBS_UP = Sprite.parse("""
.oo.
oFo.
oFoo
offfo
offso
.ooo.
""", PALETTE)

# An open hand flung up (fingers spread), for reaching to the sky.
OPEN_UP = Sprite.parse("""
o.o.o
fofof
offfo
oFfso
.ooo.
""", PALETTE)

PIVOTS: Dict[str, Tuple[int, int]] = {
    "type_down": (1, 0),
    "type_up": (1, 0),
    "fist": (1, 1),
    "thumbs_up": (1, 4),
    "open_up": (2, 4),
}
