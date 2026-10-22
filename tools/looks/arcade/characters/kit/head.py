"""The likeness head kit: Roel in three-quarter view, facing right.

One face, drawn once. Every expression is a small patch over the same base
(eyes behind the lenses, brows, mouth), and the cap variant replaces only
the hair above the brow, so the glasses, nose, jaw and ear are pixel-identical
in every frame of every hero. Rows are fills; the outline is added around the
silhouette.

What has to survive 1x, in order: the swept-up ash-blonde hair with its wave
dropping onto the far side of the forehead, two round rims with a heavy top and
a lighter bottom, the big toothy smile, the long jaw and narrow chin.
"""

from __future__ import annotations

from typing import Dict, Mapping, Tuple

from . import palette as P
from .grid import Grid, Point
from .raster import outline_outside

# Pivot: the neck point under the jaw, in fill coordinates (before the outline ring).
PIVOT = (6, 16)

BASE = (
    ".......iII...",
    ".....iIIiHI..",
    "...iIiiHHiIi.",
    "..iHHiHhHiIIH",
    ".iHhHHhHHiIHH",
    "hHhhHhhHHHiHh",
    "hhhhhsWssHiHh",
    "hhHSsGGsWsGGs",
    "hssGGLLGgGLLG",
    "hsKsGLeGsGLeG",
    "hSkssggsssggs",
    ".hkSssssssss.",
    ".hkSsssssssKs",
    "..kkSKttttKs.",
    "....kSsssss..",
    "......kSss...",
)

# Expression patches: (x, y) -> key, over BASE.
EXPRESSIONS: Mapping[str, Mapping[Point, str]] = {
    # His default: the big warm toothy smile.
    "smile": {},
    # Relaxed, closed-mouth smile.
    "neutral": {
        (5, 13): "k", (6, 13): "K", (7, 13): "K", (8, 13): "K", (9, 13): "K", (10, 13): "k",
    },
    # Idle blink: lids drop to the bottom of the lenses.
    "blink": {
        (5, 8): "L", (6, 8): "L", (10, 8): "L", (11, 8): "L",
        (5, 9): "K", (6, 9): "K", (10, 9): "K", (11, 9): "K",
    },
    # Typing, aiming, throwing: brows pressed onto the rims, mouth set.
    "focus": {
        (7, 7): "G", (9, 7): "G",
        (5, 13): "S", (6, 13): "K", (7, 13): "K", (8, 13): "K", (9, 13): "K", (10, 13): "S",
    },
    # Skill shout / victory roar: mouth wide open.
    "shout": {
        (7, 7): "G", (9, 7): "G",
        (6, 14): "m", (7, 14): "r", (8, 14): "r", (9, 14): "m",
        (5, 14): "k", (10, 14): "k",
    },
    # Hit: eyes squeezed shut, teeth gritted.
    "hurt": {
        (5, 8): "K", (6, 8): "K", (10, 8): "K", (11, 8): "K",
        (5, 9): "L", (6, 9): "L", (10, 9): "L", (11, 9): "L",
        (5, 13): "K", (6, 13): "t", (7, 13): "t", (8, 13): "t", (9, 13): "t", (10, 13): "K",
        (6, 14): "m", (7, 14): "m", (8, 14): "m", (9, 14): "K",
    },
}

# The cap replaces rows 0..6 (hair above the brow) and adds the brim.
CAP_ROWS = (
    ".............",
    "....aabbb....",
    "..abbbbbbbc..",
    ".abbbbbbbbcc.",
    ".bbbbbbbbbccc...",
    "hbbbbbbbbbcdddd.",
    "hhHccccdddddddd",
)

PALETTE: Dict[str, str] = {
    "I": P.HAIR.hi,
    "i": P.HAIR.light,
    "H": P.HAIR.mid,
    "h": P.HAIR.shadow,
    "W": P.SKIN.hi,
    "s": P.SKIN.light,
    "S": P.SKIN.mid,
    "k": P.SKIN.shadow,
    "K": P.SKIN.line,
    "G": P.GLASSES_RIM,
    "g": P.GLASSES_LOW,
    "L": P.LENS,
    "e": P.EYE,
    "t": P.TEETH,
    "m": P.MOUTH,
    "r": P.TONGUE,
    "a": P.CAP.hi,
    "b": P.CAP.light,
    "c": P.CAP.mid,
    "d": P.CAP.shadow,
}

LINE = P.HAIR.line
DEMOTE = "h"


def _cells(rows: Tuple[str, ...]) -> Dict[Point, str]:
    return {(x, y): key for y, row in enumerate(rows) for x, key in enumerate(row) if key not in ". "}


def head(expression: str = "smile", cap: bool = False) -> Grid:
    cells = _cells(BASE)
    if cap:
        for y in range(len(CAP_ROWS)):
            for x in range(16):
                cells.pop((x, y), None)
        cells.update(_cells(CAP_ROWS))
    cells.update(EXPRESSIONS[expression])
    return Grid.from_cells(outline_outside(cells), PIVOT)


# Where the near lens's glint pixel sits, relative to the head pivot; drawn as a decal on chosen frames.
GLINT = (5 - PIVOT[0], 8 - PIVOT[1])
# The front corner of the lips, relative to the head pivot: where a potion bottle meets his mouth.
MOUTH = (10 - PIVOT[0], 13 - PIVOT[1])
