"""ARTSY ROEL: washed charcoal cap, tie-dye knit sweater, brown trousers and the Olympic White Strat.

His attack is a power strum that flings a glob of paint off the strings; his
skill is the full rock-star windmill, arm high, then one mighty down-strum.
"""

from __future__ import annotations

import math
from dataclasses import replace
from typing import Dict, List, Mapping, Optional, Tuple

from .. import palette as P
from ..compose import Part
from ..grid import Grid
from ..raster import line, outline_outside
from ..head import MOUTH
from ..rig import Limb, LimbStyle, Material, Outfit, Pose, Posed, TorsoKit, Vec, resolve
from ..skew import skew_columns, skew_rows
from . import moves
from .common import OrientedHands, heads, ramp_keys, shoes, torso_kits
from .hackerman import _with_glint
from .moves import GROUND, Anim, leg

# ── Torso: black and grey tie-dye knit, a black tee peeking out of the crew neck. ──
TORSO_FILL = """
...cxxxc....
..cxSsSxc...
.cbcxxxcbbc.
cbabccccbacc
babbcdcbbbcd
bbcccddcabcd
cbcbcdccbbcd
cccbbccddccd
cbbabccdccdd
.cbbbccbbcd.
.ccbcdcbbcd.
.cbccddcccd.
.ccbbcdcbdd.
.dcdcdcdcdd.
.cdcdcdcdcd.
"""
TORSO_PIVOT = (5, 14)

PALETTE: Dict[str, str] = dict(ramp_keys(P.SWEATER))
PALETTE.update({"x": "#17151c", "s": P.SKIN.light, "S": P.SKIN.mid, "k": P.SKIN.shadow})


TORSOS: Mapping[str, TorsoKit] = torso_kits(TORSO_FILL, TORSO_PIVOT)


def _tie_dye(along: float, across: float) -> bool:
    """Pale blotches drifting along the sleeve, like the knit in the photo."""
    return math.sin(along * 0.9 + across * 1.7) + math.cos(along * 0.45 - across * 2.3) > 0.8


def _sweater(ramp: P.Ramp, group: str) -> Material:
    return Material(ramp.hi, ramp.light, ramp.mid, ramp.shadow, ramp.line, group, pattern=_tie_dye, rim=P.RIM_SWEATER)


SWEATER_FAR = P.Ramp(
    hi=P.SWEATER.light, light=P.SWEATER.mid, mid=P.SWEATER.shadow, shadow=P.SWEATER.line, line=P.SWEATER.line
)

# ── The Strat: cream double-cutaway body, mint pickguard, three white single coils, rosewood board,
#    maple neck and a six-in-line headstock. Drawn flat (neck pointing right); tilted by column skews. ──
STRAT_FILL = """
...aab......ab......................
.abbbbbb...abbc..................tt.
abbbbbbbbbbbbc................tttt..
bbbbpppppppbc................ihhhhh.
bzbppupupupppbrrrrrrrrrrrrrrrnhhhh..
bzbppupupuppppnrrnrrnrrnrrnrrnhhh...
bbbbpppppppbbbMMMMMMMMMMMMMMMMhh....
cbbbppkpkpppcc......................
.cbbbbbpkpbcc.......................
..cbbbbbbbcc........................
....cccccc..........................
"""
# Pivot: the strings over the pickups, the point the strumming hand hits.
STRAT_PIVOT = (8, 5)
STRAT_PALETTE: Dict[str, str] = {
    "a": P.STRAT_BODY.hi,
    "b": P.STRAT_BODY.light,
    "c": P.STRAT_BODY.mid,
    "d": P.STRAT_BODY.shadow,
    "p": P.PICKGUARD.light,
    "P": P.PICKGUARD.mid,
    "u": P.WHITE,
    "k": P.WHITE,
    "z": P.CHROME.light,
    "r": P.ROSEWOOD,
    "n": "#f2e6c8",
    "M": P.MAPLE.mid,
    "h": P.MAPLE.light,
    "i": P.MAPLE.hi,
    "t": P.CHROME.light,
    "W": P.WHITE,
}


