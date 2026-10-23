"""The shared frame of all six skill icons.

Every icon is a 24 x 24, 24-frame idle loop at 12 fps (two seconds) built
the same way, which is what makes the six read as one set:

- a stepped backlight disc in the skill's own energy colour, the same size
  in every icon, so each skill owns a colour in the HUD;
- the subject lit from the top-left with a cool rim from the right and a
  coloured outline;
- one focal accent per loop: a four-point glint that blooms on the
  subject's hottest highlight, plus at most one quiet secondary motion.

Frame 0 is the rest pose: the HUD freezes icons on frame 0 while a skill
recharges. Skill-1 icons play their accent in the first half of the loop
and skill-2 icons in the second, so the two icons in a hero's HUD take
turns instead of glinting together.
"""

from __future__ import annotations

from typing import Sequence

from .palette import WHITE, Ramp
from .pix import Canvas, dither_on
from .sheet import Anim, Sheet

SIZE = 24
FPS = 12
FRAMES = 24
CENTER = (11.5, 11.5)

# Glint bloom, one entry per frame: 0 off, 1 a pixel, 2 a 3 px cross, 3 a 5 px cross.
GLINT_STAGES = (1, 2, 3, 3, 2, 1)
# Where in the loop each slot's accent starts (skill 1, skill 2).
ACCENT_START = {1: 3, 2: 15}


def backlight(ramp: Ramp, cx: float = CENTER[0], cy: float = CENTER[1]) -> Canvas:
    """The shared halo: a dithered rim, a dark band and a brighter core disc."""
    canvas = Canvas(SIZE, SIZE)
    canvas.disc(cx, cy, 10.6, ramp[1], where=lambda x, y: dither_on(x, y, 0.5, 2))
    canvas.disc(cx, cy, 9.2, ramp[1])
    canvas.disc(cx, cy, 6.6, ramp[2])
    return canvas


def glint(canvas: Canvas, x: int, y: int, stage: int, arm: str, core: str = WHITE) -> None:
    """A four-point twinkle centred on (x, y) at bloom ``stage`` (0-3)."""
    if stage <= 0:
        return
    canvas.set(x, y, core)
    if stage >= 2:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            canvas.set(x + dx, y + dy, core if stage >= 3 else arm)
    if stage >= 3:
        for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
            canvas.set(x + dx, y + dy, arm)


def glint_stage(frame: int, start: int) -> int:
    i = frame - start
    return GLINT_STAGES[i] if 0 <= i < len(GLINT_STAGES) else 0


def accent_window(frame: int, slot: int, length: int) -> int:
    """Frame index inside this slot's accent window, or -1 outside it."""
    i = frame - ACCENT_START[slot]
    return i if 0 <= i < length else -1


def layered(*layers: Canvas) -> Canvas:
    out = Canvas(SIZE, SIZE)
    for layer in layers:
        out.blit(layer)
    return out


def icon_sheet(frames: Sequence[Canvas]) -> Sheet:
    if len(frames) != FRAMES:
        raise ValueError(f"an icon loop has {FRAMES} frames, got {len(frames)}")
    return Sheet("icon", (SIZE, SIZE), (0, 0), [Anim("idle", FPS, True, list(frames))])

