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

from . import hands, ramps
from .anim import ease_in_out, fan_smear, foot_path, wave
from .canvas import Sprite
from .compose import Character, FrameSpec, Grip, HandAt, HandItem, Overlay, PropPose
from .outfits import ARTSY, HACKERMAN, STRATEGY, drawstrings, strap
from .props import KEYBOARD, PAD, STRAT
from .rig import Build, Limb, Pose, solve

BUILD = Build()

FPS = {"idle": 10, "run": 15, "jump": 12, "fall": 10, "attack": 20, "skill": 20, "hurt": 20, "victory": 10}
LOOP = {"idle": True, "run": True, "jump": False, "fall": True, "attack": False, "skill": False, "hurt": False,
        "victory": True}
#: Animations whose smears wrap from the last frame to the first: the attack restarts on
#: every shot while the button is held, so its wind-up leads straight into frame 0.
SMEAR_WRAP = {"idle", "run", "fall", "attack", "victory"}
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
    pose = planted(pose, near=(5.4, 1.0), far=(-4.2, -0.8), near_pitch=4.0)
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
    """Falling: tipped back a touch, the near knee drawn up and the far leg reaching for the
    ground, arms up for balance; hair and strings stream upwards and flutter (2-frame beat)."""
    flutter = (-1) ** i
    base = Pose(lean=-5.0, chest_lean=-3.0, y=1.5, hip_yaw=24.0, chest_yaw=46.0, neck=3.0, roll=-2.0)
    (nx, nz), (fx, fz) = _hips(base)
    pose = replace(
        base,
        near_leg=Limb(target=(nx + 4.5, BUILD.ankle_height + 7.0 + 0.6 * flutter, nz + 0.6), end=-6.0),
        far_leg=Limb(target=(fx - 2.5, BUILD.ankle_height + 2.0 - 0.6 * flutter, fz - 0.4), end=-24.0),
        near_arm=Limb(swing=110 + 5 * flutter, spread=40, bend=40),
        far_arm=Limb(swing=70 - 5 * flutter, spread=36, bend=30),
    )
    return FrameSpec(pose, hair="lift", face="smile", head_dy=-1 if i % 2 else 0,
                     extra={"phase": i / 4.0, "swing": 2.7 + 0.25 * flutter})


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


def arm_smear(sleeve: str) -> Callable[..., Optional[Overlay]]:
    """A smear frame: the fan the forearm sweeps since the last frame, in the sleeve's
    lighter tones with the hand's skin on the leading edge."""
    ramp = ramps.RAMPS[sleeve]
    skin = ramps.RAMPS["skin"]

    def make(hand: str, prev: Tuple[Tuple[int, int], Tuple[int, int]],
             cur: Tuple[Tuple[int, int], Tuple[int, int]]) -> Optional[Overlay]:
        (_, ph), (_, ch) = prev, cur
        if abs(ph[0] - ch[0]) + abs(ph[1] - ch[1]) < 5:
            return None
        sprite = fan_smear(prev, cur, inner=ramp.tones[2], outer=ramp.tones[3], edge=skin.tones[3])
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

#: Held nearly flat at the waist so the keycaps stay crisp; it sways a few degrees in motion.
_KEYTAR = PropPose(angle=10.0, at=(6.5, 4.5), depth=6.5)


def _strings(sk, spec: FrameSpec, placed):
    return drawstrings(sk, spec.extra.get("swing", 0.0))


def _typing(near_down: bool, lift: float = 1.5) -> dict:
    """Both hands on the keys, drawn by hand: one strikes while the other lifts."""
    near = hands.TYPE_DOWN if near_down else hands.TYPE_UP
    far = hands.TYPE_UP if near_down else hands.TYPE_DOWN
    return dict(
        near_hand=Grip("keys_left", (-1.0, -3.0 - (0.0 if near_down else lift)), depth=2.0),
        far_hand=Grip("keys_right", (1.0, -3.0 - (lift if near_down else 0.0)), depth=2.0),
        hide_hands=("near", "far"),
        items=(HandItem("near", near, hands.PIVOTS["type_down"], dz=1.0),
               HandItem("far", far, hands.PIVOTS["type_down"], dz=1.0)),
    )


