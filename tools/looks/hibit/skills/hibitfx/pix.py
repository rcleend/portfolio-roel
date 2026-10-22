"""A tiny pixel canvas: whole-pixel primitives over exact palette colours.

Every pixel is either transparent (``None``) or one ``#rrggbb`` colour, so
anything drawn here is binary-alpha and palette-exact by construction: no
blending, no anti-aliasing, nothing to quantise afterwards. The primitives
mirror the engine's ``Gfx`` (midpoint circles, Bresenham lines, Bayer
thresholds) so a mock-up drawn here matches what Phase B code draws in game.
"""

from __future__ import annotations

import math
from typing import Callable, Iterator, List, Mapping, Optional, Sequence, Tuple

from PIL import Image

Color = Optional[str]
Point = Tuple[int, int]

BAYER_2 = (0, 2, 3, 1)
BAYER_4 = (0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)


def bayer(x: int, y: int, size: int = 4) -> float:
    """The engine's ordered-dither threshold in [0, 1) for pixel (x, y)."""
    matrix = BAYER_4 if size == 4 else BAYER_2
    return matrix[(y % size) * size + (x % size)] / (size * size)


def dither_on(x: int, y: int, coverage: float, size: int = 4) -> bool:
    """True when pixel (x, y) takes the second colour at ``coverage`` (engine ``ditherOn``)."""
    return coverage > bayer(x, y, size)


