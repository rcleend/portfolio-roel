"""Procedural shapes rasterised straight to key grids: limbs, smears, blobs.

Limbs are chains of tapered capsules sampled at pixel centres (no
anti-aliasing to clean up afterwards). Each pixel is cel shaded from a
cylinder normal against the look's top-left light, quantised to the four ramp
keys `a` (highlight) `b` (light) `c` (mid) `d` (shadow), and the shape's own
rim becomes `o` for the compositor to resolve.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .grid import SOFT_OUTLINE, Grid, Point

Vec = Tuple[float, float]

# Top left, a little towards the viewer. Normalised in `_shade`.
LIGHT = (-0.55, -0.8, 0.55)
NEIGHBOURS = ((1, 0), (-1, 0), (0, 1), (0, -1))


@dataclass(frozen=True)
class Bone:
    """One capsule: from `a` to `b` with radii `ra` and `rb` (in pixels, rim included)."""

    a: Vec
    b: Vec
    ra: float
    rb: float


@dataclass(frozen=True)
class Bands:
    """Light thresholds for the four tones; tune per material (cloth is flatter than skin)."""

    hi: float = 0.86
    light: float = 0.52
    mid: float = 0.12


DEFAULT_BANDS = Bands()


def _closest(p: Vec, bone: Bone) -> Tuple[float, float, Vec]:
    ax, ay = bone.a
    bx, by = bone.b
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / length2))
    cx, cy = ax + dx * t, ay + dy * t
    return t, math.hypot(p[0] - cx, p[1] - cy), (cx, cy)


def _shade(nx: float, ny: float, bands: Bands, light: Tuple[float, float, float] = LIGHT) -> str:
    nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
    lx, ly, lz = light
    norm = math.sqrt(lx * lx + ly * ly + lz * lz)
    intensity = (nx * lx + ny * ly + nz * lz) / norm
    if intensity >= bands.hi:
        return "a"
    if intensity >= bands.light:
        return "b"
    if intensity >= bands.mid:
        return "c"
    return "d"


def capsules(
    bones: Sequence[Bone],
    bands: Bands = DEFAULT_BANDS,
    rim: bool = True,
    light: Tuple[float, float, float] = LIGHT,
) -> Dict[Point, str]:
    """Union of tapered capsules as shaded keys, in frame coordinates."""
    if not bones:
        return {}
    xs = [c for bone in bones for c in (bone.a[0] - bone.ra, bone.b[0] - bone.rb, bone.a[0] + bone.ra, bone.b[0] + bone.rb)]
    ys = [c for bone in bones for c in (bone.a[1] - bone.ra, bone.b[1] - bone.rb, bone.a[1] + bone.ra, bone.b[1] + bone.rb)]
    x0, x1 = int(math.floor(min(xs))) - 1, int(math.ceil(max(xs))) + 1
    y0, y1 = int(math.floor(min(ys))) - 1, int(math.ceil(max(ys))) + 1
    cells: Dict[Point, str] = {}
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            p = (x + 0.5, y + 0.5)
            best: Optional[Tuple[float, float, float, Vec]] = None
            for bone in bones:
                t, dist, c = _closest(p, bone)
                r = bone.ra + (bone.rb - bone.ra) * t
                if dist <= r and (best is None or dist / r < best[0]):
                    best = (dist / r, dist, r, c)
            if best is None:
                continue
            _, dist, r, c = best
            nx = (p[0] - c[0]) / r
            ny = (p[1] - c[1]) / r
            cells[(x, y)] = _shade(nx, ny, bands, light)
    if rim:
        cells = with_rim(cells)
    return cells


def with_rim(cells: Dict[Point, str]) -> Dict[Point, str]:
    """Marks the shape's own edge pixels as soft outline."""
    out = dict(cells)
    for (x, y) in cells:
        for dx, dy in NEIGHBOURS:
            if (x + dx, y + dy) not in cells:
                out[(x, y)] = SOFT_OUTLINE
                break
    return out


