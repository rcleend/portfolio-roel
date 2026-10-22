"""Assembles one character frame: rendered body + hand-drawn head + props, depth-sorted.

A `FrameSpec` is everything an animator decides for one frame. `render_frame` solves the
rig, puts the prop where the frame says, sends the hands to the prop's grips with IK,
renders and shades the body, then composites the prop and the likeness head by depth and
reports the frame's anchors (muzzle, hand) in frame pixels.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from . import head as head_kit
from .body import Outfit, build_body
from .canvas import Canvas, Sprite
from .props import Placed, Prop
from .render3d import Prim, render
from .rig import Build, Limb, Pose, Skeleton, solve
from .shade import shade
from .vec import Vec

ORIGIN = (32, 64)
SIZE = (64, 64)


@dataclass(frozen=True)
class Grip:
    """Send a hand to a prop grip point (sprite-space offset), a little in front of the prop."""

    name: str
    offset: Tuple[float, float] = (0.0, 0.0)
    depth: float = 1.4
    pole: Optional[Tuple[float, float, float]] = None


@dataclass(frozen=True)
class HandAt:
    """Send a hand to a point in frame pixels (x right, y down), `depth` towards the viewer
    from the chest, with an optional IK pole in body terms (forward, up, side)."""

    x: float
    y: float
    depth: float = 3.0
    pole: Optional[Tuple[float, float, float]] = None


@dataclass(frozen=True)
class PropPose:
    """Where the prop is: pivot relative to the pelvis (x, y) in frame units, angle, depth."""

    angle: float = 0.0
    at: Tuple[float, float] = (0.0, 0.0)
    #: Depth relative to the chest centre; positive is towards the viewer.
    depth: float = 7.0
    #: Pivot measured from the chest instead of the pelvis.
    from_chest: bool = False
    #: Prop look for this frame (see Prop.variants), e.g. "lit:2,glow:1".
    variant: str = ""


@dataclass(frozen=True)
class Overlay:
    """A hand-drawn sprite composited into the frame (smears, sparks, motion lines)."""

    sprite: Sprite
    x: int
    y: int
    z: float = 100.0


@dataclass(frozen=True)
class HandItem:
    """A small sprite held in a hand (a sticky-note pad, the note about to be thrown)."""

    hand: str  # "near" or "far"
    sprite: Sprite
    #: Sprite pixel that sits on the hand.
    pivot: Tuple[int, int]
    dz: float = 0.6


@dataclass(frozen=True)
class FrameSpec:
    pose: Pose
    face: str = "smile"
    hair: str = "rest"
    glint: bool = False
    head_dx: int = 0
    head_dy: int = 0
    prop: Optional[PropPose] = None
    near_hand: Optional[object] = None  # Grip (on the prop) or HandAt (in frame pixels)
    far_hand: Optional[object] = None
    overlays: Tuple[Overlay, ...] = ()
    #: Extra per-frame values for the hero's own extras (string swing, ...).
    extra: Dict[str, float] = field(default_factory=dict)
    #: Anchor name -> grip name on the prop, or "near_hand"/"far_hand", or explicit (x, y).
    anchors: Dict[str, object] = field(default_factory=dict)
    #: Hide the prop for this frame (e.g. a thrown prop).
    hide_prop: bool = False
    items: Tuple[HandItem, ...] = ()
    #: Hands drawn by a hand-made sprite instead of the rendered volume ("near"/"far").
    hide_hands: Tuple[str, ...] = ()
    #: Smear from the previous frame's hand position to this one ("near"/"far"), see render_sequence.
    smear: Tuple[str, ...] = ()
    #: Sprites placed relative to the head anchor pixel: (sprite, dx, dy) floats above
    #: everything (steam, stars); (sprite, dx, dy, dz) sits at the head's depth plus dz
    #: (a collar under the chin).
    head_fx: Tuple[Tuple, ...] = ()


ExtraFn = Callable[[Skeleton, FrameSpec, Optional[Placed]], List[Prim]]


@dataclass(frozen=True)
class Character:
    name: str
    outfit: Outfit
    cap: bool = False
    prop: Optional[Prop] = None
    extras: Tuple[ExtraFn, ...] = ()
    #: Draw the head from a different kit (the customer); returns (sprite, pivot).
    head_fn: Optional[Callable[[FrameSpec], Tuple[Sprite, Tuple[int, int]]]] = None
    #: Body proportions (the customer is shorter and stockier than Roel).
    build: Build = Build()
    #: The mouth in the head sprite's pixels, for the `mouth` anchor (None: Roel's kit).
    mouth: Optional[Tuple[int, int]] = None


@dataclass
class Rendered:
    canvas: Canvas
    anchors: Dict[str, Tuple[int, int]]
    skeleton: Skeleton


def _place(sk: Skeleton, spec: FrameSpec, prop: Prop) -> Placed:
    pp = spec.prop or PropPose()
    base = sk.chest if pp.from_chest else sk.pelvis
    at = (base[0] + pp.at[0], base[1] + pp.at[1])
    return Placed(prop, pp.angle, at, sk.chest[2] + pp.depth, pp.variant)


def _hand_limb(limb: Limb, grip: Grip, placed: Placed) -> Limb:
    target = placed.grip(grip.name, grip.offset)
    target = (target[0], target[1], target[2] + grip.depth)
    return replace(limb, target=target, pole=grip.pole or limb.pole)


def to_pixel(p: Vec) -> Tuple[int, int]:
    return (int(p[0] + ORIGIN[0]), int(ORIGIN[1] - p[1]))


def _hand_at(limb: Limb, at: HandAt, sk: Skeleton) -> Limb:
    target = (at.x - ORIGIN[0], ORIGIN[1] - at.y, sk.chest[2] + at.depth)
    return replace(limb, target=target, pole=at.pole or limb.pole)


def render_frame(character: Character, spec: FrameSpec) -> Rendered:
    pose = spec.pose
    sk = solve(pose, character.build)
    placed: Optional[Placed] = None
    if character.prop is not None and not spec.hide_prop:
        placed = _place(sk, spec, character.prop)
    changes = {}
    for side, ref, limb in (("near_arm", spec.near_hand, pose.near_arm), ("far_arm", spec.far_hand, pose.far_arm)):
        if isinstance(ref, HandAt):
            changes[side] = _hand_at(limb, ref, sk)
        elif isinstance(ref, Grip) and placed is not None:
            changes[side] = _hand_limb(limb, ref, placed)
    if changes:
        pose = replace(pose, **changes)
        sk = solve(pose, character.build)
    prims: List[Prim] = build_body(sk, character.outfit,
                                   hands=("near" not in spec.hide_hands, "far" not in spec.hide_hands))
    for extra in character.extras:
        prims += extra(sk, spec, placed)
    canvas = shade(render(prims, SIZE[0], SIZE[1], ORIGIN))
    if placed is not None:
        placed.stamp(canvas, ORIGIN)
    if character.head_fn is not None:
        sprite, pivot = character.head_fn(spec)
    else:
        sprite = head_kit.head(spec.face, spec.hair, cap=character.cap, glint=spec.glint)
        pivot = head_kit.PIVOT
    hx, hy = to_pixel(sk.head)
    head_x, head_y = hx - pivot[0] + spec.head_dx, hy - pivot[1] + spec.head_dy
    canvas.stamp(sprite, head_x, head_y, z=sk.head[2] + 6.0, layer="head")
    for fx in spec.head_fx:
        fx_sprite, dx, dy = fx[0], fx[1], fx[2]
        z = sk.head[2] + fx[3] if len(fx) > 3 else 200.0
        canvas.stamp(fx_sprite, hx + spec.head_dx + dx, hy + spec.head_dy + dy, z=z, layer="fx")
    for item in spec.items:
        chain = sk.near_arm if item.hand == "near" else sk.far_arm
        ix, iy = to_pixel(chain.end)
        canvas.stamp(item.sprite, ix - item.pivot[0], iy - item.pivot[1], z=chain.end[2] + item.dz, layer="item")
    for overlay in spec.overlays:
        canvas.stamp(overlay.sprite, overlay.x, overlay.y, z=overlay.z, layer="fx")
    anchors: Dict[str, Tuple[int, int]] = {}
    for name, ref in spec.anchors.items():
        if isinstance(ref, tuple):
            anchors[name] = (int(ref[0]), int(ref[1]))
        elif ref == "near_hand":
            anchors[name] = to_pixel(sk.near_arm.end)
        elif ref == "far_hand":
            anchors[name] = to_pixel(sk.far_arm.end)
        elif ref == "mouth":
            mx, my = character.mouth or head_kit.MOUTH
            anchors[name] = (head_x + mx, head_y + my)
        elif placed is not None and isinstance(ref, str):
            anchors[name] = to_pixel(placed.grip(ref))
    return Rendered(canvas, anchors, sk)


#: (hand, (elbow, hand) before, (elbow, hand) now) in frame pixels -> an overlay or None.
SmearFn = Callable[[str, Tuple[Tuple[int, int], Tuple[int, int]], Tuple[Tuple[int, int], Tuple[int, int]]],
                   Optional[Overlay]]


def render_sequence(character: Character, specs: Sequence[FrameSpec], smear_fn: Optional[SmearFn] = None,
                    loop: bool = False) -> List[Rendered]:
    """Renders an animation; frames that ask for a smear get one drawn from the previous
    frame's hand position (the previous frame wraps around for loops)."""
    first = [render_frame(character, spec) for spec in specs]
    if smear_fn is None or not any(spec.smear for spec in specs):
        return first
    out: List[Rendered] = []
    for index, (spec, rendered) in enumerate(zip(specs, first)):
        if not spec.smear:
            out.append(rendered)
            continue
        prev = first[index - 1] if (index > 0 or loop) else None
        if prev is None:
            out.append(rendered)
            continue
        overlays = list(spec.overlays)
        for hand in spec.smear:
            chain_prev = prev.skeleton.near_arm if hand == "near" else prev.skeleton.far_arm
            chain_now = rendered.skeleton.near_arm if hand == "near" else rendered.skeleton.far_arm
            overlay = smear_fn(hand, (to_pixel(chain_prev.mid), to_pixel(chain_prev.end)),
                               (to_pixel(chain_now.mid), to_pixel(chain_now.end)))
            if overlay is not None:
                overlays.append(overlay)
        out.append(render_frame(character, replace(spec, overlays=tuple(overlays))))
    return out
