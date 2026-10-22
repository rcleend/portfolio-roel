"""STRATEGY: open navy blazer, white open-collar shirt, brown oxfords.

A sharp, confident consultant. He carries a sticky-note pad in his far hand
and flicks notes off it like shuriken with the near hand; the skill is a
presenter's sweep up to a raised hand pointing at the north star.
"""

from __future__ import annotations

from dataclasses import replace
from typing import List

from .. import heads, motion, palette, props
from ..body import Character, Outfit
from ..canvas import Frame, PartStyle
from ..motion import Anim, base, plant
from ..outfits import LEATHER_ART, LEATHER_LEGEND, blazer_cuff, blazer_torso, paint_hand, shoes
from ..skeleton import Arm, Joints, Pose, reach, solve

ORDER = ("far_arm", "far_leg", "near_leg", "torso", "head", "prop", "far_hand", "near_arm", "prop_front")
NOTES = props.sprites(props.NOTEPAD_ART, props.NOTE_LEGEND)


def _hand_point(elbow, wrist, k: float = 1.6):
    dx, dy = wrist[0] - elbow[0], wrist[1] - elbow[1]
    n = (dx * dx + dy * dy) ** 0.5 or 1.0
    return (wrist[0] + dx / n * k, wrist[1] + dy / n * k)


def paint_props(frame: Frame, layer: str, j: Joints, pose: Pose, ch: Character) -> None:
    if layer == "prop" and pose.get("pad", True):
        part = frame.part("pad", PartStyle(outline_tone=1, lit_tone=None))
        props.place(frame, part, NOTES["pad"], _hand_point(j.far_elbow, j.far_wrist))
    if layer == "prop_front" and pose.get("note", False):
        part = frame.part("note", PartStyle(outline_tone=1, lit_tone=None))
        props.place(frame, part, NOTES["note"], _hand_point(j.near_elbow, j.near_wrist, 2.0))


def character() -> Character:
    return Character(
        id="strategy",
        palette=palette.STRATEGY,
        outfit=Outfit(
            sleeve="blazer",
            trousers="trousers",
            torso=blazer_torso,
            shoes=shoes(LEATHER_ART, LEATHER_LEGEND),
            upper_arm=2.0,
            forearm=1.7,
            thigh=2.4,
            shin=1.9,
            dark=("blazer", "trousers"),
            sleeve_top=4,
            sleeve_pattern=blazer_cuff,
        ),
        heads=heads.build(),
        props=paint_props,
        hand=paint_hand,
    )


def _dress(anim: Anim, fn) -> Anim:
    return replace(anim, poses=tuple(fn(i, p).plus(order=ORDER) for i, p in enumerate(anim.poses)))


def hold_pad(p: Pose, at=(6.6, 12.0)) -> Pose:
    """Far hand holds the pad in front of the body, at a spine-local point."""
    from ..outfits import Spine

    j = solve(p)
    return reach(p, "far", Spine(j).at(*at), bend=1.0, hand="grip")


def idle() -> Anim:
    # Weight on the back foot, pad held at the belt, the near hand easy at his side.
    def dress(i: int, p: Pose) -> Pose:
        p = p.with_(near_arm=Arm(-4 + (1 if i in (2, 3, 4, 5) else 0), 10, "rest"))
        return hold_pad(p)
    return _dress(motion.idle(), dress)


def run() -> Anim:
    swing = [-34, -16, 12, 34, 38, 20, -8, -30]

    def dress(i: int, p: Pose) -> Pose:
        a = swing[i]
        b = swing[(i + 4) % 8]
        return p.with_(near_arm=Arm(a, a + 70, "fist"), far_arm=Arm(b, b + 80, "grip")).plus(
            flare=1.0 if i % 4 in (1, 2) else 0.0)
    return _dress(motion.run(), dress)


