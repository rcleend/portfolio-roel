"""Attack sprites: what each hero's basic attack throws, how it hits, and its muzzle flash.

Metal Slug rules: chunky shapes, a near-black outline, a white-hot frame on
impact, bold palette flashes, and nothing blurred. Every strip has the
contract animations `projectile` (loop), `impact` (once) and `muzzle` (once);
variants (`projectile-*`, `impact-*`) give the attack visual some variety to
choose from without changing behaviour.
"""

from __future__ import annotations

import math
from typing import Callable, Dict, Iterable, List, Mapping, Sequence, Tuple

from PIL import Image

from . import palette as P
from .compose import Frame, Part
from .grid import Grid, Point
from .raster import disc, line, outline_outside
from .sheet import Sheet, SheetAnim

Cells = Dict[Point, str]

FLASH = "#ffffff"


def _render(w: int, h: int, layers: Sequence[Tuple[Cells, Mapping[str, str]]], outline: bool = True) -> Image.Image:
    """Stacks cell layers; each gets an outline ring unless it is a loose particle layer."""
    frame = Frame(w=w, h=h)
    for cells, palette in layers:
        if not cells:
            continue
        cells = outline_outside(cells) if outline else cells
        frame.add(Part(Grid.from_cells(cells), (0, 0), palette, P.OUTLINE, next(iter(palette)), name="fx"))
    return frame.render()


def _stamp(cells: Cells, grid_rows: Sequence[str], at: Point, keymap: Mapping[str, str] = None) -> None:
    for y, row in enumerate(grid_rows):
        for x, key in enumerate(row):
            if key != ".":
                cells[(at[0] + x, at[1] + y)] = keymap.get(key, key) if keymap else key


# ── Hackerman: code bolts ───────────────────────────────────────────────────
# 7 px tall, 1 px strokes: a white-hot core inside a green neon band, like characters burning on a CRT.
GLYPHS: Mapping[str, Sequence[str]] = {
    "</>": (
        "...#.....#..#...",
        "..#......#...#..",
        ".#......#.....#.",
        "#.......#......#",
        ".#.....#......#.",
        "..#....#.....#..",
        "...#..#.....#...",
    ),
    "{}": (
        "..##...##..",
        ".#.......#.",
        ".#.......#.",
        "#.........#",
        ".#.......#.",
        ".#.......#.",
        "..##...##..",
    ),
    "=>": (
        "........#...",
        "#####....#..",
        "..........#.",
        "...........#",
        "#####.....#.",
        ".........#..",
        "........#...",
    ),
    ";": (
        ".##",
        ".##",
        "...",
        "...",
        ".##",
        "..#",
        ".#.",
    ),
}
BITS: Mapping[str, Sequence[str]] = {"1": (".#", "##", ".#", ".#", "##"), "0": ("##", "#.#"[:2], "##")}

CODE = {"w": FLASH, "h": "#c8ffdc", "g": P.TERMINAL_GREEN, "G": P.TERMINAL_GREEN_DARK, "d": "#0b3d24"}


def _neon(core: Cells, glow_key: str = "G") -> Cells:
    """A glyph's strokes plus a one-pixel neon band around them."""
    cells: Cells = {}
    for (x, y) in core:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if abs(dx) + abs(dy) <= 1:
                    cells.setdefault((x + dx, y + dy), glow_key)
    cells.update(core)
    return cells


def _glyph_core(glyph: str, origin: Point, key: str) -> Cells:
    return {
        (origin[0] + x, origin[1] + y): key
        for y, row in enumerate(GLYPHS[glyph])
        for x, k in enumerate(row)
        if k == "#"
    }


def code_projectile(glyph: str) -> List[Image.Image]:
    """28x14, origin (14, 7). The glyph burns at the front; a stutter of bits and scanlines streams behind."""
    frames = []
    width = len(GLYPHS[glyph][0])
    for i in range(4):
        gx = 27 - width
        core = _glyph_core(glyph, (gx, 4), "g")
        # A white-hot flicker runs along the strokes from frame to frame.
        for k, point in enumerate(sorted(core)):
            if (k + i) % 3 == 0:
                core[point] = "w"
        glyph_cells = _neon(core)
        trail: Cells = {}
        # Scanline streaks behind the glyph, crawling a pixel per frame.
        for row, phase in ((6, 0), (8, 2), (10, 1)):
            for x in range(1, gx - 2):
                if (x + i * 2 + phase) % 6 < 3:
                    trail[(x, row)] = "g" if x > gx // 2 else "G"
        bit = "1" if i % 2 == 0 else "0"
        bx = gx - 6 - (i % 2)
        bit_core = {
            (bx + x, 4 + (i % 3) + y): "g" for y, row in enumerate(BITS[bit]) for x, k in enumerate(row) if k == "#"
        }
        trail.update(bit_core)
        frames.append(_render(28, 14, [(trail, CODE), (glyph_cells, CODE)], outline=True))
    return frames


