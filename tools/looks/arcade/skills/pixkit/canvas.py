"""The pixel canvas every arcade skill sprite is drawn on.

A ``Sprite`` is a grid of either ``None`` (transparent) or a ``#rrggbb``
string. Drawing is integer-only and every primitive decides pixel coverage by
sampling pixel centres, so shapes come out as crisp clusters without a single
half-covered pixel to tidy up later. Shapes may be centred on half pixels,
which is how even-sized sprites (a 24 px icon, a 16 px orb) stay symmetric.
"""

from __future__ import annotations

import math
from typing import Callable, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Set, Tuple

from PIL import Image

Color = str
Point = Tuple[int, int]
Mask = Set[Point]

FOUR: Tuple[Point, ...] = ((1, 0), (-1, 0), (0, 1), (0, -1))
EIGHT: Tuple[Point, ...] = FOUR + ((1, 1), (1, -1), (-1, 1), (-1, -1))


def parse_hex(value: Color) -> Tuple[int, int, int]:
    text = value.lstrip("#")
    if len(text) != 6:
        raise ValueError(f"expected #rrggbb, got {value!r}")
    return int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16)


def to_hex(rgb: Sequence[int]) -> Color:
    return "#{:02x}{:02x}{:02x}".format(*rgb[:3])


class Sprite:
    """A fixed-size grid of opaque colours and holes."""

    def __init__(self, width: int, height: int) -> None:
        if width <= 0 or height <= 0:
            raise ValueError(f"sprite size must be positive, got {width}x{height}")
        self.width = width
        self.height = height
        self._rows: List[List[Optional[Color]]] = [[None] * width for _ in range(height)]

    # ── Pixels ────────────────────────────────────────────────────────────

    def inside(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def get(self, x: int, y: int) -> Optional[Color]:
        return self._rows[y][x] if self.inside(x, y) else None

    def set(self, x: int, y: int, color: Optional[Color]) -> None:
        """Paints one pixel (``None`` erases it). Writes outside the canvas are clipped."""
        if self.inside(x, y):
            self._rows[y][x] = color

    def opaque(self, x: int, y: int) -> bool:
        return self.get(x, y) is not None

    def pixels(self) -> Iterator[Tuple[int, int, Color]]:
        for y, row in enumerate(self._rows):
            for x, color in enumerate(row):
                if color is not None:
                    yield x, y, color

    def mask(self) -> Mask:
        return {(x, y) for x, y, _ in self.pixels()}

    def colors(self) -> Set[Color]:
        return {color for _, _, color in self.pixels()}

    # ── Primitives ────────────────────────────────────────────────────────

    def rect(self, x: int, y: int, w: int, h: int, color: Optional[Color]) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, color)

    def hline(self, x0: int, x1: int, y: int, color: Optional[Color]) -> None:
        """Inclusive horizontal run, in either direction."""
        for x in range(min(x0, x1), max(x0, x1) + 1):
            self.set(x, y, color)

    def line(self, x0: int, y0: int, x1: int, y1: int, color: Optional[Color]) -> None:
        for x, y in line_points(x0, y0, x1, y1):
            self.set(x, y, color)

    def fill(self, points: Iterable[Point], color: Optional[Color]) -> None:
        for x, y in points:
            self.set(x, y, color)

    def fill_where(
        self, points: Iterable[Point], color: Optional[Color], where: Callable[[Optional[Color]], bool]
    ) -> None:
        """Paints only the pixels whose current colour passes ``where`` (e.g. only over art, only into holes)."""
        for x, y in points:
            if self.inside(x, y) and where(self.get(x, y)):
                self.set(x, y, color)

    def stamp(self, rows: Sequence[str], key: Mapping[str, Optional[Color]], x: int = 0, y: int = 0) -> None:
        """Stamps a character grid. Characters missing from ``key`` (like ``.``) leave the canvas untouched."""
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch in key:
                    self.set(x + dx, y + dy, key[ch])

    def blit(self, other: "Sprite", x: int = 0, y: int = 0) -> None:
        """Draws ``other`` on top: its opaque pixels win."""
        for ox, oy, color in other.pixels():
            self.set(x + ox, y + oy, color)

    def under(self, other: "Sprite", x: int = 0, y: int = 0) -> None:
        """Draws ``other`` behind: it only fills this sprite's holes."""
        for ox, oy, color in other.pixels():
            if self.inside(x + ox, y + oy) and not self.opaque(x + ox, y + oy):
                self.set(x + ox, y + oy, color)

    # ── Whole-sprite operations ───────────────────────────────────────────

    def copy(self) -> "Sprite":
        clone = Sprite(self.width, self.height)
        clone._rows = [list(row) for row in self._rows]
        return clone

    def recolor(self, mapping: Mapping[Color, Optional[Color]]) -> "Sprite":
        clone = Sprite(self.width, self.height)
        clone._rows = [[mapping.get(c, c) if c is not None else None for c in row] for row in self._rows]
        return clone

    def flipped_x(self) -> "Sprite":
        clone = Sprite(self.width, self.height)
        clone._rows = [list(reversed(row)) for row in self._rows]
        return clone

    def outlined(self, color: Color, corners: bool = True) -> "Sprite":
        """Paints every hole that touches art with ``color``: the 1 px rim that makes a sprite read on any backdrop.

        ``corners=False`` skips diagonal-only contacts, which keeps round shapes round
        instead of squaring their outline off at 45 degrees.
        """
        result = self.copy()
        result.fill(outline_of(self.mask(), corners), color)
        return result

    def to_image(self) -> Image.Image:
        image = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        data = image.load()
        cache: Dict[Color, Tuple[int, int, int, int]] = {}
        for x, y, color in self.pixels():
            if color not in cache:
                cache[color] = parse_hex(color) + (255,)
            data[x, y] = cache[color]
        return image

    @classmethod
    def from_image(cls, image: Image.Image) -> "Sprite":
        rgba = image.convert("RGBA")
        sprite = cls(rgba.width, rgba.height)
        data = rgba.load()
        for y in range(rgba.height):
            for x in range(rgba.width):
                r, g, b, a = data[x, y]
                if a:
                    sprite.set(x, y, to_hex((r, g, b)))
        return sprite

    @classmethod
    def from_rows(cls, rows: Sequence[str], key: Mapping[str, Optional[Color]]) -> "Sprite":
        widths = {len(row) for row in rows}
        if len(widths) != 1:
            raise ValueError(f"character grid rows differ in width: {sorted(widths)}")
        sprite = cls(widths.pop(), len(rows))
        unknown = {ch for row in rows for ch in row} - set(key) - {"."}
        if unknown:
            raise ValueError(f"character grid uses keys missing from the palette: {sorted(unknown)}")
        sprite.stamp(rows, key)
        return sprite


