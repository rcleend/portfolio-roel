"""ARTSY: cap, tie-dye knit sweater, brown trousers, and the white Strat.

The Strat hangs on its strap at his hip in every animation; his fretting
hand rides the neck (placed by IK on the guitar's grip point) and his
strumming hand is free to swing, strum and throw horns. The attack is a
power strum that flings paint off the strings; the skill is a windmill
into one mighty downstroke.
"""

from __future__ import annotations

import math
from dataclasses import replace
from typing import List, Tuple

from .. import draw, heads, motion, palette, props
from ..body import HEAD_OFFSET, Character, Outfit, head_origin
from ..canvas import Frame, PartStyle
from ..motion import Anim, base, plant
from ..outfits import SNEAKER_ART, SNEAKER_LEGEND, Spine, paint_hand, shoes, sweater_sleeve, sweater_torso
from ..skeleton import Arm, Joints, Leg, Pose, reach, solve

ORDER = ("far_arm", "far_leg", "near_leg", "torso", "head", "prop", "far_hand", "near_arm")

# Guitar placement in spine-local space (a across, b down) and neck angle.
PLAY = dict(g_at=(-0.6, 14.2), g_angle=-24.0)


def guitar_pose(j: Joints, pose: Pose) -> Tuple[Tuple[float, float], float]:
    sp = Spine(j)
    a, b = pose.get("g_at", PLAY["g_at"])  # type: ignore[misc]
    angle = float(pose.get("g_angle", PLAY["g_angle"]))  # type: ignore[arg-type]
    return sp.at(a, b), angle


def strat_points(j: Joints, pose: Pose) -> dict:
    """Where the strum, grip and headstock are for a pose (no painting)."""
    centre, angle = guitar_pose(j, pose)
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)

    def to_frame(lx: float, ly: float):
        return (centre[0] + lx * ca - ly * sa, centre[1] + lx * sa + ly * ca)

    return {"strum": to_frame(-1.0, 0.0), "grip": to_frame(12.0, 0.0), "head": to_frame(25.0, -1.5),
            "horn": to_frame(6.4, -4.4), "joint": to_frame(4.0, 0.0), "centre": centre}


def paint_props(frame: Frame, layer: str, j: Joints, pose: Pose, ch: Character) -> None:
    if layer != "prop":
        return
    centre, angle = guitar_pose(j, pose)
    pts = strat_points(j, pose)
    # The strap: from the upper horn over the far shoulder.
    strap = frame.part("strap")
    shoulder = (j.far_shoulder[0] - 1.0, j.far_shoulder[1] - 1.5)
    draw.line(frame, pts["horn"], shoulder, "strap", 1, strap)
    draw.line(frame, (pts["horn"][0] - 1, pts["horn"][1]), (shoulder[0] - 1, shoulder[1]), "strap", 0, strap)
    neck = frame.part("strat_neck")
    part = frame.part("strat", PartStyle(full=True))
    props.paint_strat(frame, part, centre, angle, strings_lit=bool(pose.get("lit", False)), neck_part=neck)


def character() -> Character:
    return Character(
        id="artsy",
        palette=palette.ARTSY,
        outfit=Outfit(
            sleeve="knit",
            trousers="brown",
            torso=sweater_torso,
            shoes=shoes(SNEAKER_ART, SNEAKER_LEGEND),
            upper_arm=2.1,
            forearm=1.8,
            thigh=2.5,
            shin=2.0,
            dark=("knit", "brown", "sneaker"),
            sleeve_top=4,
            sleeve_pattern=sweater_sleeve,
        ),
        heads=heads.build(cap=True),
        props=paint_props,
        hand=paint_hand,
    )


def fret(p: Pose, strum_hand: str = "grip", strum: bool = True, near_bend: float = 1.0) -> Pose:
    """Puts the far hand on the neck and, optionally, the near hand on the strings."""
    p = p.plus(order=ORDER)
    j = solve(p)
    pts = strat_points(j, p)
    p = reach(p, "far", pts["grip"], bend=1.0, hand="grip")
    if strum:
        p = reach(p, "near", pts["strum"], bend=near_bend, hand=strum_hand)
    return p


def _dress(anim: Anim, fn) -> Anim:
    return replace(anim, poses=tuple(fn(i, p) for i, p in enumerate(anim.poses)))


def idle() -> Anim:
    return _dress(motion.idle(), lambda i, p: fret(p))


def run() -> Anim:
    # The guitar rides the stride; the strumming arm swings opposite the near leg.
    swing = [-30, -14, 10, 30, 34, 18, -6, -26]

    def dress(i: int, p: Pose) -> Pose:
        bob = (0.0, 1.0, 0.0, -1.0)[i % 4]
        p = p.plus(g_at=(-0.6, 14.2 + bob), g_angle=-22.0 - bob * 2)
        p = fret(p, strum=False)
        a = swing[i]
        return p.with_(near_arm=Arm(a, a + 60, "fist"))
    return _dress(motion.run(), dress)


def jump() -> Anim:
    def dress(i: int, p: Pose) -> Pose:
        p = p.plus(g_at=(-0.6, 14.0), g_angle=-34.0 - i * 4)
        p = fret(p, strum=False)
        return p.with_(near_arm=Arm(192 + i * 4, 184 + i * 4, "fist"))
    return _dress(motion.jump(), dress)


