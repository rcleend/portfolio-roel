"""AGENT SUMMON: an AI sidekick drone that orbits the hero and fires at the nearest customer.

The drone is one design at one size, shared by the icon and the game: a white
helper bot with a black visor, two cyan eyes and a top rotor, drawn facing
right (the game flips it). Its cyan is the cyan of every "agent" light.
"""

from __future__ import annotations

import math
from typing import Dict, List, Tuple

from pixkit.canvas import Sprite, disc, ellipse, ring
from pixkit.palette import CYAN, GOLD, INK, SHELL, WHITE
from pixkit.sheet import Animation, Strip, with_calm

from . import emblem, motifs

VISOR = "#18163a"

DRONE_KEY = {
    "o": INK,
    "W": SHELL.pale,
    "w": SHELL.light,
    "m": SHELL.mid,
    "d": SHELL.dark,
    "D": SHELL.deep,
    "v": VISOR,
    "V": CYAN.deep,
    "c": CYAN.light,
    "C": CYAN.pale,
    "t": CYAN.mid,
    "T": CYAN.pale,
    "g": GOLD.light,
    "G": GOLD.pale,
}

#: 22 x 15: the shell from the mast down to the nozzle, eyes open.
BODY = [
    ".........owmo.........",
    ".......ooowmooo.......",
    ".....oowwWWwwwmoo.....",
    "....owWWWwwwwwwwmo....",
    "...owWWwwwwwwwwmmmo...",
    "...owWwwVVVVvvvvvdo...",
    "...owwwvvvCcvvCcvvo...",
    "...owwwvvvccvvccvvo...",
    "...omwwwvvvvvvvvvdo...",
    "....ommmmmmmmmmddo....",
    ".....odmmmmmmdddo.....",
    "......oodddddDoo......",
    "........oddddo........",
]
#: The eye rows (6 and 7 of BODY) for a blink.
EYES_SHUT = ["...owwwvvvvvvvvvvvo...", "...owwwvvvccvvccvvo..."]

#: 22 x 3 rotor states: the blade seen edge-on, long then short, so alternating them reads as a spin.
ROTOR = [
    [
        "..oooooooooooooooooo..",
        ".owwWWwwwwGgwwwwmmmmo.",
        "..oooooooowmoooooooo..",
    ],
    [
        ".....oooooooooooo.....",
        "....owWWwwGgwwwmmo....",
        ".....ooooowmooooo.....",
    ],
]
#: 22 x 2 thruster flame states.
FLAME = [
    [".........cTTc.........", "..........tt.........."],
    [".........tccT.........", "..........t..........."],
]


def drone(rotor: int = 0, flame: int = 0, blink: bool = False) -> Sprite:
    """The drone in a 22 x 18 box: rotor on rows 0-2, shell on rows 3-15, flame on rows 16-17."""
    rows: List[str] = list(ROTOR[rotor % len(ROTOR)]) + list(BODY) + list(FLAME[flame % len(FLAME)])
    if blink:
        rows[3 + 6], rows[3 + 7] = EYES_SHUT
    return Sprite.from_rows(rows, DRONE_KEY)


