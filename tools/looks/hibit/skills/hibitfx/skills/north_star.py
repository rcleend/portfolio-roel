"""NORTH STAR: a guiding star that homes in on the problem that matters most.

A faceted four-point gold star whose long needle always points north. It
spins about that north-south axis: the side spikes foreshorten to an edge-on
glint and back while the facets catch the key light, so it reads as a
turning star without ever losing its north. A sparkle trail cools from gold
to night blue behind it, and it lands in a big four-point flare.

Sprites:
- ``fx-star`` (24 x 24, origin centre): ``spawn``, ``spin`` (eight steps of
  a half turn, looped), ``fizzle`` (when its life runs out unspent).
- ``fx-star-trail`` (9 x 9, origin centre): ``twinkle``, one frame per age.
- ``fx-star-launch`` (32 x 48, origin = the hand): ``launch``, a pillar of
  light pointing north and a ring.
- ``fx-star-impact`` (48 x 48, origin centre): ``impact``.
"""

from __future__ import annotations

import math
from typing import Dict, List, Tuple

from ..icon import FRAMES, accent_window, backlight, glint, glint_stage, icon_sheet, layered
from ..light import KEY, outline
from ..palette import GOLD, NIGHT, WHITE
from ..pix import Canvas, dither_on, midpoint_circle, polar
from ..sheet import Anim, Sheet

SLOT = 1

# Facet normals of the star's eight faces (spike, side) before it turns.
_FACETS: Dict[Tuple[str, int], Tuple[float, float, float]] = {
    ("N", -1): (-0.7, -0.25, 0.65),
    ("N", 1): (0.7, -0.25, 0.65),
    ("S", -1): (-0.7, 0.25, 0.65),
    ("S", 1): (0.7, 0.25, 0.65),
    ("W", -1): (-0.25, -0.7, 0.65),
    ("W", 1): (-0.25, 0.7, 0.65),
    ("E", -1): (0.25, -0.7, 0.65),
    ("E", 1): (0.25, 0.7, 0.65),
}


