"""NORTH STAR: a faceted guiding star that homes in on the most frustrated customer.

Strips
  icon        a compass star in a fine ring (24 x 24)
  fx-star     the star in flight: spin (4, loop; a 4-point star repeats every
              quarter turn, so four 22.5 degree steps make a seamless spin)
  fx-trail    sparkles code leaves along the star's path: spark (3), dot (2)
  fx-sparkle  launch (5) at the `hand` anchor, fizzle (4) if it never lands
  fx-impact   a compass-star flash, a ring and drifting sparkles (8);
              impact-calm without the white flash for reduced motion
"""

from __future__ import annotations

import math
from typing import Dict, List, Sequence, Tuple

from .. import icon_kit, raster
from ..grid import Grid
from ..palette import GOLD, WHITE
from ..sheet import Animation, Strip

# Facet tones, lit from the top-left: the north and west faces catch the most light.
# (ray angle in degrees, side) -> GOLD index; side -1 is the anticlockwise half of the ray.
FACETS: Dict[Tuple[int, int], int] = {
    (-90, -1): 5, (-90, 1): 3,   # north: west face lit, east face in shade
    (180, 1): 5, (180, -1): 3,   # west: north face lit
    (0, -1): 4, (0, 1): 2,       # east: north face lit
    (90, 1): 4, (90, -1): 2,     # south: west face half-lit, east face darkest
    # The short diagonal points of the compass rose sit a step darker behind the main rays.
    (-135, -1): 4, (-135, 1): 3,
    (-45, -1): 3, (-45, 1): 2,
    (45, -1): 2, (45, 1): 2,
    (135, -1): 3, (135, 1): 2,
}


def faceted_star(cx: float, cy: float, rays: List[Tuple[int, float, float]]) -> Grid:
    """A star of kite-shaped rays, each split along its axis into a lit and a shaded facet."""
    grid = Grid(icon_kit.SIZE, icon_kit.SIZE)
    for angle, length, half_width in rays:
        mask = raster.star(cx, cy, [(angle, length, half_width)])
        a = math.radians(angle)
        nx, ny = -math.sin(a), math.cos(a)
        for x, y in mask:
            side = (x + 0.5 - cx) * nx + (y + 0.5 - cy) * ny
            # The pixel on the ridge itself takes the lit facet, so 1 px tips stay bright.
            facet = -1 if side < -0.25 else 1 if side > 0.25 else _lit_side(angle)
            grid.set(x, y, GOLD[FACETS[(angle, facet)]])
    return grid


def _lit_side(angle: int) -> int:
    return max((-1, 1), key=lambda side: FACETS[(angle, side)])


def stepped_star(size: int, cx: int, cy: int, vertical: List[int], horizontal: List[int]) -> Grid:
    """A four-point star whose rays taper in even steps, the way it would be drawn by hand.

    `vertical[d]` / `horizontal[d]` give the ray's half-width at distance d
    from the centre pixel (the list length is the ray length). Each pixel is
    toned by its ray and by which side of the ray's ridge it sits on.
    """
    grid = Grid(size, size)
    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            if abs(dy) >= abs(dx):
                profile, d, across, ray = vertical, abs(dy), dx, (-90 if dy < 0 else 90)
            else:
                profile, d, across, ray = horizontal, abs(dx), dy, (180 if dx < 0 else 0)
            if d >= len(profile) or abs(across) > profile[d]:
                continue
            # Which face of the ray: the ridge pixel (across == 0) takes the lit face.
            if across == 0:
                facet = _lit_side(ray)
            else:
                direction = math.radians(ray)
                nx, ny = -math.sin(direction), math.cos(direction)
                facet = 1 if (dx * nx + dy * ny) > 0 else -1
            grid.set(x, y, GOLD[FACETS[(ray, facet)]])
    return grid


# Half-widths by distance from the centre: long north-south rays, shorter east-west ones.
VERTICAL = [2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0]
HORIZONTAL = [2, 2, 2, 1, 1, 1, 0, 0, 0]


def icon_art(frame: int) -> Grid:
    star = stepped_star(icon_kit.SIZE, 11, 11, VERTICAL, HORIZONTAL)
    art = Grid(icon_kit.SIZE, icon_kit.SIZE)
    # A fine compass ring behind the star: lit along its top-left arc, like the rays.
    ring = raster.thin(raster.ring(11.5, 11.5, 6.5, 6.5))
    art.plot(raster.arc(ring, 11.5, 11.5, 135, 315), GOLD[3])
    art.plot(raster.arc(ring, 11.5, 11.5, 315, 135), GOLD[1])
    art.paste(star.outline(GOLD[0], corners=False))
    art.set(11, 11, WHITE)
    icon_kit.glint(art, 11, 11, {4: 1, 5: 2, 6: 1}.get(frame, 0), WHITE, GOLD[5])
    return art