def _icon_subject(frame: int) -> Sprite:
    """The icon's drone: the in-game sprite itself, hovering, rotor turning."""
    subject = Sprite(emblem.SIZE, emblem.SIZE)
    # A slow hover: up a pixel for half the loop.
    bob = -1 if 4 <= frame < 12 else 0
    subject.blit(drone(rotor=frame, flame=frame // 2, blink=frame == 7), 1, 3 + bob)
    return subject


# ── The drone in play ───────────────────────────────────────────────────────
#
# One 32 x 32 frame, origin on the drone's centre: that is the point the
# skill's orbit moves and the point its shots leave from.

FRAME = (32, 32)
#: Where the 22 x 18 drone box sits in the frame so its shell's centre lands on the origin.
_AT = (5, 6)
_C = 15.5


def _placed(sprite: Sprite, dx: int = 0, dy: int = 0) -> Sprite:
    frame = Sprite(*FRAME)
    frame.blit(sprite, _AT[0] + dx, _AT[1] + dy)
    return frame


def _silhouette(sprite: Sprite, color: str) -> Sprite:
    return sprite.recolor({c: color for c in sprite.colors()})


def _squashed(sprite: Sprite, sx: float, sy: float) -> Sprite:
    """Nearest-neighbour squash and stretch about the drone's centre, for single in-between frames."""
    out = Sprite(sprite.width, sprite.height)
    cx, cy = sprite.width / 2, sprite.height / 2 + 1
    for y in range(out.height):
        for x in range(out.width):
            src = sprite.get(int((x + 0.5 - cx) / sx + cx), int((y + 0.5 - cy) / sy + cy))
            if src is not None:
                out.set(x, y, src)
    return out


def _pillar(width: float, height: int, bright: bool) -> Sprite:
    """The summoning light: a vertical column with a white core, stepped (never blurred) at the edges."""
    frame = Sprite(*FRAME)
    for y in range(int(_C - height / 2), int(_C + height / 2) + 1):
        for x in range(FRAME[0]):
            d = abs(x - _C)  # from the column's centre line, between pixels 15 and 16
            if d <= width * 0.35:
                frame.set(x, y, WHITE if bright else CYAN.pale)
            elif d <= width * 0.7:
                frame.set(x, y, CYAN.light)
            elif d <= width:
                frame.set(x, y, CYAN.mid if (x + y) % 2 == 0 else None)
    return frame


def _summon(step: int) -> Sprite:
    """Arrival: a column of light, the drone printing in line by line, a white flash, a squash and a stretch."""
    body = drone()
    if step == 0:
        return _pillar(1.5, 26, True)
    if step == 1:
        return _pillar(4.5, 28, True)
    if step in (2, 3):
        # The drone prints in from the top, scanline by scanline, inside the column.
        frame = _pillar(6.0 if step == 2 else 5.0, 28, False)
        rows = 7 if step == 2 else 13
        ghost = _silhouette(body, CYAN.pale)
        for y in range(rows, ghost.height):
            for x in range(ghost.width):
                ghost.set(x, y, None)
        for y in range(0, rows, 2):
            for x in range(ghost.width):
                if ghost.get(x, y) is not None:
                    ghost.set(x, y, WHITE)
        frame.blit(ghost, *_AT)
        return frame
    if step == 4:
        return _placed(_silhouette(body, WHITE))
    if step == 5:
        return _placed(_squashed(body, 1.18, 0.8), 0, 2)
    if step == 6:
        return _placed(_squashed(body, 0.92, 1.1), 0, -1)
    return _placed(body)


#: The hover bob, one offset per frame of the 12-frame, one-second loop.
_BOB = (0, 0, -1, -1, -1, -1, 0, 0, 1, 1, 1, 1)


def _hover(frame: int) -> Sprite:
    """The orbiting drone: rotor spinning, a one-pixel bob, a blink once a second."""
    return _placed(drone(rotor=frame, flame=frame // 2, blink=frame == 9), 0, _BOB[frame])


def _expiring(frame: int) -> Sprite:
    """The last second: battery low. Eyes blink amber and the thruster sputters, so the end never surprises."""
    body = drone(rotor=frame, flame=frame // 2)
    if frame % 2 == 0:
        body = body.recolor({CYAN.light: GOLD.light, CYAN.pale: GOLD.pale})
    else:
        body = body.recolor({CYAN.light: GOLD.dark, CYAN.pale: GOLD.mid})
    if frame in (1, 3):
        body = body.recolor({CYAN.mid: None})
    return _placed(body, 0, (0, 1, 0, 1)[frame])


#: The muzzle flash's point at the front of the visor, per ``fire`` frame (frame pixels, facing right).
MUZZLE = ((22, 16), (21, 16), (21, 16), (22, 16))


def _fire(step: int) -> Sprite:
    """One shot: the eyes flare as it locks on, it kicks back a pixel behind a cyan muzzle flash, it settles."""
    body = drone(rotor=step, flame=step)
    if step == 0:
        # Eyes flare white: the agent has picked its target.
        body = body.recolor({CYAN.light: WHITE})
        return _placed(body)
    recoil = -1 if step in (1, 2) else 0
    frame = _placed(body, recoil, 0)
    if step in (1, 2):
        mx, my = MUZZLE[step]
        flash = Sprite(*FRAME)
        if step == 1:
            motifs.banded_burst(flash, mx + 2.5, my + 0.5, 4, 5.5, 2.4, [CYAN.light, CYAN.pale, WHITE])
        else:
            flash.fill(disc(mx + 2.0, my + 0.5, 2.0), CYAN.pale)
            flash.set(mx + 2, my, WHITE)
        frame.blit(flash)
    return frame


def _dismiss(step: int) -> Sprite:
    """Departure, the summon backwards: white, squeezed to a column, a line, a sparkle, then nothing."""
    body = drone()
    if step == 0:
        return _placed(_silhouette(body, WHITE))
    if step == 1:
        return _placed(_silhouette(_squashed(body, 0.45, 1.15), CYAN.pale))
    if step == 2:
        frame = _pillar(1.6, 24, True)
        return frame
    frame = Sprite(*FRAME)
    if step == 3:
        frame.fill(disc(_C + 0.5, _C + 0.5, 1.6), WHITE)
        for angle in (-90, 0, 90, 180):
            a = math.radians(angle)
            motifs.shard(frame, _C + 0.5 + math.cos(a) * 3, _C + 0.5 + math.sin(a) * 3, angle, 3, CYAN.light, CYAN.pale)
    else:
        spread = (0, 0, 0, 0, 6, 9, 11)[step]
        for angle in (-120, -40, 40, 140, 210):
            a = math.radians(angle)
            x, y = int(_C + 0.5 + math.cos(a) * spread), int(_C + 0.5 + math.sin(a) * spread - (step - 3))
            if step == 4:
                frame.blit(motifs.twinkle(1, CYAN), x - 1, y - 1)
            elif step == 5 or angle in (-120, 40, 210):
                frame.set(x, y, CYAN.pale if step == 5 else CYAN.mid)
    return frame


def drone_strip() -> Strip:
    return Strip(
        frame=FRAME,
        origin=(16, 16),
        animations=[
            *with_calm(Animation("summon", 20, False, [_summon(i) for i in range(8)]), flashes=[4]),
            Animation("hover", 12, True, [_hover(i) for i in range(12)]),
            Animation("expiring", 12, True, [_expiring(i) for i in range(4)]),
            Animation("fire", 24, False, [_fire(i) for i in range(4)], anchors={"muzzle": MUZZLE}),
            *with_calm(Animation("dismiss", 20, False, [_dismiss(i) for i in range(7)]), flashes=[0]),
        ],
    )


# ── Its shots and what they do to a customer ───────────────────────────────

SHOT = (13, 13)
#: The orb's centre pixel: an odd frame keeps the spikes symmetric.
_SC = 6.0


def _shot(frame: int) -> Sprite:
    """A cyan plasma bolt that reads at any flight angle: round core, spikes alternating plus and cross."""
    sprite = Sprite(*SHOT)
    rays = (0, 90, 180, 270) if frame % 2 == 0 else (45, 135, 225, 315)
    length = 5.6 if frame in (0, 3) else 4.6
    for angle in rays:
        motifs.shard(sprite, _SC + 0.5, _SC + 0.5, angle, length, CYAN.mid, CYAN.light)
    sprite.fill(disc(_SC + 0.5, _SC + 0.5, 3.0), CYAN.light)
    sprite.fill(disc(_SC + 0.5, _SC + 0.5, 2.0), CYAN.pale)
    sprite.set(6, 6, WHITE)
    sprite.set(5, 6, WHITE)
    sprite.set(6, 5, WHITE)
    return sprite


def _trail(step: int) -> Sprite:
    """Afterimages the game drops behind a shot, newest first."""
    sprite = Sprite(*SHOT)
    radius = (2.0, 1.4, 0.8)[step]
    sprite.fill(disc(_SC + 0.5, _SC + 0.5, radius), (CYAN.light, CYAN.mid, CYAN.dark)[step])
    if step == 0:
        sprite.set(6, 6, CYAN.pale)
    return sprite


def shot_strip() -> Strip:
    return Strip(
        frame=SHOT,
        origin=(6, 6),
        animations=[
            Animation("fly", 20, True, [_shot(i) for i in range(4)]),
            Animation("trail", 20, False, [_trail(i) for i in range(3)]),
        ],
    )


ZAP = (32, 32)


def _bolt(
    sprite: Sprite, c: float, angle: float, start: float, length: float, kink: int, tones: Tuple[str, str]
) -> None:
    """A jagged arc of static: out along ``angle``, one sideways kink half way, out again."""
    a = math.radians(angle)
    side = math.radians(angle + 90 * kink)
    half = length / 2
    x0, y0 = c + math.cos(a) * start, c + math.sin(a) * start
    x1 = x0 + math.cos(a) * half + math.cos(side) * 1.5
    y1 = y0 + math.sin(a) * half + math.sin(side) * 1.5
    x2, y2 = x1 + math.cos(a) * half, y1 + math.sin(a) * half
    sprite.line(int(x0), int(y0), int(x1), int(y1), tones[0])
    sprite.line(int(x1), int(y1), int(x2), int(y2), tones[1])


_ZAP_ANGLES = (-80, -20, 35, 100, 160, 215)


def _zap(step: int) -> Sprite:
    """A drone shot landing: a white pop, a crackle of jagged static, then fading sparks."""
    sprite = Sprite(*ZAP)
    c = _C
    if step == 0:
        sprite.fill(motifs.starburst(c, c, 4, 9, 3.5, phase=45), WHITE)
        sprite.fill(disc(c, c, 3.5), WHITE)
        return sprite
    if step in (1, 2):
        for i, angle in enumerate(_ZAP_ANGLES):
            start = 2.0 if step == 1 else 6.0
            length = 7.0 if step == 1 else 6.0
            tones = (WHITE, CYAN.pale) if step == 1 else (CYAN.pale, CYAN.light)
            _bolt(sprite, c, angle + step * 12, start, length, 1 if i % 2 else -1, tones)
        sprite.fill(disc(c, c, 3.0 if step == 1 else 1.8), WHITE if step == 1 else CYAN.pale)
        return sprite
    for i, angle in enumerate(_ZAP_ANGLES):
        if step == 5 and i % 2:
            continue
        a = math.radians(angle + 30)
        r = 9 + step
        x, y = int(c + math.cos(a) * r), int(c + math.sin(a) * r)
        if step == 3:
            sprite.blit(motifs.twinkle(1, CYAN), x - 1, y - 1)
        else:
            sprite.set(x, y, CYAN.light if step == 4 else CYAN.mid)
    return sprite


def zap_strip() -> Strip:
    return Strip(
        frame=ZAP,
        origin=(16, 16),
        animations=with_calm(Animation("hit", 30, False, [_zap(i) for i in range(6)]), flashes=[0]),
    )


# ── The summoning circle under the drone as it prints in ───────────────────

CIRCLE = (48, 16)


def _circle(step: int) -> Sprite:
    """A flat ellipse of light ringed with runes, opening, turning and closing beneath the summon."""
    sprite = Sprite(*CIRCLE)
    cx, cy = 23.5, 7.5
    scale = (0.35, 0.75, 1.0, 1.0, 1.0, 0.7, 0.35)[step]
    rx, ry = 21 * scale, 6 * scale
    sprite.fill(ring(cx, cy, rx, ry, 1), CYAN.light if step < 5 else CYAN.mid)
    if scale >= 0.75:
        sprite.fill(ring(cx, cy, rx - 4, ry - 1.5, 1), CYAN.mid)
        # Runes: tick marks around the band, walking a notch per frame so the circle turns.
        for i in range(10):
            angle = math.radians(i * 36 + step * 9)
            x = int(cx + math.cos(angle) * (rx - 2))
            y = int(cy + math.sin(angle) * (ry - 0.7))
            sprite.set(x, y, WHITE if i % 3 == 0 else CYAN.pale)
    if step in (2, 3):
        sprite.fill(ellipse(cx, cy, 3.0, 1.2), WHITE)
    return sprite


def circle_strip() -> Strip:
    return Strip(
        frame=CIRCLE, origin=(24, 8), animations=[Animation("open", 20, False, [_circle(i) for i in range(7)])]
    )


def build() -> Dict[str, Strip]:
    return {
        "icon": emblem.icon_strip(_icon_subject, CYAN),
        "fx-drone": drone_strip(),
        "fx-drone-shot": shot_strip(),
        "fx-drone-zap": zap_strip(),
        "fx-summon-circle": circle_strip(),
    }
