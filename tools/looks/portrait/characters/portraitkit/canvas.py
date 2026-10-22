"""A frame being painted: symbolic cells, painter's order, finishing passes.

Parts are painted back to front. Every cell remembers its material, tone and
the part that painted it, so the finishing passes can do what a pixel artist
does by hand:

* contact shadows: a part tucked behind another gets one tone darker along
  the edge where the front part overlaps it, on the side away from the light;
* selective outline: the outer silhouette takes the material's darkest tone
  on the shadow side (right, bottom) and keeps its lit colour on the light
  side (top, left), the way the reference grid is painted;
* TV glow: dark materials catch a cool rim on their right edge so a black
  hoodie still reads on the indigo select screen.
"""

from __future__ import annotations

import math
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

from PIL import Image

from .palette import Ramp
from .pixmap import Pixmap

Point = Tuple[float, float]

# Light from the top-left and a little in front, as STYLES.md asks.
LIGHT = (-0.62, -0.66, 0.42)
_L = math.sqrt(sum(c * c for c in LIGHT))
LIGHT = (LIGHT[0] / _L, LIGHT[1] / _L, LIGHT[2] / _L)


_N8 = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))


def _open_neighbour(at, x: int, y: int) -> bool:
    """True if a 4-neighbour is empty: the pixel sits on the outer silhouette."""
    return any(at(x + dx, y + dy) is None for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)))


class PartStyle:
    """How the finishing passes treat one painted part."""

    __slots__ = ("outline", "casts", "receives", "rim", "outline_tone", "full", "lit_tone")

    def __init__(self, outline: bool = True, casts: bool = True, receives: bool = True, rim: bool = True,
                 outline_tone: int = 0, full: bool = False, lit_tone: Optional[int] = 1) -> None:
        self.full = full  # hard objects (a guitar) take a line on every side
        # The silhouette facing the light takes this coloured dark tone, so the
        # outer edge reads dark all round without going black (None: stay lit).
        self.lit_tone = lit_tone
        self.outline = outline
        self.casts = casts
        self.receives = receives
        self.rim = rim
        self.outline_tone = outline_tone


