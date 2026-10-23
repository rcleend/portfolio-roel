"""FULL-STACK ATTACK: the whole stack, front-end over back-end over database, fired as one beam.

The layers keep one colour each everywhere they appear: cyan front-end,
violet back-end, gold database. The icon shows the stack itself, three
slabs each firing its own beam; the in-game beam is those three bands fused.
"""

from __future__ import annotations

import math
from typing import Dict, List, Sequence

from pixkit.canvas import Sprite, arc, disc, polygon
from pixkit.palette import CYAN, GOLD, INK, SMOKE, VIOLET, WHITE, Ramp
from pixkit.sheet import Animation, Strip, with_calm

from . import emblem, motifs

LAYERS = (CYAN, VIOLET, GOLD)


def _icon_subject(frame: int) -> Sprite:
    """The icon's stack: three slabs, each firing its layer of the beam into one hit spark."""
    subject = Sprite(emblem.SIZE, emblem.SIZE)
    for index, ramp in enumerate(LAYERS):
        top = 2 + index * 7
        # The slab: a lit top face, a front face lit from the left, a dark right face.
        subject.hline(2, 8, top, ramp.pale)
        for y in range(top + 1, top + 6):
            subject.hline(1, 2, y, ramp.light)
            subject.hline(3, 7, y, ramp.mid)
            subject.set(8, y, ramp.dark)
        subject.hline(2, 3, top + 2, WHITE)
        # The right face recedes, so its bottom corner is cut away.
        subject.set(8, top + 5, None)
        # The beam leaves the slab's face as three rows: rim, white-hot core, shadow.
        beam_top = top + 2
        subject.hline(9, 20, beam_top, ramp.light)
        subject.hline(9, 21, beam_top + 1, ramp.pale)
        subject.hline(9, 20, beam_top + 2, ramp.mid)
        subject.set(22, beam_top + 1, ramp.light)
        # Data in flight: one white pulse per beam, a pixel a frame, staggered so the three never line up.
        # Its 16-frame period matches the loop, and it hides off-beam for part of it, so it never pops.
        pulse = 6 + (frame + index * 5) % emblem.IDLE_FRAMES
        if 10 <= pulse <= 20:
            subject.hline(pulse, pulse + 1, beam_top + 1, WHITE)
        # The port the beam leaves through flares white.
        subject.set(9, beam_top + 1, WHITE)
    subject = subject.outlined(INK, corners=False)
    # Where the three beams land, one white hit spark pierces all of them; it breathes once a loop.
    reach = 8 if frame < 8 else 7
    spark = motifs.star_points(21.5, 11.5, [(-90, reach), (0, 3), (90, reach), (180, 4)], 1.5)
    subject.fill(polygon(spark), WHITE)
    for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        subject.set(21 + dx * 2, 11 + dy * 2, VIOLET.pale)
    return subject


# ── The beam ────────────────────────────────────────────────────────────────
#
# One beam is three fused bands, five pixels each, with a one-pixel seam of
# the next band's deepest tone between them and a deep glow line outside:
# 19 rows centred on row 11 of a 24-row strip. The body is a 16 px tile the
# game repeats from the hand to the edge of the screen.

SEGMENT = (16, 24)
BEAM_ROW = 11
_BAND_TOP = (3, 9, 15)


def _band(ramp: Ramp, core: str) -> List[str]:
    """One band's five rows, top to bottom: rim, light, core, light, shaded underside."""
    return [ramp.dark, ramp.light, core, ramp.light, ramp.mid]


#: Each band's data pulses as (dash length, period): short packets up top, long requests, mid-sized rows below.
_PULSES = ((2, 8), (5, 16), (3, 8))


