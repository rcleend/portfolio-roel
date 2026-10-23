"""UX ELIXIR: a drinkable potion that makes you deeply understand users.

The bottle is a round flask of magenta elixir with a cork. In game it pops
into the hero's hand, floats up to his lips, tips (the liquid stays level and
drains, the way liquid does), and the empty bottle is tossed away in an
eight-step tumble before it poofs. Understanding then spreads: a calm wave
rolls out and every customer under the spell wears a floating heart.

Bottle orientations are hand-drawn masks (upright and 45 degrees); every
other angle is an exact 90 degree rotation of those two, which is lossless
in pixel art. Liquid and highlights are painted afterwards in screen space,
so the surface stays horizontal and the light stays top-left at every tilt.

Sprites:
- ``fx-potion`` (20 x 20, origin = the bottle's centre of mass):
  ``appear``, ``held``, ``uncork``, ``drink`` (tip, pour, drain), ``tumble``
  (eight-step spin of the empty bottle) and ``poof``.
- ``fx-calm`` (16 x 16, origin bottom-centre): the customer's floating
  ``heart`` loop and its ``heart-pop``, the drifting ``mote`` twinkles.
- ``fx-elixir-burst`` (32 x 32, origin centre): the ``aha`` burst at the
  hero's head the moment he drinks.
- ``fx-elixir-aura`` (48 x 16, origin = between the hero's feet): the buff
  ring that ``rise``s, ``loop``s for the six seconds and ``fade``s.
"""

from __future__ import annotations

import math
from typing import Dict, List, Sequence, Set, Tuple

from ..icon import FRAMES, accent_window, backlight, glint, glint_stage, icon_sheet, layered
from ..light import KEY, tone_for
from ..palette import CALM, CORK, GLASS, HEART, MINT, POTION, RIM, WHITE
from ..pix import Canvas, midpoint_circle, polar, rows
from ..sheet import Anim, Sheet

SLOT = 1

# ── the in-game bottle ──────────────────────────────────────────────────

FRAME = (20, 20)
ORIGIN = (10, 10)

# Upright, 9 x 13: c/k/j cork, o glass outline, L lip, # interior.
_UPRIGHT = rows("""
...ckc...
...jkc...
..oLLLo..
...o#o...
..oo#oo..
.o#####o.
o#######o
o#######o
o#######o
o#######o
o#######o
.o#####o.
..ooooo..
""")
_UPRIGHT_CENTRE = (4, 8)

# Tipped 45 degrees towards the drinker (the neck leans left), on the 20 x 20 frame.
_TIPPED = rows("""
....................
....................
....................
...ck...............
...jkLLo............
...oLLo.............
...oLo#oooooo.......
......o######o......
......o#######o.....
......o#######o.....
......o#######o.....
......o#######o.....
......o#######o.....
.......o#####o......
........ooooo.......
....................
....................
....................
....................
....................
""")


def _place(mask: Sequence[str], centre: Tuple[int, int]) -> List[str]:
    """Puts a small mask on the 20 x 20 frame with its body centre on ORIGIN."""
    out = [["."] * FRAME[0] for _ in range(FRAME[1])]
    ox, oy = ORIGIN[0] - centre[0], ORIGIN[1] - centre[1]
    for y, row in enumerate(mask):
        for x, ch in enumerate(row):
            if ch != "." and 0 <= oy + y < FRAME[1] and 0 <= ox + x < FRAME[0]:
                out[oy + y][ox + x] = ch
    return ["".join(r) for r in out]


def _quarter(mask: Sequence[str], turns: int) -> List[str]:
    """Exact counter-clockwise quarter turns about the ORIGIN pixel, so the body never shifts."""
    grid = [list(r) for r in mask]
    ox, oy = ORIGIN
    for _ in range(turns % 4):
        rotated = [["."] * FRAME[0] for _ in range(FRAME[1])]
        for y, row in enumerate(grid):
            for x, ch in enumerate(row):
                nx, ny = ox + (y - oy), oy - (x - ox)
                if ch != "." and 0 <= nx < FRAME[0] and 0 <= ny < FRAME[1]:
                    rotated[ny][nx] = ch
        grid = rotated
    return ["".join(r) for r in grid]


