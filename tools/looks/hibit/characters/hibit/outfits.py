"""The three outfits on the shared body: hoodie, tie-dye knit with cap, white shirt and blazer.

Patterns read primitive-local coordinates, so prints, pockets and lapels stick to the
body as it moves: ellipsoids report a point on their unit sphere (forward, up, side);
limbs report (t along the bone, angle around it, 0) with angle 0 facing forward.
"""

from __future__ import annotations

import math
from typing import List, Optional, Tuple

from .body import Outfit
from .render3d import Capsule, Ellipsoid, Hit, Prim
from .rig import Skeleton
from .vec import Vec, add, norm, scale, sub

PatternResult = Tuple[Optional[str], int]


# ── Hackerman: black hoodie (hood down), dark jeans, white sneakers ─────────────────


def _kangaroo_pocket(hit: Hit) -> PatternResult:
    fwd, up, side = hit.local
    if fwd > 0.42 and -0.85 < up < 0.05 and abs(side) < 0.75:
        if up > -0.08:
            return None, -2  # the pocket's top seam
        if abs(abs(side) - 0.62) < 0.1:
            return None, -1  # the pocket mouths
        return None, 0
    return None, 0


def _jeans_fade(hit: Hit) -> PatternResult:
    t, angle, _ = hit.local
    if abs(angle) < 0.35 and 0.25 < t < 0.75:
        return None, 1
    return None, 0


def hood(sk: Skeleton) -> List[Prim]:
    """The hood, down: bunched in a thick roll around the back and sides of the neck."""
    f = sk.chest_frame
    base = sk.neck_base
    basis = (f.fwd, f.up, f.side)
    pieces = [
        ((-2.4, 0.3, 0.0), (2.1, 2.2, 3.4)),
        ((-1.0, -0.2, 2.9), (2.0, 1.9, 1.7)),
        ((-1.0, -0.2, -2.9), (2.0, 1.9, 1.7)),
        ((0.9, -0.9, 2.0), (1.4, 1.3, 1.3)),
        ((0.9, -0.9, -2.0), (1.4, 1.3, 1.3)),
    ]
    prims: List[Prim] = []
    for (df, du, ds), radii in pieces:
        prims.append(
            Ellipsoid(
                part="hood",
                material="hoodie",
                group="hood",
                center=f.point(base, df, du, ds),
                basis=basis,
                radii=radii,
            )
        )
    return prims


def drawstrings(sk: Skeleton, swing: float = 0.0) -> List[Prim]:
    """Two strings from the hood's front with terminal-green aglets; `swing` sways them (rad)."""
    f = sk.chest_frame
    prims: List[Prim] = []
    for side in (1.1, -1.0):
        top = f.point(sk.neck_base, 1.9, -1.2, side)
        length = 6.2 if side > 0 else 5.6
        down: Vec = (math.sin(swing) * 0.9, -math.cos(swing), 0.15)
        tip = add(top, scale(norm(down), length))
        top = (top[0], top[1], top[2] + 0.6)
        tip = (tip[0], tip[1], tip[2] + 0.6)

        def aglet(hit: Hit) -> PatternResult:
            return ("neon", 0) if hit.local[0] > 0.78 else (None, 0)

        prims.append(Capsule(part="string", material="string", pattern=aglet, group="string", a=top, b=tip, ra=0.55, rb=0.55, bias=1.2))
    return prims


HACKERMAN = Outfit(
    top="hoodie",
    sleeve="hoodie",
    trousers="jeans",
    shoe="sneaker",
    cuff="hoodie_rib",
    hem="hoodie_rib",
    bulk=0.7,
    sleeve_bulk=0.45,
    waist_pattern=_kangaroo_pocket,
    trouser_pattern=_jeans_fade,
    extras=(hood,),
    neck=True,
)


# ── Artsy: tie-dye black/grey knit, dark brown trousers, dark sneakers, the cap ─────


def _hash(ix: int, iy: int, iz: int) -> float:
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def _noise(x: float, y: float, z: float) -> float:
    """Smooth value noise in [0, 1]: stable, so the dye blotches never crawl."""
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    sx, sy, sz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    total = 0.0
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                wgt = (sx if dx else 1 - sx) * (sy if dy else 1 - sy) * (sz if dz else 1 - sz)
                total += wgt * _hash(ix + dx, iy + dy, iz + dz)
    return total


def _dye(x: float, y: float, z: float) -> PatternResult:
    n = _noise(x * 2.2 + 11.0, y * 2.2 + 3.0, z * 2.2 + 7.0) * 0.7 + _noise(x * 4.4, y * 4.4, z * 4.4) * 0.3
    if n > 0.62:
        return "knit_light", 0
    if n > 0.55:
        return "knit_light", -1
    return None, 0


