"""Luna · San Francisco: sun-warmed concrete sidewalk over cable-car asphalt,
International Orange steel girders, and a "429" rate-limit gate.

Light comes from the low sun on the right, matching the generated sky, so
right-facing edges get the highlight and left-facing edges the shade.
"""

from __future__ import annotations

import random
from typing import Dict

from PIL import Image

from arttools.canvas import Canvas

from . import block
from .glyphs import text_rows
from .tileset import TileDrawer, assemble

PALETTE: Dict[str, str] = {
    "ink": "#1c1024",
    "walk_hi": "#f2d2a4",
    "walk_lit": "#dcb68c",
    "walk": "#b48e74",
    "walk_dk": "#866462",
    "kerb_dk": "#6c5258",
    "asph_hi": "#6a6280",
    "asph": "#4c4662",
    "asph_dk": "#36304a",
    "rail_hi": "#f0dcc4",
    "rail": "#9a8c9c",
    "slot": "#140c1c",
    "gird_hi": "#ffa45c",
    "gird": "#e2582e",
    "gird_dk": "#9e3028",
    "gird_deep": "#5e1a24",
    "pit": "#140c1c",
    "pit_hi": "#2c1c38",
    "pit_glow": "#4a1838",
    "caution": "#ffc838",
    "led": "#ff3a3a",
    "led_dim": "#5a1c24",
    "led_ok": "#5aff7a",
    "steel_hi": "#d6d0dc",
    "steel": "#8c8498",
    "steel_dk": "#544c64",
    "bar_red": "#e2402e",
    "bar_white": "#f4ece0",
    **block.BLOCK_PALETTE,
}


def _specks(c: Canvas, seed: str, y0: int, y1: int, colours: Dict[str, int]) -> None:
    rng = random.Random(seed)
    for name, count in colours.items():
        for _ in range(count):
            c.set(rng.randrange(16), rng.randrange(y0, y1 + 1), name)


# --- ground: sidewalk (top row), cable-car track asphalt (fill), asphalt (base)


def _sidewalk(c: Canvas, joint: bool) -> None:
    c.hline(0, 15, 0, "walk_hi")
    c.rect(0, 1, 16, 4, "walk_lit")
    _specks(c, f"walk-top-{joint}", 1, 4, {"walk": 5, "walk_hi": 2})
    c.hline(0, 15, 5, "walk_hi")
    c.rect(0, 6, 16, 4, "walk")
    c.checker(0, 10, 16, 1, "walk", "walk_dk")
    c.rect(0, 11, 16, 2, "walk_dk")
    _specks(c, f"walk-face-{joint}", 6, 11, {"walk_dk": 4, "walk_lit": 2})
    c.hline(0, 15, 13, "kerb_dk")
    c.rect(0, 14, 16, 2, "asph_dk")
    if joint:
        # A hairline crack and a worn patch: SF sidewalks are never pristine.
        for x, y in ((4, 2), (5, 3), (5, 4), (6, 4)):
            c.set(x, y, "walk_dk")
        c.set(10, 8, "walk_dk")
        c.set(11, 8, "walk_dk")
        c.set(11, 9, "walk_dk")
        c.vline(15, 1, 4, "walk")
        c.vline(15, 6, 12, "walk_dk")
        c.vline(14, 6, 12, "walk_lit")


def _asphalt(c: Canvas, seed: str, y0: int = 0, y1: int = 15) -> None:
    c.rect(0, y0, 16, y1 - y0 + 1, "asph")
    _specks(c, seed, y0, y1, {"asph_hi": 5, "asph_dk": 7})


def _track(c: Canvas, plate: bool) -> None:
    _asphalt(c, f"track-{plate}")
    c.hline(0, 15, 4, "rail_hi")
    c.hline(0, 15, 5, "rail")
    c.rect(0, 6, 16, 2, "slot")
    c.hline(0, 15, 8, "rail_hi")
    c.hline(0, 15, 9, "rail")
    if plate:
        # Slot-cover plates every other tile break the long rails into a rhythm.
        c.rect(5, 6, 6, 2, "rail")
        c.hline(5, 10, 6, "rail_hi")


