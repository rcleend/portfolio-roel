"""The Unhappy Customer: a different man, older and stockier, and a caricature.

Bald dome with a grey horseshoe fringe and one heroic comb-over strand, bushy brows, a
bulbous nose, a walrus moustache; a short-sleeved pale-blue dress shirt over a pot belly,
a loud tie, khakis belted high, chunky white dad sneakers, and the phone he keeps
waving at you. Furious (red) until he is won over (calm pink).

Gameplay timing (src/game/entities/customer/*): walks at 30 px/s and shows `walk` frame
time 1/6 s when standing still (frame 2 at 12 fps is the passing pose); `shout` plays
from the start of each wind-up (0.4 s) and recover (0.5 s); `hurt` lasts 0.22 s;
`stunned` up to 3 s (Power Chord); `happy` plays while he cheers and strolls off.
"""

from __future__ import annotations

import math
from dataclasses import replace
from typing import Dict, List, Optional, Tuple

from .anim import foot_path, wave
from .body import Outfit
from .canvas import Sprite
from .compose import Character, FrameSpec, HandItem
from .outfits import PatternResult
from .render3d import Capsule, Ellipsoid, Hit, Prim
from .rig import Build, Limb, Pose, Skeleton, solve

BUILD = Build(
    hip_height=23.0,
    pelvis_to_chest=10.6,
    chest_to_neck=3.6,
    neck_length=1.6,
    hip_half_width=3.0,
    shoulder_half_width=6.4,
    shoulder_drop=1.2,
    thigh=11.4,
    shin=10.2,
    ankle_height=2.0,
    upper_arm=7.4,
    forearm=6.8,
)

FPS = {"walk": 12, "shout": 12, "hurt": 16, "stunned": 10, "happy": 10}
LOOP = {"walk": True, "shout": True, "hurt": False, "stunned": True, "happy": True}
ANIMATIONS = ("walk", "shout", "hurt", "stunned", "happy")
WALK_FRAMES = 8
WALK_SPEED = 30.0
WALK_STANCE = 0.62
WALK_STRIDE = WALK_SPEED / FPS["walk"] * WALK_FRAMES * WALK_STANCE

# ── Head kit ─────────────────────────────────────────────────────────────────────

SKIN_RED = {"o": "#4a1018", "S": "#9a2a30", "s": "#cc4a40", "f": "#e8705a", "F": "#f8a07e", "w": "#ffd8c0"}
SKIN_CALM = {"o": "#5a2a2e", "S": "#a65a56", "s": "#d8876f", "f": "#efb08e", "F": "#fcd3b0", "w": "#ffffff"}
_GREY = {"K": "#2e2a34", "h": "#6a6474", "H": "#a29cac", "L": "#dcd8e2"}
_FIXED = {"e": "#1a1018", "E": "#ffffff", "t": "#fbf3ea", "m": "#3a0a12", "r": "#e05a6a", "n": "#b8283a",
          "N": "#ff8a80", "P": "#ff8a80"}

HEAD_W, HEAD_H = 15, 15
HEAD_PIVOT = (5, 14)

# Two rows of headroom on top, for the comb-over strand standing up.
_HEAD = """
...............
...............
....ooooo......
..ooFFwFFo.....
.oFFFFFffso....
.oFhHHhHHhso...
KofffHffffhHo..
HhosfsHHfHHso..
HhofsfEefeEnn..
KhoSffsfsfSNNn.
.HoSsfhHHHHhnn.
..osfhmttttmho.
..oSsfssffsso..
...oSsssssSo...
....ooooooo....
"""

# The comb-over: lying flat, or standing straight up when he blows his top.
_STRAND_FLAT = [(3, 5, "h"), (4, 5, "H"), (5, 5, "H"), (6, 5, "h"), (7, 5, "H"), (8, 5, "H"), (9, 5, "h")]
_STRAND_UP = [(3, 5, "f"), (4, 5, "F"), (5, 5, "F"), (6, 5, "f"), (7, 5, "f"), (8, 5, "f"), (9, 5, "f"),
              (3, 4, "h"), (4, 3, "h"), (5, 2, "H"), (6, 1, "H"), (7, 0, "H"), (8, 0, "h")]
