"""Tiny 3D vector helpers (tuples, no numpy: the asset tools run on stock Python + Pillow).

World space for a character frame: x to the right, y up from the feet line, z towards
the viewer. One unit is one native pixel, and the origin is the frame's bottom-centre.
"""

from __future__ import annotations

import math
from typing import Tuple

Vec = Tuple[float, float, float]


def add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def scale(a: Vec, s: float) -> Vec:
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def length(a: Vec) -> float:
    return math.sqrt(dot(a, a))


def norm(a: Vec) -> Vec:
    n = length(a)
    return (0.0, 0.0, 1.0) if n == 0 else (a[0] / n, a[1] / n, a[2] / n)


def lerp(a: Vec, b: Vec, t: float) -> Vec:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def rotate(v: Vec, axis: Vec, angle: float) -> Vec:
    """Rodrigues rotation of `v` around the unit `axis` by `angle` radians."""
    c, s = math.cos(angle), math.sin(angle)
    k = axis
    kv = cross(k, v)
    kd = dot(k, v)
    return (
        v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
        v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
        v[2] * c + kv[2] * s + k[2] * kd * (1 - c),
    )


class Frame3:
    """An orthonormal basis: `fwd`, `up` and `side`.

    `side` points to the character's RIGHT. A character facing screen-right shows its
    right side to the viewer (z+), so `side` is also "towards the camera" in profile:
    the near arm and leg are the right ones.
    """

    __slots__ = ("fwd", "up", "side")

    def __init__(self, fwd: Vec, up: Vec, side: Vec) -> None:
        self.fwd = fwd
        self.up = up
        self.side = side

    @staticmethod
    def facing(yaw: float, lean: float = 0.0) -> "Frame3":
        """A body facing +x, turned `yaw` radians towards the viewer, tilted forward by `lean`.

        With yaw 0 the character is in profile facing right and its right side faces the
        viewer; a positive yaw opens the chest towards the camera (three-quarter view).
        """
        fwd: Vec = (math.cos(yaw), 0.0, math.sin(yaw))
        side: Vec = (-math.sin(yaw), 0.0, math.cos(yaw))
        up: Vec = (0.0, 1.0, 0.0)
        frame = Frame3(fwd, up, side)
        return frame.pitched(lean) if lean else frame

    def pitched(self, angle: float) -> "Frame3":
        """Tilts forward (positive) or back around the side axis."""
        fwd = rotate(self.fwd, self.side, -angle)
        up = rotate(self.up, self.side, -angle)
        return Frame3(fwd, up, self.side)

    def rolled(self, angle: float) -> "Frame3":
        """Leans towards the character's right side (positive) around the forward axis."""
        up = rotate(self.up, self.fwd, angle)
        side = rotate(self.side, self.fwd, angle)
        return Frame3(self.fwd, up, side)

    def leaned(self, angle: float) -> "Frame3":
        """Leans forward (positive) in the screen plane, around the view axis.

        Sprites read lean in the picture plane; pitching around a three-quarter-turned
        side axis would spend most of it on depth, so body lean is cheated this way.
        """
        axis: Vec = (0.0, 0.0, 1.0)
        return Frame3(rotate(self.fwd, axis, -angle), rotate(self.up, axis, -angle), rotate(self.side, axis, -angle))

    def yawed(self, angle: float) -> "Frame3":
        """Turns around the local up axis; positive opens towards the viewer."""
        fwd = rotate(self.fwd, self.up, -angle)
        side = rotate(self.side, self.up, -angle)
        return Frame3(fwd, self.up, side)

    def point(self, origin: Vec, f: float, u: float, s: float) -> Vec:
        """`origin` plus local offsets along forward, up and side."""
        return (
            origin[0] + self.fwd[0] * f + self.up[0] * u + self.side[0] * s,
            origin[1] + self.fwd[1] * f + self.up[1] * u + self.side[1] * s,
            origin[2] + self.fwd[2] * f + self.up[2] * u + self.side[2] * s,
        )

    def direction(self, f: float, u: float, s: float) -> Vec:
        return norm(self.point((0.0, 0.0, 0.0), f, u, s))

    def to_local(self, v: Vec) -> Vec:
        return (dot(v, self.fwd), dot(v, self.up), dot(v, self.side))
