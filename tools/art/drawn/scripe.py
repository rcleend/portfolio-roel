"""Scripe · Berlin: sodium-lit cobblestones on a granite kerb over old brick
and earth, scaffolding (Geruest) platforms, and the scope-creep overlay.

The warm top edge is the sodium street light; the rest of the night palette is
cool violet so the play plane separates from the violet backgrounds by
temperature as well as value.
"""

from __future__ import annotations

import random
from typing import Dict

from PIL import Image

from arttools.canvas import Canvas

from . import block
from .tileset import TileDrawer, assemble

PALETTE: Dict[str, str] = {
    "ink": "#140c20",
    "sodium": "#ffcc7a",
    "cob_hi": "#b8acc8",
    "cob": "#867aa0",
    "cob_dk": "#5c5278",
    "mortar": "#2a2240",
    "curb_hi": "#c2b6c4",
    "curb": "#8a7e96",
    "curb_dk": "#5e546e",
    "brick_hi": "#a8505a",
    "brick": "#843a4c",
    "brick_dk": "#5c2638",
    "joint": "#2c1a30",
    "earth_hi": "#5a4054",
    "earth": "#3e2a3e",
    "earth_dk": "#2a1c2c",
    "plank_hi": "#e8b070",
    "plank": "#b4783e",
    "plank_dk": "#74482a",
    "tube_hi": "#e0e0ee",
    "tube": "#9a98b2",
    "tube_dk": "#5c5a76",
    "stripe_red": "#e43440",
    "stripe_white": "#f2eaf0",
    "pit": "#120a1c",
    "pit_hi": "#261a36",
    "pit_glow": "#4a2414",
    "vine_hi": "#9ae05a",
    "vine": "#4ea83e",
    "vine_dk": "#2a6232",
    "tape": "#ffd23a",
    "tape_dk": "#1c1420",
    "lamp": "#ff9a1c",
    "lamp_hi": "#fff2a0",
    **block.BLOCK_PALETTE,
}


def _with(base: TileDrawer, *mods: TileDrawer) -> TileDrawer:
    def draw(c: Canvas) -> None:
        base(c)
        for mod in mods:
            mod(c)

    return draw


# --- ground: cobbles on a granite kerb (top), brick (fill), earth (base)


def _cobbles(c: Canvas, joint: bool) -> None:
    rng = random.Random(f"cobbles-{joint}")
    c.hline(0, 15, 0, "sodium")
    c.rect(0, 1, 16, 7, "mortar")
    # Two staggered rows of 4x2 setts; the stagger and 16 px period make the
    # pattern continue across tile seams.
    for row, (y, shift) in enumerate(((1, 0), (4, 2))):
        for i in range(4):
            x0 = i * 4 + shift
            tone = rng.choice(("cob", "cob", "cob_dk"))
            for dx in range(3):
                c.set((x0 + dx) % 16, y, "cob_hi" if tone == "cob" else "cob")
                c.set((x0 + dx) % 16, y + 1, tone)
    c.hline(0, 15, 7, "curb_hi")
    c.rect(0, 8, 16, 5, "curb")
    c.checker(0, 12, 16, 1, "curb", "curb_dk")
    c.hline(0, 15, 13, "curb_dk")
    c.rect(0, 14, 16, 2, "ink")
    for _ in range(3):
        c.set(rng.randrange(16), rng.randrange(8, 12), "curb_dk")
    if joint:
        c.vline(15, 8, 13, "ink")
        c.vline(14, 8, 12, "curb_hi")


def _bricks(c: Canvas, alt: bool) -> None:
    rng = random.Random(f"bricks-{alt}")
    c.rect(0, 0, 16, 16, "joint")
    for row in range(4):
        y = row * 4
        shift = 4 if row % 2 else 0
        for i in range(3):
            x0 = i * 8 + shift - 8 if shift else i * 8
            tone = rng.choice(("brick", "brick", "brick_dk", "brick"))
            for dx in range(7):
                x = x0 + dx
                if 0 <= x < 16:
                    c.set(x, y + 1, "brick_hi" if tone == "brick" else "brick")
                    c.set(x, y + 2, tone)
                    c.set(x, y + 3, tone)
    if alt:
        # A missing brick showing earth behind it: Berlin plaster is never whole.
        c.rect(9, 5, 6, 3, "earth_dk")
        c.hline(9, 14, 5, "ink")


