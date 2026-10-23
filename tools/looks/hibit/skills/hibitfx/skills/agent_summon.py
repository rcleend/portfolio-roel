"""AGENT SUMMON: an AI sidekick that calls its own tools and hunts down nearby problems.

One drone design serves both the icon and the game: a pearl dome with a dark
visor and two friendly cyan eyes, a rotor, a status light, a little tool arm
that fires, and a cyan thruster.

Sprites:
- ``fx-drone`` (32 x 32, origin = drone centre): ``summon`` (scan-in
  materialise), ``hover`` (24 frames at 15 fps = one 1.6 s orbit), ``hover-far``
  (the same, shaded for the far half of the orbit behind the hero), ``fire``
  (eye flash, muzzle flash, recoil, a satisfied blink), ``powerdown`` (the
  last-second warning loop) and ``dissolve`` (scan-out).
- ``fx-drone-shot``: the cyan packet in flight (``fly``) and its afterimages
  (``trail``, one frame per age).
- ``fx-drone-impact``: the packet landing on a customer.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from ..icon import FRAMES, accent_window, backlight, icon_sheet, layered
from ..light import lookup, outline, rim, shade_ellipse
from ..palette import AMBER, CYAN, HEART, PEARL, VISOR, WHITE
from ..pix import Canvas, dither_on, midpoint_circle, polar
from ..sheet import Anim, Sheet

SLOT = 2
_TABLE = lookup(PEARL, VISOR, CYAN, AMBER)
_THRESHOLDS = (0.05, 0.32, 0.6, 0.84)


def drone(
    size: Tuple[int, int] = (24, 24),
    ox: int = 0,
    oy: int = 0,
    rotor: int = 0,
    eyes: str = "open",
    recoil: int = 0,
    thrust: int = 1,
    led: Optional[str] = None,
) -> Canvas:
    """The drone facing right, its 24 x 24 design box offset by (ox, oy) inside ``size``."""
    c = Canvas(*size)
    bx = ox - recoil
    cx, cy, rx, ry = bx + 11.5, oy + 11.6, 8.6, 6.4
    shade_ellipse(c, cx, cy, rx, ry, PEARL, where=lambda x, y: y <= oy + 15, thresholds=_THRESHOLDS)
    for x in range(bx + 4, bx + 20):
        c.set(x, oy + 16, PEARL[2] if x < bx + 9 else PEARL[1])
    # The cap seam: a mid-tone arc that splits the dome into a lid and a body.
    for x, y in ((bx + 4, oy + 8), (bx + 5, oy + 7), (bx + 6, oy + 7), (bx + 7, oy + 7), (bx + 8, oy + 6)):
        if c.opaque(x, y):
            c.set(x, y, PEARL[3])
    for x, y in ((bx + 5, oy + 12), (bx + 6, oy + 13), (bx + 7, oy + 14)):
        if c.opaque(x, y):
            c.set(x, y, PEARL[2])
    vcx, vcy = cx + 3.4, cy + 0.8
    for y in range(int(vcy - 4), int(vcy + 4)):
        for x in range(int(vcx - 7), int(vcx + 7)):
            dx = (x + 0.5 - vcx) / 5.4
            dy = (y + 0.5 - vcy) / 2.8
            if dx * dx + dy * dy <= 1.0 and c.opaque(x, y):
                c.set(x, y, VISOR[1])
    for x in range(int(vcx - 3), int(vcx + 4)):
        if c.get(x, int(vcy - 2)) == VISOR[1]:
            c.set(x, int(vcy - 2), VISOR[2])
    c.set(int(vcx - 4), int(vcy - 1), VISOR[3])
    c.set(int(vcx - 3), int(vcy - 2), VISOR[4])
    _eyes(c, int(vcx) - 2, int(vcy) - 1, eyes)
    mx = int(cx) - 1
    c.set(mx, oy + 4, PEARL[3])
    c.set(mx + 1, oy + 4, PEARL[1])
    c.set(mx, oy + 3, PEARL[4])
    c.set(mx + 1, oy + 3, PEARL[2])
    _rotor(c, mx, oy + 2, rotor)
    light = {"amber": (AMBER[5], AMBER[3]), "red": (HEART[4], HEART[2]), "off": (PEARL[2], PEARL[1])}[led or "amber"]
    c.set(bx + 6, oy + 5, light[0])
    c.set(bx + 6, oy + 6, light[1])
    for x in range(bx + 15, bx + 19):
        c.set(x, oy + 17, PEARL[3])
        c.set(x, oy + 18, PEARL[2])
    c.set(bx + 19, oy + 17, CYAN[5])
    c.set(bx + 19, oy + 18, CYAN[3])
    out = outline(c, lambda col: _TABLE.get(col, PEARL))
    rim(out, lambda x, y, col: col in PEARL.tones[2:5] and y < oy + 15)
    _thruster(out, bx + 10, oy + 17, thrust)
    return out


# Eye poses: (dx, dy, tone) pixels of one eye; the second eye sits 4 px to the right.
_EYES: Dict[str, Tuple[Tuple[int, int, str], ...]] = {
    "open": ((0, 0, CYAN[5]), (1, 0, CYAN[4]), (0, 1, CYAN[4]), (1, 1, CYAN[3])),
    "half": ((0, 1, CYAN[4]), (1, 1, CYAN[3])),
    "happy": ((0, 1, CYAN[4]), (1, 0, CYAN[5]), (2, 1, CYAN[4])),
    "flash": ((0, 0, WHITE), (1, 0, WHITE), (0, 1, WHITE), (1, 1, WHITE)),
    "dim": ((0, 0, CYAN[3]), (1, 0, CYAN[2]), (0, 1, CYAN[2]), (1, 1, CYAN[2])),
    "off": ((0, 1, VISOR[3]), (1, 1, VISOR[3])),
}


def _eyes(c: Canvas, ex: int, ey: int, eyes: str) -> None:
    for offset in (0, 4):
        for dx, dy, tone in _EYES[eyes]:
            c.set(ex + offset + dx, ey + dy, tone)


def _rotor(c: Canvas, mx: int, y: int, stage: int) -> None:
    """Three stages of a spin: full blade, foreshortened with blurred tips, motion-blur dashes."""
    if stage == 0:
        for x in range(mx - 7, mx + 9):
            c.set(x, y, PEARL[4] if x <= mx else PEARL[3])
    elif stage == 1:
        for x in range(mx - 3, mx + 5):
            c.set(x, y, PEARL[4] if x <= mx else PEARL[3])
        c.set(mx - 6, y, PEARL[2])
        c.set(mx + 7, y, PEARL[2])
    else:
        for x in range(mx - 6, mx + 8):
            if (x - mx) % 2 == 0:
                c.set(x, y, PEARL[3])
    c.set(mx, y, WHITE)
    c.set(mx + 1, y, PEARL[4])


def _thruster(c: Canvas, tx: int, ty: int, length: int) -> None:
    """Stepped cyan flame under the belly; ``length`` 0-3."""
    if length <= 0:
        return
    c.set(tx, ty, WHITE)
    c.set(tx - 1, ty, CYAN[4])
    c.set(tx + 1, ty, CYAN[4])
    for k in range(length):
        y = ty + 1 + k
        c.set(tx, y, CYAN[4] if k == 0 else CYAN[2])
        if k == 0:
            c.set(tx - 1, y, CYAN[1])
            c.set(tx + 1, y, CYAN[1])


# ── icon ────────────────────────────────────────────────────────────────

def icon_frames() -> List[Canvas]:
    """At rest the rotor is still; in its accent window the drone wakes: spin-up, lift, a blink."""
    frames = []
    spin = (1, 2, 1, 2, 1, 2, 1, 0, 0)
    for f in range(FRAMES):
        i = accent_window(f, SLOT, len(spin))
        if i < 0:
            body = drone()
        else:
            lift = -1 if 1 <= i <= 6 else 0
            eyes = "half" if i == 4 else "open"
            body = drone(rotor=spin[i], eyes=eyes, thrust=2 if 1 <= i <= 6 else 1).shifted(0, lift)
        frames.append(layered(backlight(CYAN), body))
    return frames


# ── the drone in game ──────────────────────────────────────────────────

FRAME = (32, 32)
ORIGIN = (16, 16)
_DX, _DY = 4, 4  # the 24 x 24 design box inside the 32 x 32 frame, centred on ORIGIN


def _game(**pose: Any) -> Canvas:
    """The drone in the 32 x 32 game frame, centred on ORIGIN."""
    return drone(FRAME, _DX, _DY, **pose)


def _far(canvas: Canvas) -> Canvas:
    """The far half of the orbit, behind the hero: every tone one step darker, eyes dimmed."""
    mapping: Dict[str, str] = {}
    for ramp in (PEARL, VISOR):
        for i in range(1, 6):
            mapping[ramp[i]] = ramp[i - 1]
    for i in range(2, 6):
        mapping[CYAN[i]] = CYAN[i - 1]
    mapping[WHITE] = PEARL[3]
    return canvas.recolor(mapping)


def _hologram(canvas: Canvas, scan_y: int) -> Canvas:
    """Scan-in: above the scanline a cyan wireframe of the drone, the scanline itself white."""
    out = Canvas(canvas.w, canvas.h)
    for x, y, _ in canvas.points():
        if y > scan_y:
            continue
        edge = any(not canvas.opaque(x + a, y + b) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if y == scan_y:
            out.set(x, y, WHITE)
        elif edge:
            out.set(x, y, CYAN[4])
        elif (y % 2 == 0) and dither_on(x, y, 0.5, 2):
            out.set(x, y, CYAN[2])
    # The scanline overshoots the silhouette a little, like a print head.
    xs = [x for x, y, _ in canvas.points() if y == scan_y]
    if xs:
        out.set(min(xs) - 1, scan_y, CYAN[4])
        out.set(max(xs) + 1, scan_y, CYAN[4])
    return out


def _tinted(canvas: Canvas) -> Canvas:
    """The first solid frame: the whole drone in cyan, about to settle into its colours."""
    mapping = {}
    for ramp in (PEARL, VISOR):
        for i, tone in enumerate(ramp.tones):
            mapping[tone] = CYAN[min(5, max(1, i))]
    return canvas.recolor(mapping)


def summon_frames() -> List[Canvas]:
    ox, oy = ORIGIN
    full = _game(eyes="off", thrust=0, rotor=0)
    box = full.bbox()
    assert box is not None
    top, bottom = box[1], box[3]
    frames = []
    # A spark, then a ring opens: the agent is being called.
    spark = Canvas(*FRAME)
    spark.set(ox, oy, WHITE)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        spark.set(ox + dx, oy + dy, CYAN[4])
    frames.append(spark)
    for r in (4, 8):
        ring = Canvas(*FRAME)
        for x, y in midpoint_circle(ox, oy, r):
            ring.set(x, y, CYAN[4] if r == 4 else CYAN[3])
        ring.set(ox, oy, WHITE)
        frames.append(ring)
    # The scanline prints the drone top to bottom in six steps.
    steps = 6
    for k in range(steps):
        y = top + round((bottom - top) * (k + 1) / steps)
        frames.append(_hologram(full, y))
    frames.append(_tinted(full))
    frames.append(_game(eyes="off", thrust=1, rotor=1))
    frames.append(_game(eyes="half", thrust=1, rotor=2))
    frames.append(_game(eyes="open", thrust=2, rotor=1))
    return frames


def hover_frames(far: bool = False) -> List[Canvas]:
    """24 frames at 15 fps, one orbit: the rotor spins, the thruster breathes, a 1 px bob and one blink."""
    frames = []
    for f in range(24):
        rotor = (0, 1, 2, 1)[f % 4]
        thrust = (1, 2, 3, 2)[(f // 2) % 4]
        bob = -1 if (f // 6) % 2 else 0
        eyes = "half" if f in (17, 18) else "open"
        frame = _game(rotor=rotor, thrust=thrust, eyes=eyes).shifted(0, bob)
        frames.append(_far(frame) if far else frame)
    return frames


def _muzzle_flash(c: Canvas, x: int, y: int, size: int) -> None:
    if size >= 1:
        c.set(x, y, WHITE)
    if size >= 2:
        for dx, dy in ((1, 0), (0, 1), (0, -1)):
            c.set(x + dx, y + dy, WHITE if size >= 3 else CYAN[4])
        c.set(x + 2, y, CYAN[4])
    if size >= 3:
        for dx, dy in ((3, 0), (4, 0), (1, 1), (1, -1), (0, 2), (0, -2)):
            c.set(x + dx, y + dy, CYAN[4] if dx < 4 else CYAN[2])


def fire_frames() -> List[Canvas]:
    """Eye flash and muzzle flash, two pixels of recoil, then a satisfied ^^ blink."""
    mx, my = _DX + 20, _DY + 17
    spec = [("flash", 1, 3), ("flash", 2, 3), ("open", 1, 2), ("open", 0, 1), ("happy", 0, 0), ("happy", 0, 0)]
    frames = []
    for eyes, recoil, flash in spec:
        c = _game(eyes=eyes, recoil=recoil, rotor=(0, 1, 2)[recoil], thrust=2)
        _muzzle_flash(c, mx - recoil, my, flash)
        frames.append(c)
    return frames


def powerdown_frames() -> List[Canvas]:
    """The last second: the status light turns red and the eyes flicker, rotor slowing."""
    return [
        _game(led="red", eyes="open", rotor=0, thrust=1),
        _game(led="red", eyes="dim", rotor=0, thrust=1),
        _game(led="off", eyes="open", rotor=1, thrust=0),
        _game(led="off", eyes="dim", rotor=1, thrust=1),
    ]


def dissolve_frames() -> List[Canvas]:
    """Eyes close, then a scanline lifts the drone away bottom to top as cyan dust."""
    base = _game(eyes="off", rotor=0, thrust=0)
    box = base.bbox()
    assert box is not None
    top, bottom = box[1], box[3]
    frames = [_game(eyes="half", rotor=0, thrust=0), base]
    for k in range(1, 7):
        cut = bottom - round((bottom - top) * k / 6)
        c = Canvas(*FRAME)
        for x, y, col in base.points():
            if y < cut:
                c.set(x, y, col)
            elif y == cut:
                c.set(x, y, WHITE)
        # The erased part rises as sparse dust.
        for x, y, _ in base.points():
            if y > cut and (x * 7 + y * 3 + k) % 9 == 0:
                c.set(x, y - k * 2, CYAN[3] if k < 4 else CYAN[2])
        frames.append(c)
    return frames


def drone_sheet() -> Sheet:
    return Sheet(
        "fx-drone",
        FRAME,
        ORIGIN,
        [
            Anim("summon", 30, False, summon_frames()),
            Anim("hover", 15, True, hover_frames()),
            Anim("hover-far", 15, True, hover_frames(far=True)),
            Anim("fire", 30, False, fire_frames()),
            Anim("powerdown", 8, True, powerdown_frames()),
            Anim("dissolve", 30, False, dissolve_frames()),
        ],
    )


# ── the shot and its impact ────────────────────────────────────────────

SHOT = (12, 12)
SHOT_ORIGIN = (6, 6)


def _packet(c: Canvas, cx: int, cy: int, glow: int) -> None:
    """A round cyan packet: dark keyline, cyan body, white core; ``glow`` adds a dithered halo."""
    if glow:
        c.disc(cx + 0.5, cy + 0.5, 4.6, CYAN[1], where=lambda x, y: dither_on(x, y, 0.5, 2))
    c.disc(cx + 0.5, cy + 0.5, 3.6, CYAN[0])
    c.disc(cx + 0.5, cy + 0.5, 2.7, CYAN[3])
    c.disc(cx + 0.5, cy + 0.5, 1.8, CYAN[5])
    c.set(cx, cy, WHITE)
    c.set(cx - 1, cy - 1, WHITE)


def shot_sheet() -> Sheet:
    ox, oy = SHOT_ORIGIN
    fly = []
    for f in range(4):
        c = Canvas(*SHOT)
        _packet(c, ox, oy, glow=f % 2)
        # A spark ticks around the packet: it is a little alive.
        angle = math.radians(f * 90 - 45)
        sx, sy = polar(ox, oy, 4, angle)
        c.set(sx, sy, WHITE)
        fly.append(c)
    # Afterimages, one frame per age: a cross that shrinks to a fading pixel.
    trail = []
    for arm, centre, tone in ((2, CYAN[5], CYAN[4]), (1, CYAN[4], CYAN[3]), (0, CYAN[3], None), (0, CYAN[1], None)):
        c = Canvas(*SHOT)
        c.set(ox, oy, centre)
        for d in range(1, arm + 1):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c.set(ox + dx * d, oy + dy * d, tone)
        trail.append(c)
    return Sheet("fx-drone-shot", SHOT, SHOT_ORIGIN, [Anim("fly", 20, True, fly), Anim("trail", 30, False, trail)])


IMPACT = (24, 24)
IMPACT_ORIGIN = (12, 12)


def impact_sheet() -> Sheet:
    ox, oy = IMPACT_ORIGIN
    frames = []
    sparks = [math.radians(a) for a in (-60, 20, 100, 170, 240)]
    for f in range(7):
        c = Canvas(*IMPACT)
        if f == 0:
            c.disc(ox + 0.5, oy + 0.5, 2.8, WHITE)
            for d in range(3, 6):
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    c.set(ox + dx * d, oy + dy * d, WHITE if d < 5 else CYAN[4])
        else:
            r = (0, 4, 6, 8, 9, 10, 10)[f]
            if f <= 4:
                for x, y in midpoint_circle(ox, oy, r):
                    if f >= 3 and (x + y) % 2:
                        continue
                    c.set(x, y, CYAN[5] if f == 1 else CYAN[3])
                if f <= 2:
                    for x, y in midpoint_circle(ox, oy, r - 1):
                        c.set(x, y, CYAN[2])
            if f <= 2:
                c.disc(ox + 0.5, oy + 0.5, 2.2 - f * 0.6, WHITE)
            for k, a in enumerate(sparks):
                if f >= 5 and (k + f) % 2:
                    continue
                d = 3 + f * 1.7
                x, y = polar(ox, oy, d, a)
                c.set(x, y, WHITE if f < 3 else CYAN[4])
        frames.append(c)
    return Sheet("fx-drone-impact", IMPACT, IMPACT_ORIGIN, [Anim("impact", 30, False, frames)])


def sheets() -> List[Sheet]:
    return [icon_sheet(icon_frames()), drone_sheet(), shot_sheet(), impact_sheet()]

