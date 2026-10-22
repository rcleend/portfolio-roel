"""AGENT SUMMON: an AI drone that orbits the hero for eight seconds and fires at the nearest customer.

Strips
  icon        the drone face-on: rotor, visor, scanning eye, hover jet (24 x 24)
  fx-drone    side view, facing right (code flips it towards its target):
              summon (6, a hologram that prints itself line by line),
              hover (16, loop; one loop = one 1.6 s orbit), fire (4, with a
              `muzzle` anchor), dismiss (6, the hologram in reverse)
  fx-shot     a cyan pulse; round, so it reads in any direction (2, loop)
  fx-impact   a targeting reticle snapping shut on the customer (6)
"""

from __future__ import annotations

from typing import Callable, List, Optional, Tuple

from .. import icon_kit, raster
from ..grid import Grid, rows
from ..palette import EYE, LED, SHELL, VISOR, WHITE
from ..sheet import Animation, Strip

# ── Icon: face-on ─────────────────────────────────────────────────────────

# Front view: a top rotor on a short mast over a porcelain pod with a smoked
# visor and one wide scanning eye, side fins, and a hover jet underneath.
DRONE_FRONT = rows("""
    ..........oooo..........
    .........oMMMmo.........
    ..........omo...........
    .......oooooooooo.......
    .....ooPPPPPPPPpLoo.....
    ....oPPPpppppppppLLo....
    ...oPPpvvvvvvvvvvvLLo...
    ...oPvVVvvvvvvvvvvvLo...
    ..ooPvVeeeeEEeeeeevLoo..
    .oFoPvveeeeeeeeeeevLoFo.
    .oFoPpvvvvvvvvvvvvLLoFo.
    ..ooPLLLLLLLLLLLLLLdoo..
    ....oLLLLLLLLLLLLLddo...
    .....oodLLLLLLLLLddo....
    .......ooddddddddoo.....
    ..........oooooo........
""")

DRONE_FRONT_KEY = {
    "o": SHELL[0], "M": SHELL[3], "m": SHELL[2], "P": SHELL[4], "p": SHELL[3], "L": SHELL[3],
    "d": SHELL[2], "F": SHELL[3], "v": VISOR[0], "V": VISOR[2], "e": EYE[2], "E": EYE[4],
}

# The rotor seen edge-on, one continuous blur over a dark hub; a long and a short
# blur alternate every other frame, which reads as spin without flicker.
ROTOR_LONG = [SHELL[2], SHELL[3], SHELL[4], SHELL[4], SHELL[3], SHELL[3], SHELL[3], SHELL[2], SHELL[2],
              SHELL[3], SHELL[3], SHELL[3], SHELL[4], SHELL[4], SHELL[3], SHELL[2]]
ROTOR_SHORT = [None, SHELL[2], SHELL[3], SHELL[4], SHELL[3], SHELL[3], SHELL[2], SHELL[2], SHELL[2],
               SHELL[2], SHELL[3], SHELL[3], SHELL[4], SHELL[3], SHELL[2], None]


def drone_icon(frame: int) -> Grid:
    art = Grid(icon_kit.SIZE, icon_kit.SIZE)
    bob = -1 if frame in (4, 5, 6, 7) else 0
    top = 2 + bob
    art.stamp(0, top + 1, DRONE_FRONT, DRONE_FRONT_KEY)
    blades = ROTOR_LONG if frame % 4 < 2 else ROTOR_SHORT
    for i, tone in enumerate(blades):
        if tone:
            art.set(4 + i, top, tone)
    # The eye scans: its bright core glides across the visor once per loop, out of step with FULL-STACK's pulse.
    eye_row = top + 9
    core = {12: 8, 13: 10, 14: 13, 15: 15}.get(frame)
    if core is not None:
        for x in range(6, 18):
            if art.get(x, eye_row) == EYE[4]:
                art.set(x, eye_row, EYE[2])
        art.set(core, eye_row, EYE[4])
        art.set(core + 1, eye_row, EYE[4])
    # Hover jet: stepped cyan bands that flicker between two lengths.
    jet = top + 17
    art.hline(10, 13, jet, EYE[3])
    art.hline(11, 12, jet + 1, EYE[2] if frame % 4 < 2 else EYE[3])
    if frame % 4 < 2:
        art.hline(11, 12, jet + 2, EYE[1])
    return art.outline(SHELL[0], corners=False, where=lambda x, y: y <= top)


