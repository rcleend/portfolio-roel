"""Hand-held props, drawn as pixel art at 0° and placed at any angle with RotSprite.

- The Olympic White Stratocaster from the room: its silhouette is built from a few
  tuned shapes (lower and upper bout, waist, a long upper horn and a short lower horn,
  the cutaways), then painted by hand rules: cream body lit from the top-left, mint
  pickguard with a bevel, three white single-coils (bridge one slanted), chrome bridge,
  white knobs, rosewood board with dot inlays over a maple edge, six-in-line headstock.
- Hackerman's chunky mechanical keyboard, slung like a keytar: keycap rows, a red Esc,
  a terminal-green Enter and an RGB underglow strip.
- Strategy's sticky-note pad.

Each prop names a rotation pivot and grip points (where hands go, where shots leave).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

from .canvas import Canvas, Sprite
from .rotsprite import rotate, rotated_point
from .vec import Vec

Point = Tuple[float, float]

#: Olympic White over a mint guard; the hardware, rosewood and maple borrow tones from
#: Artsy's other ramps (ash greys, the brown trousers, the hair) to save colours.
STRAT_PALETTE: Dict[str, str] = {
    "O": "#33221c",
    "W": "#fffaee",
    "w": "#f2ead4",
    "c": "#ddd3b6",
    "C": "#b9ad8e",
    "p": "#e4f1e2",
    "P": "#c2d7c4",
    "Q": "#8fae9c",
    "u": "#fffaee",
    "U": "#b9ad8e",
    "k": "#ffffff",
    "K": "#a4a2ac",
    "n": "#fffaee",
    "r": "#4a3228",
    "R": "#33221c",
    "i": "#ddd3b6",
    "m": "#e0cca0",
    "M": "#bea47a",
    "y": "#947a58",
}


def _ellipse(cx: float, cy: float, rx: float, ry: float, ang: float = 0.0):
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))

    def inside(x: float, y: float) -> bool:
        dx, dy = x - cx, y - cy
        u = dx * ca + dy * sa
        v = -dx * sa + dy * ca
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1.0

    return inside


# Silhouette shapes in sprite pixels (neck towards +x, bass side up).
_STRAT_ADD = [
    _ellipse(6.4, 7.0, 6.2, 6.4),  # lower bout
    _ellipse(12.4, 7.0, 4.0, 5.4),  # upper bout
    _ellipse(17.4, 2.8, 4.0, 1.7, -26),  # long upper (bass) horn
    _ellipse(15.4, 11.3, 2.8, 1.6, 28),  # short lower (treble) horn
]
_STRAT_SUB = [
    _ellipse(9.8, -1.2, 2.4, 2.6),  # waist, bass side
    _ellipse(9.6, 15.4, 2.6, 2.6),  # waist, treble side
    _ellipse(20.0, 5.6, 3.4, 1.7, -6),  # upper cutaway
    _ellipse(18.4, 9.3, 2.8, 1.3, 20),  # lower cutaway
]
_HEADSTOCK = [
    "...OOOO.",
    "..OkmkmO",
    ".OkmkmmO",
    "OmmmmmMO",
    "mmmmmMO.",
    "OOOOOO..",
]
_NECK_X0, _NECK_LEN = 15, 15
_INLAYS = (18, 20, 22, 24, 27)


@lru_cache(maxsize=1)
def strat_sprite() -> Sprite:
    body_w, h = 20, 14
    nut = _NECK_X0 + _NECK_LEN
    w = nut + len(_HEADSTOCK[0])
    grid: List[List[Optional[str]]] = [[None] * w for _ in range(h)]
    region: List[List[Optional[str]]] = [[None] * w for _ in range(h)]
    for y in range(h):
        for x in range(body_w):
            px, py = x + 0.5, y + 0.5
            if any(f(px, py) for f in _STRAT_ADD) and not any(f(px, py) for f in _STRAT_SUB):
                region[y][x] = "body"
    for x in range(_NECK_X0, nut):
        for y in (5, 6, 7, 8):
            region[y][x] = "neck"
    for j, row in enumerate(_HEADSTOCK):
        for i, ch in enumerate(row):
            if ch != ".":
                region[2 + j][nut + i] = "head:" + ch
    # Paint: domed cream body lit from the top-left.
    for y in range(h):
        for x in range(w):
            r = region[y][x]
            if r == "body":
                t = -(x - 8) / 9.0 - (y - 7) / 7.0
                grid[y][x] = "W" if t > 0.9 else "w" if t > -0.2 else "c" if t > -0.9 else "C"
            elif r == "neck":
                grid[y][x] = {5: "O", 6: "r", 7: "R", 8: "M"}[y]
            elif r and r.startswith("head:"):
                grid[y][x] = r[5:]
    for y in range(h):
        for x in range(body_w):
            if region[y][x] != "body":
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                qx, qy = x + dx, y + dy
                if not (0 <= qx < w and 0 <= qy < h) or region[qy][qx] is None:
                    grid[y][x] = "O"
                    break
    # Pickguard: mint over the middle of the body, cream left showing around it.
    guard = set()
    for y in range(2, 12):
        for x in range(5, 16):
            if grid[y][x] in ("W", "w", "c", "C"):
                if ((x - 11.0) / 5.6) ** 2 + ((y - 7.2) / 4.3) ** 2 <= 1.0:
                    guard.add((x, y))
    for x, y in guard:
        grid[y][x] = "p" if (x + y) < 19 else "P"
    for x, y in guard:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            if (x + dx, y + dy) not in guard and grid[y + dy][x + dx] not in ("O", None, "r", "R", "M"):
                grid[y][x] = "Q"
                break
    for px in (13, 11):  # neck and middle single-coils
        for y in (5, 6, 7):
            grid[y][px] = "u"
    for y in (5, 6, 7):  # bridge pickup, slanted
        grid[y][9] = "u"
    grid[8][9] = "U"
    for y in (5, 6, 7):  # chrome bridge
        grid[y][6] = "k"
    grid[8][6] = "K"
    for x, y in ((12, 9), (10, 10), (8, 10)):  # knobs
        grid[y][x] = "n"
    for x in range(_NECK_X0, nut):  # rosewood board over the maple edge
        grid[7][x] = "R"
    for x in _INLAYS:
        grid[6][x] = "i"
    text = "\n".join("".join(c or "." for c in row) for row in grid)
    return Sprite.parse(text, STRAT_PALETTE)


#: The case shares the hoodie's ramp, the keycaps the sneakers' greys, the glow the
#: drawstrings' terminal green.
KEYBOARD_PALETTE: Dict[str, str] = {
    "O": "#160f1c",
    "c": "#2c2840",
    "C": "#403a58",
    "b": "#1e1a2a",
    "W": "#ececf4",
    "K": "#c4c4d4",
    "k": "#8c8aa0",
    "g": "#1f9a58",
    "G": "#9dffc4",
    "U": "#3dff8a",
    "v": "#1f9a58",
    "r": "#c0606a",
}

_KEYBOARD = """
.OOOOOOOOOOOOOOOOOOOO.
OCCCCCCCCCCCCCCCCCCCCO
OCrWWcWWcWWcWWcWWcGGbO
OcKkkcKkcKkcKkcKkcggbO
OCWWWcWWcWWcWWcWWWWWbO
OcKkkcKkcKkcKkcKkkkkbO
OCWWcWWWWWWWWWWcWWcWbO
OOOOOOOOOOOOOOOOOOOOOO
.UUUUUUUUUUUUUUUUUUUU.
..vvvvvvvvvvvvvvvvvv..
"""


@lru_cache(maxsize=1)
def keyboard_sprite() -> Sprite:
    return Sprite.parse(_KEYBOARD, KEYBOARD_PALETTE)


#: Keycaps that light up while typing (sprite x, y of the keycap's top pixel).
_KEYS = [(4, 2), (7, 4), (10, 2), (13, 4), (16, 2), (9, 6), (12, 6), (5, 4)]
#: The underglow cycles through these (palette cycling, one step per frame).
_GLOW = [("#3dff8a", "#1f9a58"), ("#3df0ff", "#1f6a9a"), ("#ff5ad0", "#7a1a8a")]


def _lit(sprite: Sprite, arg: str) -> Sprite:
    pixels = list(sprite.pixels)
    for index in arg.split("+"):
        x, y = _KEYS[int(index) % len(_KEYS)]
        for dx in (0, 1):
            i = y * sprite.width + x + dx
            if pixels[i] in (KEYBOARD_PALETTE["W"], KEYBOARD_PALETTE["K"]):
                pixels[i] = "#9dffc4"
        i = (y + 1) * sprite.width + x
        if 0 <= i < len(pixels) and pixels[i] in (KEYBOARD_PALETTE["K"], KEYBOARD_PALETTE["k"]):
            pixels[i] = "#3dff8a"
    return Sprite(sprite.width, sprite.height, pixels)


def _glow(sprite: Sprite, arg: str) -> Sprite:
    bright, dim = _GLOW[int(arg) % len(_GLOW)]
    return sprite.recolored({KEYBOARD_PALETTE["U"]: bright, KEYBOARD_PALETTE["v"]: dim})


def _ring(sprite: Sprite, arg: str) -> Sprite:
    """Strings ringing after a strum: a bright line shivering along the board."""
    pixels = list(sprite.pixels)
    row = 6 if int(arg or 0) % 2 == 0 else 7
    for x in range(_NECK_X0 - 6, _NECK_X0 + _NECK_LEN):
        i = row * sprite.width + x
        if pixels[i] in (STRAT_PALETTE["r"], STRAT_PALETTE["R"], STRAT_PALETTE["p"], STRAT_PALETTE["P"]):
            pixels[i] = "#ffffff" if (x + row) % 3 else "#c8c6ce"
    return Sprite(sprite.width, sprite.height, pixels)


PAD_PALETTE: Dict[str, str] = {"O": "#3e1e14", "y": "#ffe14d", "Y": "#e0a82a", "f": "#fff6c0", "l": "#e0a82a"}
_PAD = """
OOOOO
OfyyO
OyllO
OyyYO
OOOOO
"""


@lru_cache(maxsize=1)
def pad_sprite() -> Sprite:
    return Sprite.parse(_PAD, PAD_PALETTE)


@dataclass(frozen=True)
class Prop:
    name: str
    sprite_fn: object  # zero-arg callable returning the 0° Sprite (cached)
    pivot: Point
    grips: Dict[str, Point] = field(default_factory=dict)
    #: Named looks of the same prop (lit keys, cycling glow, ringing strings), applied at 0°.
    variants: Dict[str, object] = field(default_factory=dict)

    @property
    def sprite(self) -> Sprite:
        return self.sprite_fn()  # type: ignore[operator]

    def variant(self, spec: str) -> Sprite:
        """`spec` is a comma-separated list of variant names with an optional `:arg`."""
        sprite = self.sprite
        for part in filter(None, spec.split(",")):
            name, _, arg = part.partition(":")
            sprite = self.variants[name](sprite, arg)  # type: ignore[operator]
        return sprite


STRAT = Prop(
    "strat",
    strat_sprite,
    pivot=(8.0, 7.0),
    grips={
        "strum": (11.0, 6.5),
        "neck": (24.5, 6.5),
        "nut": (29.5, 6.5),
        "horn": (18.0, 2.0),
        "butt": (0.5, 7.0),
        "muzzle": (14.0, 6.0),
        "body": (8.0, 7.0),
    },
    variants={"ring": _ring},
)

KEYBOARD = Prop(
    "keyboard",
    keyboard_sprite,
    pivot=(11.0, 4.5),
    grips={
        "near": (2.5, 5.0),
        "far": (19.0, 5.0),
        "keys": (10.0, 3.5),
        "keys_left": (6.0, 3.5),
        "keys_right": (14.0, 3.5),
        "muzzle": (21.5, 4.0),
    },
    variants={"lit": _lit, "glow": _glow},
)

PAD = Prop("pad", pad_sprite, pivot=(2.0, 2.0), grips={"hold": (2.0, 3.0)})


@lru_cache(maxsize=1024)
def _rotated(name: str, degrees: float, variant: str = "") -> Tuple[Sprite, Tuple[int, int]]:
    prop = PROPS[name]
    return rotate(prop.variant(variant), degrees, prop.pivot)


PROPS: Dict[str, Prop] = {p.name: p for p in (STRAT, KEYBOARD, PAD)}


@dataclass(frozen=True)
class Placed:
    """A prop placed in a frame: pivot at `at` (frame-space x, y), rotated, at depth z."""

    prop: Prop
    angle: float
    at: Tuple[float, float]
    z: float
    variant: str = ""

    def grip(self, name: str, offset: Point = (0.0, 0.0)) -> Vec:
        """World position of a grip point (with an optional sprite-space offset)."""
        gx, gy = self.prop.grips[name]
        gx, gy = gx + offset[0], gy + offset[1]
        rx, ry = rotated_point((gx, gy), self.prop.pivot, round(self.angle))
        dx, dy = rx - self.prop.pivot[0], ry - self.prop.pivot[1]
        return (self.at[0] + dx, self.at[1] - dy, self.z)

    def stamp(self, canvas: Canvas, origin: Tuple[int, int] = (32, 64)) -> None:
        sprite, pivot = _rotated(self.prop.name, round(self.angle), self.variant)
        px = origin[0] + self.at[0]
        py = origin[1] - self.at[1]
        x = int(math.floor(px)) - pivot[0]
        y = int(math.floor(py)) - pivot[1]
        canvas.stamp(sprite, x, y, z=self.z, layer="prop:" + self.prop.name)