def jump() -> Anim:
    def dress(i: int, p: Pose) -> Pose:
        return p.with_(near_arm=Arm(196 + i * 4, 186 + i * 4, "fist"), far_arm=Arm(60 + i * 4, 110, "grip")).plus(
            flare=1.0)
    return _dress(motion.jump(), dress)


def fall() -> Anim:
    def dress(i: int, p: Pose) -> Pose:
        flap = (0, 8, 2, 10)[i]
        return p.with_(near_arm=Arm(-110 - flap, -140 - flap, "open"), far_arm=Arm(100 + flap, 130 + flap, "grip")).plus(
            flare=(1.5, 2.0, 1.5, 2.5)[i])
    return _dress(motion.fall(), dress)


def hurt() -> Anim:
    def dress(i: int, p: Pose) -> Pose:
        r = (50, 80, 70, 30)[i]
        return p.with_(near_arm=Arm(r, r + 50, "open"), far_arm=Arm(r + 10, r + 40, "grip")).plus(flare=1.0)
    return _dress(motion.hurt(), dress)


def victory() -> Anim:
    # A fist pump behind the head (the face stays clear), pad held at the chest: deal closed.
    pumps = [(-20, 120), (194, 186), (190, 182), (40, 150)]
    poses = []
    for i, (up, fore) in enumerate(pumps):
        p = plant(base(**motion.IDLE_LEGS, face="grin"), "near")
        p = p.with_(pelvis=(p.pelvis[0], p.pelvis[1] - (1 if i in (1, 2) else 0)), near_arm=Arm(up, fore, "fist"))
        p = hold_pad(p, at=(6.4, 8.0)).plus(order=ORDER)
        poses.append(p)
    return Anim("victory", 8, True, tuple(poses))


def attack() -> Anim:
    # A sidearm flick: release (the note leaves), follow-through across the
    # body, recoil, then cocked back with the next note pinched off the pad.
    beats = [
        dict(arm=Arm(84, 92, "open"), lean=7, note=False),
        dict(arm=Arm(62, 120, "open"), lean=8, note=False),
        dict(arm=Arm(10, 60, "grip"), lean=4, note=True),
        dict(arm=Arm(-40, 20, "grip"), lean=0, note=True),
    ]
    poses = []
    for b in beats:
        p = plant(base(**motion.IDLE_LEGS, lean=b["lean"], face="focus"), "near")
        p = hold_pad(p.with_(near_arm=b["arm"])).plus(order=ORDER, note=b["note"])
        poses.append(p)
    return Anim("attack", 18, False, tuple(poses))


def skill() -> Anim:
    # Gather, sweep the arm up behind the head, and point at the north star.
    stages = [
        dict(arm=Arm(-34, 6, "fist"), lean=4, squash=1, face="focus"),
        dict(arm=Arm(214, 200, "open"), lean=-2, squash=0, face="focus"),
        dict(arm=Arm(186, 180, "point"), lean=-6, squash=-1, face="grin"),
        dict(arm=Arm(184, 178, "point"), lean=-6, squash=-1, face="grin"),
        dict(arm=Arm(186, 180, "point"), lean=-4, squash=0, face="grin"),
    ]
    poses = []
    for s in stages:
        p = plant(base(**motion.IDLE_LEGS, lean=s["lean"], squash=s["squash"], face=s["face"]), "near")
        p = hold_pad(p.with_(near_arm=s["arm"])).plus(order=ORDER)
        poses.append(p)
    return Anim("skill", 12, False, tuple(poses))


def animations() -> List[Anim]:
    return [idle(), run(), jump(), fall(), attack(), skill(), hurt(), victory()]


def anchors(name: str, pose: Pose, j: Joints) -> dict:
    """Notes leave the throwing hand; the north star rises from the raised hand."""
    if name in ("attack", "skill"):
        key = "muzzle" if name == "attack" else "hand"
        return {key: _hand_point(j.near_elbow, j.near_wrist, 1.4)}
    return {}