def icon() -> Strip:
    return icon_kit.build_icon(icon_kit.glow(GOLD[2], 0.78), icon_art)


# ── The star in flight ────────────────────────────────────────────────────


def rotated_star(size: int, cx: float, cy: float, rays: Sequence[Tuple[float, float, float]], rotation: float) -> Grid:
    """A faceted four-point star at any angle, rasterised from its ray kites.

    Facets are lit by their direction on screen, not by which ray they belong
    to, so the light stays top-left while the star turns: the facet facing
    up-left is always the brightest.
    """
    grid = Grid(size, size)
    light = (-0.6, -0.8)
    for angle, length, half_width in rays:
        a = math.radians(angle + rotation)
        mask = raster.star(cx, cy, [(angle + rotation, length, half_width)])
        nx, ny = -math.sin(a), math.cos(a)
        for x, y in mask:
            side = (x + 0.5 - cx) * nx + (y + 0.5 - cy) * ny
            # The facet's outward normal is the side vector; brightness is its dot with the light.
            facing = (nx if side >= 0 else -nx) * light[0] + (ny if side >= 0 else -ny) * light[1]
            if abs(side) < 0.35:
                facing = max(facing, 0.2)
            tone = GOLD[5] if facing > 0.55 else GOLD[4] if facing > 0.0 else GOLD[3] if facing > -0.55 else GOLD[2]
            current = grid.get(x, y)
            # Where two rays overlap near the centre, the brighter facet wins.
            if current is None or GOLD.index(tone) > GOLD.index(current):
                grid.set(x, y, tone)
    return grid


STAR = 17
FLIGHT_RAYS = [(-90, 7.6, 2.3), (0, 7.6, 2.3), (90, 7.6, 2.3), (180, 7.6, 2.3)]


