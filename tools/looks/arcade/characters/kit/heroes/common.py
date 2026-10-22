"""Pieces every hero shares: the head kit, hands, shoes and material helpers."""

from __future__ import annotations

from typing import Dict, Mapping, Tuple

from ..hands import OrientedHands  # noqa: F401  (re-exported for the hero modules)
from .. import head as HEAD
from .. import palette as P
from ..grid import Grid, Point
from ..raster import Bands, outline_outside
from ..rig import Attachment, Material, TorsoKit
from ..skew import skew_rows, stretch_rows


def fill(text: str, pivot: Point) -> Grid:
    """Fill-only rows (no outline) -> grid with its outline ring added; pivot in fill coordinates."""
    g = Grid.parse(text)
    return Grid.from_cells(outline_outside(dict(g.cells)), pivot)


def material(ramp: P.Ramp, group: str, bands: Bands = Bands(0.9, 0.52, 0.14), rim=None) -> Material:
    return Material(ramp.hi, ramp.light, ramp.mid, ramp.shadow, ramp.line, group, bands, rim=rim)


def far_material(ramp: P.Ramp, group: str, bands: Bands = Bands(0.9, 0.52, 0.14), rim=None) -> Material:
    """The same cloth one step darker: limbs on the far side of the body."""
    return Material(ramp.light, ramp.mid, ramp.shadow, ramp.line, ramp.line, group + "_far", bands, rim=rim)


def ramp_keys(ramp: P.Ramp) -> Dict[str, str]:
    return {"a": ramp.hi, "b": ramp.light, "c": ramp.mid, "d": ramp.shadow}


def heads(cap: bool) -> Mapping[str, Attachment]:
    return {
        name: Attachment(HEAD.head(name, cap), HEAD.PALETTE, HEAD.LINE, HEAD.DEMOTE, "head")
        for name in HEAD.EXPRESSIONS
    }


# ── Shoes: side view pointing right, pivot at the ankle (fill coordinates). ──

_SNEAKER_ROWS = {
    "flat": (
        """
        .bbb.....
        abbbbbb..
        abbbbbbbc
        eeeeeeeee
        """,
        (2, 0),
    ),
    # Toe down: push-off, tiptoe, dangling in the air.
    "toe": (
        """
        .bb...
        abbb..
        abbbb.
        .bbbbc
        ..ebbc
        ...eec
        """,
        (2, 0),
    ),
    # Heel strike: toe lifted.
    "heel": (
        """
        .bbb....cc
        abbbbbbbc.
        abbbbbbc..
        eeeeeee...
        """,
        (2, 0),
    ),
}

_LEATHER_ROWS = {
    "flat": (
        """
        .bbb.....
        abbbbbbb.
        abbbbbbbc
        eeeeeeeee
        """,
        (2, 0),
    ),
    "toe": (
        """
        .bb...
        abbb..
        abbbb.
        .bbbbc
        ..ebbc
        ...eec
        """,
        (2, 0),
    ),
    "heel": (
        """
        .bbb....bc
        abbbbbbbc.
        abbbbbbc..
        eeeeeee...
        """,
        (2, 0),
    ),
}


def shoes(ramp: P.Ramp, sole: str, leather: bool = False) -> Mapping[str, Attachment]:
    rows = _LEATHER_ROWS if leather else _SNEAKER_ROWS
    palette = ramp_keys(ramp)
    palette["e"] = sole
    return {
        name: Attachment(fill(text, pivot), palette, ramp.line, "d", "shoe") for name, (text, pivot) in rows.items()
    }


def mirror_x(point: Point, width: int) -> Point:
    return (width - 1 - point[0], point[1])


Anchor = Tuple[int, int]


# Torso variants every hero shares: leans in whole-pixel steps and an inhale.
LEANS = {"stand": 0, "lean1": 1, "lean2": 2, "back1": -1, "back2": -2}
BREATH_ROW = 8  # rows above this lift on an inhale: the chest and shoulders, not the hem


def torso_kits(fill_text: str, pivot: Point) -> Mapping[str, TorsoKit]:
    """`stand`, `lean1`, `lean2`, `back1`, `back2` and `breathe` for one hero's torso fill."""

    def grid(lean: int, breathe: bool) -> Grid:
        g = Grid.parse(fill_text, pivot)
        if breathe:
            g = stretch_rows(g, BREATH_ROW)
        if lean:
            step = (7 if abs(lean) == 1 else 4) * (1 if lean > 0 else -1)
            g = skew_rows(g, step=step, pivot_y=pivot[1])
        return Grid.from_cells(outline_outside(dict(g.cells)), g.pivot)

    def kit(lean: int, breathe: bool = False) -> TorsoKit:
        up = 1 if breathe else 0
        return TorsoKit(
            grid(lean, breathe),
            neck=(1 + lean, -13 - up),
            near_shoulder=(-3 + lean, -11 - up),
            far_shoulder=(4 + lean, -11 - up),
            near_hip=(-2, -1),
            far_hip=(2, -1),
        )

    kits = {name: kit(lean) for name, lean in LEANS.items()}
    kits["breathe"] = kit(0, True)
    return kits
