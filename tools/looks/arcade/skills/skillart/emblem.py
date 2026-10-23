"""The shared frame of the six arcade skill icons.

Every icon is the same three layers, which is what makes the six read as one
set in the select screen and the HUD:

1. a midnight dome, lit from the top-left like everything else in the look;
2. a two-band glow in the skill's own colour that hugs the subject's
   silhouette (stepped bands, never a blur);
3. the subject itself, ink-outlined, with a white specular on its lit side.

The idle loop is shared too: 16 frames at 8 fps where frame 0 is the clean
rest pose (the HUD freezes on it while a skill cools down), the subject's own
small motion runs underneath, and one diagonal glint sweeps across the
subject near the end of each loop.
"""

from __future__ import annotations

import math
from typing import Callable, Dict, List, Optional, Sequence

from pixkit.canvas import Sprite, disc, edge_of, outline_of
from pixkit.palette import (
    CHROME,
    CYAN,
    FIRE,
    GLASS,
    GOLD,
    HEART,
    INK,
    LAVENDER,
    MAPLE,
    PINK,
    ROSEWOOD,
    SHELL,
    SMOKE,
    STRAT_BODY,
    STRAT_GUARD,
    TEAL,
    VIOLET,
    WHITE,
    WOOD,
    Ramp,
)
from pixkit.sheet import Animation, Strip

SIZE = 24
IDLE_FPS = 8
IDLE_FRAMES = 16
#: Frames of the loop on which the glint crosses the subject.
GLINT_FRAMES = (10, 11, 12, 13)

#: The dome every icon sits on: deep, lit half, rim, rim highlight.
NIGHT = ("#0f0d26", "#19193f", "#2b2d68", "#4c4e9a")

_CENTRE = (SIZE - 1) / 2
_RADIUS = 11.0


def dome() -> Sprite:
    """The midnight disc every icon sits on, lit on its top-left half and rimmed with light."""
    sprite = Sprite(SIZE, SIZE)
    shape = disc(_CENTRE, _CENTRE, _RADIUS)
    for x, y in shape:
        # Split along the anti-diagonal: the half facing the top-left light is one step lighter.
        lit = (x + 0.5 - _CENTRE) + (y + 0.5 - _CENTRE) < -_RADIUS * 0.7
        sprite.set(x, y, NIGHT[1] if lit else NIGHT[0])
    for x, y in edge_of(shape):
        facing = math.cos(math.atan2(y + 0.5 - _CENTRE, x + 0.5 - _CENTRE) + math.pi * 0.75)
        if facing > 0.6:
            sprite.set(x, y, NIGHT[3])
        elif facing > 0.0:
            sprite.set(x, y, NIGHT[2])
    return sprite


def compose(subject: Sprite, glow: Ramp, overlay: Optional[Sprite] = None) -> Sprite:
    """Dome, then the subject's stepped glow (only on the dome), then the subject, then any loose light.

    ``overlay`` holds things that are light themselves (sound rings, sparkles):
    they sit on top without a glow of their own, so they stay crisp lines.
    """
    icon = dome()
    near = outline_of(subject.mask(), corners=False)
    far = outline_of(subject.mask() | near, corners=True)
    icon.fill_where(far, glow.deep, lambda current: current is not None)
    icon.fill_where(near, glow.dark, lambda current: current is not None)
    icon.blit(subject)
    if overlay is not None:
        icon.blit(overlay)
    return icon


def _brighter_map() -> Dict[str, str]:
    ramps: List[Sequence[str]] = [
        CYAN,
        VIOLET,
        GOLD,
        PINK,
        TEAL,
        LAVENDER,
        HEART,
        SHELL,
        GLASS,
        WOOD,
        FIRE,
        SMOKE,
        CHROME,
        STRAT_BODY,
        STRAT_GUARD,
        ROSEWOOD,
        MAPLE,
    ]
    brighter: Dict[str, str] = {}
    for ramp in ramps:
        for darker, lighter in zip(ramp, list(ramp[1:]) + [WHITE]):
            brighter.setdefault(darker, lighter)
    return brighter


#: Each palette tone's next lighter tone (the lightest go to white): the glint's soft leading and trailing edge.
BRIGHTER = _brighter_map()


def glint(subject: Sprite, frame: int) -> Sprite:
    """The shared shine: a diagonal band that sweeps top-left to bottom-right over ``GLINT_FRAMES``."""
    if frame not in GLINT_FRAMES:
        return subject
    # The band is the diagonal x + y = k, two pixels wide, crossing the 24 px icon in four 9 px steps.
    k = 4 + GLINT_FRAMES.index(frame) * 9
    shone = subject.copy()
    for x, y, color in subject.pixels():
        if color == INK:
            continue
        d = x + y - k
        if d in (0, 1):
            shone.set(x, y, WHITE)
        elif d in (-1, 2):
            shone.set(x, y, BRIGHTER.get(color, color))
    return shone


def icon_strip(
    subject_at: Callable[[int], Sprite], glow: Ramp, overlay_at: Optional[Callable[[int], Optional[Sprite]]] = None
) -> Strip:
    """The 24 x 24 ``idle`` loop: ``subject_at(frame)`` supplies each frame's subject before framing and glint."""
    frames = [compose(glint(subject_at(i), i), glow, overlay_at(i) if overlay_at else None) for i in range(IDLE_FRAMES)]
    return Strip(frame=(SIZE, SIZE), origin=(0, 0), animations=[Animation("idle", IDLE_FPS, True, frames)])