def _earth(c: Canvas, alt: bool) -> None:
    # Uniform in value top to bottom so the tile also repeats vertically.
    rng = random.Random(f"earth-{alt}")
    c.rect(0, 0, 16, 16, "earth")
    for _ in range(6):
        c.set(rng.randrange(16), rng.randrange(16), "earth_dk")
    for _ in range(5 if alt else 3):
        x, y = rng.randrange(15), rng.randrange(0, 15)
        c.set(x, y, "earth_hi")
        c.set(x + 1, y, "earth_hi")
        c.set(x, y + 1, "earth_dk")


def _cap(side: str, lit: str = "curb_hi", shade: str = "curb_dk") -> TileDrawer:
    """Exposed side face of a run: lit on the right (moon side), shaded on the left."""

    def draw(c: Canvas) -> None:
        x_out, x_in = (0, 1) if side == "left" else (15, 14)
        for y in range(16):
            if c.get(x_in, y) is not None:
                c.set(x_out, y, "ink")
                c.set(x_in, y, shade if side == "left" else lit)

    return draw


def _barrier_stripes(c: Canvas) -> None:
    # Red-white Baustelle striping across the kerb face at a pit edge.
    for y in range(8, 13):
        for x in range(16):
            c.set(x, y, "stripe_red" if (x + y) % 8 < 4 else "stripe_white")
    c.hline(0, 15, 13, "ink")


# --- platforms: scaffolding boards on tubes


def _scaffold(c: Canvas, alt: bool) -> None:
    c.hline(0, 15, 0, "ink")
    c.hline(0, 15, 1, "plank_hi")
    c.rect(0, 2, 16, 2, "plank")
    c.hline(0, 15, 4, "plank_dk")
    c.hline(0, 15, 5, "ink")
    for x in (2, 9, 13):
        c.set(x, 2, "plank_dk")
    if alt:
        c.vline(7, 1, 4, "ink")
        c.vline(8, 1, 3, "plank_hi")
    c.hline(0, 15, 7, "tube_hi")
    c.hline(0, 15, 8, "tube")
    c.hline(0, 15, 9, "tube_dk")
    # Diagonal brace, direction alternating between the two variants.
    for i in range(6):
        x = 4 + i if not alt else 11 - i
        c.set(x, 10 + i, "tube")
        c.set(x + 1, 10 + i, "tube_dk")


def _scaffold_end(side: str) -> TileDrawer:
    def draw(c: Canvas) -> None:
        _scaffold(c, False)
        x = 1 if side == "left" else 12
        c.vline(x, 0, 15, "ink")
        c.vline(x + 1, 0, 15, "tube_hi")
        c.vline(x + 2, 0, 15, "tube_dk")
        c.vline(x + 3, 0, 15, "ink")
        # Coupler clamp where board tube meets the standard.
        c.rect(x, 6, 4, 4, "tube_dk")
        c.hline(x, x + 3, 6, "tube_hi")
        c.set(x + 1, 8, "ink")

    return draw


def _standard(c: Canvas) -> None:
    c.vline(6, 0, 15, "ink")
    c.vline(7, 0, 15, "tube_hi")
    c.vline(8, 0, 15, "tube")
    c.vline(9, 0, 15, "tube_dk")
    c.vline(10, 0, 15, "ink")
    c.rect(6, 4, 5, 3, "tube_dk")
    c.hline(6, 10, 4, "tube_hi")


# --- the Baustelle pit


def _pit_top(c: Canvas) -> None:
    c.rect(0, 0, 16, 16, "pit")
    c.rect(0, 0, 16, 2, "pit_hi")
    c.checker(0, 2, 16, 2, "pit_hi", "pit")
    # Warm work-lamp light pooling at the bottom of the excavation.
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
    "ground_top": lambda c: _cobbles(c, False),
    "ground_top_alt": lambda c: _cobbles(c, True),
    "ground_top_left": _with(lambda c: _cobbles(c, False), _cap("left")),
    "ground_top_right": _with(lambda c: _cobbles(c, False), _cap("right")),
    "ground_fill": lambda c: _bricks(c, False),
    "ground_fill_alt": lambda c: _bricks(c, True),
    "ground_fill_left": _with(lambda c: _bricks(c, False), _cap("left", "brick_hi", "brick_dk")),
    "ground_fill_right": _with(lambda c: _bricks(c, False), _cap("right", "brick_hi", "brick_dk")),
    "ground_base": lambda c: _earth(c, False),
    "ground_base_alt": lambda c: _earth(c, True),
    "ground_base_left": _with(lambda c: _earth(c, False), _cap("left", "earth_hi", "earth_dk")),
    "ground_base_right": _with(lambda c: _earth(c, False), _cap("right", "earth_hi", "earth_dk")),
    "pit_edge_left": _with(lambda c: _cobbles(c, False), _barrier_stripes, _cap("right")),
    "pit_edge_right": _with(lambda c: _cobbles(c, False), _barrier_stripes, _cap("left")),
    "pit_top": _pit_top,
    "pit_fill": _pit_fill,
    "platform_left": _scaffold_end("left"),
    "platform_mid": lambda c: _scaffold(c, False),
    "platform_mid_alt": lambda c: _scaffold(c, True),
    "platform_right": _scaffold_end("right"),
    "platform_support": _standard,
    "block_highlight": block.highlight,
    "block_highlight_shine": block.highlight_shine,
    "block_used": block.used,
}


