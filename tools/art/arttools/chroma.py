"""Chroma keying against a flat magenta background, with edge cleanup.

Image generators paint "#FF00FF" backgrounds as almost-flat fields whose
anti-aliased borders blend art and magenta. Three passes remove them without
eating legitimate purples inside the art:

1. ``key_mask`` marks pixels close to the key colour.
2. ``grow_into_fringe`` extends the mask only into magenta-tinted pixels that
   touch it, which is exactly where the blended fringe lives.
3. After downsampling, ``despill_edges`` repaints any remaining magenta-tinted
   pixel on the one-pixel silhouette edge from its opaque interior neighbours.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

from PIL import Image

from .color import RGB


def _is_magenta_tinted(r: int, g: int, b: int, margin: int) -> bool:
    # Magenta spill raises red and blue together above green; requiring both
    # channels to be balanced keeps reds, pinks and blues out of the test.
    low = min(r, b)
    return low - g > margin and abs(r - b) < max(r, b) * 0.45


def key_mask(image: Image.Image, key: RGB, tolerance: float) -> bytearray:
    """Return a mask (1 = background) of pixels within ``tolerance`` of ``key``."""
    tol_sq = tolerance * tolerance
    kr, kg, kb = key
    mask = bytearray(image.width * image.height)
    for i, (r, g, b, a) in enumerate(image.convert("RGBA").getdata()):
        if a == 0:
            mask[i] = 1
            continue
        dr, dg, db = r - kr, g - kg, b - kb
        if dr * dr + dg * dg + db * db <= tol_sq:
            mask[i] = 1
    return mask


def grow_into_fringe(image: Image.Image, mask: bytearray, iterations: int, margin: int = 24) -> bytearray:
    """Grow the background mask into adjacent magenta-tinted fringe pixels."""
    w, h = image.size
    pixels = list(image.convert("RGBA").getdata())
    grown = bytearray(mask)
    for _ in range(iterations):
        additions: List[int] = []
        for y in range(h):
            row = y * w
            for x in range(w):
                i = row + x
                if grown[i]:
                    continue
                touches = (
                    (x > 0 and grown[i - 1])
                    or (x < w - 1 and grown[i + 1])
                    or (y > 0 and grown[i - w])
                    or (y < h - 1 and grown[i + w])
                )
                if not touches:
                    continue
                r, g, b, _ = pixels[i]
                if _is_magenta_tinted(r, g, b, margin):
                    additions.append(i)
        if not additions:
            break
        for i in additions:
            grown[i] = 1
    return grown


def apply_mask(image: Image.Image, mask: bytearray) -> Image.Image:
    rgba = image.convert("RGBA")
    data = [(0, 0, 0, 0) if mask[i] else px for i, px in enumerate(rgba.getdata())]
    result = Image.new("RGBA", rgba.size)
    result.putdata(data)
    return result


def chroma_key(image: Image.Image, key: RGB, tolerance: float = 90.0, fringe_iterations: int = 3) -> Image.Image:
    """Make ``key``-coloured background transparent at source resolution."""
    rgba = image.convert("RGBA")
    mask = key_mask(rgba, key, tolerance)
    mask = grow_into_fringe(rgba, mask, fringe_iterations)
    return apply_mask(rgba, mask)


def _neighbours(x: int, y: int, w: int, h: int) -> Sequence[Tuple[int, int]]:
    return [(nx, ny) for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)) if 0 <= nx < w and 0 <= ny < h]


def despill_edges(image: Image.Image, margin: int = 12) -> Image.Image:
    """Repaint magenta-tinted silhouette-edge pixels from their interior neighbours.

    Expects binary alpha. Only pixels that touch transparency are considered, so
    deliberate purples and pinks inside the art are untouched.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    out = rgba.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or not _is_magenta_tinted(r, g, b, margin):
                continue
            around = _neighbours(x, y, w, h)
            if not any(px[nx, ny][3] == 0 for nx, ny in around):
                continue
            donors = [px[nx, ny] for nx, ny in around if px[nx, ny][3] and not _is_magenta_tinted(*px[nx, ny][:3], margin)]
            if donors:
                n = len(donors)
                opx[x, y] = (
                    sum(d[0] for d in donors) // n,
                    sum(d[1] for d in donors) // n,
                    sum(d[2] for d in donors) // n,
                    255,
                )
            else:
                # Nothing trustworthy to borrow from: drop the tint by pulling
                # red and blue down to just above green.
                cap = g + margin
                opx[x, y] = (min(r, cap), g, min(b, cap), 255)
    return out


def remove_specks(image: Image.Image, min_neighbours: int = 1) -> Image.Image:
    """Clear isolated opaque pixels and fill one-pixel holes in the silhouette.

    Downsampling leaves stray single pixels where the source had soft fog or
    sparkles against the key; at native resolution they read as dirt.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    out = rgba.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            around = _neighbours(x, y, w, h)
            opaque = [px[nx, ny] for nx, ny in around if px[nx, ny][3]]
            if px[x, y][3] and len(opaque) < min_neighbours:
                opx[x, y] = (0, 0, 0, 0)
            elif not px[x, y][3] and len(opaque) == len(around) == 4:
                n = len(opaque)
                opx[x, y] = (
                    sum(p[0] for p in opaque) // n,
                    sum(p[1] for p in opaque) // n,
                    sum(p[2] for p in opaque) // n,
                    255,
                )
    return out
