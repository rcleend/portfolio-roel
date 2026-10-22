"""FULL-STACK ATTACK: the whole stack, front-end, back-end and database, in one piercing blast.

The icon is the stack itself (three discs: cyan front-end, violet back-end,
amber database) firing its three layers as one beam. In game the beam is the
same three layers, so the icon previews the move exactly.

Sprites (Phase B draws them; see docs/looks/hibit-skills.md):
- ``fx-beam``: 16 px tileable cross-sections, code repeats them from the hand
  to the screen edge. Rows: ``open`` (the 5-frame grow), ``sustain`` (loop),
  ``collapse`` (7 frames across the 9-frame dissipate).
- ``fx-beam-data``: per-layer glyph tracks (``</>``, ``{}``, table rows) that
  code scrolls through each layer at its own speed.
- ``fx-beam-muzzle``: the charge, the firing port and its exhaust at the hand.
- ``fx-beam-tip``: the spearhead that leads the beam while it grows.
- ``fx-beam-hit``: the pierce burst on every customer the beam crosses.
- ``fx-bits``: data debris glyphs for code-driven particles.
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

from ..icon import FRAMES, backlight, glint, glint_stage, icon_sheet, layered
from ..light import lookup, outline
from ..palette import AMBER, CYAN, INK, VIOLET, WHITE, Ramp
from ..pix import Canvas, dither_on, midpoint_circle, polar, rows
from ..sheet import Anim, Sheet

SLOT = 1
LAYERS: Tuple[Ramp, Ramp, Ramp] = (CYAN, VIOLET, AMBER)
_TABLE = lookup(*LAYERS)

# ── icon ────────────────────────────────────────────────────────────────

_ICON_TOP = 6
_ICON_X0 = 1
_ICON_W = 10
_FACE = 3
_BEAM_END = 21


def _icon_body(pulses: Sequence[Optional[int]] = (None, None, None)) -> Canvas:
    """The stack and its three beams; ``pulses[i]`` swells layer i's beam at that x (a data packet)."""
    c = Canvas(24, 24)
    x0, w, top = _ICON_X0, _ICON_W, _ICON_TOP
    cx = x0 + w / 2
    for y in range(top, top + 3):
        for x in range(x0, x0 + w):
            dx = (x + 0.5 - cx) / (w / 2)
            dy = (y + 0.5 - (top + 1.5)) / 1.5
            if dx * dx + dy * dy <= 1.0:
                t = (x - x0) / (w - 1)
                tone = 5 if t < 0.55 else 4
                if y == top + 2:
                    tone = 4 if t < 0.5 else 3
                c.set(x, y, CYAN[tone])
    c.set(x0 + 3, top + 1, WHITE)
    c.set(x0 + 4, top + 1, WHITE)
    for i, ramp in enumerate(LAYERS):
        fy = top + 2 + i * (_FACE + 1)
        for r in range(_FACE):
            for x in range(x0, x0 + w):
                t = (x - x0) / (w - 1)
                tone = 4 if t < 0.22 else (3 if t < 0.72 else 2)
                if r == 0:
                    tone = min(5, tone + 1)
                if r == _FACE - 1:
                    tone = max(1, tone - 1)
                c.set(x, fy + r, ramp[tone])
        by = fy + 1
        for x in range(x0 + w, _BEAM_END + 1):
            if x < _BEAM_END - 2:
                c.set(x, by - 1, ramp[4])
                c.set(x, by + 1, ramp[2])
            c.set(x, by, WHITE if x < _BEAM_END - 1 else ramp[5])
        c.set(_BEAM_END + 1, by, ramp[4])
        px = pulses[i]
        if px is not None and x0 + w <= px < _BEAM_END - 2:
            for x in (px, px + 1):
                if x < _BEAM_END - 2:
                    c.set(x, by - 1, ramp[5])
                    c.set(x, by + 1, ramp[4])
    last = top + 2 + 3 * (_FACE + 1) - 1
    for x in range(x0 + 1, x0 + w - 1):
        c.set(x, last, AMBER[1])
    return outline(c, lambda col: _TABLE.get(col, CYAN), lit_lighten=False)