def tileset() -> Image.Image:
    return assemble(DRAWERS, PALETTE)


# --- props


def scope_creep() -> Image.Image:
    """32x32, two frames side by side: creeping vines tangled in barrier tape."""
    sheet = Canvas(64, 32, PALETTE)
    for frame in range(2):
        c = Canvas(32, 32, PALETTE)
        _vines(c, frame)
        sheet.paste(c, frame * 32, 0)
    return sheet.image


def _vines(c: Canvas, frame: int) -> None:
    # Tape first so the vines visibly grow over it: scope creep swallowing the plan.
    for x in range(32):
        y = 9 + x // 4
        for dy in range(4):
            stripe = "tape" if (x + dy) % 6 < 4 else "tape_dk"
            c.set(x, y + dy, stripe if 0 < dy < 3 else "ink")
    sway = 1 if frame else 0
    stems = [
        [(2, 31), (3, 27), (2, 23), (4, 19), (5, 15), (4, 11), (6, 7), (7, 3)],
        [(14, 31), (13, 26), (15, 22), (14, 17), (16, 13), (18, 9), (17, 5)],
        [(26, 31), (27, 26), (25, 21), (27, 16), (28, 12), (26, 8), (27, 4)],
    ]
    for stem in stems:
        for (x0, y0), (x1, y1) in zip(stem, stem[1:]):
            steps = max(abs(x1 - x0), abs(y1 - y0))
            for i in range(steps + 1):
                t = i / steps
                x = round(x0 + (x1 - x0) * t) + (sway if y0 < 20 else 0)
                y = round(y0 + (y1 - y0) * t)
                c.set(x, y, "vine")
                c.set(x + 1, y, "vine_dk")
        for i, (x, y) in enumerate(stem[1:-1]):
            lx = x + (sway if y < 20 else 0) + (2 if i % 2 else -3)
            c.sprite(lx, y - 1, [".##", "###", "#.."] if i % 2 else ["##.", "###", "..#"],
                     {"#": "vine"})
            c.set(lx + 1, y - 1, "vine_hi")
        tip_x, tip_y = stem[-1]
        c.set(tip_x + sway - 1, tip_y - 1, "vine_hi")
        c.set(tip_x + sway - 2, tip_y - 2, "vine")


def baustelle() -> Image.Image:
    """48x32 construction barrier: a striped board on two hazard-striped feet
    with an amber warning lamp. Drawn rather than generated because at this
    size the feet's stripes are the whole read."""
    c = Canvas(48, 32, PALETTE)
    # Lamp.
    c.rect(36, 0, 6, 5, "ink")
    c.rect(37, 1, 4, 3, "lamp")
    c.set(38, 1, "lamp_hi")
    c.rect(38, 5, 2, 3, "ink")
    # Board.
    c.rect(0, 8, 48, 10, "ink")
    for y in range(9, 17):
        for x in range(1, 47):
            c.set(x, y, "stripe_red" if (x + y) % 10 < 5 else "stripe_white")
    for x in (3, 44):
        c.set(x, 11, "curb_dk")
        c.set(x, 14, "curb_dk")
    # Legs and A-frame feet.
    for x0 in (8, 34):
        c.rect(x0, 18, 6, 9, "ink")
        for y in range(18, 26):
            for x in range(x0 + 1, x0 + 5):
                c.set(x, y, "tape" if (x + y) % 4 < 2 else "tape_dk")
        c.rect(x0 - 4, 26, 14, 5, "ink")
        for x in range(x0 - 3, x0 + 9):
            c.set(x, 27, "tape" if (x // 2) % 2 == 0 else "tape_dk")
            c.set(x, 28, "tape_dk")
            c.set(x, 29, "tape_dk")
        c.hline(x0 - 3, x0 + 8, 30, "ink")
    return c.image