def parse_hex(color: str) -> Tuple[int, int, int]:
    value = color.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def to_hex(rgb: Sequence[int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*(max(0, min(255, int(round(v)))) for v in rgb[:3]))


def mix(a: str, b: str, t: float) -> str:
    """Linear RGB mix, used only to *derive palette entries* at authoring time, never per pixel."""
    ra, ga, ba = parse_hex(a)
    rb, gb, bb = parse_hex(b)
    return to_hex((ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t))


def midpoint_circle(cx: int, cy: int, r: int) -> List[Point]:
    """The engine's midpoint circle outline (``Gfx.circle(..., filled=false)``), deduplicated."""
    points: List[Point] = []
    seen = set()
    x, y, err = r, 0, 1 - r
    while x >= y:
        for px, py in ((x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)):
            p = (cx + px, cy + py)
            if p not in seen:
                seen.add(p)
                points.append(p)
        y += 1
        if err < 0:
            err += 2 * y + 1
        else:
            x -= 1
            err += 2 * (y - x) + 1
    return points


def bresenham(x0: int, y0: int, x1: int, y1: int) -> List[Point]:
    points: List[Point] = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        points.append((x0, y0))
        if x0 == x1 and y0 == y1:
            return points
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


class Canvas:
    """A w × h grid of palette colours; ``None`` is transparent."""

    def __init__(self, w: int, h: int) -> None:
        self.w = w
        self.h = h
        self.px: List[Color] = [None] * (w * h)

    # ── access ──────────────────────────────────────────────────────────

    def inside(self, x: int, y: int) -> bool:
        return 0 <= x < self.w and 0 <= y < self.h

    def get(self, x: int, y: int) -> Color:
        return self.px[y * self.w + x] if self.inside(x, y) else None

    def set(self, x: int, y: int, color: Color) -> None:
        """Paints one pixel; ``None`` is a no-op (use ``erase`` to clear)."""
        if color is not None and self.inside(x, y):
            self.px[y * self.w + x] = color

    def opaque(self, x: int, y: int) -> bool:
        return self.get(x, y) is not None

    def points(self) -> Iterator[Tuple[int, int, str]]:
        for y in range(self.h):
            for x in range(self.w):
                c = self.px[y * self.w + x]
                if c is not None:
                    yield x, y, c

    def colors(self) -> set:
        return {c for c in self.px if c is not None}

    def bbox(self) -> Optional[Tuple[int, int, int, int]]:
        """(left, top, right, bottom) inclusive, or None when empty."""
        xs = [x for x, _, _ in self.points()]
        ys = [y for _, y, _ in self.points()]
        if not xs:
            return None
        return min(xs), min(ys), max(xs), max(ys)

    def copy(self) -> "Canvas":
        out = Canvas(self.w, self.h)
        out.px = list(self.px)
        return out

    # ── primitives ──────────────────────────────────────────────────────

    def rect(self, x: int, y: int, w: int, h: int, color: Color) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, color)

    def line(self, x0: int, y0: int, x1: int, y1: int, color: Color) -> None:
        for x, y in bresenham(x0, y0, x1, y1):
            self.set(x, y, color)

    def disc(self, cx: float, cy: float, r: float, color: Color, where: Optional[Callable[[int, int], bool]] = None) -> None:
        """Filled disc by pixel-centre distance; fractional centres give even diameters."""
        for y in range(int(math.floor(cy - r - 1)), int(math.ceil(cy + r + 1)) + 1):
            for x in range(int(math.floor(cx - r - 1)), int(math.ceil(cx + r + 1)) + 1):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r and (where is None or where(x, y)):
                    self.set(x, y, color)

    def stamp(self, rows: Sequence[str], legend: Mapping[str, Color], dx: int = 0, dy: int = 0, flip: bool = False) -> None:
        """Paints a text sprite; characters missing from the legend (and '.') are transparent."""
        for y, row in enumerate(rows):
            n = len(row)
            for x, ch in enumerate(row):
                color = legend.get(ch)
                if color is not None:
                    self.set(dx + (n - 1 - x if flip else x), dy + y, color)

    def blit(self, other: "Canvas", dx: int = 0, dy: int = 0, flip: bool = False) -> None:
        for x, y, c in other.points():
            self.set(dx + (other.w - 1 - x if flip else x), dy + y, c)

    # ── whole-canvas operations ─────────────────────────────────────────

    def recolor(self, mapping: Mapping[str, Color]) -> "Canvas":
        out = Canvas(self.w, self.h)
        out.px = [mapping.get(c, c) if c is not None else None for c in self.px]
        return out

    def shifted(self, dx: int, dy: int) -> "Canvas":
        out = Canvas(self.w, self.h)
        out.blit(self, dx, dy)
        return out

    def outline(self, color: str, diagonals: bool = False, only: Optional[Callable[[int, int], bool]] = None) -> "Canvas":
        """Adds a 1 px ring around the opaque silhouette (outside it)."""
        out = self.copy()
        steps = ((1, 0), (-1, 0), (0, 1), (0, -1))
        if diagonals:
            steps += ((1, 1), (1, -1), (-1, 1), (-1, -1))
        for y in range(self.h):
            for x in range(self.w):
                if self.opaque(x, y):
                    continue
                if any(self.opaque(x + sx, y + sy) for sx, sy in steps) and (only is None or only(x, y)):
                    out.set(x, y, color)
        return out

    def to_image(self) -> Image.Image:
        image = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        data = [(0, 0, 0, 0) if c is None else parse_hex(c) + (255,) for c in self.px]
        image.putdata(data)
        return image

    @staticmethod
    def from_rows(rows: Sequence[str], legend: Mapping[str, Color]) -> "Canvas":
        width = max(len(r) for r in rows)
        canvas = Canvas(width, len(rows))
        canvas.stamp(rows, legend)
        return canvas


def rows(art: str) -> List[str]:
    """Splits a triple-quoted sprite into rows, dropping blank edges and indentation."""
    lines = [line.strip() for line in art.strip("\n").splitlines()]
    return [line for line in lines if line]


def polar(cx: float, cy: float, radius: float, angle: float) -> Point:
    """Whole-pixel point at ``angle`` radians (0 = right, positive = clockwise on screen)."""
    return int(round(cx + math.cos(angle) * radius)), int(round(cy + math.sin(angle) * radius))

