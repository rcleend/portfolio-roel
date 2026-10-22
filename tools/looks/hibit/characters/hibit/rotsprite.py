"""RotSprite: rotating pixel art without destroying it.

Props are drawn once by hand at 0°; animations hold them at other angles. Plain
nearest-neighbour rotation shreds one-pixel lines, so we use the RotSprite recipe:
upscale 8x with Scale2x (edge-aware, keeps diagonals clean), rotate with nearest
sampling, then sample back down taking the most common colour of each 8x8 block
(weighted towards its centre), which keeps outlines continuous.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from .canvas import Color, Sprite


def scale2x(sprite: Sprite) -> Sprite:
    w, h = sprite.width, sprite.height
    src = sprite.pixels
    out: List[Color] = [None] * (w * 2 * h * 2)

    def at(x: int, y: int) -> Color:
        x = min(w - 1, max(0, x))
        y = min(h - 1, max(0, y))
        return src[y * w + x]

    for y in range(h):
        for x in range(w):
            p = at(x, y)
            a, b, c, d = at(x, y - 1), at(x + 1, y), at(x - 1, y), at(x, y + 1)
            e0 = e1 = e2 = e3 = p
            if c == a and c != d and a != b:
                e0 = a
            if a == b and a != c and b != d:
                e1 = b
            if d == c and d != b and c != a:
                e2 = c
            if b == d and b != a and d != c:
                e3 = d
            ox, oy = x * 2, y * 2
            out[oy * w * 2 + ox] = e0
            out[oy * w * 2 + ox + 1] = e1
            out[(oy + 1) * w * 2 + ox] = e2
            out[(oy + 1) * w * 2 + ox + 1] = e3
    return Sprite(w * 2, h * 2, out)


def rotate(sprite: Sprite, degrees: float, pivot: Tuple[float, float]) -> Tuple[Sprite, Tuple[int, int]]:
    """Rotates counter-clockwise on screen by `degrees` around `pivot` (sprite pixel coords).

    Returns the rotated sprite and the integer position of the pivot inside it, so the
    caller can place the pivot exactly where it belongs.
    """
    if abs(degrees) < 1e-6:
        return sprite, (int(round(pivot[0])), int(round(pivot[1])))
    big = scale2x(scale2x(scale2x(sprite)))
    k = 8
    rad = math.radians(degrees)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    px, py = pivot
    # Output bounds: rotate the sprite's corners around the pivot (screen y points down).
    corners = [(0, 0), (sprite.width, 0), (0, sprite.height), (sprite.width, sprite.height)]
    xs, ys = [], []
    for cx, cy in corners:
        dx, dy = cx - px, cy - py
        xs.append(px + dx * cos_a + dy * sin_a)
        ys.append(py - dx * sin_a + dy * cos_a)
    x0, x1 = int(math.floor(min(xs))) - 1, int(math.ceil(max(xs))) + 1
    y0, y1 = int(math.floor(min(ys))) - 1, int(math.ceil(max(ys))) + 1
    ow, oh = x1 - x0, y1 - y0
    out: List[Color] = [None] * (ow * oh)
    bw = big.width
    for oy in range(oh):
        for ox in range(ow):
            counts: Dict[str, float] = {}
            empty = 0.0
            for sy in range(k):
                for sx in range(k):
                    # Destination sub-sample position in original sprite units.
                    tx = x0 + ox + (sx + 0.5) / k
                    ty = y0 + oy + (sy + 0.5) / k
                    dx, dy = tx - px, ty - py
                    ux = px + dx * cos_a - dy * sin_a
                    uy = py + dx * sin_a + dy * cos_a
                    bx, by = int(math.floor(ux * k)), int(math.floor(uy * k))
                    weight = 1.6 if 2 <= sx <= 5 and 2 <= sy <= 5 else 1.0
                    if 0 <= bx < bw and 0 <= by < big.height:
                        c = big.pixels[by * bw + bx]
                        if c is None:
                            empty += weight
                        else:
                            counts[c] = counts.get(c, 0.0) + weight
                    else:
                        empty += weight
            if counts:
                best, score = max(counts.items(), key=lambda kv: kv[1])
                if score >= empty * 0.9:
                    out[oy * ow + ox] = best
    pivot_out = (int(round(px - x0)), int(round(py - y0)))
    return Sprite(ow, oh, out), pivot_out


def rotated_point(point: Tuple[float, float], pivot: Tuple[float, float], degrees: float) -> Tuple[float, float]:
    """Where `point` (sprite coords) lands after `rotate` around `pivot` (screen, y down)."""
    rad = math.radians(degrees)
    dx, dy = point[0] - pivot[0], point[1] - pivot[1]
    return (pivot[0] + dx * math.cos(rad) + dy * math.sin(rad), pivot[1] - dx * math.sin(rad) + dy * math.cos(rad))


def trim(sprite: Sprite) -> Tuple[Sprite, Tuple[int, int]]:
    b = sprite.bounds()
    if b is None:
        return sprite, (0, 0)
    x0, y0, x1, y1 = b
    pixels: List[Optional[str]] = []
    for y in range(y0, y1):
        pixels.extend(sprite.pixels[y * sprite.width + x0 : y * sprite.width + x1])
    return Sprite(x1 - x0, y1 - y0, pixels), (x0, y0)
