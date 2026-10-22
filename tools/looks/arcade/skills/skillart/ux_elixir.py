"""UX ELIXIR: one potion and for six seconds every complaint makes sense.

Pink is the elixir's colour wherever it appears: the liquid, the glint when
the hero drinks, and the calm motifs that float over customers under its
spell.
"""

from __future__ import annotations

import math
from typing import Dict, Optional

from pixkit.canvas import Sprite
from pixkit.palette import GLASS, INK, PINK, WHITE, WOOD
from pixkit.sheet import Animation, Strip, with_calm

from . import emblem, motifs

FLASK_KEY = {
    "o": INK,
    "W": WHITE,
    "a": GLASS.deep,
    "b": GLASS.dark,
    "c": GLASS.mid,
    "d": GLASS.light,
    "p": PINK.deep,
    "P": PINK.dark,
    "q": PINK.mid,
    "Q": PINK.light,
    "R": PINK.pale,
    "w": WOOD.dark,
    "x": WOOD.mid,
    "X": WOOD.light,
    "Y": WOOD.pale,
}

#: The icon's round-bottomed flask, 24 x 24, liquid level and bubbles at rest.
FLASK = [
    "........................",
    "..........oooo..........",
    ".........oYXxwo.........",
    ".........oXXxwo.........",
    ".........oXxxwo.........",
    "........ocddcbbo........",
    ".........ocdbao.........",
    ".........ocdbao.........",
    "........occdbbao........",
    "......occcccbbbbao......",
    ".....oWcccccbbbbbao.....",
    "....oWccccccbbbbbbao....",
    "....oWRQQQQQQQQQQQQo....",
    "....oWQQQQQQqqqqqqPo....",
    "....oQQQQqqqqqqqqPPo....",
    "....oQQqqqqqqqqqqPPo....",
    "....oqqqqqqqqqqqqPpo....",
    ".....oqqqqqqqqqqPpo.....",
    ".....oqqqqqqqqqPPpo.....",
    "......oPqqqqqPPPpo......",
    ".......oPPPPPPPpo.......",
    "........oooooooo........",
    "........................",
    "........................",
]

#: A bubble's path up through the liquid, one position per idle frame (None: no bubble).
_BUBBLE = [
    (13, 19),
    (13, 18),
    (14, 17),
    (14, 16),
    (13, 15),
    (13, 14),
    None,
    None,
    (11, 19),
    (11, 18),
    (10, 17),
    (10, 16),
    (11, 15),
    (11, 14),
    None,
    None,
]


def _icon_subject(frame: int) -> Sprite:
    """The icon's flask; a bubble rises through the elixir."""
    subject = Sprite.from_rows(FLASK, FLASK_KEY)
    bubble = _BUBBLE[frame]
    if bubble is not None:
        subject.set(*bubble, PINK.pale)
    return subject


def _icon_glint(frame: int) -> Optional[Sprite]:
    """The drinking glint winks at the flask's shoulder once per loop."""
    radius = {2: 1, 3: 2, 4: 1}.get(frame)
    if not radius:
        return None
    glint = Sprite(emblem.SIZE, emblem.SIZE)
    glint.blit(motifs.twinkle(radius, PINK), 16 - radius, 6 - radius)
    return glint


# ── The potion in the hero's hand ──────────────────────────────────────────
#
# The in-game flask is drawn from geometry, not pixels, so it can tip towards
# the hero's mouth while its liquid stays level: every frame is the same
# bottle rotated about the grip, with the pink settling under gravity and the
# glass highlight staying on the lit top-left, as it would on a real sphere.

POTION = (28, 28)
#: The grip: where the hand anchor holds the flask (its body's centre). The cork reaches 13 px from it.
GRIP = (14, 14)


def _bottle_parts(x: float, y: float) -> Optional[str]:
    """Which part of the upright flask a local point (grip at 0, 0; y down) falls in."""
    if x * x + y * y <= 4.6 * 4.6:
        return "body"
    if -1.5 <= x <= 1.5 and -8.4 <= y <= -3.6:
        return "neck"
    if -2.5 <= x <= 2.5 and -9.3 <= y <= -8.4:
        return "lip"
    if -1.4 <= x <= 1.4 and -11.8 <= y <= -9.3:
        return "cork"
    return None


