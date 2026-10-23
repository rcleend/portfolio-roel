"""STRATEGY ROEL: crisp white open-collar shirt, dark navy blazer, slacks, brown leather shoes, sticky notes.

His attack flicks a sticky note like a shuriken; his skill is the visionary
point at the sky that the north star launches from (the churn shield wraps
around the same confident pose).
"""

from __future__ import annotations

from dataclasses import replace
from typing import Dict, List, Mapping, Optional, Tuple

from .. import palette as P
from ..compose import Part
from ..grid import Grid
from ..raster import outline_outside
from ..rig import Attachment, Limb, LimbStyle, Material, Outfit, Pose, Posed, TorsoKit, Vec, attach
from ..skew import skew_rows
from . import moves
from .common import OrientedHands, fill, heads, ramp_keys, shoes, torso_kits
from .hackerman import _with_glint
from .moves import GROUND, Anim, leg

# ── Torso: navy blazer, one button done, white shirt open at the collar. ──
TORSO_FILL = """
...cwsSw....
..cbwsSswc..
.cbbawsswbc.
cbbbbawvwbcc
bbbbbbwwvbcd
bbbbbbawwbcd
cbbbbbbwvbcd
cbbbbbbwwbcd
cbbbbbbawbdd
.cbbbbbbubd.
.cbbbbbwvcd.
.cbbbbbBycd.
.cbbbbcwvcd.
.cbbbbcwvcd.
.cccccdccdd.
"""
TORSO_PIVOT = (5, 14)

PALETTE: Dict[str, str] = dict(ramp_keys(P.BLAZER))
PALETTE.update(
    {
        "w": P.SHIRT_WHITE.light,
        "W": P.SHIRT_WHITE.hi,
        "v": P.SHIRT_WHITE.mid,
        "V": P.SHIRT_WHITE.shadow,
        "s": P.SKIN.light,
        "S": P.SKIN.mid,
        "k": P.SKIN.shadow,
        "u": "#c9b98a",
        "B": P.BELT,
        "y": P.BUCKLE,
    }
)


TORSOS: Mapping[str, TorsoKit] = torso_kits(TORSO_FILL, TORSO_PIVOT)

BLAZER_NEAR = P.Ramp(hi="#7486bd", light="#52629a", mid="#3a4672", shadow="#283152", line=P.BLAZER.line)


def _crease(along: float, across: float) -> bool:
    """The pressed crease down the front of each trouser leg."""
    return -0.6 < across < 0.4 and along > 3


def _material(ramp: P.Ramp, group: str, pattern=None, extra=(), rim=None) -> Material:
    return Material(ramp.hi, ramp.light, ramp.mid, ramp.shadow, ramp.line, group, pattern=pattern, extra=extra, rim=rim)


def _far(ramp: P.Ramp) -> P.Ramp:
    return P.Ramp(hi=ramp.light, light=ramp.mid, mid=ramp.shadow, shadow=ramp.line, line=ramp.line)


CUFF = (("e", P.SHIRT_WHITE.light),)

OUTFIT = Outfit(
    name="strategy",
    torsos=TORSOS,
    torso_palette=PALETTE,
    torso_line=P.BLAZER.line,
    torso_demote="d",
    torso_group="blazer",
    sleeve=_material(BLAZER_NEAR, "blazer_near", extra=CUFF, rim=P.RIM_BLAZER),
    sleeve_style=LimbStyle(3.3, 3.0, 2.8, cuff=1.2, cuff_key="e"),
    far_sleeve=_material(_far(P.BLAZER), "blazer_far", extra=CUFF, rim=P.RIM_BLAZER),
    trousers=_material(P.SLACKS, "slacks", _crease, rim=P.RIM_SLACKS),
    far_trousers=_material(_far(P.SLACKS), "slacks_far", _crease, rim=P.RIM_SLACKS),
    leg_style=LimbStyle(3.7, 3.1, 2.9, cuff=0.0),
    hands=OrientedHands(),
    feet=shoes(P.LEATHER, "#2a1a10", leather=True),
    heads=heads(cap=False),
    lift=2,
    torso_rim=P.RIM_BLAZER,
)

# ── The sticky-note pad ──
PAD = fill(
    """
    abbbc
    bbbbc
    bbbcc
    ddddd
    """,
    (2, 2),
)
PAD_PALETTE: Dict[str, str] = ramp_keys(P.STICKY)


def pad_part(at: Vec) -> Part:
    return Part(PAD, (int(at[0]), int(at[1])), PAD_PALETTE, P.STICKY.line, "d", group="pad", name="pad")


def pad(at_wrist: Tuple[float, float], layer: str = "near_arm"):
    def factory(posed: Posed) -> Optional[Part]:
        return pad_part(at_wrist)

    return (layer, factory)


def pad_in_far_hand(layer: str = "behind_torso"):
    def factory(posed: Posed) -> Optional[Part]:
        x, y = posed.far_wrist
        return pad_part((x + 1, y + 3))

    return (layer, factory)


def carry(kind: str, index: int, pose: Pose) -> Pose:
    return replace(pose, extras=pose.extras + (pad_in_far_hand("far_arm"),))


# ── Idle: one hand on the hip, the pad held at the waist, an easy confident breath. ──


def idle() -> Anim:
    poses: List[Pose] = []
    for beat in moves.BREATH:
        dy = beat.hip_dy
        hip = (31, 35 + dy)
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=(27, 36 + dy), bend=-1, tip="fist@60", joint=(23, 31 + dy)),
            far_arm=Limb(end=(38, 34 + dy + beat.prop_dy), bend=-1, tip="grip@20", joint=(37, 29 + dy)),
            near_leg=leg((27, GROUND)),
            far_leg=leg((35, GROUND)),
            torso=beat.torso,
            head=beat.face,
            head_offset=beat.head,
            extras=(pad((39, 36 + dy + beat.prop_dy), "front"),),
        )
        poses.append(_with_glint(pose) if beat.glint else pose)
    return Anim("idle", 8, True, poses)