def icon() -> Strip:
    return icon_kit.build_icon(icon_kit.glow(EYE[1]), drone_icon)


# ── Drone: side view, facing right ────────────────────────────────────────

DRONE_W, DRONE_H = 28, 24  # room on the nose side for the muzzle flash
DRONE_ORIGIN = (12, 12)

# The rotor is drawn per frame above the mast; the pod is a teardrop with a
# wraparound visor at the nose, one bright eye, a status light on its flank,
# a swept fin at the tail and the emitter under the nose.
DRONE_SIDE = rows("""
    .........hh...........
    .......ooHHoo.........
    .....ooPPPPPPoo.......
    ...ooPPPPPPPPPPoo.....
    ..oPPPpppppppppVVoo...
    .ooPpppppppppppvVEEvo.
    oFFopppppcpppppvvEevo.
    oFFFpppppppppppvvvvoo.
    .ooLLLLLLLLLLLLLLLLonx
    ...odLLLLLLLLLLLLLddo.
    ....ooddddddddddddoo..
    ......oooooooooooo....
""")

DRONE_SIDE_KEY = {
    "o": SHELL[0], "h": SHELL[2], "H": SHELL[3], "P": SHELL[4], "p": SHELL[3], "L": SHELL[3],
    "d": SHELL[2], "F": SHELL[3], "v": VISOR[0], "V": VISOR[2], "e": EYE[3], "E": EYE[4],
    "c": EYE[2], "n": SHELL[1], "x": EYE[3],
}

POD_X, POD_Y = 1, 4  # where DRONE_SIDE sits in the frame
EYE_PIXELS = ((POD_X + 17, POD_Y + 5), (POD_X + 18, POD_Y + 5), (POD_X + 17, POD_Y + 6), (POD_X + 18, POD_Y + 6))
NOZZLE = (POD_X + 21, POD_Y + 8)  # the emitter tip: shots leave here

HOVER_BOB = (0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0)


def _rotor(g: Grid, y: int, phase: int) -> None:
    """The rotor edge-on above the mast; two blade states alternate."""
    if phase % 2 == 0:
        g.hline(POD_X + 3, POD_X + 18, y, SHELL[3])
        g.hline(POD_X + 6, POD_X + 15, y, SHELL[4])
    else:
        g.hline(POD_X + 5, POD_X + 16, y, SHELL[2])
        g.set(POD_X + 2, y, SHELL[4])
        g.set(POD_X + 19, y, SHELL[4])


def _jet(g: Grid, y: int, phase: int) -> None:
    cx = POD_X + 10
    g.hline(cx - 1, cx + 2, y, EYE[3])
    g.hline(cx, cx + 1, y + 1, EYE[2] if phase % 2 == 0 else EYE[3])
    if phase % 2 == 0:
        g.hline(cx, cx + 1, y + 2, EYE[1])


def drone_body(dy: int = 0, dx: int = 0, rotor: int = 0, jet: Optional[int] = 0, eye: str = "open") -> Grid:
    g = Grid(DRONE_W, DRONE_H)
    g.stamp(POD_X + dx, POD_Y + dy, DRONE_SIDE, DRONE_SIDE_KEY)
    _rotor(g, POD_Y + dy - 1, rotor)
    if eye == "closed":
        for x, y in EYE_PIXELS:
            g.set(x + dx, y + dy, VISOR[0])
        g.hline(POD_X + 17 + dx, POD_X + 18 + dx, POD_Y + 6 + dy, EYE[1])
    elif eye == "bright":
        for x, y in EYE_PIXELS:
            g.set(x + dx, y + dy, EYE[4])
    if jet is not None:
        _jet(g, POD_Y + 12 + dy, jet)
    return g


def hover_frames() -> List[Grid]:
    return [drone_body(HOVER_BOB[i], rotor=i, jet=i, eye="closed" if i == 11 else "open") for i in range(16)]