def fall() -> Anim:
    def dress(i: int, p: Pose) -> Pose:
        flap = (0, 8, 2, 10)[i]
        p = p.plus(g_at=(-0.6, 13.6), g_angle=(-16.0, -20.0, -15.0, -21.0)[i])
        p = fret(p, strum=False)
        return p.with_(near_arm=Arm(-120 - flap, -150 - flap, "rest"))
    return _dress(motion.fall(), dress)


def hurt() -> Anim:
    def dress(i: int, p: Pose) -> Pose:
        p = p.plus(g_at=(-0.4, 13.8), g_angle=(-44, -52, -40, -28)[i])
        p = fret(p, strum=False)
        return p.with_(near_arm=Arm((40, 70, 60, 20)[i], (110, 140, 120, 80)[i], "rest"))
    return _dress(motion.hurt(), dress)


def victory() -> Anim:
    # Leaning back, neck up and clear of his face, the strumming arm
    # windmilling behind his head and down through the strings.
    wind = [(190, 186), (96, 132), (38, 96), (-40, 30)]
    poses = []
    for i, (up, fore) in enumerate(wind):
        p = plant(base(**motion.IDLE_LEGS, lean=-6, face="grin", head=(0.0, 1.0 if i == 2 else 0.0)), "near")
        p = p.plus(g_at=(-1.0, 13.6), g_angle=-40.0 + (4.0 if i == 2 else 0.0), lit=(i == 2))
        p = fret(p, strum=False)
        p = p.with_(near_arm=Arm(up, fore, "fist"))
        poses.append(p)
    return Anim("victory", 8, True, tuple(poses))


def attack() -> Anim:
    # Strike (paint leaves), follow-through down past the body, recover up,
    # and back above the strings: one full strum per shot.
    beats = [
        dict(g_angle=-30.0, lit=True, hand=(1.0, 3.0), up=None, face="focus"),
        dict(g_angle=-27.0, lit=False, hand=None, up=(-30, 10), face="focus"),
        dict(g_angle=-25.0, lit=False, hand=None, up=(40, 150), face="focus"),
        dict(g_angle=-24.0, lit=False, hand=(-1.0, -4.0), up=None, face="focus"),
    ]
    poses = []
    for b in beats:
        p = plant(base(**motion.IDLE_LEGS, lean=3, face=b["face"]), "near")
        p = p.plus(g_at=(-0.6, 14.2), g_angle=b["g_angle"], lit=b["lit"], order=ORDER)
        j = solve(p)
        pts = strat_points(j, p)
        p = reach(p, "far", pts["grip"], bend=1.0, hand="grip")
        if b["hand"] is not None:
            hx, hy = b["hand"]
            p = reach(p, "near", (pts["strum"][0] + hx, pts["strum"][1] + hy), bend=1.0, hand="fist")
        else:
            p = p.with_(near_arm=Arm(b["up"][0], b["up"][1], "fist"))
        poses.append(p)
    return Anim("attack", 14, False, tuple(poses))


def skill() -> Anim:
    stages = [
        dict(lean=-6, squash=-1, g_angle=-46.0, arm=(175, 185), face="focus"),
        dict(lean=-8, squash=-1, g_angle=-52.0, arm=(185, 200), face="focus"),
        dict(lean=4, squash=1, g_angle=-40.0, arm=None, face="grin", lit=True),
        dict(lean=6, squash=2, g_angle=-36.0, arm=(-20, 20), face="grin", lit=True),
        dict(lean=2, squash=1, g_angle=-38.0, arm=(-40, -10), face="grin"),
    ]
    poses = []
    for s in stages:
        p = plant(base(**motion.IDLE_LEGS, lean=s["lean"], squash=s["squash"], face=s["face"]), "near")
        p = p.plus(g_at=(-0.6, 14.0), g_angle=s["g_angle"], lit=bool(s.get("lit")), order=ORDER)
        p = fret(p, strum=s["arm"] is None, strum_hand="fist")
        if s["arm"] is not None:
            p = p.with_(near_arm=Arm(s["arm"][0], s["arm"][1], "fist"))
        poses.append(p)
    return Anim("skill", 12, False, tuple(poses))


def animations() -> List[Anim]:
    return [idle(), run(), jump(), fall(), attack(), skill(), hurt(), victory()]


def anchors(name: str, pose: Pose, j: Joints) -> dict:
    """Paint leaves the strings where the neck meets the body. The skill
    attaches to the strumming hand, with the strum spot on the body for
    POWER CHORD and his mouth for UX ELIXIR's potion."""
    pts = strat_points(j, pose)
    if name == "attack":
        return {"muzzle": pts["joint"]}
    if name == "skill":
        dx, dy = j.near_wrist[0] - j.near_elbow[0], j.near_wrist[1] - j.near_elbow[1]
        n = (dx * dx + dy * dy) ** 0.5 or 1.0
        hand = (j.near_wrist[0] + dx / n * 1.2, j.near_wrist[1] + dy / n * 1.2)
        hx, hy = head_origin(j, pose, HEAD_OFFSET)
        mouth = (hx + heads.MOUTH[0], hy + heads.MOUTH[1])
        return {"hand": hand, "guitar": pts["strum"], "mouth": mouth}
    return {}
