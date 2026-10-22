"""Key grids: pixel art authored as text, one character per pixel.

A grid is a rectangle of palette keys. `.` is transparent, `o` is a soft
outline (the compositor decides whether it renders as the near-black
silhouette or as a softer inner line) and `O` is always near-black. Every
other key is looked up in the palette of the part that uses the grid, so the
same grid can be dressed in different colours.
"""

from __future__ import annotations

import textwrap
from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, Mapping, Optional, Tuple

Point = Tuple[int, int]

TRANSPARENT = "."
SOFT_OUTLINE = "o"
HARD_OUTLINE = "O"


@dataclass(frozen=True)
class Grid:
    """An immutable key grid with a pivot (the point that is placed on a joint)."""

    w: int
    h: int
    cells: Mapping[Point, str] = field(repr=False)
    pivot: Point = (0, 0)

    @staticmethod
    def parse(text: str, pivot: Optional[Point] = None, marker: Optional[str] = None) -> "Grid":
        """Parses a dedented block of rows. `marker` (e.g. `+`) marks the pivot and renders as `o`."""
        lines = [line.rstrip() for line in textwrap.dedent(text).strip("\n").split("\n")]
        w = max(len(line) for line in lines)
        cells: Dict[Point, str] = {}
        found: Optional[Point] = None
        for y, line in enumerate(lines):
            for x, key in enumerate(line):
                if marker is not None and key == marker:
                    found = (x, y)
                    key = SOFT_OUTLINE
                if key not in (TRANSPARENT, " "):
                    cells[(x, y)] = key
        if pivot is None:
            pivot = found if found is not None else (0, 0)
        return Grid(w, len(lines), cells, pivot)

    @staticmethod
    def from_cells(cells: Mapping[Point, str], pivot: Point = (0, 0)) -> "Grid":
        if not cells:
            return Grid(0, 0, {}, pivot)
        xs = [x for x, _ in cells]
        ys = [y for _, y in cells]
        ox, oy = min(xs), min(ys)
        moved = {(x - ox, y - oy): key for (x, y), key in cells.items()}
        return Grid(max(xs) - ox + 1, max(ys) - oy + 1, moved, (pivot[0] - ox, pivot[1] - oy))

    def __iter__(self) -> Iterator[Tuple[Point, str]]:
        return iter(sorted(self.cells.items(), key=lambda item: (item[0][1], item[0][0])))

    def key(self, x: int, y: int) -> str:
        return self.cells.get((x, y), TRANSPARENT)

    def flipped(self) -> "Grid":
        """Mirror left-right; the pivot mirrors with it."""
        cells = {(self.w - 1 - x, y): key for (x, y), key in self.cells.items()}
        return Grid(self.w, self.h, cells, (self.w - 1 - self.pivot[0], self.pivot[1]))

    def flipped_v(self) -> "Grid":
        cells = {(x, self.h - 1 - y): key for (x, y), key in self.cells.items()}
        return Grid(self.w, self.h, cells, (self.pivot[0], self.h - 1 - self.pivot[1]))

    def rotated90(self, turns: int = 1) -> "Grid":
        """Quarter turns clockwise. Pixel art survives 90 degree turns intact."""
        grid = self
        for _ in range(turns % 4):
            cells = {(grid.h - 1 - y, x): key for (x, y), key in grid.cells.items()}
            px, py = grid.pivot
            grid = Grid(grid.h, grid.w, cells, (grid.h - 1 - py, px))
        return grid

    def recolored(self, mapping: Mapping[str, str]) -> "Grid":
        return Grid(self.w, self.h, {p: mapping.get(k, k) for p, k in self.cells.items()}, self.pivot)

    def with_pivot(self, pivot: Point) -> "Grid":
        return Grid(self.w, self.h, self.cells, pivot)

    def overlay(self, other: "Grid", at: Point = (0, 0)) -> "Grid":
        """Paints `other` over this grid with its top-left at `at`; the result keeps this pivot."""
        cells = dict(self.cells)
        for (x, y), key in other.cells.items():
            cells[(x + at[0], y + at[1])] = key
        merged = Grid.from_cells(cells, self.pivot)
        return merged

    def erase(self, points: Iterable[Point]) -> "Grid":
        cells = dict(self.cells)
        for point in points:
            cells.pop(point, None)
        return Grid(self.w, self.h, cells, self.pivot)

    def sheared(self, amount: int, top: int, bottom: int) -> "Grid":
        """Shifts rows sideways in whole-pixel steps: row `top` moves by `amount`, row `bottom` stays.

        A lean made of one or two clean steps, the way a sprite artist leans a torso,
        instead of a rotation that would scatter single pixels.
        """
        if amount == 0:
            return self
        cells: Dict[Point, str] = {}
        span = max(1, bottom - top)
        for (x, y), key in self.cells.items():
            t = min(1.0, max(0.0, (bottom - y) / span))
            dx = int(round(amount * t))
            cells[(x + dx, y)] = key
        return Grid.from_cells(cells, self.pivot)

    def rows(self) -> Tuple[str, ...]:
        return tuple("".join(self.key(x, y) for x in range(self.w)) for y in range(self.h))