_STRAND_SIDE = [(3, 5, "f"), (4, 5, "F"), (5, 5, "F"), (6, 5, "f"), (7, 5, "f"), (8, 5, "f"), (9, 5, "f"),
                (2, 4, "h"), (1, 3, "H"), (0, 3, "H"), (0, 2, "h")]

_FACES: Dict[str, List[Tuple[int, int, str]]] = {
    # Furious: the angry V of the brows, eyes glaring, teeth clenched under the moustache.
    "angry": [],
    # Blowing up: brows shot up at the outer ends, eyes wide, mouth a yelling trapdoor.
    "shout": [
        (5, 6, "H"), (6, 6, "f"), (11, 6, "H"), (6, 7, "H"), (7, 7, "H"), (9, 7, "H"), (10, 7, "H"),
        (6, 8, "E"), (7, 8, "e"), (10, 8, "e"), (11, 8, "E"),
        (6, 11, "m"), (7, 11, "t"), (8, 11, "t"), (9, 11, "t"), (10, 11, "m"),
        (5, 12, "o"), (6, 12, "m"), (7, 12, "m"), (8, 12, "r"), (9, 12, "r"), (10, 12, "m"), (11, 12, "o"),
        (6, 13, "o"), (7, 13, "m"), (8, 13, "m"), (9, 13, "m"), (10, 13, "o"),
    ],
    # Ouch: eyes squeezed into slits, brows flung up, a little wobbly "o" of a mouth.
    "hurt": [
        (5, 6, "f"), (6, 6, "H"), (10, 6, "H"), (11, 6, "f"),
        (6, 8, "m"), (7, 8, "m"), (10, 8, "m"), (11, 8, "m"),
        (7, 11, "s"), (8, 11, "m"), (9, 11, "m"), (10, 11, "s"),
        (8, 12, "m"), (9, 12, "m"),
    ],
    # Seeing stars: crossed-out eyes, tongue lolling.
    "stunned": [
        (5, 6, "f"), (6, 6, "H"), (10, 6, "H"), (11, 6, "H"),
        (6, 7, "e"), (8, 7, "e"), (7, 8, "e"), (6, 9, "e"), (8, 9, "e"),
        (10, 7, "e"), (10, 9, "e"), (11, 8, "e"),
        (7, 11, "m"), (8, 11, "m"), (9, 11, "m"), (10, 11, "m"),
        (8, 12, "r"), (9, 12, "P"), (9, 13, "r"),
    ],
    # Won over: happy-arc eyes, a big grin under the moustache, rosy cheeks.
    "happy": [
        (5, 6, "f"), (6, 6, "H"), (7, 6, "H"), (10, 6, "H"), (11, 6, "H"),
        (6, 7, "f"), (7, 7, "f"), (9, 7, "f"), (10, 7, "f"),
        (6, 8, "e"), (7, 7, "e"), (8, 8, "e"), (10, 8, "e"), (11, 7, "e"),
        (5, 9, "P"), (6, 11, "m"), (7, 11, "t"), (8, 11, "t"), (9, 11, "t"), (10, 11, "t"), (11, 11, "m"),
        (7, 12, "m"), (8, 12, "r"), (9, 12, "r"), (10, 12, "m"),
    ],
}


def head(face: str = "angry", strand: str = "flat", calm: bool = False, bob: int = 0) -> Sprite:
    grid = [list(row.ljust(HEAD_W, ".")) for row in _HEAD.strip("\n").split("\n")]
    assert len(grid) == HEAD_H
    for x, y, ch in {"flat": _STRAND_FLAT, "up": _STRAND_UP, "side": _STRAND_SIDE}[strand]:
        grid[y][x] = ch
    for x, y, ch in _FACES[face]:
        grid[y][x] = ch
    palette: Dict[str, str] = {}
    palette.update(SKIN_CALM if calm else SKIN_RED)
    palette.update(_GREY)
    palette.update(_FIXED)
    return Sprite.parse("\n".join("".join(row) for row in grid), palette)


# ── Body ─────────────────────────────────────────────────────────────────────────


