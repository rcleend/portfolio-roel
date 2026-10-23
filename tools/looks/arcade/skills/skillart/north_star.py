"""NORTH STAR: a guiding star that homes in on the problem that matters most.

A faceted gold four-point star, taller than it is wide like a compass's
north, with a white heart. Gold is the colour of its light and its trail.
"""

from __future__ import annotations

import math
from typing import Dict

from pixkit.canvas import Sprite, polygon
from pixkit.palette import GOLD, INK, WHITE
from pixkit.sheet import Animation, Strip, with_calm

from . import emblem, motifs

STAR_TONES = (GOLD.mid, GOLD.light, GOLD.pale, WHITE)

#: The homing path's sparkles behind the icon's star, oldest first: (x, y, radius, phase).
_TRAIL = ((3, 20, 1, 0), (6, 17, 1, 5), (2, 15, 0, 10))


def _icon_subject(frame: int) -> Sprite:
    """The icon's faceted star; its heart flares once a loop."""
    subject = motifs.gem_star(emblem.SIZE, emblem.SIZE, 13.0, 10.5, 8.0, 10.5, 0.68, STAR_TONES)
    subject.set(13, 10, WHITE)
    # Once a loop the star's heart flares into a small diagonal twinkle.
    if frame in (4, 5):
        for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            subject.set(13 + dx, 10 + dy, WHITE if frame == 4 else GOLD.pale)
    return subject.outlined(INK, corners=False)


def _icon_trail(frame: int) -> Sprite:
    """The homing path's sparkles behind the icon's star, twinkling in turn."""
    trail = Sprite(emblem.SIZE, emblem.SIZE)
    for x, y, radius, phase in _TRAIL:
        lit = (frame + phase) % 16 < 8
        if radius == 0 or not lit:
            trail.set(x, y, GOLD.light if lit else GOLD.mid)
        else:
            trail.blit(motifs.twinkle(radius, GOLD), x - radius, y - radius)
    return trail


# ── The star in flight ──────────────────────────────────────────────────────
#
# It spins like a coin about its vertical axis: the width breathes from full
# to edge-on and back, and the lit facets swap sides as the far face turns
# towards the light. A warm selective outline (not ink) keeps it a light
# source rather than a sticker, and still reads against the pale Luna sky.

STAR = (24, 24)
_SC = (11.5, 11.5)
#: Half-widths through one turn: full, three-quarter, edge-on and back; the second half shows the far face.
_SPIN = (7.0, 5.6, 3.0, 1.2, 3.0, 5.6, 7.0, 5.6)
STAR_HEIGHT = 10.0


def _star(rx: float, far_side: bool) -> Sprite:
    """The flying star at half-width ``rx``; ``far_side`` mirrors the facets for the back half of a turn."""
    star = motifs.gem_star(STAR[0], STAR[1], _SC[0], _SC[1], max(rx, 1.0), STAR_HEIGHT, 0.68, STAR_TONES)
    if far_side:
        # The far face turned to the light: mirror the facet shading, keep the silhouette.
        star = star.flipped_x()
    star.set(11, 11, WHITE)
    if rx <= 1.5:
        star.fill({(11, y) for y in range(4, 19)}, GOLD.light)
        star.fill({(11, y) for y in range(8, 15)}, GOLD.pale)
        star.set(11, 11, WHITE)
    return _glowing(star)


def _glowing(star: Sprite) -> Sprite:
    """A warm rim, then a stepped halo: a glow on the night street, a crisp edge on the bright Luna sky."""
    rimmed = star.outlined(GOLD.dark, corners=False)
    return rimmed.outlined(GOLD.deep, corners=True)


def _spin(frame: int) -> Sprite:
    return _star(_SPIN[frame], frame in (4, 5))


def _launch(step: int) -> Sprite:
    """Leaving the hand: a sparkle, a white flash, then the star a touch wider than it flies."""
    if step == 0:
        sprite = Sprite(*STAR)
        sprite.blit(motifs.twinkle(3, GOLD, diagonals=True), 8, 8)
        return sprite
    if step == 1:
        flash = motifs.gem_star(STAR[0], STAR[1], _SC[0], _SC[1], 9.0, 11.0, 0.6, (WHITE, WHITE, WHITE, WHITE))
        return flash.outlined(GOLD.pale, corners=False)
    return _star(7.6, False)


def star_strip() -> Strip:
    return Strip(
        frame=STAR,
        origin=(12, 12),
        animations=[
            Animation("spin", 15, True, [_spin(i) for i in range(len(_SPIN))]),
            *with_calm(Animation("launch", 30, False, [_launch(i) for i in range(3)]), flashes=[1]),
        ],
    )


