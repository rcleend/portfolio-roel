"""POWER CHORD: one strum on the white Strat, a screen-wide shockwave that stuns every customer.

Strips
  icon        the Olympic White Strat with sound arcs (24 x 24)
  fx-strum    at the guitar body (`hand` anchor): the pick's stroke, a burst,
              a ring breaking into sparkles (6); strum-calm for reduced motion
  fx-notes    note particles the shockwave throws off: eighth, beamed (2 each)
  fx-stun     three stars circling a stunned customer's head, nearer ones
              larger (8, loop, a third of a turn so identical stars loop seamlessly)
The shockwave rings themselves are code: flattened ellipses that grow in
whole-pixel steps with the SOUND bands (see docs/looks/portrait-skills.md).
"""

from __future__ import annotations

import math
from typing import List, Sequence, Tuple

from .. import icon_kit, raster
from ..grid import Grid, rows
from ..palette import CHROME, GOLD, MAPLE, PICKGUARD, ROSEWOOD, SOUND, STRAT_BODY, WHITE
from ..sheet import Animation, Strip

Vec = Tuple[float, float]

# The Strat in its own frame: x across the body (bass side negative), y along
# the neck (towards the headstock positive), in icon pixels. Only the outline
# vertices are rotated; the pixels are rasterised once, at the final angle.
BODY = [
    (0.0, -7.4), (2.6, -7.1), (4.5, -5.9), (5.3, -3.6), (5.0, -1.6), (4.3, 0.4), (4.7, 2.4),
    (4.8, 4.6), (4.4, 6.2), (3.8, 6.9), (3.1, 6.3), (2.5, 4.6), (1.9, 3.3), (1.1, 3.5),
    (-1.1, 3.5), (-1.8, 3.4), (-2.4, 5.0), (-2.8, 7.4), (-3.4, 8.7), (-4.2, 8.4), (-4.7, 6.4),
    (-4.9, 3.8), (-4.6, 1.8), (-4.2, 0.4), (-5.0, -1.6), (-5.3, -3.6), (-4.5, -5.9), (-2.6, -7.1),
]
PICKGUARD_SHAPE = [
    (-1.1, 3.9), (1.1, 3.9), (1.9, 2.8), (2.9, 0.2), (3.2, -3.0), (2.2, -4.4), (-0.4, -4.0),
    (-2.4, -3.2), (-3.4, -1.0), (-3.3, 2.2), (-2.4, 4.4), (-1.8, 4.6),
]
NECK = [(-1.05, 3.6), (1.05, 3.6), (1.0, 16.6), (-1.0, 16.6)]
HEADSTOCK = [(-1.1, 16.4), (1.2, 16.4), (1.7, 17.6), (1.1, 20.9), (-0.4, 21.6), (-1.5, 20.8), (-1.4, 18.4)]


class Pose:
    """Places the guitar's frame on screen: body centre and the neck's angle from vertical."""

    def __init__(self, cx: float, cy: float, degrees: float) -> None:
        self.cx, self.cy = cx, cy
        a = math.radians(degrees)
        self.cos, self.sin = math.cos(a), math.sin(a)

    def point(self, u: float, v: float) -> Vec:
        """(u across, v along the neck) -> screen pixels (y down)."""
        return (self.cx + u * self.cos + v * self.sin, self.cy + u * self.sin - v * self.cos)

    def shape(self, points: Sequence[Vec]) -> List[Vec]:
        return [self.point(u, v) for u, v in points]


