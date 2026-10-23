"""The shared body rig: one skeleton, posed by angles, for every hero.

Angles are absolute and in degrees: 0 points straight down, +90 points
forward (the way the sheet faces, right), 180 points up. Limb lengths are
fixed, so every frame keeps the same proportions however the joints move.

The view is a three-quarter view facing right. The hero's right side is
toward the camera, so his right ("near") arm and leg hang on the left of
the body and are painted in front; his left ("far") limbs sit to the right
and behind.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Dict, Optional, Tuple

from .draw import direction, rotate

Point = Tuple[float, float]

# Limb lengths in pixels for a ~57 px tall hero (hair top to soles).
THIGH = 11.5
SHIN = 11.0
UPPER_ARM = 8.5
FOREARM = 7.5
TORSO = 16.5  # pelvis to neck base

# Joint offsets in the three-quarter view.
NEAR_HIP = (-2.0, 0.5)
FAR_HIP = (2.5, 0.5)
NEAR_SHOULDER = (-5.0, 3.5)
FAR_SHOULDER = (5.5, 4.0)


@dataclass(frozen=True)
class Build:
    """Limb lengths and joint offsets of one body type."""

    thigh: float = THIGH
    shin: float = SHIN
    upper_arm: float = UPPER_ARM
    forearm: float = FOREARM
    torso: float = TORSO
    near_hip: Point = NEAR_HIP
    far_hip: Point = FAR_HIP
    near_shoulder: Point = NEAR_SHOULDER
    far_shoulder: Point = FAR_SHOULDER


HERO = Build()


@dataclass(frozen=True)
class Leg:
    thigh: float = 0.0
    shin: float = 0.0
    foot: str = "flat"


@dataclass(frozen=True)
class Arm:
    upper: float = 0.0
    fore: float = 0.0
    hand: str = "rest"


@dataclass(frozen=True)
class Pose:
    """One frame of the shared rig plus whatever a hero layers on top."""

    pelvis: Point = (31.5, 37.5)
    lean: float = 0.0
    near_leg: Leg = Leg()
    far_leg: Leg = Leg()
    near_arm: Arm = Arm()
    far_arm: Arm = Arm()
    face: str = "smile"
    head: Point = (0.0, 0.0)  # extra whole-pixel head offset (nod, recoil)
    squash: float = 0.0  # torso compression in px (landing, crouch)
    prop: Optional[str] = None  # prop pose id, interpreted by the hero
    extra: Tuple[Tuple[str, object], ...] = ()  # free-form per-hero parameters

    def get(self, key: str, default: object = None) -> object:
        for k, v in self.extra:
            if k == key:
                return v
        return default

    def with_(self, **changes: object) -> "Pose":
        return replace(self, **changes)

    def plus(self, **extra: object) -> "Pose":
        merged = dict(self.extra)
        merged.update(extra)
        return replace(self, extra=tuple(sorted(merged.items())))


@dataclass(frozen=True)
class Joints:
    pelvis: Point
    neck: Point
    near_hip: Point
    far_hip: Point
    near_knee: Point
    far_knee: Point
    near_ankle: Point
    far_ankle: Point
    near_shoulder: Point
    far_shoulder: Point
    near_elbow: Point
    far_elbow: Point
    near_wrist: Point
    far_wrist: Point


def _add(p: Point, d: Point, k: float = 1.0) -> Point:
    return (p[0] + d[0] * k, p[1] + d[1] * k)


def solve(pose: Pose, build: Build = HERO) -> Joints:
    b = build
    px, py = pose.pelvis
    up = direction(180.0 - pose.lean)  # lean > 0 tips the torso forward
    length = b.torso - pose.squash
    neck = (px + up[0] * length, py + up[1] * length)
    near_hip = _add(pose.pelvis, b.near_hip)
    far_hip = _add(pose.pelvis, b.far_hip)
    near_knee = _add(near_hip, direction(pose.near_leg.thigh), b.thigh)
    far_knee = _add(far_hip, direction(pose.far_leg.thigh), b.thigh)
    near_ankle = _add(near_knee, direction(pose.near_leg.shin), b.shin)
    far_ankle = _add(far_knee, direction(pose.far_leg.shin), b.shin)
    near_shoulder = _add(neck, rotate(b.near_shoulder, pose.lean))
    far_shoulder = _add(neck, rotate(b.far_shoulder, pose.lean))
    near_elbow = _add(near_shoulder, direction(pose.near_arm.upper), b.upper_arm)
    far_elbow = _add(far_shoulder, direction(pose.far_arm.upper), b.upper_arm)
    near_wrist = _add(near_elbow, direction(pose.near_arm.fore), b.forearm)
    far_wrist = _add(far_elbow, direction(pose.far_arm.fore), b.forearm)
    return Joints(pose.pelvis, neck, near_hip, far_hip, near_knee, far_knee, near_ankle, far_ankle,
                  near_shoulder, far_shoulder, near_elbow, far_elbow, near_wrist, far_wrist)


def _angle_of(dx: float, dy: float) -> float:
    """Inverse of draw.direction: the limb angle pointing along (dx, dy)."""
    import math

    return math.degrees(math.atan2(dx, dy))


def reach(pose: Pose, side: str, target: Point, bend: float = 1.0, hand: Optional[str] = None,
          build: Build = HERO) -> Pose:
    """Two-bone IK: sets one arm's angles so its wrist lands on `target`.

    `bend` picks the elbow side: +1 bends the elbow down and back (a natural
    carry), -1 bends it up and forward. Out-of-reach targets are clamped to
    a straight arm pointing at them.
    """
    import math

    j = solve(pose, build)
    shoulder = j.near_shoulder if side == "near" else j.far_shoulder
    dx, dy = target[0] - shoulder[0], target[1] - shoulder[1]
    dist = math.hypot(dx, dy)
    a, b = build.upper_arm, build.forearm
    dist = max(abs(a - b) + 1e-3, min(a + b - 1e-3, dist))
    base_angle = math.atan2(dy, dx)
    cos_inner = (a * a + dist * dist - b * b) / (2 * a * dist)
    inner = math.acos(max(-1.0, min(1.0, cos_inner)))
    elbow_angle = base_angle + inner * bend
    ex, ey = shoulder[0] + a * math.cos(elbow_angle), shoulder[1] + a * math.sin(elbow_angle)
    tx, ty = shoulder[0] + dist * math.cos(base_angle), shoulder[1] + dist * math.sin(base_angle)
    upper = _angle_of(ex - shoulder[0], ey - shoulder[1])
    fore = _angle_of(tx - ex, ty - ey)
    arm = pose.near_arm if side == "near" else pose.far_arm
    new = Arm(upper, fore, hand if hand is not None else arm.hand)
    return pose.with_(near_arm=new) if side == "near" else pose.with_(far_arm=new)
