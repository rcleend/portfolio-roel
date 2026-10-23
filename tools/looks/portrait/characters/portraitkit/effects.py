"""Attack effect sprites: each hero's projectile, impact burst and muzzle.

Portrait-look effects are refined and designed rather than noisy: crisp
1 px geometry, a few stepped tones, white-hot cores that cool through the
material's ramp, and particles that obey one easing per animation.

Every strip shares one 32 x 24 frame with the origin at its centre: the
projectile's head sits on the origin (its trail streams out behind, to the
left: the game flips the sprite for shots flying left), impacts and muzzle
flashes are centred on the point of contact.
"""

from __future__ import annotations

import math
from typing import Callable, Dict, List, Sequence, Tuple

from PIL import Image

from .palette import Ramp, palette
from .sheet import Strip

W, H = 32, 24
OX, OY = 16, 12

RGB = Tuple[int, int, int]


class Fx:
    """A tiny RGBA canvas for one effect frame, drawn with ramp tones."""

    def __init__(self, ramps: Dict[str, Ramp]) -> None:
        self.ramps = ramps
        self.image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.px = self.image.load()

    def put(self, x: float, y: float, material: str, tone: int) -> None:
        ix, iy = int(math.floor(x)), int(math.floor(y))
        if 0 <= ix < W and 0 <= iy < H:
            r, g, b = self.ramps[material].rgb(tone)
            self.px[ix, iy] = (r, g, b, 255)

    def get(self, x: int, y: int) -> bool:
        return 0 <= x < W and 0 <= y < H and self.px[x, y][3] > 0

    def rect(self, x: int, y: int, w: int, h: int, material: str, tone: int) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, material, tone)

    def glyph(self, rows: Sequence[str], x: int, y: int, tones: Dict[str, Tuple[str, int]]) -> None:
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch in tones:
                    m, t = tones[ch]
                    self.put(x + dx, y + dy, m, t)

    def disc(self, cx: float, cy: float, r: float, material: str, tone: int) -> None:
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                    self.put(x, y, material, tone)

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, material: str, tone: int) -> None:
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                    self.put(x, y, material, tone)

    def outline(self, material: str, tone: int) -> None:
        """A 1 px outline around everything drawn so far (8-connected)."""
        filled = {(x, y) for y in range(H) for x in range(W) if self.px[x, y][3]}
        for x, y in list(filled):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in filled and 0 <= n[0] < W and 0 <= n[1] < H:
                    self.put(n[0], n[1], material, tone)


def _frames(ramps, n: int, paint: Callable[[Fx, int], None]) -> List[Image.Image]:
    out = []
    for i in range(n):
        fx = Fx(ramps)
        paint(fx, i)
        out.append(fx.image)
    return out


# ── HACKERMAN · code bolts ─────────────────────────────────────────────────
# A bright `</>` with a white-hot core leads a comet of cooling characters
# (`;`, `=>`, `{}`) typed out behind it, like a cursor racing across a
# terminal. Hit: the glyph splits into its brackets and a ring of pixels.

CODE = palette(
    code=["#0a3a22", "#14703f", "#2fd16e", "#8affb6", "#effff4"],
)

GLYPH_TAG = [  # </>
    "..#...#.#..",
    ".#....#..#.",
    "#....#....#",
    ".#..#....#.",
    "..#.#...#..",
]
GLYPHS_TRAIL = {
    ";": [".#", "..", ".#", "#."],
    "=>": ["##.#.", "....#", "##.#."],
    "{}": [".#.#.", "#...#", ".#.#."],
    "_": ["###"],
}


