"""CHURN SHIELD: a retention bubble that no hit gets through; customers who bump it calm down.

A soap-bubble shell whose iridescent rim slides teal, lavender and pink,
holding a heart: the relationship it protects. Teal leads its palette.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional

from pixkit.canvas import Sprite, arc, disc, edge_of, ellipse, outline_of
from pixkit.palette import HEART, INK, LAVENDER, PINK, TEAL, WHITE
from pixkit.sheet import Animation, Strip, with_calm

from . import emblem, motifs

HEART_KEY = {"x": HEART.mid, "X": HEART.dark, "h": HEART.light, "H": HEART.pale}

HEART_SMALL = [
    ".hh...xx.",
    "hHhx.xxxx",
    "hhxxxxxxx",
    "xxxxxxxxX",
    ".xxxxxxX.",
    "..xxxxX..",
    "...xXX...",
    "....X....",
]
HEART_BEAT = [
    ".hhh...xxx.",
    "hHHhx.xxxxx",
    "hHhxxxxxxxx",
    "hxxxxxxxxxX",
    "xxxxxxxxxxX",
    ".xxxxxxxxX.",
    "..xxxxxxX..",
    "...xxxxX...",
    "....xXX....",
    ".....X.....",
]

#: The rim's soap-film colours, walked around the circumference.
FILM = (TEAL.pale, TEAL.light, LAVENDER.light, PINK.light, LAVENDER.light, TEAL.light)


def _film(angle_degrees: float, phase: float) -> str:
    """The soap film's colour at an angle around the rim, turned by ``phase`` (0..1)."""
    turn = ((angle_degrees + 180.0) / 360.0 + phase) % 1.0
    return FILM[int(turn * len(FILM)) % len(FILM)]


def bubble_icon(frame: int) -> Sprite:
    """The icon's bubble: an iridescent film round a heart, with a window reflection."""
    subject = Sprite(emblem.SIZE, emblem.SIZE)
    cx = cy = 11.5
    shell = disc(cx, cy, 10.5)
    inner = disc(cx, cy, 8.9)
    phase = frame / emblem.IDLE_FRAMES
    for x, y in shell - inner:
        subject.set(x, y, _film(math.degrees(math.atan2(y + 0.5 - cy, x + 0.5 - cx)), phase))
    # The far side of the film, seen through the bubble, is a darker band along the lower right.
    for x, y in edge_of(inner):
        angle = math.degrees(math.atan2(y + 0.5 - cy, x + 0.5 - cx))
        if -10 < angle < 140:
            subject.set(x, y, TEAL.mid if angle > 80 else LAVENDER.mid)
    heart: List[str] = HEART_BEAT if frame in (8, 9) else HEART_SMALL
    left = round(cx - len(heart[0]) / 2)
    top = round(cy - len(heart) / 2) + 1
    subject.stamp(heart, HEART_KEY, left, top)
    # The window reflection on the lit side, and a rim glint opposite it.
    subject.fill(arc(cx, cy, 7.0, 7.0, 195, 250), WHITE)
    subject.set(6, 7, WHITE)
    subject.set(16, 17, WHITE)
    subject.set(17, 16, WHITE)
    return subject.outlined(INK, corners=False)


# ── The bubble around the hero ─────────────────────────────────────────────
#
# Only the film is drawn: a rim, a band of the far side seen through it, the
# window reflection and a few motes. The inside stays empty, so the hero is
# never hidden behind it.
#
# It is an upright capsule, 48 x 62, not a 62 px ball: the game's bump test is
# a 20 px circle around the hero's 12 px body box, so a customer's centre is
# 26 px out when it bumps. At this width the customer meets the film right
# then; a round bubble would let them walk half way in first.

#: Room for the bubble, its wobble and the pop's flying film.
SHELL = (88, 88)
_C = 43.5
RX, RY = 24.0, 31.0