def icon_frames() -> List[Canvas]:
    """Rest, then one data packet races down each layer in turn, then the cap glints."""
    frames = []
    for f in range(FRAMES):
        pulses: List[Optional[int]] = []
        for i in range(3):
            start = 3 + i * 2
            step = f - start
            pulses.append(_ICON_X0 + _ICON_W + step * 2 if 0 <= step < 5 else None)
        body = _icon_body(pulses)
        glint(body, _ICON_X0 + 3, _ICON_TOP + 1, glint_stage(f, 9), CYAN[5])
        frames.append(layered(backlight(VIOLET), body))
    return frames


# ── beam cross-sections ────────────────────────────────────────────────

TILE_W = 16
BEAM_H = 28
BEAM_CY = 14  # the beam's centre line, where the hand anchor sits

# A band is (colour, coverage); coverage < 1 is a Bayer-dithered glow row.
Band = Tuple[str, float]


def _layer(ramp: Ramp, height: int, hot: bool = False) -> List[Band]:
    """One layer's rows, brightest in its middle; ``hot`` lifts every tone one step (the overshoot flash)."""
    profiles = {
        1: [4],
        2: [4, 3],
        3: [3, 5, 2],
        4: [3, 5, 4, 2],
        5: [3, 4, 5, 4, 2],
        6: [3, 4, 5, 5, 4, 2],
    }
    tones = profiles[height]
    return [(ramp[min(5, t + 1)] if hot else ramp[t], 1.0) for t in tones]


def _section(fe: int, be: int, db: int, glow: int = 0, hot: bool = False, core: bool = True) -> List[Band]:
    """Top to bottom: glow, keyline, front-end, gap, back-end, gap, database, keyline, glow."""
    bands: List[Band] = []
    if glow >= 2:
        bands.append((CYAN[1], 0.5))
    if glow >= 1:
        bands.append((CYAN[1], 1.0))
    bands.append((CYAN[0], 1.0))
    if fe:
        bands += _layer(CYAN, fe, hot)
        bands.append((INK, 1.0))
    middle = _layer(VIOLET, be, hot)
    if core and be >= 3:
        mid = len(middle) // 2
        middle[mid] = (WHITE, 1.0)
    bands += middle
    if db:
        bands.append((INK, 1.0))
        bands += _layer(AMBER, db, hot)
    bands.append((AMBER[0], 1.0))
    if glow >= 1:
        bands.append((AMBER[1], 1.0))
    if glow >= 2:
        bands.append((AMBER[1], 0.5))
    return bands


def _tile(bands: Sequence[Band], phase: int = 0, crackle: bool = False) -> Canvas:
    """Paints bands into a 16 x 28 tile centred on BEAM_CY; dithered rows shift with ``phase`` (shimmer).

    ``crackle`` adds two sparks riding the outer glow, at new places every frame.
    """
    c = Canvas(TILE_W, BEAM_H)
    top = BEAM_CY - len(bands) // 2
    for i, (color, coverage) in enumerate(bands):
        y = top + i
        for x in range(TILE_W):
            if coverage >= 1.0 or dither_on(x + phase, y, coverage, 2):
                c.set(x, y, color)
    if crackle:
        bottom = top + len(bands) - 1
        c.set((3 + phase * 5) % TILE_W, top, CYAN[4])
        c.set((4 + phase * 5) % TILE_W, top - 1, CYAN[5])
        c.set((11 + phase * 7) % TILE_W, bottom, AMBER[4])
        c.set((12 + phase * 7) % TILE_W, bottom + 1, AMBER[5])
    return c


def _dashes(bands: List[Band], keep: Sequence[Tuple[int, int, int, int]]) -> Canvas:
    """A collapse tile: each (row, on, period, offset) keeps only ``on`` of every ``period`` pixels of that row."""
    c = Canvas(TILE_W, BEAM_H)
    top = BEAM_CY - len(bands) // 2
    rules = {row: (on, period, offset) for row, on, period, offset in keep}
    for i, (color, _) in enumerate(bands):
        if i not in rules:
            continue
        on, period, offset = rules[i]
        y = top + i
        for x in range(TILE_W):
            if (x + offset) % period < on:
                c.set(x, y, color)
    return c


