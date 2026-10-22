"""POWER CHORD: one mighty strum on the white Strat, a screen-wide shockwave that stuns every customer.

The guitar is the Olympic White Stratocaster from the attic room: cream
double-cutaway body, mint pickguard with three white single coils, rosewood
board on a maple neck, six-in-line headstock. Lavender is the colour of its
sound: the shockwave, the strum flash's rim and the glow behind the icon.
"""

from __future__ import annotations

import math
from typing import Dict, Sequence

from pixkit.canvas import Sprite, arc, disc, polygon, ring
from pixkit.palette import (
    CHROME,
    CYAN,
    GOLD,
    INK,
    LAVENDER,
    MAPLE,
    PINK,
    ROSEWOOD,
    STRAT_BODY,
    STRAT_GUARD,
    WHITE,
    Ramp,
)
from pixkit.sheet import Animation, Strip, with_calm

from . import emblem, motifs

STRAT_KEY = {
    "o": INK,
    "W": WHITE,
    "B": STRAT_BODY.pale,
    "b": STRAT_BODY.light,
    "m": STRAT_BODY.mid,
    "d": STRAT_BODY.dark,
    "G": STRAT_GUARD[2],
    "g": STRAT_GUARD[1],
    "q": STRAT_GUARD[0],
    "r": ROSEWOOD[0],
    "R": ROSEWOOD[1],
    "n": MAPLE[2],
    "N": MAPLE[1],
    "c": CHROME.light,
}

#: The icon's Strat at 45 degrees, headstock top-right: tuners on the bass edge, two inlays,
#: three single coils across the strings, a chrome bridge and two knobs on the lower bout.
#: The strings run down the anti-diagonal x + y = 24.5 from the nut to the bridge.
STRAT = [
    "....................oo..",
    "...................ocno.",
    "...................ocnNo",
    "..................ocnNNo",
    "..................onNNNo",
    ".................onRNNo.",
    "................onRRro..",
    "..........oo...onRRro...",
    ".........oBBo.onRBro....",
    "........oBBBoonRRro.....",
    ".......oBqqBonRRro......",
    "......oBqGGqnRBro.......",
    ".....ooqGWGnRRro........",
    "...oobqGGGWGRroo........",
    "..obbbqWGGGWgqbbo.......",
    ".obbbqGgWggggqbbo.......",
    ".obbbqWggWgggqbbo.......",
    ".obbbggWggggqmmo........",
    ".obbcgggWggBmmo.........",
    ".ommmcggggqmoo..........",
    ".ommmmcqgBmmo...........",
    "..ommmmmgmmo............",
    "...ommmmmmo.............",
    "....oooooo..............",
]

#: Where the strings cross the pickups: the strum point, centre of the sound rings.
STRUM = (9.5, 15.5)
_RIPPLE_SPACING = 4.8


#: The "power" in the power chord: a bolt cracking off the strings into the empty corner.
BOLT = [
    "..xxxx",
    ".xxxx.",
    ".xxx..",
    "xxxxx.",
    "..xxx.",
    "..xx..",
    ".xx...",
    ".x....",
]


def _bolt() -> Sprite:
    bolt = Sprite(emblem.SIZE, emblem.SIZE)
    bolt.stamp(BOLT, {"x": GOLD.light}, 2, 2)
    for x, y, _ in list(bolt.pixels()):
        if not bolt.opaque(x - 1, y) or not bolt.opaque(x, y - 1):
            bolt.set(x, y, GOLD.pale)
    return bolt.outlined(INK, corners=False)


def _icon_subject(frame: int) -> Sprite:
    """The icon's Strat with the bolt of power tucked behind its headstock's corner."""
    guitar = Sprite.from_rows(STRAT, STRAT_KEY)
    guitar.under(_bolt())
    return guitar


def _icon_sound(frame: int) -> Sprite:
    """Sound rings rolling off the strings; one spacing per 8 frames, so the loop is seamless."""
    guitar = Sprite.from_rows(STRAT, STRAT_KEY)
    rings = Sprite(emblem.SIZE, emblem.SIZE)
    phase = (frame * 0.6) % _RIPPLE_SPACING
    for k in range(3):
        radius = 7.5 + phase + k * _RIPPLE_SPACING
        if radius > 13.5:
            continue
        color = LAVENDER.pale if radius < 9.5 else LAVENDER.light if radius < 11.5 else LAVENDER.mid
        for x, y in arc(STRUM[0], STRUM[1], radius, radius, -20, 80):
            if not guitar.opaque(x, y):
                rings.set(x, y, color)
    return rings