def strat(tilt: int = 0, flash: bool = False, upright: int = 0) -> Grid:
    """The guitar; `tilt` = columns per pixel the neck rises (0 = flat, 3 = playing angle).

    `upright` stands it on its butt instead, neck up, leaning forward one pixel every `upright` rows.
    """
    g = Grid.parse(STRAT_FILL, STRAT_PIVOT)
    if flash:
        g = Grid(g.w, g.h, {p: ("W" if k in "pu" else k) for p, k in g.cells.items()}, g.pivot)
    if upright:
        g = skew_rows(g.rotated90(3), step=upright, pivot_y=g.rotated90(3).pivot[1])
    elif tilt:
        g = skew_columns(g, tilt, pivot_x=STRAT_PIVOT[0])
    return Grid.from_cells(outline_outside(dict(g.cells)), g.pivot)


def strat_point(at: Vec, tilt: int, column: int, row: int) -> Tuple[int, int]:
    run = column - STRAT_PIVOT[0]
    rise = (run // tilt) if tilt else 0
    return (int(at[0]) + run, int(at[1]) + (row - STRAT_PIVOT[1]) - rise)


def strat_part(at: Vec, tilt: int, flash: bool = False, upright: int = 0) -> Part:
    return Part(
        strat(tilt, flash, upright),
        (int(at[0]), int(at[1])),
        STRAT_PALETTE,
        P.STRAT_BODY.line,
        "c",
        group="strat",
        name="strat",
    )


def _strap(posed: Posed, at: Vec, tilt: int) -> Part:
    horn = strat_point(at, tilt, 12, 0)
    start = (int(round(posed.far_shoulder[0])), int(round(posed.far_shoulder[1])) + 1)
    cells = {p: "d" for p in line(start, horn)}
    return Part(Grid.from_cells(cells, (0, 0)), (0, 0), {"d": "#2a1c16"}, "#2a1c16", "d", group="strap", name="strap")


def guitar(at: Vec, tilt: int, flash: bool = False, layer: str = "front"):
    def factory(posed: Posed) -> Optional[Part]:
        return strat_part(at, tilt, flash)

    return (layer, factory)


def strap(at: Vec, tilt: int):
    def factory(posed: Posed) -> Optional[Part]:
        return _strap(posed, at, tilt)

    return ("front", factory)


OUTFIT = Outfit(
    name="artsy",
    torsos=TORSOS,
    torso_palette=PALETTE,
    torso_line=P.SWEATER.line,
    torso_demote="d",
    torso_group="sweater",
    sleeve=_sweater(P.SWEATER, "sweater_near"),
    sleeve_style=LimbStyle(3.4, 3.1, 3.0, cuff=1.5),
    far_sleeve=_sweater(SWEATER_FAR, "sweater_far"),
    trousers=Material(
        P.TROUSERS_BROWN.hi, P.TROUSERS_BROWN.light, P.TROUSERS_BROWN.mid, P.TROUSERS_BROWN.shadow,
        P.TROUSERS_BROWN.line, "trousers",
    ),
    far_trousers=Material(
        P.TROUSERS_BROWN.light, P.TROUSERS_BROWN.mid, P.TROUSERS_BROWN.shadow, P.TROUSERS_BROWN.line,
        P.TROUSERS_BROWN.line, "trousers_far",
    ),
    leg_style=LimbStyle(3.8, 3.3, 3.1, cuff=1.2),
    hands=OrientedHands(),
    feet=shoes(P.SNEAKER_DARK, "#e9e4da"),
    heads=heads(cap=True),
    lift=2,
    torso_rim=P.RIM_SWEATER,
)

# ── Carrying the Strat: slung across the body, body at the near hip, neck up and forward. ──
CARRY = (-1, 3)
CARRY_TILT = 3


def carry(kind: str, index: int, pose: Pose) -> Pose:
    _, ly = moves.lag(kind, index)
    hx, hy = pose.hip
    at = (hx + CARRY[0], hy + CARRY[1] + round(ly * 0.6))
    neck = strat_point(at, CARRY_TILT, 22, 4)
    extras = pose.extras + (strap(at, CARRY_TILT), guitar(at, CARRY_TILT))
    pose = replace(pose, extras=extras)
    if kind == "run":
        # The fretting hand keeps the neck steady; only the strumming arm pumps.
        pose = replace(pose, far_arm=Limb(end=neck, bend=-1, tip="grip@300"))
    return pose


# ── Idle: weight back, strumming hand resting on the strings, fretting hand on the neck. ──


def idle() -> Anim:
    poses: List[Pose] = []
    for beat in moves.BREATH:
        hip = (31, 35 + beat.hip_dy)
        at = (hip[0] + CARRY[0], 35 + CARRY[1] + beat.prop_dy)
        strings = strat_point(at, CARRY_TILT, 9, 4)
        neck = strat_point(at, CARRY_TILT, 22, 4)
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=(strings[0] - 1, strings[1] - 1), bend=-1, tip="relax@60"),
            far_arm=Limb(end=neck, bend=-1, tip="grip@300", joint=(neck[0] - 3, neck[1] + 4)),
            near_leg=leg((27, GROUND)),
            far_leg=leg((35, GROUND)),
            torso=beat.torso,
            head=beat.face,
            head_offset=beat.head,
            extras=(strap(at, CARRY_TILT), guitar(at, CARRY_TILT)),
        )
        poses.append(_with_glint(pose) if beat.glint else pose)
    return Anim("idle", 8, True, poses)