def _beam_body(frame: int) -> Sprite:
    """One 16 px tile of the full beam; ``frame`` scrolls the data pulses and toggles the rims' hum."""
    segment = Sprite(*SEGMENT)
    w = SEGMENT[0]
    buzz = frame % 2 == 1
    glow_top, glow_bottom = CYAN.deep, GOLD.deep
    for x in range(w):
        segment.set(x, 2, glow_top)
        segment.set(x, 20, glow_bottom)
        if buzz:
            segment.set(x, 1, glow_top if x % 2 == 0 else None)
            segment.set(x, 21, glow_bottom if x % 2 == 1 else None)
        for index, ramp in enumerate(LAYERS):
            top = _BAND_TOP[index]
            for row, color in enumerate(_band(ramp, ramp.pale)):
                segment.set(x, top + row, color)
            if index < 2:
                segment.set(x, top + 5, LAYERS[index + 1].deep)
        # Rims brighten on the buzz frames: the beam hums instead of sitting still.
        if buzz:
            for index, ramp in enumerate(LAYERS):
                segment.set(x, _BAND_TOP[index], ramp.mid)
    # Data in flight: dashes scroll four pixels a frame, so four frames tile seamlessly in time and space.
    for index, (length, period) in enumerate(_PULSES):
        core = _BAND_TOP[index] + 2
        offset = frame * 4 + index * 5
        for x in range(w):
            if (x - offset) % period < length:
                segment.set(x, core, WHITE)
    return segment


def _beam_collapse(step: int) -> Sprite:
    """The beam spending itself: the outer layers thin and break first, so it dies on the back-end core."""
    segment = Sprite(*SEGMENT)
    w = SEGMENT[0]
    for x in range(w):
        for index, ramp in enumerate(LAYERS):
            core = _BAND_TOP[index] + 2
            outer = index != 1
            if step == 0:
                for row, color in ((core - 1, ramp.light), (core, ramp.pale), (core + 1, ramp.light)):
                    segment.set(x, row, color)
            elif step == 1:
                segment.set(x, core, ramp.pale if outer else WHITE)
                if not outer:
                    segment.set(x, core - 1, ramp.light)
            elif step == 2:
                if not outer:
                    segment.set(x, core, WHITE)
                elif x % 4 < 2:
                    segment.set(x, core, ramp.light)
            elif step == 3 and not outer and x % 4 < 3:
                segment.set(x, core, ramp.pale)
            elif step == 4 and not outer and x % 8 in (1, 5):
                segment.set(x, core, ramp.light)
    return segment


def beam_strip() -> Strip:
    return Strip(
        frame=SEGMENT,
        origin=(0, BEAM_ROW),
        animations=[
            Animation("fire", 30, True, [_beam_body(i) for i in range(4)]),
            Animation("collapse", 30, False, [_beam_collapse(i) for i in range(5)]),
        ],
    )


def _beam_head(frame: int) -> Sprite:
    """The beam's leading end while it races out: staggered points, the back-end layer as the spearhead."""
    head = Sprite(24, 24)
    reach = (12, 16, 12)
    for index, ramp in enumerate(LAYERS):
        top = _BAND_TOP[index]
        end = reach[index] + (frame % 2)
        for row, color in enumerate(_band(ramp, ramp.pale)):
            # Each band narrows to its core over its last pixels: a chunky arrowhead, not a blunt cut.
            taper = abs(row - 2)
            head.hline(0, end - taper * 2, top + row, color)
        head.set(end + 1, top + 2, WHITE)
    head.hline(0, 10, 2, CYAN.deep)
    head.hline(0, 10, 20, GOLD.deep)
    # A shock front bows out ahead of the spearhead, with speed lines peeling off it.
    front = 15 + frame
    head.fill(arc(front, BEAM_ROW + 0.5, 5.5, 7.0, -62, 62), WHITE)
    head.fill(arc(front - 2, BEAM_ROW + 0.5, 5.5, 7.5, -50, -35), VIOLET.pale)
    head.fill(arc(front - 2, BEAM_ROW + 0.5, 5.5, 7.5, 35, 50), VIOLET.pale)
    return head


def beam_head_strip() -> Strip:
    return Strip(
        frame=(24, 24),
        origin=(0, BEAM_ROW),
        animations=[Animation("head", 30, True, [_beam_head(i) for i in range(3)])],
    )


# ── Muzzle: charge, flare while firing, smoke when spent ───────────────────

MUZZLE = (32, 32)
_MC = 15.5


