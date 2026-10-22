"""The shared hibit body rig: one skeleton, posed by a handful of readable parameters.

A `Pose` says what an animator would say: lean forward 8°, near knee bent 60°, far hand
on the guitar neck. `solve` turns it into joint positions in frame space (x right, y up
from the feet line, z towards the viewer). Limbs take either joint angles (FK) or a
target for the hand/foot (two-bone IK with a pole that keeps elbows and knees natural).

"Near" limbs are the character's right arm and leg: facing screen-right, that side faces
the viewer. They are drawn in front; "far" limbs sit behind the body.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from typing import Dict, Optional, Tuple

from .vec import Frame3, Vec, add, cross, dot, length, norm, rotate, scale, sub

DEG = math.pi / 180.0


@dataclass(frozen=True)
class Build:
    """Body proportions in native pixels. Roel: slim, lean, average-tall, ~5.5 heads."""

    hip_height: float = 28.0
    pelvis_to_chest: float = 11.2
    chest_to_neck: float = 4.6
    neck_length: float = 3.2
    hip_half_width: float = 2.6
    shoulder_half_width: float = 6.6
    shoulder_drop: float = 0.8
    thigh: float = 13.6
    shin: float = 12.0
    ankle_height: float = 1.9
    upper_arm: float = 8.6
    forearm: float = 7.8


@dataclass(frozen=True)
class Limb:
    """One arm or leg. Angles in degrees; a target (frame space) switches to IK."""

    swing: float = 0.0  # forward (+) / back (-) in the sagittal plane
    spread: float = 0.0  # out to its own side (+)
    bend: float = 0.0  # knee or elbow flexion, always positive
    twist: float = 0.0  # rotates the bend plane around the limb (elbows out, knees in)
    target: Optional[Vec] = None
    #: IK pole direction in body-local (fwd, up, side) terms; elbows point back/down, knees forward.
    pole: Optional[Tuple[float, float, float]] = None
    #: Foot pitch (toes up +) or hand roll; consumed by the outfit.
    end: float = 0.0


@dataclass(frozen=True)
class Pose:
    x: float = 0.0
    y: float = 0.0  # pelvis bob relative to the standing hip height
    hip_yaw: float = 34.0
    chest_yaw: float = 54.0
    lean: float = 0.0  # whole spine forward (+)
    chest_lean: float = 0.0  # chest relative to pelvis, forward (+)
    roll: float = 0.0  # spine sideways towards the near side (+)
    neck: float = 0.0  # head nod forward (+), in degrees on the neck
    near_arm: Limb = Limb(swing=4.0, spread=9.0, bend=12.0)
    far_arm: Limb = Limb(swing=-4.0, spread=9.0, bend=12.0)
    near_leg: Limb = Limb(swing=3.0, bend=2.0)
    far_leg: Limb = Limb(swing=-3.0, bend=2.0)
    #: Free-form values outfits and props read: expression, hair state, prop angle, ...
    extra: Dict[str, object] = field(default_factory=dict)

    def but(self, **changes: object) -> "Pose":
        return replace(self, **changes)  # type: ignore[arg-type]


@dataclass
class Chain:
    root: Vec
    mid: Vec
    end: Vec
    #: The basis of the body segment the limb hangs from.
    frame: Frame3
    side_sign: float
    limb: Limb


@dataclass
class Skeleton:
    pelvis: Vec
    pelvis_frame: Frame3
    chest: Vec
    chest_frame: Frame3
    neck_base: Vec
    head: Vec  # the head anchor: where the head kit's neck pivot lands
    near_arm: Chain
    far_arm: Chain
    near_leg: Chain
    far_leg: Chain
    pose: Pose
    build: Build

    def foot_dir(self, leg: Chain) -> Vec:
        """Heel-to-toe direction: forward in the pelvis frame, pitched by `end`."""
        shin = norm(sub(leg.end, leg.mid))
        fwd = leg.frame.fwd
        # Flatten forward against the shin so a bent ankle keeps the foot roughly level.
        f = norm(sub(fwd, scale(shin, dot(fwd, shin) * 0.3)))
        return norm(rotate(f, leg.frame.side, leg.limb.end * DEG))


def _two_bone(root: Vec, target: Vec, l1: float, l2: float, pole: Vec) -> Tuple[Vec, Vec]:
    d = sub(target, root)
    dist = length(d)
    dist = max(abs(l1 - l2) + 1e-3, min(l1 + l2 - 1e-3, dist))
    direction = norm(d)
    cos_a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
    cos_a = max(-1.0, min(1.0, cos_a))
    sin_a = math.sqrt(1 - cos_a * cos_a)
    p = sub(pole, scale(direction, dot(pole, direction)))
    if length(p) < 1e-6:
        p = (0.0, 0.0, 1.0)
    p = norm(p)
    mid = add(root, add(scale(direction, l1 * cos_a), scale(p, l1 * sin_a)))
    end = add(root, scale(direction, dist))
    return mid, end


def _fk(root: Vec, frame: Frame3, side_sign: float, limb: Limb, l1: float, l2: float, is_arm: bool) -> Tuple[Vec, Vec]:
    """Forward kinematics in the body's own frame.

    `swing` rotates the limb forward (+) from hanging straight down; `spread` lifts it
    out to its own side (towards the viewer for near limbs); `bend` folds the forearm
    forward (elbows) or the shin backward (knees).
    """
    down = scale(frame.up, -1.0)
    d1 = rotate(down, frame.side, limb.swing * DEG)
    d1 = rotate(d1, frame.fwd, -side_sign * limb.spread * DEG)
    bend_axis = norm(cross(d1, frame.fwd)) if abs(dot(d1, frame.fwd)) < 0.999 else frame.side
    bend_axis = rotate(bend_axis, d1, limb.twist * DEG * side_sign)
    # cross(d1, fwd) points along `side` for a hanging limb: rotating about it swings forward.
    sign = 1.0 if is_arm else -1.0
    if dot(bend_axis, frame.side) < 0:
        sign = -sign
    d2 = rotate(d1, bend_axis, sign * limb.bend * DEG)
    mid = add(root, scale(d1, l1))
    end = add(mid, scale(d2, l2))
    return mid, end


def solve(pose: Pose, build: Build = Build()) -> Skeleton:
    pelvis: Vec = (pose.x, build.hip_height + 1.2 + pose.y, 0.0)
    pelvis_frame = Frame3.facing(pose.hip_yaw * DEG).rolled(pose.roll * DEG).leaned(pose.lean * DEG)
    chest_frame = (
        Frame3.facing(pose.chest_yaw * DEG)
        .rolled(pose.roll * DEG)
        .leaned((pose.lean + pose.chest_lean) * DEG)
    )
    chest = add(pelvis, scale(pelvis_frame.up, build.pelvis_to_chest * 0.55))
    chest = add(chest, scale(chest_frame.up, build.pelvis_to_chest * 0.45))
    neck_base = add(chest, scale(chest_frame.up, build.chest_to_neck))
    head_frame = chest_frame.leaned(pose.neck * DEG)
    head = add(neck_base, scale(head_frame.up, build.neck_length))

    def arm(side_sign: float, limb: Limb) -> Chain:
        shoulder = chest_frame.point(
            neck_base, 0.0, -build.shoulder_drop - 0.6, side_sign * build.shoulder_half_width
        )
        if limb.target is not None:
            pole_local = limb.pole or (-0.6, -0.5, side_sign * 0.6)
            pole = chest_frame.direction(*pole_local)
            mid, end = _two_bone(shoulder, limb.target, build.upper_arm, build.forearm, pole)
        else:
            mid, end = _fk(shoulder, chest_frame, side_sign, limb, build.upper_arm, build.forearm, True)
        return Chain(shoulder, mid, end, chest_frame, side_sign, limb)

    def leg(side_sign: float, limb: Limb) -> Chain:
        hip = pelvis_frame.point(pelvis, 0.0, -1.2, side_sign * build.hip_half_width)
        if limb.target is not None:
            pole_local = limb.pole or (1.0, 0.1, side_sign * 0.15)
            pole = pelvis_frame.direction(*pole_local)
            mid, end = _two_bone(hip, limb.target, build.thigh, build.shin, pole)
        else:
            mid, end = _fk(hip, pelvis_frame, side_sign, limb, build.thigh, build.shin, False)
        return Chain(hip, mid, end, pelvis_frame, side_sign, limb)

    return Skeleton(
        pelvis=pelvis,
        pelvis_frame=pelvis_frame,
        chest=chest,
        chest_frame=chest_frame,
        neck_base=neck_base,
        head=head,
        near_arm=arm(1.0, pose.near_arm),
        far_arm=arm(-1.0, pose.far_arm),
        near_leg=leg(1.0, pose.near_leg),
        far_leg=leg(-1.0, pose.far_leg),
        pose=pose,
        build=build,
    )


def ground_target(x: float, z: float, build: Build = Build(), lift: float = 0.0) -> Vec:
    """An ankle target for a foot planted at (x, z) on the ground (or lifted by `lift`)."""
    return (x, build.ankle_height + lift, z)
