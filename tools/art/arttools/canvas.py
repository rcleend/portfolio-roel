"""A tiny named-colour pixel canvas for programmatic tiles and props.

Tiles must repeat exactly, which generated images never guarantee, so they are
drawn here pixel by pixel. Colours are referenced by role names ("ink",
"walk_hi") so a reader sees intent rather than hex, and so a level's palette
is defined once.
"""

from __future__ import annotations

from typing import Mapping, Optional, Sequence

from PIL import Image

from .color import RGB, parse_hex


class Canvas:
    def __init__(self, width: int, height: int, palette: Mapping[str, str]) -> None:
        self.width = width
        self.height = height
        self._palette = {name: parse_hex(value) for name, value in palette.items()}
        self.image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        self._px = self.image.load()

    def color(self, name: str) -> RGB:
        try:
            return self._palette[name]
        except KeyError:
            raise KeyError(f"colour {name!r} is not in this palette") from None

    def set(self, x: int, y: int, name: Optional[str]) -> None:
        """Paint one pixel; ``None`` clears it. Off-canvas writes are clipped."""
        if 0 <= x < self.width and 0 <= y < self.height:
            if name is None:
                self._px[x, y] = (0, 0, 0, 0)
            else:
                r, g, b = self.color(name)
                self._px[x, y] = (r, g, b, 255)

    def get(self, x: int, y: int) -> Optional[RGB]:
        r, g, b, a = self._px[x, y]
        return (r, g, b) if a else None

    def rect(self, x: int, y: int, w: int, h: int, name: Optional[str]) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, name)

    def hline(self, x0: int, x1: int, y: int, name: Optional[str]) -> None:
        """Inclusive horizontal run."""
        for x in range(x0, x1 + 1):
            self.set(x, y, name)

    def vline(self, x: int, y0: int, y1: int, name: Optional[str]) -> None:
        """Inclusive vertical run."""
        for y in range(y0, y1 + 1):
            self.set(x, y, name)

    def checker(self, x: int, y: int, w: int, h: int, a: Optional[str], b: Optional[str]) -> None:
        """A 50% ordered-dither transition between two colours.

        The phase is taken from absolute coordinates so adjacent tiles that
        both dither continue the same pattern across the seam.
        """
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, a if (xx + yy) % 2 == 0 else b)

    def sprite(self, x: int, y: int, rows: Sequence[str], key: Mapping[str, Optional[str]]) -> None:
        """Stamp a character-grid sprite; characters missing from ``key`` are skipped."""
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch in key:
                    self.set(x + dx, y + dy, key[ch])

    def paste(self, other: "Canvas", x: int, y: int) -> None:
        self.image.alpha_composite(other.image, (x, y))