def outline_outside(cells: Dict[Point, str]) -> Dict[Point, str]:
    """Adds a soft outline ring around the shape instead of inside it."""
    out = dict(cells)
    for (x, y) in cells:
        for dx, dy in NEIGHBOURS:
            q = (x + dx, y + dy)
            if q not in cells:
                out.setdefault(q, SOFT_OUTLINE)
    return out


def polygon(points: Sequence[Vec]) -> List[Point]:
    """Pixels whose centres fall inside the polygon (even-odd rule)."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    inside: List[Point] = []
    for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
        cy = y + 0.5
        for x in range(int(math.floor(min(xs))), int(math.ceil(max(xs))) + 1):
            cx = x + 0.5
            hit = False
            j = len(points) - 1
            for i in range(len(points)):
                xi, yi = points[i]
                xj, yj = points[j]
                if (yi > cy) != (yj > cy) and cx < (xj - xi) * (cy - yi) / (yj - yi) + xi:
                    hit = not hit
                j = i
            if hit:
                inside.append((x, y))
    return inside


def disc(cx: float, cy: float, r: float) -> List[Point]:
    out: List[Point] = []
    for y in range(int(math.floor(cy - r)) - 1, int(math.ceil(cy + r)) + 1):
        for x in range(int(math.floor(cx - r)) - 1, int(math.ceil(cx + r)) + 1):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                out.append((x, y))
    return out


def line(a: Point, b: Point) -> List[Point]:
    """Bresenham, inclusive."""
    x0, y0 = a
    x1, y1 = b
    points: List[Point] = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
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


def to_grid(cells: Dict[Point, str], pivot: Point = (0, 0)) -> Grid:
    """Frame-space cells to a grid whose pivot is the frame origin, so `at=(0, 0)` places it 1:1."""
    return Grid.from_cells(cells, pivot)


def arc_band(
    center: Vec, r_in: float, r_out: float, start: float, end: float, keys: Iterable[Tuple[float, str]]
) -> Dict[Point, str]:
    """A ring segment (angles in degrees, screen space, clockwise from +x), keyed by radius bands.

    `keys` maps the outer edge of each band (0..1 across the ring) to a key; used for smears.
    """
    bands = sorted(keys)
    cells: Dict[Point, str] = {}
    cx, cy = center
    lo, hi = sorted((start, end))
    for y in range(int(cy - r_out) - 1, int(cy + r_out) + 2):
        for x in range(int(cx - r_out) - 1, int(cx + r_out) + 2):
            px, py = x + 0.5 - cx, y + 0.5 - cy
            dist = math.hypot(px, py)
            if dist < r_in or dist > r_out:
                continue
            angle = math.degrees(math.atan2(py, px)) % 360
            span_ok = any(lo <= a <= hi for a in (angle, angle + 360, angle - 360))
            if not span_ok:
                continue
            f = (dist - r_in) / max(1e-6, r_out - r_in)
            for edge, key in bands:
                if f <= edge:
                    cells[(x, y)] = key
                    break
    return cells


def swoosh(points: Sequence[Vec], width_start: float, width_end: float) -> Dict[Point, str]:
    """A tapering motion trail along a polyline: `a` hot core, `b` softer edge. The smear frame's ribbon."""
    if len(points) < 2:
        return {}
    lengths = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])]
    total = sum(lengths) or 1.0
    bones: List[Bone] = []
    walked = 0.0
    for (a, b), length in zip(zip(points, points[1:]), lengths):
        t0, t1 = walked / total, (walked + length) / total
        r0 = (width_start + (width_end - width_start) * t0) / 2
        r1 = (width_start + (width_end - width_start) * t1) / 2
        bones.append(Bone(a, b, r0, r1))
        walked += length
    cells = capsules(bones, Bands(2.0, 2.0, -2.0), rim=False)
    edge = with_rim(cells)
    return {p: ("b" if edge[p] == SOFT_OUTLINE else "a") for p in cells}