def strat(pose: Pose, size: int) -> Grid:
    grid = Grid(size, size)
    body = raster.polygon(pose.shape(BODY))
    # Olympic White, lit from the top-left: lighter on the bass horn side, a cool shade towards the butt.
    for x, y in body:
        u = (x + 0.5 - pose.cx) * pose.cos + (y + 0.5 - pose.cy) * pose.sin
        v = (x + 0.5 - pose.cx) * pose.sin - (y + 0.5 - pose.cy) * pose.cos
        light = -u * 0.35 + v * 0.3
        grid.set(x, y, STRAT_BODY[4] if light > 1.2 else STRAT_BODY[3] if light > -1.4 else STRAT_BODY[2])
    guard = raster.polygon(pose.shape(PICKGUARD_SHAPE)) & body
    for x, y in guard:
        grid.set(x, y, PICKGUARD[2])
    # Three single-coil pickups and the chrome bridge, across the strings.
    for v, u0, u1, tone in ((2.2, -1.1, 1.1, PICKGUARD[0]), (0.2, -1.1, 1.1, PICKGUARD[0]),
                            (-1.9, -1.2, 1.0, PICKGUARD[0]), (-4.3, -1.4, 1.4, CHROME[2])):
        a, b = pose.point(u0, v), pose.point(u1, v)
        grid.line(round(a[0] - 0.5), round(a[1] - 0.5), round(b[0] - 0.5), round(b[1] - 0.5), tone)
    neck = raster.polygon(pose.shape(NECK))
    for x, y in neck:
        u = (x + 0.5 - pose.cx) * pose.cos + (y + 0.5 - pose.cy) * pose.sin
        grid.set(x, y, ROSEWOOD[1] if u < 0.35 else MAPLE[3])
    head = raster.polygon(pose.shape(HEADSTOCK))
    for x, y in head:
        grid.set(x, y, MAPLE[3])
    for v in (17.6, 19.0, 20.4):
        tx, ty = pose.point(-1.6, v)
        grid.set(round(tx - 0.5), round(ty - 0.5), CHROME[3])
    return grid


def sound_arcs(grid: Grid, cx: float, cy: float, frame: int) -> None:
    """Three tight arcs of sound off the treble side; a bright pulse travels outwards once per loop."""
    lit = {12: 0, 13: 1, 14: 2}.get(frame)
    for index, radius in enumerate((3.5, 6.0, 8.5)):
        arc = raster.arc(raster.thin(raster.ring(cx, cy, radius, radius)), cx, cy, -48, 48)
        tone = SOUND[4] if index == lit else (SOUND[4], SOUND[3], SOUND[2])[index] if lit is None else SOUND[2]
        for x, y in arc:
            if not grid.opaque(x, y):
                grid.set(x, y, tone)


def guitar_icon(frame: int) -> Grid:
    pose = Pose(7.4, 15.6, 45.0)
    guitar = strat(pose, icon_kit.SIZE)
    art = guitar.outline(STRAT_BODY[0], corners=False)
    sound_arcs(art, 12.5, 18.5, frame)
    return art


def icon() -> Strip:
    return icon_kit.build_icon(icon_kit.glow(SOUND[2]), guitar_icon)


# ── Strum ─────────────────────────────────────────────────────────────────

STRUM = 48
C = STRUM // 2
CENTRE = (C + 0.5, C + 0.5)


def _rays(g: Grid, lengths: Sequence[int], start: int, core: str, edge: str, diagonal: Tuple[int, str]) -> None:
    for (dx, dy), length in zip(((1, 0), (-1, 0), (0, 1), (0, -1)), lengths):
        for i in range(start, length + 1):
            g.set(C + dx * i, C + dy * i, core if i < length - 2 else edge)
    reach, tone = diagonal
    for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        for i in range(2, reach + 1):
            g.set(C + dx * i, C + dy * i, tone)