def _burst(radius: float, rays: int, phase: float, key: str) -> Cells:
    cells: Cells = {}
    for k in range(rays):
        a = phase + k * 2 * math.pi / rays
        for r in range(1, int(radius) + 1):
            cells[(int(round(16 + math.cos(a) * r)), int(round(16 + math.sin(a) * r)))] = key
    return cells


def code_impact() -> List[Image.Image]:
    """32x32, origin (16, 16): white-hot star, a green shock ring, then bits scattering and blinking out."""
    frames: List[Image.Image] = []
    # 0: white flash core with short rays
    core = {p: "w" for p in disc(16, 16, 4.2)}
    core.update(_burst(7, 8, 0.0, "w"))
    frames.append(_render(32, 32, [(core, CODE)]))
    # 1: green star, white heart
    star = {p: "g" for p in disc(16, 16, 5.2)}
    star.update({p: "w" for p in disc(16, 16, 3.0)})
    star.update(_burst(10, 8, math.pi / 8, "g"))
    frames.append(_render(32, 32, [(star, CODE)]))
    # 2..5: ring expands and breaks into bits that fly out
    for i, (r, keep) in enumerate(((8.5, 1.0), (11.0, 0.7), (13.0, 0.45), (14.5, 0.25))):
        ring: Cells = {}
        for k in range(24):
            a = k * 2 * math.pi / 24 + i * 0.13
            if (k * 7 + i * 3) % 10 < keep * 10:
                ring[(int(round(16 + math.cos(a) * r)), int(round(16 + math.sin(a) * r)))] = "g" if k % 3 else "h"
        bits: Cells = {}
        for k, (dx, dy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1), (0, -1.3), (0, 1.3))):
            if (k + i) % 4 == 3 and i > 1:
                continue
            d = 5 + i * 3
            bx, by = int(16 + dx * d), int(16 + dy * d)
            for (x, y) in ((0, 0), (0, 1), (0, 2)) if k % 2 else ((0, 0), (1, 0), (0, 1), (1, 1)):
                bits[(bx + x, by + y)] = "w" if i < 2 else "g"
        frames.append(_render(32, 32, [(ring, CODE), (bits, CODE)], outline=i < 2))
    return frames


def code_muzzle() -> List[Image.Image]:
    """16x16, origin (2, 8): the keystroke spark at the board's far end."""
    frames: List[Image.Image] = []
    shapes = (
        (("w", 3.2), 6, "w"),
        (("g", 2.6), 7, "g"),
        (("G", 1.4), 4, "G"),
    )
    for (key, r), rays, ray_key in shapes:
        cells = {(x - 12 + 2, y - 16 + 8): key for (x, y) in disc(16, 16, r)}
        for (x, y), k in _burst(rays, 6, 0.3, ray_key).items():
            cells[(x - 12 + 2, y - 16 + 8)] = k
        cells = {p: k for p, k in cells.items() if 0 <= p[0] < 16 and 0 <= p[1] < 16}
        frames.append(_render(16, 16, [(cells, CODE)]))
    return frames


# ── Artsy: paint globs ──────────────────────────────────────────────────────
PAINTS: Mapping[str, Tuple[str, str, str]] = {
    # (light, base, shadow): the three paints Artsy cycles through.
    "pink": ("#ffb3dc", "#ff4fa3", "#b5146a"),
    "cyan": ("#b8f4ff", "#3fd8ff", "#127aa6"),
    "yellow": ("#fff3b0", "#ffd84a", "#c48a12"),
}


def _paint_palette(paint: str) -> Dict[str, str]:
    light, base, shadow = PAINTS[paint]
    return {"b": base, "l": light, "d": shadow, "w": FLASH}


def _blob(cx: float, cy: float, rx: float, ry: float) -> Cells:
    cells: Cells = {}
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if nx * nx + ny * ny <= 1.0:
                # shade: lit top-left, shadow bottom-right
                k = "l" if nx + ny < -0.7 else ("d" if nx + ny > 0.75 else "b")
                cells[(x, y)] = k
    return cells


