"""Basic-attack effect sprites: projectile loops, impact bursts, muzzle flashes.

Drawn procedurally at native scale with pixel rules (no blur, no partial alpha):
stepped-band glows instead of soft ones, glyphs from a tiny pixel font, particles as
1-2 px clusters that blink out like hardware sprites. Every frame is 32 x 32 with the
origin at its centre: the shot's position in game.

- Hackerman, code bolts: a `</>` core in a stepped green glow, chased by a stream of
  keyboard glyphs; impacts shatter into brackets; the muzzle pops a `>_` prompt spark.
- Artsy, paint: a glossy blob wobbling (squash and stretch) with drips, a splash crown
  on impact, a fan of flecks off the strings. One set per paint colour the game cycles.
- Strategy, sticky notes: a note spinning like a shuriken with a speed streak, a slap
  and a puff of paper on impact, a swoosh off the throwing hand.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from .canvas import Sprite

SIZE = 32
CENTRE = (16, 16)


class Pixels:
    """A tiny 32x32 drawing surface with pixel-art primitives."""

    def __init__(self, w: int = SIZE, h: int = SIZE) -> None:
        self.w, self.h = w, h
        self.px: List[Optional[str]] = [None] * (w * h)

    def put(self, x: float, y: float, c: Optional[str]) -> None:
        xi, yi = int(math.floor(x)), int(math.floor(y))
        if 0 <= xi < self.w and 0 <= yi < self.h:
            self.px[yi * self.w + xi] = c

    def get(self, x: int, y: int) -> Optional[str]:
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y * self.w + x]
        return None

    def disc(self, cx: float, cy: float, rx: float, ry: Optional[float] = None, c: Optional[str] = None) -> None:
        ry = rx if ry is None else ry
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                dx = (x + 0.5 - cx) / max(rx, 0.01)
                dy = (y + 0.5 - cy) / max(ry, 0.01)
                if dx * dx + dy * dy <= 1.0:
                    self.put(x, y, c)

    def ring(self, cx: float, cy: float, r: float, c: str, width: float = 1.0) -> None:
        for y in range(int(cy - r - 2), int(cy + r + 3)):
            for x in range(int(cx - r - 2), int(cx + r + 3)):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if r - width < d <= r:
                    self.put(x, y, c)

    def line(self, x0: float, y0: float, x1: float, y1: float, c: str) -> None:
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(steps + 1):
            t = i / steps
            self.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c)

    def glyph(self, rows: Sequence[str], x: int, y: int, c: str) -> None:
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch == "#":
                    self.put(x + i, y + j, c)

    def outline(self, c: str) -> None:
        """A 1 px outline around everything drawn so far (outside the shapes)."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y * self.w + x] is not None:
                    continue
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    if self.get(x + dx, y + dy) not in (None, c):
                        add.append((x, y))
                        break
        for x, y in add:
            self.put(x, y, c)

    def sprite(self) -> Sprite:
        return Sprite(self.w, self.h, list(self.px))


# ── Tiny pixel font for code glyphs ──────────────────────────────────────────────

GLYPHS: Dict[str, List[str]] = {
    "<": ["..#", ".#.", "#..", ".#.", "..#"],
    ">": ["#..", ".#.", "..#", ".#.", "#.."],
    "/": ["..#", "..#", ".#.", "#..", "#.."],
    "{": [".##", ".#.", "#..", ".#.", ".##"],
    "}": ["##.", ".#.", "..#", ".#.", "##."],
    ";": [".#", "..", ".#", "#.", ".."],
    "=": ["###", "...", "###"],
    "0": [".#.", "#.#", "#.#", "#.#", ".#."],
    "1": [".#", "##", ".#", ".#", ".#"],
    "_": ["###"],
    "(": [".#", "#.", "#.", "#.", ".#"],
    ")": ["#.", ".#", ".#", ".#", "#."],
}

CODE = {"core": "#ffffff", "hot": "#9dffc4", "mid": "#3dff8a", "dim": "#1f9a58", "deep": "#0e4a2a", "ink": "#06200f"}