def _knit_torso(hit: Hit) -> PatternResult:
    fwd, up, side = hit.local
    if up > 0.86:
        return None, -1  # ribbed crew neck
    return _dye(fwd, up, side)


def _knit_waist(hit: Hit) -> PatternResult:
    fwd, up, side = hit.local
    return _dye(fwd * 1.1 + 0.5, up * 1.1 - 1.2, side * 1.1)


def _knit_sleeve(hit: Hit) -> PatternResult:
    t, angle, _ = hit.local
    if t > 0.84:
        return None, -1
    return _dye(math.cos(angle) * 0.8, t * 1.6 + 2.5, math.sin(angle) * 0.8 + hit.prim.bias)


ARTSY = Outfit(
    top="knit_dark",
    sleeve="knit_dark",
    trousers="trousers_brown",
    shoe="shoe_dark",
    cuff="knit_dark",
    hem="knit_dark",
    bulk=0.8,
    sleeve_bulk=0.5,
    trouser_bulk=0.25,
    chest_pattern=_knit_torso,
    waist_pattern=_knit_waist,
    sleeve_pattern=_knit_sleeve,
    neck=True,
)


def strap(sk: Skeleton, horn: Vec) -> List[Prim]:
    """The guitar strap from the far shoulder down to the upper horn's strap button."""
    f = sk.chest_frame
    top = f.point(sk.neck_base, 1.3, -0.4, -3.6)
    mid = f.point(sk.chest, 3.2, 1.0, -4.8)
    return [
        Capsule(part="strap", material="strap", group="strap", a=top, b=mid, ra=0.75, rb=0.75, bias=0.4),
        Capsule(part="strap", material="strap", group="strap", a=mid, b=horn, ra=0.75, rb=0.75, bias=0.4),
    ]


# ── Strategy: white shirt with an open collar, navy blazer, dark trousers, brogues ──


def _shirt_front(width_top: float, width_bottom: float):
    def pattern(hit: Hit) -> PatternResult:
        fwd, up, side = hit.local
        if fwd <= 0.2:
            return None, 0
        w = width_bottom + (width_top - width_bottom) * max(0.0, min(1.0, (up + 0.4) / 1.2))
        if abs(side) < w:
            if up > 0.78 and abs(side) < 0.16:
                return "skin", 0  # the open collar
            if abs(side + 0.02) < 0.05 and up < 0.78:
                return "shirt", -1  # placket
            return "shirt", 0
        if abs(side) < w + 0.16:
            return None, 1 if side < 0 else -1  # lapel roll catching the light
        return None, 0

    return pattern


def _shirt_waist(hit: Hit) -> PatternResult:
    fwd, up, side = hit.local
    if fwd > 0.25 and abs(side) < 0.2 + 0.08 * up:
        if abs(side) < 0.05:
            return "shirt", -1
        return "shirt", 0
    if fwd > 0.25 and abs(side) < 0.32:
        return None, 1 if side < 0 else -1
    return None, 0


def _belt(hit: Hit) -> PatternResult:
    fwd, up, side = hit.local
    if 0.42 < up < 0.78:
        if fwd > 0.6 and abs(side) < 0.12:
            return "shirt", 1  # the buckle
        return "belt", 0
    return None, 0


def _crease(hit: Hit) -> PatternResult:
    t, angle, _ = hit.local
    if abs(angle) < 0.22:
        return None, 1
    return None, 0


def _blazer_sleeve(hit: Hit) -> PatternResult:
    return None, 0


def collar(sk: Skeleton) -> List[Prim]:
    """White collar points standing up either side of the open neck."""
    f = sk.chest_frame
    basis = (f.fwd, f.up, f.side)
    prims: List[Prim] = []
    for side in (1.0, -1.0):
        prims.append(
            Ellipsoid(
                part="collar",
                material="shirt",
                group="collar",
                center=f.point(sk.neck_base, 0.9, 0.2, side * 2.0),
                basis=basis,
                radii=(1.5, 1.4, 1.2),
                bias=0.6,
            )
        )
    return prims


STRATEGY = Outfit(
    top="blazer",
    sleeve="blazer",
    trousers="trousers_dark",
    shoe="leather",
    cuff="shirt",
    hem=None,
    bulk=0.35,
    sleeve_bulk=0.3,
    chest_pattern=_shirt_front(0.40, 0.22),
    waist_pattern=_shirt_waist,
    hips_pattern=_belt,
    trouser_pattern=_crease,
    extras=(collar,),
    neck=True,
)
