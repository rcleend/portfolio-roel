"""The three heroes: one body, one timing, three outfits, their own attacks and skills.

Shared choreography (idle breathing, the run cycle, jump, fall, hurt) is identical for
every hero: the same legs, bob, lean and hair. Each hero then carries its prop through
it (`carry`) and owns its attack, skill and victory, timed to the gameplay:

- attack: the pose is struck for the attack cooldown and restarts on every shot while
  the button is held (0.22 s Hackerman/Strategy, 0.3 s Artsy), and the shot spawns on
  the first frame, so frame 0 is the release and the last frames wind up the next one;
- skill: 0.4 s; hurt: 0.3 s (src/game/world/World.ts, entities/player/Player.ts).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Callable, Dict, List, Optional, Tuple

from . import ramps
from .anim import arc_points, ease_in_out, foot_path, smear, wave
from .canvas import Sprite
from .compose import Character, FrameSpec, Grip, HandItem, Overlay, PropPose
from .outfits import ARTSY, HACKERMAN, STRATEGY, drawstrings, strap
from .props import KEYBOARD, PAD, STRAT
from .rig import Build, Limb, Pose, solve

BUILD = Build()

FPS = {"idle": 10, "run": 15, "jump": 12, "fall": 10, "attack": 20, "skill": 20, "hurt": 20, "victory": 10}
LOOP = {"idle": True, "run": True, "jump": False, "fall": True, "attack": False, "skill": False, "hurt": False,
        "victory": True}
ANIMATIONS = ("idle", "run", "jump", "fall", "attack", "skill", "hurt", "victory")

RUN_FRAMES = 8
RUN_SPEED = 110.0  # px/s, src/game/entities/player/movement.ts
RUN_STANCE = 0.32  # share of the cycle a foot is planted; the rest is swing (and flight)
#: How far a planted foot travels back under the body: exactly the ground speed, so feet never skate.
RUN_STRIDE = RUN_SPEED / FPS["run"] * RUN_FRAMES * RUN_STANCE

IDLE_FRAMES = 12
VICTORY_FRAMES = 12


def _hips(pose: Pose) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    sk = solve(pose)
    return (sk.near_leg.root[0], sk.near_leg.root[2]), (sk.far_leg.root[0], sk.far_leg.root[2])


def planted(pose: Pose, near: Tuple[float, float] = (3.2, 0.8), far: Tuple[float, float] = (-2.8, -0.6),
            near_lift: float = 0.0, far_lift: float = 0.0, near_pitch: float = 0.0, far_pitch: float = 0.0) -> Pose:
    """Plants both feet at (dx, dz) from their hips with IK, so the body can bob above them."""
    (nx, nz), (fx, fz) = _hips(replace(pose, y=0.0, lean=0.0))
    return replace(
        pose,
        near_leg=Limb(target=(nx + near[0], BUILD.ankle_height + near_lift, nz + near[1]), end=near_pitch),
        far_leg=Limb(target=(fx + far[0], BUILD.ankle_height + far_lift, fz + far[1]), end=far_pitch),
    )


# ── Shared locomotion ─────────────────────────────────────────────────────────────


def idle_body(i: int) -> FrameSpec:
    """A relaxed, weight-on-the-back-leg stance that breathes; blinks once, glints once."""
    t = i / IDLE_FRAMES
    breath = math.sin(2 * math.pi * t)
    pose = Pose(y=0.55 * breath - 0.4, lean=-1.0 + 0.6 * breath, chest_lean=-1.0, hip_yaw=30.0, chest_yaw=50.0,
                roll=-2.0)
    pose = planted(pose, near=(3.6, 0.8), far=(-2.6, -0.5), near_pitch=4.0)
    face = "blink" if i == 8 else "smile"
    # The hair lags the breath: it floats a moment after the chest drops.
    hair = "lift" if i in (7,) else "rest"
    return FrameSpec(pose, face=face, hair=hair, glint=i in (3,),
                     extra={"phase": t, "breath": breath, "swing": 0.12 * math.sin(2 * math.pi * (t - 0.15))})


def run_body(i: int) -> FrameSpec:
    """Run frame i. Phase 0 is the near heel strike; the pelvis dips at mid-stance and
    peaks in the flight after each push-off; the hair streams back and floats on the drop."""
    p = i / RUN_FRAMES
    bob = 2.0 * math.cos(4 * math.pi * (p - 0.40))
    base = Pose(lean=14.0, chest_lean=4.0 + 2.0 * math.cos(4 * math.pi * (p - 0.1)), y=bob - 1.6,
                hip_yaw=24.0, chest_yaw=46.0, roll=2.5 * wave(p), neck=-8.0)
    (nx, nz), (fx, fz) = _hips(base)
    near = foot_path(p, RUN_STRIDE, 12.0, RUN_STANCE)
    far = foot_path(p + 0.5, RUN_STRIDE, 12.0, RUN_STANCE)
    pose = replace(
        base,
        near_leg=Limb(target=(nx + near[0] + 1.5, BUILD.ankle_height + near[1], nz + 0.4), end=near[2]),
        far_leg=Limb(target=(fx + far[0] + 0.5, BUILD.ankle_height + far[1], fz - 0.2), end=far[2]),
    )
    dropping = math.sin(4 * math.pi * (p - 0.40)) > 0.3
    near_arm, far_arm = run_arms(p)
    return FrameSpec(pose.but(near_arm=near_arm, far_arm=far_arm), hair="lift" if dropping else "sweep",
                     extra={"phase": p, "swing": -0.55 + 0.25 * wave(p, 0.25), "bob": bob})


def run_arms(p: float, pump: float = 1.0) -> Tuple[Limb, Limb]:
    """Free arms pumping against the legs, elbows bent."""
    s = wave(p)
    near = Limb(swing=-48 * s * pump + 6, spread=12, bend=84 + 16 * s * pump)
    far = Limb(swing=48 * s * pump + 6, spread=10, bend=84 - 16 * s * pump)
    return near, far


JUMP_KEYS = [
    # launch: stretched, toes pointed; rising: knees come up; apex: tucked and floating
    dict(lean=4.0, y=1.5, near=(1.5, 0.0, -40.0), far=(-3.0, 1.5, -30.0), hair="squash"),
    dict(lean=6.0, y=1.5, near=(3.0, 4.0, -20.0), far=(-2.5, 3.5, -30.0), hair="rest"),
    dict(lean=7.0, y=1.0, near=(4.0, 7.5, -10.0), far=(-1.5, 5.0, -25.0), hair="rest"),
    dict(lean=7.0, y=0.5, near=(4.5, 8.5, -6.0), far=(-1.0, 6.0, -22.0), hair="lift"),
]


def jump_body(i: int) -> FrameSpec:
    k = JUMP_KEYS[i]
    base = Pose(lean=k["lean"], chest_lean=-2.0, y=k["y"], hip_yaw=26.0, chest_yaw=48.0, neck=-4.0)
    (nx, nz), (fx, fz) = _hips(base)
    nxo, nlift, npitch = k["near"]
    fxo, flift, fpitch = k["far"]
    pose = replace(
        base,
        near_leg=Limb(target=(nx + nxo, BUILD.ankle_height + nlift + 1.5, nz + 0.6), end=npitch),
        far_leg=Limb(target=(fx + fxo, BUILD.ankle_height + flift + 1.5, fz - 0.4), end=fpitch),
        near_arm=Limb(swing=40 + i * 8, spread=20, bend=40),
        far_arm=Limb(swing=-30 + i * 6, spread=24, bend=30),
    )
    return FrameSpec(pose, hair=k["hair"], face="smile", extra={"phase": i / 4.0, "swing": 0.25 + 0.1 * i})


def fall_body(i: int) -> FrameSpec:
    """Falling: legs reaching for the ground, arms up for balance, hair and strings fluttering."""
    flutter = (-1) ** i
    base = Pose(lean=-3.0, chest_lean=-2.0, y=1.0, hip_yaw=26.0, chest_yaw=48.0, neck=2.0)
    (nx, nz), (fx, fz) = _hips(base)
    pose = replace(
        base,
        near_leg=Limb(target=(nx + 3.0, BUILD.ankle_height + 2.5 + 0.5 * flutter, nz + 0.6), end=10.0),
        far_leg=Limb(target=(fx - 2.0, BUILD.ankle_height + 4.0 - 0.5 * flutter, fz - 0.4), end=-10.0),
        near_arm=Limb(swing=70 + 4 * flutter, spread=34, bend=30),
        far_arm=Limb(swing=40 - 4 * flutter, spread=38, bend=24),
    )
    return FrameSpec(pose, hair="lift", face="smile", extra={"phase": i / 4.0, "swing": 2.6 + 0.25 * flutter})


HURT_KEYS = [
    # impact: snapped back; the comic take holds; then the body starts to gather itself
    dict(lean=-22.0, neck=-10.0, y=1.0, face="hurt", hair="lift", head=(-1, 1), arms=(80, 60)),
    dict(lean=-28.0, neck=-12.0, y=2.0, face="hurt", hair="lift", head=(-1, 1), arms=(100, 70)),
    dict(lean=-27.0, neck=-12.0, y=2.0, face="hurt", hair="rest", head=(-1, 1), arms=(96, 76)),
    dict(lean=-18.0, neck=-6.0, y=1.5, face="hurt", hair="rest", head=(0, 1), arms=(60, 50)),
    dict(lean=-11.0, neck=-2.0, y=1.0, face="hurt", hair="squash", head=(0, 0), arms=(40, 36)),
    dict(lean=-6.0, neck=0.0, y=0.5, face="focus", hair="rest", head=(0, 0), arms=(24, 20)),
]


def hurt_body(i: int) -> FrameSpec:
    k = HURT_KEYS[i]
    base = Pose(lean=k["lean"], chest_lean=-6.0, y=k["y"], hip_yaw=24.0, chest_yaw=44.0, neck=k["neck"])
    (nx, nz), (fx, fz) = _hips(base)
    pose = replace(
        base,
        near_leg=Limb(target=(nx + 5.0, BUILD.ankle_height + 3.5, nz + 0.6), end=20.0),
        far_leg=Limb(target=(fx - 1.0, BUILD.ankle_height + 1.0, fz - 0.4), end=-10.0),
        near_arm=Limb(swing=k["arms"][0], spread=30, bend=40),
        far_arm=Limb(swing=k["arms"][1], spread=36, bend=30),
    )
    hdx, hdy = k["head"]
    return FrameSpec(pose, face=k["face"], hair=k["hair"], head_dx=hdx, head_dy=hdy,
                     extra={"phase": i / 6.0, "swing": 1.2 - 0.2 * i, "hurt": 1.0 - i / 6.0})


# ── Overlays ─────────────────────────────────────────────────────────────────────


def arm_smear(sleeve: str) -> Callable[[str, Tuple[int, int], Tuple[int, int]], Optional[Overlay]]:
    """A smear from the hand's previous position to its new one, in the sleeve's ramp."""
    ramp = ramps.RAMPS[sleeve]
    skin = ramps.RAMPS["skin"]

    def make(hand: str, start: Tuple[int, int], end: Tuple[int, int]) -> Optional[Overlay]:
        if abs(start[0] - end[0]) + abs(start[1] - end[1]) < 4:
            return None
        mid = ((start[0] + end[0]) / 2 + (end[1] - start[1]) * 0.25, (start[1] + end[1]) / 2 - (end[0] - start[0]) * 0.25)
        pts = [start, mid, end]
        sprite = smear([(x + 0.5, y + 0.5) for x, y in pts], [ramp.tones[2], ramp.tones[3], skin.tones[3]], width=1.6)
        return Overlay(sprite, 0, 0, z=-50.0)

    return make


def sparkle(points: List[Tuple[int, int]], color: str = "#ffffff") -> Sprite:
    pixels: List[Optional[str]] = [None] * (64 * 64)
    for x, y in points:
        if 0 <= x < 64 and 0 <= y < 64:
            pixels[y * 64 + x] = color
    return Sprite(64, 64, pixels)


# ── Heroes ───────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Hero:
    id: str
    character: Character
    carry: Callable[[str, int, FrameSpec], FrameSpec]
    attack: Callable[[], List[FrameSpec]]
    skill: Callable[[], List[FrameSpec]]
    victory: Callable[[], List[FrameSpec]]
    sleeve: str


def locomotion(hero: Hero, anim: str) -> List[FrameSpec]:
    if anim == "idle":
        return [hero.carry("idle", i, idle_body(i)) for i in range(IDLE_FRAMES)]
    if anim == "run":
        return [hero.carry("run", i, run_body(i)) for i in range(RUN_FRAMES)]
    if anim == "jump":
        return [hero.carry("jump", i, jump_body(i)) for i in range(len(JUMP_KEYS))]
    if anim == "fall":
        return [hero.carry("fall", i, fall_body(i)) for i in range(4)]
    if anim == "hurt":
        return [hero.carry("hurt", i, hurt_body(i)) for i in range(len(HURT_KEYS))]
    raise ValueError(anim)


def frames_for(hero: Hero, anim: str) -> List[FrameSpec]:
    if anim == "attack":
        return hero.attack()
    if anim == "skill":
        return hero.skill()
    if anim == "victory":
        return hero.victory()
    return locomotion(hero, anim)


# ── HACKERMAN: the keyboard, slung like a keytar ──────────────────────────────────

_KEYTAR = PropPose(angle=15.0, at=(3.5, 5.0), depth=6.5)


def _strings(sk, spec: FrameSpec, placed):
    return drawstrings(sk, spec.extra.get("swing", 0.0))


def hackerman_carry(anim: str, i: int, spec: FrameSpec) -> FrameSpec:
    p = spec.extra.get("phase", 0.0)
    if anim == "idle":
        breath = spec.extra.get("breath", 0.0)
        tap = i in (5, 6)
        return replace(
            spec,
            prop=replace(_KEYTAR, at=(3.5, 5.0 + 0.3 * breath), variant=f"glow:0{',lit:2' if i == 6 else ''}"),
            near_hand=Grip("keys_left", (0.5, -1.0 if tap and i == 5 else 0.0)),
            far_hand=Grip("far"),
        )
    if anim == "run":
        bob = spec.extra.get("bob", 0.0)
        return replace(
            spec,
            prop=replace(_KEYTAR, angle=13 + 3 * wave(p * 2), at=(3.0, 5.5 - 0.35 * bob)),
            near_hand=Grip("keys_left", (0, -1)),
            far_hand=Grip("far"),
        )
    if anim == "jump":
        return replace(spec, prop=replace(_KEYTAR, angle=20 + 3 * i, at=(3.0, 6.0 + i * 0.5)),
                       near_hand=Grip("near"), far_hand=Grip("far"))
    if anim == "fall":
        return replace(spec, prop=replace(_KEYTAR, angle=10 + (i % 2), at=(3.0, 8.0)),
                       near_hand=Grip("near"), far_hand=Grip("far"))
    if anim == "hurt":
        return replace(spec, prop=replace(_KEYTAR, angle=26 - 3 * i, at=(4.0, 7.5 - 0.4 * i)),
                       near_hand=Grip("near"), far_hand=Grip("far"))
    return spec


def hackerman_attack() -> List[FrameSpec]:
    """Typing flurry: fingers hammer the keys, a lit key per strike, bolts leave the front end.

    Four frames at 20 fps (0.2 s) fit the 0.22 s fire rate, so holding attack loops the flurry.
    """
    out = []
    base = planted(Pose(lean=4.0, chest_lean=4.0, hip_yaw=30.0, chest_yaw=50.0, neck=4.0, y=-0.8),
                   near=(4.0, 0.8), far=(-3.0, -0.6))
    hits = [(-1.5, "lit:1+4"), (0.0, ""), (-1.5, "lit:3+6"), (-0.5, "lit:5")]
    for i, (dip, lit) in enumerate(hits):
        spec = FrameSpec(
            base.but(y=-0.8 + (0.3 if i % 2 == 0 else 0.0)),
            face="focus",
            glint=i == 0,
            prop=replace(_KEYTAR, angle=13.0 - (1.5 if i == 0 else 0.0), at=(4.0, 5.2), variant=lit),
            near_hand=Grip("keys", (-2 + 3 * (i % 2), dip)),
            far_hand=Grip("keys_right", (2.0, -1.0 + (0.0 if i % 2 else -1.0))),
            anchors={"muzzle": "muzzle"},
            extra={"swing": 0.1 * (-1) ** i},
        )
        out.append(spec)
    return out


def hackerman_skill() -> List[FrameSpec]:
    """EXECUTE: the near hand winds up high and smashes Enter; the keyboard bucks forward and
    he holds it out like a launcher while the code goes (full-stack beam, agent summon)."""
    keys = [
        # (lean, y, near hand target offset (grip, dx, dy), keyboard angle, at, face, hair, smear)
        (-4.0, -1.5, ("keys", -1.0, -9.0), 18.0, (2.0, 4.5), "focus", "rest", False),
        (-8.0, -1.0, ("keys", -3.0, -15.0), 20.0, (1.5, 4.5), "focus", "lift", False),
        (10.0, -2.0, ("muzzle", -4.0, -1.0), 8.0, (5.0, 4.5), "cheer", "squash", True),
        (14.0, -2.5, ("muzzle", -4.0, 0.0), 4.0, (7.0, 6.0), "cheer", "sweep", False),
        (12.0, -2.0, ("muzzle", -4.0, 0.0), 5.0, (7.0, 6.0), "cheer", "sweep", False),
        (10.0, -1.5, ("muzzle", -4.0, 0.0), 6.0, (6.5, 6.0), "focus", "rest", False),
        (6.0, -1.0, ("keys", 0.0, -1.0), 9.0, (5.5, 5.5), "focus", "rest", False),
        (3.0, -0.6, ("keys_left", 0.0, 0.0), 13.0, (4.0, 5.0), "smile", "rest", False),
    ]
    out = []
    for i, (lean, y, (grip, dx, dy), angle, at, face, hair, smeared) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=2.0, y=y, hip_yaw=30.0, chest_yaw=50.0),
                       near=(5.0, 0.8), far=(-4.0, -0.6))
        lit = "lit:0+1+2+3+4+5+6+7,glow:1" if 2 <= i <= 4 else "glow:0"
        out.append(FrameSpec(
            base, face=face, hair=hair, glint=i == 3,
            prop=PropPose(angle=angle, at=at, depth=6.5, variant=lit),
            near_hand=Grip(grip, (dx, dy), depth=2.0),
            far_hand=Grip("far"),
            anchors={"hand": "muzzle"},
            smear=("near",) if smeared else (),
            extra={"swing": -0.6 if 2 <= i <= 4 else 0.2},
        ))
    return out


def hackerman_victory() -> List[FrameSpec]:
    """Keyboard hoisted overhead, a happy bounce, the underglow cycling through RGB."""
    out = []
    for i in range(VICTORY_FRAMES):
        t = i / VICTORY_FRAMES
        bounce = abs(math.sin(2 * math.pi * t))  # two hops per loop
        base = planted(Pose(lean=-4.0, chest_lean=-4.0, y=-1.5 + 1.8 * bounce, hip_yaw=32.0, chest_yaw=54.0,
                            neck=-4.0), near=(3.5, 0.8), far=(-3.0, -0.6))
        out.append(FrameSpec(
            base, face="cheer" if bounce > 0.5 else "smile", hair="lift" if 0.3 < (t * 2) % 1 < 0.6 else "rest",
            glint=i in (2, 8),
            prop=PropPose(angle=-4.0 + 4.0 * math.sin(4 * math.pi * t), at=(1.0, 21.0 + 1.8 * bounce), depth=4.0,
                          from_chest=False, variant=f"glow:{i % 5}"),
            near_hand=Grip("near", (3.0, 2.0), depth=1.0, pole=(-0.2, -1.0, 0.6)),
            far_hand=Grip("far", (-2.0, 2.0), depth=1.0, pole=(-0.2, -1.0, -0.6)),
            extra={"swing": 0.3 * math.sin(4 * math.pi * t)},
        ))
    return out


# ── ARTSY: the Olympic White Strat ───────────────────────────────────────────────

_SLUNG = PropPose(angle=24.0, at=(-1.0, 3.0), depth=6.0)


def _strap(sk, spec: FrameSpec, placed):
    if placed is None:
        return []
    return strap(sk, placed.grip("horn"))


def artsy_carry(anim: str, i: int, spec: FrameSpec) -> FrameSpec:
    p = spec.extra.get("phase", 0.0)
    if anim == "idle":
        breath = spec.extra.get("breath", 0.0)
        pick = (0.0, -1.0) if i in (2, 3, 8, 9) else (0.0, 0.0)
        return replace(spec, prop=replace(_SLUNG, at=(-1.0, 3.0 + 0.3 * breath)), near_hand=Grip("strum", pick),
                       far_hand=Grip("neck", (-1.0 if i < 6 else 1.0, 0.0)))
    if anim == "run":
        bob = spec.extra.get("bob", 0.0)
        return replace(spec, prop=replace(_SLUNG, angle=27 + 3 * wave(p * 2, 0.1), at=(0.0, 3.5 - 0.35 * bob)),
                       far_hand=Grip("neck"))
    if anim == "jump":
        return replace(spec, prop=replace(_SLUNG, angle=30 + 3 * i, at=(0.0, 4.5 + 0.5 * i)), far_hand=Grip("neck"))
    if anim == "fall":
        return replace(spec, prop=replace(_SLUNG, angle=18 + (i % 2), at=(0.0, 6.0)), far_hand=Grip("neck"))
    if anim == "hurt":
        return replace(spec, prop=replace(_SLUNG, angle=40 - 4 * i, at=(0.0, 6.0 - 0.5 * i)), far_hand=Grip("neck"))
    return spec


def artsy_attack() -> List[FrameSpec]:
    """Power strum: the hand rips down across the strings on frame 0 (paint flies), follows
    through, the strings ring, and the arm winds back up for the next strum.
    Six frames at 20 fps = 0.3 s, Artsy's fire rate."""
    keys = [
        # (near hand offset from strum, guitar angle, lean, face, ring, smear)
        ((1.0, 6.0), 21.0, 6.0, "cheer", 0, True),
        ((3.0, 9.0), 20.0, 7.0, "cheer", 1, False),
        ((1.0, 6.0), 23.0, 5.0, "smile", 2, False),
        ((-1.0, 1.0), 24.0, 4.0, "smile", 3, False),
        ((-2.0, -5.0), 25.0, 3.0, "focus", -1, False),
        ((-2.0, -8.0), 25.0, 2.0, "focus", -1, False),
    ]
    out = []
    for i, ((dx, dy), angle, lean, face, ring, smeared) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=2.0, hip_yaw=30.0, chest_yaw=50.0, y=-0.8),
                       near=(4.0, 0.8), far=(-3.5, -0.6))
        out.append(FrameSpec(
            base, face=face, hair="sweep" if i < 2 else "rest", glint=i == 2,
            prop=replace(_SLUNG, angle=angle, variant=f"ring:{ring}" if ring >= 0 else ""),
            near_hand=Grip("strum", (dx, dy), depth=2.0),
            far_hand=Grip("neck"),
            anchors={"muzzle": "muzzle"},
            smear=("near",) if smeared else (),
        ))
    return out


