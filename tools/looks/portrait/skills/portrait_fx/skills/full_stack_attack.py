"""FULL-STACK ATTACK: front-end, back-end and database fired as one piercing three-layer beam.

Each layer of the stack keeps its own texture all the way to the edge of the
screen, so the three read as different things moving together: a smooth
front-end rail carrying light pulses, back-end traffic flowing as chevrons,
and database rows as segmented records.

Strips
  icon        the beam leaving its muzzle, layers fanning out (24 x 24)
  fx-beam     a 24 px body tile, repeated by code from the muzzle to the
              screen edge: grow (3) -> hold (4, loop) -> fade (4)
  fx-muzzle   the aperture at the `hand` anchor: charge (5) -> hold (4, loop)
              -> fade (4), plus charge-calm for reduced motion
  fx-tip      the leading edge while the beam races out (2, loop)
  fx-hit      selection-box brackets snapping round each customer struck (6)
"""

from __future__ import annotations

from typing import Callable, List, Optional, Sequence

from .. import icon_kit, raster
from ..grid import Grid
from ..palette import AMBER, CYAN, INK, VIOLET, WHITE
from ..sheet import Animation, Strip

LAYERS = (CYAN, VIOLET, AMBER)

# ── The beam cross-section ────────────────────────────────────────────────
# Three 4-row layers with 2-row gaps, so the stage (and the customers it
# pierces) shows between them like a stack diagram. Rows: top edge, core,
# light, rim. The core is the brightest row (the beam emits light); the dark
# rim underneath keeps each layer readable on the bright golden-hour sky.
LAYER_H = 4
GAP = 2
BEAM_H = 3 * LAYER_H + 2 * GAP  # 16
TILE_W = 24  # a common period of every texture: 24 (pulses), 8 (chevrons), 6 (records)
LAYER_TOPS = tuple(i * (LAYER_H + GAP) for i in range(3))
CORE = 1


def layer_tones(ramp: Sequence[str]) -> List[str]:
    return [ramp[2], ramp[4], ramp[3], ramp[1]]


def texture(layer: int, x: int, row: int, base: str) -> str:
    """The layer's own pattern at tile column x."""
    if layer == 0 and row == CORE and x % 24 < 6:
        return WHITE  # a front-end packet of light
    if layer == 1:
        phase = x % 8
        if (phase == 2 and row in (0, 2)) or (phase == 3 and row == CORE):
            return VIOLET[4] if row != CORE else WHITE  # back-end traffic: > > >
        if row == CORE:
            return VIOLET[3]
    if layer == 2 and row in (0, 1, 2) and x % 6 == 5:
        return AMBER[1] if row != CORE else AMBER[2]  # database records
    return base


def beam_tile(rows_per_layer: Sequence[int], textured: bool = True, core: Optional[str] = None,
              keep: Callable[[int], bool] = lambda x: True) -> Grid:
    """A TILE_W x BEAM_H body tile. `rows_per_layer` picks which of the 4 rows are lit."""
    grid = Grid(TILE_W, BEAM_H)
    for layer, ramp in enumerate(LAYERS):
        tones = layer_tones(ramp)
        for row in rows_per_layer:
            for x in range(TILE_W):
                if not keep(x):
                    continue
                tone = tones[row]
                if textured:
                    tone = texture(layer, x, row, tone)
                if core and row == CORE:
                    tone = core
                grid.set(x, LAYER_TOPS[layer] + row, tone)
    return grid


def beam_strip() -> Strip:
    full = [0, 1, 2, 3]
    grow = [
        beam_tile([CORE], textured=False),
        beam_tile([0, 1, 2], textured=False),
        beam_tile(full, core=WHITE),  # ignition: every core burns white for one frame
    ]
    shimmer = beam_tile(full)
    # The front-end core flickers between white and pale cyan: energy, not motion.
    for x in range(0, TILE_W, 2):
        if shimmer.get(x, LAYER_TOPS[0] + CORE) == CYAN[4]:
            shimmer.set(x, LAYER_TOPS[0] + CORE, WHITE)
    lit_edges = beam_tile(full).map(
        lambda x, y, c: {CYAN[2]: CYAN[3], VIOLET[2]: VIOLET[3], AMBER[2]: AMBER[3]}.get(c, c)
        if y % (LAYER_H + GAP) == 0 else c)
    hold = [beam_tile(full), shimmer, beam_tile(full), lit_edges]
    fade = [
        beam_tile([0, 1, 2]),
        beam_tile([CORE]),
        beam_tile([CORE], keep=lambda x: x % 4 < 2),
        beam_tile([CORE], keep=lambda x: x % 8 == 0),
    ]
    return Strip("fx-beam", TILE_W, BEAM_H, (0, BEAM_H // 2), [
        Animation("grow", 30, False, grow),
        Animation("hold", 15, True, hold),
        Animation("fade", 25, False, fade),
    ])


# ── Muzzle: the emitter plate the stack leaves through ────────────────────