UPRIGHT = _place(_UPRIGHT, _UPRIGHT_CENTRE)
TIPPED = _TIPPED
# Eight headings of the tumble: 0, 45, 90, ... degrees counter-clockwise.
HEADINGS = [mask for turns in range(4) for mask in (_quarter(UPRIGHT, turns), _quarter(TIPPED, turns))]


def bottle(mask: Sequence[str], level: int, cork: bool = True, stream: int = 0) -> Canvas:
    """Paints a mask: glass, cork, then ``level`` rows of liquid from the bottom of the interior."""
    c = Canvas(*FRAME)
    interior: Set[Tuple[int, int]] = set()
    cx, cy = ORIGIN[0] + 0.5, ORIGIN[1] + 0.5
    for y, row in enumerate(mask):
        for x, ch in enumerate(row):
            if ch == "#":
                interior.add((x, y))
            elif ch == "o":
                lit = (x + 0.5 - cx) + (y + 0.5 - cy) < -1.5
                c.set(x, y, GLASS[1] if lit else GLASS[0])
            elif ch == "L":
                c.set(x, y, GLASS[4])
            elif cork and ch in "ckj":
                c.set(x, y, {"c": CORK[1], "k": CORK[3], "j": CORK[4]}[ch])
    top = (max(y for _, y in interior) - level + 1) if interior and level > 0 else 10**6
    radius = 4.0
    for x, y in interior:
        if y >= top:
            nx, ny = (x + 0.5 - cx) / radius, (y + 0.5 - cy) / radius
            nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
            tone = tone_for(nx * KEY[0] + ny * KEY[1] + nz * KEY[2], 1, 4, (0.0, 0.3, 0.6))
            c.set(x, y, POTION[5] if y == top else POTION[tone])
        elif any((x + a, y + b) not in interior for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            c.set(x, y, GLASS[3] if x + 0.5 < cx else GLASS[2])
    # Screen-fixed highlight: the key light does not turn with the bottle.
    for hx, hy in ((ORIGIN[0] - 2, ORIGIN[1] - 2), (ORIGIN[0] - 3, ORIGIN[1] - 1)):
        if (hx, hy) in interior:
            c.set(hx, hy, WHITE)
    rx = max((x for x, y in interior if y == ORIGIN[1]), default=None)
    if rx is not None and c.get(rx + 1, ORIGIN[1]) in (GLASS[0], GLASS[1]):
        c.set(rx + 1, ORIGIN[1], RIM)
    if stream:
        _pour(c, mask, stream)
    return c


def _pour(c: Canvas, mask: Sequence[str], phase: int) -> None:
    """Elixir pouring from the mouth of a bottle lying on its side (neck to the left)."""
    mouth = min(((x, y) for y, row in enumerate(mask) for x, ch in enumerate(row) if ch in "L"), default=None)
    if mouth is None:
        return
    mx, my = mouth
    drops = [(-1, 1), (-2, 2), (-3, 2), (-4, 3), (-5, 4)]
    for i, (dx, dy) in enumerate(drops):
        if (i + phase) % 3 == 2:
            continue
        c.set(mx + dx, my + dy, POTION[4] if i < 2 else POTION[3])
    c.set(mx - 1, my + 1, POTION[5])


def _glint(c: Canvas, x: int, y: int, stage: int) -> None:
    glint(c, x, y, stage, CALM[4])


def potion_sheet() -> Sheet:
    full = 6
    appear = []
    pop = Canvas(*FRAME)
    _glint(pop, ORIGIN[0], ORIGIN[1], 2)
    appear.append(pop)
    flash = bottle(UPRIGHT, full).recolor({col: WHITE for col in bottle(UPRIGHT, full).colors()})
    appear.append(flash)
    for stage in (3, 2, 0):
        c = bottle(UPRIGHT, full)
        _glint(c, ORIGIN[0] + 4, ORIGIN[1] - 6, stage)
        appear.append(c)

    held = []
    for f in range(4):
        c = bottle(UPRIGHT, full)
        # A bubble climbs through the elixir, and the surface rocks by a pixel.
        bubble_y = ORIGIN[1] + 3 - f
        if f < 3:
            c.set(ORIGIN[0] + 1, bubble_y, POTION[5])
        if f % 2:
            top = ORIGIN[1] - 1
            c.set(ORIGIN[0] - 3, top, POTION[4])
        held.append(c)

    uncork = []
    for f, lift in enumerate((1, 3, 6, 9)):
        c = bottle(UPRIGHT, full, cork=False)
        cork_x, cork_y = ORIGIN[0] - 1 + (f // 2), ORIGIN[1] - 8 - lift
        for dx, dy, col in ((0, 0, CORK[1]), (1, 0, CORK[3]), (2, 0, CORK[1]), (0, 1, CORK[4]), (1, 1, CORK[3]), (2, 1, CORK[2])):
            c.set(cork_x + dx, cork_y + dy, col)
        if f <= 1:
            # The pop: a little ring of fizz at the neck.
            for x, y in midpoint_circle(ORIGIN[0], ORIGIN[1] - 8, 2 + f):
                if (x + y) % 2 == 0:
                    c.set(x, y, POTION[5] if f == 0 else CALM[4])
        uncork.append(c)

    drink = [
        bottle(TIPPED, 6, cork=False),
        bottle(_quarter(UPRIGHT, 1), 5, cork=False, stream=0),
        bottle(_quarter(UPRIGHT, 1), 4, cork=False, stream=1),
        bottle(_quarter(UPRIGHT, 1), 3, cork=False, stream=2),
        bottle(_quarter(UPRIGHT, 1), 2, cork=False, stream=3),
        bottle(_quarter(UPRIGHT, 1), 1, cork=False, stream=1),
        bottle(_quarter(UPRIGHT, 1), 0, cork=False),
        bottle(TIPPED, 0, cork=False),
    ]
    tumble = [bottle(mask, 0, cork=False) for mask in HEADINGS]

    poof = []
    for f in range(6):
        c = Canvas(*FRAME)
        if f == 0:
            c.disc(ORIGIN[0] + 0.5, ORIGIN[1] + 0.5, 3.5, WHITE)
        r = 2 + f * 2
        for k in range(6):
            angle = math.radians(k * 60 + f * 8)
            x, y = polar(ORIGIN[0], ORIGIN[1], r, angle)
            if f >= 4 and k % 2:
                continue
            col = (POTION[5], CALM[4], MINT[4])[k % 3]
            c.set(x, y, col)
            if f < 3:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    c.set(x + dx, y + dy, (POTION[3], CALM[3], MINT[3])[k % 3])
        poof.append(c)

    return Sheet(
        "fx-potion",
        FRAME,
        ORIGIN,
        [
            Anim("appear", 30, False, appear),
            Anim("held", 8, True, held),
            Anim("uncork", 20, False, uncork),
            Anim("drink", 20, False, drink),
            Anim("tumble", 20, True, tumble),
            Anim("poof", 20, False, poof),
        ],
    )


# ── calm motifs ─────────────────────────────────────────────────────────

CALM_FRAME = (16, 16)
CALM_ORIGIN = (8, 15)

_HEART = rows("""
.oo.oo.
oPPoPPo
oPWPPPo
oPPPPpo
.oPPpo.
..oPo..
...o...
""")
_HEART_BIG = rows("""
.oo...oo.
oPPo.oPPo
oPWPoPPPo
oPPPPPPpo
oPPPPPPpo
.oPPPPpo.
..oPPpo..
...oPo...
....o....
""")


def _heart(c: Canvas, art: Sequence[str], x: int, y: int) -> None:
    c.stamp(art, {"o": HEART[0], "P": HEART[3], "p": HEART[2], "W": WHITE}, x, y)


def calm_sheet() -> Sheet:
    ox, oy = CALM_ORIGIN
    heart = []
    for f in range(8):
        c = Canvas(*CALM_FRAME)
        bob = (0, 0, -1, -1, -1, 0, 0, 0)[f]
        big = f in (3, 4)  # one soft beat per loop
        art = _HEART_BIG if big else _HEART
        w, h = len(art[0]), len(art)
        _heart(c, art, ox - w // 2, oy - h - 3 + bob + (1 if big else 0))
        # A pastel sparkle orbits the heart: the customer feels understood.
        sx, sy = polar(ox, oy - 8 + bob, 6, math.radians(-90 + f * 45))
        c.set(sx, sy, (CALM[5], MINT[4])[f % 2])
        heart.append(c)
    pop = []
    for f in range(6):
        c = Canvas(*CALM_FRAME)
        if f == 0:
            _heart(c, _HEART_BIG, ox - 4, oy - 12)
        else:
            for k in range(4):
                angle = math.radians(-135 + k * 90 + f * 10)
                x, y = polar(ox, oy - 8, 1 + f * 1.4, angle)
                if f >= 4 and k % 2:
                    continue
                c.set(x, y, HEART[4] if f < 3 else CALM[4])
                if f < 3:
                    c.set(x + 1, y, HEART[3])
                    c.set(x, y - 1, HEART[3])
        pop.append(c)
    mote = []
    for stage, col in ((1, CALM[4]), (2, CALM[5]), (3, WHITE), (2, MINT[4]), (1, MINT[3]), (1, CALM[3])):
        c = Canvas(*CALM_FRAME)
        glint(c, ox, oy - 6, stage, col if stage < 3 else CALM[4], WHITE if stage >= 2 else col)
        mote.append(c)
    return Sheet(
        "fx-calm",
        CALM_FRAME,
        CALM_ORIGIN,
        [Anim("heart", 8, True, heart), Anim("heart-pop", 20, False, pop), Anim("mote", 12, False, mote)],
    )


# ── the aha burst ──────────────────────────────────────────────────────

BURST = (32, 32)
BURST_ORIGIN = (16, 16)


def burst_sheet() -> Sheet:
    """Understanding lands: a pastel sunburst of eight rays and a soft ring, at the hero's head."""
    ox, oy = BURST_ORIGIN
    colours = (POTION[5], CALM[4], MINT[4])
    frames = []
    for f in range(8):
        c = Canvas(*BURST)
        span = [(1, 4), (2, 7), (4, 10), (6, 12), (8, 13), (10, 14), (12, 14), (13, 14)][f]
        for k in range(8):
            angle = math.radians(k * 45 - 90)
            for d in range(span[0], span[1] + 1):
                x, y = polar(ox, oy, d, angle)
                if f >= 6 and d % 2:
                    continue
                head = d >= span[1] - 1
                c.set(x, y, WHITE if head and f < 4 else colours[k % 3])
        if f <= 3:
            for x, y in midpoint_circle(ox, oy, 3 + f * 2):
                if (x + y) % 2 == 0:
                    c.set(x, y, CALM[5] if f < 2 else CALM[3])
        if f == 0:
            c.disc(ox + 0.5, oy + 0.5, 2.5, WHITE)
        frames.append(c)
    return Sheet("fx-elixir-burst", BURST, BURST_ORIGIN, [Anim("aha", 30, False, frames)])


# ── the aura at the hero's feet ────────────────────────────────────────

AURA = (48, 16)
AURA_ORIGIN = (24, 11)


def _ellipse_ring(rx: float, ry: float) -> List[Tuple[int, int]]:
    cx, cy = AURA_ORIGIN[0] + 0.5, AURA_ORIGIN[1] + 0.5
    inside = lambda x, y: ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0  # noqa: E731
    return [
        (x, y)
        for y in range(AURA[1])
        for x in range(AURA[0])
        if inside(x, y) and not all(inside(x + a, y + b) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    ]


def _aura(rx: float, ry: float, phase: int, dotted: int = 0) -> Canvas:
    """A pastel buff ring on the ground: an outer band that cycles pink, lilac, mint, and travelling motes."""
    c = Canvas(*AURA)
    bands = (POTION[4], CALM[4], MINT[3])
    for x, y in _ellipse_ring(rx, ry):
        if dotted and (x + y) % (dotted + 1):
            continue
        c.set(x, y, bands[((x // 6) + phase) % 3])
    if rx > 6 and not dotted:
        for x, y in _ellipse_ring(rx - 3, ry - 1.5):
            if (x + y + phase) % 4 == 0:
                c.set(x, y, CALM[2])
    if not dotted and rx > 10:
        cx, cy = AURA_ORIGIN
        for k in range(3):
            angle = math.radians(phase * 45 + k * 120)
            x, y = int(round(cx + math.cos(angle) * (rx - 0.5))), int(round(cy + math.sin(angle) * (ry - 0.5)))
            c.set(x, y, WHITE)
            c.set(x, y - 1 - (phase + k) % 3, CALM[5])
    return c


def aura_sheet() -> Sheet:
    rise = [_aura(rx, ry, k) for k, (rx, ry) in enumerate(((5, 1.6), (10, 2.8), (16, 4.0), (22, 5.6), (19.5, 4.8), (20.5, 5.2)))]
    loop = [_aura(20.5, 5.2, f) for f in range(8)]
    fade = [_aura(20.5, 5.2, 0, dotted=1), _aura(21, 5.4, 1, dotted=2), _aura(21.5, 5.6, 2, dotted=3), _aura(22, 5.8, 3, dotted=5)]
    return Sheet(
        "fx-elixir-aura",
        AURA,
        AURA_ORIGIN,
        [Anim("rise", 20, False, rise), Anim("loop", 10, True, loop), Anim("fade", 12, False, fade)],
    )


# ── icon ────────────────────────────────────────────────────────────────

_ICON_MASK = rows("""
......ccc......
.....cjKkc.....
.....cKKkc.....
....oLLLLLo....
.....o###o.....
.....o###o.....
....oo###oo....
...o#######o...
..o#########o..
.o###########o.
.o###########o.
o#############o
o#############o
o#############o
o#############o
o#############o
.o###########o.
.o###########o.
..o#########o..
...oo#####oo...
.....ooooo.....
""")
_ICON_OFFSET = (4, 2)


def _icon_body(level_row: int, bubble: int = -1, wave: int = 0) -> Canvas:
    c = Canvas(24, 24)
    ox, oy = _ICON_OFFSET
    interior: Dict[Tuple[int, int], bool] = {}
    for y, row in enumerate(_ICON_MASK):
        for x, ch in enumerate(row):
            px, py = ox + x, oy + y
            if ch == "#":
                interior[(px, py)] = True
            elif ch == "o":
                lit = x < 7 and y < 14
                c.set(px, py, GLASS[1] if lit else GLASS[0])
            elif ch == "L":
                c.set(px, py, GLASS[4] if x < 8 else GLASS[3])
            elif ch in "cKkj":
                c.set(px, py, {"c": CORK[1], "K": CORK[3], "k": CORK[2], "j": CORK[4]}[ch])
    cx, cy, radius = ox + 7.5, oy + 13.5, 7.2
    for (x, y) in interior:
        surface = level_row + (1 if (wave and (x + wave) % 4 < 2) else 0)
        if y >= surface and y > oy + 6:
            nx, ny = (x + 0.5 - cx) / radius, (y + 0.5 - cy) / radius
            nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
            tone = tone_for(nx * KEY[0] + ny * KEY[1] + nz * KEY[2], 1, 4, (0.0, 0.3, 0.62))
            c.set(x, y, POTION[5] if y == surface else POTION[tone])
        elif any((x + a, y + b) not in interior for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            c.set(x, y, GLASS[3] if x + 0.5 < cx else GLASS[2])
    # The glass highlight: a bright arc on the upper-left shoulder.
    for hx, hy in ((ox + 3, oy + 10), (ox + 3, oy + 11), (ox + 4, oy + 9), (ox + 3, oy + 12)):
        c.set(hx, hy, WHITE)
    c.set(ox + 5, oy + 8, GLASS[4])
    # A heart in the elixir: the potion is literally full of empathy.
    hx, hy = ox + 8, oy + 15
    for dx, dy in ((0, 0), (2, 0), (0, 1), (1, 1), (2, 1), (1, 2)):
        c.set(hx + dx, hy + dy, POTION[5])
    c.set(hx + 1, hy, POTION[3])
    if bubble >= 0:
        by = oy + 18 - bubble
        if (ox + 5, by) in interior and by >= level_row:
            c.set(ox + 5, by, POTION[5])
    for x, y in ((ox + 14, oy + 13), (ox + 14, oy + 14), (ox + 13, oy + 16), (ox + 14, oy + 12)):
        if c.get(x, y) is not None:
            c.set(x, y, RIM)
    return c


def icon_frames() -> List[Canvas]:
    """Rest; then a bubble rises and the surface sways, and the glass glints."""
    frames = []
    level = _ICON_OFFSET[1] + 11
    for f in range(FRAMES):
        i = accent_window(f, SLOT, 10)
        body = _icon_body(level, bubble=i if 0 <= i < 7 else -1, wave=(i % 2) + 1 if 0 <= i < 8 else 0)
        glint(body, _ICON_OFFSET[0] + 3, _ICON_OFFSET[1] + 10, glint_stage(f, 10), CALM[5])
        frames.append(layered(backlight(MINT), body))
    return frames


def sheets() -> List[Sheet]:
    return [icon_sheet(icon_frames()), potion_sheet(), calm_sheet(), burst_sheet(), aura_sheet()]
