"""The shared body rig: one skeleton, posed per frame, dressed per hero.

A pose places the pelvis and names the wrist and ankle targets; two-bone IK
finds elbows and knees with fixed bone lengths, so limbs never stretch
between frames (smear frames opt out on purpose). Limbs are drawn as tapered
capsules in the outfit's materials; hands, shoes, torso, head and props are
hand-authored key grids attached at the joints.

Depth order, back to front (3/4 view facing right):
    far arm -> far leg -> near leg -> back props -> torso -> head
    -> front props -> near arm.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from typing import Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from .compose import Frame, Part
from .grid import Grid, Point
from .raster import Bands, Bone, capsules, with_rim

Vec = Tuple[float, float]


@dataclass(frozen=True)
class Skeleton:
    upper_arm: float = 8.0
    forearm: float = 7.5
    thigh: float = 14.0
    shin: float = 13.5


SKELETON = Skeleton()


def ik(root: Vec, target: Vec, upper: float, lower: float, bend: int) -> Tuple[Vec, Vec]:
    """Joint and end point for a two-bone chain reaching for `target`.

    `bend` picks the side of the joint: +1 bends clockwise on screen (a knee
    pointing forward for a right-facing figure), -1 the other way (an elbow
    pointing back). Out-of-reach targets are clamped along the same direction.
    """
    dx, dy = target[0] - root[0], target[1] - root[1]
    dist = math.hypot(dx, dy)
    reach = upper + lower - 1e-3
    shortest = abs(upper - lower) + 1e-3
    if dist < 1e-6:
        dx, dy, dist = 0.0, 1.0, 1.0
    d = max(shortest, min(reach, dist))
    ux, uy = dx / dist, dy / dist
    end = (root[0] + ux * d, root[1] + uy * d)
    cos_a = (upper * upper + d * d - lower * lower) / (2 * upper * d)
    a = math.acos(max(-1.0, min(1.0, cos_a))) * bend
    jx = math.cos(a) * ux - math.sin(a) * uy
    jy = math.sin(a) * ux + math.cos(a) * uy
    joint = (root[0] + jx * upper, root[1] + jy * upper)
    return joint, end


def angle_of(a: Vec, b: Vec) -> float:
    """Screen angle in degrees from a to b: 0 = right, 90 = down."""
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 360


@dataclass(frozen=True)
class Material:
    """A cloth or skin ramp mapped onto the rasteriser's a/b/c/d keys.

    `pattern(along, across)` may lift a pixel one tone (a tie-dye blotch); it
    runs in limb space, so the print travels with the sleeve instead of
    swimming across it from frame to frame. `extra` adds colours for keys a
    limb style paints on top (a shirt cuff).
    """

    hi: str
    light: str
    mid: str
    shadow: str
    line: str
    group: str
    bands: Bands = Bands()
    pattern: Optional[Callable[[float, float], bool]] = None
    extra: Tuple[Tuple[str, str], ...] = ()
    rim: Optional[str] = None

    def palette(self) -> Dict[str, str]:
        out = {"a": self.hi, "b": self.light, "c": self.mid, "d": self.shadow}
        out.update(dict(self.extra))
        return out


@dataclass(frozen=True)
class Attachment:
    """A hand-authored grid placed on a joint, with its own palette."""

    grid: Grid
    palette: Mapping[str, str]
    line: str
    demote: str
    group: str = ""


def part_from_cells(
    cells: Mapping[Point, str],
    material: Material,
    name: str,
    joins: Sequence[str] = (),
    join_at: Optional[Tuple[float, float, float]] = None,
) -> Part:
    return Part(
        Grid.from_cells(cells, (0, 0)),
        (0, 0),
        material.palette(),
        material.line,
        "d",
        group=material.group,
        joins=frozenset(joins),
        name=name,
        join_at=join_at,
        rim=material.rim,
    )


def attach(att: Attachment, at: Vec, name: str, joins: Sequence[str] = ()) -> Part:
    return Part(
        att.grid,
        (int(math.floor(at[0])), int(math.floor(at[1]))),
        att.palette,
        att.line,
        att.demote,
        group=att.group,
        joins=frozenset(joins),
        name=name,
    )


@dataclass(frozen=True)
class LimbStyle:
    """Capsule radii (rim included) from root to end, for one outfit's sleeve or trouser leg.

    `cuff` darkens the last pixels before the hand or shoe (a ribbed cuff, a
    trouser hem), or paints them with `cuff_key` (a white shirt cuff);
    `crease` folds the cloth on the inside of a bent elbow or knee.
    """

    root: float
    joint: float
    end: float
    cuff: float = 0.0
    crease: bool = True
    cuff_key: str = ""
    # Short sleeves: the first `sleeve` pixels from the root are cloth (keys A..D), the rest bare skin.
    sleeve: float = 0.0


_DARKER = {"a": "b", "b": "c", "c": "d", "d": "d"}
_LIGHTER = {"a": "a", "b": "a", "c": "b", "d": "c"}


def _limb_space(p: Vec, root: Vec, joint: Vec, end: Vec) -> Tuple[float, float]:
    """(distance along the limb from the root, signed distance across it) for a pixel centre."""
    best: Optional[Tuple[float, float, float]] = None
    offset = 0.0
    for a, b in ((root, joint), (joint, end)):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy) or 1e-6
        ux, uy = dx / length, dy / length
        t = max(0.0, min(length, (p[0] - a[0]) * ux + (p[1] - a[1]) * uy))
        cx, cy = a[0] + ux * t, a[1] + uy * t
        across = (p[0] - cx) * -uy + (p[1] - cy) * ux
        dist = math.hypot(p[0] - cx, p[1] - cy)
        if best is None or dist < best[0]:
            best = (dist, offset + t, across)
        offset += length
    assert best is not None
    return best[1], best[2]


def limb_cells(
    root: Vec, joint: Vec, end: Vec, style: LimbStyle, bands: Bands, pattern: Optional[Callable[[float, float], bool]] = None
) -> Dict[Point, str]:
    cells = capsules(
        [Bone(root, joint, style.root, style.joint), Bone(joint, end, style.joint, style.end)], bands, rim=False
    )
    if pattern is not None:
        for (x, y), key in list(cells.items()):
            along, across = _limb_space((x + 0.5, y + 0.5), root, joint, end)
            if pattern(along, across):
                cells[(x, y)] = _LIGHTER[key]
    if style.sleeve > 0:
        for (x, y), key in list(cells.items()):
            along, _ = _limb_space((x + 0.5, y + 0.5), root, joint, end)
            if along <= style.sleeve:
                cells[(x, y)] = key.upper()
    if style.cuff > 0:
        lx, ly = end[0] - joint[0], end[1] - joint[1]
        length = math.hypot(lx, ly) or 1.0
        ux, uy = lx / length, ly / length
        for (x, y), key in list(cells.items()):
            along = (x + 0.5 - joint[0]) * ux + (y + 0.5 - joint[1]) * uy
            if length - style.cuff <= along <= length + 0.5:
                cells[(x, y)] = style.cuff_key or _DARKER[key]
    if style.crease:
        ax, ay = root[0] - joint[0], root[1] - joint[1]
        bx, by = end[0] - joint[0], end[1] - joint[1]
        la, lb = math.hypot(ax, ay) or 1.0, math.hypot(bx, by) or 1.0
        cos_bend = (ax * bx + ay * by) / (la * lb)
        if cos_bend > -0.55:  # bent past ~125 degrees
            ix, iy = ax / la + bx / lb, ay / la + by / lb
            il = math.hypot(ix, iy) or 1.0
            ix, iy = ix / il, iy / il
            for depth in (style.joint - 1.2, style.joint - 2.2):
                px, py = joint[0] + ix * depth, joint[1] + iy * depth
                point = (int(math.floor(px)), int(math.floor(py)))
                if point in cells:
                    cells[point] = "d"
    return with_rim(cells)


@dataclass(frozen=True)
class Limb:
    """A posed limb: where the end should go, how the joint bends, what is attached at the end."""

    end: Vec
    bend: int
    tip: str = ""
    # Draw the limb but not its tip (the tip is drawn elsewhere, e.g. a hand on a prop).
    hide_tip: bool = False
    # Override the IK joint, for smears and stylised poses.
    joint: Optional[Vec] = None
    # Stretch the limb: end is reached exactly (smear frames only).
    stretch: bool = False


@dataclass(frozen=True)
class Pose:
    """One frame of the rig. Coordinates are frame pixels (64x64, feet on row 63)."""

    hip: Vec
    near_arm: Limb
    far_arm: Limb
    near_leg: Limb
    far_leg: Limb
    torso: str = "stand"
    head: str = "smile"
    head_offset: Tuple[int, int] = (0, 0)
    # Extra parts: (layer name, part factory) where layer is one of LAYERS.
    extras: Tuple[Tuple[str, Callable[["Posed"], Optional[Part]]], ...] = ()
    decals: Tuple[Tuple[Point, str], ...] = ()


LAYERS = ("back", "far_arm", "far_leg", "near_leg", "behind_torso", "torso", "head", "front", "near_arm", "top")


@dataclass
class Posed:
    """Resolved joint positions of a pose, handed to prop factories."""

    pose: Pose
    neck: Vec
    near_shoulder: Vec
    far_shoulder: Vec
    near_hip: Vec
    far_hip: Vec
    near_elbow: Vec = (0.0, 0.0)
    near_wrist: Vec = (0.0, 0.0)
    far_elbow: Vec = (0.0, 0.0)
    far_wrist: Vec = (0.0, 0.0)
    near_knee: Vec = (0.0, 0.0)
    near_ankle: Vec = (0.0, 0.0)
    far_knee: Vec = (0.0, 0.0)
    far_ankle: Vec = (0.0, 0.0)
    head_at: Vec = (0.0, 0.0)


@dataclass(frozen=True)
class TorsoKit:
    """One torso variant: the grid (pivot = pelvis centre) and its anchor offsets from the pivot."""

    grid: Grid
    neck: Vec
    near_shoulder: Vec
    far_shoulder: Vec
    near_hip: Vec
    far_hip: Vec


@dataclass(frozen=True)
class Outfit:
    """Everything that dresses the rig as one hero."""

    name: str
    torsos: Mapping[str, TorsoKit]
    torso_palette: Mapping[str, str]
    torso_line: str
    torso_demote: str
    torso_group: str
    sleeve: Material
    sleeve_style: LimbStyle
    far_sleeve: Material
    trousers: Material
    far_trousers: Material
    leg_style: LimbStyle
    hands: Mapping[str, Attachment]
    feet: Mapping[str, Attachment]
    heads: Mapping[str, Attachment]
    # (dx, dy) from the neck anchor to where the head grid's pivot lands.
    head_offset: Tuple[int, int] = (0, 0)
    skeleton: Skeleton = SKELETON
    # Extra leg length in pixels; the rendered figure is raised by the same amount (see build_frame).
    lift: int = 0
    torso_rim: Optional[str] = None


def resolve(pose: Pose, outfit: Outfit) -> Posed:
    kit = outfit.torsos[pose.torso]
    hx, hy = pose.hip

    def at(offset: Vec) -> Vec:
        return (hx + offset[0], hy + offset[1])

    posed = Posed(
        pose=pose,
        neck=at(kit.neck),
        near_shoulder=at(kit.near_shoulder),
        far_shoulder=at(kit.far_shoulder),
        near_hip=at(kit.near_hip),
        far_hip=at(kit.far_hip),
    )
    sk = outfit.skeleton
    posed.near_elbow, posed.near_wrist = _reach(posed.near_shoulder, pose.near_arm, sk.upper_arm, sk.forearm)
    posed.far_elbow, posed.far_wrist = _reach(posed.far_shoulder, pose.far_arm, sk.upper_arm, sk.forearm)
    posed.near_knee, posed.near_ankle = _reach(posed.near_hip, pose.near_leg, sk.thigh, sk.shin)
    posed.far_knee, posed.far_ankle = _reach(posed.far_hip, pose.far_leg, sk.thigh, sk.shin)
    nx, ny = posed.neck
    ox, oy = outfit.head_offset
    posed.head_at = (nx + ox + pose.head_offset[0], ny + oy + pose.head_offset[1])
    return posed


def _reach(root: Vec, limb: Limb, upper: float, lower: float) -> Tuple[Vec, Vec]:
    if limb.joint is not None:
        return limb.joint, limb.end
    joint, end = ik(root, limb.end, upper, lower, limb.bend)
    if limb.stretch:
        return joint, limb.end
    return joint, end


def build_frame(pose: Pose, outfit: Outfit) -> Tuple[Frame, Posed]:
    """Renders one pose. With `outfit.lift`, the legs are drawn that much longer and the whole
    figure is then raised by the same amount, so a taller build reuses every pose unchanged."""
    lift = outfit.lift
    if lift:
        pose = replace(
            pose,
            near_leg=replace(pose.near_leg, end=(pose.near_leg.end[0], pose.near_leg.end[1] + lift)),
            far_leg=replace(pose.far_leg, end=(pose.far_leg.end[0], pose.far_leg.end[1] + lift)),
        )
    posed = resolve(pose, outfit)
    layers: Dict[str, List[Part]] = {name: [] for name in LAYERS}

    def limb_parts(
        prefix: str,
        root: Vec,
        joint: Vec,
        end: Vec,
        style: LimbStyle,
        material: Material,
        tips: Mapping[str, Attachment],
        limb: Limb,
        joins: Sequence[str],
    ) -> List[Part]:
        # Sleeves and trouser legs melt into the body only around their root joint.
        join_at = (root[0], root[1], style.root + 1.5)
        parts = [
            part_from_cells(
                limb_cells(root, joint, end, style, material.bands, material.pattern), material, prefix, joins, join_at
            )
        ]
        if limb.tip and not limb.hide_tip:
            tip = limb.tip
            if prefix.endswith("arm") and "@" not in tip:
                # Hands follow the forearm unless the pose pins their direction.
                tip = f"{tip}@{round(angle_of(joint, end))}"
            parts.append(attach(tips[tip], end, prefix + ".tip"))
        return parts

    o = outfit
    layers["far_arm"] += limb_parts(
        "far_arm", posed.far_shoulder, posed.far_elbow, posed.far_wrist, o.sleeve_style, o.far_sleeve, o.hands,
        pose.far_arm, (),
    )
    layers["far_leg"] += limb_parts(
        "far_leg", posed.far_hip, posed.far_knee, posed.far_ankle, o.leg_style, o.far_trousers, o.feet,
        pose.far_leg, (),
    )
    layers["near_leg"] += limb_parts(
        "near_leg", posed.near_hip, posed.near_knee, posed.near_ankle, o.leg_style, o.trousers, o.feet,
        pose.near_leg, (o.far_trousers.group,),
    )
    kit = o.torsos[pose.torso]
    layers["torso"].append(
        Part(
            kit.grid,
            (int(round(pose.hip[0])), int(round(pose.hip[1]))),
            o.torso_palette,
            o.torso_line,
            o.torso_demote,
            group=o.torso_group,
            name="torso",
            rim=o.torso_rim,
        )
    )
    head = o.heads[pose.head]
    layers["head"].append(attach(head, posed.head_at, "head"))
    layers["near_arm"] += limb_parts(
        "near_arm", posed.near_shoulder, posed.near_elbow, posed.near_wrist, o.sleeve_style, o.sleeve, o.hands,
        pose.near_arm, (o.torso_group,),
    )
    for layer, factory in pose.extras:
        part = factory(posed)
        if part is not None:
            layers[layer].append(part)
    frame = Frame()
    for name in LAYERS:
        frame.extend(layers[name])
    for point, colour in pose.decals:
        frame.decals[point] = colour
    if lift:
        frame.parts = [replace(part, at=(part.at[0], part.at[1] - lift), join_at=_lifted(part.join_at, lift)) for part in frame.parts]
        frame.decals = {(x, y - lift): colour for (x, y), colour in frame.decals.items()}
    return frame, posed


def _lifted(join_at: Optional[Tuple[float, float, float]], lift: int) -> Optional[Tuple[float, float, float]]:
    if join_at is None:
        return None
    return (join_at[0], join_at[1] - lift, join_at[2])


def shifted(pose: Pose, dx: float = 0, dy: float = 0) -> Pose:
    """The whole pose moved, limbs included."""

    def mv(limb: Limb) -> Limb:
        joint = None if limb.joint is None else (limb.joint[0] + dx, limb.joint[1] + dy)
        return replace(limb, end=(limb.end[0] + dx, limb.end[1] + dy), joint=joint)

    return replace(
        pose,
        hip=(pose.hip[0] + dx, pose.hip[1] + dy),
        near_arm=mv(pose.near_arm),
        far_arm=mv(pose.far_arm),
        near_leg=mv(pose.near_leg),
        far_leg=mv(pose.far_leg),
    )
