"""Outfits: torso painters, shoes and hands shared by the rig.

Torsos are painted in spine-local coordinates (a: across, + to the right;
b: down the spine from the neck base, 0..17 at rest), so a lean or a
landing squash bends the clothes with the body instead of sliding a
sprite around.
"""

from __future__ import annotations

import math
from typing import Callable, Dict, Tuple

from . import draw
from .canvas import Frame, PartStyle, shade_tone
from .pixmap import Legend, Pixmap
from .skeleton import TORSO, Joints, Pose

Point = Tuple[float, float]


class Spine:
    """Maps spine-local (a, b) to frame pixels for one pose."""

    def __init__(self, j: Joints, rest: float = TORSO) -> None:
        nx, ny = j.neck
        px, py = j.pelvis
        dx, dy = px - nx, py - ny
        length = math.hypot(dx, dy) or 1.0
        self.neck = j.neck
        self.down = (dx / length, dy / length)
        self.right = (self.down[1], -self.down[0])
        self.scale = length / rest

    def at(self, a: float, b: float) -> Point:
        bb = b * self.scale
        return (self.neck[0] + a * self.right[0] + bb * self.down[0],
                self.neck[1] + a * self.right[1] + bb * self.down[1])

    def local(self, x: float, y: float) -> Point:
        ox, oy = x - self.neck[0], y - self.neck[1]
        a = ox * self.right[0] + oy * self.right[1]
        b = (ox * self.down[0] + oy * self.down[1]) / self.scale
        return (a, b)

    def poly(self, pts) -> list:
        return [self.at(a, b) for a, b in pts]


def cells_of(frame: Frame, part: int):
    for y in range(frame.h):
        for x in range(frame.w):
            c = frame.get(x, y)
            if c is not None and c[2] == part:
                yield x, y, c


# ── Hackerman: black hoodie, hood down ─────────────────────────────────────

HOODIE_BODY = [(-3.0, 0.0), (3.0, 0.0), (5.5, 2.0), (6.6, 4.5), (6.6, 12.0), (6.1, 18.2),
               (-6.1, 18.2), (-6.6, 12.0), (-6.6, 4.5), (-5.5, 2.0)]


def hoodie_torso(frame: Frame, part: int, j: Joints, pose: Pose) -> None:
    sp = Spine(j)
    draw.shaded_polygon(frame, sp.poly(HOODIE_BODY), "hoodie", part, 2, 4)
    # Ribbed hem gathered at the hips.
    for x, y, c in list(cells_of(frame, part)):
        a, b = sp.local(x + 0.5, y + 0.5)
        if b > 16.9:
            frame.put(x, y, "hoodie", 2 if x % 2 == 0 else 1, part)
    # Kangaroo pocket: a seam across the belly and the near opening.
    draw.line(frame, sp.at(-4.0, 10.6), sp.at(5.0, 10.6), "hoodie", 1, part, only_on=part)
    draw.line(frame, sp.at(-4.0, 10.6), sp.at(-5.2, 14.5), "hoodie", 1, part, only_on=part)
    # The hood, down: a soft roll of fabric bunched behind the neck.
    hx, hy = sp.at(-3.0, 1.2)
    frame.blob((hx, hy), 4.0, 2.6, "hoodie", part, _HOOD_RAMP, lo=1, hi=4)
    # Its edge wraps under the chin to the front opening.
    draw.line(frame, sp.at(-1.0, 2.2), sp.at(3.0, 3.2), "hoodie", 4, part)
    draw.line(frame, sp.at(0.0, 3.2), sp.at(3.0, 4.0), "hoodie", 2, part)
    # Drawstrings with terminal-green tips; `swing` lets them trail in motion.
    swing = float(pose.get("strings", 0.0))  # type: ignore[arg-type]
    for a in (1.0, 3.0):
        top = sp.at(a, 4.2)
        tip = sp.at(a + swing, 8.6)
        draw.line(frame, top, tip, "string", 0, part)
        frame.put(int(math.floor(top[0])), int(math.floor(top[1])), "string", 1, part)
        frame.put(int(math.floor(tip[0])), int(math.floor(tip[1] + 1)), "tip", 1, part)


class _Ramp:
    top = 5


_HOOD_RAMP = _Ramp()


# ── Artsy: black knit sweater, tie-dyed in sage and cream ────────────────

SWEATER_BODY = [(-3.2, 0.0), (3.2, 0.0), (5.6, 1.8), (6.8, 4.4), (6.9, 12.0), (6.4, 18.0),
                (-6.4, 18.0), (-6.9, 12.0), (-6.8, 4.4), (-5.6, 1.8)]

