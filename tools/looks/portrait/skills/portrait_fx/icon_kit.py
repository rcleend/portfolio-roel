"""What makes the six skill icons one set.

Every icon is a single object lit from the top-left, rimmed in its own dark
hue, standing in front of a two-band backlight disc: a soft glow of the
skill's own colour, mixed by one rule (`glow`) from the slot's mid tone. The
disc is the shared frame: the same size, the same two stepped bands, and the
same slow breath in every icon, so the set reads as a family in the dark
bevelled slots of the select screen and the HUD.

The idle loop is 16 frames at 8 fps (2 s) and frame 0 is always the plain
rest pose, because the HUD freezes icons on frame 0 while a skill cools down.
Each icon spends most of the loop at rest and has one moment of life (a
glint, a pulse, a bob); the two icons of a hero are staggered so they never
twinkle together.
"""

from __future__ import annotations

from typing import Callable, List, Optional, Sequence, Tuple

from . import raster
from .grid import Grid
from .palette import WHITE
from .sheet import Animation, Strip

SIZE = 24
FRAMES = 16
FPS = 8
CENTER = (12.0, 12.0)  # the disc is centred on a pixel corner, so it is symmetric over 0..23
DISC_OUTER = 11.0
DISC_INNER = 8.0

#: Frames (of 16) on which the shared backlight breathes out by one pixel.
BREATH = frozenset({9, 10, 11, 12})
#: The middle of the slot's banded fill (src/game/ui/theme.ts, steel), which every glow is mixed from.
SLOT_MID = "#262a3c"


def glow(accent: str, strength: float = 1.0) -> Tuple[str, str]:
    """The backlight's outer and inner band: the slot's mid tone moved towards the skill's colour.

    `strength` < 1 suits bright accents (gold), which glow enough with less colour.
    """
    def mix(t: float) -> str:
        a = [int(SLOT_MID[i:i + 2], 16) for i in (1, 3, 5)]
        b = [int(accent[i:i + 2], 16) for i in (1, 3, 5)]
        return "#" + "".join(f"{round(a[k] + (b[k] - a[k]) * t):02x}" for k in range(3))

    return mix(0.16 * strength), mix(0.28 * strength)


def backlight(outer: str, inner: str, frame: int = 0) -> Grid:
    """The shared two-band disc behind every icon."""
    grid = Grid(SIZE, SIZE)
    grid.plot(raster.disc(*CENTER, DISC_OUTER), outer)
    grid.plot(raster.disc(*CENTER, DISC_INNER + (1 if frame in BREATH else 0)), inner)
    return grid


def glint(grid: Grid, x: int, y: int, phase: int, core: str = WHITE, arm: Optional[str] = None) -> None:
    """The shared four-point twinkle, centred on (x, y). Phases 1-3 grow and shrink; 0 draws nothing."""
    arm = arm or core
    if phase <= 0:
        return
    grid.set(x, y, core)
    reach = {1: 1, 2: 2, 3: 1}.get(phase, 0)
    for step in range(1, reach + 1):
        tone = arm if step == reach and reach > 1 else core
        for dx, dy in ((step, 0), (-step, 0), (0, step), (0, -step)):
            grid.set(x + dx, y + dy, tone)


def compose(background: Grid, art: Grid) -> Grid:
    frame = background.copy()
    frame.paste(art)
    return frame


def icon_strip(frames: Sequence[Grid]) -> Strip:
    if len(frames) != FRAMES:
        raise ValueError(f"an icon idle loop has {FRAMES} frames, got {len(frames)}")
    return Strip("icon", SIZE, SIZE, (0, 0), [Animation("idle", FPS, True, list(frames))])


def build_icon(disc: Sequence[str], draw: Callable[[int], Grid]) -> Strip:
    """Composes `draw(frame)` (the object, already outlined) over the shared backlight for every frame."""
    outer, inner = disc
    frames: List[Grid] = [compose(backlight(outer, inner, i), draw(i)) for i in range(FRAMES)]
    return icon_strip(frames)