# ── Attack: flick a sticky note like a shuriken. 4 frames at 18 fps (0.22 s). ──
# The shot leaves on frame 0; the last frame peels the next note off the pad, ready for held fire.


def attack() -> Anim:
    frames = [
        # release: the arm whips out, wrist snapped, a yellow-white swoosh behind it
        dict(hip=(32, 35), torso="lean2", head="focus", near=((35, 26), (43, 25), "open"), smear=True),
        # follow-through: the arm carries on down across the body
        dict(hip=(32, 35), torso="lean1", head="focus", near=((35, 28), (41, 31), "open"), smear=False),
        # recoil
        dict(hip=(31, 35), torso="stand", head="smile", near=((31, 30), (36, 33), "fist"), smear=False),
        # back to the pad for the next note
        dict(hip=(31, 35), torso="back1", head="focus", near=((29, 31), (35, 35), "grip@0"), smear=False),
    ]
    poses: List[Pose] = []
    muzzles: List[Tuple[int, int]] = []
    for f in frames:
        ne, nw, nh = f["near"]
        extras = [pad((38, 36), "front")]
        if f["smear"]:
            extras.append(_flick_smear())
        poses.append(
            Pose(
                hip=f["hip"],
                near_arm=Limb(end=nw, bend=-1, tip=nh, joint=ne),
                far_arm=Limb(end=(37, 34), bend=-1, tip="grip@20"),
                near_leg=leg((26, GROUND)),
                far_leg=leg((38, GROUND)),
                torso=f["torso"],
                head=f["head"],
                head_offset=(1, 0),
                extras=tuple(extras),
            )
        )
        muzzles.append((int(nw[0]) + 4, int(nw[1]) - 1))
    return Anim("attack", 18, False, poses, {"muzzle": muzzles})


def _flick_smear():
    """The flick's motion trail: a ribbon from behind the shoulder to the snapping wrist."""
    from ..raster import swoosh

    def factory(posed: Posed) -> Optional[Part]:
        cells = swoosh(((33, 37), (38, 35), (42, 31), (44, 27)), 2.0, 5.0)
        return Part(Grid.from_cells(cells), (0, 0), {"a": P.WHITE, "b": P.STICKY.light}, P.STICKY.mid, "b", name="smear")

    return ("front", factory)


# ── Skill: the visionary point. Crouch, then thrust a finger at the sky; hold it, glasses glinting. ──


def skill() -> Anim:
    frames = [
        dict(hip=(31, 37), torso="lean1", head="focus", hoff=(1, 1), far=((37, 31), (33, 35), "fist"), glint=False),
        dict(hip=(31, 34), torso="back1", head="smile", hoff=(0, -1), far=((41, 18), (45, 11), "point@290"), glint=False),
        dict(hip=(31, 34), torso="back1", head="smile", hoff=(0, -1), far=((41, 17), (46, 10), "point@290"), glint=True),
        dict(hip=(31, 35), torso="back1", head="smile", hoff=(0, 0), far=((41, 17), (46, 10), "point@290"), glint=False),
        dict(hip=(31, 35), torso="back1", head="smile", hoff=(0, 0), far=((41, 17), (46, 10), "point@290"), glint=True),
        dict(hip=(31, 35), torso="stand", head="smile", hoff=(0, 0), far=((40, 18), (45, 12), "point@290"), glint=False),
    ]
    poses: List[Pose] = []
    hands: List[Tuple[int, int]] = []
    for f in frames:
        fe, fw, fh = f["far"]
        pose = Pose(
            hip=f["hip"],
            near_arm=Limb(end=(27, 36), bend=-1, tip="fist@60", joint=(23, 31)),
            far_arm=Limb(end=fw, bend=1, tip=fh, joint=fe),
            near_leg=leg((26, GROUND)),
            far_leg=leg((37, GROUND)),
            torso=f["torso"],
            head=f["head"],
            head_offset=f["hoff"],
        )
        poses.append(_with_glint(pose) if f["glint"] else pose)
        hands.append((int(fw[0]) + 1, int(fw[1]) - 4))
    return Anim("skill", 15, False, poses, {"hand": hands})


# ── Victory: thumbs up, and the sticky pad tossed and caught like a coin. ──
_TOSS = (0, -6, -11, -13, -11, -6, 0, 0)
_BOUNCE = (0, 0, -1, -1, 0, 0, 1, 0)


def victory() -> Anim:
    poses: List[Pose] = []
    for i, (toss, dy) in enumerate(zip(_TOSS, _BOUNCE)):
        catch = 1 if i in (6, 7) else (-1 if i == 0 else 0)
        hip = (31, 35 + dy)
        hand = (41, 36 + dy + catch)
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=(36, 26 + dy), bend=-1, tip="thumbup", joint=(30, 30 + dy)),
            far_arm=Limb(end=hand, bend=-1, tip="open@0", joint=(38, 31 + dy)),
            near_leg=leg((26, GROUND)),
            far_leg=leg((37, GROUND)),
            torso="stand",
            head="smile",
            head_offset=(0, 1 if i == 6 else 0),
            extras=(pad((hand[0] + 2, hand[1] - 2 + toss), "front"),),
        )
        poses.append(_with_glint(pose) if i in (2, 3) else pose)
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
