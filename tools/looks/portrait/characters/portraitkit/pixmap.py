"""Hand-drawn pixel sprites authored as text.

A sprite is a block of text, one character per pixel, plus a legend that
maps characters to (material, tone) pairs. '.' and ' ' are transparent.
Text keeps the art reviewable in a diff and lets the head kit be reused
pixel for pixel: a Pixmap is immutable and placed only by whole pixels.
"""

from __future__ import annotations

from typing import Callable, Dict, Iterator, Mapping, Optional, Tuple

Cell = Tuple[str, int]  # (material, tone)
Legend = Mapping[str, Cell]

TRANSPARENT = frozenset(".  ")


class Pixmap:
    """An immutable sparse grid of (material, tone) cells."""

    __slots__ = ("w", "h", "cells", "name")

    def __init__(self, w: int, h: int, cells: Mapping[Tuple[int, int], Cell], name: str = "") -> None:
        self.w = w
        self.h = h
        self.cells: Dict[Tuple[int, int], Cell] = dict(cells)
        self.name = name

    @classmethod
    def parse(cls, text: str, legend: Legend, name: str = "") -> "Pixmap":
        rows = _rows(text)
        w = max((len(r) for r in rows), default=0)
        cells: Dict[Tuple[int, int], Cell] = {}
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch in TRANSPARENT:
                    continue
                if ch not in legend:
                    raise KeyError(f"sprite {name!r}: unknown pixel {ch!r} at ({x}, {y})")
                cells[(x, y)] = legend[ch]
        return cls(w, len(rows), cells, name)

    def __iter__(self) -> Iterator[Tuple[int, int, str, int]]:
        for (x, y), (material, tone) in sorted(self.cells.items(), key=lambda kv: (kv[0][1], kv[0][0])):
            yield x, y, material, tone

    def get(self, x: int, y: int) -> Optional[Cell]:
        return self.cells.get((x, y))

    def flip_x(self) -> "Pixmap":
        return Pixmap(self.w, self.h, {(self.w - 1 - x, y): c for (x, y), c in self.cells.items()}, self.name + "~")

    def recolor(self, fn: Callable[[str, int], Cell]) -> "Pixmap":
        return Pixmap(self.w, self.h, {xy: fn(m, t) for xy, (m, t) in self.cells.items()}, self.name)

    def with_material(self, mapping: Mapping[str, str]) -> "Pixmap":
        return self.recolor(lambda m, t: (mapping.get(m, m), t))

    def patched(self, text: str, legend: Legend, at: Tuple[int, int] = (0, 0)) -> "Pixmap":
        """Overlays another text block: '.' keeps the pixel below, ',' erases it."""
        cells = dict(self.cells)
        ox, oy = at
        for y, row in enumerate(_rows(text)):
            for x, ch in enumerate(row):
                if ch in TRANSPARENT:
                    continue
                key = (ox + x, oy + y)
                if ch == ",":
                    cells.pop(key, None)
                else:
                    if ch not in legend:
                        raise KeyError(f"patch on {self.name!r}: unknown pixel {ch!r}")
                    cells[key] = legend[ch]
        w = max([self.w] + [x + 1 for x, _ in cells])
        h = max([self.h] + [y + 1 for _, y in cells])
        return Pixmap(w, h, cells, self.name)

    def bbox(self) -> Tuple[int, int, int, int]:
        xs = [x for x, _ in self.cells]
        ys = [y for _, y in self.cells]
        return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def _rows(text: str) -> list:
    lines = text.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    indent = min((len(l) - len(l.lstrip(" ")) for l in lines if l.strip()), default=0)
    return [l[indent:].rstrip() for l in lines]
