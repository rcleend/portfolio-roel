"""CHURN SHIELD: a retention bubble no hit gets through.

A soap-film bubble around the hero: a bright rim over a teal band, an
iridescent film (pink, lilac, mint, butter) that slides around the rim, a
specular arc on the upper left and a cool reflection on the lower right. The
inside stays empty so the hero is never covered. It wobbles like a real
bubble, ripples where a customer bumps it, sends that customer off with a
little heart-in-a-bubble, thins out in its last moments and pops into
droplets.

Sprites:
- ``fx-bubble`` (76 x 76, origin = bubble centre): ``form``, ``shell`` (the
  wobble-and-shimmer loop), ``thin`` (the last-0.8 s warning pair) and ``pop``.
- ``fx-bubble-bump`` (24 x 40, origin = the contact point on the rim, drawn
  for a customer on the right; code mirrors it): ``bump``.
- ``fx-shield-calm`` (16 x 24, origin bottom centre, over the customer's
  head): ``puff``, a heart in a tiny bubble that floats up and pops.
"""

from __future__ import annotations

import math
from typing import Callable, List, Tuple

from ..icon import FRAMES, accent_window, backlight, glint, glint_stage, icon_sheet, layered
from ..palette import BUBBLE, FILM, HEART, RIM, WHITE
from ..pix import Canvas, dither_on, polar, rows
from ..sheet import Anim, Sheet

SLOT = 2
Point = Tuple[int, int]

# ── ellipse rings ───────────────────────────────────────────────────────


def _inside(cx: float, cy: float, rx: float, ry: float) -> Callable[[int, int], bool]:
    def test(x: int, y: int) -> bool:
        if rx <= 0 or ry <= 0:
            return False
        dx = (x + 0.5 - cx) / rx
        dy = (y + 0.5 - cy) / ry
        return dx * dx + dy * dy <= 1.0

    return test


def ring(size: Tuple[int, int], cx: float, cy: float, rx: float, ry: float) -> List[Point]:
    """The 1 px inner rim of a filled ellipse: clean, gap-free, one pixel thick."""
    inside = _inside(cx, cy, rx, ry)
    out = []
    for y in range(int(cy - ry - 2), int(cy + ry + 3)):
        for x in range(int(cx - rx - 2), int(cx + rx + 3)):
            if 0 <= x < size[0] and 0 <= y < size[1] and inside(x, y):
                if not (inside(x + 1, y) and inside(x - 1, y) and inside(x, y + 1) and inside(x, y - 1)):
                    out.append((x, y))
    return out


def _angle(x: int, y: int, cx: float, cy: float) -> float:
    """Degrees, 0 = right, 90 = down (screen)."""
    return math.degrees(math.atan2(y + 0.5 - cy, x + 0.5 - cx)) % 360


