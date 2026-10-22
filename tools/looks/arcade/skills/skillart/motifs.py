"""Small shapes the six skills share, so every sparkle, spark, burst and puff in the look is drawn the same way."""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

from pixkit.canvas import Mask, Sprite, disc, polygon
from pixkit.palette import WHITE, Ramp


def twinkle(radius: int, ramp: Ramp, diagonals: bool = False) -> Sprite:
    """A 4-point sparkle (2r+1 square): white heart, arms fading through the ramp towards their tips."""
    size = radius * 2 + 1
    sprite = Sprite(size, size)
    arm = [WHITE, ramp.pale, ramp.light, ramp.mid, ramp.dark]
    for step in range(radius + 1):
        color = arm[min(step, len(arm) - 1)] if radius > 1 else (WHITE if step == 0 else ramp.light)
        for dx, dy in ((step, 0), (-step, 0), (0, step), (0, -step)):
            sprite.set(radius + dx, radius + dy, color)
    if diagonals and radius >= 2:
        for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            sprite.set(radius + dx, radius + dy, ramp.light)
    return sprite


def star_points(cx: float, cy: float, rays: Sequence[Tuple[float, float]], waist: float) -> List[Tuple[float, float]]:
    """Outline of a star: each (angle in degrees, length) ray tip, with ``waist`` notches between rays."""
    points: List[Tuple[float, float]] = []
    count = len(rays)
    for angle, length in rays:
        a = math.radians(angle)
        points.append((cx + math.cos(a) * length, cy + math.sin(a) * length))
        b = a + math.pi / count
        points.append((cx + math.cos(b) * waist, cy + math.sin(b) * waist))
    return points


def starburst(cx: float, cy: float, rays: int, outer: float, inner: float, phase: float = 0.0) -> Mask:
    """An even starburst: ``rays`` spikes of length ``outer`` around a body of radius ``inner``."""
    spikes = [(phase + i * 360.0 / rays, outer) for i in range(rays)]
    return polygon(star_points(cx, cy, spikes, inner)) | disc(cx, cy, inner)


def banded_burst(
    sprite: Sprite,
    cx: float,
    cy: float,
    rays: int,
    outer: float,
    inner: float,
    tones: Sequence[str],
    phase: float = 0.0,
) -> None:
    """A starburst painted in nested bands, outermost tone first and white-hot centre last (Metal Slug flash)."""
    steps = len(tones)
    for index, tone in enumerate(tones):
        scale = 1.0 - index / steps
        sprite.fill(starburst(cx, cy, rays, outer * scale, max(0.6, inner * scale), phase), tone)


def shard(
    sprite: Sprite, x: float, y: float, angle_degrees: float, length: float, color: str, tip: Optional[str] = None
) -> None:
    """A flying spark: a short straight streak pointing along its flight, optionally with a brighter head."""
    a = math.radians(angle_degrees)
    steps = max(1, int(round(length)))
    for i in range(steps):
        px = math.floor(x + math.cos(a) * i)
        py = math.floor(y + math.sin(a) * i)
        sprite.set(px, py, tip if (tip and i == steps - 1) else color)


#: The light every faceted shape is lit by: top-left and towards the viewer.
_LIGHT = (-0.55, -0.65, 0.52)


def _facet_brightness(ray_angle: float, side: int) -> float:
    """How lit one half of a star ray is: rays are low pyramids whose faces tilt across and along the ray."""
    a = math.radians(ray_angle)
    along = (math.cos(a), math.sin(a))
    across = (math.cos(a + side * math.pi / 2), math.sin(a + side * math.pi / 2))
    normal = (across[0] * 0.5 + along[0] * 0.3, across[1] * 0.5 + along[1] * 0.3, 0.8)
    length = math.sqrt(sum(c * c for c in normal))
    return sum(n / length * light for n, light in zip(normal, _LIGHT))


def gem_star(
    width: int,
    height: int,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    sharpness: float,
    tones: Sequence[str],
    steps: Sequence[float] = (0.15, 0.45, 0.85),
    rays: Sequence[float] = (-90.0, 0.0, 90.0, 180.0),
) -> Sprite:
    """A faceted four-point star: concave sides (a superellipse below 1) and eight lit or shaded facets.

    ``tones`` run dark to light (one more than ``steps``); ``rx`` and ``ry``
    are the horizontal and vertical ray lengths, so ``rx < ry`` gives the
    tall "north star" cross.
    """
    sprite = Sprite(width, height)
    angles = [math.radians(r) for r in rays]
    for y in range(height):
        for x in range(width):
            dx, dy = abs(x + 0.5 - cx) / rx, abs(y + 0.5 - cy) / ry
            if dx**sharpness + dy**sharpness > 1.0:
                continue
            theta = math.atan2(y + 0.5 - cy, x + 0.5 - cx)
            offsets = [math.atan2(math.sin(theta - a), math.cos(theta - a)) for a in angles]
            nearest = min(range(len(angles)), key=lambda i: abs(offsets[i]))
            brightness = _facet_brightness(rays[nearest], 1 if offsets[nearest] > 0 else -1)
            tone = tones[-1]
            for threshold, candidate in zip(steps, tones):
                if brightness < threshold:
                    tone = candidate
                    break
            sprite.set(x, y, tone)
    return sprite


def clumps(
    sprite: Sprite, balls: Sequence[Tuple[float, float, float]], tones: Sequence[str], light_x: float, light_y: float
) -> None:
    """Smoke as separate balls lit together from the top-left: dissolving smoke shrinks and splits into these.

    ``tones`` run dark to light; (light_x, light_y) is the cluster's centre the
    light falls across, so every ball keeps its lit top-left cap.
    """
    for bx, by, radius in balls:
        if radius <= 0:
            continue
        for x, y in disc(bx, by, radius):
            local = -((x + 0.5 - bx) * 0.6 + (y + 0.5 - by) * 0.8) / max(radius, 0.8)
            overall = -((x + 0.5 - light_x) * 0.2 + (y + 0.5 - light_y) * 0.3) / 6.0
            lit = local + overall
            index = 0 if lit < -0.5 else 1 if lit < 0.1 else 2 if lit < 0.6 else 3
            sprite.set(x, y, tones[min(index, len(tones) - 1)])
