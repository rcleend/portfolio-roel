"""CHURN SHIELD: a retention bubble that blocks every hit for five seconds.

The bubble is drawn in two layers so it can enclose the hero without veiling
him: `fx-shell-back` (a faint film and the far side of the rim) goes behind
the hero, `fx-shell` (the near rim, thin-film colour and the window
highlight) in front of him. Both share frame size, origin and timing.

Strips
  icon            a glass bubble round a coral heart (24 x 24)
  fx-shell        front layer, 88 x 88 round the bubble's centre:
                  form (5) -> shimmer (8, loop) -> wane (4, loop) -> pop (6)
  fx-shell-back   back layer: form (5), shimmer (8, loop), wane (4, loop)
  fx-ripple       a hit spreading across the surface from where a customer
                  bumped it, drawn for the right side (flip for the left) (6)
  fx-heart        the small coral heart a calmed customer gives off (5)
"""

from __future__ import annotations

import math
from typing import Callable, List, Optional, Sequence, Tuple

from .. import icon_kit, raster
from ..grid import Grid, rows
from ..palette import AQUA, CORAL, IRIS, WHITE
from ..sheet import Animation, Strip

HEART = rows(
    """
    .HH.hh.
    HHhhhhh
    Hhhhhhs
    .hhhhs.
    ..hhs..
    ...s...
"""
)

HEART_BEAT = rows(
    """
    .HHH.hhh.
    HHHhhhhhh
    HHhhhhhhs
    Hhhhhhhss
    .hhhhhss.
    ..hhhss..
    ...hss...
    ....s....
"""
)

HEART_KEY = {"H": CORAL[3], "h": CORAL[2], "s": CORAL[1]}
BUBBLE_INSIDE = "#123540"  # the icon bubble's deep interior, a step above the dark slot