def flask(tilt_degrees: float, fill: float) -> Sprite:
    """The flask tipped ``tilt_degrees`` (negative: neck towards the upper left) and ``fill`` full (0..1)."""
    sprite = Sprite(*POTION)
    t = math.radians(tilt_degrees)
    ct, st = math.cos(t), math.sin(t)
    parts = {}
    for py in range(POTION[1]):
        for px in range(POTION[0]):
            wx, wy = px + 0.5 - GRIP[0], py + 0.5 - GRIP[1]
            # Undo the tilt to ask the upright bottle what is here.
            part = _bottle_parts(wx * ct + wy * st, -wx * st + wy * ct)
            if part:
                parts[(px, py)] = part
    hollow = sorted((p for p, part in parts.items() if part in ("body", "neck")), key=lambda p: (-p[1], p[0]))
    liquid = set(hollow[: round(len(hollow) * fill)]) if fill > 0 else set()
    for (px, py), part in parts.items():
        nx, ny = (px + 0.5 - GRIP[0]) / 4.6, (py + 0.5 - GRIP[1]) / 4.6
        lit = -(nx * 0.6 + ny * 0.75)
        if part == "cork":
            sprite.set(px, py, WOOD.light if lit > 0.6 else WOOD.mid)
        elif (px, py) in liquid:
            sprite.set(
                px,
                py,
                PINK.pale if lit > 0.75 else PINK.light if lit > 0.25 else PINK.mid if lit > -0.35 else PINK.dark,
            )
        else:
            sprite.set(px, py, GLASS.light if lit > 0.6 else GLASS.mid if lit > -0.1 else GLASS.dark)
    if liquid:
        # The surface catches the light: the top row of the liquid is one step lighter.
        for px, py in liquid:
            if (px, py - 1) not in liquid and parts.get((px, py - 1)) in ("body", "neck"):
                sprite.set(px, py, PINK.light if sprite.get(px, py) in (PINK.mid, PINK.dark) else PINK.pale)
    # The window highlight sits on the lit side whatever the tilt: it is the room's light, not the bottle's.
    for px, py in ((GRIP[0] - 3, GRIP[1] - 2), (GRIP[0] - 3, GRIP[1] - 1), (GRIP[0] - 2, GRIP[1] - 3)):
        if parts.get((px, py)) == "body":
            sprite.set(px, py, WHITE)
    return sprite.outlined(INK, corners=False)


def _appear(step: int) -> Sprite:
    """Into the hand: a sparkle, a white pop of the flask's shape, the flask."""
    if step == 0:
        sprite = Sprite(*POTION)
        sprite.blit(motifs.twinkle(3, PINK, diagonals=True), GRIP[0] - 3, GRIP[1] - 3)
        return sprite
    full = flask(0, 1.0)
    return full.recolor({c: WHITE for c in full.colors() if c != INK}) if step == 1 else full


#: (tilt, fill) per drink frame: tip to the lips, pour, chug, last drops, empty. Never past the
#: horizontal by much, so it reads as drinking whether the pose holds the flask at the chin or overhead.
_DRINK = ((-20, 1.0), (-50, 0.85), (-80, 0.6), (-100, 0.35), (-110, 0.12), (-110, 0.0))


def _pop(step: int) -> Sprite:
    """The empty flask vanishes in a puff of pink and a heart: understanding, absorbed."""
    sprite = Sprite(*POTION)
    if step == 0:
        empty = flask(-110, 0.0)
        return empty.recolor({c: WHITE for c in empty.colors() if c != INK})
    if step == 1:
        motifs.banded_burst(sprite, GRIP[0], GRIP[1], 8, 9, 4, [PINK.light, PINK.pale, WHITE], phase=22.5)
        return sprite
    gx, gy = GRIP
    clouds = {
        2: ((gx - 3.0, gy - 1.0, 3.2), (gx + 3.0, gy - 1.0, 3.0), (gx, gy - 4.0, 3.4)),
        3: ((gx - 4.5, gy - 2.0, 2.6), (gx + 4.5, gy - 2.0, 2.4), (gx, gy - 6.0, 2.8)),
        4: ((gx - 5.0, gy - 3.0, 1.4), (gx + 5.0, gy - 3.0, 1.2), (gx, gy - 7.5, 1.6)),
    }[step]
    motifs.clumps(sprite, clouds, (PINK.mid, PINK.light, PINK.pale, WHITE), gx, gy - 4.0)
    if step >= 3:
        heart = HEART_PIXELS if step == 3 else HEART_PIXELS_SMALL
        sprite.stamp(heart, {"x": PINK.light, "X": PINK.pale, "o": INK}, gx - 3, gy - 2 - (step - 3) * 3)
    return sprite