def belly(sk: Skeleton) -> List[Prim]:
    f = sk.pelvis_frame
    centre = f.point(sk.pelvis, 2.3, 4.2, 0.0)
    return [Ellipsoid(part="torso", material="shirt_blue", group="torso", center=centre,
                      basis=(f.fwd, f.up, f.side), radii=(4.4, 4.8, 5.4), pattern=_shirt_front)]


def _shirt_front(hit: Hit) -> PatternResult:
    fwd, up, side = hit.local
    if fwd > 0.5 and abs(side + 0.05) < 0.07 and up > -0.6:
        return None, -1  # button placket
    if up < -0.72:
        return "belt", 0  # the belt cinched under the belly
    return None, 0


def tie(sk: Skeleton, flap: float = 0.0) -> List[Prim]:
    """A loud tie from the collar over the belly; `flap` (rad) lifts its tail forward."""
    f = sk.chest_frame
    knot = f.point(sk.neck_base, 2.9, -1.2, 0.6)
    mid = f.point(sk.chest, 4.4, -1.0, 0.7)
    length = 6.0
    tail = (mid[0] + math.sin(flap) * length * 0.8 + f.fwd[0] * 1.5, mid[1] - math.cos(flap) * length, mid[2] + 2.6)
    return [
        Capsule(part="tie", material="tie", group="tie", a=knot, b=mid, ra=0.8, rb=1.0, bias=2.0),
        Capsule(part="tie", material="tie", group="tie", a=mid, b=tail, ra=1.0, rb=1.1, bias=2.0),
    ]


def _khaki(hit: Hit) -> PatternResult:
    t, angle, _ = hit.local
    if abs(angle) < 0.25 and t < 0.9:
        return None, 1  # pressed crease
    return None, 0


OUTFIT = Outfit(
    top="shirt_blue",
    sleeve="shirt_blue",
    trousers="khaki",
    shoe="sneaker",
    bulk=0.9,
    sleeve_bulk=0.5,
    trouser_bulk=0.6,
    trouser_pattern=_khaki,
    short_sleeve=0.72,
    extras=(belly,),
)

PHONE = Sprite.parse("""
OOOO
OlbO
ObbO
ObbO
OOOO
""", {"O": "#160f1c", "b": "#6fd8ff", "l": "#e2eefc"})
PHONE_HEART = Sprite.parse("""
OOOO
OPPO
OPPO
ObbO
OOOO
""", {"O": "#160f1c", "b": "#6fd8ff", "P": "#ff8a80"})

STEAM = [
    Sprite.parse(".L.\nLLL\n.L.", {"L": "#dcd8e2"}),
    Sprite.parse("L.L\n.L.", {"L": "#dcd8e2"}),
    Sprite.parse(".L.\nL.L", {"L": "#a29cac"}),
]
#: The manga anger mark, floating off his forehead: bright red ridges with a pale rim so it
#: still pops against a furious red face.
VEIN = Sprite.parse("""
.ww.ww.
wrr.rrw
wr...rw
.......
wr...rw
wrr.rrw
.ww.ww.
""", {"r": "#ff2a3a", "w": "#ffe2d6"})
SPIT = Sprite.parse("""
E..
..E
.E.
""", {"E": "#e2eefc"})
STAR = Sprite.parse("""
.y.
yYy
.y.
""", {"y": "#ffd84a", "Y": "#ffffff"})
THUMB = Sprite.parse("""
.s.
.s.
sss
sss
""", {"s": "#efb08e"})


def _cust_extras(sk: Skeleton, spec: FrameSpec, placed) -> List[Prim]:
    return tie(sk, spec.extra.get("flap", 0.0))


def _head_fn(spec: FrameSpec) -> Tuple[Sprite, Tuple[int, int]]:
    face = spec.face if spec.face in _FACES else "angry"
    # For the customer, the frame's hair state is the comb-over: flat, up or side.
    sprite = head(face, strand=spec.hair, calm=bool(spec.extra.get("calm", 0.0)))
    return sprite, HEAD_PIVOT


CHARACTER = Character("unhappy-customer", OUTFIT, extras=(_cust_extras,), head_fn=_head_fn, build=BUILD)


# ── Animations ───────────────────────────────────────────────────────────────────


def _hips(pose: Pose) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    sk = solve(pose, BUILD)
    return (sk.near_leg.root[0], sk.near_leg.root[2]), (sk.far_leg.root[0], sk.far_leg.root[2])