# ── The trail it leaves and the lock on its target ─────────────────────────

TRAIL = (12, 12)


def _trail(step: int) -> Sprite:
    """One sparkle the game drops along the star's path; playing it out tapers the trail on its own."""
    sprite = Sprite(*TRAIL)
    if step < 3:
        radius = 3 - step
        sprite.blit(motifs.twinkle(radius, GOLD, diagonals=step == 0), 6 - radius, 6 - radius)
    elif step == 3:
        sprite.set(6, 6, GOLD.light)
    elif step == 4:
        sprite.set(6, 6, GOLD.mid)
    return sprite


def trail_strip() -> Strip:
    return Strip(
        frame=TRAIL, origin=(6, 6), animations=[Animation("sparkle", 20, False, [_trail(i) for i in range(6)])]
    )


LOCK = (32, 32)


def _lock(frame: int) -> Sprite:
    """Four gold corner brackets closing on the customer the star has chosen, breathing in and out."""
    sprite = Sprite(*LOCK)
    inset = (0, 1, 2, 1)[frame]
    lo, hi = 2 + inset, 29 - inset
    for (x, y), (dx, dy) in (((lo, lo), (1, 1)), ((hi, lo), (-1, 1)), ((lo, hi), (1, -1)), ((hi, hi), (-1, -1))):
        for i in range(4):
            sprite.set(x + dx * i, y, GOLD.light if i else GOLD.pale)
            sprite.set(x, y + dy * i, GOLD.light if i else GOLD.pale)
    return sprite.outlined(INK, corners=False)


def lock_strip() -> Strip:
    return Strip(frame=LOCK, origin=(16, 16), animations=[Animation("lock", 12, True, [_lock(i) for i in range(4)])])


# ── Arrival ─────────────────────────────────────────────────────────────────

IMPACT = (48, 48)
_IC = 23.5


def _impact(step: int) -> Sprite:
    """Arrival: white star, gold burst, a hollow star ring rolling out, four small stars flying off."""
    sprite = Sprite(*IMPACT)
    c = _IC
    if step == 0:
        sprite.fill(polygon(motifs.star_points(c, c, [(-90, 22), (0, 16), (90, 22), (180, 16)], 4.5)), WHITE)
        sprite.fill(polygon(motifs.star_points(c, c, [(-45, 11), (45, 11), (135, 11), (225, 11)], 3.5)), WHITE)
        return sprite
    if step == 1:
        motifs.banded_burst(sprite, c, c, 8, 19, 7, [GOLD.mid, GOLD.light, GOLD.pale, WHITE], phase=0)
        return sprite
    # A hollow star-shaped shock rolls out while four small stars fly off on the diagonals.
    spread = (0, 0, 9, 13, 16, 18, 20, 21, 22)[step]
    if step <= 5:
        size = (0, 0, 13, 17, 20, 22)[step]
        outer = polygon(
            motifs.star_points(c, c, [(-90, size), (0, size * 0.8), (90, size), (180, size * 0.8)], size * 0.32)
        )
        inner = polygon(
            motifs.star_points(
                c,
                c,
                [(-90, size - 2), (0, size * 0.8 - 2), (90, size - 2), (180, size * 0.8 - 2)],
                max(size * 0.32 - 1.5, 0.5),
            )
        )
        sprite.fill(outer - inner, (WHITE, GOLD.pale, GOLD.light, GOLD.mid)[min(step - 2, 3)])
    for k, angle in enumerate((-45, 45, 135, 225)):
        a = math.radians(angle)
        x, y = int(c + math.cos(a) * spread), int(c + math.sin(a) * spread)
        if step <= 6:
            radius = 2 if step < 5 else 1
            sprite.blit(motifs.twinkle(radius, GOLD, diagonals=(step + k) % 2 == 0), x - radius, y - radius)
        elif step == 7 or k % 2 == 0:
            sprite.set(x, y, GOLD.light if step == 7 else GOLD.mid)
    if step in (2, 3):
        sprite.fill(motifs.starburst(c, c, 4, 6 - step, 2.0, phase=45), WHITE)
    return sprite


def impact_strip() -> Strip:
    return Strip(
        frame=IMPACT,
        origin=(24, 24),
        animations=with_calm(Animation("burst", 30, False, [_impact(i) for i in range(9)]), flashes=[0]),
    )


def build() -> Dict[str, Strip]:
    return {
        "icon": emblem.icon_strip(_icon_subject, GOLD, _icon_trail),
        "fx-star": star_strip(),
        "fx-star-trail": trail_strip(),
        "fx-star-lock": lock_strip(),
        "fx-star-impact": impact_strip(),
    }
