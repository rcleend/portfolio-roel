"""POWER CHORD: one mighty strum on the white Strat; the shockwave stuns everyone in sight.

The icon is the captain's Olympic White Stratocaster from the room: cream
double-cutaway body, mint pickguard, three white single-coils, a chrome
bridge, a rosewood board on a maple neck and the six-in-line headstock,
throwing sound arcs.

In game the strum flashes at the guitar body (the ``hand`` anchor), three
shockwave rings (code: midpoint circles in whole-pixel steps, banded white,
lilac, violet) roll out behind every body, sound crests race along the
ground both ways, notes spray up, and every stunned customer gets a crown
of orbiting stars for the three-second stun.

Sprites:
- ``fx-strum`` (40 x 40, origin = strum point): the ``strum`` burst.
- ``fx-wavefront`` (16 x 48, origin = bottom centre, on the ground): the
  ``crest`` loop, mirrored by code for the left-going wave.
- ``fx-stun`` (32 x 16, origin = bottom centre, above the head): ``orbit``
  loop and its ``fade``.
- ``fx-notes`` (12 x 12, origin centre): ``eighth`` and ``beamed`` note
  particles (pop in, wobble, blink out).
"""

from __future__ import annotations

import math
from typing import List, Sequence, Tuple

from ..icon import FRAMES, accent_window, backlight, glint, glint_stage, icon_sheet, layered
from ..palette import CHROME, GOLD, GUARD, MAPLE, ROSEWOOD, SOUND, STRAT, WHITE, POTION
from ..pix import Canvas, midpoint_circle, polar, rows
from ..sheet import Anim, Sheet

SLOT = 2

# ── icon: the Strat ─────────────────────────────────────────────────────

_LEGEND = {
    "o": STRAT[0], "O": STRAT[1], "S": STRAT[2], "s": STRAT[3], "w": STRAT[4], "W": STRAT[5],
    "K": GUARD[1], "k": GUARD[2], "g": GUARD[3], "G": GUARD[4], "P": STRAT[5],
    "X": CHROME[1], "C": CHROME[2], "t": CHROME[3], "c": CHROME[4],
    "z": ROSEWOOD[0], "R": ROSEWOOD[1], "r": ROSEWOOD[2], "d": STRAT[3],
    "y": MAPLE[0], "n": MAPLE[2], "m": MAPLE[3], "M": MAPLE[4],
}  # fmt: skip

# Hand-placed, 45 degrees: headstock top-right, body bottom-left, the long
# bass horn above the neck and the short treble horn below it.
STRAT_ART = rows("""
....................XtMm
...................XtMmn
..................XtMmny
...................yWWy.
............OO....Rrny..
...........OWso..Rdny...
..........OWWwsoRrny....
.........OWWwwszdny.....
......OOOWWwwszrny......
....OOWWWwwwszrnoWo.....
...OWWwwwwwszrnoWso.....
..OWWwwwwGgzrnoWwso.....
.OWWwwwwGPgRkoWwwso.....
.OWwwwwGggPggkwsSo......
OWwwwwGPgggPKsSo........
OWwwwGggPggkwsSo........
OWwwGPgggPKwwsSo........
OWwwkgPggkwWsSo.........
OWCcwkgPKwwwsSo.........
.OWCcwkkwWssSo..........
.OwwCcwwwwsSo...........
..oswCwwssSo............
...ooSssSoo.............
.....oooo...............
""")
BODY_CENTRE = (7, 16)
# Where the strings cross the guard: the shimmer path for the idle loop (neck end to bridge).
STRING_PATH = [(11, 12), (10, 13), (9, 14), (8, 15), (7, 16), (6, 17), (5, 18)]


def _strat() -> Canvas:
    return Canvas.from_rows(STRAT_ART, _LEGEND)


def _arcs(c: Canvas, radii: Sequence[int], tones: Sequence[str]) -> None:
    """Sound arcs to the lower right of the body, clipped to the empty corner."""
    cx, cy = BODY_CENTRE
    for r, tone in zip(radii, tones):
        for x, y in midpoint_circle(cx, cy, r):
            angle = math.degrees(math.atan2(y - cy, x - cx))
            if -48 <= angle <= 38 and not c.opaque(x, y) and x >= 14:
                c.set(x, y, tone)


