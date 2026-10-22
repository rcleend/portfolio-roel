"""UX ELIXIR: a rose elixir that makes every complaint make sense for six seconds.

Strips
  icon            a round flask of rose elixir with a cork (24 x 24)
  fx-potion       appear (3) raised in the `hand`, drink (5) with its `lip`
                  anchor on the hero's `mouth` (it tips towards him while the
                  elixir's surface stays level and drops; `bulb` anchors the
                  glint), vanish (4, it breaks into rose motes)
  fx-glint        the drinking glint (5)
  fx-calm-heart   above each calmed customer: pop (4) -> beat (8, loop, a
                  lub-dub) -> wane (4)
  fx-calm-motes   tiny drifting motifs (heart, spark, bubble; 3 frames each),
                  floated by code around calmed customers
"""

from __future__ import annotations

import math
from typing import List, Mapping, Sequence, Tuple

from .. import icon_kit, raster
from ..grid import Grid, rows
from ..motifs import twinkle
from ..palette import CORK, GLASS, ROSE, WHITE
from ..sheet import Animation, Strip

GLASS_INSIDE = "#2a2a46"  # empty glass over a dark slot: a cool, smoky blue


def liquid_tone(x: int, y: int, cx: float, cy: float, r: float, surface: int) -> str:
    """Rose elixir in a sphere lit from the top-left: a pale meniscus, a lit body, a dark crescent bottom-right."""
    if y == surface:
        return ROSE[4]
    dx, dy = x + 0.5 - cx, y + 0.5 - cy
    toward_light = -(dx * 0.6 + dy * 0.8) / r  # +1 facing the light, -1 facing away
    edge = math.hypot(dx, dy) / r
    if toward_light < -0.45 and edge > 0.55:
        return ROSE[1]
    if toward_light > 0.25 or (dx < -r * 0.55 and edge > 0.7):
        return ROSE[3]
    return ROSE[2]


def flask_icon(frame: int) -> Grid:
    cx, cy, r = 12.0, 15.5, 6.5
    surface = 12
    art = Grid(icon_kit.SIZE, icon_kit.SIZE)
    body = raster.disc(cx, cy, r)
    neck = {(x, y) for x in range(10, 14) for y in range(5, 10)}
    art.plot(body | neck, GLASS_INSIDE)
    for x, y in body:
        if y >= surface:
            art.set(x, y, liquid_tone(x, y, cx, cy, r, surface))
    # A reflection rides the elixir's lit side.
    art.vline(8, surface + 2, surface + 4, ROSE[4])
    # One bubble rises through the elixir during the loop; another rests near the bottom.
    rise = [(14, 19), (14, 18), (13, 17), (13, 16), (14, 15), (14, 14)]
    if 8 <= frame < 8 + len(rise):
        bx, by = rise[frame - 8]
        art.set(bx, by, ROSE[5])
    art.set(11, 19, ROSE[4])
    art.set(15, 17, ROSE[3])
    # Glass edges: lit on the left, a cool rim on the right (the TV's glow).
    edge = raster.ring(cx, cy, r, r, 1)
    art.plot(raster.arc(edge, cx, cy, 150, 260), GLASS[3])
    art.plot(raster.arc(edge, cx, cy, 300, 40), GLASS[2])
    art.vline(10, 5, 9, GLASS[3])
    art.vline(13, 5, 9, GLASS[1])
    # Lip and cork.
    art.hline(9, 14, 4, GLASS[3])
    art.set(14, 4, GLASS[2])
    art.hline(10, 13, 3, CORK[2])
    art.hline(10, 13, 2, CORK[3])
    art.hline(11, 12, 1, CORK[2])
    art.set(13, 3, CORK[1])
    art.set(13, 2, CORK[2])
    # The window highlight on the bulb.
    inner = raster.thin(raster.ring(cx, cy, r - 2, r - 2, 1))
    art.plot(raster.arc(inner, cx, cy, 195, 250), GLASS[4])
    art.set(8, 11, WHITE)
    art = art.outline(GLASS[0], corners=False)
    icon_kit.glint(art, 8, 11, {4: 1, 5: 2, 6: 1}.get(frame, 0), WHITE, ROSE[5])
    return art


def icon() -> Strip:
    return icon_kit.build_icon(icon_kit.glow(ROSE[2], 0.92), flask_icon)


# ── The flask in hand ─────────────────────────────────────────────────────
# Bottle geometry in its own frame (u across, v up the neck, origin at the
# grip where the hand holds the neck). Each tilt is rasterised from these
# shapes at its final angle, and the elixir is everything inside the bulb
# below a horizontal screen line, so its surface stays level as the flask tips.

POTION = 20
GRIP = (10, 10)
BULB = (0.0, -4.6, 3.7)  # centre u, centre v, radius
NECK = [(-1.0, -1.6), (1.0, -1.6), (1.0, 2.2), (-1.0, 2.2)]
LIP = [(-1.5, 2.2), (1.5, 2.2), (1.5, 3.1), (-1.5, 3.1)]
STOPPER = [(-1.0, 3.1), (1.0, 3.1), (1.0, 5.0), (-1.0, 5.0)]