def _outlined_glyph(p: Pixels, rows: Sequence[str], x: int, y: int, fill: str, ink: str) -> None:
    """A glyph with a 1 px ink outline around it, so it stays legible inside a glow."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != "#":
                continue
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if p.get(x + i + dx, y + j + dy) is None:
                        p.put(x + i + dx, y + j + dy, ink)
    p.glyph(rows, x, y, fill)


def _glow(p: Pixels, color: str, sparse: bool = False) -> None:
    """One stepped band of glow around everything drawn so far (never a soft blur)."""
    add = []
    for y in range(p.h):
        for x in range(p.w):
            if p.get(x, y) is not None:
                continue
            if sparse and (x + y) % 2:
                continue
            if any(p.get(x + dx, y + dy) is not None for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))):
                add.append((x, y))
    for x, y in add:
        p.put(x, y, color)


def _bolt_core(p: Pixels, cx: int, cy: int, hot: bool) -> None:
    """`</>` in white-hot mint, inked so it reads, wrapped in a stepped green glow."""
    fill = CODE["core"] if hot else CODE["hot"]
    x = cx - 6
    for g in ("<", "/", ">"):
        _outlined_glyph(p, GLYPHS[g], x, cy - 2, fill, CODE["ink"])
        x += 5
    _glow(p, CODE["mid"])
    _glow(p, CODE["dim"], sparse=True)


def code_projectile() -> List[Sprite]:
    """Six frames: the bolt shimmers (core flips white/mint, the outer glow crawls) while a
    stream of keyboard glyphs peels off behind it, dimmer with distance."""
    trail_glyphs = [";", "1", "{", "0", "=", "}"]
    frames = []
    for f in range(6):
        p = Pixels()
        _bolt_core(p, 19, 16, hot=f % 2 == 0)
        for k in range(3):
            g = trail_glyphs[(f + k * 2) % len(trail_glyphs)]
            gx = 6 - k * 4 - (f % 2)
            gy = 14 + (1 if (f + k) % 2 else -1) * (k % 2) + (k == 2)
            color = (CODE["mid"], CODE["dim"], CODE["deep"])[k]
            p.glyph(GLYPHS[g], gx, gy, color)
        # A leading spark that skips along the front edge.
        p.put(29, 14 + (f % 3), CODE["core"])
        frames.append(p.sprite())
    return frames


def code_impact() -> List[Sprite]:
    """Seven frames: a white-hot pop, a two-band shock ring, then the bolt's brackets and
    bits fly apart and blink out like hardware sprites."""
    frames = []
    shards = [("{", -1.0, -0.6), ("}", 1.0, -0.5), ("<", -1.0, 0.5), (">", 1.0, 0.6), (";", 0.1, -1.0), ("0", 0.0, 1.0)]
    for f in range(7):
        p = Pixels()
        if f == 0:
            p.disc(16, 16, 6.0, 5.0, CODE["dim"])
            p.disc(16, 16, 4.5, 3.6, CODE["hot"])
            p.disc(16, 16, 3.0, 2.4, CODE["core"])
        elif f == 1:
            p.ring(16, 16, 8.5, CODE["dim"], 1.0)
            p.ring(16, 16, 7.5, CODE["mid"], 1.0)
            p.disc(16, 16, 3.0, 2.5, CODE["core"])
        else:
            r = 3 + f * 2.4
            for g, dx, dy in shards:
                if f >= 5 and (f + len(g)) % 2:
                    continue
                gx = int(16 + dx * r - 1)
                gy = int(16 + dy * r * 0.8 - 2)
                color = CODE["core"] if f < 3 else CODE["hot"] if f < 5 else CODE["mid"]
                _outlined_glyph(p, GLYPHS[g], gx, gy, color, CODE["ink"])
            if f < 4:
                p.ring(16, 16, 9.5 + (f - 1) * 2.5, CODE["dim"], 1.0)
        frames.append(p.sprite())
    return frames


def code_muzzle() -> List[Sprite]:
    """Four frames: a prompt spark `>_` pops at the keyboard's edge and fizzles."""
    frames = []
    for f in range(4):
        p = Pixels()
        if f == 0:
            p.disc(16, 16, 3.5, 3.5, CODE["mid"])
            p.disc(16, 16, 2.0, 2.0, CODE["core"])
            for a in range(0, 360, 90):
                rad = math.radians(a)
                p.line(16 + math.cos(rad) * 4, 16 + math.sin(rad) * 4, 16 + math.cos(rad) * 6, 16 + math.sin(rad) * 6, CODE["hot"])
        elif f == 1:
            _outlined_glyph(p, GLYPHS[">"], 15, 13, CODE["core"], CODE["ink"])
            _outlined_glyph(p, GLYPHS["_"], 19, 17, CODE["hot"], CODE["ink"])
            p.ring(16, 16, 7.0, CODE["dim"])
        elif f == 2:
            _outlined_glyph(p, GLYPHS[">"], 16, 13, CODE["mid"], CODE["ink"])
            _outlined_glyph(p, GLYPHS["_"], 20, 17, CODE["mid"], CODE["ink"])
        else:
            p.put(18, 15, CODE["dim"])
            p.put(21, 17, CODE["dim"])
        frames.append(p.sprite())
    return frames