# ── Attack: a power down-strum flings paint off the strings. 5 frames at 16 fps (0.31 s ~ the 0.3 s cooldown). ──
# Held fire restarts on frame 0, so the last frame is the wind-up that leads into the next downstroke.


def attack() -> Anim:
    base = (30, 38)
    frames = [
        # strike: the hand rips down through the strings, a white swoosh behind it, the guitar flashes
        dict(hip=(31, 36), torso="lean2", head="shout", lag=0, hand=((32, 34), (36, 42), "fist"), smear=True,
             flash=True),
        # follow-through: hand low and forward past the body of the guitar
        dict(hip=(31, 36), torso="lean1", head="shout", lag=1, hand=((30, 35), (35, 46), "open"), smear=False,
             flash=False),
        # recoil: weight rocks back, the neck bounces
        dict(hip=(30, 35), torso="back1", head="focus", lag=-1, hand=((27, 34), (30, 41), "open"), smear=False,
             flash=False),
        dict(hip=(30, 35), torso="stand", head="focus", lag=0, hand=((27, 32), (31, 37), "fist"), smear=False,
             flash=False),
        # wind back up for the next strum
        dict(hip=(31, 35), torso="back1", head="focus", lag=0, hand=((26, 29), (31, 29), "fist"), smear=False,
             flash=False),
    ]
    poses: List[Pose] = []
    muzzles: List[Tuple[int, int]] = []
    for f in frames:
        at = (base[0], base[1] + f["lag"])
        neck = strat_point(at, CARRY_TILT, 22, 4)
        ne, nw, nh = f["hand"]
        extras = [strap(at, CARRY_TILT), guitar(at, CARRY_TILT, flash=f["flash"])]
        if f["smear"]:
            extras.append(_swoosh(((29, 26), (35, 28), (39, 33), (38, 40)), 6.0, 3.0, "#ff8fcf", layer="front"))
        poses.append(
            Pose(
                hip=f["hip"],
                near_arm=Limb(end=nw, bend=-1, tip=nh, joint=ne),
                far_arm=Limb(end=neck, bend=-1, tip="grip@300"),
                near_leg=leg((26, GROUND)),
                far_leg=leg((37, GROUND)),
                torso=f["torso"],
                head=f["head"],
                head_offset=(1, 0),
                extras=tuple(extras),
            )
        )
        muzzles.append(strat_point(at, CARRY_TILT, 14, 2))
    return Anim("attack", 16, False, poses, {"muzzle": muzzles})


def _swoosh(points, start: float, end: float, tint: str, layer: str = "near_arm"):
    """A smear ribbon drawn under the arm that makes it: hot white core, tinted edge."""
    from ..raster import swoosh

    def factory(posed: Posed) -> Optional[Part]:
        cells = swoosh(points, start, end)
        return Part(Grid.from_cells(cells), (0, 0), {"a": P.WHITE, "b": tint}, tint, "b", name="smear")

    return (layer, factory)


# ── Skill: the windmill. Arm high, a full circle, one mighty down-strum, hold the rock pose. ──