def _gripping() -> dict:
    """Hands on the ends, carrying it like a keytar."""
    return dict(near_hand=Grip("near", (1.0, -1.0), depth=1.5), far_hand=Grip("far", (0.0, -1.0), depth=1.5))


def hackerman_carry(anim: str, i: int, spec: FrameSpec) -> FrameSpec:
    p = spec.extra.get("phase", 0.0)
    if anim == "idle":
        breath = spec.extra.get("breath", 0.0)
        tap = i in (5, 6)
        return replace(
            spec,
            prop=replace(_KEYTAR, at=(6.5, 4.5 + 0.3 * breath), variant="lit:2" if i == 6 else ""),
            **_typing(near_down=i != 5, lift=1.5 if tap else 0.0),
        )
    if anim == "run":
        bob = spec.extra.get("bob", 0.0)
        return replace(spec, prop=replace(_KEYTAR, angle=10 + 3 * wave(p * 2), at=(5.5, 5.0 - 0.35 * bob)),
                       **_gripping())
    if anim == "jump":
        return replace(spec, prop=replace(_KEYTAR, angle=14 + 3 * i, at=(5.0, 6.0 + i * 0.5)), **_gripping())
    if anim == "fall":
        return replace(spec, prop=replace(_KEYTAR, angle=6 + (i % 2), at=(5.0, 8.0)), **_gripping())
    if anim == "hurt":
        return replace(spec, prop=replace(_KEYTAR, angle=22 - 3 * i, at=(5.5, 7.5 - 0.4 * i)), **_gripping())
    return spec


def hackerman_attack() -> List[FrameSpec]:
    """Typing flurry: hands alternate on the keys, the struck keys flash green, a bolt
    leaves the front end on frame 0. Four frames at 20 fps (0.2 s) fit the 0.22 s fire
    rate, so holding attack loops the flurry seamlessly."""
    out = []
    lit = ["lit:1+4", "lit:3", "lit:6+0", "lit:5"]
    for i in range(4):
        base = planted(Pose(lean=6.0, chest_lean=6.0, hip_yaw=30.0, chest_yaw=50.0, neck=6.0,
                            y=-1.2 + (0.3 if i % 2 else 0.0)), near=(5.0, 1.0), far=(-3.6, -0.8))
        out.append(FrameSpec(
            base, face="focus", glint=i == 0,
            prop=replace(_KEYTAR, angle=10.0 - (1.0 if i == 0 else 0.0), variant=lit[i] + ",glow:%d" % (i % 2)),
            anchors={"muzzle": "muzzle"},
            extra={"swing": 0.12 * (-1) ** i},
            **_typing(near_down=i % 2 == 0),
        ))
    return out