HEART_PIXELS = [".oo.oo.", "oXxoxxo", "oxxxxxo", ".oxxxo.", "..oxo..", "...o..."]
HEART_PIXELS_SMALL = [".......", ".oo.oo.", "oxxoxxo", ".oxxxo.", "..oxo..", "...o..."]


def potion_strip() -> Strip:
    return Strip(
        frame=POTION,
        origin=GRIP,
        animations=[
            *with_calm(Animation("appear", 30, False, [_appear(i) for i in range(3)]), flashes=[1]),
            Animation("hold", 8, True, [flask(0, 1.0), flask(-4, 1.0)]),
            Animation("drink", 20, False, [flask(tilt, fill) for tilt, fill in _DRINK]),
            *with_calm(Animation("pop", 20, False, [_pop(i) for i in range(5)]), flashes=[0]),
        ],
    )


# ── The glint: the moment it clicks ────────────────────────────────────────

#: Odd-sized so the sparkle sits on a centre pixel; the peak sparkle is 15 px.
GLINT = (17, 17)


def _glint(step: int) -> Sprite:
    """The glint at the face: a sparkle that blooms with diagonal rays and closes again."""
    sprite = Sprite(*GLINT)
    radius = (1, 3, 5, 7, 4, 2)[step]
    sparkle = motifs.twinkle(radius, PINK, diagonals=step in (2, 3))
    sprite.blit(sparkle, 8 - radius, 8 - radius)
    if step == 3:
        for dx, dy in ((2, 2), (2, -2), (-2, 2), (-2, -2)):
            sprite.set(8 + dx, 8 + dy, PINK.light)
    return sprite


def glint_strip() -> Strip:
    return Strip(
        frame=GLINT, origin=(8, 8), animations=[Animation("twinkle", 20, False, [_glint(i) for i in range(6)])]
    )


# ── Calm: what floats over a customer under the elixir ─────────────────────

CALM = (16, 16)

_CALM_HEART = [".xx.xx.", "xHxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."]
_CALM_HEART_BIG = [
    ".xx...xx.",
    "xHHx.xxxx",
    "xHxxxxxxx",
    "xxxxxxxxx",
    ".xxxxxxx.",
    "..xxxxx..",
    "...xxx...",
    "....x....",
]


def _calm_heart(frame: int) -> Sprite:
    """A pink heart over a calmed customer's head: a slow bob and one soft beat per loop."""
    sprite = Sprite(*CALM)
    big = frame == 2
    rows = _CALM_HEART_BIG if big else _CALM_HEART
    bob = (0, -1, -1, 0)[frame]
    left = 8 - len(rows[0]) // 2
    top = 8 - len(rows) // 2 + bob
    sprite.stamp(rows, {"x": PINK.mid, "H": PINK.pale}, left, top)
    for x, y, color in list(sprite.pixels()):
        if color == PINK.mid and sprite.get(x + 1, y + 1) is None and sprite.get(x, y + 1) is None:
            sprite.set(x, y, PINK.dark)
    return sprite.outlined(INK, corners=False)


def _calm_wave(frame: int) -> Sprite:
    """A soft tilde breathed out where an angry customer would steam: the calm version of their steam."""
    sprite = Sprite(*CALM)
    for x in range(3, 13):
        y = 8 + round(1.6 * math.sin((x - 3) / 10 * 2 * math.pi + frame * math.pi / 2))
        sprite.set(x, y, PINK.light if 5 <= x <= 10 else PINK.mid)
    return sprite


def _calm_sparkle(step: int) -> Sprite:
    """A sparkle drifting up off a calm customer: blooms and closes."""
    sprite = Sprite(*CALM)
    radius = (1, 2, 3, 2, 1)[step]
    sprite.blit(motifs.twinkle(radius, PINK, diagonals=step == 2), 8 - radius, 8 - radius)
    return sprite


def calm_strip() -> Strip:
    return Strip(
        frame=CALM,
        origin=(8, 8),
        animations=[
            Animation("heart", 6, True, [_calm_heart(i) for i in range(4)]),
            Animation("wave", 8, True, [_calm_wave(i) for i in range(4)]),
            Animation("sparkle", 15, False, [_calm_sparkle(i) for i in range(5)]),
        ],
    )


def build() -> Dict[str, Strip]:
    return {
        "icon": emblem.icon_strip(_icon_subject, PINK, _icon_glint),
        "fx-potion": potion_strip(),
        "fx-glint": glint_strip(),
        "fx-calm": calm_strip(),
    }
