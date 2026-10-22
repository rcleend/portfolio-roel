"""POWER CHORD: one strum on the white Strat, a screen-wide shockwave that stuns every customer.

Strips
  icon        the Olympic White Strat with sound arcs (24 x 24)
  fx-strum    at the guitar body (`hand` anchor): the pick's stroke, a burst,
              a ring breaking into sparkles (6); strum-calm for reduced motion
  fx-notes    note particles the shockwave throws off: eighth, beamed (2 each)
  fx-ringing  sound arcs pulsing out from a stunned customer's ears while the
              stun lasts: ring (4, loop), fade (2); the dizzy stars are the
              customer sheet's own
The shockwave rings themselves are code: flattened ellipses that grow in
whole-pixel steps with the SOUND bands (see docs/looks/portrait-skills.md).
"""

from __future__ import annotations

import math
from typing import List, Sequence, Tuple

from .. import icon_kit, raster
from ..grid import Grid, rows
from ..motifs import twinkle
from ..palette import CHROME, MAPLE, PICKGUARD, ROSEWOOD, SOUND, STRAT_BODY, WHITE
from ..sheet import Animation, Strip

Vec = Tuple[float, float]

# The Strat in its own frame: u across the body (the bass side negative), v
# along the neck (towards the headstock positive), in icon pixels. Only the
# outline vertices are rotated; the pixels are rasterised once, at the final angle.
# fmt: off
BODY = [
    (0.0, -7.4), (2.6, -7.1), (4.5, -5.9), (5.3, -3.6), (5.0, -1.6),  # butt and lower bout, treble side
    (4.3, 0.4), (4.7, 2.4), (4.8, 4.6), (4.4, 6.2), (3.8, 6.9),  # waist up to the treble horn
    (3.1, 6.3), (2.5, 4.6), (1.9, 3.3), (1.1, 3.5),  # treble cutaway into the neck pocket
    (-1.1, 3.5), (-1.8, 3.4), (-2.4, 5.0), (-2.8, 7.4),  # bass cutaway, a deep one
    (-3.4, 8.7), (-4.2, 8.4), (-4.7, 6.4), (-4.9, 3.8),  # the long bass horn
    (-4.6, 1.8), (-4.2, 0.4), (-5.0, -1.6), (-5.3, -3.6), (-4.5, -5.9), (-2.6, -7.1),  # waist and lower bout
]
PICKGUARD_SHAPE = [
    (-1.1, 3.9), (1.1, 3.9), (1.9, 2.8), (2.9, 0.2), (3.2, -3.0), (2.2, -4.4),
    (-0.4, -4.0), (-2.4, -3.2), (-3.4, -1.0), (-3.3, 2.2), (-2.4, 4.4), (-1.8, 4.6),
]
NECK = [(-1.05, 3.6), (1.05, 3.6), (1.0, 16.6), (-1.0, 16.6)]
HEADSTOCK = [(-1.1, 16.4), (1.2, 16.4), (1.7, 17.6), (1.1, 20.9), (-0.4, 21.6), (-1.5, 20.8), (-1.4, 18.4)]
# fmt: on


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
    """The Olympic White Strat: cream body, mint pickguard and pickups, rosewood board, maple neck and headstock."""
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
    for v, u0, u1, tone in (
        (2.2, -1.1, 1.1, PICKGUARD[0]),
        (0.2, -1.1, 1.1, PICKGUARD[0]),
        (-1.9, -1.2, 1.0, PICKGUARD[0]),
        (-4.3, -1.4, 1.4, CHROME[2]),
    ):
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
    pulse = {12: 0, 13: 1, 14: 2}.get(frame)  # which arc the pulse is on, if any
    at_rest = (SOUND[4], SOUND[3], SOUND[2])  # fading outwards
    for index, radius in enumerate((3.5, 6.0, 8.5)):
        arc = raster.arc(raster.thin(raster.ring(cx, cy, radius, radius)), cx, cy, -48, 48)
        if pulse is None:
            tone = at_rest[index]
        else:
            tone = SOUND[4] if index == pulse else SOUND[2]
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