def _planted(pose: Pose, near=(2.6, 0.8), far=(-2.4, -0.6), near_lift=0.0, far_lift=0.0) -> Pose:
    (nx, nz), (fx, fz) = _hips(replace(pose, y=0.0, lean=0.0))
    return replace(
        pose,
        near_leg=Limb(target=(nx + near[0], BUILD.ankle_height + near_lift, nz + near[1])),
        far_leg=Limb(target=(fx + far[0], BUILD.ankle_height + far_lift, fz + far[1])),
    )


def _phone_arm(shake: float = 0.0, up: float = 0.0) -> Limb:
    """The far arm holds the phone out at you, screen first; `up` thrusts it, `shake` rattles it."""
    return Limb(swing=62.0 + 22.0 * up + 6.0 * shake, spread=8.0, bend=55.0 - 40.0 * up)


def _fist_arm(pump: float = 0.0) -> Limb:
    return Limb(swing=18.0 + 22.0 * pump, spread=16.0, bend=75.0 + 20.0 * pump)


def walk() -> List[FrameSpec]:
    """Stomping at you, leaning in, phone held up to show you The Problem, fist pumping,
    steam puffing off his head."""
    out = []
    for i in range(WALK_FRAMES):
        p = i / WALK_FRAMES
        bob = -1.2 * math.cos(4 * math.pi * (p - 0.25))  # high at passing, low at the stomps
        base = Pose(lean=9.0, chest_lean=3.0, y=bob - 0.6, hip_yaw=24.0, chest_yaw=44.0, roll=1.5 * wave(p), neck=-6.0)
        (nx, nz), (fx, fz) = _hips(base)
        near = foot_path(p, WALK_STRIDE, 3.5, WALK_STANCE)
        far = foot_path(p + 0.5, WALK_STRIDE, 3.5, WALK_STANCE)
        pose = replace(
            base,
            near_leg=Limb(target=(nx + near[0] + 1.0, BUILD.ankle_height + near[1], nz + 0.4), end=near[2] * 0.5),
            far_leg=Limb(target=(fx + far[0], BUILD.ankle_height + far[1], fz - 0.2), end=far[2] * 0.5),
            near_arm=_fist_arm(pump=wave(p)),
            far_arm=_phone_arm(shake=wave(p * 2)),
        )
        puff = STEAM[i % 3]
        fx_list = ((puff, -3 - (i % 4), -14 - (i % 4)),) if i % 4 in (0, 1, 2) else ()
        out.append(FrameSpec(pose, face="angry", hair="up" if bob < -0.8 else "flat",
                             items=(HandItem("far", PHONE, (1, 3), dz=1.5),), head_fx=fx_list,
                             extra={"flap": 0.15 * wave(p * 2)}))
    return out


def shout() -> List[FrameSpec]:
    """Inhale, puff up... then let rip: leaning in, phone jabbed at you, spit flying, the
    comb-over standing straight up, an anger vein popping."""
    keys = [
        # (lean, y, face, strand, phone up, flap, fx)
        (-6.0, 0.4, "angry", "flat", 0.4, -0.2, ()),
        (-9.0, 0.8, "angry", "side", 0.6, -0.3, ("vein",)),
        (13.0, -0.8, "shout", "up", 1.0, 0.9, ("vein", "spit")),
        (14.0, -0.6, "shout", "up", 0.9, 1.1, ("vein",)),
        (13.0, -0.8, "shout", "up", 1.0, 0.8, ("vein", "spit")),
        (14.0, -0.6, "shout", "up", 0.9, 1.0, ("vein",)),
    ]
    out = []
    for i, (lean, y, face, strand, up, flap, fx) in enumerate(keys):
        base = _planted(Pose(lean=lean, chest_lean=3.0, y=y, hip_yaw=26.0, chest_yaw=46.0, neck=-4.0),
                        near=(4.0, 0.8), far=(-3.6, -0.6))
        pose = base.but(far_arm=_phone_arm(shake=(-1) ** i, up=up),
                        near_arm=Limb(swing=50.0 + 40.0 * (up > 0.8), spread=30.0, bend=70.0 - 30.0 * (up > 0.8)))
        head_fx = []
        if "vein" in fx:
            head_fx.append((VEIN, 6, -17))
        if "spit" in fx:
            head_fx.append((SPIT, 10, -5))
        out.append(FrameSpec(pose, face=face, hair=strand, head_dx=1 if (face == "shout" and i % 2) else 0,
                             items=(HandItem("far", PHONE, (1, 3), dz=1.5),), head_fx=tuple(head_fx),
                             extra={"flap": flap}))
    return out