def code_projectile() -> List[Image.Image]:
    trails = [(";", "=>"), ("{}", ";"), ("=>", "{}"), (";", "_")]

    def paint(fx: Fx, i: int) -> None:
        # Comet of characters, cooling with distance; drawn first so the head sits on top.
        a, b = trails[i]
        fx.glyph(GLYPHS_TRAIL[a], OX - 10 - (i % 2), OY - 2, {"#": ("code", 2)})
        fx.glyph(GLYPHS_TRAIL[b], OX - 17 - (i % 2), OY - 1, {"#": ("code", 1)})
        # Scanline streaks behind the head.
        for k, length in enumerate((5, 3)):
            y = OY - 1 + k * 2 + (i % 2)
            for x in range(OX - 6 - length, OX - 6):
                fx.put(x, y, "code", 1 if k else 2)
        # The head glyph with a dark rim so it reads on bright skies.
        head = Fx(CODE)
        core = "code", 4 if i % 2 == 0 else 3
        head.glyph(GLYPH_TAG, OX - 5, OY - 2, {"#": ("code", 3)})
        for y, row in enumerate(GLYPH_TAG):  # white-hot spine of the slash
            for x, ch in enumerate(row):
                if ch == "#" and 4 <= x <= 6:
                    head.put(OX - 5 + x, OY - 2 + y, *core)
        head.outline("code", 0)
        fx.image.alpha_composite(head.image)
    return _frames(CODE, 4, paint)