def artsy_skill() -> List[FrameSpec]:
    """The windmill: the picking arm swings back and all the way over, crashes down on the
    strings (the POWER CHORD shockwave / the potion moment), then the rock-star hold with
    the neck raised. `hand` follows the picking hand; `guitar` marks the strum point."""
    keys = [
        # (lean, guitar angle, near arm (swing, spread, bend) or None for a strum grip, face, hair, smear)
        (-6.0, 26.0, (-60.0, 20.0, 20.0), "focus", "rest", False),
        (-10.0, 28.0, (-150.0, 20.0, 10.0), "focus", "lift", True),
        (-6.0, 30.0, (150.0, 16.0, 10.0), "cheer", "lift", True),
        (14.0, 22.0, None, "cheer", "squash", True),
        (10.0, 34.0, (-110.0, 24.0, 10.0), "cheer", "sweep", True),
        (-8.0, 44.0, (-150.0, 30.0, 14.0), "cheer", "lift", False),
        (-8.0, 46.0, (-152.0, 30.0, 14.0), "cheer", "rest", False),
        (-2.0, 32.0, (-40.0, 20.0, 40.0), "smile", "rest", False),
    ]
    out = []
    for i, (lean, angle, arm, face, hair, smeared) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=-2.0, hip_yaw=30.0, chest_yaw=54.0, y=-1.2),
                       near=(5.0, 0.8), far=(-4.5, -0.6))
        spec = FrameSpec(
            base if arm is None else base.but(near_arm=Limb(swing=arm[0], spread=arm[1], bend=arm[2])),
            face=face, hair=hair, glint=i == 6,
            prop=replace(_SLUNG, angle=angle, at=(0.0, 4.0 if i < 5 else 5.5), variant="ring:%d" % i if i >= 3 else ""),
            near_hand=Grip("strum", (1.0, 3.0), depth=2.0) if arm is None else None,
            far_hand=Grip("neck", (2.0 if i >= 5 else 0.0, 0.0)),
            anchors={"hand": "near_hand", "guitar": "strum", "mouth": "mouth"},
            smear=("near",) if smeared else (),
        )
        out.append(spec)
    return out