def paint_projectile(paint: str) -> List[Image.Image]:
    """16x16, origin (8, 8): a wobbling glob, squashing and stretching, a drip trailing behind."""
    frames: List[Image.Image] = []
    shapes = ((3.4, 3.4, 0), (4.2, 2.8, 1), (3.4, 3.4, 2), (2.9, 4.0, 3))
    for rx, ry, i in shapes:
        cells = _blob(8.5, 8.0, rx, ry)
        # specular highlight
        cells[(int(8.5 - rx * 0.4), int(8 - ry * 0.45))] = "w"
        # trailing drip: two droplets behind the glob, drifting
        drips = {(3 - (i % 2), 9 + (i % 2)): "b", (1, 7 + (i // 2)): "d"}
        frames.append(_render(16, 16, [(drips, _paint_palette(paint)), (cells, _paint_palette(paint))]))
    return frames


def paint_impact(paint: str) -> List[Image.Image]:
    """32x32, origin (16, 16): a white slap, a splash crown with flying drops, then drips sliding off."""
    pal = _paint_palette(paint)
    frames: List[Image.Image] = []
    # 0: white-hot slap
    frames.append(_render(32, 32, [({p: "w" for p in _blob(16, 16, 6, 4.5)}, pal)]))
    # 1: the splat: flattened body + crown spikes
    splat = _blob(16, 17, 7.5, 4)
    for k, (dx, dy) in enumerate(((-6, -5), (-2, -8), (3, -7), (7, -4), (-8, 1), (8, 2))):
        for p in line((16, 16), (16 + dx, 16 + dy)):
            splat[p] = "b" if k % 2 else "l"
    frames.append(_render(32, 32, [(splat, pal)]))
    # 2..5: drops fly out and fall, the splat shrinks into drips
    for i in range(4):
        body = _blob(16, 18 + i, 6.5 - i * 1.2, 3.2 - i * 0.6) if i < 3 else {}
        drops: Cells = {}
        for k, (vx, vy) in enumerate(((-1.0, -1.2), (-0.4, -1.5), (0.5, -1.4), (1.1, -1.0), (-1.3, -0.2), (1.3, 0.1))):
            t = 4 + i * 3
            x = 16 + vx * t
            y = 16 + vy * t + 0.35 * i * i * 1.5
            for p in disc(x, y, 1.6 - i * 0.25):
                drops[p] = "l" if k % 2 else "b"
        drips = {}
        if i >= 1:
            for x in (12, 17, 21):
                for y in range(20, 21 + i * 2):
                    drips[(x, y)] = "d"
        frames.append(_render(32, 32, [(drips, pal), (body, pal), (drops, pal)], outline=i < 3))
    return frames


def paint_muzzle() -> List[Image.Image]:
    """16x16, origin (2, 8): a spray of all three paints off the strings."""
    frames: List[Image.Image] = []
    mixed = {"p": PAINTS["pink"][1], "c": PAINTS["cyan"][1], "y": PAINTS["yellow"][1], "w": FLASH}
    for i in range(3):
        cells: Cells = {}
        for k, (key, a) in enumerate((("w", 0.0), ("p", -0.5), ("c", 0.45), ("y", -0.95), ("p", 0.9))):
            r = 3 + i * 3 + (k % 2)
            for p in disc(2 + math.cos(a) * r, 8 + math.sin(a) * r, 1.8 - i * 0.4):
                cells[p] = key if not (i == 0 and k == 0) else "w"
        frames.append(_render(16, 16, [(cells, mixed)], outline=i < 2))
    return frames


# ── Strategy: sticky notes ──────────────────────────────────────────────────
NOTE = {"y": P.STICKY.light, "Y": P.STICKY.hi, "o": P.STICKY.mid, "d": P.STICKY.shadow, "i": "#3a3f8f", "w": FLASH}

# A square note face-on with two lines of scribble, then turning edge-on and back: a shuriken spin.
_NOTE_SPIN = (
    (
        "YYYYYYy",
        "Yyyyyyy",
        "yiiiyyy",
        "yyyyyyo",
        "yiiyyyo",
        "yyyyyoo",
        "yyyyood",
    ),
    (
        "...Yy..",
        "..YYyy.",
        ".Yyiyyo",
        "Yyyyyyd",
        ".yiyyo.",
        "..yod..",
        "...d...",
    ),
    (
        "..YY...",
        "..Yy...",
        "..yy...",
        "..yo...",
        "..yo...",
        "..yo...",
        "..od...",
    ),
    (
        "...Yy..",
        "..yyyo.",
        ".yyyiyd",
        "Yyyyyyd",
        ".yyiyo.",
        "..yod..",
        "...d...",
    ),
)


def note_projectile() -> List[Image.Image]:
    """16x16, origin (8, 8): the note spins like a shuriken, two pale speed lines streaming behind it."""
    frames: List[Image.Image] = []
    for i, rows in enumerate(_NOTE_SPIN):
        cells: Cells = {}
        _stamp(cells, rows, (6, 4))
        note = _render(16, 16, [(cells, NOTE)], outline=True)
        lines: Cells = {}
        for x in range(0, 4 - (i % 2)):
            lines[(x + (i % 2), 6 + (i % 2))] = "Y"
            lines[(x + 1 - (i % 2), 10 - (i % 2))] = "y"
        trail = _render(16, 16, [(lines, NOTE)], outline=False)
        trail.alpha_composite(note)
        frames.append(trail)
    return frames


def note_impact() -> List[Image.Image]:
    """24x24, origin (12, 12): the note slaps flat, flashes, and bursts into confetti."""
    frames: List[Image.Image] = []
    slap: Cells = {}
    _stamp(slap, _NOTE_SPIN[0], (8, 8), {"Y": "w", "y": "w", "o": "w", "i": "w", "d": "w"})
    frames.append(_render(24, 24, [(slap, NOTE)]))
    big: Cells = {}
    for y in range(6, 18):
        for x in range(7, 18):
            big[(x, y)] = "Y" if y < 8 else ("o" if x > 15 or y > 15 else "y")
    for x in range(9, 15):
        big[(x, 10)] = "i"
        if x < 13:
            big[(x, 13)] = "i"
    frames.append(_render(24, 24, [(big, NOTE)]))
    for i in range(3):
        bits: Cells = {}
        for k, (dx, dy) in enumerate(((-1, -1), (1, -1.2), (1.2, 0.6), (-1.1, 0.8), (0.2, -1.4), (-0.3, 1.3))):
            d = 4 + i * 3
            bx, by = int(12 + dx * d), int(12 + dy * d + i * i * 0.6)
            shape = ((0, 0), (1, 0), (0, 1), (1, 1)) if (k + i) % 2 else ((0, 0), (1, 1))
            for sx, sy in shape:
                bits[(bx + sx, by + sy)] = "Y" if k % 2 else "y"
        frames.append(_render(24, 24, [(bits, NOTE)], outline=i < 2))
    return frames


def note_muzzle() -> List[Image.Image]:
    """16x16, origin (2, 8): the flick, a quick white swoosh off the fingers."""
    frames: List[Image.Image] = []
    for i in range(3):
        cells: Cells = {}
        for k in range(6 - i * 2):
            x = 1 + k * 2 + i * 2
            for y in (7, 8) if k < 3 else (8,):
                cells[(x, y + (1 if k > 3 else 0))] = "w" if i == 0 else "Y"
        frames.append(_render(16, 16, [(cells, NOTE)], outline=i < 2))
    return frames


# ── Sheets ──────────────────────────────────────────────────────────────────


def _sheet(frame: Tuple[int, int], origin: Tuple[int, int], anims: Iterable[SheetAnim]) -> Sheet:
    return Sheet(frame[0], frame[1], origin, list(anims))


def _pad(frames: Sequence[Image.Image], size: Tuple[int, int], at: Tuple[int, int]) -> List[Image.Image]:
    out = []
    for frame in frames:
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        canvas.alpha_composite(frame, at)
        out.append(canvas)
    return out


def attack_sheet(hero: str) -> Sheet:
    """One strip per hero. Every cell is 32x32 with the origin at its centre, so variants line up."""
    cell = (32, 32)
    centre = (16, 16)
    builders: Dict[str, Callable[[], List[SheetAnim]]] = {
        "hackerman": lambda: [
            SheetAnim("projectile", 15, True, _pad(code_projectile("</>"), cell, (2, 9))),
            SheetAnim("impact", 20, False, code_impact()),
            SheetAnim("muzzle", 20, False, _pad(code_muzzle(), cell, (14, 8))),
            SheetAnim("projectile-braces", 15, True, _pad(code_projectile("{}"), cell, (2, 9))),
            SheetAnim("projectile-arrow", 15, True, _pad(code_projectile("=>"), cell, (2, 9))),
            SheetAnim("projectile-semicolon", 15, True, _pad(code_projectile(";"), cell, (2, 9))),
        ],
        "artsy": lambda: [
            SheetAnim("projectile", 12, True, _pad(paint_projectile("pink"), cell, (8, 8))),
            SheetAnim("impact", 16, False, paint_impact("pink")),
            SheetAnim("muzzle", 16, False, _pad(paint_muzzle(), cell, (14, 8))),
            SheetAnim("projectile-cyan", 12, True, _pad(paint_projectile("cyan"), cell, (8, 8))),
            SheetAnim("impact-cyan", 16, False, paint_impact("cyan")),
            SheetAnim("projectile-yellow", 12, True, _pad(paint_projectile("yellow"), cell, (8, 8))),
            SheetAnim("impact-yellow", 16, False, paint_impact("yellow")),
        ],
        "strategy": lambda: [
            SheetAnim("projectile", 18, True, _pad(note_projectile(), cell, (8, 8))),
            SheetAnim("impact", 18, False, _pad(note_impact(), cell, (4, 4))),
            SheetAnim("muzzle", 20, False, _pad(note_muzzle(), cell, (14, 8))),
        ],
    }
    return _sheet(cell, centre, builders[hero]())
