"""Native-resolution pixel canvases with a depth plane, and hand-authored pixel sprites.

A `Canvas` holds opaque hex colours or None (transparent) plus a z value per pixel, so
hand-drawn layers (the likeness head, props, hands) can be composited into a rendered
body with correct overlap: a forearm in front of the guitar, the hood behind the head.
"""

from __future__ import annotations

import textwrap
from dataclasses import dataclass
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from PIL import Image

Color = Optional[str]
EMPTY_Z = -1e9


def hex_to_rgba(color: str) -> Tuple[int, int, int, int]:
    c = color.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)


def rgba_to_hex(rgba: Sequence[int]) -> str:
    return "#%02x%02x%02x" % (rgba[0], rgba[1], rgba[2])


@dataclass
class Sprite:
    """A small hand-authored image: rows of palette keys, '.' transparent."""

    width: int
    height: int
    pixels: List[Color]

    @staticmethod
    def parse(rows: str, palette: Mapping[str, str]) -> "Sprite":
        lines = [line for line in textwrap.dedent(rows).strip("\n").split("\n")]
        lines = [line.rstrip() for line in lines]
        width = max(len(line) for line in lines)
        pixels: List[Color] = []
        for line in lines:
            for ch in line.ljust(width, "."):
                if ch in (".", " "):
                    pixels.append(None)
                elif ch in palette:
                    pixels.append(palette[ch])
                else:
                    raise ValueError(f"unknown palette key {ch!r} in sprite row {line!r}")
        return Sprite(width, len(lines), pixels)

    def at(self, x: int, y: int) -> Color:
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.pixels[y * self.width + x]
        return None

    def flipped(self) -> "Sprite":
        out: List[Color] = []
        for y in range(self.height):
            row = self.pixels[y * self.width : (y + 1) * self.width]
            out.extend(reversed(row))
        return Sprite(self.width, self.height, out)

    def recolored(self, mapping: Mapping[str, str]) -> "Sprite":
        return Sprite(self.width, self.height, [mapping.get(p, p) if p else None for p in self.pixels])

    def over(self, other: "Sprite", x: int = 0, y: int = 0) -> "Sprite":
        """`other` drawn on top of a copy of this sprite at (x, y)."""
        out = list(self.pixels)
        for sy in range(other.height):
            for sx in range(other.width):
                c = other.pixels[sy * other.width + sx]
                tx, ty = x + sx, y + sy
                if c and 0 <= tx < self.width and 0 <= ty < self.height:
                    out[ty * self.width + tx] = c
        return Sprite(self.width, self.height, out)

    def bounds(self) -> Optional[Tuple[int, int, int, int]]:
        xs = [i % self.width for i, p in enumerate(self.pixels) if p]
        ys = [i // self.width for i, p in enumerate(self.pixels) if p]
        if not xs:
            return None
        return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)

    def to_image(self) -> Image.Image:
        img = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        img.putdata([hex_to_rgba(p) if p else (0, 0, 0, 0) for p in self.pixels])
        return img

    @staticmethod
    def from_image(img: Image.Image) -> "Sprite":
        img = img.convert("RGBA")
        data = list(img.getdata())
        return Sprite(img.width, img.height, [rgba_to_hex(p) if p[3] >= 128 else None for p in data])


class Canvas:
    """A frame being assembled: colours plus a depth plane for z-tested compositing."""

    def __init__(self, width: int = 64, height: int = 64) -> None:
        self.width = width
        self.height = height
        self.pixels: List[Color] = [None] * (width * height)
        self.depth: List[float] = [EMPTY_Z] * (width * height)
        #: Which layer produced each pixel (e.g. 'body', 'head', 'prop'), for cleanup rules.
        self.layer: List[Optional[str]] = [None] * (width * height)

    def get(self, x: int, y: int) -> Color:
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.pixels[y * self.width + x]
        return None

    def z(self, x: int, y: int) -> float:
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.depth[y * self.width + x]
        return EMPTY_Z

    def set(self, x: int, y: int, color: Color, z: float = 0.0, layer: Optional[str] = None) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            i = y * self.width + x
            self.pixels[i] = color
            self.depth[i] = z if color else EMPTY_Z
            self.layer[i] = layer if color else None

    def stamp(
        self,
        sprite: Sprite,
        x: int,
        y: int,
        z: Optional[float] = None,
        layer: str = "sprite",
        behind: bool = False,
    ) -> None:
        """Draws `sprite` with its top-left at (x, y).

        With `z`, each pixel is depth-tested against what is already there (nearer wins).
        With `behind`, pixels only fill empty cells.
        """
        for sy in range(sprite.height):
            ty = y + sy
            if ty < 0 or ty >= self.height:
                continue
            for sx in range(sprite.width):
                c = sprite.pixels[sy * sprite.width + sx]
                if not c:
                    continue
                tx = x + sx
                if tx < 0 or tx >= self.width:
                    continue
                i = ty * self.width + tx
                had = self.pixels[i] is not None
                if behind and had:
                    continue
                if z is not None and had and self.depth[i] > z:
                    continue
                self.pixels[i] = c
                if z is not None:
                    self.depth[i] = z
                elif not had:
                    self.depth[i] = 0.0
                self.layer[i] = layer

    def to_sprite(self) -> Sprite:
        return Sprite(self.width, self.height, list(self.pixels))

    def to_image(self) -> Image.Image:
        return self.to_sprite().to_image()

    def colors(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for p in self.pixels:
            if p:
                counts[p] = counts.get(p, 0) + 1
        return counts


def neighbors4(x: int, y: int) -> Iterable[Tuple[int, int]]:
    yield x - 1, y
    yield x + 1, y
    yield x, y - 1
    yield x, y + 1


def neighbors8(x: int, y: int) -> Iterable[Tuple[int, int]]:
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                yield x + dx, y + dy
