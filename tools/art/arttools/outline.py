"""Silhouette outlines: the single cheapest trick that makes downsampled
art read as hand-placed sprites rather than shrunken paintings."""

from __future__ import annotations

from typing import Optional

from PIL import Image

from .color import RGB


def add_outline(image: Image.Image, color: Optional[RGB] = None, darken: float = 0.45) -> Image.Image:
    """Recolour the outermost opaque pixel ring.

    The outline is drawn inside the silhouette so sizes stay exact. With no
    explicit colour each edge pixel is darkened in place, which keeps the hue
    (a selective outline, as Neo Geo artists used) instead of a flat black line.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    src = rgba.load()
    out = rgba.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            # The image border is not a silhouette edge for strips that tile or
            # sit on the ground line, so only transparent neighbours count.
            edge = any(0 <= nx < w and 0 <= ny < h and src[nx, ny][3] == 0
                       for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
            if not edge:
                continue
            if color is not None:
                dst[x, y] = (color[0], color[1], color[2], 255)
            else:
                dst[x, y] = (int(r * darken), int(g * darken), int(b * darken), 255)
    return out