def bubble_icon(frame: int) -> Grid:
    cx, cy, r = 12.0, 12.0, 9.0
    art = Grid(icon_kit.SIZE, icon_kit.SIZE)
    body = raster.disc(cx, cy, r)
    # Deep interior, a lighter band just inside the rim (the Fresnel edge that makes glass read as glass).
    art.plot(body, BUBBLE_INSIDE)
    art.plot(raster.ring(cx, cy, r - 1, r - 1, 1), AQUA[1])
    rim = raster.ring(cx, cy, r, r, 1)
    art.plot(raster.arc(rim, cx, cy, 300, 120), AQUA[2])
    art.plot(raster.arc(rim, cx, cy, 120, 160), AQUA[3])
    art.plot(raster.arc(rim, cx, cy, 160, 300), AQUA[4])
    # Thin-film colour where the film turns away from the light.
    art.plot(raster.arc(rim, cx, cy, 20, 55), IRIS[1])
    art.plot(raster.arc(rim, cx, cy, 150, 175), IRIS[0])
    # The window highlight, top-left, and a soft bounce at the bottom-right.
    inner = raster.thin(raster.ring(cx, cy, r - 2.5, r - 2.5, 1))
    art.plot(raster.arc(inner, cx, cy, 200, 245), AQUA[5])
    art.set(7, 7, WHITE)
    art.plot(raster.arc(inner, cx, cy, 30, 50), AQUA[3])
    beat = frame in (12, 13)
    heart = HEART_BEAT if beat else HEART
    art.stamp(12 - len(heart[0]) // 2, 13 - len(heart) // 2, heart, HEART_KEY)
    art = art.outline(AQUA[0], corners=False)
    return art


def icon() -> Strip:
    return icon_kit.build_icon(icon_kit.glow(AQUA[2]), bubble_icon)


# ── The bubble ────────────────────────────────────────────────────────────
# A 64 px sphere round a 54-60 px hero: centred 31 px above his feet, it rests
# on the ground and clears his hair by a few pixels.

SHELL = 88
C = SHELL // 2
CENTRE = (float(C), float(C))
RADIUS = 32
#: Angles (degrees, 0 = right, 90 = down) of the four thin-film bands; they turn 90 degrees per shimmer loop.
FILM = ((-150, IRIS[0]), (-60, IRIS[2]), (30, IRIS[1]), (120, IRIS[0]))


def _sector_tone(angle: float, lit: Sequence[str]) -> str:
    """Rim shading by direction: brightest facing the top-left light, darkest facing away."""
    facing = math.cos(math.radians(angle - 225))
    return lit[3] if facing > 0.7 else lit[2] if facing > 0.0 else lit[1] if facing > -0.7 else lit[0]


def rim(
    g: Grid, radius: float, dim: int = 0, film_turn: float = 0.0, keep: Optional[Callable[[float], bool]] = None
) -> None:
    """The near rim: a 2 px band shaded by direction, a dark selective outline on the shadow side, film colour.

    `dim` lowers the brightest step of the outer band (the forming and waning
    bubble is less sure of itself); `keep(angle)` drops parts of the rim.
    """
    outer = raster.thin(raster.ring(*CENTRE, radius, radius))
    inner = raster.thin(raster.ring(*CENTRE, radius - 1, radius - 1)) - outer
    edge = raster.thin(raster.ring(*CENTRE, radius + 1, radius + 1)) - outer - inner
    ramp_outer = tuple(AQUA[min(step, 5 - dim)] for step in (2, 3, 4, 5))
    ramp_inner = (AQUA[1], AQUA[2], AQUA[3], AQUA[4])
    for mask, ramp in ((outer, ramp_outer), (inner, ramp_inner)):
        for x, y in mask:
            angle = math.degrees(math.atan2(y + 0.5 - C, x + 0.5 - C))
            if keep and not keep(angle):
                continue
            g.set(x, y, _sector_tone(angle, ramp))
    for x, y in edge:
        angle = math.degrees(math.atan2(y + 0.5 - C, x + 0.5 - C))
        # Selective outline: only the side turned from the light gets a dark edge, for the bright golden-hour sky.
        if math.cos(math.radians(angle - 45)) > 0.2 and (not keep or keep(angle)):
            g.set(x, y, AQUA[1])
    for base, tone in FILM:
        centre = base + film_turn
        for x, y in outer:
            angle = math.degrees(math.atan2(y + 0.5 - C, x + 0.5 - C))
            delta = (angle - centre + 180) % 360 - 180
            if abs(delta) < 9 and (not keep or keep(angle)):
                g.set(x, y, tone)


def highlights(g: Grid, radius: float, bright: bool = True, sparkle: bool = False) -> None:
    """The window: a crescent and a spec on the lit side, and a faint bounce on the far side."""
    window = raster.ring(*CENTRE, radius - 4, radius - 4, 2)
    g.plot(raster.arc(window, *CENTRE, 205, 245), AQUA[5] if bright else AQUA[4])
    g.plot(
        raster.arc(raster.thin(raster.ring(*CENTRE, radius - 4, radius - 4)), *CENTRE, 214, 236),
        WHITE if bright else AQUA[5],
    )
    sx, sy = C - round(radius * 0.48), C - round(radius * 0.62)
    g.rect(sx, sy, 2, 2, WHITE if bright else AQUA[5])
    bounce = raster.thin(raster.ring(*CENTRE, radius - 4, radius - 4))
    g.plot(raster.arc(bounce, *CENTRE, 25, 55), AQUA[3])
    if sparkle:
        for dx, dy in ((0, -2), (0, 2), (-2, 0), (2, 0)):
            g.set(sx + dx, sy + dy, AQUA[5])


BAYER_4 = (0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)


def back_layer(radius: float, film: float = 0.25, dim: bool = False, swirl: int = 0) -> Grid:
    """Behind the hero: the far side of the rim and a thin film near the edge.

    A soap film is seen edge-on near the rim and face-on in the middle, so it
    only shows as a band just inside the rim (an ordered dither, densest at
    the edge). The middle stays clear, which keeps the hero and a busy
    backdrop free of screen-door noise. `swirl` slides the dither pattern
    round the bubble a step per frame, so the film drifts while it shimmers.
    """
    g = Grid(SHELL, SHELL)
    band = raster.disc(*CENTRE, radius - 2) - raster.disc(*CENTRE, radius - 6)
    for x, y in band:
        depth = radius - 2 - math.hypot(x + 0.5 - C, y + 0.5 - C)  # 0 at the rim, 4 at the band's inner edge
        coverage = film * (1 - depth / 4)
        if BAYER_4[(y % 4) * 4 + (x + swirl) % 4] / 16 < coverage:
            g.set(x, y, AQUA[2] if not dim else AQUA[1])
    far = raster.thin(raster.ring(*CENTRE, radius - 2, radius - 2))
    g.plot(raster.arc(far, *CENTRE, 20, 160), AQUA[1])
    return g


def front_layer(radius: float, film_turn: float = 0.0, sparkle: bool = False) -> Grid:
    g = Grid(SHELL, SHELL)
    rim(g, radius, film_turn=film_turn)
    highlights(g, radius, sparkle=sparkle)
    return g


FORM_RADII = (10, 20, 29, 35, 32)


def form_frames(back: bool) -> List[Grid]:
    frames = []
    for i, radius in enumerate(FORM_RADII):
        if back:
            frames.append(back_layer(radius, film=0.08 * i))
            continue
        g = Grid(SHELL, SHELL)
        rim(g, radius, dim=0 if i >= 3 else 1)
        if i == 0:
            g.plot(raster.disc(*CENTRE, 3), AQUA[5])
            g.set(C, C, WHITE)
        if i >= 3:
            highlights(g, radius, bright=i == 4)
        frames.append(g)
    return frames


def shimmer_frames(back: bool) -> List[Grid]:
    if back:
        return [back_layer(RADIUS, swirl=i // 2) for i in range(8)]
    return [front_layer(RADIUS, film_turn=i * 90 / 8, sparkle=i == 3) for i in range(8)]


def wane_frames(back: bool) -> List[Grid]:
    if back:
        return [back_layer(RADIUS, film=0.18, dim=True), back_layer(RADIUS, film=0.1, dim=True)] * 2
    frames = []
    for i in range(4):
        g = Grid(SHELL, SHELL)
        if i % 2 == 0:
            rim(g, RADIUS, dim=1, film_turn=90 + i * 6)
        else:
            # The rim goes to dashes: the shield is about to give out.
            rim(g, RADIUS, dim=1, film_turn=90 + i * 6, keep=lambda a, phase=i: ((a + 180 + phase * 4) // 14) % 2 == 0)
        highlights(g, RADIUS, bright=False)
        frames.append(g)
    return frames


def pop_frames() -> List[Grid]:
    frames = []
    g = Grid(SHELL, SHELL)  # tension: the whole rim flares white for a frame
    ring = raster.ring(*CENTRE, RADIUS, RADIUS, 2)
    g.plot(ring, AQUA[5])
    g.plot(raster.thin(raster.ring(*CENTRE, RADIUS, RADIUS)), WHITE)
    frames.append(g)
    for radius, span, drops, tone in (
        (35, 22, 0, AQUA[4]),
        (38, 14, 1, AQUA[4]),
        (41, 7, 2, AQUA[3]),
        (43, 0, 3, AQUA[2]),
    ):
        g = Grid(SHELL, SHELL)
        ring = raster.thin(raster.ring(*CENTRE, radius, radius))
        if span:
            g.plot({p for p in ring if _within_arc(p, span)}, tone)
        # Droplets fly out between the arcs and start to fall (drops is how far along they are).
        for k in range(8 if drops else 0):
            a = math.radians(k * 45 + 22.5)
            r = radius - 2 + drops * 2
            x, y = round(C + math.cos(a) * r), round(C + math.sin(a) * r + drops * drops)
            size = 2 if drops < 3 else 1
            g.rect(x, y, size, size, AQUA[4] if drops < 3 else AQUA[3])
        frames.append(g)
    g = Grid(SHELL, SHELL)
    for k in (1, 4, 6):
        a = math.radians(k * 45 + 22.5)
        g.set(round(C + math.cos(a) * 46), round(C + math.sin(a) * 46 + 12), AQUA[2])
    frames.append(g)
    return frames


def _within_arc(p: Tuple[int, int], span: float) -> bool:
    """Eight arcs of `span` degrees, centred on 0, 45, 90 ... degrees."""
    angle = math.degrees(math.atan2(p[1] + 0.5 - C, p[0] + 0.5 - C)) % 45
    return angle < span / 2 or angle > 45 - span / 2


def shell_strip() -> Strip:
    return Strip(
        "fx-shell",
        SHELL,
        SHELL,
        (C, C),
        [
            Animation("form", 20, False, form_frames(back=False)),
            Animation("shimmer", 8, True, shimmer_frames(back=False)),
            Animation("wane", 8, True, wane_frames(back=False)),
            Animation("pop", 20, False, pop_frames()),
            Animation("pop-calm", 20, False, pop_frames()[1:]),
        ],
    )


def shell_back_strip() -> Strip:
    return Strip(
        "fx-shell-back",
        SHELL,
        SHELL,
        (C, C),
        [
            Animation("form", 20, False, form_frames(back=True)),
            Animation("shimmer", 8, True, shimmer_frames(back=True)),
            Animation("wane", 8, True, wane_frames(back=True)),
        ],
    )


# ── Ripple: a bump spreads across the surface ────────────────────────────
# Drawn for a contact on the right of the bubble (flip it for the left): arcs
# centred on the contact point, clipped to the sphere, so the hit spreads
# over the shield's surface instead of out into the street.

RIPPLE_W, RIPPLE_H = 28, 48
CONTACT = (24, 24)


def ripple_frames() -> List[Grid]:
    bubble_cx = CONTACT[0] - RADIUS + 0.5
    inside = raster.disc(bubble_cx, CONTACT[1] + 0.5, RADIUS + 0.5)
    frames = []
    for echoes in (
        ((2, AQUA[5]),),
        ((4, AQUA[5]), (1, WHITE)),
        ((7, AQUA[4]), (3, AQUA[5])),
        ((11, AQUA[3]), (6, AQUA[4])),
        ((15, AQUA[2]), (10, AQUA[3])),
        ((14, AQUA[2]),),
    ):
        g = Grid(RIPPLE_W, RIPPLE_H)
        for radius, tone in echoes:
            ring = raster.thin(raster.ring(CONTACT[0] + 0.5, CONTACT[1] + 0.5, radius + 0.5, radius + 0.5))
            g.plot({p for p in ring if p in inside and p[0] <= CONTACT[0]}, tone)
        frames.append(g)
    # The contact flash on the first two frames: the rim pushed hard enough to glow.
    for i in (0, 1):
        frames[i].vline(CONTACT[0], CONTACT[1] - 3 + i, CONTACT[1] + 3 - i, WHITE)
    return frames


def ripple_strip() -> Strip:
    return Strip("fx-ripple", RIPPLE_W, RIPPLE_H, CONTACT, [Animation("bump", 20, False, ripple_frames())])


# ── Heart: a calmed customer's thanks ─────────────────────────────────────

SMALL_HEART = rows(
    """
    HH.hh
    Hhhhs
    .hhs.
    ..s..
"""
)
TINY_HEART = rows(
    """
    H.h
    .s.
"""
)
HEART_SPRITE = 9


def heart_frames() -> List[Grid]:
    frames = []
    for art, lift in ((TINY_HEART, 0), (SMALL_HEART, 0), (SMALL_HEART, 1), (SMALL_HEART, 2), (TINY_HEART, 3)):
        g = Grid(HEART_SPRITE, HEART_SPRITE)
        g.stamp(HEART_SPRITE // 2 - len(art[0]) // 2, HEART_SPRITE - 2 - len(art) - lift, art, HEART_KEY)
        frames.append(g.outline(CORAL[0], corners=False))
    return frames


def heart_strip() -> Strip:
    return Strip(
        "fx-heart",
        HEART_SPRITE,
        HEART_SPRITE,
        (HEART_SPRITE // 2, HEART_SPRITE - 2),
        [
            Animation("pop", 10, False, heart_frames()),
        ],
    )


def strips() -> List[Strip]:
    return [icon(), shell_strip(), shell_back_strip(), ripple_strip(), heart_strip()]