def hackerman_skill() -> List[FrameSpec]:
    """EXECUTE: the near hand winds up high and smashes Enter; every key lights, the
    keyboard bucks forward and he holds it out like a launcher while the code goes
    (FULL-STACK ATTACK's beam, AGENT SUMMON's drone). `hand` is the keyboard's front end."""
    keys = [
        # (lean, y, near arm or None (typing), keyboard angle, at, face, hair, smear, lit)
        (-4.0, -1.6, HandAt(19.0, 17.0, depth=4.0), 12.0, (5.5, 4.0), "focus", "rest", False, ""),
        (-9.0, -0.8, HandAt(17.0, 6.0, depth=3.0), 13.0, (5.0, 4.5), "focus", "lift", False, ""),
        (14.0, -2.8, None, 4.0, (8.5, 4.5), "cheer", "squash", True, "lit:0+1+2+3+4+5+6+7,glow:1"),
        (18.0, -3.2, None, -4.0, (11.0, 7.0), "cheer", "sweep", False, "lit:0+1+2+3+4+5+6+7,glow:1"),
        (16.0, -3.0, None, -3.0, (11.0, 7.0), "cheer", "sweep", False, "lit:0+2+4+6,glow:1"),
        (12.0, -2.2, None, 0.0, (9.5, 6.0), "focus", "rest", False, "lit:1+3+5,glow:0"),
        (7.0, -1.4, None, 7.0, (7.5, 5.0), "focus", "rest", False, "lit:2"),
        (4.0, -1.0, None, 10.0, (6.5, 4.5), "smile", "rest", False, ""),
    ]
    out = []
    for i, (lean, y, arm, angle, at, face, hair, smeared, lit) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=2.0, y=y, hip_yaw=30.0, chest_yaw=50.0),
                       near=(5.5, 1.0), far=(-4.2, -0.8))
        if arm is not None:
            spec = FrameSpec(base, face=face, hair=hair, near_hand=arm,
                             prop=PropPose(angle=angle, at=at, depth=6.5, variant=lit),
                             far_hand=Grip("far", (0.0, -1.0), depth=1.5),
                             hide_hands=("near",), items=(HandItem("near", hands.FIST, hands.PIVOTS["fist"], dz=3.0),),
                             anchors={"hand": "muzzle"}, extra={"swing": 0.3})
        else:
            typing = _typing(near_down=True, lift=0.0)
            if i == 2:  # the smash lands on Enter, at the keyboard's right end
                typing["near_hand"] = Grip("keys_right", (3.0, -3.0), depth=2.5)
            spec = FrameSpec(base, face=face, hair=hair, glint=i == 3,
                             prop=PropPose(angle=angle, at=at, depth=6.5, variant=lit),
                             anchors={"hand": "muzzle"}, smear=("near",) if smeared else (),
                             extra={"swing": -0.6 if 2 <= i <= 4 else 0.1}, **typing)
        out.append(spec)
    return out


def hackerman_victory() -> List[FrameSpec]:
    """The hype pump: he hoists the keyboard to his chest twice a loop with a hop, every key
    lit at the top, the underglow cycling through RGB."""
    out = []
    for i in range(VICTORY_FRAMES):
        t = i / VICTORY_FRAMES
        pump = max(0.0, math.sin(4 * math.pi * t))
        base = planted(Pose(lean=-3.0, chest_lean=-3.0, y=-1.2 + 1.6 * pump, hip_yaw=32.0, chest_yaw=54.0,
                            neck=-3.0), near=(4.5, 1.0), far=(-3.6, -0.8), near_lift=1.2 * pump, far_lift=1.2 * pump)
        lit = "lit:0+1+2+3+4+5+6+7," if pump > 0.7 else ""
        out.append(FrameSpec(
            base, face="cheer" if pump > 0.3 else "smile", hair="lift" if 0.2 < pump < 0.8 and i % 6 < 3 else "rest",
            glint=i in (3, 9),
            prop=PropPose(angle=6.0 - 6.0 * pump, at=(6.5, 4.5 + 5.5 * pump), depth=6.5, variant=f"{lit}glow:{i % 3}"),
            near_hand=Grip("near", (1.0, -1.0), depth=1.5), far_hand=Grip("far", (0.0, -1.0), depth=1.5),
            extra={"swing": 0.35 * math.sin(4 * math.pi * t + 1.0)},
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
    """Power strum. Frame 0 is the rip: the hand has torn down across the strings (a fan
    smear from the wind-up crosses them) and the paint flies off the guitar. Then the
    follow-through, the guitar bucking with the strings ringing, and the hand climbs back
    above the strings to wind up the next strum. Six frames at 20 fps = 0.3 s, his fire rate."""
    keys = [
        # (near hand, guitar angle, lean, face, hair, ring, smear)
        (HandAt(37.0, 34.0, 7.0), 21.0, 7.0, "cheer", "sweep", 0, True),
        (HandAt(38.0, 36.0, 7.0), 20.0, 8.0, "cheer", "sweep", 1, False),
        (HandAt(36.0, 33.0, 7.0), 23.0, 6.0, "smile", "rest", 2, False),
        (HandAt(34.0, 29.0, 7.0), 24.0, 4.0, "smile", "rest", 3, False),
        (HandAt(31.0, 24.0, 6.0), 25.0, 2.0, "focus", "rest", -1, False),
        (HandAt(30.0, 21.0, 6.0), 25.0, 1.0, "focus", "lift", -1, False),
    ]
    out = []
    for i, (hand, angle, lean, face, hair, ring, smeared) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=2.0, hip_yaw=30.0, chest_yaw=50.0, y=-1.0),
                       near=(5.0, 1.0), far=(-4.0, -0.8))
        out.append(FrameSpec(
            base, face=face, hair=hair, glint=i == 2,
            prop=replace(_SLUNG, angle=angle, at=(0.0, 5.0), variant=f"ring:{ring}" if ring >= 0 else ""),
            near_hand=hand, far_hand=Grip("neck"),
            anchors={"muzzle": "muzzle"},
            smear=("near",) if smeared else (),
        ))
    return out


