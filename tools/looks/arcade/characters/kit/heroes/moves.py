"""Shared locomotion and reactions: run, jump, fall and hurt, timed once for all three heroes.

Each move is a list of poses in frame pixels. A hero adapts every frame through
`Hero.carry(kind, index, pose)` (holding its prop, swapping a hand) so the
timing and the body mechanics stay identical across the cast.

Timings are written for the game's code: hurt holds 0.3 s, a jump rises for
about 0.35 s, the run speed is 110 px/s.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Callable, List, Mapping, Optional, Sequence, Tuple

from ..rig import Limb, Pose, Posed

Vec = Tuple[float, float]

STAND_HIP: Vec = (31, 35)
GROUND = 59  # ankle row when the foot is planted (soles on row 63)


@dataclass(frozen=True)
class Anim:
    name: str
    fps: int
    loop: bool
    poses: Sequence[Pose]
    # Named points per frame (frame pixels), e.g. "muzzle" on attack, "hand" on skill.
    anchors: Mapping[str, Sequence[Tuple[int, int]]] = field(default_factory=dict)


Carry = Callable[[str, int, Pose], Pose]


def _limb(end: Vec, tip: str, bend: int) -> Limb:
    return Limb(end=end, bend=bend, tip=tip)


def arm(end: Vec, hand: str = "relax") -> Limb:
    return _limb(end, hand, -1)


def leg(end: Vec, shoe: str = "flat") -> Limb:
    return _limb(end, shoe, 1)


def stance(
    hip: Vec = STAND_HIP,
    near_hand: Vec = (26, 40),
    far_hand: Vec = (37, 40),
    near_foot: Vec = (28, GROUND),
    far_foot: Vec = (34, GROUND),
    head: str = "smile",
    torso: str = "stand",
    near_hand_shape: str = "relax",
    far_hand_shape: str = "relax",
) -> Pose:
    return Pose(
        hip=hip,
        near_arm=arm(near_hand, near_hand_shape),
        far_arm=arm(far_hand, far_hand_shape),
        near_leg=leg(near_foot),
        far_leg=leg(far_foot),
        head=head,
        torso=torso,
    )


# ── Run: 8 frames, two strides, contact -> down -> passing -> flight. ──
# Arms pump opposite to the legs with the elbows bent ~90 degrees; the far arm
# mostly hides behind the chest on its back swing, which is what sells depth.
# (hip, (near ankle, shoe), (far ankle, shoe), (near elbow, wrist), (far elbow, wrist), head bob)
_RUN = (
    ((31, 36), ((42, GROUND), "heel"), ((20, 55), "toe"), ((24, 29), (21, 34)), ((38, 31), (43, 27)), 0),
    ((31, 37), ((36, GROUND), "flat"), ((21, 49), "toe"), ((25, 31), (24, 37)), ((37, 32), (42, 30)), 1),
    ((31, 36), ((30, GROUND), "flat"), ((28, 50), "toe"), ((28, 32), (31, 37)), ((35, 32), (37, 36)), 1),
    ((31, 34), ((23, 57), "toe"), ((38, 52), "toe"), ((30, 31), (35, 30)), ((32, 30), (29, 33)), 0),
    ((31, 36), ((20, 55), "toe"), ((42, GROUND), "heel"), ((31, 31), (36, 30)), ((32, 30), (29, 35)), 0),
    ((31, 37), ((21, 49), "toe"), ((36, GROUND), "flat"), ((30, 32), (35, 32)), ((33, 31), (31, 37)), 1),
    ((31, 36), ((28, 50), "toe"), ((30, GROUND), "flat"), ((28, 32), (29, 37)), ((35, 32), (37, 36)), 1),
    ((31, 34), ((38, 52), "toe"), ((23, 57), "toe"), ((24, 29), (22, 34)), ((38, 30), (42, 26)), 0),
)
# Contact frames lean harder into the stride.
_RUN_LEAN = ("lean2", "lean1", "lean1", "lean1", "lean2", "lean1", "lean1", "lean1")


def run(carry: Carry) -> Anim:
    poses: List[Pose] = []
    for i, (hip, (near_foot, near_shoe), (far_foot, far_shoe), (ne, nw), (fe, fw), bob) in enumerate(_RUN):
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=nw, bend=-1, tip="fist", joint=ne),
            far_arm=Limb(end=fw, bend=-1, tip="fist", joint=fe),
            near_leg=leg(near_foot, near_shoe),
            far_leg=leg(far_foot, far_shoe),
            torso=_RUN_LEAN[i],
            head="smile",
            head_offset=(1 if _RUN_LEAN[i] == "lean1" else 2, bob),
        )
        poses.append(carry("run", i, pose))
    return Anim("run", 15, True, poses)


# ── Jump: take-off stretch -> rise -> tuck -> apex (held while rising, ~0.35 s). ──
# (hip, (near ankle, shoe), (far ankle, shoe), (near elbow, wrist, hand), (far elbow, wrist, hand), torso, head, offset)
_JUMP = (
    ((31, 34), ((30, 56), "toe"), ((34, 57), "toe"), ((26, 31), (23, 36), "open"), ((39, 23), (42, 18), "fist"),
     "stand", "smile", (0, -1)),
    ((31, 33), ((33, 52), "toe"), ((31, 57), "toe"), ((26, 31), (23, 35), "open"), ((39, 22), (41, 15), "fist"),
     "stand", "smile", (0, 0)),
    ((31, 33), ((36, 49), "toe"), ((33, 54), "toe"), ((26, 31), (23, 35), "open"), ((39, 22), (41, 15), "fist"),
     "lean1", "smile", (0, 1)),
    ((31, 33), ((36, 48), "toe"), ((34, 53), "toe"), ((26, 31), (23, 36), "open"), ((39, 22), (41, 15), "fist"),
     "lean1", "smile", (0, 1)),
)


def jump(carry: Carry) -> Anim:
    poses: List[Pose] = []
    for i, (hip, (nf, ns), (ff, fs), (ne, nw, nh), (fe, fw, fh), torso, head, off) in enumerate(_JUMP):
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=nw, bend=-1, tip=nh, joint=ne),
            far_arm=Limb(end=fw, bend=-1, tip=fh, joint=fe),
            near_leg=leg(nf, ns),
            far_leg=leg(ff, fs),
            torso=torso,
            head=head,
            head_offset=off,
        )
        poses.append(carry("jump", i, pose))
    return Anim("jump", 12, False, poses)


# ── Fall: legs reach for the ground, arms up for balance; a two-beat flutter. ──
_FALL = (
    ((31, 33), ((28, 57), "toe"), ((36, 56), "toe"), ((25, 23), (21, 18)), ((40, 24), (44, 19)), (0, 0)),
    ((31, 33), ((28, 58), "toe"), ((36, 57), "toe"), ((25, 22), (20, 18)), ((40, 23), (45, 19)), (0, 0)),
    ((31, 33), ((28, 57), "toe"), ((36, 56), "toe"), ((25, 23), (21, 19)), ((40, 24), (44, 20)), (0, 1)),
    ((31, 33), ((28, 58), "toe"), ((36, 57), "toe"), ((25, 24), (20, 20)), ((40, 25), (45, 21)), (0, 1)),
)


def fall(carry: Carry) -> Anim:
    poses: List[Pose] = []
    for i, (hip, (nf, ns), (ff, fs), (ne, nw), (fe, fw), off) in enumerate(_FALL):
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=nw, bend=-1, tip="open", joint=ne),
            far_arm=Limb(end=fw, bend=-1, tip="open", joint=fe),
            near_leg=leg(nf, ns),
            far_leg=leg(ff, fs),
            torso="stand",
            head="shout",
            head_offset=off,
        )
        poses.append(carry("fall", i, pose))
    return Anim("fall", 10, True, poses)


# ── Hurt: a comic take. Impact snaps the body back, the head whips, arms fling. ──
_HURT = (
    ((29, 35), ((32, 56), "toe"), ((35, GROUND), "flat"), ((24, 27), (19, 24)), ((39, 22), (44, 18)), "back2", (-2, 1)),
    ((28, 36), ((31, 55), "toe"), ((35, GROUND), "flat"), ((23, 26), (18, 22)), ((39, 21), (44, 16)), "back2", (-2, 0)),
    ((29, 36), ((29, GROUND), "heel"), ((35, GROUND), "flat"), ((25, 29), (21, 30)), ((38, 25), (43, 24)), "back1", (-1, 0)),
    ((30, 35), ((28, GROUND), "flat"), ((34, GROUND), "flat"), ((27, 31), (26, 36)), ((36, 31), (39, 35)), "stand", (0, 0)),
)


# Sweat drops flung off the head on the hit, relative to the head pivot, per frame.
_SWEAT = (((-9, -13), (6, -17)), ((-12, -16), (9, -19)), ((-14, -13),), ())


def _sweat(drops: Sequence[Tuple[int, int]]):
    from ..compose import Part
    from ..grid import Grid

    def factory(posed: Posed) -> Optional[Part]:
        if not drops:
            return None
        from ..raster import outline_outside

        hx, hy = int(posed.head_at[0]), int(posed.head_at[1])
        cells = {}
        for dx, dy in drops:
            cells[(hx + dx, hy + dy)] = "w"
            cells[(hx + dx, hy + dy + 1)] = "c"
            cells[(hx + dx + 1, hy + dy + 1)] = "c"
        return Part(
            Grid.from_cells(outline_outside(cells)), (0, 0), {"w": "#ffffff", "c": "#8fe3ff"}, "#2a5a8a", "c", name="sweat"
        )

    return ("top", factory)


def hurt(carry: Carry) -> Anim:
    poses: List[Pose] = []
    for i, (hip, (nf, ns), (ff, fs), (ne, nw), (fe, fw), torso, off) in enumerate(_HURT):
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=nw, bend=-1, tip="open", joint=ne),
            far_arm=Limb(end=fw, bend=-1, tip="open", joint=fe),
            near_leg=leg(nf, ns),
            far_leg=leg(ff, fs),
            torso=torso,
            head="hurt",
            head_offset=off,
            extras=(_sweat(_SWEAT[i]),),
        )
        poses.append(carry("hurt", i, pose))
    return Anim("hurt", 14, False, poses)


def with_head(pose: Pose, head: str) -> Pose:
    return replace(pose, head=head)


def hips(kind: str) -> List[Vec]:
    """The pelvis track of a shared move, for props that lag a frame behind the body."""
    table = {"run": _RUN, "jump": _JUMP, "fall": _FALL, "hurt": _HURT}[kind]
    return [row[0] for row in table]


def lag(kind: str, index: int) -> Tuple[float, float]:
    """How far a strapped prop trails the body this frame: last frame's hip minus this frame's."""
    track = hips(kind)
    here = track[index]
    before = track[index - 1] if (index > 0 or kind in ("run", "fall")) else here
    return (before[0] - here[0], before[1] - here[1])


@dataclass(frozen=True)
class Breath:
    """One beat of the shared idle: torso variant, pelvis drop, head lag, prop lag, face, glint."""

    torso: str
    hip_dy: int
    head: Tuple[int, int]
    prop_dy: int
    face: str
    glint: bool


# A bouncy Metal Slug idle at 8 fps: the chest rises, the head follows a frame late, the knees give
# a little on the exhale, a blink, and a glint off the glasses once a cycle.
BREATH: Tuple[Breath, ...] = (
    Breath("stand", 0, (0, 0), 0, "smile", False),
    Breath("breathe", 0, (0, 1), 0, "smile", False),
    Breath("breathe", 0, (0, 0), -1, "smile", False),
    Breath("breathe", 0, (0, 0), -1, "smile", True),
    Breath("stand", 0, (0, -1), -1, "smile", False),
    Breath("stand", 1, (0, -1), 0, "smile", False),
    Breath("stand", 1, (0, 0), 1, "blink", False),
    Breath("stand", 0, (0, 1), 1, "smile", False),
)
