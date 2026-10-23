"""Drawing primitives on a Frame: shaded polygons, lines and spans.

These are the brushes the outfit and prop painters use. Everything snaps to
pixel centres, so the same call always produces the same pixels.
"""

from __future__ import annotations

import math
from typing import Callable, Iterable, Iterator, List, Optional, Sequence, Tuple

from .canvas import Frame, shade_tone

Point = Tuple[float, float]


def spans(points: Sequence[Point]) -> Iterator[Tuple[int, float, float]]:
    """(y, x_left, x_right) spans of a polygon sampled at pixel centres."""
    ys = [p[1] for p in points]
    n = len(points)
    for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
        cy = y + 0.5
        xs: List[float] = []
        for i in range(n):
            (x1, y1), (x2, y2) = points[i], points[(i + 1) % n]
            if (y1 <= cy < y2) or (y2 <= cy < y1):
                xs.append(x1 + (cy - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            yield y, a, b


def pixels_in(points: Sequence[Point]) -> Iterator[Tuple[int, int, float]]:
    """Every pixel inside a polygon with its position across its row (-1..1)."""
    for y, a, b in spans(points):
        for x in range(int(math.floor(a)), int(math.ceil(b))):
            cx = x + 0.5
            if a <= cx < b:
                yield x, y, ((cx - a) / max(1e-6, b - a)) * 2 - 1


def shaded_polygon(
    frame: Frame,
    points: Sequence[Point],
    material: str,
    part: int,
    lo: int,
    hi: int,
    ny: float = -0.3,
    bias: float = 0.0,
    across: Optional[Callable[[int, int, float], float]] = None,
) -> None:
    """Fills a polygon shaded as a cylinder across its width."""
    for x, y, u in pixels_in(points):
        nx = across(x, y, u) if across else u
        frame.put(x, y, material, shade_tone(nx, ny, lo, hi, bias), part)


def flat_polygon(frame: Frame, points: Sequence[Point], material: str, tone: int, part: int) -> None:
    for x, y, _ in pixels_in(points):
        frame.put(x, y, material, tone, part)


def line_points(a: Point, b: Point) -> List[Tuple[int, int]]:
    """Bresenham between two points rounded to whole pixels."""
    x0, y0 = int(math.floor(a[0])), int(math.floor(a[1]))
    x1, y1 = int(math.floor(b[0])), int(math.floor(b[1]))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    out = []
    while True:
        out.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy
    return out


def line(frame: Frame, a: Point, b: Point, material: str, tone: int, part: int, only_on: Optional[int] = None) -> None:
    """A 1 px line; `only_on` restricts it to cells already painted by that part."""
    for x, y in line_points(a, b):
        if only_on is not None:
            c = frame.get(x, y)
            if c is None or c[2] != only_on:
                continue
        frame.put(x, y, material, tone, part)


def polyline(frame: Frame, points: Iterable[Point], material: str, tone: int, part: int,
             only_on: Optional[int] = None) -> None:
    pts = list(points)
    for a, b in zip(pts, pts[1:]):
        line(frame, a, b, material, tone, part, only_on)


def retone(frame: Frame, part: int, points: Iterable[Tuple[int, int]], fn: Callable[[str, int], Tuple[str, int]]) -> None:
    """Re-tones cells of one part, e.g. to paint a fold over a shaded sleeve."""
    for x, y in points:
        c = frame.get(x, y)
        if c is not None and c[2] == part:
            m, t = fn(c[0], c[1])
            frame.put(x, y, m, t, part)


def rotate(p: Point, angle_deg: float, origin: Point = (0.0, 0.0)) -> Point:
    a = math.radians(angle_deg)
    x, y = p[0] - origin[0], p[1] - origin[1]
    return (origin[0] + x * math.cos(a) - y * math.sin(a), origin[1] + x * math.sin(a) + y * math.cos(a))


def direction(angle_deg: float) -> Point:
    """Unit vector for a limb angle: 0 points down, +90 forward (right), 180 up."""
    a = math.radians(angle_deg)
    return (math.sin(a), math.cos(a))