def _base(c: Canvas, alt: bool) -> None:
    # Uniform in value top to bottom so the tile also repeats vertically.
    c.rect(0, 0, 16, 16, "asph_dk")
    _specks(c, f"base-{alt}", 0, 15, {"asph": 9, "slot": 3})
    if alt:
        c.hline(3, 7, 4, "asph_dk")
        c.set(8, 5, "asph_dk")
        c.set(2, 3, "asph_hi")


def _cap_left(c: Canvas) -> None:
    for y in range(16):
        if c.get(1, y) is not None:
            c.set(0, y, "ink")
            c.set(1, y, "kerb_dk" if y < 14 else "asph_dk")


def _cap_right(c: Canvas) -> None:
    for y in range(16):
        if c.get(14, y) is not None:
            c.set(15, y, "ink")
            c.set(14, y, "walk_hi" if y < 13 else "asph_hi")


def _with(base: TileDrawer, *mods: TileDrawer) -> TileDrawer:
    def draw(c: Canvas) -> None:
        base(c)
        for mod in mods:
            mod(c)

    return draw


def _caution(side: str) -> TileDrawer:
    def draw(c: Canvas) -> None:
        # Diagonal caution paint on the kerb face, like a kerb at a work site.
        for y in range(6, 13):
            for x in range(16):
                if (x + y) % 6 < 3:
                    c.set(x, y, "caution")
                else:
                    c.set(x, y, "ink")
        c.hline(0, 15, 5, "walk_hi")

    return draw


# --- platforms: riveted International Orange girders


def _girder(c: Canvas) -> None:
    c.hline(0, 15, 0, "ink")
    c.hline(0, 15, 1, "gird_hi")
    c.rect(0, 2, 16, 2, "gird")
    c.hline(0, 15, 4, "gird_dk")
    # Warren truss: V shapes with an 8 px period so the web tiles seamlessly.
    for x in range(16):
        d = x % 8
        y = 5 + (d if d < 4 else 7 - d)
        c.set(x, y, "gird")
        c.set(x, y + 1, "gird_deep")
    for x in (0, 8):
        c.set(x, 5, "gird_hi")
    c.hline(0, 15, 9, "gird_hi")
    c.rect(0, 10, 16, 1, "gird")
    c.hline(0, 15, 11, "gird_dk")
    c.hline(0, 15, 12, "ink")
    for x in (3, 11):
        c.set(x, 2, "gird_deep")
        c.set(x, 10, "gird_deep")


def _girder_alt(c: Canvas) -> None:
    _girder(c)
    c.rect(6, 1, 4, 3, "gird_dk")
    c.hline(6, 9, 1, "gird_hi")
    c.set(7, 2, "gird_deep")


def _girder_end(side: str) -> TileDrawer:
    def draw(c: Canvas) -> None:
        _girder(c)
        x_out, x_in = (0, 1) if side == "left" else (15, 14)
        c.vline(x_out, 0, 12, "ink")
        c.vline(x_in, 1, 11, "gird_dk" if side == "left" else "gird_hi")
        c.vline(x_in + (1 if side == "left" else -1), 1, 11, "gird")
        c.set(x_in + (2 if side == "left" else -2), 6, "gird_deep")

    return draw


def _support(c: Canvas) -> None:
    c.vline(5, 0, 15, "ink")
    c.vline(6, 0, 15, "gird_dk")
    c.vline(7, 0, 15, "gird")
    c.vline(8, 0, 15, "gird")
    c.vline(9, 0, 15, "gird_hi")
    c.vline(10, 0, 15, "ink")
    for y in (3, 11):
        c.set(7, y, "gird_deep")
        c.set(8, y, "gird_hi")


# --- the spam-folder pit