def star(size: Tuple[int, int], a: float, b: float, turn: float = 0.0, p: float = 0.62, core: int = 1, centre: Tuple[int, int] = None) -> Canvas:
    """The star turned ``turn`` radians about its north-south axis, outlined in its darkest gold."""
    w, h = size
    cx, cy = centre if centre else (w // 2, h // 2)
    c = Canvas(w, h)
    cos_t, sin_t = math.cos(turn), math.sin(turn)
    scale = max(0.16, abs(cos_t))
    flip = -1 if cos_t < 0 else 1
    for y in range(h):
        for x in range(w):
            dx, dy = x - cx, y - cy
            u = dx / scale * flip
            if (abs(u) / a) ** p + (abs(dy) / b) ** p > 1.0:
                continue
            vertical = abs(dy) / b >= abs(u) / a
            key = ("N" if dy < 0 else "S", -1 if u < 0 else 1) if vertical else ("W" if u < 0 else "E", -1 if dy < 0 else 1)
            nx, ny, nz = _FACETS[key]
            rx, rz = nx * cos_t + nz * sin_t, -nx * sin_t + nz * cos_t
            if rz < 0:  # the back of the star is its mirror image
                rx, rz = -rx, -rz
            light = rx * KEY[0] + ny * KEY[1] + rz * KEY[2]
            tone = 5 if light > 0.75 else (4 if light > 0.45 else (3 if light > 0.15 else 2))
            if (vertical and dx == 0) or (not vertical and dy == 0):
                tone = min(5, tone + 1)
            c.set(x, y, WHITE if abs(dx) + abs(dy) <= core else GOLD[tone])
    return outline(c, lambda col: GOLD)


def _night_halo(c: Canvas, shape: Canvas) -> None:
    """A dithered night-blue rim around the star so gold still reads against San Francisco's gold sky."""
    for x, y, _ in list(shape.points()):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            tx, ty = x + dx, y + dy
            if not shape.opaque(tx, ty) and not c.opaque(tx, ty) and dither_on(tx, ty, 0.5, 2):
                c.set(tx, ty, NIGHT[1])


def _rays(c: Canvas, cx: int, cy: int, inner: int, outer: int, tone: str) -> None:
    """Four thin diagonal sparkle rays between the spikes."""
    for k in range(4):
        angle = math.radians(45 + k * 90)
        for d in range(inner, outer + 1):
            x, y = polar(cx, cy, d, angle)
            if not c.opaque(x, y):
                c.set(x, y, tone if d < outer else GOLD[3])


# ── icon ────────────────────────────────────────────────────────────────

_ICON_A, _ICON_B = 7.2, 10.4
_ICON_CENTRE = (11, 11)


def icon_frames() -> List[Canvas]:
    """At rest the star shines; in its accent it turns once on its north axis, then glints."""
    frames = []
    for f in range(FRAMES):
        i = accent_window(f, SLOT, 8)
        turn = math.radians(i * 22.5) if i >= 0 else 0.0
        body = star((24, 24), _ICON_A, _ICON_B, turn, centre=_ICON_CENTRE)
        if i < 0 or i in (0, 7):
            _rays(body, _ICON_CENTRE[0], _ICON_CENTRE[1], 3, 6, GOLD[4])
        glint(body, _ICON_CENTRE[0], _ICON_CENTRE[1], glint_stage(f, 11), GOLD[5])
        frames.append(layered(backlight(NIGHT), body))
    return frames


# ── in flight ───────────────────────────────────────────────────────────

FRAME = (24, 24)
ORIGIN = (12, 12)
_A, _B = 6.4, 10.2


def _flight(a: float, b: float, turn: float = 0.0, core: int = 1) -> Canvas:
    shape = star(FRAME, a, b, turn, centre=ORIGIN, core=core)
    out = Canvas(*FRAME)
    out.blit(shape)
    _night_halo(out, shape)
    return out


def star_sheet() -> Sheet:
    spawn = []
    point = Canvas(*FRAME)
    glint(point, ORIGIN[0], ORIGIN[1], 3, GOLD[4])
    spawn.append(point)
    for k in (0.55, 1.18, 1.0):
        spawn.append(_flight(_A * k, _B * k, core=1 if k < 1.1 else 2))
    spin = [_flight(_A, _B, math.radians(k * 22.5)) for k in range(8)]
    fizzle = [_flight(_A * 0.7, _B * 0.7), _flight(_A * 0.45, _B * 0.5, core=0)]
    for stage in (3, 2, 1, 1):
        c = Canvas(*FRAME)
        glint(c, ORIGIN[0], ORIGIN[1], stage, GOLD[3] if stage > 1 else GOLD[2], GOLD[5] if stage > 1 else GOLD[3])
        fizzle.append(c)
    return Sheet(
        "fx-star",
        FRAME,
        ORIGIN,
        [Anim("spawn", 30, False, spawn), Anim("spin", 15, True, spin), Anim("fizzle", 20, False, fizzle)],
    )


TRAIL = (9, 9)
TRAIL_ORIGIN = (4, 4)


def trail_sheet() -> Sheet:
    """Each sparkle the star leaves behind cools from white gold to night blue as it ages."""
    stages = [(3, GOLD[4], WHITE), (2, GOLD[3], GOLD[5]), (2, GOLD[2], GOLD[4]), (1, None, GOLD[3]), (1, None, NIGHT[4]), (1, None, NIGHT[3])]
    frames = []
    for stage, arm, core in stages:
        c = Canvas(*TRAIL)
        glint(c, TRAIL_ORIGIN[0], TRAIL_ORIGIN[1], stage, arm or core, core)
        frames.append(c)
    return Sheet("fx-star-trail", TRAIL, TRAIL_ORIGIN, [Anim("twinkle", 20, False, frames)])


LAUNCH = (32, 48)
LAUNCH_ORIGIN = (16, 34)


def launch_sheet() -> Sheet:
    """At the hand: a pillar of light shoots north, a ring opens, sparks settle."""
    ox, oy = LAUNCH_ORIGIN
    frames = []
    for f in range(7):
        c = Canvas(*LAUNCH)
        up, down, width = ((22, 6, 1), (30, 8, 1), (32, 6, 0), (24, 4, 0), (0, 0, 0), (0, 0, 0), (0, 0, 0))[f]
        if up:
            for y in range(oy - up, oy + down + 1):
                fade = y < oy - up + 4
                c.set(ox, y, GOLD[4] if fade else WHITE)
                for side in range(1, width + 2):
                    if side <= width:
                        c.set(ox - side, y, GOLD[5])
                        c.set(ox + side, y, GOLD[5])
                    else:
                        c.set(ox - side, y, GOLD[3])
                        c.set(ox + side, y, GOLD[3])
        if f <= 1:
            c.disc(ox + 0.5, oy + 0.5, 3.2 - f, WHITE)
        if 1 <= f <= 5:
            r = (0, 5, 8, 10, 12, 13)[f]
            for x, y in midpoint_circle(ox, oy, r):
                if f >= 4 and (x + y) % 2:
                    continue
                c.set(x, y, GOLD[5] if f <= 2 else GOLD[3])
        if f >= 2:
            for k in range(6):
                angle = math.radians(-90 + k * 60 + f * 6)
                x, y = polar(ox, oy, 4 + f * 2.2, angle)
                if f >= 5 and k % 2:
                    continue
                c.set(x, y, WHITE if f < 4 else GOLD[4])
        frames.append(c)
    return Sheet("fx-star-launch", LAUNCH, LAUNCH_ORIGIN, [Anim("launch", 30, False, frames)])


IMPACT = (48, 48)
IMPACT_ORIGIN = (24, 24)


def impact_sheet() -> Sheet:
    """The star arrives: a north-long four-point flare, a gold ring with a night rim, sparkles."""
    ox, oy = IMPACT_ORIGIN
    frames = []
    for f in range(11):
        c = Canvas(*IMPACT)
        if f <= 2:
            scale = (1.0, 1.25, 0.8)[f]
            flare = star(IMPACT, 9 * scale, 21 * scale, centre=IMPACT_ORIGIN, core=4 - f)
            _night_halo(c, flare)
            c.blit(flare)
        if 1 <= f <= 7:
            r = (0, 9, 13, 16, 18, 20, 21, 22)[f]
            for x, y in midpoint_circle(ox, oy, r):
                if f >= 5 and (x + y) % 2:
                    continue
                c.set(x, y, WHITE if f <= 2 else GOLD[4 if f <= 4 else 3])
            if f <= 4:
                for x, y in midpoint_circle(ox, oy, r + 1):
                    if (x + y) % 2 == 0:
                        c.set(x, y, NIGHT[2])
        if f >= 2:
            for k in range(8):
                angle = math.radians(k * 45 + 22.5)
                d = min(19.0, 6 + f * 2.4)
                x, y = polar(ox, oy, d, angle)
                stage = 3 if f < 5 else (2 if f < 8 else 1)
                if f >= 8 and (k + f) % 2:
                    continue
                glint(c, x, y, stage, GOLD[4] if f < 6 else GOLD[2], WHITE if f < 6 else GOLD[4])
        frames.append(c)
    return Sheet("fx-star-impact", IMPACT, IMPACT_ORIGIN, [Anim("impact", 30, False, frames)])


def sheets() -> List[Sheet]:
    return [icon_sheet(icon_frames()), star_sheet(), trail_sheet(), launch_sheet(), impact_sheet()]