def artsy_victory() -> List[FrameSpec]:
    """Rock star: neck pointed at the sky, head-banging, the picking hand windmilling."""
    out = []
    for i in range(VICTORY_FRAMES):
        t = i / VICTORY_FRAMES
        bang = math.sin(4 * math.pi * t)
        base = planted(Pose(lean=-6.0 + 5.0 * bang, chest_lean=-2.0, y=-1.5 + 0.8 * bang, hip_yaw=32.0,
                            chest_yaw=56.0, neck=6.0 * bang), near=(5.0, 0.8), far=(-4.5, -0.6))
        arm_angle = -170.0 + 360.0 * t
        out.append(FrameSpec(
            base.but(near_arm=Limb(swing=arm_angle, spread=26, bend=12)),
            face="cheer" if bang > -0.2 else "smile", hair="lift" if bang < -0.4 else ("squash" if bang > 0.6 else "rest"),
            glint=i == 4,
            prop=replace(_SLUNG, angle=50.0 + 4.0 * bang, at=(0.5, 5.5), variant=f"ring:{i}"),
            far_hand=Grip("neck", (2.0, 0.0)),
            smear=("near",),
        ))
    return out


# ── STRATEGY: white shirt, blazer, a pad of sticky notes ─────────────────────────


NOTE = Sprite.parse("""
OOOO
OyyO
OyYO
OOOO
""", {"O": "#3a2808", "y": "#ffe14d", "Y": "#e0a82a"})