def _pit_top(c: Canvas) -> None:
    c.rect(0, 0, 16, 16, "pit")
    c.rect(0, 0, 16, 2, "pit_hi")
    c.checker(0, 2, 16, 2, "pit_hi", "pit")
    # A faint red haze deep in the hole marks it as a hazard, not a doorway.
    for y in range(12, 16, 2):
        for x in range(y % 4 // 2, 16, 2):
            c.set(x, y, "pit_glow")


def _pit_fill(c: Canvas) -> None:
    # A sparse 25% dither: enough to show depth below the lip, quiet enough
    # not to shimmer when the pit scrolls past.
    c.rect(0, 0, 16, 16, "pit")
    for y in range(0, 16, 2):
        for x in range(y % 4 // 2 * 1, 16, 2):
            c.set(x, y, "pit_glow")


DRAWERS: Dict[str, TileDrawer] = {
    "ground_top": lambda c: _sidewalk(c, False),
    "ground_top_alt": lambda c: _sidewalk(c, True),
    "ground_top_left": _with(lambda c: _sidewalk(c, False), _cap_left),
    "ground_top_right": _with(lambda c: _sidewalk(c, False), _cap_right),
    "ground_fill": lambda c: _track(c, False),
    "ground_fill_alt": lambda c: _track(c, True),
    "ground_fill_left": _with(lambda c: _track(c, False), _cap_left),
    "ground_fill_right": _with(lambda c: _track(c, False), _cap_right),
    "ground_base": lambda c: _base(c, False),
    "ground_base_alt": lambda c: _base(c, True),
    "ground_base_left": _with(lambda c: _base(c, False), _cap_left),
    "ground_base_right": _with(lambda c: _base(c, False), _cap_right),
    "pit_edge_left": _with(lambda c: _sidewalk(c, False), _caution("right"), _cap_right),
    "pit_edge_right": _with(lambda c: _sidewalk(c, False), _caution("left"), _cap_left),
    "pit_top": _pit_top,
    "pit_fill": _pit_fill,
    "platform_left": _girder_end("left"),
    "platform_mid": _girder,
    "platform_mid_alt": _girder_alt,
    "platform_right": _girder_end("right"),
    "platform_support": _support,
    "block_highlight": block.highlight,
    "block_highlight_shine": block.highlight_shine,
    "block_used": block.used,
}


def tileset() -> Image.Image:
    return assemble(DRAWERS, PALETTE)


# --- props


def rate_limit_gate() -> Image.Image:
    """24x48, two frames side by side: 0 = closed (blocks), 1 = open."""
    sheet = Canvas(48, 48, PALETTE)
    for frame, closed in enumerate((True, False)):
        c = Canvas(24, 48, PALETTE)
        _gate(c, closed)
        sheet.paste(c, frame * 24, 0)
    return sheet.image


def _gate(c: Canvas, closed: bool) -> None:
    # Posts.
    for x0 in (0, 20):
        c.vline(x0, 12, 47, "ink")
        c.vline(x0 + 1, 12, 46, "steel_dk")
        c.vline(x0 + 2, 12, 46, "steel_hi")
        c.vline(x0 + 3, 12, 47, "ink")
    c.rect(0, 44, 24, 3, "steel_dk")
    c.hline(0, 23, 44, "steel")
    c.hline(0, 23, 47, "ink")
    # Sign box with the status code in LED digits.
    c.rect(0, 0, 24, 13, "ink")
    c.rect(1, 1, 22, 11, "steel_dk")
    c.rect(2, 2, 20, 9, "ink")
    c.sprite(6, 4, text_rows("429"), {"#": "led" if closed else "led_dim"})
    c.set(3, 3, "led" if closed else "led_dim")
    c.set(20, 3, "led_ok" if not closed else "led_dim")
    if closed:
        for y in (16, 24, 32):
            for x in range(4, 20):
                c.set(x, y, "bar_red" if (x // 4) % 2 == 0 else "bar_white")
                c.set(x, y + 1, "gird_dk" if (x // 4) % 2 == 0 else "steel")
                c.set(x, y + 2, "ink")
    else:
        # Bars retracted into the header leave short stubs on the posts.
        for y in (16, 24, 32):
            c.set(4, y, "bar_red")
            c.set(19, y, "bar_red")
            c.set(4, y + 1, "ink")
            c.set(19, y + 1, "ink")