def _muzzle_flash(g: Grid, x: int, y: int, size: int) -> None:
    if size >= 2:
        for dx, dy in ((1, 0), (2, 0), (0, -1), (0, 1), (1, -1), (1, 1)):
            g.set(x + dx, y + dy, EYE[3])
        g.set(x + 3, y, EYE[2])
    g.set(x, y, WHITE)
    g.set(x + 1, y, EYE[4] if size >= 2 else EYE[3])


def fire_frames() -> Tuple[List[Grid], List[Tuple[int, int]]]:
    nx, ny = NOZZLE
    frames, muzzle = [], []
    g = drone_body(dx=-1, rotor=0, jet=0, eye="bright")  # recoil: the pod kicks back as it fires
    _muzzle_flash(g, nx, ny, 2)
    frames.append(g)
    muzzle.append((nx + 1, ny))
    g = drone_body(dx=-1, rotor=1, jet=1, eye="bright")
    _muzzle_flash(g, nx, ny, 1)
    frames.append(g)
    muzzle.append((nx + 1, ny))
    frames.append(drone_body(rotor=0, jet=0))
    muzzle.append((nx + 2, ny))
    frames.append(drone_body(rotor=1, jet=1))
    muzzle.append((nx + 2, ny))
    return frames, muzzle


def _hologram(solid: Grid, rows_solid: Callable[[int], bool], scan: Optional[int]) -> Grid:
    """The drone as a hologram: outline pixels in cyan, solid where `rows_solid(y)`, a scan line at `scan`."""
    g = Grid(DRONE_W, DRONE_H)
    for x, y in solid.points():
        color = solid.get(x, y)
        if rows_solid(y):
            g.set(x, y, color)
        elif color == SHELL[0]:
            g.set(x, y, EYE[2])
    if scan is not None:
        for x in range(DRONE_W):
            if solid.opaque(x, scan) or solid.opaque(x, scan - 1) or solid.opaque(x, scan + 1):
                g.set(x, scan, EYE[4])
    return g


def summon_frames() -> List[Grid]:
    body = drone_body(jet=None)
    top, bottom = POD_Y - 1, POD_Y + 11
    frames = []
    g = Grid(DRONE_W, DRONE_H)  # f0: a point of light where the drone will be
    g.set(DRONE_ORIGIN[0], DRONE_ORIGIN[1], WHITE)
    for dx in (-2, -1, 1, 2):
        g.set(DRONE_ORIGIN[0] + dx, DRONE_ORIGIN[1], EYE[3] if abs(dx) == 1 else EYE[2])
    frames.append(g)
    g = Grid(DRONE_W, DRONE_H)  # f1: a scan line and corner brackets frame the space it will occupy
    g.hline(POD_X + 2, POD_X + 19, DRONE_ORIGIN[1], EYE[3])
    for x, y, sx, sy in ((POD_X, top, 1, 1), (POD_X + 21, top, -1, 1), (POD_X, bottom, 1, -1), (POD_X + 21, bottom, -1, -1)):
        g.set(x, y, EYE[2])
        g.set(x + sx, y, EYE[2])
        g.set(x, y + sy, EYE[2])
    frames.append(g)
    frames.append(_hologram(body, lambda y: False, top + 1))  # f2: wireframe, printing from the top
    frames.append(_hologram(body, lambda y: y < POD_Y + 5, POD_Y + 5))  # f3: half printed
    g = body.recolor({SHELL[0]: EYE[2]})  # f4: printed, its outline still glowing
    _jet(g, POD_Y + 12, 0)
    frames.append(g)
    frames.append(drone_body(rotor=1, jet=1))  # f5: online
    return frames


def dismiss_frames() -> List[Grid]:
    body = drone_body(jet=None)
    frames = [
        drone_body(rotor=0, jet=1, eye="closed"),  # powers down: the eye shuts, the jet sputters
        body.recolor({SHELL[0]: EYE[2]}),
        _hologram(body, lambda y: y < POD_Y + 5, POD_Y + 5),
        _hologram(body, lambda y: False, None),
    ]
    g = Grid(DRONE_W, DRONE_H)  # collapses to a scan line, then a point
    g.hline(POD_X + 4, POD_X + 17, DRONE_ORIGIN[1], EYE[3])
    frames.append(g)
    g = Grid(DRONE_W, DRONE_H)
    g.set(DRONE_ORIGIN[0], DRONE_ORIGIN[1], EYE[4])
    g.set(DRONE_ORIGIN[0] - 1, DRONE_ORIGIN[1], EYE[2])
    g.set(DRONE_ORIGIN[0] + 1, DRONE_ORIGIN[1], EYE[2])
    frames.append(g)
    return frames