def _film(angle: float, phase: float) -> str:
    """Iridescence: four soap-film colours in bands that slide around the rim with ``phase`` (degrees)."""
    return FILM[int(((angle + phase) % 360) // 45) % 4]


def shell(
    size: Tuple[int, int],
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    phase: float = 0.0,
    bright: bool = True,
    specular: bool = True,
    film: bool = True,
    dotted: bool = False,
) -> Canvas:
    """One frame of the bubble: rim, teal band, film band, specular and reflection; hollow inside."""
    c = Canvas(*size)
    outer = ring(size, cx, cy, rx, ry)
    band = ring(size, cx, cy, rx - 1, ry - 1)
    inner = ring(size, cx, cy, rx - 2, ry - 2)
    for x, y in outer:
        if dotted and (x + y) % 2:
            continue
        a = _angle(x, y, cx, cy)
        lit = 150 <= a <= 300  # the upper-left half faces the key light
        c.set(x, y, (BUBBLE[5] if lit else BUBBLE[4]) if bright else BUBBLE[3])
    for x, y in band:
        if dotted:
            continue
        c.set(x, y, BUBBLE[2] if bright else BUBBLE[1])
    if film and not dotted:
        for x, y in inner:
            if dither_on(x, y, 0.5, 2):
                c.set(x, y, _film(_angle(x, y, cx, cy), phase))
    if specular and not dotted:
        r_mean = (rx + ry) / 2
        for deg in range(200, 252, 2):
            thick = 2 if 212 <= deg <= 238 else 1
            for t in range(thick):
                x, y = polar(cx - 0.5, cy - 0.5, r_mean - 4.5 - t, math.radians(deg))
                c.set(x, y, WHITE)
        dx, dy = polar(cx - 0.5, cy - 0.5, r_mean - 8, math.radians(222))
        c.set(dx, dy, WHITE)
        c.set(dx + 1, dy, BUBBLE[5])
        for deg in range(28, 58, 3):
            x, y = polar(cx - 0.5, cy - 0.5, r_mean - 4, math.radians(deg))
            c.set(x, y, RIM)
    return c


# ── the in-game bubble ─────────────────────────────────────────────────

FRAME = (76, 76)
ORIGIN = (38, 38)
RADIUS = 33.5  # wraps a ~58 px hero with a few pixels to spare


def _wobble(f: int, count: int, amount: float = 1.0) -> Tuple[float, float]:
    s = math.sin(f / count * math.tau) * amount
    return RADIUS + s, RADIUS - s


def bubble_sheet() -> Sheet:
    cx, cy = ORIGIN[0] + 0.5, ORIGIN[1] + 0.5
    form = []
    for r, flash in ((4, False), (10, False), (18, False), (26, False), (35, True), (32, False), (34.5, False), (33.5, False)):
        if flash:
            c = shell(FRAME, cx, cy, r, r, film=False)
            for x, y in ring(FRAME, cx, cy, r, r):
                c.set(x, y, WHITE)
            for x, y in ring(FRAME, cx, cy, r - 1, r - 1):
                c.set(x, y, BUBBLE[4])
        elif r < 12:
            c = Canvas(*FRAME)
            for x, y in ring(FRAME, cx, cy, r, r):
                c.set(x, y, BUBBLE[5])
            c.set(int(cx - r / 2), int(cy - r / 2), WHITE)
        else:
            squash = 1.5 if r == 32 else 0.0
            c = shell(FRAME, cx, cy, r + squash, r - squash, phase=r * 9)
        form.append(c)
    loop = []
    for f in range(12):
        rx, ry = _wobble(f, 12)
        loop.append(shell(FRAME, cx, cy, rx, ry, phase=f * 30))
    thin = [shell(FRAME, cx, cy, RADIUS, RADIUS, bright=False, film=False), shell(FRAME, cx, cy, RADIUS, RADIUS, dotted=True)]
    pop = _pop_frames(cx, cy)
    return Sheet(
        "fx-bubble",
        FRAME,
        ORIGIN,
        [
            Anim("form", 30, False, form),
            Anim("shell", 10, True, loop),
            Anim("thin", 10, True, thin),
            Anim("pop", 30, False, pop),
        ],
    )


def _pop_frames(cx: float, cy: float) -> List[Canvas]:
    """A last big wobble, a white snap, the film tearing into arcs that fly apart, then falling droplets."""
    frames = [shell(FRAME, cx, cy, RADIUS + 2, RADIUS - 2, phase=60), shell(FRAME, cx, cy, RADIUS - 1, RADIUS + 2, phase=90)]
    pieces = 12
    for f in range(6):
        c = Canvas(*FRAME)
        if f == 0:
            for x, y in ring(FRAME, cx, cy, RADIUS, RADIUS):
                c.set(x, y, WHITE)
            for x, y in ring(FRAME, cx, cy, RADIUS - 1, RADIUS - 1):
                c.set(x, y, BUBBLE[4])
            frames.append(c)
            continue
        r = RADIUS + 1 + f * 2.5
        fall = f * f * 0.5
        for k in range(pieces):
            centre = k * (360 / pieces) + 15
            if f <= 3:
                # Torn film: arcs that shrink as they fly out.
                arc = 20 - f * 5
                for deg in range(int(centre - arc / 2), int(centre + arc / 2) + 1, 2):
                    x, y = polar(cx - 0.5, cy - 0.5 + fall, r, math.radians(deg))
                    c.set(x, y, (BUBBLE[5], BUBBLE[4], _film(deg, f * 40))[min(2, f - 1)])
            else:
                # Droplets: 2 x 2 beads, every other one already gone.
                if (k + f) % 2:
                    continue
                x, y = polar(cx - 0.5, cy - 0.5 + fall, r, math.radians(centre))
                c.rect(x, y, 2, 2, BUBBLE[4] if f == 4 else BUBBLE[3])
                c.set(x, y, WHITE if f == 4 else BUBBLE[5])
        frames.append(c)
    return frames


# ── bump ripple ─────────────────────────────────────────────────────────

BUMP = (24, 40)
BUMP_ORIGIN = (12, 20)


def bump_sheet() -> Sheet:
    """A customer meets the rim: the film dents and flashes white, then ripples run up and down the rim."""
    ox, oy = BUMP_ORIGIN
    rim_cx = ox - RADIUS + 0.5
    frames = []
    for f in range(8):
        c = Canvas(*BUMP)
        dent = 1 if f <= 1 else 0
        for x, y in ring(BUMP, rim_cx - dent * 2, oy + 0.5, RADIUS, RADIUS):
            d = abs(y - oy)
            reach = (8, 12, 6, 0, 0, 0, 0, 0)[f]
            if d <= reach:
                c.set(x, y, WHITE if d <= reach // 2 else BUBBLE[5])
                c.set(x - 1, y, BUBBLE[4])
        if f <= 1:
            c.disc(ox - 0.5, oy + 0.5, 2.6 - f, WHITE)
        for k in range(2):
            age = f - 1 - k
            if not 0 <= age <= 5:
                continue
            spread = 9 + age * 3
            tone = (WHITE, BUBBLE[5], BUBBLE[5], BUBBLE[4], BUBBLE[3], BUBBLE[3])[age]
            for x, y in ring(BUMP, rim_cx, oy + 0.5, RADIUS, RADIUS):
                d = abs(y - oy)
                if spread - 3 <= d <= spread and (age < 4 or (x + y) % 2 == 0):
                    c.set(x, y, tone)
                    if age < 3:
                        c.set(x + 1, y, BUBBLE[3])
        if 1 <= f <= 5:
            for k, (dx, dy) in enumerate(((2, -5), (3, 0), (2, 5))):
                x = ox + dx + f * 2
                y = oy + dy + (dy // 5) * f
                c.set(x, y, WHITE if f < 3 else BUBBLE[4])
        frames.append(c)
    return Sheet("fx-bubble-bump", BUMP, BUMP_ORIGIN, [Anim("bump", 30, False, frames)])


# ── the customer calms down: a heart in a tiny bubble ──────────────────

PUFF = (16, 24)
PUFF_ORIGIN = (8, 23)

_MINI_HEART = rows("""
.o.o.
oHoHo
oHHHo
.oHo.
..o..
""")


def puff_sheet() -> Sheet:
    ox, oy = PUFF_ORIGIN
    frames = []
    rises = (0, 2, 4, 6, 8, 9, 10, 11)
    for f, rise in enumerate(rises):
        c = Canvas(*PUFF)
        cy = oy - 6 - rise
        if f < 6:
            r = 4.5 if f < 5 else 5.5
            for x, y in ring(PUFF, ox + 0.5, cy + 0.5, r, r):
                c.set(x, y, BUBBLE[4] if f < 5 else WHITE)
            c.stamp(_MINI_HEART, {"o": HEART[1], "H": HEART[3]}, ox - 2, cy - 2)
            c.set(ox - 2, cy - 3, WHITE)
        else:
            for k in range(4):
                x, y = polar(ox, cy, 4 + (f - 5) * 2, math.radians(45 + k * 90))
                c.set(x, y, HEART[4] if k % 2 else BUBBLE[5])
        frames.append(c)
    return Sheet("fx-shield-calm", PUFF, PUFF_ORIGIN, [Anim("puff", 12, False, frames)])


# ── icon ────────────────────────────────────────────────────────────────

_HEART_ICON = rows("""
.oo.oo.
oHHoHHo
oHWHHHo
oHHHHho
.oHHho.
..oho..
...o...
""")
_HEART_BEAT = rows("""
.ooo.ooo.
oHHHoHHHo
oHWHHHHHo
oHHHHHHho
.oHHHHho.
..oHHho..
...oho...
....o....
""")


def _arc(c: Canvas, cx: float, cy: float, r: float, a0: int, a1: int, tone: str, step: int = 4) -> None:
    for deg in range(a0, a1 + 1, step):
        x, y = polar(cx - 0.5, cy - 0.5, r, math.radians(deg))
        c.set(x, y, tone)


def _icon_body(phase: int, beat: bool) -> Canvas:
    """A glossy bubble: lit rim, teal inner band, soap-film streaks, a bold curved specular, a heart inside."""
    cx, cy, r = 11.5, 11.5, 10.6
    c = Canvas(24, 24)
    for x, y in ring((24, 24), cx, cy, r, r):
        lit = 150 <= _angle(x, y, cx, cy) <= 300
        c.set(x, y, BUBBLE[5] if lit else BUBBLE[4])
    for x, y in ring((24, 24), cx, cy, r - 1, r - 1):
        lit = 150 <= _angle(x, y, cx, cy) <= 300
        c.set(x, y, BUBBLE[3] if lit else BUBBLE[2])
    # Soap-film streaks just inside the rim; ``phase`` slides them round.
    for a0, a1, tone in ((95, 150, FILM[0]), (330, 385, FILM[2]), (280, 310, FILM[1])):
        _arc(c, cx, cy, r - 2, a0 + phase, a1 + phase, tone)
    for deg in range(200, 256, 3):
        x, y = polar(cx - 0.5, cy - 0.5, r - 3.2, math.radians(deg))
        c.set(x, y, WHITE)
    for deg in range(212, 242, 4):
        x, y = polar(cx - 0.5, cy - 0.5, r - 4.2, math.radians(deg))
        c.set(x, y, WHITE)
    c.set(7, 9, WHITE)
    _arc(c, cx, cy, r - 3, 25, 60, RIM, 6)
    art = _HEART_BEAT if beat else _HEART_ICON
    w, h = len(art[0]), len(art)
    c.stamp(art, {"o": HEART[0], "H": HEART[3], "h": HEART[2], "W": WHITE}, 12 - (w + 1) // 2, 13 - h // 2)
    return c


def icon_frames() -> List[Canvas]:
    """At rest the film sits still; in the accent it slides round the rim and the heart beats once."""
    frames = []
    for f in range(FRAMES):
        i = accent_window(f, SLOT, 9)
        phase = (i * 20) if i >= 0 else 0
        beat = i in (3, 4)
        body = _icon_body(phase, beat)
        glint(body, 6, 8, glint_stage(f, 21), BUBBLE[5])
        frames.append(layered(backlight(BUBBLE), body))
    return frames


def sheets() -> List[Sheet]:
    return [icon_sheet(icon_frames()), bubble_sheet(), bump_sheet(), puff_sheet()]