def beam_sheet() -> Sheet:
    full = _section(5, 5, 5, glow=2)
    # No full-beam brightness flicker (a large area strobing at 5 Hz is a photosensitivity
    # risk): the beam shimmers through its dithered glow, its core line and the data riding it.
    dim_core = _section(5, 5, 5, glow=2, core=False)
    sustain = [
        _tile(full, 0, crackle=True),
        _tile(full, 1, crackle=True),
        _tile(dim_core, 2, crackle=True),
        _tile(_section(5, 5, 5, glow=1), 3),
    ]
    opening = [
        _tile([(VIOLET[4], 1.0), (WHITE, 1.0), (VIOLET[4], 1.0)]),
        _tile(_section(1, 5, 1)),
        _tile(_section(3, 5, 3, glow=1)),
        _tile(_section(6, 6, 6, glow=2, hot=True), 1),
        sustain[0],
    ]
    thin_outer = _section(3, 5, 3)
    one_px = _section(1, 3, 1)
    core_only = [(VIOLET[3], 1.0), (WHITE, 1.0), (VIOLET[3], 1.0)]
    collapse = [
        _tile(_section(5, 5, 5)),
        _tile(thin_outer),
        _tile(one_px),
        _dashes(one_px, [(1, 6, 8, 0), (3, 3, 4, 0), (4, 16, 16, 0), (5, 3, 4, 2), (7, 6, 8, 4)]),
        _dashes(one_px, [(1, 2, 8, 0), (4, 6, 8, 2), (7, 2, 8, 4)]),
        _dashes(core_only, [(1, 3, 8, 1)]),
        _dashes(core_only, [(1, 1, 8, 3)]),
    ]
    return Sheet(
        "fx-beam",
        (TILE_W, BEAM_H),
        (0, BEAM_CY),
        [
            Anim("open", 60, False, opening),
            Anim("sustain", 20, True, sustain),
            Anim("collapse", 40, False, collapse),
        ],
    )


# ── data glyphs riding each layer ──────────────────────────────────────

_GLYPHS = {
    "<": rows(".#\n#.\n.#"),
    "/": rows("..#\n.#.\n#.."),
    ">": rows("#.\n.#\n#."),
    "{": rows(".##\n.#.\n#..\n.#.\n.##"),
    "}": rows("##.\n.#.\n..#\n.#.\n##."),
    ".": rows("#"),
    "=": rows("####\n....\n####"),
    "-": rows("##"),
}


def _track(text: str, color: str, width: int = 32) -> Canvas:
    """Glyphs laid out left to right on a tileable ``width`` x 5 strip (one layer), vertically centred."""
    c = Canvas(width, 5)
    x = 0
    for ch in text:
        if ch == " ":
            x += 2
            continue
        glyph = _GLYPHS[ch]
        gy = (5 - len(glyph)) // 2
        c.stamp(glyph, {"#": color}, x, gy)
        x += len(glyph[0]) + 1
    return c


def data_sheet() -> Sheet:
    """Dark data etched into the light: each layer carries its own glyphs, scrolled by code."""
    return Sheet(
        "fx-beam-data",
        (32, 5),
        (0, 2),
        [
            Anim("front-end", 1, True, [_track("</>   </>   ", CYAN[1])]),
            Anim("back-end", 1, True, [_track("{.}    {.}  ", VIOLET[1])]),
            Anim("database", 1, True, [_track("=  -  =  -  ", AMBER[1])]),
        ],
    )


# ── muzzle: charge, port, exhaust ──────────────────────────────────────

MUZZLE = (32, 40)
MUZZLE_ORIGIN = (10, 20)