MUZZLE_W, MUZZLE_H = 16, 32
MUZZLE_ORIGIN = (6, 16)  # the hand: the beam body starts at origin.x + 1
PLATE_HALF = BEAM_H // 2 + 3  # the plate stands 3 px proud of the beam at both ends


def _plate(g: Grid, half: int, thick: int, hot: bool) -> None:
    """A vertical emitter plate centred on the origin, banded in the three layer colours, with serifs."""
    ox, oy = MUZZLE_ORIGIN
    for y in range(oy - half, oy + half):
        third = min(2, max(0, (y - (oy - half)) * 3 // (2 * half)))
        ramp = LAYERS[third]
        for i in range(thick):
            g.set(ox - i, y, WHITE if hot and i == 0 else ramp[4] if i == 0 else ramp[3])
        g.set(ox - thick, y, ramp[2])
    for y, ramp in ((oy - half - 1, CYAN), (oy + half, AMBER)):
        g.hline(ox - thick - 1, ox + 1, y, ramp[3])


def muzzle_frames(calm: bool = False) -> List[Grid]:
    ox, oy = MUZZLE_ORIGIN
    frames = []
    # f0: the three layers converge on the hand as three motes.
    g = Grid(MUZZLE_W, MUZZLE_H)
    for dy, ramp in zip((-6, 0, 6), LAYERS):
        g.set(ox - 3, oy + dy, ramp[3])
        g.set(ox - 2, oy + dy, ramp[4])
    g.set(ox, oy, CYAN[4])
    frames.append(g)
    # f1: a hot core with three colour ticks.
    g = Grid(MUZZLE_W, MUZZLE_H)
    for dy, ramp in zip((-4, 0, 4), LAYERS):
        g.hline(ox - 2, ox, oy + dy, ramp[3])
    g.rect(ox - 1, oy - 1, 2, 3, CYAN[4])
    g.set(ox, oy, WHITE)
    frames.append(g)
    # f2: the plate draws itself outwards from the centre.
    g = Grid(MUZZLE_W, MUZZLE_H)
    _plate(g, 6, 2, hot=True)
    frames.append(g)
    # f3: full plate, one frame of backward flare (left out of the calm variant).
    g = Grid(MUZZLE_W, MUZZLE_H)
    _plate(g, PLATE_HALF, 3, hot=True)
    if not calm:
        for dy, ramp in zip((-5, 1, 7), LAYERS):
            g.hline(ox - 6, ox - 4, oy + dy - 1, ramp[3])
            g.set(ox - 7, oy + dy - 1, ramp[2])
    frames.append(g)
    frames.append(muzzle_hold(0))
    return frames


def muzzle_hold(phase: int) -> Grid:
    g = Grid(MUZZLE_W, MUZZLE_H)
    _plate(g, PLATE_HALF, 2 if phase % 2 else 3, hot=phase % 2 == 0)
    return g


def muzzle_strip() -> Strip:
    fade = []
    for half, thick in ((PLATE_HALF - 2, 2), (6, 2), (3, 1)):
        g = Grid(MUZZLE_W, MUZZLE_H)
        _plate(g, half, thick, hot=False)
        fade.append(g)
    g = Grid(MUZZLE_W, MUZZLE_H)
    ox, oy = MUZZLE_ORIGIN
    for dy, ramp in zip((-4, 0, 4), LAYERS):
        g.set(ox, oy + dy, ramp[2])
    fade.append(g)
    return Strip("fx-muzzle", MUZZLE_W, MUZZLE_H, MUZZLE_ORIGIN, [
        # 30 fps: the plate opens in the same ~0.1 s the beam takes to reach the edge of the screen.
        Animation("charge", 30, False, muzzle_frames()),
        Animation("hold", 15, True, [muzzle_hold(i) for i in range(4)]),
        Animation("fade", 25, False, fade),
        Animation("charge-calm", 30, False, muzzle_frames(calm=True)),
    ])


# ── Tip: the leading edge racing to the screen edge ───────────────────────

TIP_W = 16


def tip_frame(phase: int) -> Grid:
    g = Grid(TIP_W, BEAM_H)
    for layer, ramp in enumerate(LAYERS):
        top = LAYER_TOPS[layer]
        tones = layer_tones(ramp)
        # Each layer ends in a white-hot nose: the core runs ahead of the edges.
        for row, length in ((0, 3), (CORE, 6), (2, 4), (3, 2)):
            g.hline(0, length, top + row, WHITE if row == CORE else tones[row])
        g.set(7, top + CORE, ramp[4])
        # Spray ahead of the nose, alternating between two spacings.
        for i, x in enumerate((9, 12) if phase == 0 else (10, 14)):
            if (i + layer) % 2 == 0:
                g.set(x, top + CORE, ramp[3] if i == 0 else ramp[2])
    return g


def tip_strip() -> Strip:
    return Strip("fx-tip", TIP_W, BEAM_H, (0, BEAM_H // 2), [Animation("race", 30, True, [tip_frame(0), tip_frame(1)])])


# ── Hit: a selection box snaps round the customer ─────────────────────────
# The box is larger than the beam is tall, so its corners frame the customer's
# torso above and below the beam instead of drowning in it.

HIT = 48


def _brackets(g: Grid, c: int, half: int, arm: int, tones: Sequence[str]) -> None:
    """Four corner brackets of a square selection box: top-left cyan, top-right violet, bottom amber."""
    corners = ((-1, -1, tones[0]), (1, -1, tones[1]), (-1, 1, tones[2]), (1, 1, tones[2]))
    for sx, sy, tone in corners:
        x, y = c + sx * half, c + sy * half
        for i in range(arm):
            g.set(x - sx * i, y, tone)
            g.set(x, y - sy * i, tone)


def hit_frames() -> List[Grid]:
    c = HIT // 2
    frames = []
    g = Grid(HIT, HIT)  # f0: a white diamond flash with short rays, right on the beam
    g.plot(raster.polygon([(c + 0.5, c - 2.5), (c + 3.5, c + 0.5), (c + 0.5, c + 3.5), (c - 2.5, c + 0.5)]), WHITE)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for i in range(3, 8):
            g.set(c + dx * i, c + dy * i, CYAN[4] if i < 6 else CYAN[3])
    frames.append(g)
    shards = (((-6, -11), (10, -7), (-3, 11)), ((-8, -14), (14, -9), (-4, 15)), ((-10, -17), (17, -11), (-5, 18)))
    for frame, (half, arm, step) in enumerate(((10, 4, 4), (13, 4, 3), (15, 3, 2), (17, 2, 1))):
        g = Grid(HIT, HIT)
        _brackets(g, c, half, arm, tuple(ramp[step] for ramp in LAYERS))
        if frame == 0:
            g.rect(c - 1, c - 1, 3, 3, CYAN[4])
            g.set(c, c, WHITE)
        else:
            for (dx, dy), ramp in zip(shards[frame - 1], LAYERS):
                size = 2 if frame < 3 else 1
                g.rect(c + dx, c + dy, size, size, ramp[step + 1 if frame == 1 else step])
        frames.append(g)
    g = Grid(HIT, HIT)  # the last corner pixels
    for (dx, dy), ramp in zip(((-19, -19), (19, -19), (-19, 19)), LAYERS):
        g.set(c + dx, c + dy, ramp[1])
    frames.append(g)
    return frames


def hit_strip() -> Strip:
    frames = hit_frames()
    return Strip("fx-hit", HIT, HIT, (HIT // 2, HIT // 2), [
        Animation("hit", 20, False, frames),
        # Reduced motion: the same box without the white flash frame.
        Animation("hit-calm", 20, False, frames[1:]),
    ])


# ── Icon ──────────────────────────────────────────────────────────────────


ICON_LAYER_TOPS = (5, 10, 15)


def icon_layers(grid: Grid, x0: int) -> None:
    """The three layers as parallel 4-row bands from the emitter to (and past) the right edge."""
    for top, ramp in zip(ICON_LAYER_TOPS, LAYERS):
        for row, tone in enumerate(layer_tones(ramp)):
            grid.hline(x0, grid.width - 1, top + row, tone)
    # Back-end traffic as chevrons, database rows as records: the same textures as the beam in play.
    for x in range(x0 + 3, grid.width - 1, 5):
        grid.set(x, ICON_LAYER_TOPS[1], VIOLET[4])
        grid.set(x + 1, ICON_LAYER_TOPS[1] + 1, WHITE)
        grid.set(x, ICON_LAYER_TOPS[1] + 2, VIOLET[4])
    for x in range(x0 + 4, grid.width, 4):
        for row in (0, 1, 2):
            grid.set(x, ICON_LAYER_TOPS[2] + row, AMBER[1] if row != CORE else AMBER[2])


def flare(grid: Grid, cx: float, cy: float, hot: bool) -> None:
    """The moment the stack fires: a round flare in stepped cyan bands, its white heart swelling on the beat."""
    grid.plot(raster.disc(cx, cy, 4.4), CYAN[2])
    grid.plot(raster.disc(cx, cy, 3.3), CYAN[3])
    grid.plot(raster.disc(cx, cy, 2.2), CYAN[4])
    grid.plot(raster.disc(cx, cy, 1.8 if hot else 1.2), WHITE)


def stack_icon(frame: int) -> Grid:
    art = Grid(icon_kit.SIZE, icon_kit.SIZE)
    icon_layers(art, 4)
    art = art.outline(INK, corners=False)
    flare(art, 5.0, 12.0, hot=frame in (4, 5))
    # Once per loop a packet of light leaves along the front-end rail.
    pulse = {4: 10, 5: 14, 6: 18, 7: 22}.get(frame)
    if pulse is not None:
        art.hline(pulse, min(pulse + 1, 23), ICON_LAYER_TOPS[0] + CORE, WHITE)
    return art


def icon() -> Strip:
    return icon_kit.build_icon(icon_kit.glow(VIOLET[2]), stack_icon)


def strips() -> List[Strip]:
    return [icon(), beam_strip(), muzzle_strip(), tip_strip(), hit_strip()]