# ── The strum: the flash at the guitar body ────────────────────────────────

STRUM_FRAME = (48, 48)
_FC = 23.5


def _strum(step: int) -> Sprite:
    """The strum at the guitar body: strings flash, a white burst, a lavender burst and ring that frays."""
    sprite = Sprite(*STRUM_FRAME)
    c = _FC
    if step == 0:
        # The pick catches all six strings: six short lines of light across the body, one spark.
        for i in range(6):
            y = int(c) - 5 + i * 2
            sprite.hline(int(c) - 5 + (i % 2), int(c) + 5 - (i % 2), y, WHITE if i % 2 == 0 else LAVENDER.pale)
        sprite.blit(motifs.twinkle(3, LAVENDER), int(c) + 4, int(c) - 9)
        return sprite
    if step == 1:
        # The impact frame: a white eight-point burst (skipped under reduced motion).
        sprite.fill(polygon(motifs.star_points(c, c, [(-90, 22), (0, 22), (90, 22), (180, 22)], 5.5)), WHITE)
        sprite.fill(motifs.starburst(c, c, 4, 14, 5.5, phase=45), WHITE)
        return sprite
    if step == 2:
        motifs.banded_burst(sprite, c, c, 8, 18, 6, [LAVENDER.mid, LAVENDER.light, LAVENDER.pale, WHITE], phase=0)
        sprite.fill(ring(c, c, 10.5, 10.5, 2), WHITE)
        return sprite
    # The local ring rolls out and frays into arcs; the screen-wide rings are the game's job.
    radius = (0, 0, 0, 14.0, 17.5, 20.5, 22.0, 22.5)[step]
    tone = (None, None, None, WHITE, LAVENDER.pale, LAVENDER.light, LAVENDER.mid, LAVENDER.mid)[step]
    gap = (0, 0, 0, 0, 20, 30, 40, 50)[step]
    if step > 3:
        for start in range(0, 360, 60):
            sprite.fill(arc(c, c, radius, radius, start + gap / 2, start + 60 - gap / 2), tone)
    if step == 3:
        sprite.fill(ring(c, c, radius, radius, 2), WHITE)
        sprite.fill(ring(c, c, radius - 2, radius - 2, 1), LAVENDER.light)
        sprite.fill(motifs.starburst(c, c, 4, 7, 3, phase=45), LAVENDER.pale)
        sprite.fill(disc(c, c, 2.5), WHITE)
    for i in range(6):
        if step >= 6 and i % 2:
            continue
        a = math.radians(i * 60 + 30 + step * 8)
        r = radius - 4
        x, y = int(c + math.cos(a) * r), int(c + math.sin(a) * r)
        sprite.blit(motifs.twinkle(1 if step < 6 else 0, LAVENDER), x - 1, y - 1)
    return sprite


def strum_strip() -> Strip:
    return Strip(
        frame=STRUM_FRAME,
        origin=(24, 24),
        animations=with_calm(Animation("strum", 30, False, [_strum(i) for i in range(8)]), flashes=[1]),
    )


# ── The ground wave: a wall of sound racing out along the street ───────────
#
# The shockwave's cut through the street: a tall crescent front (white at the
# leading edge) with two fainter echoes behind it, standing on the ground.
# Drawn moving right; the leading foot is 14 px ahead of the origin.

WAVE = (32, 48)


def _crest(sprite: Sprite, x: float, height: float, reach: float, tones: Sequence[str], thickness: int) -> None:
    """One crescent of the sound wall, ``thickness`` pixels deep, leading edge first."""
    for layer in range(thickness):
        tone = tones[min(layer, len(tones) - 1)]
        sprite.fill(arc(x - layer, WAVE[1], reach, height, -90, 0), tone)