# Tie-dye "spiders": (a, b, radius, phase) in spine-local space.
DYE_SPOTS = [(-3.4, 5.2, 2.9, 0.4), (3.2, 3.4, 2.3, 1.7), (0.6, 10.2, 3.1, 2.9), (-4.6, 13.6, 2.2, 0.9),
             (4.9, 12.8, 2.1, 2.2), (-0.8, 16.4, 1.7, 1.3)]


def dye_tone(dx: float, dy: float, radius: float, phase: float):
    """Tone of a tie-dye spider at offset (dx, dy), or None outside it."""
    r = math.hypot(dx, dy)
    if r > radius * 1.25:
        return None
    theta = math.atan2(dy, dx)
    edge = radius * (0.72 + 0.34 * math.cos(5 * theta + phase))
    if r > edge:
        return None
    k = r / max(edge, 1e-6)
    return 4 if k < 0.28 else 3 if k < 0.55 else 2 if k < 0.82 else 1


def sweater_torso(frame: Frame, part: int, j: Joints, pose: Pose) -> None:
    sp = Spine(j)
    draw.shaded_polygon(frame, sp.poly(SWEATER_BODY), "knit", part, 1, 4)
    for x, y, c in list(cells_of(frame, part)):
        a, b = sp.local(x + 0.5, y + 0.5)
        if b > 16.5:
            frame.put(x, y, "knit", 2 if x % 2 == 0 else 1, part)  # ribbed hem
            continue
        if b < 1.2 and abs(a) < 3.6:
            frame.put(x, y, "knit", 3, part)  # ribbed crew neck
            continue
        for sa, sb, rad, ph in DYE_SPOTS:
            tone = dye_tone(a - sa, b - sb, rad, ph)
            if tone is not None:
                # Shadow side of the body takes the dye a step darker.
                frame.put(x, y, "dye", max(0, tone - (1 if a > 3.5 else 0)), part)
                break


def sweater_sleeve(along: float, across: float, tone: int, segment: int):
    spots = ((2.6, -0.4, 1.9, 0.8), (6.4, 0.6, 1.6, 2.4)) if segment == 0 else ((3.4, 0.2, 1.6, 1.2),)
    for sa, sb, rad, ph in spots:
        t = dye_tone(along - sa, across - sb, rad, ph)
        if t is not None:
            return ("dye", max(0, min(t, tone)))
    return None


# ── Strategy: open navy blazer over a white open-collar shirt ─────────────

BLAZER_BODY = [(-3.0, 0.0), (3.2, 0.0), (6.0, 1.4), (7.0, 3.6), (6.6, 11.0), (6.6, 19.6),
               (-6.4, 19.6), (-6.4, 11.0), (-7.0, 3.6), (-6.0, 1.4)]
# The shirt shows in the open front of the jacket: a V under the collar
# that narrows to the belt, set towards the hero's front (+a).
SHIRT_FRONT = [(-0.4, -0.2), (4.0, -0.2), (4.6, 5.0), (4.2, 11.0), (4.1, 19.8), (1.6, 19.8),
               (1.4, 11.0), (0.6, 5.0)]


def blazer_torso(frame: Frame, part: int, j: Joints, pose: Pose) -> None:
    sp = Spine(j)
    draw.shaded_polygon(frame, sp.poly(BLAZER_BODY), "blazer", part, 1, 4)
    # Shirt front, lit on its near side, a little cooler towards the front.
    for x, y, u in draw.pixels_in(sp.poly(SHIRT_FRONT)):
        a, b = sp.local(x + 0.5, y + 0.5)
        tone = 4 if u < -0.2 else 3 if u < 0.6 else 2
        frame.put(x, y, "shirt", tone, part)
    # Lapels: the jacket's turned-back edges framing the shirt.
    draw.polyline(frame, [sp.at(-0.6, 0.6), sp.at(0.4, 5.0), sp.at(1.3, 10.6)], "blazer", 4, part)
    draw.polyline(frame, [sp.at(4.3, 0.8), sp.at(4.9, 5.0), sp.at(4.4, 10.6)], "blazer", 3, part)
    # Open collar: two white points spread over the lapels.
    for a, b in ((-1.0, 0.4), (-0.4, 1.4), (0.2, 2.2), (4.4, 0.4), (4.8, 1.4)):
        x, y = sp.at(a, b)
        frame.put(int(math.floor(x)), int(math.floor(y)), "shirt", 4, part)
    # Placket buttons down the shirt.
    for b in (6.0, 9.4):
        x, y = sp.at(2.8, b)
        frame.put(int(math.floor(x)), int(math.floor(y)), "shirt", 1, part)
    # Belt across the open front.
    draw.line(frame, sp.at(1.4, 15.8), sp.at(4.2, 15.8), "belt", 1, part)
    x, y = sp.at(2.6, 15.8)
    frame.put(int(math.floor(x)), int(math.floor(y)), "buckle", 1, part)
    # Pocket flap and a fold under the near arm.
    draw.line(frame, sp.at(-5.0, 13.4), sp.at(-1.6, 13.6), "blazer", 1, part, only_on=part)
    draw.line(frame, sp.at(-5.6, 5.0), sp.at(-4.8, 9.0), "blazer", 2, part, only_on=part)
    # The jacket's hem flares a touch when he moves.
    flare = float(pose.get("flare", 0.0))  # type: ignore[arg-type]
    if flare:
        tail = [sp.at(-6.4, 17.0), sp.at(-6.4 - flare, 19.8), sp.at(-3.0, 19.8)]
        draw.shaded_polygon(frame, tail, "blazer", part, 1, 3)


