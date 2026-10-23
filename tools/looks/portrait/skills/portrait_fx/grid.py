"""A pixel grid that holds palette colours, never blends, and never resamples.

Every frame of the portrait skill art is built on a `Grid`: a fixed-size
array of `#rrggbb` strings (or `None` for a transparent pixel). Nothing here
mixes colours or produces partial alpha, so whatever is drawn is already
legal native-resolution pixel art; the sheet writer only has to pack it.
"""

from __future__ import annotations

from typing import Callable, Iterable, Iterator, List, Mapping, Optional, Sequence, Set, Tuple

from PIL import Image

Color = Optional[str]
Point = Tuple[int, int]

# The 8 neighbours, and the 4 that share an edge.
NEIGHBOURS_8: Tuple[Point, ...] = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))
NEIGHBOURS_4: Tuple[Point, ...] = ((0, -1), (-1, 0), (1, 0), (0, 1))


def _check_color(color: Color) -> Color:
    if color is not None and (len(color) != 7 or not color.startswith("#")):
        raise ValueError(f"expected '#rrggbb' or None, got {color!r}")
    return color.lower() if color else None


class Grid:
    """A `width` x `height` canvas of palette colours. Off-canvas writes are clipped."""

    def __init__(self, width: int, height: int) -> None:
        if width <= 0 or height <= 0:
            raise ValueError(f"grid size must be positive, got {width}x{height}")
        self.width = width
        self.height = height
        self._px: List[Color] = [None] * (width * height)

    # ── Pixels ────────────────────────────────────────────────────────────

    def inside(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def get(self, x: int, y: int) -> Color:
        return self._px[y * self.width + x] if self.inside(x, y) else None

    def set(self, x: int, y: int, color: Color) -> None:
        if self.inside(x, y):
            self._px[y * self.width + x] = _check_color(color)

    def opaque(self, x: int, y: int) -> bool:
        return self.get(x, y) is not None

    def points(self) -> Iterator[Point]:
        """Every opaque pixel, row by row."""
        for y in range(self.height):
            for x in range(self.width):
                if self._px[y * self.width + x] is not None:
                    yield (x, y)

    def colors(self) -> Set[str]:
        return {c for c in self._px if c is not None}

    # ── Drawing ───────────────────────────────────────────────────────────

    def rect(self, x: int, y: int, w: int, h: int, color: Color) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, color)

    def hline(self, x0: int, x1: int, y: int, color: Color) -> None:
        """Inclusive horizontal run, in either direction."""
        for x in range(min(x0, x1), max(x0, x1) + 1):
            self.set(x, y, color)

    def vline(self, x: int, y0: int, y1: int, color: Color) -> None:
        """Inclusive vertical run, in either direction."""
        for y in range(min(y0, y1), max(y0, y1) + 1):
            self.set(x, y, color)

    def line(self, x0: int, y0: int, x1: int, y1: int, color: Color) -> None:
        """A one-pixel Bresenham line, endpoints included."""
        for x, y in bresenham(x0, y0, x1, y1):
            self.set(x, y, color)

    def plot(self, points: Iterable[Point], color: Color) -> None:
        for x, y in points:
            self.set(x, y, color)

    def stamp(self, x: int, y: int, rows: Sequence[str], key: Mapping[str, Color]) -> None:
        """Paints character art: each character found in `key` sets one pixel, all others are skipped."""
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch in key:
                    self.set(x + dx, y + dy, key[ch])

    def paste(self, other: "Grid", x: int = 0, y: int = 0) -> None:
        """Copies every opaque pixel of `other` with its top-left at (x, y)."""
        for px, py in other.points():
            self.set(x + px, y + py, other.get(px, py))

    def recolor(self, mapping: Mapping[str, Color]) -> "Grid":
        """A copy with colours swapped through `mapping` (unlisted colours are kept)."""
        out = self.copy()
        out._px = [mapping.get(c, c) if c is not None else None for c in out._px]
        return out

    def map(self, fn: Callable[[int, int, str], Color]) -> "Grid":
        """A copy with every opaque pixel replaced by `fn(x, y, color)`."""
        out = Grid(self.width, self.height)
        for x, y in self.points():
            out.set(x, y, fn(x, y, self.get(x, y) or ""))
        return out

    # ── Silhouette passes ─────────────────────────────────────────────────

    def outline(self, color: str, corners: bool = True, where: Optional[Callable[[int, int], bool]] = None) -> "Grid":
        """Rims the art with one pixel of `color` outside the silhouette.

        `corners=False` leaves diagonal-only neighbours empty, which keeps small
        round shapes round instead of squaring them off. `where(x, y)` can
        restrict the rim to part of the silhouette (a selective outline).
        """
        out = self.copy()
        offsets = NEIGHBOURS_8 if corners else NEIGHBOURS_4
        for y in range(self.height):
            for x in range(self.width):
                if self.opaque(x, y) or (where is not None and not where(x, y)):
                    continue
                if any(self.opaque(x + dx, y + dy) for dx, dy in offsets):
                    out.set(x, y, color)
        return out

    # ── Transforms ────────────────────────────────────────────────────────

    def copy(self) -> "Grid":
        out = Grid(self.width, self.height)
        out._px = list(self._px)
        return out

    # ── Export ────────────────────────────────────────────────────────────

    def to_image(self) -> Image.Image:
        image = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        pixels = image.load()
        for x, y in self.points():
            hex_color = self.get(x, y) or ""
            pixels[x, y] = (int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16), 255)
        return image


def bresenham(x0: int, y0: int, x1: int, y1: int) -> List[Point]:
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    points = []
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


def rows(text: str) -> List[str]:
    """Character art from an indented block: blank lines dropped, common indentation removed."""
    lines = [line for line in text.split("\n") if line.strip()]
    indent = min(len(line) - len(line.lstrip()) for line in lines)
    return [line[indent:].rstrip() for line in lines]
