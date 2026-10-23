"""Shape rasterisers that land on whole pixels the way a pixel artist would.

Shapes are tested at pixel centres, so a circle centred on a pixel corner
(an even diameter) is as symmetric as one centred on a pixel. One-pixel rings
go through `thin`, which removes the doubled "staircase" pixels that make
rasterised curves look jaggy, the cleanup an artist does by hand.
"""

from __future__ import annotations

import math
from typing import Sequence, Set, Tuple

from .grid import NEIGHBOURS_4, NEIGHBOURS_8, Point

Mask = Set[Point]


def ellipse(cx: float, cy: float, rx: float, ry: float) -> Mask:
    """Pixels whose centres fall inside the ellipse."""
    found: Mask = set()
    for y in range(math.floor(cy - ry) - 1, math.ceil(cy + ry) + 1):
        for x in range(math.floor(cx - rx) - 1, math.ceil(cx + rx) + 1):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                found.add((x, y))
    return found


def disc(cx: float, cy: float, r: float) -> Mask:
    return ellipse(cx, cy, r, r)


def ring(cx: float, cy: float, rx: float, ry: float, thickness: int = 1) -> Mask:
    """The outermost `thickness` pixels of a filled ellipse, measured inwards along the grid."""
    filled = ellipse(cx, cy, rx, ry)
    band: Mask = set()
    frontier = {p for p in filled if any((p[0] + dx, p[1] + dy) not in filled for dx, dy in NEIGHBOURS_4)}
    remaining = filled - frontier
    for _ in range(thickness):
        band |= frontier
        frontier = {p for p in remaining if any((p[0] + dx, p[1] + dy) not in remaining for dx, dy in NEIGHBOURS_4)}
        remaining -= frontier
    return band


def thin(mask: Mask) -> Mask:
    """Removes the inner pixel of every L-shaped corner so a 1 px curve steps cleanly."""
    out = set(mask)
    changed = True
    while changed:
        changed = False
        for x, y in sorted(out):
            for (ax, ay), (bx, by) in (((1, 0), (0, 1)), ((-1, 0), (0, 1)), ((1, 0), (0, -1)), ((-1, 0), (0, -1))):
                a, b = (x + ax, y + ay), (x + bx, y + by)
                diagonal = (x + ax + bx, y + ay + by)
                # (x, y) is the elbow of an L; dropping it keeps the curve connected through the diagonal.
                if a in out and b in out and diagonal not in out and _degree(out, (x, y)) == 2:
                    out.discard((x, y))
                    changed = True
                    break
    return out


def _degree(mask: Mask, p: Point) -> int:
    """How many of the 8 neighbours of `p` are in `mask`."""
    return sum((p[0] + dx, p[1] + dy) in mask for dx, dy in NEIGHBOURS_8)


def arc(mask: Mask, cx: float, cy: float, start_deg: float, end_deg: float) -> Mask:
    """The part of `mask` whose angle around (cx, cy) lies in [start, end), degrees, 0 = right, 90 = down."""
    out: Mask = set()
    for x, y in mask:
        angle = math.degrees(math.atan2(y + 0.5 - cy, x + 0.5 - cx)) % 360
        lo, hi = start_deg % 360, end_deg % 360
        inside = lo <= angle < hi if lo <= hi else angle >= lo or angle < hi
        if inside:
            out.add((x, y))
    return out


def dashed(mask: Mask, cx: float, cy: float, segments: int, duty: float = 0.5, phase: float = 0.0) -> Mask:
    """Even dashes round a ring: `segments` on/off pairs, each on for `duty` of its arc."""
    out: Mask = set()
    for x, y in mask:
        turn = (math.atan2(y + 0.5 - cy, x + 0.5 - cx) / (2 * math.pi) + phase) % 1.0
        if (turn * segments) % 1.0 < duty:
            out.add((x, y))
    return out


def polygon(points: Sequence[Tuple[float, float]]) -> Mask:
    """Pixels whose centres are inside the polygon (even-odd rule)."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    found: Mask = set()
    for y in range(math.floor(min(ys)) - 1, math.ceil(max(ys)) + 1):
        for x in range(math.floor(min(xs)) - 1, math.ceil(max(xs)) + 1):
            if _inside_polygon(x + 0.5, y + 0.5, points):
                found.add((x, y))
    return found


def _inside_polygon(px: float, py: float, points: Sequence[Tuple[float, float]]) -> bool:
    inside = False
    j = len(points) - 1
    for i in range(len(points)):
        xi, yi = points[i]
        xj, yj = points[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def star(cx: float, cy: float, rays: Sequence[Tuple[float, float, float]]) -> Mask:
    """A union of kite-shaped rays radiating from (cx, cy), so a star is described as data rather than pixels.

    Each ray is (angle in degrees, length, half-width): a kite from just behind
    the centre out to the tip, widest at the centre.
    """
    found: Mask = set()
    for angle, length, half_width in rays:
        a = math.radians(angle)
        tip = (cx + math.cos(a) * length, cy + math.sin(a) * length)
        side = (-math.sin(a) * half_width, math.cos(a) * half_width)
        back = (cx - math.cos(a) * half_width * 0.9, cy - math.sin(a) * half_width * 0.9)
        found |= polygon([tip, (cx + side[0], cy + side[1]), back, (cx - side[0], cy - side[1])])
    return found
