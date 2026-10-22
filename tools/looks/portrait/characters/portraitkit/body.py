"""Paints one posed frame of a rigged character.

A character is an Outfit (limb materials, widths, shoes, a torso painter)
plus a head kit and an optional prop painter. Layers are painted back to
front in a per-pose order, then the frame is finished (outline and rim).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Dict, Mapping, Optional, Sequence, Tuple

from .canvas import Frame, PartStyle
from .palette import Ramp
from .pixmap import Pixmap
from .skeleton import HERO, Build, Joints, Pose, solve

Point = Tuple[float, float]

TorsoPainter = Callable[[Frame, int, Joints, Pose], None]
PropPainter = Callable[[Frame, str, Joints, Pose, "Character"], None]
HandPainter = Callable[[Frame, int, Point, Point, str, bool, "Character"], None]

DEFAULT_ORDER = ("prop_back", "far_arm", "far_leg", "near_leg", "torso", "head", "prop", "near_arm", "prop_front")

# The head kit is drawn so that this offset from the neck base is its top-left.
HEAD_OFFSET = (-4.5, -14.5)


@dataclass
class Outfit:
    sleeve: str
    trousers: str
    torso: TorsoPainter
    shoes: Mapping[str, Tuple[Pixmap, Tuple[int, int]]]  # foot pose -> (sprite, ankle anchor)
    upper_arm: float = 2.0  # capsule radii
    forearm: float = 1.7
    thigh: float = 2.5
    shin: float = 2.0
    cuff: Optional[str] = None  # a shirt cuff peeking out of a sleeve
    hem: Optional[str] = None  # trouser hem material over the shoe
    dark: Tuple[str, ...] = ()  # materials that catch the TV glow rim
    sleeve_top: Optional[int] = None  # brightest tone the sleeve may use
    sleeve_pattern: Optional[Callable] = None  # (along, across, tone) -> cell or None
    trouser_pattern: Optional[Callable] = None


@dataclass
class Character:
    id: str
    palette: Mapping[str, Ramp]
    outfit: Outfit
    heads: Mapping[str, Pixmap]
    props: Optional[PropPainter] = None
    hand: Optional[HandPainter] = None
    rim: str = "glow"
    build: Build = HERO
    head_offset: Point = HEAD_OFFSET


def floor_half(v: float) -> int:
    return int(math.floor(v + 0.5))


def head_origin(j: Joints, pose: Pose, offset: Point = HEAD_OFFSET) -> Tuple[int, int]:
    return (floor_half(j.neck[0] + offset[0] + pose.head[0]),
            floor_half(j.neck[1] + offset[1] + pose.head[1]))


def render(character: Character, pose: Pose) -> Frame:
    j = solve(pose, character.build)
    frame = Frame()
    order: Sequence[str] = pose.get("order", DEFAULT_ORDER)  # type: ignore[assignment]
    for layer in order:
        _paint(frame, layer, character, j, pose)
    frame.finish(materials_dark=character.outfit.dark, rim_material=character.rim)
    return frame


def _paint(frame: Frame, layer: str, ch: Character, j: Joints, pose: Pose) -> None:
    order: Sequence[str] = pose.get("order", DEFAULT_ORDER)  # type: ignore[assignment]
    outfit = ch.outfit
    pal = ch.palette
    if layer in ("prop_back", "prop", "prop_front"):
        if ch.props is not None:
            ch.props(frame, layer, j, pose, ch)
        return
    if layer == "head":
        part = frame.part("head", PartStyle(outline=False))
        face = pose.face if pose.face in ch.heads else next(iter(ch.heads))
        frame.stamp(ch.heads[face], *head_origin(j, pose, ch.head_offset), part)
        return
    if layer == "torso":
        part = frame.part("torso")
        outfit.torso(frame, part, j, pose)
        return
    near = layer.startswith("near")
    if layer.endswith("_leg"):
        part = frame.part(layer)
        hip, knee, ankle = (j.near_hip, j.near_knee, j.near_ankle) if near else (j.far_hip, j.far_knee, j.far_ankle)
        leg = pose.near_leg if near else pose.far_leg
        ramp = pal[outfit.trousers]
        bias = 0.0 if near else -0.35
        hi = ramp.top if near else ramp.top - 1
        tp = outfit.trouser_pattern
        frame.limb(hip, knee, outfit.thigh, outfit.thigh - 0.15, outfit.trousers, part, ramp, lo=1, hi=hi, bias=bias,
                   pattern=(lambda al, ac, t, tp=tp: tp(al, ac, t, 0)) if tp else None)
        frame.limb(knee, ankle, outfit.shin, outfit.shin, outfit.trousers, part, ramp, lo=1, hi=hi, bias=bias,
                   pattern=(lambda al, ac, t, tp=tp: tp(al, ac, t, 1)) if tp else None)
        _crease(frame, part, hip, knee, ankle, outfit.thigh)
        shoe_part = frame.part(layer + "_shoe")
        sprite, (ax, ay) = outfit.shoes[leg.foot]
        frame.stamp(sprite, floor_half(ankle[0] - 0.5) - ax, floor_half(ankle[1] - 0.5) - ay, shoe_part)
        return
    if layer.endswith("_arm"):
        part = frame.part(layer)
        shoulder, elbow, wrist = (j.near_shoulder, j.near_elbow, j.near_wrist) if near else (j.far_shoulder, j.far_elbow, j.far_wrist)
        arm = pose.near_arm if near else pose.far_arm
        ramp = pal[outfit.sleeve]
        top = outfit.sleeve_top if outfit.sleeve_top is not None else ramp.top
        bias = 0.0 if near else -0.35
        hi = top if near else top - 1
        sp = outfit.sleeve_pattern
        frame.limb(shoulder, elbow, outfit.upper_arm, outfit.upper_arm, outfit.sleeve, part, ramp, lo=1, hi=hi, bias=bias,
                   pattern=(lambda al, ac, t, sp=sp: sp(al, ac, t, 0)) if sp else None)
        frame.limb(elbow, wrist, outfit.forearm, outfit.forearm - 0.1, outfit.sleeve, part, ramp, lo=1, hi=hi, bias=bias,
                   pattern=(lambda al, ac, t, sp=sp: sp(al, ac, t, 1)) if sp else None)
        _crease(frame, part, shoulder, elbow, wrist, outfit.upper_arm)
        if (layer.replace("_arm", "_hand")) not in order:
            _hand(frame, ch, near, elbow, wrist, arm.hand)
        return
    if layer.endswith("_hand"):
        elbow, wrist = (j.near_elbow, j.near_wrist) if near else (j.far_elbow, j.far_wrist)
        arm = pose.near_arm if near else pose.far_arm
        _hand(frame, ch, near, elbow, wrist, arm.hand)
        return
    raise KeyError(f"unknown layer {layer!r}")


def _crease(frame: Frame, part: int, a: Point, joint: Point, b: Point, radius: float) -> None:
    """Folds the cloth at a bent joint: a dark crease inside the bend, the
    knee or elbow catching a step of light on the outside."""
    ux, uy = joint[0] - a[0], joint[1] - a[1]
    vx, vy = b[0] - joint[0], b[1] - joint[1]
    nu = math.hypot(ux, uy) or 1.0
    nv = math.hypot(vx, vy) or 1.0
    ux, uy, vx, vy = ux / nu, uy / nu, vx / nv, vy / nv
    bend = math.degrees(math.acos(max(-1.0, min(1.0, ux * vx + uy * vy))))
    if bend < 28.0:
        return
    bx, by = -ux + vx, -uy + vy
    nb = math.hypot(bx, by) or 1.0
    bx, by = bx / nb, by / nb
    inner = (joint[0] + bx * radius * 0.7, joint[1] + by * radius * 0.7)
    outer = (joint[0] - bx * radius * 0.75, joint[1] - by * radius * 0.75)
    for point, dt in ((inner, -2), (outer, +1)):
        x, y = int(math.floor(point[0])), int(math.floor(point[1]))
        c = frame.get(x, y)
        if c is not None and c[2] == part:
            frame.put(x, y, c[0], max(1, c[1] + dt), part)
    if bend > 70.0:
        # A deep bend folds twice: a second crease a pixel further in.
        x, y = int(math.floor(inner[0] - ux)), int(math.floor(inner[1] - uy))
        c = frame.get(x, y)
        if c is not None and c[2] == part:
            frame.put(x, y, c[0], max(1, c[1] - 1), part)


def _hand(frame: Frame, ch: Character, near: bool, elbow: Point, wrist: Point, gesture: str) -> None:
    part = frame.part(("near" if near else "far") + "_hand", PartStyle(outline_tone=1, lit_tone=None))
    if ch.hand is not None:
        ch.hand(frame, part, elbow, wrist, gesture, near, ch)