class Frame:
    def __init__(self, w: int = 64, h: int = 64) -> None:
        self.w = w
        self.h = h
        # Each cell: None or [material, tone, part]
        self.cells: List[Optional[list]] = [None] * (w * h)
        self.styles: List[PartStyle] = []
        self.names: List[str] = []

    # ── parts ──────────────────────────────────────────────────────────────
    def part(self, name: str, style: Optional[PartStyle] = None) -> int:
        self.styles.append(style or PartStyle())
        self.names.append(name)
        return len(self.styles) - 1

    def inside(self, x: int, y: int) -> bool:
        return 0 <= x < self.w and 0 <= y < self.h

    def get(self, x: int, y: int) -> Optional[list]:
        if not self.inside(x, y):
            return None
        return self.cells[y * self.w + x]

    def put(self, x: int, y: int, material: str, tone: int, part: int) -> None:
        if self.inside(x, y):
            self.cells[y * self.w + x] = [material, tone, part]

    def erase(self, x: int, y: int) -> None:
        if self.inside(x, y):
            self.cells[y * self.w + x] = None

    # ── painting ───────────────────────────────────────────────────────────
    def stamp(self, pixmap: Pixmap, x: int, y: int, part: int, flip: bool = False, behind: bool = False) -> None:
        """Places a sprite by whole pixels; `behind` only fills empty cells."""
        source = pixmap.flip_x() if flip else pixmap
        for px, py, material, tone in source:
            tx, ty = x + px, y + py
            if behind and self.get(tx, ty) is not None:
                continue
            self.put(tx, ty, material, tone, part)

    def limb(
        self,
        a: Point,
        b: Point,
        ra: float,
        rb: float,
        material: str,
        part: int,
        ramp: Ramp,
        lo: int = 1,
        hi: Optional[int] = None,
        bias: float = 0.0,
        behind: bool = False,
        pattern=None,
    ) -> None:
        """A tapered capsule shaded as a cylinder lit from the top-left.

        `lo`..`hi` is the slice of the ramp the shading may use; tone 0 is
        left to the outline pass. `bias` brightens (+) or darkens (-) the
        whole limb, e.g. for the far arm in shadow.
        """
        hi = ramp.top if hi is None else hi
        ax, ay = a
        bx, by = b
        r = max(ra, rb)
        x0, x1 = int(math.floor(min(ax, bx) - r - 1)), int(math.ceil(max(ax, bx) + r + 1))
        y0, y1 = int(math.floor(min(ay, by) - r - 1)), int(math.ceil(max(ay, by) + r + 1))
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                cx, cy = x + 0.5, y + 0.5
                t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((cx - ax) * dx + (cy - ay) * dy) / length2))
                qx, qy = ax + dx * t, ay + dy * t
                rad = ra + (rb - ra) * t
                ox, oy = cx - qx, cy - qy
                dist = math.hypot(ox, oy)
                if dist > rad:
                    continue
                if behind and self.get(x, y) is not None:
                    continue
                tone = shade_tone(ox / rad if rad else 0.0, oy / rad if rad else 0.0, lo, hi, bias)
                if pattern is not None:
                    length = math.sqrt(length2) or 1.0
                    across = (ox * -dy + oy * dx) / length
                    found = pattern(t * length, across, tone)
                    if found is not None:
                        self.put(x, y, found[0], found[1], part)
                        continue
                self.put(x, y, material, tone, part)

    def blob(self, center: Point, rx: float, ry: float, material: str, part: int, ramp: Ramp,
             lo: int = 1, hi: Optional[int] = None, bias: float = 0.0, behind: bool = False) -> None:
        """An ellipse shaded as a dome (a hand, a bun of fabric)."""
        hi = ramp.top if hi is None else hi
        cx0, cy0 = center
        for y in range(int(cy0 - ry - 1), int(cy0 + ry + 2)):
            for x in range(int(cx0 - rx - 1), int(cx0 + rx + 2)):
                nx = (x + 0.5 - cx0) / rx
                ny = (y + 0.5 - cy0) / ry
                if nx * nx + ny * ny > 1.0:
                    continue
                if behind and self.get(x, y) is not None:
                    continue
                self.put(x, y, material, shade_tone(nx, ny, lo, hi, bias), part)

    # ── finishing ──────────────────────────────────────────────────────────
    def finish(self, materials_dark: Sequence[str] = (), rim_material: Optional[str] = None) -> None:
        """Selective outline with a cool TV-glow rim on dark cloth.

        Each edge pixel estimates its outward normal from the 8 neighbours
        that are empty or belong to a part behind it. Edges facing the light
        (up, left) stay lit; edges facing away (down, right) take the
        material's darkest tone, which is the outer silhouette against the
        background and the coloured inner line against a part behind (an arm
        over a torso of the same black hoodie). Dark materials catch the
        TV's cool glow on edges facing right instead.
        """
        w, h = self.w, self.h
        src = [None if c is None else list(c) for c in self.cells]

        def at(x: int, y: int) -> Optional[list]:
            if 0 <= x < w and 0 <= y < h:
                return src[y * w + x]
            return None

        out = [None if c is None else list(c) for c in src]
        for y in range(h):
            for x in range(w):
                c = src[y * w + x]
                if c is None:
                    continue
                material, tone, part = c
                style = self.styles[part]
                if not style.outline:
                    continue
                vx = vy = 0
                open_right = False
                silhouette = False
                for dx, dy in _N8:
                    n = at(x + dx, y + dy)
                    if n is None or n[2] < part:
                        vx += dx
                        vy += dy
                        if n is None and (dx > 0 or dy > 0):
                            silhouette = True
                        if dx == 1 and dy == 0 and n is None:
                            open_right = True
                if vx + vy <= 0 and not (style.full and (vx or vy)):
                    if style.lit_tone is not None and _open_neighbour(at, x, y):
                        out[y * w + x][1] = min(tone, style.lit_tone)
                    continue
                if open_right and vx >= vy and material in materials_dark and style.rim and rim_material:
                    out[y * w + x] = [rim_material, 0, part]
                elif silhouette:
                    out[y * w + x][1] = min(tone, style.outline_tone)
                else:
                    # Inner line against a part behind: one step lighter than the silhouette.
                    out[y * w + x][1] = min(tone, style.outline_tone + 1)
        self.cells = out

    def image(self, palette: Mapping[str, Ramp]) -> Image.Image:
        im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        px = im.load()
        for y in range(self.h):
            for x in range(self.w):
                c = self.cells[y * self.w + x]
                if c is None:
                    continue
                ramp = palette[c[0]]
                r, g, b = ramp.rgb(c[1])
                px[x, y] = (r, g, b, 255)
        return im


def shade_tone(nx: float, ny: float, lo: int, hi: int, bias: float = 0.0) -> int:
    """Banded shading for a 2D offset across a limb or a body part.

    `u` runs from -1 on the edge facing the light to +1 on the edge facing
    away. The bands copy how the reference grid paints a sleeve or a trouser
    leg: the very lit edge one step under the highlight, the highlight just
    inside it, the mid tone across the middle and a shadow band on the far
    side (the outline pass then darkens the silhouette pixel itself).
    """
    lx, ly = LIGHT[0], LIGHT[1]
    norm = math.hypot(lx, ly)
    u = -(nx * lx + ny * ly) / norm - bias
    if u < -0.72:
        t = hi - 1
    elif u < -0.12:
        t = hi
    elif u < 0.42:
        t = hi - 1
    elif u < 0.78:
        t = hi - 2
    else:
        t = hi - 3
    return max(lo, min(hi, t))


def dump(frame: "Frame", box: Tuple[int, int, int, int], legend: Mapping[Tuple[str, int], str]) -> str:
    """The cells inside `box` as text, for painting over a procedural draft."""
    x0, y0, x1, y1 = box
    rows = []
    for y in range(y0, y1):
        row = []
        for x in range(x0, x1):
            c = frame.get(x, y)
            row.append("." if c is None else legend.get((c[0], c[1]), "?"))
        rows.append("".join(row))
    return "\n".join(rows)