# ── Artsy: paint ─────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Paint:
    name: str
    ink: str  # outline
    deep: str
    mid: str
    light: str
    shine: str


#: The colours the game cycles through (src/game/entities/shots/PaintSplat.ts), each as a ramp.
PAINTS = (
    Paint("pink", "#4a0a2a", "#a8205e", "#ff4fa3", "#ff9ad0", "#ffffff"),
    Paint("cyan", "#0a2a40", "#1a7aa8", "#3fd8ff", "#a8f0ff", "#ffffff"),
    Paint("yellow", "#4a2a08", "#c08a10", "#ffd84a", "#fff0a8", "#ffffff"),
)


def _blob(p: Pixels, cx: float, cy: float, rx: float, ry: float, paint: Paint) -> None:
    p.disc(cx, cy, rx + 1, ry + 1, paint.ink)
    p.disc(cx, cy, rx, ry, paint.deep)
    p.disc(cx - 0.4, cy - 0.5, rx - 0.6, ry - 0.6, paint.mid)
    p.disc(cx - rx * 0.35, cy - ry * 0.4, max(1.0, rx * 0.35), max(1.0, ry * 0.3), paint.light)
    p.put(cx - rx * 0.45, cy - ry * 0.5, paint.shine)


def paint_projectile(paint: Paint) -> List[Sprite]:
    """Four frames: squash and stretch as the blob wobbles in flight, drips trailing."""
    shapes = [(4.0, 3.2), (3.4, 3.8), (3.8, 3.4), (4.4, 2.9)]
    frames = []
    for f, (rx, ry) in enumerate(shapes):
        p = Pixels()
        # Drips trail behind (to the left), alternating so the trail flickers alive.
        for k, (dx, dy, r) in enumerate(((-7, 1, 1.4), (-11, 2, 1.0), (-14, 0, 0.8))):
            if (f + k) % 2 == 0 or k == 0:
                p.disc(16 + dx, 16 + dy + (f % 2), r, r, paint.deep if k else paint.mid)
        _blob(p, 16, 16, rx, ry, paint)
        frames.append(p.sprite())
    return frames


def paint_impact(paint: Paint) -> List[Sprite]:
    """Seven frames: flatten, splash crown, droplets arc out and fall, drips run, gone."""
    frames = []
    drops = [(-1.0, -0.9), (-0.6, -1.3), (0.0, -1.5), (0.6, -1.3), (1.0, -0.9), (-1.2, -0.2), (1.2, -0.3)]
    for f in range(7):
        p = Pixels()
        if f == 0:
            _blob(p, 16, 17, 6.0, 2.6, paint)
        elif f == 1:
            p.disc(16, 18, 7.5, 3.0, paint.ink)
            p.disc(16, 18, 6.5, 2.2, paint.mid)
            for dx, dy in drops:
                p.disc(16 + dx * 6, 16 + dy * 4, 1.3, 1.3, paint.light)
        else:
            t = f - 1
            p.disc(16, 19, 7.0 + t * 0.3, 2.2, paint.deep)
            p.disc(15.5, 18.6, 5.5, 1.4, paint.mid)
            for k, (dx, dy) in enumerate(drops):
                if f >= 5 and (k + f) % 2:
                    continue
                x = 16 + dx * (6 + t * 2.2)
                y = 16 + dy * (4 + t * 1.6) + t * t * 0.9
                r = 1.4 if t < 3 else 1.0
                p.disc(x, y, r, r, paint.mid if t < 4 else paint.deep)
            # Drips run down from the splat.
            for dx in (-4, 1, 5):
                for dy in range(min(t, 4)):
                    p.put(16 + dx, 20 + dy, paint.deep)
        p.outline(paint.ink)
        frames.append(p.sprite())
    return frames


