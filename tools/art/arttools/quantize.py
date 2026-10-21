"""Palette reduction: adaptive k-colour palettes or a supplied palette,
with optional ordered (Bayer) dithering. Error diffusion is deliberately not
offered: it produces the crawling noise that real 16-bit art never had."""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence

from PIL import Image

from .color import RGB, nearest

# Bayer threshold maps, normalised to the range [-0.5, 0.5).
_BAYER_2 = [[0, 2], [3, 1]]
_BAYER_4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def _bayer(size: int) -> List[List[float]]:
    if size == 2:
        base = _BAYER_2
    elif size == 4:
        base = _BAYER_4
    else:
        raise ValueError("ordered dithering supports bayer2 or bayer4")
    n = size * size
    return [[(v + 0.5) / n - 0.5 for v in row] for row in base]


def adaptive_palette(image: Image.Image, colors: int) -> List[RGB]:
    """Pick ``colors`` representative colours from the opaque pixels only.

    Transparent pixels are excluded so a mostly-empty layer does not waste
    palette entries on whatever colour sits under alpha 0.
    """
    opaque = [(r, g, b) for r, g, b, a in image.convert("RGBA").getdata() if a]
    if not opaque:
        return []
    strip = Image.new("RGB", (len(opaque), 1))
    strip.putdata(opaque)
    reduced = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    raw = reduced.getpalette() or []
    used = sorted(set(reduced.getdata()))
    return [(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]) for i in used]


def map_to_palette(
    image: Image.Image,
    palette: Sequence[RGB],
    dither: Optional[str] = None,
    strength: float = 24.0,
) -> Image.Image:
    """Map every opaque pixel to its nearest palette colour.

    ``dither`` is ``None``, ``"bayer2"`` or ``"bayer4"``; ``strength`` is the
    RGB offset at the extremes of the threshold map. Small strengths only
    dither where a gradient genuinely falls between two palette entries.
    """
    if not palette:
        return image.convert("RGBA").copy()
    rgba = image.convert("RGBA")
    w, h = rgba.size
    matrix = _bayer(2 if dither == "bayer2" else 4) if dither else None
    cache: Dict[tuple, RGB] = {}
    src = rgba.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                dst[x, y] = (0, 0, 0, 0)
                continue
            if matrix is not None:
                offset = matrix[y % len(matrix)][x % len(matrix)] * strength
                key = (_clamp(r + offset), _clamp(g + offset), _clamp(b + offset))
            else:
                key = (r, g, b)
            hit = cache.get(key)
            if hit is None:
                hit = nearest(key, palette)
                cache[key] = hit
            dst[x, y] = (hit[0], hit[1], hit[2], 255)
    return out


def quantize(image: Image.Image, colors: int, dither: Optional[str] = None, strength: float = 24.0) -> Image.Image:
    return map_to_palette(image, adaptive_palette(image, colors), dither, strength)


def used_colors(image: Image.Image) -> List[RGB]:
    found = {(r, g, b) for r, g, b, a in image.convert("RGBA").getdata() if a}
    return sorted(found)


def despeckle(image: Image.Image) -> Image.Image:
    """Replace pixels whose colour none of their 4-neighbours share.

    After quantisation, lone off-colour pixels are almost always averaging
    noise rather than intent; hand-placed pixel art clusters its colours.
    Pixels inside a deliberate ordered-dither pattern also have no matching
    4-neighbour, so run this before dithering-heavy layers only when wanted.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    src = rgba.load()
    out = rgba.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            if p[3] == 0:
                continue
            around = [src[nx, ny] for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)) if 0 <= nx < w and 0 <= ny < h]
            opaque = [q for q in around if q[3]]
            if len(opaque) < 3 or any(q == p for q in opaque):
                continue
            counts: Dict[tuple, int] = {}
            for q in opaque:
                counts[q] = counts.get(q, 0) + 1
            dst[x, y] = max(counts.items(), key=lambda item: item[1])[0]
    return out


def _clamp(v: float) -> int:
    return 0 if v < 0 else 255 if v > 255 else int(v)