def icon_frames() -> List[Canvas]:
    """At rest two faint arcs hum; in the accent the strings flash and three arcs roll outward."""
    frames = []
    for f in range(FRAMES):
        body = _strat()
        i = accent_window(f, SLOT, 9)
        if i < 0:
            _arcs(body, (10, 13), (SOUND[3], SOUND[2]))
        else:
            # Strings light up along the guard, then the sound leaves the body in waves.
            if i < 3:
                for k, (x, y) in enumerate(STRING_PATH):
                    if (k + i) % 2 == 0:
                        body.set(x, y, WHITE)
            waves = [(9 + i, SOUND[5]), (12 + i, SOUND[4]), (15 + i, SOUND[3])]
            _arcs(body, [r for r, _ in waves if r <= 16], [t for r, t in waves if r <= 16])
        glint(body, 5, 18, glint_stage(f, 20), CHROME[4])
        frames.append(layered(backlight(SOUND), body))
    return frames


# ── strum burst at the guitar body ─────────────────────────────────────

STRUM = (40, 40)
STRUM_ORIGIN = (20, 20)


def strum_sheet() -> Sheet:
    """Impact frame, a banded flare with eight rays, a ring, then sound arcs and sparks."""
    ox, oy = STRUM_ORIGIN
    frames = []
    for f in range(9):
        c = Canvas(*STRUM)
        if f <= 2:
            core = (4, 6, 4)[f]
            c.disc(ox + 0.5, oy + 0.5, core + 2.4, SOUND[2])
            c.disc(ox + 0.5, oy + 0.5, core + 1.2, SOUND[4])
            c.disc(ox + 0.5, oy + 0.5, core, WHITE)
            reach = (12, 15, 11)[f]
            for k in range(8):
                angle = math.radians(k * 45)
                long = k % 2 == 0
                for d in range(core + 1, (reach if long else reach - 4) + 1):
                    x, y = polar(ox, oy, d, angle)
                    c.set(x, y, WHITE if d < reach - 3 else SOUND[4])
        if 1 <= f <= 6:
            r = (0, 8, 11, 14, 16, 18, 19)[f]
            for x, y in midpoint_circle(ox, oy, r):
                if f >= 5 and (x + y) % 2:
                    continue
                c.set(x, y, WHITE if f <= 2 else SOUND[4 if f <= 4 else 3])
            if f <= 3:
                for x, y in midpoint_circle(ox, oy, r - 1):
                    c.set(x, y, SOUND[3])
        if f >= 2:
            # Three sound arcs fly out to the front, the sparks of a cranked amp behind them.
            for k in range(3):
                r = 6 + (f - 2) * 3 + k * 4
                if r > 19:
                    continue
                for x, y in midpoint_circle(ox, oy, r):
                    angle = math.degrees(math.atan2(y - oy, x - ox))
                    if -30 <= angle <= 30:
                        c.set(x, y, (WHITE, SOUND[5], SOUND[4])[k] if f < 6 else SOUND[3])
            for k, a in enumerate((-120, -60, 150, 200)):
                if f >= 7 and k % 2:
                    continue
                x, y = polar(ox, oy, 7 + f * 1.6, math.radians(a))
                c.set(x, y, GOLD[5] if f < 5 else GOLD[3])
        frames.append(c)
    return Sheet("fx-strum", STRUM, STRUM_ORIGIN, [Anim("strum", 30, False, frames)])


# ── sound crests racing along the ground ───────────────────────────────

CREST = (16, 48)
CREST_ORIGIN = (8, 47)


def crest_sheet() -> Sheet:
    """Four nested arcs bowed outward (rightward), tallest in front; their bands shimmer."""
    tones = (WHITE, SOUND[5], SOUND[4], SOUND[3])
    frames = []
    for f in range(4):
        c = Canvas(*CREST)
        for k in range(4):
            height = 40 - k * 9
            x0 = 13 - k * 4
            tone = tones[(k + f) % 4] if k else (WHITE if f % 2 == 0 else SOUND[5])
            for y in range(height):
                t = y / max(1, height - 1)
                bow = round(math.sin(t * math.pi) * 3)
                x = x0 + bow - 3
                py = 47 - y
                c.set(x, py, tone)
                if k == 0:
                    c.set(x - 1, py, SOUND[3])
                    if y % 2:
                        c.set(x - 2, py, SOUND[1])
        frames.append(c)
    return Sheet("fx-wavefront", CREST, CREST_ORIGIN, [Anim("crest", 20, True, frames)])