def _wave(frame: int) -> Sprite:
    """The sound wall: a tall white-edged crescent and two fainter echoes, leaning as it travels."""
    sprite = Sprite(*WAVE)
    lean = (0, 1, 0, -1)[frame]
    _crest(sprite, 9, 30 - lean, 9, (LAVENDER.mid, LAVENDER.dark), 2)
    _crest(sprite, 15, 37 + lean, 9, (LAVENDER.pale, LAVENDER.light, LAVENDER.mid), 3)
    _crest(sprite, 21, 44 - lean, 9, (WHITE, WHITE, LAVENDER.pale, LAVENDER.light), 4 if frame % 2 == 0 else 3)
    # Grit kicked up just ahead of where the front meets the street.
    for dx, dy in ((31, 45 - frame % 2), (30, 42 + frame % 2), (31, 39)):
        if frame % 2 == 0 or dy > 41:
            sprite.set(dx, dy, LAVENDER.pale)
    return sprite


def wave_strip() -> Strip:
    return Strip(frame=WAVE, origin=(16, 48), animations=[Animation("travel", 30, True, [_wave(i) for i in range(4)])])


# ── Stunned: stars circling a customer's head for the three seconds ────────

STUN = (40, 20)
_STAR_BACK = ["..x..", ".xXx.", "xXXXx", ".xXx.", ".x.x."]
_STAR_FRONT = ["....x....", "...xXx...", "xxxXXXxxx", ".xXXXXXx.", "..xXXXx..", "..xXxXx..", ".xx...xx."]


def _stun(frame: int, fading: int = -1) -> Sprite:
    """Three stars circling a head; ``fading`` drops the first n stars as the stun wears off."""
    sprite = Sprite(*STUN)
    stars = []
    for k in range(3):
        angle = math.radians(frame * 45 + k * 120)
        x = 19.5 + math.cos(angle) * 13
        y = 11.0 + math.sin(angle) * 4.0
        front = math.sin(angle) > -0.2
        stars.append((y, x, front, k))
    # Back stars first, smaller and dimmer; front stars big and bright: depth from two sizes and two tones.
    for y, x, front, k in sorted(stars):
        if fading >= 0 and k < fading:
            continue
        rows = _STAR_FRONT if front else _STAR_BACK
        key = {"x": GOLD.light if front else GOLD.mid, "X": GOLD.pale if front else GOLD.light}
        sprite.stamp(rows, key, int(x) - len(rows[0]) // 2, int(y) - len(rows) // 2)
    return sprite.outlined(INK, corners=False)


def stun_strip() -> Strip:
    return Strip(
        frame=STUN,
        origin=(20, 20),
        animations=[
            Animation("spin", 12, True, [_stun(i) for i in range(8)]),
            Animation("fade", 12, False, [_stun(i, fading=i + 1) for i in range(3)]),
        ],
    )


# ── Notes thrown off the strum ──────────────────────────────────────────────

NOTE = (12, 12)
_EIGHTH = ["...xx.", "...x.x", "...x..", "...x..", ".xxx..", "xxxx..", ".xx..."]
_BEAMED = ["..xxxxx", "..x...x", "..x...x", "..x...x", "xxx.xxx", "xxxxxxx", ".x...x."]


def _note(rows: Sequence[str], ramp: Ramp) -> Sprite:
    """A note particle: ink-outlined, lit on its top-left edges."""
    sprite = Sprite(*NOTE)
    left = (NOTE[0] - len(rows[0])) // 2
    top = (NOTE[1] - len(rows)) // 2
    sprite.stamp(rows, {"x": ramp.light}, left, top)
    for x, y, _ in list(sprite.pixels()):
        if sprite.get(x - 1, y) is None and sprite.get(x, y - 1) is None:
            sprite.set(x, y, ramp.pale)
    return sprite.outlined(INK, corners=False)


def notes_strip() -> Strip:
    """Six note sprites the game picks from per particle: an eighth and a beamed pair in Artsy's paint colours."""
    variants = [_note(rows, ramp) for rows in (_EIGHTH, _BEAMED) for ramp in (PINK, CYAN, GOLD)]
    return Strip(frame=NOTE, origin=(6, 6), animations=[Animation("variants", 8, True, variants)])


def build() -> Dict[str, Strip]:
    return {
        "icon": emblem.icon_strip(_icon_subject, LAVENDER, _icon_sound),
        "fx-strum": strum_strip(),
        "fx-wave": wave_strip(),
        "fx-stun": stun_strip(),
        "fx-notes": notes_strip(),
    }
