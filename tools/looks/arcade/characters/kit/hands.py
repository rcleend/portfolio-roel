"""Hands: big, expressive, hand-authored, all drawn pointing down from the wrist.

`hand(shape, angle)` turns a shape to the forearm's direction in quarter
turns (pixel art survives 90 degree turns intact) and mirrors it when the
forearm points backwards, so the thumb stays on the side facing the viewer.
Keys are the skin ramp: a hi, b light, c mid, d shadow; `o` marks finger
creases that resolve to the inner skin line.
"""

from __future__ import annotations

from typing import Dict, Mapping, Optional

from . import palette as P
from .grid import Grid
from .raster import outline_outside
from .rig import Attachment


def _fill(text: str, pivot: tuple) -> Grid:
    g = Grid.parse(text)
    return Grid.from_cells(outline_outside(dict(g.cells)), pivot)


# Pivot = wrist, in fill coordinates (top row is the wrist under the cuff).
SHAPES: Mapping[str, Grid] = {
    "relax": _fill(
        """
        .bc.
        abbc
        abbcc
        bbcd.
        .cd..
        """,
        (1, 0),
    ),
    "fist": _fill(
        """
        .bc.
        abbc
        abbcd
        bbccd
        .cdd.
        """,
        (1, 0),
    ),
    # Fingers wrapped round a bar (a guitar neck, the keyboard's end).
    "grip": _fill(
        """
        .bc.
        abbc
        bocb
        .cd.
        """,
        (1, 0),
    ),
    # Spread fingers: hurt flails, victory waves.
    "open": _fill(
        """
        .bc..
        abbc.
        abbcb
        bbbcc
        b.b.c
        """,
        (1, 0),
    ),
    "point": _fill(
        """
        .bc.
        abbc
        abcc
        .bd.
        .b..
        .c..
        """,
        (1, 0),
    ),
    # Fingertips on keycaps.
    "type": _fill(
        """
        .bc.
        abbc
        bbbcc
        bobcd
        b.c..
        """,
        (1, 0),
    ),
}

# Shapes drawn in their final orientation (wrist on the left, facing right); never rotated.
FIXED: Mapping[str, Grid] = {
    # Thumbs up at the end of a forearm reaching forward.
    "thumbup": _fill(
        """
        .a...
        .b...
        .bb..
        abbbc
        bbbcd
        bcccd
        .ddd.
        """,
        (0, 4),
    ),
    # Fingers splayed upward: a wave or a "ta-da".
    "wave": _fill(
        """
        b.b.b
        bbbbb
        abbbc
        .bbc.
        .bc..
        """,
        (2, 4),
    ),
}

PALETTE: Dict[str, str] = {"a": P.SKIN.hi, "b": P.SKIN.light, "c": P.SKIN.mid, "d": P.SKIN.shadow}


def hand_grid(shape: str, angle: float) -> Grid:
    """The shape turned to point along `angle` (screen degrees: 0 right, 90 down)."""
    if shape in FIXED:
        return FIXED[shape]
    grid = SHAPES[shape]
    a = angle % 360
    # Quarter turns from "down" (90): clockwise turns move down -> left -> up -> right.
    if 45 <= a < 135:
        return grid
    if 135 <= a < 225:  # pointing back (left)
        return grid.rotated90(1)
    if 225 <= a < 315:  # up
        return grid.rotated90(2).flipped()
    return grid.rotated90(3)  # forward (right)


def attachment(shape: str, angle: float, palette: Optional[Mapping[str, str]] = None, line: str = "") -> Attachment:
    return Attachment(hand_grid(shape, angle), palette or PALETTE, line or P.SKIN.line, "d", "skin")


class OrientedHands(dict):
    """Hand attachments keyed `shape@angle`, built on first use, in one skin palette."""

    def __init__(self, palette: Optional[Mapping[str, str]] = None, line: str = "") -> None:
        super().__init__()
        self._palette = palette
        self._line = line

    def __missing__(self, key: str) -> Attachment:
        shape, _, angle = key.partition("@")
        att = attachment(shape, float(angle or 90), self._palette, self._line)
        self[key] = att
        return att
