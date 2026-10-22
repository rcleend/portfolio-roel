"""Props the heroes hold: the keyboard, the Strat and the sticky-note pad.

Props are hand-drawn sprites in a few orientations, placed by the hands of
the posed rig so they stay locked to the grip in every frame.
"""

from __future__ import annotations

import math
from typing import Dict, Optional, Tuple

from .canvas import Frame, PartStyle
from .pixmap import Legend, Pixmap

Point = Tuple[float, float]

KEYBOARD_LEGEND: Legend = {
    "k": ("kbcase", 0),
    "K": ("kbcase", 1),
    "c": ("kbcase", 2),
    "C": ("kbcase", 3),
    "q": ("keycap", 1),
    "Q": ("keycap", 2),
    "W": ("keycap", 3),
    "g": ("kbglow", 1),
    "G": ("kbglow", 2),
}

# A chunky mechanical keyboard seen from a little above, held across the body.
# (sprite, centre anchor)
KEYBOARD_ART: Dict[str, Tuple[str, Tuple[int, int]]] = {
    "held": ("""
        .cCCCCCCCCCc.
        cQkQkQkQkGkk
        ckQkQkQkQkQk
        cQkQQQQQkQkk
        kKKKKKKKKKKk
        .gGgggggggg.
    """, (6, 3)),
    # Keystrokes light the caps under the fingers; the underglow flares.
    "type_a": ("""
        .cCCCCCCCCCc.
        cQkWkQkQkGkk
        ckGkWkQkQkQk
        cQkQQQQQkQkk
        kKKKKKKKKKKk
        .GGGGGGGGGG.
    """, (6, 3)),
    "type_b": ("""
        .cCCCCCCCCCc.
        cQkQkQkWkGkk
        ckQkQkGkWkQk
        cQkWWWWWkQkk
        kKKKKKKKKKKk
        .gGGGGGGGGg.
    """, (6, 3)),
    # One key pressed in the idle: a single green cap.
    "tap": ("""
        .cCCCCCCCCCc.
        cQkQkQkGkGkk
        ckQkQkQkQkQk
        cQkQQQQQkQkk
        kKKKKKKKKKKk
        .gggGgggggg.
    """, (6, 3)),
    # The slam: the keyboard streaks down through the air.
    "smear": ("""
        .g.g.g.g.g.g
        k.k.k.k.k.k.
        .k.k.k.k.k.k
        cCcCcCcCcCcc
        cQkQkQkQkGkk
        ckQkQkQkQkQk
        kKKKKKKKKKKk
        .gGgggggggg.
    """, (6, 5)),
    # Enter! Every cap lit, the underglow flaring white-green.
    "enter": ("""
        .cCCCCCCCCCc.
        cGkGkWkGkWkk
        ckWkGkWkGkGk
        cGkWWWWWkGkk
        kKKKKKKKKKKk
        .GGGGGGGGGG.
    """, (6, 3)),
    # Tipped up at the front, for the knockback.
    "tilt": ("""
        ..........cCk
        .......cCQkGk
        ....cCQkQkQkk
        .cCkQkQkQkQkk
        cQkQkQkQkKKk.
        ckQkQQQKKgg..
        kKKKKKKgg....
        .gggg........
    """, (6, 4)),
}


def sprites(art: Dict[str, Tuple[str, Tuple[int, int]]], legend: Legend) -> Dict[str, Tuple[Pixmap, Tuple[int, int]]]:
    return {k: (Pixmap.parse(text, legend, k), anchor) for k, (text, anchor) in art.items()}


def place(frame: Frame, part: int, sprite: Tuple[Pixmap, Tuple[int, int]], at: Point, flip: bool = False) -> None:
    pm, (ax, ay) = sprite
    x = int(math.floor(at[0] + 0.5)) - ax
    y = int(math.floor(at[1] + 0.5)) - ay
    frame.stamp(pm, x, y, part, flip=flip)


# ── The Olympic White Stratocaster (Artsy) ─────────────────────────────────
# Drawn from geometry in guitar-local coordinates: x runs along the neck
# towards the headstock, y across the body towards the lower horn. Every
# angle is rasterised fresh, so the guitar stays crisp and on-model however
# Artsy swings it; nothing is rotated as pixels.

STRAT_BODY = [
    (3.0, -1.1), (3.6, -2.6), (4.8, -3.4), (7.0, -4.1), (7.7, -5.0), (6.9, -5.9), (4.6, -5.8), (2.4, -4.8),
    (0.4, -4.9), (-2.0, -5.9), (-5.0, -6.1), (-7.5, -4.9), (-8.7, -2.6), (-8.9, 0.4), (-8.3, 3.2),
    (-6.5, 5.7), (-3.4, 6.3), (-1.0, 5.5), (1.2, 4.9), (3.4, 5.2), (5.4, 5.0), (5.6, 4.0), (4.6, 2.6),
    (3.0, 1.1),
]
STRAT_GUARD = [
    (3.0, -1.2), (1.8, -2.9), (-0.6, -3.5), (-3.2, -3.3), (-4.7, -2.1), (-5.1, 0.6), (-4.5, 3.0),
    (-2.4, 4.1), (0.2, 3.7), (2.0, 2.5), (3.0, 1.2),
]
STRAT_HEAD = [
    (18.6, -1.0), (19.6, -1.3), (21.0, -2.2), (23.4, -2.7), (25.3, -2.3), (25.6, -1.2), (24.4, -0.6),
    (22.0, 0.2), (20.0, 1.0), (18.6, 1.0),
]
NECK_START, NUT = 3.2, 18.6


