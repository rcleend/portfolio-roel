"""A frame as a pose of the shared parts, composed back to front in the order Terraria draws a player.

Terraria poses its player by picking a drawing for each limb and moving the upper body, never by
redrawing the whole figure; a pose here does the same. The body (torso, head and both arms) moves as one,
so a walk's bob lifts them together while the legs stay on the ground, and `lift` raises everything off
it for a hop.
"""
from __future__ import annotations

from typing import List, NamedTuple, Tuple

from PIL import Image

from .art import Art, Dye, Point, Stroke, paint
from .body import EYES, HEAD
from .limbs import FAR_ARMS, FAR_SHOULDER, HIPS, LEGS, NEAR_ARMS, NEAR_SHOULDER, Arm
from .outfits import Outfit


class Prop(NamedTuple):
    """Something held or summoned, drawn where it sits on the standing body and carried with the body.

    `layer` is 'held' (in front of the body, under the near arm), 'grip' (over the held props, for the far
    hand that grips one in front of the body while its sleeve stays behind the torso) or 'front' (over the
    whole figure).
    """
    art: Art
    layer: str = 'held'


class Pose(NamedTuple):
    legs: str = 'stand'
    near: str = 'hang'
    far: str = 'hang'
    # How far the body moves from standing: torso, head and arms together.
    body: Point = (0, 0)
    # How far the whole figure leaves the ground, legs too.
    lift: int = 0
    eyes: str = 'open'
    # The state of his hair's motion (body.HAIR_MOTION): only its loose ends move.
    hair: str = 'rest'
    props: Tuple[Prop, ...] = ()
    # Nudges the near arm from its drawing, on top of the body: a key pressed, a strum dug in.
    near_at: Point = (0, 0)


def near_arm(outfit: Outfit, name: str) -> Arm:
    return Arm(outfit.hang, (10, 30)) if name == 'hang' else NEAR_ARMS[name]


# The parts of the figure a sheet drawn in layers splits it into (docs/LOOKS.md): 'whole', or its 'legs' alone, or
# the 'upper' body, everything else, which the game draws over the legs of whatever move the hero is making.
LAYERS = ('whole', 'legs', 'upper')


def strokes(outfit: Outfit, pose: Pose, where: str, layer: str = 'whole') -> List[Stroke]:
    """The figure's drawings in painting order, each dyed and moved into place: all of them, or one layer's.

    Split, the far arm, which Terraria draws behind the legs, goes with the upper body, which is drawn over them;
    the tests hold every action to looking the same either way, so that never shows."""
    if layer not in LAYERS:
        raise ValueError(f'{where}: no layer {layer!r} (expected one of {LAYERS})')
    body = (pose.body[0], pose.body[1] - pose.lift)
    ground = (0, -pose.lift)
    top = Dye(outfit.top)
    far = FAR_ARMS[pose.far]
    near = near_arm(outfit, pose.near)
    near_art = near.art.moved(*pose.near_at)
    check_joint(far.art, FAR_SHOULDER, f'{where}: far arm {pose.far}')
    check_joint(near_art, NEAR_SHOULDER, f'{where}: near arm {pose.near}')
    legs = LEGS[pose.legs]
    for hip in HIPS:
        check_joint(legs, hip, f'{where}: legs {pose.legs}')

    legs_stroke = Stroke(legs, Dye(outfit.legs, outfit.shoes), ground)
    if layer == 'legs':
        return [legs_stroke]
    front = [Stroke(part, dye, body) for part, dye in outfit.front]

    def props(layer: str) -> List[Stroke]:
        return [Stroke(prop.art, Dye(), body) for prop in pose.props if prop.layer == layer]

    return [
        Stroke(far.art, top, body),
        *((legs_stroke,) if layer == 'whole' else ()),
        *(Stroke(part, dye, body) for part, dye in outfit.torso),
        Stroke(HEAD, Dye(), body),
        Stroke(outfit.hair[pose.hair], Dye(), body),
        *((Stroke(outfit.ear, Dye(), body),) if outfit.ear else ()),
        Stroke(EYES[pose.eyes], Dye(), body),
        Stroke(outfit.glasses, Dye(), body),
        *(Stroke(part, dye, body) for part, dye in outfit.headgear),
        *props('held'),
        *props('grip'),
        *(front if near.raised else ()),
        Stroke(near_art, Dye(outfit.near), body),
        *(() if near.raised else front),
        *props('front'),
    ]


def compose(outfit: Outfit, pose: Pose, where: str, layer: str = 'whole') -> Image.Image:
    return paint(strokes(outfit, pose, where, layer), where)


def hand(outfit: Outfit, pose: Pose) -> Point:
    """Where the pose's near hand is, in design space, once the arm is nudged and the body has moved."""
    point = near_arm(outfit, pose.near).hand
    return carried((point[0] + pose.near_at[0], point[1] + pose.near_at[1]), pose)


def far_hand(pose: Pose) -> Point:
    """Where the pose's far hand is, in design space, once the body has moved."""
    return carried(FAR_ARMS[pose.far].hand, pose)


def carried(point: Point, pose: Pose) -> Point:
    """A point of the standing body (a prop's corner, the mouth) where the pose's body has moved it."""
    return point[0] + pose.body[0], point[1] + pose.body[1] - pose.lift


def grounded(pose: Pose) -> bool:
    return pose.lift == 0


def check_joint(drawing: Art, joint: Point, where: str) -> None:
    """A limb must cover the joint it hangs from, so it joins the body where the standing one does."""
    if not drawing.covers(joint):
        raise ValueError(f'{where} does not cover its joint {joint}')