def _to_screen(u: float, v: float, degrees: float) -> Tuple[float, float]:
    a = math.radians(degrees)
    gx, gy = GRIP[0] + 0.5, GRIP[1] + 0.5
    return (gx + u * math.cos(a) + v * math.sin(a), gy + u * math.sin(a) - v * math.cos(a))


Point = Tuple[int, int]


def _pixel(u: float, v: float, degrees: float) -> Point:
    x, y = _to_screen(u, v, degrees)
    return (int(x), int(y))


def lip(degrees: float) -> Point:
    """The flask's mouth (the top of its lip, cork out), for meeting the hero's `mouth` anchor."""
    return _pixel(0.0, 3.0, degrees)


def bulb(degrees: float) -> Point:
    """The middle of the bulb, where the drinking glint goes."""
    return _pixel(BULB[0], BULB[1], degrees)


def flask(degrees: float, fill: float, glint: bool = False, empty_glass: bool = False, corked: bool = True) -> Grid:
    """The flask tipped by `degrees` (negative tips the top towards the hero) with `fill` of the bulb full."""
    g = Grid(POTION, POTION)
    bu, bv, r = BULB
    cx, cy = _to_screen(bu, bv, degrees)
    bulb_mask = raster.disc(cx, cy, r)
    neck = raster.polygon([_to_screen(u, v, degrees) for u, v in NECK])
    lip_ring = raster.polygon([_to_screen(u, v, degrees) for u, v in LIP])
    g.plot(bulb_mask | neck, GLASS[1] if not empty_glass else GLASS[2])
    if fill > 0:
        ys = sorted(y for _, y in bulb_mask)
        # The level line, in screen rows: the lowest `fill` of the bulb's area stays filled.
        target = round(len(bulb_mask) * fill)
        level = max(ys)
        while level >= min(ys) and sum(1 for _, y in bulb_mask if y >= level) < target:
            level -= 1
        for x, y in bulb_mask:
            if y >= level:
                lit = (x + 0.5 - cx) * 0.6 + (y + 0.5 - cy) * 0.8
                g.set(x, y, ROSE[4] if y == level else ROSE[3] if lit < 0 else ROSE[2])
    g.plot(lip_ring, GLASS[3])
    if corked:
        g.plot(raster.polygon([_to_screen(u, v, degrees) for u, v in STOPPER]), CORK[2])
    out = g.outline(GLASS[0], corners=False)
    # The window highlight sits on the upper-left of the bulb whatever the tilt: it reflects the light, not the glass.
    out.set(round(cx - 2.2), round(cy - 2.2), WHITE)
    if glint:
        out.set(round(cx - 1.2), round(cy - 2.6), GLASS[4])
    return out


def appear_frames() -> List[Grid]:
    g0 = Grid(POTION, POTION)
    twinkle(g0, GRIP[0], GRIP[1] - 3, 2, WHITE, ROSE[5])
    silhouette = flask(0, 1.0).map(lambda x, y, c: ROSE[5] if c != GLASS[0] else ROSE[3])
    return [g0, silhouette, flask(0, 1.0)]


#: The drink, as (tilt, fill): it tips towards his mouth while the elixir's level stays flat and drops.
DRINK = ((0, 1.0), (-40, 0.8), (-80, 0.5), (-115, 0.2), (-115, 0.0))
VANISH_TILT = -60


def drink_frames() -> List[Grid]:
    # The cork is out for the drink: he drinks from the lip.
    return [flask(tilt, fill, glint=fill == 0, empty_glass=fill == 0, corked=False) for tilt, fill in DRINK]


def vanish_frames() -> List[Grid]:
    frames = [
        flask(VANISH_TILT, 0.0, empty_glass=True, corked=False).map(
            lambda x, y, c: GLASS[4] if c != GLASS[0] else GLASS[2]
        )
    ]
    motes = [(-3, -2), (2, -4), (4, 1), (-4, 3), (0, 4), (3, 4)]
    for spread, tone in ((1.0, ROSE[4]), (1.8, ROSE[3]), (2.6, ROSE[2])):
        g = Grid(POTION, POTION)
        for i, (dx, dy) in enumerate(motes):
            if spread > 2 and i % 2:
                continue
            g.set(
                GRIP[0] + round(dx * spread),
                GRIP[1] - 3 + round(dy * spread) - round(spread),
                tone if i % 3 else GLASS[3],
            )
        frames.append(g)
    return frames


def potion_strip() -> Strip:
    drink_lips = [lip(tilt) for tilt, _ in DRINK]
    return Strip(
        "fx-potion",
        POTION,
        POTION,
        GRIP,
        [
            # Raised in the hand while the pose winds up (two frames at 12 fps).
            Animation("appear", 18, False, appear_frames()),
            # At the lips: `lip` meets the hero's `mouth` anchor; the glint goes on `bulb`.
            Animation(
                "drink", 12, False, drink_frames(), {"lip": drink_lips, "bulb": [bulb(tilt) for tilt, _ in DRINK]}
            ),
            Animation("vanish", 15, False, vanish_frames(), {"lip": [lip(VANISH_TILT)] * 4}),
        ],
    )