# ── stun stars ──────────────────────────────────────────────────────────

STUN = (32, 16)
STUN_ORIGIN = (16, 15)

_STAR5 = rows("""
..y..
.yYy.
yYWYy
.yYy.
.y.y.
""")
_STAR3 = rows("""
.y.
yWy
.y.
""")
_NOTE = rows("""
..##
..#.
..#.
###.
##..
""")


def _orbit_point(phase: float) -> Tuple[float, float, float]:
    """x, y on the crown's ellipse and the depth (positive = in front of the head)."""
    cx, cy = STUN_ORIGIN[0], STUN_ORIGIN[1] - 6
    return cx + math.cos(phase) * 11, cy + math.sin(phase) * 4, math.sin(phase)


def stun_sheet() -> Sheet:
    """Three stars and a note circling the head; far-side stars are smaller and dimmer."""
    def frame(f: int, count: int) -> Canvas:
        c = Canvas(*STUN)
        items = []
        for k in range(count):
            phase = (f / 12) * math.tau + k * (math.tau / 4)
            x, y, depth = _orbit_point(phase)
            items.append((depth, k, int(round(x)), int(round(y))))
        for depth, k, x, y in sorted(items):
            near = depth >= 0
            if k == 3:
                c.stamp(_NOTE, {"#": SOUND[5] if near else SOUND[3]}, x - 2, y - 3)
            elif near:
                c.stamp(_STAR5, {"y": GOLD[3], "Y": GOLD[5], "W": WHITE}, x - 2, y - 2)
            else:
                c.stamp(_STAR3, {"y": GOLD[2], "W": GOLD[4]}, x - 1, y - 1)
        return c

    orbit = [frame(f, 4) for f in range(12)]
    fade = [frame(f, n) for f, n in zip(range(6), (4, 3, 3, 2, 1, 1))]
    return Sheet("fx-stun", STUN, STUN_ORIGIN, [Anim("orbit", 12, True, orbit), Anim("fade", 12, False, fade)])


# ── note particles ──────────────────────────────────────────────────────

NOTE = (12, 12)
NOTE_ORIGIN = (6, 6)

_EIGHTH = rows("""
...##.
...#.#
...#..
...#..
.###..
####..
.##...
""")
_BEAMED = rows("""
..######
..#....#
..#....#
.##...##
###..###
.#...##.
""")


def _note_frames(art: Sequence[str], tone: str, edge: str) -> List[Canvas]:
    frames = []
    for f in range(6):
        c = Canvas(*NOTE)
        if f == 0:
            c.set(NOTE_ORIGIN[0], NOTE_ORIGIN[1], WHITE)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c.set(NOTE_ORIGIN[0] + dx, NOTE_ORIGIN[1] + dy, tone)
        else:
            # Pop in, wobble a pixel each way, and leave as a dim, unoutlined ghost.
            wobble = (0, 0, 1, 0, -1, 0)[f]
            w, h = len(art[0]), len(art)
            glyph = Canvas(w, h)
            glyph.stamp(art, {"#": tone if f < 5 else edge})
            shape = glyph if f == 5 else glyph.outline(SOUND[1])
            c.blit(shape, NOTE_ORIGIN[0] - w // 2 + wobble, NOTE_ORIGIN[1] - h // 2)
        frames.append(c)
    return frames


def notes_sheet() -> Sheet:
    return Sheet(
        "fx-notes",
        NOTE,
        NOTE_ORIGIN,
        [
            Anim("eighth", 12, False, _note_frames(_EIGHTH, SOUND[5], SOUND[3])),
            Anim("beamed", 12, False, _note_frames(_BEAMED, POTION[5], POTION[3])),
        ],
    )


def sheets() -> List[Sheet]:
    return [icon_sheet(icon_frames()), strum_sheet(), crest_sheet(), stun_sheet(), notes_sheet()]