def skill() -> Anim:
    base = (30, 38)
    frames = [
        dict(hip=(30, 36), torso="back1", head="focus", hoff=(-1, 0), hand=((24, 19), (20, 12), "fist"), smear=False),
        dict(hip=(30, 35), torso="back2", head="focus", hoff=(-1, -1), hand=((23, 16), (21, 8), "fist"), smear=False),
        dict(hip=(31, 36), torso="lean1", head="shout", hoff=(1, 0), hand=((32, 28), (37, 33), "fist"), smear=True),
        dict(hip=(31, 37), torso="lean2", head="shout", hoff=(1, 1), hand=((31, 33), (36, 43), "open"), smear=False),
        dict(hip=(31, 36), torso="back1", head="shout", hoff=(-1, -1), hand=((24, 18), (20, 11), "wave"), smear=False),
        dict(hip=(31, 36), torso="back1", head="smile", hoff=(-1, 0), hand=((24, 18), (20, 11), "wave"), smear=False),
    ]
    poses: List[Pose] = []
    hands: List[Tuple[int, int]] = []
    mouths: List[Tuple[int, int]] = []
    strings: List[Tuple[int, int]] = []
    for i, f in enumerate(frames):
        at = (base[0], base[1] + (1 if i == 3 else 0))
        neck = strat_point(at, CARRY_TILT, 22, 4)
        ne, nw, nh = f["hand"]
        extras = [strap(at, CARRY_TILT), guitar(at, CARRY_TILT, flash=f["smear"] or i == 3)]
        if f["smear"]:
            extras.append(("top", _windmill_smear))
        poses.append(
            Pose(
                hip=f["hip"],
                near_arm=Limb(end=nw, bend=-1, tip=nh, joint=ne),
                far_arm=Limb(end=neck, bend=-1, tip="grip@300"),
                near_leg=leg((25, GROUND)),
                far_leg=leg((38, GROUND)),
                torso=f["torso"],
                head=f["head"],
                head_offset=f["hoff"],
                extras=tuple(extras),
            )
        )
        hands.append((int(nw[0]), int(nw[1])))
        head_at = resolve(poses[-1], OUTFIT).head_at
        mouths.append((int(head_at[0]) + MOUTH[0], int(head_at[1]) + MOUTH[1]))
        strings.append(strat_point(at, CARRY_TILT, 9, 5))
    # `hand` is the strumming hand (it can hold the elixir), `mouth` the front of his lips for the
    # potion to meet (PHASE-B-NOTES 2), `strings` the strummed strings where POWER CHORD's wave starts.
    return Anim("skill", 15, False, poses, {"hand": hands, "mouth": mouths, "strings": strings})


def _windmill_smear(posed: Posed) -> Optional[Part]:
    from ..raster import arc_band

    cx, cy = posed.near_shoulder
    cells = arc_band((cx, cy), 13.0, 19.0, 300, 420, ((0.5, "b"), (1.0, "a")))
    return Part(Grid.from_cells(cells), (0, 0), {"a": "#ffffff", "b": "#fff3b0"}, "#fff3b0", "b", name="smear")


# ── Victory: neck raised like a trophy, fist up, headbanging bounce. ──


def victory() -> Anim:
    """Both fists up in a V, laughing, the Strat bouncing on its strap."""
    poses: List[Pose] = []
    bounce = (0, -1, -1, 0, 1, 0, -1, 0)
    for i, dy in enumerate(bounce):
        hip = (31, 35 + dy)
        lag = bounce[i - 1]
        at = (hip[0] + CARRY[0], 35 + CARRY[1] + lag)
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=(21, 11 + dy), bend=-1, tip="fist@250", joint=(24, 19 + dy)),
            far_arm=Limb(end=(43, 11 + dy), bend=1, tip="fist@290", joint=(40, 19 + dy)),
            near_leg=leg((25, GROUND)),
            far_leg=leg((38, GROUND)),
            torso="stand",
            head="shout" if i in (1, 2, 5, 6) else "smile",
            head_offset=(0, -1 if i in (2, 6) else 0),
            extras=(strap(at, CARRY_TILT), guitar(at, CARRY_TILT)),
        )
        poses.append(_with_glint(pose) if i in (3, 7) else pose)
    return Anim("victory", 10, True, poses)


def animations() -> List[Anim]:
    return [
        idle(),
        moves.run(carry),
        moves.jump(carry),
        moves.fall(carry),
        attack(),
        skill(),
        moves.hurt(carry),
        victory(),
    ]