def blazer_cuff(along: float, across: float, tone: int, segment: int):
    """White shirt cuffs peek out of the jacket sleeves at the wrist."""
    if segment == 1 and along > 6.5:
        return ("shirt", 3 if tone >= 3 else 2)
    return None


# ── Shoes ──────────────────────────────────────────────────────────────────

SNEAKER_LEGEND: Legend = {
    "o": ("sole", 0),
    "O": ("sole", 1),
    "0": ("sneaker", 0),
    "1": ("sneaker", 1),
    "2": ("sneaker", 2),
    "3": ("sneaker", 3),
}

# (sprite, ankle anchor). Toes point right.
SNEAKER_ART = {
    "flat": ("""
        .22.....
        1223....
        12233332
        oooooooo
    """, (2, 0)),
    "toe": ("""
        .12.....
        1223....
        .12333..
        ..oo332.
        ....ooo.
    """, (2, 0)),
    "heel": ("""
        .22....3
        1223.332
        122333o.
        ooooo...
    """, (2, 0)),
    "point": ("""
        .22..
        1223.
        12333
        .1233
        ..o32
        ...o.
    """, (2, 0)),
    "back": ("""
        122..
        1223.
        o123.
        oo1..
    """, (1, 0)),
    "lift": ("""
        .22......
        12233....
        .1233332.
        ..ooooooo
    """, (2, 0)),
}


LEATHER_LEGEND: Legend = {
    "o": ("sole", 0),
    "O": ("sole", 1),
    "0": ("leather", 0),
    "1": ("leather", 1),
    "2": ("leather", 2),
    "3": ("leather", 3),
    "4": ("leather", 4),
}

# Brown leather oxfords: lower and sleeker than the sneakers, a shine on the toe.
LEATHER_ART = {
    "flat": ("""
        .11.....
        1223....
        12223342
        oooooooo
    """, (2, 0)),
    "toe": ("""
        .11.....
        1223....
        .12334..
        ..oo342.
        ....ooo.
    """, (2, 0)),
    "heel": ("""
        .11....4
        1223.342
        122334o.
        ooooo...
    """, (2, 0)),
    "point": ("""
        .11..
        1223.
        12334
        .1234
        ..o42
        ...o.
    """, (2, 0)),
    "back": ("""
        112..
        1223.
        o123.
        oo1..
    """, (1, 0)),
    "lift": ("""
        .11......
        12234....
        .1233342.
        ..ooooooo
    """, (2, 0)),
}


def shoes(art: Dict[str, Tuple[str, Tuple[int, int]]], legend: Legend) -> Dict[str, Tuple[Pixmap, Tuple[int, int]]]:
    return {k: (Pixmap.parse(text, legend, k), anchor) for k, (text, anchor) in art.items()}


# ── Hands ──────────────────────────────────────────────────────────────────

def paint_hand(frame: Frame, part: int, elbow: Point, wrist: Point, gesture: str, near: bool, ch) -> None:
    """A small shaded hand at the end of the forearm, plus a gesture detail."""
    if gesture == "hidden":
        return
    ramp = ch.palette["skin"]
    dx, dy = wrist[0] - elbow[0], wrist[1] - elbow[1]
    n = math.hypot(dx, dy) or 1.0
    ux, uy = dx / n, dy / n
    cx, cy = wrist[0] + ux * 1.2, wrist[1] + uy * 1.2
    bias = 0.0 if near else -0.4
    r = 1.45 if gesture in ("fist", "grip") else 1.3
    frame.blob((cx, cy), r, r, "skin", part, ramp, lo=1, hi=4 if near else 3, bias=bias)
    if gesture == "point":
        draw.line(frame, (cx + ux * 1.5, cy + uy * 1.5), (cx + ux * 3.2, cy + uy * 3.2), "skin", 2 if near else 1, part)
    elif gesture == "thumb":
        frame.put(int(math.floor(cx)), int(math.floor(cy - 2)), "skin", 3, part)
        frame.put(int(math.floor(cx)), int(math.floor(cy - 3)), "skin", 3, part)


HAND_STYLE = PartStyle(outline_tone=1)