def shell(rx: float, ry: float, phase: float, rim: Optional[str] = None, motes: int = -1) -> Sprite:
    """The bubble at half-sizes (rx, ry).

    ``phase`` (0..1) turns the soap-film colours around the rim; ``rim`` paints
    the whole film one colour instead (the white flashes); ``motes`` is the
    frame of the motes' twinkle cycle, or -1 for none.
    """
    sprite = Sprite(*SHELL)
    outer = ellipse(_C, _C, rx, ry)
    inner = ellipse(_C, _C, rx - 2.0, ry - 2.0)
    for x, y in outer - inner:
        angle = math.degrees(math.atan2((y + 0.5 - _C) / ry, (x + 0.5 - _C) / rx))
        sprite.set(x, y, rim or _film(angle, phase))
    # A dark film edge all the way round (darkest on the shadow side) so the bubble reads on the pale Luna sky.
    if rim is None:
        for x, y in outline_of(outer, corners=False):
            angle = math.degrees(math.atan2((y + 0.5 - _C) / ry, (x + 0.5 - _C) / rx))
            sprite.set(x, y, TEAL.deep if -40 < angle < 170 else TEAL.dark)
    if rim is None:
        # The far side of the film, seen through the bubble along the lower right.
        for x, y in edge_of(inner):
            angle = math.degrees(math.atan2((y + 0.5 - _C) / ry, (x + 0.5 - _C) / rx))
            if 10 < angle < 120 and (x + y) % 2 == 0:
                sprite.set(x, y, LAVENDER.mid if angle < 60 else TEAL.mid)
        # The window reflection, big on the lit side, and a rim glint opposite.
        sprite.fill(arc(_C, _C, rx - 4.5, ry - 4.5, 200, 245), WHITE)
        sprite.fill(arc(_C, _C, rx - 6.0, ry - 6.0, 212, 232), TEAL.pale)
        glint = (round(_C + (rx - 5) * math.cos(math.radians(255))), round(_C + (ry - 5) * math.sin(math.radians(255))))
        sprite.set(*glint, WHITE)
        sprite.fill(arc(_C, _C, rx - 3.5, ry - 3.5, 35, 50), WHITE)
    if motes >= 0:
        # Three motes drift in the film and twinkle in turn: the bubble is alive without hiding the hero.
        for k, (mx, my) in enumerate(((30, 54), (55, 32), (48, 60))):
            if (motes + k * 3) % 8 < 2:
                sprite.blit(motifs.twinkle(1, TEAL), mx - 1, my - 1)
            elif (motes + k * 3) % 8 < 4:
                sprite.set(mx, my, TEAL.light)
    return sprite


def _form(step: int) -> Sprite:
    """Blown up from the hero's chest: a white ring that swells past its size and settles (overshoot)."""
    scale = (0.22, 0.52, 0.87, 1.1, 0.97, 1.0)[step]
    rx, ry = RX * scale, RY * scale
    if step < 3:
        sprite = shell(rx, ry, 0.0, rim=WHITE if step < 2 else TEAL.pale)
        if step == 0:
            sprite.fill(motifs.starburst(_C, _C, 4, 9, 3, phase=45), WHITE)
        return sprite
    return shell(rx, ry, step / 8, rim=TEAL.pale if step == 3 else None)


def _hold(frame: int) -> Sprite:
    """The bubble holding: its film's colours turn a step a frame and its motes twinkle."""
    return shell(RX, RY, frame / 8, motes=frame)


#: The warning wobble for the last moments: squash, rest, stretch, rest.
_WOBBLE = ((RX + 2, RY - 2), (RX, RY), (RX - 2, RY + 2), (RX, RY))