def _muzzle_charge(step: int) -> Sprite:
    """The cast at the hand: three sparks rush in, a white impact frame, then a tri-colour burst."""
    sprite = Sprite(*MUZZLE)
    if step == 0:
        # Three sparks, one per layer, rushing into the hand, and the hand starting to glow.
        for angle, ramp in ((-130, CYAN), (180, VIOLET), (130, GOLD)):
            a = math.radians(angle)
            x0, y0 = _MC + math.cos(a) * 13, _MC + math.sin(a) * 13
            motifs.shard(sprite, x0, y0, angle + 180, 6, ramp.light, ramp.pale)
        sprite.fill(disc(_MC, _MC, 3.6), CYAN.pale)
        sprite.fill(disc(_MC, _MC, 2.4), WHITE)
    elif step == 1:
        # The impact frame: a solid white flash (skipped under reduced motion).
        sprite.fill(motifs.starburst(_MC, _MC, 4, 11, 5.5, phase=0), WHITE)
        sprite.fill(motifs.starburst(_MC, _MC, 4, 7, 4.5, phase=45), WHITE)
    else:
        motifs.banded_burst(sprite, _MC, _MC, 8, 12, 5, [VIOLET.mid, CYAN.light, CYAN.pale, WHITE], phase=22.5)
    return sprite


def _muzzle_flare(frame: int) -> Sprite:
    """The hand while the beam pours out: a spinning eight-point flash in the beam's colours."""
    sprite = Sprite(*MUZZLE)
    big = frame % 2 == 0
    motifs.banded_burst(
        sprite,
        _MC,
        _MC,
        8,
        12 if big else 10,
        5.5 if big else 4.8,
        [VIOLET.mid, CYAN.light, CYAN.pale, WHITE],
        phase=22.5 * frame,
    )
    return sprite


#: The spent muzzle's puff, per frame: balls (x, y, radius) around the hand, rising, splitting, shrinking.
_SMOKE = (
    ((15.5, 15.5, 4.5),),
    ((14.0, 15.0, 3.6), (17.5, 14.5, 3.4), (15.5, 12.5, 3.8)),
    ((13.0, 13.5, 3.8), (18.5, 13.0, 3.6), (15.5, 10.0, 4.2)),
    ((12.0, 12.0, 3.2), (19.5, 11.5, 3.0), (15.5, 7.5, 3.6)),
    ((11.5, 10.5, 2.2), (20.0, 10.0, 2.0), (15.5, 5.5, 2.6)),
    ((11.0, 9.0, 1.2), (20.5, 8.5, 0.9), (15.5, 4.0, 1.5)),
)


def _muzzle_smoke(step: int) -> Sprite:
    """The spent hand's puff: it rises, splits into three clumps and breaks up, cooling as it goes."""
    sprite = Sprite(*MUZZLE)
    tones = (
        (SMOKE.mid, SMOKE.light, SMOKE.pale, WHITE) if step < 2 else (SMOKE.dark, SMOKE.mid, SMOKE.light, SMOKE.pale)
    )
    if step >= 4:
        tones = (SMOKE.deep, SMOKE.dark, SMOKE.mid, SMOKE.light)
    motifs.clumps(sprite, _SMOKE[step], tones, 15.5, 12.0 - step)
    return sprite


def muzzle_strip() -> Strip:
    return Strip(
        frame=MUZZLE,
        origin=(16, 16),
        animations=[
            *with_calm(Animation("charge", 30, False, [_muzzle_charge(i) for i in range(3)]), flashes=[1]),
            Animation("flare", 20, True, [_muzzle_flare(i) for i in range(4)]),
            Animation("smoke", 15, False, [_muzzle_smoke(i) for i in range(6)]),
        ],
    )


# ── A customer struck by the beam ───────────────────────────────────────────
#
# Big enough that its rays clear the beam above and below: the hit has to read
# even while the beam is still pouring through the customer.

HIT = (48, 48)
_HC = 23.5


