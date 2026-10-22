"""Small motifs shared by every skill, so a glint is the same glint everywhere."""

from __future__ import annotations

from .grid import Grid
from .palette import WHITE


def twinkle(grid: Grid, x: int, y: int, reach: int, core: str = WHITE, tip: str = WHITE) -> None:
    """A four-point twinkle centred on (x, y): `core` out to `reach - 1` pixels, `tip` on the last pixel of each arm."""
    grid.set(x, y, core)
    for step in range(1, reach + 1):
        tone = core if step < reach else tip
        for dx, dy in ((step, 0), (-step, 0), (0, step), (0, -step)):
            grid.set(x + dx, y + dy, tone)