def _pop(step: int) -> Sprite:
    """The end: a white flash, the film tears into arcs, beads off, and two hearts float up."""
    sprite = Sprite(*SHELL)
    if step == 0:
        return shell(RX + 1, RY + 1, 0.0, rim=WHITE)
    # The film tears into arcs that fly out, then beads into droplets, then a few hearts float up.
    grow = (0, 1.06, 1.16, 1.26, 1.33, 1.36, 1.36)[step]
    rx, ry = RX * grow, RY * grow
    if step <= 2:
        for k in range(8):
            start = k * 45 + 8
            span = 26 if step == 1 else 14
            tone = _film(start - 180, 0.1 * step) if step == 1 else TEAL.light
            sprite.fill(arc(_C, _C, rx, ry, start, start + span), tone)
            sprite.fill(arc(_C, _C, rx - 1, ry - 1, start + 2, start + span - 2), WHITE if step == 1 else TEAL.pale)
    elif step <= 4:
        for k in range(8):
            a = math.radians(k * 45 + 20)
            x, y = _C + math.cos(a) * rx, _C + math.sin(a) * ry
            sprite.fill(disc(x, y, 1.6 if step == 3 else 1.0), TEAL.light if step == 3 else TEAL.mid)
            if step == 3:
                sprite.set(int(x), int(y), WHITE)
    for k, (hx, hy) in enumerate(((36, 38), (50, 34))):
        if step >= 3:
            rise = (step - 3) * 3
            rows = HEART_SMALL if step < 6 else ["..x..", ".xxx.", "..x.."]
            sprite.stamp(rows, HEART_KEY, hx - len(rows[0]) // 2, hy - rise - len(rows) // 2)
    return sprite.outlined(INK, corners=False) if step >= 3 else sprite


def shell_strip() -> Strip:
    return Strip(
        frame=SHELL,
        origin=(44, 44),
        animations=[
            Animation("form", 30, False, [_form(i) for i in range(6)]),
            Animation("hold", 12, True, [_hold(i) for i in range(8)]),
            Animation("wobble", 15, True, [shell(rx, ry, i / 8, motes=i) for i, (rx, ry) in enumerate(_WOBBLE)]),
            *with_calm(Animation("pop", 30, False, [_pop(i) for i in range(7)]), flashes=[0]),
        ],
    )


# ── A customer bumping it ───────────────────────────────────────────────────
#
# Drawn for a bump on the bubble's right side (the game flips it for the
# left), with the origin on the rim where the customer touched.

BUMP = (32, 48)
_BUMP_AT = (6, 28)


#: How curved the capsule's flank is where customers meet it (its radius of curvature at the side).
_FLANK = RY * RY / RX


def _bump(step: int) -> Sprite:
    """A bump on the film's right flank: it dents white, rings ripple out, and a heart pops off."""
    sprite = Sprite(*BUMP)
    bx, by = _BUMP_AT
    # The film near the contact, as an arc of a circle as curved as the capsule's flank.
    cx = bx - _FLANK
    if step == 0:
        # The film dents in and flashes white where it was hit.
        sprite.fill(arc(cx - 2, by + 0.5, _FLANK, _FLANK, -14, 14), WHITE)
        sprite.fill(arc(cx - 3, by + 0.5, _FLANK, _FLANK, -8, 8), TEAL.pale)
        return sprite
    for k, (offset, tone) in enumerate(((3, WHITE), (7, TEAL.light), (11, TEAL.mid))):
        reach = offset + (step - 1) * 3
        if k >= step or reach > 24:
            continue
        span = 17 - k * 2
        sprite.fill(arc(cx, by + 0.5, _FLANK + reach, _FLANK + reach, -span, span), tone)
    if step >= 1:
        rows = HEART_BEAT if step == 1 else HEART_SMALL
        hx, hy = bx + 9 + step, by - 6 - step * 3
        heart = Sprite(*BUMP)
        heart.stamp(rows, HEART_KEY, hx - len(rows[0]) // 2, hy - len(rows) // 2)
        sprite.blit(heart.outlined(INK, corners=False) if step < 5 else heart)
    return sprite


def bump_strip() -> Strip:
    return Strip(frame=BUMP, origin=_BUMP_AT, animations=[Animation("bump", 30, False, [_bump(i) for i in range(6)])])


def build() -> Dict[str, Strip]:
    return {
        "icon": emblem.icon_strip(bubble_icon, TEAL),
        "fx-shield": shell_strip(),
        "fx-shield-bump": bump_strip(),
    }