def _flare(c: Canvas, cx: int, cy: int, radius: int, rays: int, diagonal: bool = False) -> None:
    """Stepped radial flare: white core, layer-coloured bands split top/middle/bottom, plus rays."""
    for r, palette_index in ((radius + 2, 2), (radius + 1, 3), (radius, 5)):
        for y in range(cy - r - 1, cy + r + 2):
            for x in range(cx - r - 1, cx + r + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r:
                    band = 0 if y < cy - 1 else (1 if y <= cy + 1 else 2)
                    c.set(x, y, LAYERS[band][palette_index])
    c.disc(cx + 0.5, cy + 0.5, max(1.0, radius - 0.6), WHITE)
    for k in range(4):
        angle = math.radians(k * 90 + (45 if diagonal else 0))
        for d in range(radius + 1, radius + 1 + rays):
            x, y = polar(cx, cy, d, angle)
            c.set(x, y, WHITE if d < radius + 1 + rays - 1 else CYAN[4])


def _sparks(c: Canvas, cx: int, cy: int, radius: int, trail: int) -> None:
    """The three layers arriving at the hand from behind: one spark per layer with a short trail."""
    for i, ramp in enumerate(LAYERS):
        angle = math.radians(-145 + i * 145)
        hx, hy = polar(cx, cy, radius, angle)
        tx, ty = polar(cx, cy, radius + trail, angle)
        c.line(tx, ty, hx, hy, ramp[3])
        c.set(hx, hy, WHITE)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            c.set(hx + dx, hy + dy, ramp[5])


def muzzle_sheet() -> Sheet:
    ox, oy = MUZZLE_ORIGIN
    charge = []
    for radius_in, core, trail in ((9, 2, 4), (5, 4, 3), (0, 6, 0)):
        c = Canvas(*MUZZLE)
        if radius_in:
            _flare(c, ox, oy, core, core + 2)
            _sparks(c, ox, oy, radius_in, trail)
        else:
            # The release: the port opens with straight and diagonal rays at once.
            _flare(c, ox, oy, core, core + 2, diagonal=True)
            _flare(c, ox, oy, core, core + 4)
        charge.append(c)
    sustain = []
    for f in range(4):
        c = Canvas(*MUZZLE)
        _flare(c, ox, oy, 4 if f % 2 == 0 else 5, 4 if f % 2 == 0 else 6, diagonal=f in (1, 3))
        sustain.append(c)
    collapse = []
    for f, (radius, ring) in enumerate(((3, 0), (2, 6), (1, 8), (0, 10), (0, 12))):
        c = Canvas(*MUZZLE)
        if radius:
            _flare(c, ox, oy, radius, 2)
        if ring:
            for x, y in midpoint_circle(ox, oy, ring):
                if f < 4 or (x + y) % 2 == 0:
                    c.set(x, y, VIOLET[3] if f < 3 else VIOLET[2])
        # exhaust bits drifting back and up
        for i in range(3):
            if 1 <= f < 5:
                bx, by = ox - 2 - f * 2 - i * 3, oy - 3 - f - i * 2
                c.set(bx, by, LAYERS[i][4 - f // 2])
        collapse.append(c)
    return Sheet(
        "fx-beam-muzzle",
        MUZZLE,
        MUZZLE_ORIGIN,
        [
            Anim("charge", 60, False, charge),
            Anim("sustain", 20, True, sustain),
            Anim("collapse", 30, False, collapse),
        ],
    )


# ── tip: the spearhead while the beam grows ────────────────────────────

TIP = (24, 28)
TIP_ORIGIN = (0, BEAM_CY)


def tip_sheet() -> Sheet:
    frames = []
    full = _section(5, 5, 5, glow=1)
    for f in range(3):
        c = Canvas(*TIP)
        top = BEAM_CY - len(full) // 2
        centre = len(full) // 2
        for i, (color, coverage) in enumerate(full):
            # Chevron front: rows farther from the centre stop earlier.
            reach = 12 - abs(i - centre) + (f % 2)
            for x in range(0, max(0, reach)):
                if coverage >= 1.0 or dither_on(x, top + i, coverage, 2):
                    c.set(x, top + i, color)
            if 0 < reach < TIP[0]:
                c.set(reach - 1, top + i, WHITE if abs(i - centre) < 6 else color)
        # sparks thrown ahead of the front
        for k, (dx, dy) in enumerate(((14, -4), (16, 2), (15, 6), (17, -1))):
            if (k + f) % 2 == 0:
                c.set(dx + f, BEAM_CY + dy, WHITE)
                c.set(dx + f - 1, BEAM_CY + dy, LAYERS[k % 3][4])
        frames.append(c)
    return Sheet("fx-beam-tip", TIP, TIP_ORIGIN, [Anim("grow", 30, True, frames)])


# ── hit: the pierce burst ──────────────────────────────────────────────

HIT = (40, 40)
HIT_ORIGIN = (20, 20)


def _layer_band(y: int, cy: int) -> int:
    return 0 if y < cy - 2 else (1 if y <= cy + 2 else 2)


def hit_sheet() -> Sheet:
    """The pierce: an impact frame, a layer-banded ring and three shards punching out the far side."""
    ox, oy = HIT_ORIGIN
    radii = (0, 6, 9, 12, 14, 16, 17, 0, 0, 0)
    cores = (5, 4, 3, 2, 0, 0, 0, 0, 0, 0)
    shards = ((-26, CYAN, 1.0), (0, VIOLET, 1.3), (26, AMBER, 1.0), (-155, CYAN, 0.55), (155, AMBER, 0.55))
    frames = []
    for f in range(10):
        c = Canvas(*HIT)
        radius = radii[f]
        if radius:
            for x, y in midpoint_circle(ox, oy, radius):
                if f >= 5 and (x + y) % 2:
                    continue
                c.set(x, y, WHITE if f <= 2 else LAYERS[_layer_band(y, oy)][4 if f <= 4 else 3])
            if f <= 4:
                for x, y in midpoint_circle(ox, oy, radius - 1):
                    c.set(x, y, LAYERS[_layer_band(y, oy)][3 if f <= 2 else 2])
        if f <= 1:
            # Impact rays: long along the beam, short across it.
            reach_x, reach_y = (17, 9) if f == 0 else (12, 6)
            for d in range(1, reach_x + 1):
                tone = WHITE if d < reach_x - 3 else VIOLET[4]
                c.set(ox + d, oy, tone)
                c.set(ox - d, oy, tone)
            for d in range(1, reach_y + 1):
                c.set(ox, oy - d, WHITE if d < reach_y - 2 else CYAN[4])
                c.set(ox, oy + d, WHITE if d < reach_y - 2 else AMBER[4])
        core = cores[f]
        if core:
            c.disc(ox + 0.5, oy + 0.5, core + 1.2, VIOLET[4], where=lambda x, y: not c.opaque(x, y))
            c.disc(ox + 0.5, oy + 0.5, core, WHITE)
        if f >= 1:
            for k, (angle_deg, ramp, speed) in enumerate(shards):
                if f >= 7 and (k + f) % 2:
                    continue
                d = 5 + (f - 1) * 3.0 * speed
                hx, hy = polar(ox, oy, d, math.radians(angle_deg))
                tx, ty = polar(ox, oy, max(2.0, d - (4 if f < 5 else 2)), math.radians(angle_deg))
                c.line(tx, ty, hx, hy, ramp[3])
                c.set(hx, hy, ramp[5] if f < 6 else ramp[4])
        frames.append(c)
    return Sheet("fx-beam-hit", HIT, HIT_ORIGIN, [Anim("pierce", 30, False, frames)])


# ── bits: data debris for particles ────────────────────────────────────

_BITS = [
    ("0", ".#.\n#.#\n#.#\n#.#\n.#.", CYAN),
    ("1", ".#.\n##.\n.#.\n.#.\n###", CYAN),
    ("<", "..#\n.#.\n#..\n.#.\n..#", CYAN),
    ("{", ".##\n.#.\n#..\n.#.\n.##", VIOLET),
    ("}", "##.\n.#.\n..#\n.#.\n##.", VIOLET),
    (";", "...\n.#.\n...\n.#.\n#..", VIOLET),
    ("=", "...\n###\n...\n###\n...", AMBER),
    ("db", ".#.\n#.#\n###\n#.#\n.#.", AMBER),
]


def bits_sheet() -> Sheet:
    """One glyph per frame (code picks a frame per particle); each glyph also has a dimmed twin row."""
    bright, dim = [], []
    for _, art, ramp in _BITS:
        for target, tone in ((bright, 5), (dim, 3)):
            c = Canvas(5, 7)
            c.stamp(rows(art), {"#": ramp[tone]}, 1, 1)
            target.append(outline(c, lambda col, r=ramp: r, lit_lighten=False))
    return Sheet(
        "fx-bits",
        (5, 7),
        (2, 3),
        [Anim("bright", 1, False, bright), Anim("dim", 1, False, dim)],
    )


def sheets() -> List[Sheet]:
    return [icon_sheet(icon_frames()), beam_sheet(), data_sheet(), muzzle_sheet(), tip_sheet(), hit_sheet(), bits_sheet()]