def artsy_skill() -> List[FrameSpec]:
    """The windmill: the picking arm swings back, up past his shoulder and over the top,
    crashes down across the strings (POWER CHORD's shockwave, frame 3 at `guitar`), follows
    through, and flings up into the rock-star hold with the neck raised. `hand` follows the
    picking hand (UX ELIXIR's potion), `mouth` is his lips, `guitar` the strum point."""
    keys = [
        # (near hand: HandAt or None = on the strings, lean, guitar angle, face, hair, smear, ring)
        (HandAt(19.0, 40.0, 5.0), -6.0, 26.0, "focus", "rest", False, -1),
        (HandAt(15.0, 15.0, 4.0), -11.0, 28.0, "focus", "lift", True, -1),
        (HandAt(31.0, 3.0, 3.0), -8.0, 30.0, "cheer", "lift", True, -1),
        (None, 14.0, 22.0, "cheer", "squash", True, 0),
        (HandAt(36.0, 47.0, 6.0), 11.0, 26.0, "cheer", "sweep", True, 1),
        (HandAt(16.0, 13.0, 3.0), -9.0, 44.0, "cheer", "lift", True, 2),
        (HandAt(16.0, 12.0, 3.0), -9.0, 46.0, "cheer", "rest", False, 3),
        (HandAt(22.0, 30.0, 5.0), -3.0, 32.0, "smile", "rest", False, -1),
    ]
    out = []
    for i, (hand, lean, angle, face, hair, smeared, ring) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=-2.0, hip_yaw=30.0, chest_yaw=54.0, y=-1.4),
                       near=(5.5, 1.0), far=(-4.8, -0.8))
        near = hand if hand is not None else Grip("strum", (1.0, 3.0), depth=2.5)
        out.append(FrameSpec(
            base, face=face, hair=hair, glint=i == 6,
            prop=replace(_SLUNG, angle=angle, at=(0.0, 4.0 if i < 5 else 5.5), variant=f"ring:{ring}" if ring >= 0 else ""),
            near_hand=near,
            far_hand=Grip("neck", (2.0 if i >= 5 else 0.0, 0.0)),
            anchors={"hand": "near_hand", "guitar": "strum", "mouth": "mouth"},
            smear=("near",) if smeared else (),
        ))
    return out