def _ring(g: Grid, radius: float, tones: Sequence[str], dash: int = 0) -> None:
    for i, tone in enumerate(tones):
        ring = raster.thin(raster.ring(*CENTRE, radius - i, radius - i))
        for x, y in ring:
            if dash and ((x * 7 + y * 3) // dash) % 2:
                continue
            g.set(x, y, tone)


def _star4(g: Grid, x: int, y: int, size: int, core: str, arm: str) -> None:
    g.set(x, y, core)
    for i in range(1, size + 1):
        for dx, dy in ((i, 0), (-i, 0), (0, i), (0, -i)):
            g.set(x + dx, y + dy, core if i < size else arm)


def strum_frames(calm: bool) -> List[Grid]:
    frames = []
    if not calm:
        g = Grid(STRUM, STRUM)  # f0: the pick's stroke across the strings, a bright crescent
        stroke = raster.arc(raster.ring(C - 6.5, C + 6.5, 13, 13, 2), C - 6.5, C + 6.5, 290, 350)
        for x, y in stroke:
            g.set(x, y, WHITE if (x + y) % 3 else SOUND[4])
        g.plot(raster.arc(raster.thin(raster.ring(C - 6.5, C + 6.5, 10.5, 10.5)), C - 6.5, C + 6.5, 295, 345), SOUND[3])
        frames.append(g)
        g = Grid(STRUM, STRUM)  # f1: the chord lands, a burst with a white heart
        _rays(g, (13, 13, 9, 15), 2, SOUND[4], SOUND[3], (6, SOUND[3]))
        g.plot(raster.polygon([(C + 0.5, C - 3.5), (C + 4.5, C + 0.5), (C + 0.5, C + 4.5), (C - 3.5, C + 0.5)]), WHITE)
        frames.append(g)
    g = Grid(STRUM, STRUM)  # the ring leaves; the rays break off at their tips
    _ring(g, 9.5, (SOUND[4], SOUND[3]))
    for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for i in (12, 13, 14):
            g.set(C + dx * i, C + dy * i, SOUND[3] if calm else SOUND[4])
    if not calm:
        g.rect(C - 1, C - 1, 3, 3, SOUND[4])
        g.set(C, C, WHITE)
    frames.append(g)
    g = Grid(STRUM, STRUM)
    _ring(g, 14.5, (SOUND[3],), dash=4)
    for x, y in ((C - 15, C - 9), (C + 16, C - 6), (C + 10, C + 14), (C - 11, C + 13)):
        _star4(g, x, y, 1, SOUND[4], SOUND[3])
    frames.append(g)
    g = Grid(STRUM, STRUM)
    _ring(g, 18.5, (SOUND[2],), dash=3)
    for x, y in ((C - 17, C - 11), (C + 18, C - 8), (C + 12, C + 16), (C - 13, C + 15)):
        g.set(x, y, SOUND[4])
    frames.append(g)
    g = Grid(STRUM, STRUM)
    for x, y in ((C - 19, C - 13), (C + 12, C + 18)):
        g.set(x, y, SOUND[3])
    frames.append(g)
    return frames


def strum_strip() -> Strip:
    return Strip("fx-strum", STRUM, STRUM, (C, C), [
        Animation("strum", 20, False, strum_frames(calm=False)),
        Animation("strum-calm", 20, False, strum_frames(calm=True)),
    ])


# ── Notes ─────────────────────────────────────────────────────────────────

EIGHTH = rows("""
    ...W..
    ...WW.
    ...W.W
    ...W..
    .LLW..
    LWLL..
    .LL...
""")
BEAMED = rows("""
    ...WWWWWW
    ...LLLLLL
    ...W....W
    ...W....W
    .LLW..LLW
    LWLL.LWLL
    .LL...LL.
""")
NOTE = 11


def note(art: Sequence[str], bright: bool) -> Grid:
    g = Grid(NOTE, NOTE)
    key = {"W": WHITE if bright else SOUND[4], "L": SOUND[4] if bright else SOUND[3]}
    g.stamp(NOTE // 2 - len(art[0]) // 2, NOTE - 2 - len(art), art, key)
    return g.outline(SOUND[1], corners=False)


def notes_strip() -> Strip:
    return Strip("fx-notes", NOTE, NOTE, (NOTE // 2, NOTE - 2), [
        Animation("eighth", 8, True, [note(EIGHTH, False), note(EIGHTH, True)]),
        Animation("beamed", 8, True, [note(BEAMED, False), note(BEAMED, True)]),
    ])


# ── Stun stars ────────────────────────────────────────────────────────────

STUN_W, STUN_H = 27, 13
STUN_CENTRE = (13, 6)


def stun_frames() -> List[Grid]:
    frames = []
    for f in range(8):
        g = Grid(STUN_W, STUN_H)
        stars = []
        for k in range(3):
            angle = math.radians(f * 15 + k * 120)
            x = round(STUN_CENTRE[0] + math.cos(angle) * 10)
            y = round(STUN_CENTRE[1] + math.sin(angle) * 3)
            stars.append((math.sin(angle), x, y))
        # Far stars first, so the nearer ones pass in front of them.
        for depth, x, y in sorted(stars):
            if depth > 0.3:
                _star4(g, x, y, 2, GOLD[5], GOLD[3])
                g.set(x, y, WHITE)
            elif depth > -0.5:
                _star4(g, x, y, 1, GOLD[4], GOLD[3])
            else:
                _star4(g, x, y, 1, GOLD[3], GOLD[2])
        frames.append(g.outline(GOLD[0], corners=False))
    return frames


def stun_strip() -> Strip:
    return Strip("fx-stun", STUN_W, STUN_H, (STUN_CENTRE[0], STUN_H - 1), [Animation("orbit", 12, True, stun_frames())])


def strips() -> List[Strip]:
    return [icon(), strum_strip(), notes_strip(), stun_strip()]