def star_frame(step: int) -> Grid:
    c = STAR / 2
    g = rotated_star(STAR, c, c, FLIGHT_RAYS, step * 22.5)
    g = g.outline(GOLD[0], corners=False)
    g.set(STAR // 2, STAR // 2, WHITE)
    return g


def star_strip() -> Strip:
    return Strip("fx-star", STAR, STAR, (STAR // 2, STAR // 2), [Animation("spin", 12, True, [star_frame(i) for i in range(4)])])


# ── Trail and sparkles ────────────────────────────────────────────────────


def sparkle(g: Grid, x: int, y: int, reach: int, core: str, arm: str) -> None:
    g.set(x, y, core)
    for i in range(1, reach + 1):
        for dx, dy in ((i, 0), (-i, 0), (0, i), (0, -i)):
            g.set(x + dx, y + dy, core if i < reach else arm)


TRAIL = 7


def trail_strip() -> Strip:
    c = TRAIL // 2
    spark = []
    for reach, core, arm in ((2, GOLD[5], GOLD[4]), (1, GOLD[4], GOLD[3]), (0, GOLD[3], GOLD[3])):
        g = Grid(TRAIL, TRAIL)
        sparkle(g, c, c, reach, core, arm)
        spark.append(g)
    dots = []
    for tone in (GOLD[4], GOLD[2]):
        g = Grid(TRAIL, TRAIL)
        g.set(c, c, tone)
        dots.append(g)
    return Strip("fx-trail", TRAIL, TRAIL, (c, c), [
        Animation("spark", 15, False, spark),
        Animation("dot", 10, False, dots),
    ])


SPARKLE = 24


def launch_frames() -> List[Grid]:
    c = SPARKLE // 2
    frames = []
    g = Grid(SPARKLE, SPARKLE)
    sparkle(g, c, c, 1, WHITE, GOLD[5])
    frames.append(g)
    g = Grid(SPARKLE, SPARKLE)
    sparkle(g, c, c, 3, GOLD[5], GOLD[4])
    g.set(c, c, WHITE)
    frames.append(g)
    g = Grid(SPARKLE, SPARKLE)
    g.plot(raster.thin(raster.ring(c + 0.5, c + 0.5, 4.5, 4.5)), GOLD[4])
    sparkle(g, c, c, 1, GOLD[5], GOLD[4])
    frames.append(g)
    g = Grid(SPARKLE, SPARKLE)
    ring = raster.thin(raster.ring(c + 0.5, c + 0.5, 6.5, 6.5))
    g.plot(raster.dashed(ring, c + 0.5, c + 0.5, 8, 0.55), GOLD[3])
    frames.append(g)
    g = Grid(SPARKLE, SPARKLE)
    for dx, dy in ((7, -3), (-6, 5), (2, 8), (-4, -7)):
        g.set(c + dx, c + dy, GOLD[3])
    frames.append(g)
    return frames


def fizzle_frames() -> List[Grid]:
    c = SPARKLE // 2
    frames = []
    g = Grid(SPARKLE, SPARKLE)
    sparkle(g, c, c, 2, GOLD[5], GOLD[3])
    frames.append(g.outline(GOLD[0], corners=False))
    g = Grid(SPARKLE, SPARKLE)
    sparkle(g, c, c, 1, GOLD[4], GOLD[3])
    frames.append(g)
    g = Grid(SPARKLE, SPARKLE)
    g.set(c, c, GOLD[3])
    for dx, dy in ((3, -2), (-3, 1), (1, 3), (-1, -3)):
        g.set(c + dx, c + dy, GOLD[4])
    frames.append(g)
    g = Grid(SPARKLE, SPARKLE)
    for dx, dy in ((4, -4), (-4, 2)):
        g.set(c + dx, c + dy, GOLD[2])
    frames.append(g)
    return frames


def sparkle_strip() -> Strip:
    return Strip("fx-sparkle", SPARKLE, SPARKLE, (SPARKLE // 2, SPARKLE // 2), [
        Animation("launch", 20, False, launch_frames()),
        Animation("fizzle", 15, False, fizzle_frames()),
    ])


# ── Impact ────────────────────────────────────────────────────────────────

IMPACT = 48


def impact_frames(calm: bool) -> List[Grid]:
    c = IMPACT // 2
    centre = (c + 0.5, c + 0.5)
    frames = []
    if not calm:
        g = rotated_star(IMPACT, *centre, [(-90, 20, 3.2), (90, 16, 3.0), (0, 13, 2.6), (180, 13, 2.6)], 0)
        g = g.recolor({GOLD[2]: GOLD[4], GOLD[3]: GOLD[5], GOLD[4]: WHITE})  # the flash: every facet a step brighter
        g.plot(raster.disc(*centre, 3), WHITE)
        frames.append(g)
    g = rotated_star(IMPACT, *centre, [(-90, 18, 2.8), (90, 14, 2.6), (0, 11, 2.2), (180, 11, 2.2)], 0)
    g.plot(raster.thin(raster.ring(*centre, 6, 6)), GOLD[4])
    g = g.outline(GOLD[0], corners=False)
    g.set(c, c, WHITE if not calm else GOLD[5])
    frames.append(g)
    g = rotated_star(IMPACT, *centre, [(-90, 11, 2.0), (90, 9, 2.0), (0, 7, 1.8), (180, 7, 1.8)], 0)
    g.plot(raster.ring(*centre, 10.5, 10.5, 2), GOLD[3])
    g.plot(raster.thin(raster.ring(*centre, 10.5, 10.5)), GOLD[4])
    frames.append(g.outline(GOLD[0], corners=False))
    for radius, sparkle_r, tone, reach in ((14.5, 12, GOLD[3], 2), (17.5, 15, GOLD[2], 1)):
        g = Grid(IMPACT, IMPACT)
        ring = raster.thin(raster.ring(*centre, radius, radius))
        g.plot(raster.dashed(ring, *centre, 12 if reach == 2 else 10, 0.6 if reach == 2 else 0.45, 1 / 48), tone)
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            sparkle(g, c + round(dx * sparkle_r * 0.72), c + round(dy * sparkle_r * 0.72), reach, GOLD[5], GOLD[4])
        frames.append(g)
    for spread, tone in ((19, GOLD[4]), (21, GOLD[3]), (22, GOLD[2])):
        g = Grid(IMPACT, IMPACT)
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            x, y = c + round(dx * spread * 0.72), c + round(dy * spread * 0.72)
            if spread < 21:
                sparkle(g, x, y, 1, tone, GOLD[3])
            elif (dx + dy) != 0 or spread < 22:
                g.set(x, y, tone)
        frames.append(g)
    return frames


def impact_strip() -> Strip:
    return Strip("fx-impact", IMPACT, IMPACT, (IMPACT // 2, IMPACT // 2), [
        Animation("impact", 20, False, impact_frames(calm=False)),
        Animation("impact-calm", 20, False, impact_frames(calm=True)),
    ])


def strips() -> List[Strip]:
    return [icon(), star_strip(), trail_strip(), sparkle_strip(), impact_strip()]