def artsy_victory() -> List[FrameSpec]:
    """Rock star in a wide stance: neck aimed at the sky, two huge strums per loop with a
    head-bang on each, the picking fist thrown up between them, strings ringing."""
    # (near hand, lean, neck/head nod, face, hair, smear, ring)
    beats = [
        (None, 8.0, 4.0, "cheer", "squash", True, 0),
        (HandAt(34.0, 47.0, 6.0), 9.0, 6.0, "cheer", "rest", True, 1),
        (HandAt(25.0, 32.0, 5.0), 2.0, 0.0, "smile", "rest", False, 2),
        (HandAt(17.0, 14.0, 3.0), -7.0, -5.0, "cheer", "lift", True, 3),
        (HandAt(17.0, 13.0, 3.0), -8.0, -6.0, "cheer", "lift", False, 4),
        (HandAt(19.0, 18.0, 3.0), -6.0, -3.0, "smile", "rest", False, -1),
    ]
    out = []
    for i in range(VICTORY_FRAMES):
        hand, lean, nod, face, hair, smeared, ring = beats[i % len(beats)]
        base = planted(Pose(lean=lean, chest_lean=-2.0, y=-2.2, hip_yaw=32.0, chest_yaw=56.0, neck=nod),
                       near=(6.5, 1.2), far=(-5.5, -0.8))
        near = hand if hand is not None else Grip("strum", (1.0, 3.0), depth=2.5)
        out.append(FrameSpec(
            base, face=face, hair=hair, glint=i in (4, 10),
            prop=replace(_SLUNG, angle=48.0 + (4.0 if lean > 0 else 0.0), at=(0.5, 5.0), variant=f"ring:{ring}" if ring >= 0 else ""),
            near_hand=near, far_hand=Grip("neck", (3.0, 0.0)),
            smear=("near",) if smeared else (),
        ))
    return out


# ── STRATEGY: white shirt, blazer, a pad of sticky notes ─────────────────────────


NOTE = Sprite.parse("""
OOOO
OffO
OyYO
OOOO
""", {"O": "#c08a10", "y": "#ffe14d", "Y": "#e0a82a", "f": "#fff6c0"})

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
    if anim == "jump":
        # Near arm swings up and back for lift, the pad hand stays out front.
        near = [HandAt(21.0, 30.0, 4.0), HandAt(19.0, 24.0, 4.0), HandAt(18.0, 21.0, 4.0), HandAt(18.0, 20.0, 4.0)][i]
        far = [HandAt(41.0, 34.0, 1.0), HandAt(43.0, 31.0, 1.0), HandAt(44.0, 29.0, 1.0), HandAt(44.0, 28.0, 1.0)][i]
        return replace(spec, near_hand=near, far_hand=far, items=(_PAD,))
    if anim == "fall":
        flutter = (-1) ** i
        return replace(spec, near_hand=HandAt(17.0, 19.0 + flutter, 4.0), far_hand=HandAt(45.0, 22.0 - flutter, 1.0),
                       items=(_PAD,))
    return replace(spec, items=(_PAD,))


_PAD_NEAR = HandItem("near", PAD.sprite, (2, 2), dz=1.0)


def strategy_attack() -> List[FrameSpec]:
    """Shuriken flick. Frame 0 is the release (the note spawns now): the arm whipped out
    forward, a smear behind it. Then follow-through across the body, pluck the next note
    off the pad, and cock it back by the ear: the anticipation for the next throw."""
    keys = [
        # (hand target, lean, chest yaw, face, note in hand, smear)
        (HandAt(49.0, 25.0, 3.0), 9.0, 40.0, "focus", False, True),
        (HandAt(44.0, 33.0, 4.0), 10.0, 44.0, "smile", False, False),
        (HandAt(39.0, 29.0, 6.0), 6.0, 50.0, "smile", True, False),
        (HandAt(23.0, 21.0, 3.0), 2.0, 58.0, "focus", True, False),
    ]
    out = []
    for i, (hand, lean, chest_yaw, face, has_note, smeared) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=3.0, hip_yaw=28.0, chest_yaw=chest_yaw, y=-0.9),
                       near=(5.5, 1.0), far=(-4.0, -0.8))
        items = (_PAD,) + ((HandItem("near", NOTE, (1, 2), dz=1.5),) if has_note else ())
        out.append(FrameSpec(base, face=face, glint=i == 1, near_hand=hand, far_hand=HandAt(38.0, 31.0, 1.5),
                             items=items, anchors={"muzzle": "near_hand"}, smear=("near",) if smeared else ()))
    return out