# ── Shapes as pixel sets ──────────────────────────────────────────────────


def line_points(x0: int, y0: int, x1: int, y1: int) -> List[Point]:
    """Bresenham's line: the 8-connected run of pixels from one end to the other."""
    points: List[Point] = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    x, y = x0, y0
    while True:
        points.append((x, y))
        if x == x1 and y == y1:
            return points
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x += sx
        if e2 <= dx:
            err += dx
            y += sy


def ellipse(cx: float, cy: float, rx: float, ry: float) -> Mask:
    """Every pixel whose centre lies strictly inside the ellipse; centres may sit on half pixels.

    Strictly: a centre exactly on the curve (which happens at the four tips
    whenever centre and radius line up on the grid) would add a lone pixel,
    the "nub" that makes pixel circles look notched.
    """
    if rx <= 0 or ry <= 0:
        return set()
    points: Mask = set()
    for y in range(math.floor(cy - ry) - 1, math.ceil(cy + ry) + 1):
        for x in range(math.floor(cx - rx) - 1, math.ceil(cx + rx) + 1):
            nx = (x + 0.5 - cx) / rx
            ny = (y + 0.5 - cy) / ry
            if nx * nx + ny * ny < 1.0:
                points.add((x, y))
    return points


def disc(cx: float, cy: float, r: float) -> Mask:
    return ellipse(cx, cy, r, r)


