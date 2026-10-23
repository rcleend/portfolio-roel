"""The captain's likeness head kit (three-quarter view, facing right).

One master head, drawn pixel by pixel from the reference photos: the
swept-up ash-blonde hair with strands falling at the front, the round panto
glasses (heavy dark top rim, thin metal lower rims, eyes visible through
the lenses), the long face with a pointed chin and the big toothy smile.

Expressions are patches over the lens interiors and the mouth rows only,
and the cap variant replaces only the hair rows above the glasses. The hair
silhouette, the glasses and the jaw are therefore shared pixel for pixel by
every expression and every hero: the likeness cannot wobble.
"""

from __future__ import annotations

from typing import Dict

from .pixmap import Legend, Pixmap

LEGEND: Legend = {
    # hair, dark to light
    "K": ("hair", 0),
    "H": ("hair", 1),
    "h": ("hair", 2),
    "a": ("hair", 3),
    "y": ("hair", 4),
    "Y": ("hair", 5),
    # skin
    "q": ("skin", 0),
    "S": ("skin", 1),
    "s": ("skin", 2),
    "w": ("skin", 3),
    "W": ("skin", 4),
    # glasses: heavy dark upper rim, thin metal lower rim, eyes behind the lenses
    "g": ("rim", 0),
    "G": ("rim", 1),
    "n": ("rim", 2),
    "N": ("rim", 3),
    "e": ("lens", 0),
    "o": ("lens", 1),
    "l": ("lens", 2),
    "L": ("lens", 3),
    # mouth
    "m": ("mouth", 0),
    "M": ("mouth", 1),
    "r": ("mouth", 2),
    "v": ("teeth", 0),
    "t": ("teeth", 1),
    "i": ("teeth", 2),
    # cap (Artsy)
    "c": ("cap", 0),
    "C": ("cap", 1),
    "d": ("cap", 2),
    "D": ("cap", 3),
    "E": ("cap", 4),
}

VARIANTS: Dict[str, str] = {}

# Rows 0-5 hair, 6-8 glasses, 9-10 cheeks and nose, 11 the smile, 12-13 chin.
MASTER = """
.......hYah.
....hhayyahH
..hhaayhaayh
.hhayhaaHhaH
.hHhaHHswyaH
.HhhSswwwsHa
.HwSqgggSggg
.HsqwGweGSGe
.HSsssnnsSnS
..HSswwwwwSs
..HqSswwwSSq
...qSsStttq.
....qSsSSq..
.....qqSq...
"""

# The middle tooth of the smile, in head-kit pixels: where a potion meets his lips.
MOUTH = (8, 11)

# Each patch rewrites whole rows; patches spell every pixel of their rows.
EXPRESSIONS: Dict[str, Dict[int, str]] = {
    "smile": {},
    # Mouth closed in an easy half-smile.
    "neutral": {
        11: "...qSsSsMMq.",
    },
    # Eyes narrowed behind the lenses, mouth set.
    "focus": {
        7: ".HsqwGSeGSGe",
        11: "...qSsSqMMq.",
    },
    # The big open laugh: teeth over an open mouth.
    "grin": {
        11: "...qSsStttq.",
        12: "....qSmMMq..",
    },
    # Eyes squeezed shut, teeth gritted.
    "hurt": {
        7: ".HsqwGqqGSGq",
        11: "...qSsSMtMq.",
    },
    # Lids down for one frame of the idle.
    "blink": {
        7: ".HsqwGSSGSGS",
    },
}

# A washed charcoal cap worn forward: crown over the swept hair, brim over
# the glasses, hair sticking out at the side and the back. Replaces rows 0-5.
CAP_ROWS = [
    ".....dDDd.....",
    "...dDEEDDd....",
    "..dDDDDDDDd...",
    ".dDDDdddddDc..",
    ".cddcccccccCCC",
    "hhHSSsssSScCc.",
]


def _patch(base: Pixmap, rows: Dict[int, str], name: str, width: int = 0) -> Pixmap:
    cells = {xy: c for xy, c in base.cells.items() if xy[1] not in rows}
    for y, text in rows.items():
        for x, ch in enumerate(text):
            if ch != ".":
                cells[(x, y)] = LEGEND[ch]
    return Pixmap(max(base.w, width), base.h, cells, name)


def variants() -> Dict[str, Pixmap]:
    return {k: Pixmap.parse(v, LEGEND, k) for k, v in VARIANTS.items()}


def build(cap: bool = False) -> Dict[str, Pixmap]:
    """Every expression of the head, with or without the cap."""
    master = Pixmap.parse(MASTER, LEGEND, "roel")
    if cap:
        master = _patch(master, dict(enumerate(CAP_ROWS)), "roel/cap", width=14)
    return {name: _patch(master, rows, f"{master.name}/{name}") for name, rows in EXPRESSIONS.items()}