def _ring(g: Grid, radius: float, tones: Sequence[str], dashes: int = 0) -> None:
    """Concentric one-pixel rings from `radius` inwards, one per tone; `dashes` > 0 breaks them into even dashes."""
    for i, tone in enumerate(tones):
        ring = raster.thin(raster.ring(*CENTRE, radius - i, radius - i))
        g.plot(raster.dashed(ring, *CENTRE, dashes, 0.55) if dashes else ring, tone)


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
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for i in (12, 13, 14):
            g.set(C + dx * i, C + dy * i, SOUND[3] if calm else SOUND[4])
    if not calm:
        g.rect(C - 1, C - 1, 3, 3, SOUND[4])
        g.set(C, C, WHITE)
    frames.append(g)
    g = Grid(STRUM, STRUM)
    _ring(g, 14.5, (SOUND[3],), dashes=14)
    for x, y in ((C - 15, C - 9), (C + 16, C - 6), (C + 10, C + 14), (C - 11, C + 13)):
        twinkle(g, x, y, 1, SOUND[4], SOUND[3])
    frames.append(g)
    g = Grid(STRUM, STRUM)
    _ring(g, 18.5, (SOUND[2],), dashes=18)
    for x, y in ((C - 17, C - 11), (C + 18, C - 8), (C + 12, C + 16), (C - 13, C + 15)):
        g.set(x, y, SOUND[4])
    frames.append(g)
    g = Grid(STRUM, STRUM)
    for x, y in ((C - 19, C - 13), (C + 12, C + 18)):
        g.set(x, y, SOUND[3])
    frames.append(g)
    return frames


def strum_strip() -> Strip:
    return Strip(
        "fx-strum",
        STRUM,
        STRUM,
        (C, C),
        [
            Animation("strum", 20, False, strum_frames(calm=False)),
            Animation("strum-calm", 20, False, strum_frames(calm=True)),
        ],
    )


# ── Notes ─────────────────────────────────────────────────────────────────

EIGHTH = rows(
    """
    ...W..
    ...WW.
    ...W.W
    ...W..
    .LLW..
    LWLL..
    .LL...
"""
)
BEAMED = rows(
    """
    ...WWWWWW
    ...LLLLLL
    ...W....W
    ...W....W
    .LLW..LLW
    LWLL.LWLL
    .LL...LL.
"""
)
NOTE = 11


def note(art: Sequence[str], bright: bool) -> Grid:
    g = Grid(NOTE, NOTE)
    key = {"W": WHITE if bright else SOUND[4], "L": SOUND[4] if bright else SOUND[3]}
    g.stamp(NOTE // 2 - len(art[0]) // 2, NOTE - 2 - len(art), art, key)
    return g.outline(SOUND[1], corners=False)


def notes_strip() -> Strip:
    return Strip(
        "fx-notes",
        NOTE,
        NOTE,
        (NOTE // 2, NOTE - 2),
        [
            Animation("eighth", 8, True, [note(EIGHTH, False), note(EIGHTH, True)]),
            Animation("beamed", 8, True, [note(BEAMED, False), note(BEAMED, True)]),
        ],
    )


# ── Ringing ears ──────────────────────────────────────────────────────────
# Stunned customers wear their own dizzy stars (the customer sheet owns them),
# so the chord's mark on them is sound: arcs pulsing out from both ears, the
# chord still ringing, for as long as the stun lasts.

RINGING_W, RINGING_H = 37, 15
RINGING_CENTRE = (18.5, 7.5)  # the middle of the head, on a pixel corner so both sides mirror exactly
EAR_RADII = (8.0, 11.5, 15.0)


def _ear_arcs(g: Grid, radius: float, tone: str) -> None:
    ring = raster.thin(raster.ring(*RINGING_CENTRE, radius, radius))
    g.plot(raster.arc(ring, *RINGING_CENTRE, -28, 28), tone)  # the right ear
    g.plot(raster.arc(ring, *RINGING_CENTRE, 152, 208), tone)  # the left ear


def ringing_frames() -> List[Grid]:
    """A pulse travels out through three arcs on each side, one step per frame, and starts again."""
    frames = []
    for step in range(4):
        g = Grid(RINGING_W, RINGING_H)
        for index, radius in enumerate(EAR_RADII):
            # The pulse sits on arc `step`; arcs it has passed are a step dimmer, the rest rest dim.
            tone = SOUND[4] if index == step else SOUND[3] if index == step - 1 else SOUND[2]
            if step == 3 and index == 0:
                tone = SOUND[3]  # the next pulse gathering at the ear
            _ear_arcs(g, radius, tone)
        # No outline: arcs this close would merge into one dark shape.
        frames.append(g)
    return frames


def ringing_fade_frames() -> List[Grid]:
    frames = []
    for radii, tone in ((EAR_RADII[1:], SOUND[2]), (EAR_RADII[2:], SOUND[1])):
        g = Grid(RINGING_W, RINGING_H)
        for radius in radii:
            _ear_arcs(g, radius, tone)
        frames.append(g)
    return frames


def ringing_strip() -> Strip:
    return Strip(
        "fx-ringing",
        RINGING_W,
        RINGING_H,
        (RINGING_W // 2, RINGING_H // 2),
        [
            Animation("ring", 8, True, ringing_frames()),
            Animation("fade", 6, False, ringing_fade_frames()),
        ],
    )


def strips() -> List[Strip]:
    return [icon(), strum_strip(), notes_strip(), ringing_strip()]