def _inside(px: float, py: float, poly) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > py) != (y2 > py):
            xc = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
            if px < xc:
                inside = not inside
    return inside


def paint_strat(frame: Frame, part: int, centre: Point, angle: float, squeeze: float = 1.0,
                strings_lit: bool = False, neck_part: Optional[int] = None) -> Dict[str, Point]:
    """Paints the Strat with its body centre at `centre` and the neck pointing
    along `angle` degrees (0 = right, -90 = up). Returns key points in frame
    coordinates: the strum spot, the neck grip and the headstock tip."""
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)

    def to_frame(lx: float, ly: float) -> Point:
        ly *= squeeze
        return (centre[0] + lx * ca - ly * sa, centre[1] + lx * sa + ly * ca)

    def to_local(fx: float, fy: float) -> Point:
        dx, dy = fx - centre[0], fy - centre[1]
        return (dx * ca + dy * sa, (-dx * sa + dy * ca) / squeeze)

    corners = [to_frame(x, y) for x, y in ((-9.5, -7), (26.5, -7), (26.5, 7), (-9.5, 7))]
    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    for py in range(int(min(ys)) - 1, int(max(ys)) + 2):
        for px in range(int(min(xs)) - 1, int(max(xs)) + 2):
            lx, ly = to_local(px + 0.5, py + 0.5)
            cell = _strat_cell(lx, ly, strings_lit)
            if cell is not None:
                on_neck = neck_part is not None and lx >= NECK_START and not _inside(lx, ly, STRAT_BODY)
                frame.put(px, py, cell[0], cell[1], neck_part if on_neck else part)
    return {
        "strum": to_frame(-1.0, 0.0),
        "grip": to_frame(12.0, 0.0),
        "head": to_frame(25.0, -1.5),
        "horn": to_frame(6.4, -4.4),
        "butt": to_frame(-8.6, -0.4),
    }


def _strat_cell(lx: float, ly: float, lit: bool):
    # Headstock and tuners.
    if lx >= NUT - 0.4 and _inside(lx, ly, STRAT_HEAD):
        if ly < -1.6 and lx > 19.8 and int(lx) % 2 == 0:
            return ("chrome", 2)
        return ("maple", 3 if ly < -1.0 else 2)
    # Neck: rosewood board with pearl dots, a sliver of maple on the far edge.
    if NECK_START <= lx < NUT and -1.05 <= ly <= 1.05:
        if ly > 0.55:
            return ("maple", 1)
        dots = (6.6, 9.4, 12.2, 15.0)
        if any(abs(lx - d) < 0.5 for d in dots) and abs(ly + 0.2) < 0.55:
            return ("pearl", 1)
        return ("rosewood", 2 if ly < -0.5 else 1)
    if not _inside(lx, ly, STRAT_BODY):
        return None
    if -6.4 <= lx <= -5.2 and -1.7 <= ly <= 1.7:
        return ("chrome", 2 if ly < 0 else 1)  # bridge
    if math.hypot(lx + 6.9, ly - 4.0) < 0.7:
        return ("chrome", 1)  # jack plate
    if _inside(lx, ly, STRAT_GUARD):
        for px in (1.3, -0.9, -2.9):
            slant = 0.22 if px == -2.9 else 0.0
            d = lx - (px + ly * slant)
            if abs(d) < 0.5 and -1.7 <= ly <= 1.7:
                return ("pickup", 1)
            if 0.5 <= d < 1.1 and -1.7 <= ly <= 1.9:
                return ("guard", 0)  # each pickup casts a hairline shadow
        if lit and abs(ly) < 0.45:
            return ("pickup", 1)  # strings ringing under the strum
        for kx, ky in ((-1.6, 3.0), (-3.1, 2.4)):
            if math.hypot(lx - kx, ly - ky) < 0.62:
                return ("pickup", 0)
        return ("guard", 2 if ly < -1.6 else 1)
    # Cream body, lit from the top: highlight along the upper edge.
    if ly < -4.6:
        return ("cream", 4)
    if ly < 1.0:
        return ("cream", 3)
    if ly < 4.4:
        return ("cream", 2)
    return ("cream", 1)


# ── Sticky-note pad (Strategy) ─────────────────────────────────────────────

NOTE_LEGEND: Legend = {
    "0": ("note", 0),
    "1": ("note", 1),
    "2": ("note", 2),
    "3": ("note", 3),
    "4": ("note", 4),
    "i": ("ink", 1),
}

NOTEPAD_ART: Dict[str, Tuple[str, Tuple[int, int]]] = {
    # A square pad, a scribble of ink on the top note, held at an edge.
    "pad": ("""
        4443
        3i33
        33i2
        1221
    """, (1, 2)),
    # One note peeled off between two fingers, ready to throw.
    "note": ("""
        43
        32
    """, (0, 1)),
}