# ── Glint ─────────────────────────────────────────────────────────────────


GLINT = 11


def glint_strip() -> Strip:
    frames = []
    for reach in (0, 1, 3, 2, 1):
        g = Grid(GLINT, GLINT)
        twinkle(g, GLINT // 2, GLINT // 2, reach, WHITE, ROSE[4] if reach > 1 else ROSE[5])
        if reach == 3:
            for dx, dy in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
                g.set(GLINT // 2 + dx, GLINT // 2 + dy, ROSE[5])
        frames.append(g)
    return Strip("fx-glint", GLINT, GLINT, (GLINT // 2, GLINT // 2), [Animation("glint", 20, False, frames)])


# ── Calm motifs ───────────────────────────────────────────────────────────

HEART_7 = rows(
    """
    .HH.hh.
    HWhhhhh
    Hhhhhhs
    .hhhhs.
    ..hhs..
    ...s...
"""
)
HEART_9 = rows(
    """
    .HHH.hhh.
    HHWhhhhhh
    HHhhhhhhs
    Hhhhhhhss
    .hhhhhss.
    ..hhhss..
    ...hss...
    ....s....
"""
)
HEART_5 = rows(
    """
    HH.hh
    Hhhhs
    .hhs.
    ..s..
"""
)
HEART_3 = rows(
    """
    H.h
    .s.
"""
)
HEART_KEY = {"H": ROSE[4], "W": ROSE[5], "h": ROSE[3], "s": ROSE[2]}
CALM_HEART = 11


def _heart(art: Sequence[str]) -> Grid:
    g = Grid(CALM_HEART, CALM_HEART)
    w, h = len(art[0]), len(art)
    # Bottom-centred, so the heart grows upwards from the point it hangs on.
    g.stamp(CALM_HEART // 2 - w // 2, CALM_HEART - 1 - h, art, HEART_KEY)
    return g.outline(ROSE[0], corners=False)


def calm_heart_strip() -> Strip:
    rest, big = _heart(HEART_7), _heart(HEART_9)
    pop = [_heart(HEART_3), _heart(HEART_5), big, rest]
    beat = [rest, rest, rest, rest, big, rest, big, rest]  # lub ... dub
    wane_motes = Grid(CALM_HEART, CALM_HEART)
    wane_motes.set(3, 4, ROSE[3])
    wane_motes.set(7, 2, ROSE[4])
    wane = [_heart(HEART_5), _heart(HEART_3), wane_motes, Grid(CALM_HEART, CALM_HEART)]
    wane[-1].set(7, 1, ROSE[2])
    return Strip(
        "fx-calm-heart",
        CALM_HEART,
        CALM_HEART,
        (CALM_HEART // 2, CALM_HEART - 1),
        [
            Animation("pop", 15, False, pop),
            Animation("beat", 8, True, beat),
            Animation("wane", 8, False, wane),
        ],
    )


MOTE = 7


def calm_motes_strip() -> Strip:
    def mote(art: Sequence[str], key: Mapping[str, str]) -> Grid:
        g = Grid(MOTE, MOTE)
        g.stamp(MOTE // 2 - len(art[0]) // 2, MOTE // 2 - len(art) // 2, art, key)
        return g

    hearts = [
        mote(HEART_5, HEART_KEY).outline(ROSE[0], corners=False),
        mote(HEART_5, {"H": ROSE[3], "h": ROSE[2], "s": ROSE[1]}),
        mote(HEART_3, {"H": ROSE[3], "h": ROSE[2], "s": ROSE[1]}),
    ]
    sparks = []
    for reach, arm in ((2, ROSE[4]), (1, ROSE[4]), (0, ROSE[3])):
        g = Grid(MOTE, MOTE)
        twinkle(g, MOTE // 2, MOTE // 2, reach, ROSE[5] if reach else ROSE[3], arm)
        sparks.append(g)
    bubbles = []
    for radius, tone in ((2.0, ROSE[4]), (1.5, ROSE[3]), (0.8, ROSE[2])):
        g = Grid(MOTE, MOTE)
        g.plot(raster.thin(raster.ring(MOTE / 2, MOTE / 2, radius, radius)), tone)
        if radius > 1.5:
            g.set(MOTE // 2 - 1, MOTE // 2 - 1, ROSE[5])
        bubbles.append(g)
    return Strip(
        "fx-calm-motes",
        MOTE,
        MOTE,
        (MOTE // 2, MOTE // 2),
        [
            Animation("heart", 6, False, hearts),
            Animation("spark", 6, False, sparks),
            Animation("bubble", 6, False, bubbles),
        ],
    )


def strips() -> List[Strip]:
    return [icon(), potion_strip(), glint_strip(), calm_heart_strip(), calm_motes_strip()]