_PAD = HandItem("far", PAD.sprite, (2, 2))


def strategy_carry(anim: str, i: int, spec: FrameSpec) -> FrameSpec:
    p = spec.extra.get("phase", 0.0)
    if anim == "idle":
        breath = spec.extra.get("breath", 0.0)
        return replace(
            spec,
            pose=spec.pose.but(
                near_arm=Limb(swing=-6.0, spread=30.0, bend=110.0 + 2 * breath, twist=40.0),
                far_arm=Limb(swing=40.0, spread=6.0, bend=95.0),
            ),
            items=(_PAD,),
        )
    if anim == "run":
        return replace(spec, items=(_PAD,))
    return replace(spec, items=(_PAD,))


def strategy_attack() -> List[FrameSpec]:
    """Shuriken flick: release on frame 0 (arm whipped forward, smear behind it), follow
    through, pluck the next note off the pad, cock it by the ear."""
    keys = [
        # (near arm swing, spread, bend, lean, face, item on near hand, smear)
        (95.0, 14.0, 6.0, 8.0, "focus", False, True),
        (70.0, 30.0, 40.0, 9.0, "smile", False, False),
        (40.0, 20.0, 100.0, 5.0, "smile", True, False),
        (10.0, 30.0, 140.0, 2.0, "focus", True, False),
    ]
    out = []
    for i, (swing, spread, bend, lean, face, has_note, smeared) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=3.0, hip_yaw=28.0, chest_yaw=52.0 + (8.0 if i == 0 else 0.0), y=-0.8),
                       near=(4.5, 0.8), far=(-3.5, -0.6))
        pose = base.but(near_arm=Limb(swing=swing, spread=spread, bend=bend),
                        far_arm=Limb(swing=40.0, spread=6.0, bend=95.0))
        items = (_PAD,) + ((HandItem("near", NOTE, (1, 2)),) if has_note else ())
        out.append(FrameSpec(pose, face=face, glint=i == 1, items=items, anchors={"muzzle": "near_hand"},
                             smear=("near",) if smeared else ()))
    return out


