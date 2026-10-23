"""Whole-pixel skews: how sprite artists tilt a prop or lean a body without rotating pixels."""

from __future__ import annotations

from typing import Dict

from .grid import Grid, Point


def skew_columns(grid: Grid, step: int, pivot_x: int = 0) -> Grid:
    """Raises each column by one pixel every `step` columns to the right of `pivot_x` (negative step lowers)."""
    if step == 0:
        return grid
    cells: Dict[Point, str] = {}
    for (x, y), key in grid.cells.items():
        dy = -((x - pivot_x) // abs(step)) * (1 if step > 0 else -1)
        cells[(x, y + dy)] = key
    px, py = grid.pivot
    pdy = -((px - pivot_x) // abs(step)) * (1 if step > 0 else -1)
    return Grid.from_cells(cells, (px, py + pdy))


def skew_rows(grid: Grid, step: int, pivot_y: int) -> Grid:
    """Shifts each row right by one pixel every `step` rows above `pivot_y` (negative step shifts left)."""
    if step == 0:
        return grid
    cells: Dict[Point, str] = {}
    for (x, y), key in grid.cells.items():
        dx = ((pivot_y - y) // abs(step)) * (1 if step > 0 else -1)
        cells[(x + dx, y)] = key
    return Grid.from_cells(cells, grid.pivot)


def stretch_rows(grid: Grid, row: int, amount: int = 1) -> Grid:
    """Lifts every row above `row` by `amount`, repeating `row` to close the gap: an inhale."""
    cells: Dict[Point, str] = {}
    for (x, y), key in grid.cells.items():
        if y < row:
            cells[(x, y - amount)] = key
        else:
            cells[(x, y)] = key
            if y == row:
                for k in range(1, amount + 1):
                    cells[(x, y - k)] = key
    return Grid.from_cells(cells, grid.pivot)
