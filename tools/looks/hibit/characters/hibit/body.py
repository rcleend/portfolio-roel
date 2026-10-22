"""Dresses a solved skeleton in volumes: the same body for every hero, three outfits.

`Outfit` names the materials and a few shape knobs (baggy sleeves, a hoodie hem, a
shirt collar); `build_body` turns skeleton + outfit into primitives for `render3d`.
Anything an outfit needs beyond the shared body (a hood bunched at the neck, drawstrings,
lapels, a guitar strap) is an `extra`: a function from the skeleton to more primitives.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Sequence, Tuple

from .render3d import Capsule, Ellipsoid, Hit, Pattern, Prim
from .rig import Chain, Skeleton
from .vec import Frame3, Vec, add, lerp, norm, scale, sub

Extra = Callable[[Skeleton], List[Prim]]


@dataclass(frozen=True)
class Outfit:
    top: str  # torso material
    sleeve: str
    trousers: str
    shoe: str
    sole: str = "sole"
    cuff: Optional[str] = None
    hem: Optional[str] = None
    #: Added to torso and sleeve radii: hoodies and sweaters are roomier than a shirt.
    bulk: float = 0.0
    sleeve_bulk: float = 0.0
    trouser_bulk: float = 0.0
    #: Patterns for the torso and sleeves (prints, pockets, a shirt placket, blazer fronts).
    top_pattern: Optional[Pattern] = None
    #: Chest/waist-specific overrides of `top_pattern` (a kangaroo pocket, a belt line).
    chest_pattern: Optional[Pattern] = None
    waist_pattern: Optional[Pattern] = None
    hips_pattern: Optional[Pattern] = None
    sleeve_pattern: Optional[Pattern] = None
    trouser_pattern: Optional[Pattern] = None
    extras: Tuple[Extra, ...] = field(default_factory=tuple)
    #: Short sleeves: the upper-arm sleeve ends at this fraction of the bone and the
    #: forearm is bare (None keeps long sleeves).
    short_sleeve: Optional[float] = None
    #: Draw the neck (open collars) or hide it in a high neckline.
    neck: bool = True


def _basis(frame: Frame3) -> Tuple[Vec, Vec, Vec]:
    return (frame.fwd, frame.up, frame.side)


def _mid_frame(a: Frame3, b: Frame3) -> Frame3:
    fwd = norm(lerp(a.fwd, b.fwd, 0.5))
    up = norm(lerp(a.up, b.up, 0.5))
    side = norm(lerp(a.side, b.side, 0.5))
    return Frame3(fwd, up, side)


def torso(sk: Skeleton, outfit: Outfit) -> List[Prim]:
    b = outfit.bulk
    chest = Ellipsoid(
        part="torso",
        material=outfit.top,
        pattern=outfit.chest_pattern or outfit.top_pattern,
        group="torso",
        center=sk.chest_frame.point(sk.chest, -0.2, 0.4, 0.0),
        basis=_basis(sk.chest_frame),
        radii=(3.7 + b * 0.7, 5.8 + b * 0.3, 6.6 + b),
    )
    waist_frame = _mid_frame(sk.pelvis_frame, sk.chest_frame)
    waist = Ellipsoid(
        part="torso",
        material=outfit.top,
        pattern=outfit.waist_pattern or outfit.top_pattern,
        group="torso",
        center=lerp(sk.pelvis, sk.chest, 0.42),
        basis=_basis(waist_frame),
        radii=(3.1 + b * 0.8, 4.8, 4.9 + b),
    )
    hips = Ellipsoid(
        part="hips",
        material=outfit.trousers,
        pattern=outfit.hips_pattern or outfit.trouser_pattern,
        group="legs",
        center=sk.pelvis_frame.point(sk.pelvis, 0.1, -0.6, 0.0),
        basis=_basis(sk.pelvis_frame),
        radii=(3.3, 3.2, 4.8 + outfit.trouser_bulk),
    )
    prims: List[Prim] = [chest, waist, hips]
    if outfit.hem:
        # The hem band: a short, wide ring where the top ends over the hips.
        prims.append(
            Ellipsoid(
                part="torso",
                material=outfit.hem,
                group="torso",
                center=sk.pelvis_frame.point(sk.pelvis, 0.0, 1.4, 0.0),
                basis=_basis(sk.pelvis_frame),
                radii=(3.5 + b * 0.8, 1.3, 5.3 + b),
                bias=-0.05,
            )
        )
    if outfit.neck:
        prims.append(
            Capsule(
                part="neck",
                material="skin",
                a=sk.neck_base,
                b=add(sk.head, (0.0, 1.0, 0.0)),
                ra=1.45,
                rb=1.45,
                bias=-0.6,
            )
        )
    return prims


def arm(chain: Chain, outfit: Outfit, part: str, hand: bool = True) -> List[Prim]:
    sb = outfit.sleeve_bulk
    shoulder = Ellipsoid(
        part=part,
        material=outfit.sleeve,
        pattern=outfit.sleeve_pattern,
        group=part,
        center=chain.root,
        basis=_basis(chain.frame),
        radii=(2.4 + sb, 2.5 + sb, 2.2 + sb),
    )
    upper = Capsule(
        part=part,
        material=outfit.sleeve,
        pattern=_short_sleeve(outfit) if outfit.short_sleeve is not None else outfit.sleeve_pattern,
        group=part,
        a=chain.root,
        b=chain.mid,
        ra=2.25 + sb,
        rb=1.95 + sb,
        ref=chain.frame.fwd,
    )
    fore_end = chain.end
    fore = Capsule(
        part=part,
        material="skin" if outfit.short_sleeve is not None else outfit.sleeve,
        pattern=None if outfit.short_sleeve is not None else (_cuffed(outfit) if outfit.cuff else outfit.sleeve_pattern),
        group=part,
        a=chain.mid,
        b=fore_end,
        ra=1.95 + sb,
        rb=1.65 + sb * 0.6,
        ref=chain.frame.fwd,
    )
    prims: List[Prim] = [shoulder, upper, fore]
    if hand:
        prims.append(hand_volume(chain, part))
    return prims


def hand_volume(chain: Chain, part: str) -> Prim:
    direction = norm(sub(chain.end, chain.mid))
    center = add(chain.end, scale(direction, 1.4))
    return Ellipsoid(
        part=part,
        material="skin",
        group=part,
        center=center,
        basis=(direction, norm(_perp(direction)), norm(_cross(direction, _perp(direction)))),
        radii=(1.75, 1.45, 1.35),
        bias=0.1,
    )


def _perp(v: Vec) -> Vec:
    return (-v[1], v[0], 0.0) if abs(v[2]) < 0.9 else (0.0, -v[2], v[1])


def _cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _cuffed(outfit: Outfit) -> Pattern:
    def pattern(hit: Hit) -> Tuple[Optional[str], int]:
        if hit.local[0] > 0.8:
            return outfit.cuff, 0
        if outfit.sleeve_pattern:
            return outfit.sleeve_pattern(hit)
        return None, 0

    return pattern


def _short_sleeve(outfit: Outfit) -> Pattern:
    def pattern(hit: Hit) -> Tuple[Optional[str], int]:
        if hit.local[0] > (outfit.short_sleeve or 1.0):
            return "skin", 0
        if hit.local[0] > (outfit.short_sleeve or 1.0) - 0.14:
            return None, -1  # the hem of the sleeve
        return None, 0

    return pattern


def leg(sk: Skeleton, chain: Chain, outfit: Outfit, part: str) -> List[Prim]:
    tb = outfit.trouser_bulk
    thigh = Capsule(
        part=part,
        material=outfit.trousers,
        pattern=outfit.trouser_pattern,
        group=part,
        a=chain.root,
        b=chain.mid,
        ra=2.85 + tb,
        rb=2.3 + tb,
        ref=chain.frame.fwd,
    )
    shin = Capsule(
        part=part,
        material=outfit.trousers,
        pattern=outfit.trouser_pattern,
        group=part,
        a=chain.mid,
        b=chain.end,
        ra=2.3 + tb,
        rb=2.0 + tb,
        ref=chain.frame.fwd,
    )
    foot = sk.foot_dir(chain)
    up = norm(_cross(chain.frame.side, foot))
    shoe_center = add(add(chain.end, scale(foot, 1.9)), scale(up, -0.9))

    def sole_pattern(hit: Hit) -> Tuple[Optional[str], int]:
        if hit.local[1] < -0.42:
            return outfit.sole, 0
        return None, 0

    shoe = Ellipsoid(
        part=part + "_shoe",
        material=outfit.shoe,
        pattern=sole_pattern,
        group=part,
        center=shoe_center,
        basis=(foot, up, chain.frame.side),
        radii=(3.7, 1.75, 1.9),
        bias=0.2,
    )
    return [thigh, shin, shoe]


def build_body(sk: Skeleton, outfit: Outfit, hands: Tuple[bool, bool] = (True, True)) -> List[Prim]:
    prims: List[Prim] = []
    prims += torso(sk, outfit)
    prims += arm(sk.near_arm, outfit, "near_arm", hand=hands[0])
    prims += arm(sk.far_arm, outfit, "far_arm", hand=hands[1])
    prims += leg(sk, sk.near_leg, outfit, "near_leg")
    prims += leg(sk, sk.far_leg, outfit, "far_leg")
    for extra in outfit.extras:
        prims += extra(sk)
    return prims