def strategy_skill() -> List[FrameSpec]:
    """North Star / Churn Shield: gather, then thrust the open hand up and out to the sky
    and hold the visionary pose; `hand` is the raised hand."""
    keys = [
        (-10.0, 30.0, 120.0, 4.0, -1.5, "focus", "rest", False),
        (-20.0, 24.0, 130.0, 6.0, -2.0, "focus", "rest", False),
        (150.0, 20.0, 10.0, -8.0, -0.5, "cheer", "squash", True),
        (160.0, 18.0, 4.0, -10.0, 0.0, "cheer", "lift", False),
        (158.0, 18.0, 6.0, -9.0, 0.0, "cheer", "rest", False),
        (156.0, 18.0, 8.0, -8.0, 0.0, "smile", "rest", False),
        (130.0, 20.0, 30.0, -5.0, -0.5, "smile", "rest", False),
        (60.0, 24.0, 70.0, -2.0, -0.8, "smile", "rest", False),
    ]
    out = []
    for i, (swing, spread, bend, lean, y, face, hair, smeared) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=-3.0, hip_yaw=30.0, chest_yaw=54.0, y=y, neck=-4.0 if i >= 2 else 0.0),
                       near=(5.0, 0.8), far=(-4.0, -0.6))
        pose = base.but(near_arm=Limb(swing=swing, spread=spread, bend=bend),
                        far_arm=Limb(swing=30.0, spread=8.0, bend=95.0))
        out.append(FrameSpec(pose, face=face, hair=hair, glint=i in (3, 4), items=(_PAD,),
                             anchors={"hand": "near_hand"}, smear=("near",) if smeared else ()))
    return out