def polygon(vertices: Sequence[Tuple[float, float]]) -> Mask:
    """Scanline fill sampling pixel centres (even-odd rule)."""
    points: Mask = set()
    if len(vertices) < 3:
        return points
    ys = [vy for _, vy in vertices]
    for y in range(math.floor(min(ys)) - 1, math.ceil(max(ys)) + 1):
        sample = y + 0.5
        crossings: List[float] = []
        for (ax, ay), (bx, by) in zip(vertices, list(vertices[1:]) + [vertices[0]]):
            if (ay <= sample < by) or (by <= sample < ay):
                crossings.append(ax + (sample - ay) * (bx - ax) / (by - ay))
        crossings.sort()
        for left, right in zip(crossings[0::2], crossings[1::2]):
            for x in range(math.ceil(left - 0.5), math.floor(right - 0.5) + 1):
                points.add((x, y))
    return points


def outline_of(shape: Mask, corners: bool = True) -> Mask:
    """The ring of empty pixels hugging ``shape`` from outside."""
    offsets = EIGHT if corners else FOUR
    return {(x + dx, y + dy) for x, y in shape for dx, dy in offsets} - shape


def edge_of(shape: Mask) -> Mask:
    """The pixels of ``shape`` that touch the outside (4-neighbourhood): its inner rim."""
    return {(x, y) for x, y in shape if any((x + dx, y + dy) not in shape for dx, dy in FOUR)}


def thin_corners(path: Mask) -> Mask:
    """Removes the redundant elbow pixels of a 1 px stroke so diagonals stay single steps.

    An elbow touches one stroke pixel horizontally and one vertically, and
    nothing else: those two still touch diagonally without it, and with it the
    stroke looks doubled ("jaggy").
    """
    result = set(path)
    for x, y in sorted(path):
        if _is_elbow(result, x, y):
            result.discard((x, y))
    return result


def _is_elbow(stroke: Mask, x: int, y: int) -> bool:
    neighbours = {(x + ox, y + oy) for ox, oy in EIGHT} & stroke
    return any(neighbours == {(x + hx, y), (x, y + vy)} for hx in (-1, 1) for vy in (-1, 1))


def ring(cx: float, cy: float, rx: float, ry: float, thickness: int = 1) -> Mask:
    """An ellipse outline ``thickness`` pixels wide, grown inwards from the filled shape's edge."""
    shape = ellipse(cx, cy, rx, ry)
    band: Mask = set()
    for _ in range(thickness):
        rim = edge_of(shape)
        band |= rim
        shape -= rim
    return band


def arc(cx: float, cy: float, rx: float, ry: float, start: float, end: float) -> Mask:
    """A clean 1 px elliptical arc from ``start`` to ``end`` degrees (0 = right, 90 = down).

    Points are walked at sub-pixel steps, joined with Bresenham runs and then
    thinned, so the arc is 8-connected with single-pixel steps at any radius.
    """
    if end < start:
        start, end = end, start
    steps = max(8, int(math.ceil((end - start) / 360.0 * 2 * math.pi * max(rx, ry) * 3)))
    points: List[Point] = []
    for i in range(steps + 1):
        angle = math.radians(start + (end - start) * i / steps)
        point = (math.floor(cx + rx * math.cos(angle)), math.floor(cy + ry * math.sin(angle)))
        if not points or points[-1] != point:
            points.append(point)
    path: Mask = set()
    for a, b in zip(points, points[1:]):
        path.update(line_points(a[0], a[1], b[0], b[1]))
    if len(points) == 1:
        path.add(points[0])
    return thin_corners(path)