def strategy_skill() -> List[FrameSpec]:
    """NORTH STAR / CHURN SHIELD: gather in, then fling the open far hand up and out to the
    sky and hold the visionary pose while the star launches; `hand` is that raised hand."""
    keys = [
        # (far hand target, lean, y, face, hair, open hand, smear)
        (HandAt(40.0, 34.0, 2.0), 6.0, -1.8, "focus", "rest", False, False),
        (HandAt(37.0, 37.0, 3.0), 8.0, -2.4, "focus", "rest", False, False),
        (HandAt(48.0, 8.0, 1.0), -6.0, -0.4, "cheer", "squash", True, True),
        (HandAt(49.0, 6.0, 1.0), -8.0, 0.0, "cheer", "lift", True, False),
        (HandAt(49.0, 7.0, 1.0), -7.0, 0.0, "cheer", "rest", True, False),
        (HandAt(48.0, 8.0, 1.0), -6.0, -0.2, "smile", "rest", True, False),
        (HandAt(46.0, 14.0, 1.0), -4.0, -0.6, "smile", "rest", True, False),
        (HandAt(42.0, 26.0, 1.0), -2.0, -0.9, "smile", "rest", False, False),
    ]
    out = []
    for i, (hand, lean, y, face, hair, open_hand, smeared) in enumerate(keys):
        base = planted(Pose(lean=lean, chest_lean=-3.0, hip_yaw=30.0, chest_yaw=52.0, y=y, neck=-6.0 if i >= 2 else 0.0),
                       near=(5.5, 1.0), far=(-4.2, -0.8))
        items = [_PAD_NEAR]
        hide = ()
        if open_hand:
            items.append(HandItem("far", hands.OPEN_UP, hands.PIVOTS["open_up"], dz=1.5))
            hide = ("far",)
        out.append(FrameSpec(base, face=face, hair=hair, glint=i in (3, 4), near_hand=HandAt(30.0, 32.0, 6.0),
                             far_hand=hand, items=tuple(items), hide_hands=hide, anchors={"hand": "far_hand"},
                             smear=("far",) if smeared else ()))
    return out


def strategy_victory() -> List[FrameSpec]:
    """Two fist pumps up and out ("yes!"), then a confident thumbs-up held out with a glint."""
    pumps = [(46.0, 10.0), (44.0, 20.0), (46.0, 9.0), (44.0, 20.0), (46.0, 9.0), (44.0, 18.0)]
    out = []
    for i in range(VICTORY_FRAMES):
        if i < 6:
            hx, hy = pumps[i]
            sprite, pivot, face = hands.FIST, hands.PIVOTS["fist"], "cheer"
            hop = 1.6 if hy < 12 else 0.0
        else:
            hx, hy = 45.0, 25.0 - (1.0 if i in (8, 9) else 0.0)
            sprite, pivot, face = hands.THUMBS_UP, hands.PIVOTS["thumbs_up"], "smile"
            hop = 0.0
        base = planted(Pose(lean=-3.0, chest_lean=-2.0, y=-1.0 + hop, hip_yaw=32.0, chest_yaw=54.0),
                       near=(4.5, 1.0), far=(-3.6, -0.8), near_lift=hop, far_lift=hop)
        out.append(FrameSpec(base, face=face, hair="lift" if hop else "rest", glint=i in (8, 9),
                             near_hand=HandAt(30.0, 33.0, 6.0), far_hand=HandAt(hx, hy, 1.0),
                             hide_hands=("far",), items=(_PAD_NEAR, HandItem("far", sprite, pivot, dz=1.5))))
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