def _hit(step: int) -> Sprite:
    """A customer struck: white star, tri-colour burst, torn shock ring, flying shards, twinkles."""
    sprite = Sprite(*HIT)
    c = _HC
    if step == 0:
        # The impact frame: pure white, long vertical rays so it towers over the beam.
        sprite.fill(polygon(motifs.star_points(c, c, [(-90, 20), (0, 12), (90, 20), (180, 12)], 4.0)), WHITE)
        sprite.fill(motifs.starburst(c, c, 8, 10, 4.5, phase=22.5), WHITE)
        return sprite
    if step == 1:
        for i in range(8):
            ramp = LAYERS[i % 3]
            angle = i * 45 - 90
            length = 21 if i % 2 == 0 else 14
            sprite.fill(
                polygon(motifs.star_points(c, c, [(angle, length), (angle + 120, 2.2), (angle + 240, 2.2)], 2.2)),
                ramp.light,
            )
            sprite.fill(
                polygon(motifs.star_points(c, c, [(angle, length * 0.6), (angle + 120, 1.4), (angle + 240, 1.4)], 1.4)),
                ramp.pale,
            )
        sprite.fill(disc(c, c, 6.5), CYAN.pale)
        sprite.fill(disc(c, c, 5.0), WHITE)
        return sprite
    if step == 2:
        # One broken shock ring, torn where the shards punch through it.
        for start in range(0, 360, 45):
            sprite.fill(arc(c, c, 11.0, 11.0, start + 10, start + 35), WHITE)
        sprite.fill(motifs.starburst(c, c, 4, 8, 3.0, phase=45), CYAN.pale)
    # Shards fly out along eight lanes, shrinking and cooling as they go.
    distance = (0, 0, 11, 15, 18, 20, 21)[step]
    length = (0, 0, 5, 4, 3, 2, 1)[step]
    for i in range(8):
        ramp = LAYERS[i % 3]
        angle = i * 45 + 22.5 + (i % 2) * 10
        a = math.radians(angle)
        x, y = c + math.cos(a) * distance, c + math.sin(a) * distance
        if step <= 4:
            motifs.shard(
                sprite,
                x - math.cos(a) * length,
                y - math.sin(a) * length,
                angle,
                length,
                ramp.light if step < 4 else ramp.mid,
                ramp.pale if step < 4 else ramp.light,
            )
        elif step == 5 and i % 2 == 0:
            sprite.blit(motifs.twinkle(1, ramp), int(x) - 1, int(y) - 1)
        elif step == 6 and i % 3 == 0:
            sprite.set(int(x), int(y), ramp.light)
    core = (0, 0, 4.4, 3.0, 1.6, 0, 0)[step]
    if core:
        sprite.fill(disc(c, c, core), WHITE if step < 4 else CYAN.pale)
    return sprite


def hit_strip() -> Strip:
    return Strip(
        frame=HIT,
        origin=(24, 24),
        animations=with_calm(Animation("hit", 30, False, [_hit(i) for i in range(7)]), flashes=[0]),
    )


# ── Code shrapnel: tiny glyphs a struck customer sheds, thrown by the game as particles ──

_GLYPHS = (
    (CYAN, ["..x", ".x.", "x..", ".x.", "..x"]),
    (CYAN, ["x..", ".x.", "..x", ".x.", "x.."]),
    (VIOLET, [".xx", ".x.", "x..", ".x.", ".xx"]),
    (VIOLET, ["xx.", ".x.", "..x", ".x.", "xx."]),
    (GOLD, ["xxx", "x.x", "x.x", "x.x", "xxx"]),
    (GOLD, [".x.", "xx.", ".x.", ".x.", "xxx"]),
    (CYAN, ["..x", "..x", ".x.", "x..", "x.."]),
    (VIOLET, [".x", "..", ".x", ".x", "x."]),
)


def _glyph(ramp: Ramp, rows: Sequence[str]) -> Sprite:
    sprite = Sprite(8, 8)
    left = (8 - len(rows[0])) // 2
    sprite.stamp(rows, {"x": ramp.light}, left, 1)
    for x, y, _ in list(sprite.pixels()):
        if y == 1 or x == left:
            sprite.set(x, y, ramp.pale)
    return sprite.outlined(INK, corners=False)


def bits_strip() -> Strip:
    return Strip(
        frame=(8, 8),
        origin=(4, 4),
        animations=[Animation("variants", 8, True, [_glyph(ramp, rows) for ramp, rows in _GLYPHS])],
    )


def build() -> Dict[str, Strip]:
    return {
        "icon": emblem.icon_strip(_icon_subject, VIOLET),
        "fx-beam": beam_strip(),
        "fx-beam-head": beam_head_strip(),
        "fx-muzzle": muzzle_strip(),
        "fx-hit": hit_strip(),
        "fx-bits": bits_strip(),
    }