def drone_strip() -> Strip:
    fire, muzzle = fire_frames()
    hover = hover_frames()
    return Strip("fx-drone", DRONE_W, DRONE_H, DRONE_ORIGIN, [
        Animation("summon", 15, False, summon_frames()),
        Animation("hover", 10, True, hover),
        Animation("fire", 15, False, fire, {"muzzle": muzzle}),
        Animation("dismiss", 15, False, dismiss_frames()),
    ])


# ── Shot and impact ───────────────────────────────────────────────────────

SHOT = 9


def shot_frame(bright: bool) -> Grid:
    g = Grid(SHOT, SHOT)
    c = SHOT // 2
    g.plot(raster.polygon([(c + 0.5, c - 2.5), (c + 3.5, c + 0.5), (c + 0.5, c + 3.5), (c - 2.5, c + 0.5)]), EYE[2])
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        g.set(c + dx, c + dy, EYE[4] if bright else EYE[3])
    g.set(c, c, WHITE)
    return g.outline(EYE[0], corners=False)


def shot_strip() -> Strip:
    return Strip("fx-shot", SHOT, SHOT, (SHOT // 2, SHOT // 2), [Animation("fly", 15, True, [shot_frame(False), shot_frame(True)])])


IMPACT = 24


def _ticks(g: Grid, c: int, start: int, length: int, tone: str) -> None:
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for i in range(start, start + length):
            g.set(c + dx * i, c + dy * i, tone)


def impact_frames() -> List[Grid]:
    c = IMPACT // 2
    centre = (c + 0.5, c + 0.5)
    frames = []
    g = Grid(IMPACT, IMPACT)  # f0: a white plus inside a tight ring
    g.plot(raster.thin(raster.ring(*centre, 2.5, 2.5)), EYE[4])
    _ticks(g, c, 0, 2, WHITE)
    frames.append(g)
    g = Grid(IMPACT, IMPACT)  # f1: the reticle locks: ring and four ticks
    g.plot(raster.thin(raster.ring(*centre, 4.5, 4.5)), EYE[3])
    _ticks(g, c, 6, 2, EYE[4])
    g.set(c, c, EYE[4])
    frames.append(g)
    for radius, tick, tone, dots in ((6.5, 8, EYE[2], False), (8.5, None, EYE[1], True)):
        g = Grid(IMPACT, IMPACT)  # the ring opens and breaks into four arcs
        ring = raster.thin(raster.ring(*centre, radius, radius))
        g.plot({p for p in ring if abs(p[0] - c) > 1 and abs(p[1] - c) > 1}, tone)
        if tick:
            _ticks(g, c, tick, 2, EYE[3])
        if dots:
            for dx, dy in ((7, -7), (-7, 7), (8, 6), (-6, -8)):
                g.set(c + dx, c + dy, EYE[3])
        frames.append(g)
    g = Grid(IMPACT, IMPACT)
    for dx, dy in ((9, -8), (-8, 9), (10, 7), (-7, -10)):
        g.set(c + dx, c + dy, EYE[2])
    frames.append(g)
    g = Grid(IMPACT, IMPACT)
    for dx, dy in ((10, -9), (-9, 10)):
        g.set(c + dx, c + dy, EYE[1])
    frames.append(g)
    return frames


def impact_strip() -> Strip:
    frames = impact_frames()
    return Strip("fx-impact", IMPACT, IMPACT, (IMPACT // 2, IMPACT // 2), [
        Animation("hit", 20, False, frames),
        Animation("hit-calm", 20, False, frames[1:]),
    ])


def strips() -> List[Strip]:
    return [icon(), drone_strip(), shot_strip(), impact_strip()]