def code_impact() -> List[Image.Image]:
    def paint(fx: Fx, i: int) -> None:
        if i == 0:
            fx.rect(OX - 3, OY - 3, 7, 7, "code", 3)
            fx.rect(OX - 2, OY - 2, 5, 5, "code", 4)
            for d in range(4, 7):
                for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    fx.put(OX + sx * d, OY + sy * d, "code", 3)
            return
        t = i / 4.0
        spread = 3 + int(round(9 * (1 - (1 - t) ** 2)))
        tone = max(1, 4 - i)
        # The tag splits: `<` flies left, `>` right, `/` spins up.
        fx.glyph(["..#", ".#.", "#..", ".#.", "..#"], OX - 2 - spread, OY - 2, {"#": ("code", tone)})
        fx.glyph(["#..", ".#.", "..#", ".#.", "#.."], OX + spread, OY - 2, {"#": ("code", tone)})
        if i < 3:
            fx.glyph(["..#", ".#.", "#.."], OX - 1, OY - 2 - spread // 2, {"#": ("code", tone)})
        # A ring of pixels expanding in whole-pixel steps.
        for k in range(8):
            ang = k * math.pi / 4 + math.pi / 8
            r = spread + 1
            fx.put(OX + math.cos(ang) * r, OY + math.sin(ang) * r * 0.7, "code", max(1, tone - 1))
    return _frames(CODE, 5, paint)


def code_muzzle() -> List[Image.Image]:
    def paint(fx: Fx, i: int) -> None:
        r = (2, 4, 5)[i]
        tone = (4, 3, 1)[i]
        for d in range(1, r + 1):
            for sx, sy in ((1, 0), (0, 1), (0, -1), (-1, 0)):
                if sx == -1 and d > 2:
                    continue
                fx.put(OX + sx * d, OY + sy * d, "code", tone if d < r else max(1, tone - 1))
        fx.put(OX, OY, "code", 4 if i < 2 else 2)
        if i == 1:
            for sx, sy in ((1, 1), (1, -1)):
                fx.put(OX + sx * 2, OY + sy * 2, "code", 3)
    return _frames(CODE, 3, paint)


# ── ARTSY · paint splats ───────────────────────────────────────────────────
# A glob of paint flung off a power strum: it wobbles in flight (squash and
# stretch along its arc) and bursts into a crown of droplets on contact.

PAINTS = {
    "pink": ["#5e1430", "#a8285a", "#e2508c", "#f78fbb", "#ffe1ee"],
    "cyan": ["#0c3b4a", "#167a8e", "#2fbfd6", "#86e6f2", "#e2fbff"],
    "yellow": ["#5a3a06", "#a8740e", "#ebb522", "#fadb6e", "#fff7d6"],
}
SOUND = ["#4b4a68", "#9d9ac4", "#ffffff"]


def _paint_ramps(colour: str):
    return palette(paint=PAINTS[colour], sound=SOUND)


def paint_projectile(colour: str) -> List[Image.Image]:
    shapes = [(3.4, 2.6), (3.0, 3.0), (2.6, 3.4), (3.0, 3.0)]  # stretch along, round, squash, round

    def paint(fx: Fx, i: int) -> None:
        rx, ry = shapes[i]
        glob = Fx(fx.ramps)
        # Two trailing droplets and a thin tail stretched behind the glob.
        glob.disc(OX - 6 - (i % 2), OY + 1, 1.2, "paint", 2)
        glob.put(OX - 9 - (i % 2), OY + 2 - (i % 2), "paint", 2)
        glob.ellipse(OX, OY, rx, ry, "paint", 2)
        glob.ellipse(OX - 0.6, OY - 0.6, rx - 1.0, ry - 1.0, "paint", 3)
        glob.put(OX - 1, OY - 2 + (1 if i == 0 else 0), "paint", 4)  # wet highlight
        glob.outline("paint", 0)
        fx.image.alpha_composite(glob.image)
    return _frames(_paint_ramps(colour), 4, paint)


def paint_impact(colour: str) -> List[Image.Image]:
    def paint(fx: Fx, i: int) -> None:
        if i == 0:
            fx.ellipse(OX, OY, 5.0, 2.6, "paint", 2)  # the glob squashes flat
            fx.ellipse(OX - 1, OY - 1, 3.2, 1.2, "paint", 3)
            fx.put(OX - 2, OY - 1, "paint", 4)
            fx.outline("paint", 0)
            return
        t = i / 5.0
        reach = 3 + 9 * (1 - (1 - t) ** 2)
        # Splat body shrinks to a stain while the crown of droplets flies out and falls.
        body = max(0.0, 4.6 - i * 0.9)
        if body > 0.8:
            fx.ellipse(OX, OY + 1, body + 1.0, body * 0.6 + 0.4, "paint", 2)
            fx.ellipse(OX - 0.6, OY + 0.6, body * 0.6, body * 0.3 + 0.2, "paint", 3)
        for k in range(7):
            ang = -math.pi * (0.08 + 0.84 * k / 6)  # an upward fan
            dx = math.cos(ang) * reach
            dy = math.sin(ang) * reach * 0.75 + 7 * t * t  # gravity pulls the crown down
            size = 1.4 if k % 2 == 0 and i < 3 else 0.9
            fx.disc(OX + dx, OY + dy, size, "paint", 3 if i < 3 else 2)
        if i < 5:
            fx.outline("paint", 0)
    return _frames(_paint_ramps(colour), 6, paint)


def paint_muzzle(colour: str) -> List[Image.Image]:
    def paint(fx: Fx, i: int) -> None:
        # The strum's twang: two sound arcs open out; a mist of droplets sprays forward.
        for k, r in enumerate((3 + i * 2, 1 + i * 2)):
            if r <= 0:
                continue
            tone = 2 if (i + k) < 2 else 1
            for a in range(-50, 51, 10):
                ang = math.radians(a)
                fx.put(OX + math.cos(ang) * r, OY + math.sin(ang) * r, "sound", tone)
        for k in range(3):
            fx.put(OX + 2 + i * 2 + k * 2, OY - 2 + k * 2 - i, "paint", 3 - (i > 1))
    return _frames(_paint_ramps(colour), 3, paint)


# ── STRATEGY · sticky notes ────────────────────────────────────────────────
# A yellow note thrown like a shuriken: it spins flat in the air with a
# pale motion arc, and slaps onto whatever it hits before tearing into
# confetti.

NOTE = palette(
    note=["#6e4a0c", "#c48b14", "#f2c534", "#ffe66e", "#fff8c8"],
    ink=["#2e3e86", "#5b6fc4"],
    swish=["#9c98b8", "#f4f2ff"],
)


def _square(fx: Fx, cx: float, cy: float, half: float, angle: float, material: str, tone_fn) -> None:
    ca, sa = math.cos(angle), math.sin(angle)
    r = half * 1.5
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            lx, ly = dx * ca + dy * sa, -dx * sa + dy * ca
            if abs(lx) <= half and abs(ly) <= half:
                fx.put(x, y, material, tone_fn(lx, ly))


def note_projectile() -> List[Image.Image]:
    def paint(fx: Fx, i: int) -> None:
        angle = math.radians(i * 22.5)
        # Motion arc: two pale curves trailing the spin.
        for k in range(5):
            a = angle + math.pi + k * 0.18
            fx.put(OX - 4 - k, OY + math.sin(a) * 2.5, "swish", 0)
        note = Fx(NOTE)

        def tone(lx: float, ly: float) -> int:
            if ly > 2.2:
                return 2  # the curled, shaded bottom edge
            return 4 if lx < -1.5 and ly < -1.5 else 3

        _square(note, OX, OY, 3.2, angle, "note", tone)
        # A scribble of ink turning with the note.
        for t in (-1.2, 0.4):
            note.put(OX + math.cos(angle) * t - math.sin(angle) * -0.8,
                     OY + math.sin(angle) * t + math.cos(angle) * -0.8, "ink", 1)
        note.outline("note", 0)
        fx.image.alpha_composite(note.image)
    return _frames(NOTE, 4, paint)


def note_impact() -> List[Image.Image]:
    def paint(fx: Fx, i: int) -> None:
        if i == 0:
            # Slap: the note lands flat and big, with a white snap of impact lines.
            _square(fx, OX, OY, 4.2, 0.0, "note", lambda lx, ly: 4 if ly < -2 else 3)
            fx.outline("note", 0)
            for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
                for d in (7, 8):
                    fx.put(OX + sx * d, OY + sy * d, "swish", 1)
            return
        # It tears into confetti that tumbles out and drifts down.
        t = i / 4.0
        spread = 2 + 8 * (1 - (1 - t) ** 2)
        for k, (ang, rot) in enumerate(((-2.4, 0.3), (-0.8, 1.1), (-1.6, 0.7), (0.4, 0.2), (2.6, 0.9))):
            x = OX + math.cos(ang) * spread
            y = OY + math.sin(ang) * spread * 0.8 + 6 * t * t
            half = 1.4 if k % 2 else 1.0
            _square(fx, x, y, half, rot + i * 0.6, "note", lambda lx, ly: 3 if ly < 0 else 2)
        fx.outline("note", 0)
    return _frames(NOTE, 5, paint)


def note_muzzle() -> List[Image.Image]:
    def paint(fx: Fx, i: int) -> None:
        # A flick: a crescent swish opening forward from the fingers.
        r = 3 + i * 2
        for a in range(-70, 71, 12):
            ang = math.radians(a)
            fx.put(OX + math.cos(ang) * r - 2, OY + math.sin(ang) * r, "swish", 1 if i < 2 else 0)
    return _frames(NOTE, 3, paint)


def attack(hero_id: str) -> Tuple[List[Strip], Tuple[int, int], Tuple[int, int]]:
    """The attack.png strips for a hero, with the shared frame size and origin."""
    if hero_id == "hackerman":
        strips = [
            Strip("projectile", 15, True, code_projectile()),
            Strip("impact", 20, False, code_impact()),
            Strip("muzzle", 20, False, code_muzzle()),
        ]
    elif hero_id == "artsy":
        strips = [
            Strip("projectile", 12, True, paint_projectile("pink")),
            Strip("impact", 18, False, paint_impact("pink")),
            Strip("muzzle", 18, False, paint_muzzle("pink")),
            Strip("projectile-cyan", 12, True, paint_projectile("cyan")),
            Strip("impact-cyan", 18, False, paint_impact("cyan")),
            Strip("projectile-yellow", 12, True, paint_projectile("yellow")),
            Strip("impact-yellow", 18, False, paint_impact("yellow")),
        ]
    elif hero_id == "strategy":
        strips = [
            Strip("projectile", 24, True, note_projectile()),
            Strip("impact", 18, False, note_impact()),
            Strip("muzzle", 20, False, note_muzzle()),
        ]
    else:
        raise KeyError(hero_id)
    return strips, (W, H), (OX, OY)
