"""Colour grading so layers from separate generations share one light.

Each layer is graded towards the level's ambient colour by its depth:
distant layers get more haze and less saturation, which both sells depth and
keeps the play plane the most saturated thing on screen.
"""

from __future__ import annotations

from typing import Optional

from PIL import Image, ImageEnhance

from .color import RGB


def grade(
    image: Image.Image,
    saturation: float = 1.0,
    brightness: float = 1.0,
    contrast: float = 1.0,
    tint: Optional[RGB] = None,
    tint_amount: float = 0.0,
) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    rgb = rgba.convert("RGB")
    if saturation != 1.0:
        rgb = ImageEnhance.Color(rgb).enhance(saturation)
    if contrast != 1.0:
        rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    if brightness != 1.0:
        rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    if tint is not None and tint_amount > 0:
        rgb = Image.blend(rgb, Image.new("RGB", rgb.size, tint), tint_amount)
    result = rgb.convert("RGBA")
    result.putalpha(alpha)
    return result


def sharpen(image: Image.Image, amount: float = 1.6) -> Image.Image:
    """Sharpen colour only; area averaging leaves soft transitions that would
    otherwise quantise into muddy in-between colours."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    rgb = ImageEnhance.Sharpness(bleed(rgba).convert("RGB")).enhance(amount)
    result = rgb.convert("RGBA")
    result.putalpha(alpha)
    return result


def bleed(image: Image.Image, passes: int = 2) -> Image.Image:
    """Copy edge colours outward into transparent pixels (alpha unchanged).

    Filters that look at neighbours would otherwise see the black stored under
    alpha 0 and paint dark or bright halos onto the silhouette.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    src = rgba.copy()
    known = [[src.getpixel((x, y))[3] > 0 for x in range(w)] for y in range(h)]
    px = src.load()
    for _ in range(passes):
        fills = []
        for y in range(h):
            for x in range(w):
                if known[y][x]:
                    continue
                donors = [px[nx, ny] for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                          if 0 <= nx < w and 0 <= ny < h and known[ny][nx]]
                if donors:
                    n = len(donors)
                    fills.append((x, y, (sum(d[0] for d in donors) // n, sum(d[1] for d in donors) // n,
                                         sum(d[2] for d in donors) // n, 0)))
        for x, y, c in fills:
            px[x, y] = c
            known[y][x] = True
    return src