def paint_muzzle(paint: Paint) -> List[Sprite]:
    """Four frames: a fan of flecks flung off the strings."""
    frames = []
    for f in range(4):
        p = Pixels()
        for k, a in enumerate((-50, -25, 0, 20)):
            rad = math.radians(a)
            d = 3 + f * 3 + (k % 2)
            if f == 3 and k % 2:
                continue
            p.disc(16 + math.cos(rad) * d, 16 + math.sin(rad) * d, 1.2 if f < 2 else 0.8, None,
                   paint.light if f == 0 else paint.mid)
        if f == 0:
            p.disc(15, 16, 2.0, 2.0, paint.shine)
        p.outline(paint.ink)
        frames.append(p.sprite())
    return frames


# ── Strategy: sticky notes ───────────────────────────────────────────────────────

NOTE = {"ink": "#3e1e14", "face": "#ffe14d", "shade": "#e0a82a", "strip": "#fff6c0", "line": "#c08a10",
        "streak": "#fff6c0", "puff": "#ffffff"}


def _note(p: Pixels, cx: float, cy: float, angle: float, squash: float) -> None:
    """A square note rotated by `angle` and foreshortened by `squash` (spin about its own axis)."""
    half = 3.6
    ca, sa = math.cos(angle), math.sin(angle)
    for y in range(int(cy - 7), int(cy + 8)):
        for x in range(int(cx - 7), int(cx + 8)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u = dx * ca + dy * sa
            v = (-dx * sa + dy * ca) / max(squash, 0.18)
            if abs(u) <= half and abs(v) <= half:
                if v < -half + 1.6:
                    c = NOTE["strip"]  # the sticky strip
                elif u > half - 1.2 or v > half - 1.0:
                    c = NOTE["shade"]  # the curl and lower edge in shade
                elif abs(v - 0.6) < 0.5 and -2.0 < u < 1.6:
                    c = NOTE["line"]  # a scribbled line of a strategy
                else:
                    c = NOTE["face"]
                p.put(x, y, c)


def note_projectile() -> List[Sprite]:
    """Eight frames: the note spins like a shuriken and flutters, a streak behind it."""
    frames = []
    for f in range(8):
        p = Pixels()
        for k, length in ((0, 7), (1, 5)):
            y = 15 + k * 3
            p.line(16 - 6 - length, y, 16 - 6, y, NOTE["streak"] if k == 0 else NOTE["shade"])
        spin = f / 8 * 2 * math.pi
        _note(p, 16, 16, angle=spin * 0.5, squash=0.25 + 0.75 * abs(math.cos(spin)))
        p.outline(NOTE["ink"])
        frames.append(p.sprite())
    return frames


def note_impact() -> List[Sprite]:
    """Six frames: SLAP (the note flattened with burst lines), crumple, a puff of paper bits."""
    frames = []
    for f in range(6):
        p = Pixels()
        if f == 0:
            _note(p, 16, 16, 0.12, 1.25)
            for a in range(0, 360, 45):
                rad = math.radians(a + 22)
                p.line(16 + math.cos(rad) * 8, 16 + math.sin(rad) * 8, 16 + math.cos(rad) * 11, 16 + math.sin(rad) * 11,
                       NOTE["puff"])
        elif f == 1:
            _note(p, 16, 17, -0.3, 0.7)
            p.ring(16, 16, 9.0, NOTE["puff"])
        else:
            t = f - 1
            for k, a in enumerate((-150, -100, -60, -20, 30, 160)):
                if f >= 4 and (k + f) % 2:
                    continue
                rad = math.radians(a)
                x = 16 + math.cos(rad) * (4 + t * 3)
                y = 16 + math.sin(rad) * (3 + t * 2) + t * t * 0.6
                p.disc(x, y, 1.0, 1.0, NOTE["face"] if k % 2 else NOTE["strip"])
            if f < 4:
                _note(p, 16, 17 + t, 0.6 * t, 0.5)
        p.outline(NOTE["ink"])
        frames.append(p.sprite())
    return frames


def note_muzzle() -> List[Sprite]:
    """Three frames: a swoosh arc off the throwing hand."""
    frames = []
    for f in range(3):
        p = Pixels()
        r = 6 + f * 2
        for a in range(-80, 40, 6):
            if f == 2 and (a // 6) % 2:
                continue
            rad = math.radians(a)
            p.put(14 + math.cos(rad) * r, 16 + math.sin(rad) * r, NOTE["puff"] if f == 0 else NOTE["strip"])
        frames.append(p.sprite())
    return frames
