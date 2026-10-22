"""NORTH STAR: a faceted guiding star that homes in on the most frustrated customer.

Strips
  icon        a compass star in a fine ring (24 x 24)
  fx-star     the star in flight: spin (8, loop), half a turn about its
              north-south axis (after half a turn it looks the same again)
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
from ..motifs import twinkle
from ..palette import GOLD, WHITE
from ..sheet import Animation, Strip

# Facet tones, lit from the top-left: the north and west faces catch the most light.
# (ray angle in degrees, side) -> GOLD index; side -1 is the anticlockwise half of the ray.
# fmt: off
FACETS: Dict[Tuple[int, int], int] = {
    (-90, -1): 5, (-90, 1): 3,  # north: west face lit, east face in shade
    (180, 1): 5, (180, -1): 3,  # west: north face lit
    (0, -1): 4, (0, 1): 2,  # east: north face lit
    (90, 1): 4, (90, -1): 2,  # south: west face half-lit, east face darkest
}
# fmt: on


def _lit_side(angle: int) -> int:
    return max((-1, 1), key=lambda side: FACETS[(angle, side)])


def stepped_star(size: int, cx: int, cy: int, vertical: Sequence[int], horizontal: Sequence[int]) -> Grid:
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


def kite_star(size: int, cx: float, cy: float, rays: Sequence[Tuple[float, float, float]]) -> Grid:
    """A faceted star of smooth kite-shaped rays, for the large impact flash.

    Each facet is lit by the direction it faces on screen (its dot product
    with the top-left light), which shades long tapering rays more smoothly
    than the stepped profile of the small stars.
    """
    grid = Grid(size, size)
    light = (-0.6, -0.8)
    for angle, length, half_width in rays:
        a = math.radians(angle)
        mask = raster.star(cx, cy, [(angle, length, half_width)])
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
STAR_CENTRE = 8
TURN_FRAMES = 8
#: Half-widths along a ray by distance from the centre pixel, for a full-length ray.
RAY_PROFILE = (2, 2, 1, 1, 1, 0, 0, 0)


def _profile(length: int) -> Tuple[int, ...]:
    """A ray of `length` pixels that tapers like RAY_PROFILE, compressed to fit."""
    if length <= 0:
        return ()
    return tuple(RAY_PROFILE[min(len(RAY_PROFILE) - 1, round(i * len(RAY_PROFILE) / length))] for i in range(length))


def turning_star(step: int) -> Grid:
    """The star turning about its north-south axis, `step` of TURN_FRAMES through half a turn.

    The north-south rays lie on the axis, so they never change length: the
    star keeps pointing north. The east-west rays foreshorten to nothing as
    it goes edge-on, where it catches the light in a glint. The light stays
    top-left in screen space, so the facets on the left are always the lit
    ones and the half turn loops seamlessly.
    """
    turn = math.cos(math.pi * step / TURN_FRAMES)
    c = STAR_CENTRE
    g = stepped_star(STAR, c, c, _profile(8), _profile(round(7 * abs(turn))))
    edge_on = abs(turn) < 0.2
    if edge_on:
        # Seen edge-on there is no lit or shaded face: the spindle is one tone above the heart, one below.
        g = g.map(lambda x, y, color: GOLD[4] if y < c else GOLD[3])
    g = g.outline(GOLD[0], corners=False)
    g.set(c, c, WHITE)
    if edge_on:
        # Edge-on, the star catches the light: a glint on its heart.
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            g.set(c + dx, c + dy, GOLD[5])
    return g


def star_strip() -> Strip:
    return Strip(
        "fx-star",
        STAR,
        STAR,
        (STAR_CENTRE, STAR_CENTRE),
        [Animation("spin", 12, True, [turning_star(i) for i in range(TURN_FRAMES)])],
    )


# ── Trail and sparkles ────────────────────────────────────────────────────


TRAIL = 7


def trail_strip() -> Strip:
    c = TRAIL // 2
    spark = []
    for reach, core, arm in ((2, GOLD[5], GOLD[4]), (1, GOLD[4], GOLD[3]), (0, GOLD[3], GOLD[3])):
        g = Grid(TRAIL, TRAIL)
        twinkle(g, c, c, reach, core, arm)
        spark.append(g)
    dots = []
    for tone in (GOLD[4], GOLD[2]):
        g = Grid(TRAIL, TRAIL)
        g.set(c, c, tone)
        dots.append(g)
    return Strip(
        "fx-trail",
        TRAIL,
        TRAIL,
        (c, c),
        [
            Animation("spark", 15, False, spark),
            Animation("dot", 10, False, dots),
        ],
    )


SPARKLE = 24


def launch_frames() -> List[Grid]:
    c = SPARKLE // 2
    frames = []
    g = Grid(SPARKLE, SPARKLE)
    twinkle(g, c, c, 1, WHITE, GOLD[5])
    frames.append(g)
    g = Grid(SPARKLE, SPARKLE)
    twinkle(g, c, c, 3, GOLD[5], GOLD[4])
    g.set(c, c, WHITE)
    frames.append(g)
    g = Grid(SPARKLE, SPARKLE)
    g.plot(raster.thin(raster.ring(c + 0.5, c + 0.5, 4.5, 4.5)), GOLD[4])
    twinkle(g, c, c, 1, GOLD[5], GOLD[4])
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
    twinkle(g, c, c, 2, GOLD[5], GOLD[3])
    frames.append(g.outline(GOLD[0], corners=False))
    g = Grid(SPARKLE, SPARKLE)
    twinkle(g, c, c, 1, GOLD[4], GOLD[3])
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
    return Strip(
        "fx-sparkle",
        SPARKLE,
        SPARKLE,
        (SPARKLE // 2, SPARKLE // 2),
        [
            Animation("launch", 20, False, launch_frames()),
            Animation("fizzle", 15, False, fizzle_frames()),
        ],
    )


# ── Impact ────────────────────────────────────────────────────────────────

IMPACT = 48


def impact_frames(calm: bool) -> List[Grid]:
    c = IMPACT // 2
    centre = (c + 0.5, c + 0.5)
    frames = []
    if not calm:
        g = kite_star(IMPACT, *centre, [(-90, 20, 3.2), (90, 16, 3.0), (0, 13, 2.6), (180, 13, 2.6)])
        g = g.recolor({GOLD[2]: GOLD[4], GOLD[3]: GOLD[5], GOLD[4]: WHITE})  # the flash: every facet a step brighter
        g.plot(raster.disc(*centre, 3), WHITE)
        frames.append(g)
    g = kite_star(IMPACT, *centre, [(-90, 18, 2.8), (90, 14, 2.6), (0, 11, 2.2), (180, 11, 2.2)])
    g.plot(raster.thin(raster.ring(*centre, 6, 6)), GOLD[4])
    g = g.outline(GOLD[0], corners=False)
    g.set(c, c, WHITE if not calm else GOLD[5])
    frames.append(g)
    g = kite_star(IMPACT, *centre, [(-90, 11, 2.0), (90, 9, 2.0), (0, 7, 1.8), (180, 7, 1.8)])
    g.plot(raster.ring(*centre, 10.5, 10.5, 2), GOLD[3])
    g.plot(raster.thin(raster.ring(*centre, 10.5, 10.5)), GOLD[4])
    frames.append(g.outline(GOLD[0], corners=False))
    for radius, sparkle_r, tone, reach in ((14.5, 12, GOLD[3], 2), (17.5, 15, GOLD[2], 1)):
        g = Grid(IMPACT, IMPACT)
        ring = raster.thin(raster.ring(*centre, radius, radius))
        g.plot(raster.dashed(ring, *centre, 12 if reach == 2 else 10, 0.6 if reach == 2 else 0.45, 1 / 48), tone)
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            twinkle(g, c + round(dx * sparkle_r * 0.72), c + round(dy * sparkle_r * 0.72), reach, GOLD[5], GOLD[4])
        frames.append(g)
    for spread, tone in ((19, GOLD[4]), (21, GOLD[3]), (22, GOLD[2])):
        g = Grid(IMPACT, IMPACT)
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            x, y = c + round(dx * spread * 0.72), c + round(dy * spread * 0.72)
            if spread < 21:
                twinkle(g, x, y, 1, tone, GOLD[3])
            elif (dx + dy) != 0 or spread < 22:
                g.set(x, y, tone)
        frames.append(g)
    return frames


def impact_strip() -> Strip:
    return Strip(
        "fx-impact",
        IMPACT,
        IMPACT,
        (IMPACT // 2, IMPACT // 2),
        [
            Animation("impact", 20, False, impact_frames(calm=False)),
            Animation("impact-calm", 20, False, impact_frames(calm=True)),
        ],
    )


def strips() -> List[Strip]:
    return [icon(), star_strip(), trail_strip(), sparkle_strip(), impact_strip()]
