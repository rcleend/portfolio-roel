"""HACKERMAN: black hoodie (hood down), dark jeans, white sneakers, keyboard.

He never lets go of his keyboard: both hands hold it in every animation, so
it reads at a glance as his weapon. The attack is a typing flurry that
fires code bolts from the keyboard's front edge; the skill raises the
keyboard overhead and slams Enter.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Dict, List, Tuple

from .. import heads, motion, palette, props
from ..body import Character, Outfit
from ..canvas import Frame, PartStyle
from ..motion import Anim, base, plant
from ..outfits import SNEAKER_ART, SNEAKER_LEGEND, hoodie_torso, paint_hand, shoes
from ..skeleton import Arm, Joints, Leg, Pose, solve

KEYBOARD = props.sprites(props.KEYBOARD_ART, props.KEYBOARD_LEGEND)

HOLD = dict(near_arm=Arm(-6, 72, "grip"), far_arm=Arm(22, 84, "grip"), prop="held")


def keyboard_centre(j: Joints, pose: Pose) -> Tuple[float, float]:
    mid = ((j.near_wrist[0] + j.far_wrist[0]) / 2, (j.near_wrist[1] + j.far_wrist[1]) / 2)
    dx, dy = pose.get("kb_offset", (0.0, 0.0))  # type: ignore[misc]
    return (mid[0] + dx, mid[1] + dy)


def paint_props(frame: Frame, layer: str, j: Joints, pose: Pose, ch: Character) -> None:
    if pose.prop is None or layer != pose.get("kb_layer", "prop"):
        return
    part = frame.part("keyboard", PartStyle(lit_tone=None))
    props.place(frame, part, KEYBOARD[pose.prop], keyboard_centre(j, pose))


def character() -> Character:
    return Character(
        id="hackerman",
        palette=palette.HACKERMAN,
        outfit=Outfit(
            sleeve="hoodie",
            trousers="jeans",
            torso=hoodie_torso,
            shoes=shoes(SNEAKER_ART, SNEAKER_LEGEND),
            upper_arm=2.1,
            forearm=1.8,
            thigh=2.5,
            shin=2.0,
            dark=("hoodie", "jeans", "kbcase"),
            sleeve_top=4,
        ),
        heads=heads.build(),
        props=paint_props,
        hand=paint_hand,
    )


# ── animations ─────────────────────────────────────────────────────────────

def _dress(anim: Anim, arms) -> Anim:
    return replace(anim, poses=tuple(arms(i, p) for i, p in enumerate(anim.poses)))


def idle() -> Anim:
    # A slow breath, the drawstrings swaying a beat behind it, and one idle key tap.
    sway = [0.0, 0.0, 0.4, 0.6, 0.4, 0.0, -0.4, -0.4]

    def dress(i: int, p: Pose) -> Pose:
        tap = i == 4
        near = Arm(-6, 76 if tap else 72, "grip")
        return p.with_(near_arm=near, far_arm=HOLD["far_arm"], prop="tap" if tap else "held").plus(strings=sway[i])
    return _dress(motion.idle(), dress)


def run() -> Anim:
    # Keyboard hugged at the chest; it rides the stride a beat behind the body.
    def arms(i: int, p: Pose) -> Pose:
        bob = (0.0, 0.0, 1.0, 0.0)[i % 4]
        return p.with_(near_arm=Arm(-14, 84, "grip"), far_arm=Arm(6, 88, "grip"), prop="held").plus(
            kb_offset=(0.0, bob), strings=(-1.0 if i % 4 in (1, 2) else -0.5))
    return _dress(motion.run(), arms)


def jump() -> Anim:
    def arms(i: int, p: Pose) -> Pose:
        lift = (8, 10, 12)[i]
        return p.with_(near_arm=Arm(-20 - lift, 100 + lift, "grip"), far_arm=Arm(2 - lift, 104 + lift, "grip"),
                       prop="held").plus(strings=(-1.0, 0.5, 1.0)[i])
    return _dress(motion.jump(), arms)


def fall() -> Anim:
    def arms(i: int, p: Pose) -> Pose:
        lift = (0, 3, 1, 4)[i]
        return p.with_(near_arm=Arm(-24 - lift, 100 + lift, "grip"), far_arm=Arm(-4 - lift, 104 + lift, "grip"),
                       prop="held").plus(strings=(1.0, 1.5, 1.0, 2.0)[i])
    return _dress(motion.fall(), arms)


def hurt() -> Anim:
    # The hit knocks the keyboard up out of a clean grip; he juggles it back.
    beats = [
        dict(reach=40, prop="tilt", kb=(0.0, -1.0)),
        dict(reach=64, prop="tilt", kb=(1.0, -3.0)),
        dict(reach=58, prop="tilt", kb=(0.0, -2.0)),
        dict(reach=30, prop="held", kb=(0.0, 0.0)),
    ]

    def arms(i: int, p: Pose) -> Pose:
        b = beats[i]
        r = b["reach"]
        return p.with_(near_arm=Arm(r - 20, r + 60, "open" if i in (1, 2) else "grip"),
                       far_arm=Arm(r, r + 70, "grip"), prop=b["prop"]).plus(strings=1.5, kb_offset=b["kb"])
    return _dress(motion.hurt(), arms)


# Arms raised with the near one behind the head, so the face stays clear.
OVERHEAD = dict(near_arm=Arm(190, 182, "grip"), far_arm=Arm(170, 176, "grip"))


def victory() -> Anim:
    # The keyboard held overhead like a trophy, bouncing on his toes.
    rise = [0, 1, 2, 1]
    poses = []
    for i, r in enumerate(rise):
        p = plant(base(**motion.IDLE_LEGS, face="grin"), "near", lift=0)
        p = p.with_(pelvis=(p.pelvis[0], p.pelvis[1] - r), prop="enter" if i == 2 else "held", **OVERHEAD)
        poses.append(p.plus(kb_offset=(0.0, -3.0), kb_layer="prop_back", strings=(0.0, 0.5, 1.0, 0.5)[i]))
    return Anim("victory", 8, True, tuple(poses))


def attack() -> Anim:
    # The keyboard comes up to the chest and he hammers it: strike, lift,
    # strike, lift. Each strike lights the caps under his fingers and kicks
    # the keyboard forward a pixel; the bolt leaves on frame 0.
    beats = [
        dict(near=Arm(18, 100, "grip"), prop="type_a", kb=(1.0, 1.0)),
        dict(near=Arm(10, 62, "open"), prop="held", kb=(0.0, 0.0)),
        dict(near=Arm(18, 98, "grip"), prop="type_b", kb=(1.0, 1.0)),
        dict(near=Arm(10, 64, "open"), prop="held", kb=(0.0, 0.0)),
    ]
    poses = []
    for b in beats:
        p = plant(base(**motion.IDLE_LEGS, lean=7, face="focus", head=(1.0, 0.0)))
        p = p.with_(near_arm=b["near"], far_arm=Arm(36, 104, "grip"), prop=b["prop"]).plus(
            kb_offset=b["kb"], strings=-0.5)
        poses.append(p)
    return Anim("attack", 18, False, tuple(poses))


def skill() -> Anim:
    # Wind-up overhead, a smear on the way down, then Enter is slammed at the
    # belly with the knees bent: the beam or the drone leaves the keyboard.
    stages = [
        dict(arms=OVERHEAD, lean=-4, squash=-1, lift=1, face="focus", prop="held", back=True, kb=(0.0, -3.0)),
        dict(arms=dict(near_arm=Arm(194, 186, "grip"), far_arm=Arm(174, 178, "grip")), lean=-8, squash=-1, lift=2,
             face="focus", prop="held", back=True, kb=(0.0, -4.0)),
        dict(arms=dict(near_arm=Arm(70, 124, "grip"), far_arm=Arm(62, 118, "grip")), lean=6, squash=0, lift=0,
             face="focus", prop="smear", back=False, kb=(0.0, 0.0)),
        dict(arms=dict(near_arm=Arm(34, 98, "grip"), far_arm=Arm(48, 100, "grip")), lean=12, squash=2, lift=0,
             face="grin", prop="enter", back=False, kb=(1.0, 0.0)),
        dict(arms=dict(near_arm=Arm(24, 94, "grip"), far_arm=Arm(38, 98, "grip")), lean=8, squash=1, lift=0,
             face="grin", prop="type_a", back=False, kb=(0.0, 0.0)),
    ]
    poses = []
    for s in stages:
        legs = motion.IDLE_LEGS if s["squash"] < 2 else dict(near_leg=Leg(-14, 6, "flat"), far_leg=Leg(16, -4, "flat"))
        p = plant(base(**legs, lean=s["lean"], squash=s["squash"], face=s["face"]), "near", lift=s["lift"])
        p = p.with_(prop=s["prop"], **s["arms"]).plus(kb_offset=s["kb"], strings=1.0 if s["back"] else -1.0)
        if s["back"]:
            p = p.plus(kb_layer="prop_back")
        poses.append(p)
    return Anim("skill", 12, False, tuple(poses))


def animations() -> List[Anim]:
    return [idle(), run(), jump(), fall(), attack(), skill(), hurt(), victory()]


def anchors(name: str, pose: Pose, j: Joints) -> Dict[str, Tuple[float, float]]:
    """Code bolts leave from the keyboard's front edge; skills too."""
    cx, cy = keyboard_centre(j, pose)
    front = (cx + 6.0, cy - 1.0)
    if name == "attack":
        return {"muzzle": front}
    if name == "skill":
        return {"hand": front}
    return {}