def hurt() -> List[FrameSpec]:
    keys = [(-20.0, 1.0, (-1, 0), 1.2), (-24.0, 1.5, (-1, 1), 1.4), (-17.0, 1.0, (-1, 0), 0.9), (-9.0, 0.4, (0, 0), 0.4)]
    out = []
    for i, (lean, y, (dx, dy), flap) in enumerate(keys):
        base = _planted(Pose(lean=lean, chest_lean=-4.0, y=y, hip_yaw=24.0, chest_yaw=44.0, neck=-8.0),
                        near=(5.0, 0.8), far=(-2.0, -0.6), near_lift=1.5)
        pose = base.but(near_arm=Limb(swing=120.0 - 10 * i, spread=30.0, bend=30.0),
                        far_arm=Limb(swing=90.0 - 10 * i, spread=34.0, bend=40.0))
        out.append(FrameSpec(pose, face="hurt", hair="up" if i < 2 else "side", head_dx=dx, head_dy=dy,
                             items=(HandItem("far", PHONE, (1, 3), dz=1.5),), extra={"flap": flap}))
    return out


def stunned() -> List[FrameSpec]:
    """Seeing stars: swaying on jelly knees, eyes crossed out, tongue out, three stars
    orbiting his head."""
    out = []
    for i in range(8):
        t = i / 8
        sway = math.sin(2 * math.pi * t)
        base = _planted(Pose(lean=-2.0 + 7.0 * sway, chest_lean=-3.0 * sway, y=-1.2 - 0.6 * abs(sway), hip_yaw=24.0,
                             chest_yaw=44.0, roll=5.0 * sway, neck=8.0 * sway),
                        near=(3.0, 0.8), far=(-2.6, -0.6))
        pose = base.but(near_arm=Limb(swing=10.0 + 8 * sway, spread=26.0, bend=20.0),
                        far_arm=Limb(swing=6.0 - 8 * sway, spread=22.0, bend=16.0))
        stars = []
        for k in range(3):
            a = 2 * math.pi * (t + k / 3)
            stars.append((STAR, int(round(1 + 7 * math.cos(a))), int(round(-16 + 2 * math.sin(a)))))
        out.append(FrameSpec(pose, face="stunned", hair="side" if sway > 0 else "flat", head_dx=int(round(sway)),
                             items=(HandItem("far", PHONE, (1, 3), dz=1.5),), head_fx=tuple(stars),
                             extra={"flap": 0.4 * sway}))
    return out


def happy() -> List[FrameSpec]:
    """Won over: calm and pink, a delighted thumbs-up, a little skip, a heart on his phone.

    No floating heart: the game already springs a HeartPop out of a won-over customer."""
    out = []
    for i in range(8):
        t = i / 8
        hop = 2.2 * max(0.0, math.sin(4 * math.pi * t))
        base = _planted(Pose(lean=-3.0, chest_lean=-2.0, y=-0.8 + hop, hip_yaw=26.0, chest_yaw=48.0),
                        near=(3.0, 0.8), far=(-2.6, -0.6), near_lift=hop * 0.8, far_lift=hop * 0.8)
        pose = base.but(far_arm=Limb(swing=75.0, spread=6.0, bend=75.0),
                        near_arm=Limb(swing=10.0 * wave(t * 2), spread=14.0, bend=30.0))
        out.append(FrameSpec(pose, face="happy", hair="flat",
                             items=(HandItem("far", THUMB, (1, 3), dz=1.5), HandItem("near", PHONE_HEART, (1, 3))),
                             extra={"calm": 1.0, "flap": 0.2 * wave(t * 2)}))
    return out


def frames_for(anim: str) -> List[FrameSpec]:
    return {"walk": walk, "shout": shout, "hurt": hurt, "stunned": stunned, "happy": happy}[anim]()
