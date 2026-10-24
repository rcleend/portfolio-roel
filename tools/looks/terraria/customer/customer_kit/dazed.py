"""Terraria's Dazed stars, circling a stunned customer's head.

The star is the one on Terraria's Dazed debuff icon in its own colours, its two inner shades drawn as one so
a stunned frame keeps to the palette's cap. Two of them circle
the head on a flat orbit, opposite each other, passing behind the head on the far half of it and in front of
the scalp on the near half. The orbit is tilted, its far side over the face and its near side over the back of
the head, so the two stars never stand one above the other as they pass over and in front of the crown. `STARS` holds a star at each of the orbit's eight stations as an effect hung from
the crown; a frame of `stunned` names the two it shows.
"""
from __future__ import annotations

import math
from typing import Dict, Tuple

from .art import art, tones
from .rig import Effect

STAR = '''
..00..
.0320.
032220
.0220.
032020
00..00
'''
SIZE = 6
# Eight stations round the orbit, one a frame; the two stars stand four apart.
STATIONS = 8
# The orbit's middle, from the crown, and its half width and half height.
MIDDLE = (1, -2)
RADII = (10, 3)
# How far the orbit's near point leans back, and its far point forward, from straight over the crown.
TILT = 3
CROWN = (16, 12)


def station(index: int) -> Tuple[int, int]:
    """Where the star at `index` is centred in design space, on a head whose crown is at CROWN: 0 is in front of
    the face, and the stations go round past the viewer, behind the head and over its far side."""
    angle = 2 * math.pi * index / STATIONS
    x = CROWN[0] + MIDDLE[0] + RADII[0] * math.cos(angle) - TILT * math.sin(angle)
    y = CROWN[1] + MIDDLE[1] + RADII[1] * math.sin(angle)
    return math.floor(x + 0.5), math.floor(y + 0.5)


def behind(index: int) -> bool:
    """On the far half of the orbit, the star passes behind the head."""
    return station(index)[1] < CROWN[1] + MIDDLE[1]


def star(index: int) -> Effect:
    x, y = station(index)
    drawing = art(f'dazed star at station {index}', x - SIZE // 2, y - SIZE // 2, STAR, legend=tones('dazed', '023'),
                  crown=CROWN)
    return Effect(drawing, 'crown', 'behind' if behind(index) else 'front')


STARS: Dict[str, Effect] = {f'star {index}': star(index) for index in range(STATIONS)}


def pair(frame: int) -> Tuple[str, str]:
    """The two stars a frame of the loop shows: opposite each other, a station further round each frame."""
    return f'star {frame % STATIONS}', f'star {(frame + STATIONS // 2) % STATIONS}'