def strategy_victory() -> List[FrameSpec]:
    """Two fist pumps, then a confident thumbs-up hold with a glint."""
    pumps = [140.0, 160.0, 120.0, 160.0, 120.0, 160.0]
    out = []
    for i in range(VICTORY_FRAMES):
        t = i / VICTORY_FRAMES
        if i < 6:
            swing, bend = pumps[i], 20.0 if pumps[i] > 150 else 60.0
            face = "cheer"
        else:
            swing, bend = 70.0, 100.0
            face = "smile"
        hop = 1.6 * abs(math.sin(math.pi * (i / 3))) if i < 6 else 0.0
        base = planted(Pose(lean=-3.0, chest_lean=-2.0, y=-1.0 + hop, hip_yaw=32.0, chest_yaw=56.0),
                       near=(4.0, 0.8), far=(-3.0, -0.6))
        pose = base.but(near_arm=Limb(swing=swing, spread=20.0, bend=bend), far_arm=Limb(swing=40.0, spread=6.0, bend=95.0))
        out.append(FrameSpec(pose, face=face, hair="lift" if hop > 1.0 else "rest", glint=i in (8, 9), items=(_PAD,)))
    return out


HACKERMAN_HERO = Hero(
    "hackerman",
    Character("hackerman", HACKERMAN, prop=KEYBOARD, extras=(_strings,)),
    hackerman_carry,
    hackerman_attack,
    hackerman_skill,
    hackerman_victory,
    sleeve="hoodie",
)
ARTSY_HERO = Hero(
    "artsy",
    Character("artsy", ARTSY, cap=True, prop=STRAT, extras=(_strap,)),
    artsy_carry,
    artsy_attack,
    artsy_skill,
    artsy_victory,
    sleeve="knit_dark",
)
STRATEGY_HERO = Hero(
    "strategy",
    Character("strategy", STRATEGY),
    strategy_carry,
    strategy_attack,
    strategy_skill,
    strategy_victory,
    sleeve="blazer",
)

HEROES: Dict[str, Hero] = {h.id: h for h in (HACKERMAN_HERO, ARTSY_HERO, STRATEGY_HERO)}
