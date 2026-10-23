"""Shared hero timing: the body motion every hero performs identically.

Each function returns the base poses of one animation: pelvis, lean, legs,
head and face. Heroes dress them with their own arms and props, so run,
jump, fall and hurt read the same for all three while their hands do
different things.

Timing is designed in 60 Hz frames against the gameplay code:
* run speed is 110 px/s; 8 frames at 12 fps cover 73 px, two 37 px strides,
  so the planted foot never skates;
* the jump rises for about 0.35 s (400 px/s against 1150 px/s^2);
* hurt lasts 0.3 s of knockback (KNOCKBACK_SECONDS).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from typing import Dict, List, Optional, Sequence, Tuple

from .draw import direction
from .skeleton import HERO, Arm, Build, Leg, Pose

# The ankle sits here when a foot is flat on the ground: shoes are 4 rows
# tall and the bottom row of the frame (63) is the ground line.
GROUND_ANKLE_Y = 60.5
STAND_PELVIS = (31.5, 38.0)


@dataclass(frozen=True)
class Anim:
    name: str
    fps: float
    loop: bool
    poses: Tuple[Pose, ...]


def ankle_drop(leg: Leg, build: Build = HERO) -> float:
    """Vertical distance from the hip to the ankle for a leg's angles."""
    return build.thigh * direction(leg.thigh)[1] + build.shin * direction(leg.shin)[1]


def plant(pose: Pose, side: str = "near", lift: float = 0.0, x: Optional[float] = None, build: Build = HERO) -> Pose:
    """Moves the pelvis vertically so the `side` foot rests on the ground."""
    leg = pose.near_leg if side == "near" else pose.far_leg
    hip = build.near_hip if side == "near" else build.far_hip
    y = GROUND_ANKLE_Y - lift - ankle_drop(leg, build) - hip[1]
    px = pose.pelvis[0] if x is None else x
    return replace(pose, pelvis=(px, y))


def base(**kw) -> Pose:
    return Pose(pelvis=STAND_PELVIS, **kw)


# ── idle ───────────────────────────────────────────────────────────────────

IDLE_LEGS = dict(near_leg=Leg(-4, 0, "flat"), far_leg=Leg(6, 2, "flat"))


def idle() -> Anim:
    """A slow breath: the chest rises a pixel and settles; one blink."""
    rise = [0, 0, 1, 1, 1, 1, 0, 0]
    poses = []
    for i, r in enumerate(rise):
        p = plant(base(**IDLE_LEGS, squash=-r, face="blink" if i == 7 else "smile"))
        poses.append(p.plus(breath=r, phase=i))
    return Anim("idle", 6, True, tuple(poses))


# ── run ────────────────────────────────────────────────────────────────────
# One step is contact, down, push-off and flight; the second step mirrors the
# legs. The planted foot travels back 9 px per frame relative to the hips
# (contact +8, down -1, push -10), which is exactly 110 px/s at 12 fps, so
# it never skates. Flight has both feet off the ground at the top of the bob.

_STRIDE = [
    # (phase, planted/front leg, swing/back leg)
    ("contact", Leg(26, 14, "heel"), Leg(-24, -52, "toe")),
    ("down", Leg(22, -26, "flat"), Leg(-30, -102, "back")),
    ("push", Leg(-20, -32, "toe"), Leg(38, -42, "point")),
    ("flight", Leg(-30, -50, "point"), Leg(56, 12, "lift")),
]
_LEAN = 9.0
_FLIGHT_RISE = 2.0


def run() -> Anim:
    poses: List[Pose] = []
    for half in (0, 1):
        planted = "near" if half == 0 else "far"
        for name, front, back in _STRIDE:
            near, far = (front, back) if half == 0 else (back, front)
            p = base(near_leg=near, far_leg=far, lean=_LEAN)
            if name == "flight":
                # Airborne: keep the push-off height and rise a little more.
                pushed = plant(base(near_leg=_STRIDE[2][1] if half == 0 else _STRIDE[2][2],
                                    far_leg=_STRIDE[2][2] if half == 0 else _STRIDE[2][1], lean=_LEAN),
                               planted, lift=1.5)
                p = p.with_(pelvis=(pushed.pelvis[0], pushed.pelvis[1] - _FLIGHT_RISE))
            else:
                p = plant(p, planted, lift=1.5 if name == "push" else 0.0)
            poses.append(p.plus(stride=name, half=half))
    return Anim("run", 12, True, tuple(poses))


# ── jump / fall ────────────────────────────────────────────────────────────

def jump() -> Anim:
    poses = [
        # Launch: stretched, the push-off leg trailing, the other knee driving up.
        base(near_leg=Leg(-12, -18, "point"), far_leg=Leg(48, -10, "point"), lean=4).with_(pelvis=(31.5, 36.0)),
        # Rising: knees tuck.
        base(near_leg=Leg(30, -40, "point"), far_leg=Leg(56, -24, "point"), lean=2).with_(pelvis=(31.5, 35.0)),
        # Near the apex: compact tuck.
        base(near_leg=Leg(40, -46, "point"), far_leg=Leg(62, -30, "point"), lean=0).with_(pelvis=(31.5, 35.0)),
    ]
    return Anim("jump", 10, False, tuple(p.plus(phase=i) for i, p in enumerate(poses)))


def fall() -> Anim:
    # Coming down: legs reaching for the ground and pedalling a little,
    # the body tipping back a touch to brace for the landing.
    poses = [
        base(near_leg=Leg(8, -6, "point"), far_leg=Leg(24, 4, "point"), lean=-2).with_(pelvis=(31.5, 36.0)),
        base(near_leg=Leg(12, -2, "point"), far_leg=Leg(20, 0, "point"), lean=-3).with_(pelvis=(31.5, 36.5)),
        base(near_leg=Leg(6, -8, "point"), far_leg=Leg(26, 6, "point"), lean=-2).with_(pelvis=(31.5, 36.0)),
        base(near_leg=Leg(10, -4, "point"), far_leg=Leg(22, 2, "point"), lean=-1).with_(pelvis=(31.5, 35.5)),
    ]
    return Anim("fall", 8, True, tuple(p.plus(phase=i) for i, p in enumerate(poses)))


# ── hurt ───────────────────────────────────────────────────────────────────

def hurt() -> Anim:
    poses = [
        # The hit: snap back, head whips, knees buckle.
        plant(base(near_leg=Leg(-14, 4, "flat"), far_leg=Leg(10, 16, "toe"), lean=-20, face="hurt",
                   head=(-2.0, 1.0), squash=1.0), "near"),
        # Thrown up and back by the knockback.
        base(near_leg=Leg(20, -30, "point"), far_leg=Leg(36, -12, "point"), lean=-18, face="hurt",
             head=(-1.0, 0.0)).with_(pelvis=(30.5, 36.0)),
        base(near_leg=Leg(18, -26, "point"), far_leg=Leg(30, -8, "point"), lean=-10, face="hurt").with_(pelvis=(30.5, 36.0)),
        # Gathering himself before control returns.
        base(near_leg=Leg(8, -10, "point"), far_leg=Leg(18, 0, "point"), lean=-4, face="focus").with_(pelvis=(31.0, 36.5)),
    ]
    return Anim("hurt", 13, False, tuple(p.plus(phase=i) for i, p in enumerate(poses)))
