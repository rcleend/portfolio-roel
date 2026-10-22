"""Roel's likeness head kit: hand-placed pixels, reused pixel-identically in every frame.

One three-quarter view facing right, drawn once. The face (glasses, eyes, nose, mouth,
jaw) never changes between frames except where an expression patch says so, and the
hair moves only as a whole layer (lift, squash, sweep) so secondary motion never makes
the likeness wobble. Every hero shares this kit; Artsy wears it with the cap.

Likeness notes, in order of importance (from refs/roel-photo-*.jpg):
- hair: ash/dark blonde, swept up and back off the forehead with volume and a soft wave,
  a loose lock falling onto the forehead, short at the sides with the ear showing;
- glasses: large round panto frames, a heavy dark upper rim and lighter lower rims,
  the far lens narrower (three-quarter view) and its hinge poking past the cheek;
- a big warm toothy smile as the default expression; a long face with a defined jaw.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Tuple

from .canvas import Sprite

#: The head kit's palette. Hair follows CAST.md's ash-blonde ramp, warmed slightly so it
#: reads as hair (not grey) on the night levels.
PALETTE: Dict[str, str] = {
    # hair
    "K": "#36281e",
    "h": "#644e38",
    "H": "#947a58",
    "l": "#bea47a",
    "L": "#e0cca0",
    # skin (shared with the body ramp in ramps.py)
    "o": "#5a2a2e",
    "S": "#a65a56",
    "s": "#d8876f",
    "f": "#efb08e",
    "F": "#fcd3b0",
    # glasses: heavy upper rim, lighter lower rim, glint
    "G": "#1c1622",
    "g": "#5e5262",
    "w": "#ffffff",
    # eyes, mouth
    "e": "#2a1e2c",
    "t": "#fbf3ea",
    "m": "#5a1a22",
    "r": "#c0606a",
    # cap (washed charcoal; the same yarn family as ramps.cap and the knit)
    "k": "#160f1c",
    "c": "#2a2832",
    "C": "#3a3844",
    "d": "#5c5a64",
    "D": "#7e7c88",
}

WIDTH = 14
HEIGHT = 14
#: The pixel that sits on the top of the neck (the rig's head anchor).
PIVOT: Tuple[int, int] = (5, 13)
#: Centre of the mouth in kit pixels (the `mouth` anchor: where a potion meets his lips).
MOUTH: Tuple[int, int] = (7, 10)
#: First face row: rows above it belong to the hair mass, which moves as one layer.
FACE_TOP = 5

# 12 x 13 head (skull ~11 px: about 5.5 heads on the 60 px body). Row 0 is headroom for
# the hair's "lift" state; the last two columns hold the cap's brim.
_BASE = """
..............
......KKK.....
..KKKlLLlK....
.KhHlLlHHlhK..
KhHhHlhfhHlo..
KhhhhfFfhffo..
KhhfGGfffGfo..
KhGGFfGGGfGG..
Kofgfegfgego..
.osfggfsfgfo..
..osmttttmo...
...osfrrso....
....osFfo.....
.....ooo......
"""

# Which pixels belong to the hair layer (moved by lift/squash/sweep). Marked 'x'.
_HAIR_MASK = """
..............
......xxx.....
..xxxxxxxx....
.xxxxxxxxxxx..
xxxxxxx.xxx...
xxxxx...x.....
xxx...........
xx............
x.............
..............
..............
..............
..............
..............
"""

# Expression patches: (x, y, key) over the base. Coordinates are in kit pixels.
Patch = List[Tuple[int, int, str]]

_EXPRESSIONS: Dict[str, Patch] = {
    # The default: the big warm toothy smile already drawn in the base.
    "smile": [],
    # A relaxed closed-mouth smile: corners up, a soft line below.
    "neutral": [
        (4, 10, "m"), (5, 10, "f"), (6, 10, "f"), (7, 10, "f"), (8, 10, "f"), (9, 10, "m"),
        (5, 11, "m"), (6, 11, "m"), (7, 11, "m"), (8, 11, "s"),
    ],
    # Determined: brows knitted down onto the rims, mouth set in a tight half-grin.
    "focus": [
        (6, 6, "h"), (8, 6, "h"), (4, 5, "h"), (5, 5, "h"), (9, 5, "h"),
        (4, 10, "s"), (5, 10, "m"), (6, 10, "t"), (7, 10, "t"), (8, 10, "m"), (9, 10, "s"),
        (5, 11, "f"), (6, 11, "s"), (7, 11, "s"), (8, 11, "s"),
    ],
    # Hurt: eyes squeezed shut, teeth gritted in a wince.
    "hurt": [
        (4, 8, "m"), (5, 8, "m"), (5, 7, "m"), (9, 8, "m"), (9, 7, "s"),
        (6, 6, "h"), (8, 6, "h"),
        (4, 10, "m"), (5, 10, "t"), (6, 10, "m"), (7, 10, "t"), (8, 10, "m"), (9, 10, "m"),
        (5, 11, "m"), (6, 11, "s"), (7, 11, "m"), (8, 11, "s"),
    ],
    # Eyes closed (the blink of the idle).
    "blink": [(4, 8, "s"), (5, 8, "s"), (9, 8, "s")],
    # Victory shout: mouth wide open, teeth on top, tongue showing.
    "cheer": [
        (4, 10, "m"), (5, 10, "t"), (6, 10, "t"), (7, 10, "t"), (8, 10, "t"), (9, 10, "m"),
        (4, 11, "o"), (5, 11, "m"), (6, 11, "r"), (7, 11, "r"), (8, 11, "m"), (9, 11, "o"),
        (5, 12, "m"), (6, 12, "m"), (7, 12, "s"),
    ],
}

# The cap: a washed charcoal six-panel cap worn forward, brim pointing right over the
# glasses; the hair sticks out at the back and above the ear. Drawn over the base with
# the hair layer removed above the cap line.
_CAP = """
..............
...kkkkk......
.kkcCDDck.....
kcCCDDDCck....
kcCCCCCCcck...
hkcccccdDDDDk.
..............
..............
..............
..............
..............
..............
..............
..............
"""

# Below the cap: hair sticking out at the back and above the ear.
_CAP_HAIR = """
..............
..............
..............
..............
..............
..............
KhH...........
KhH...........
..............
..............
..............
..............
..............
..............
"""


def _rows(text: str) -> List[str]:
    rows = [row for row in text.strip("\n").split("\n")]
    assert len(rows) == HEIGHT, f"head kit grids are {HEIGHT} rows, got {len(rows)}"
    return [row.ljust(WIDTH, ".") for row in rows]


def _grid(text: str) -> List[List[str]]:
    return [list(row) for row in _rows(text)]


def _hair_mask() -> List[List[bool]]:
    return [[ch == "x" for ch in row] for row in _rows(_HAIR_MASK)]


def _shift_hair(grid: List[List[str]], dx: int, dy: int, mask: List[List[bool]]) -> List[List[str]]:
    """Moves the hair layer by (dx, dy); vacated hair pixels fall back to the face/skull."""
    out = [row[:] for row in grid]
    hair = [(x, y, grid[y][x]) for y in range(HEIGHT) for x in range(WIDTH) if mask[y][x] and grid[y][x] != "."]
    for x, y, _ in hair:
        if y >= FACE_TOP:
            # Keep the hair that frames the face in place: only the mass above it moves.
            continue
        out[y][x] = "."
    for x, y, ch in hair:
        if y >= FACE_TOP:
            continue
        nx, ny = x + dx, y + dy
        if 0 <= nx < WIDTH and 0 <= ny < FACE_TOP + 1:
            if ny >= FACE_TOP and out[ny][nx] not in (".",) and not mask[ny][nx]:
                continue
            out[ny][nx] = ch
    # Close the seam where the mass moved up: extend the bottom hair row upwards.
    if dy < 0:
        for x in range(WIDTH):
            if grid[FACE_TOP - 1][x] != "." and mask[FACE_TOP - 1][x] and out[FACE_TOP - 1][x] == ".":
                out[FACE_TOP - 1][x] = grid[FACE_TOP - 1][x]
    return out


def _apply(grid: List[List[str]], patch: Iterable[Tuple[int, int, str]]) -> None:
    for x, y, ch in patch:
        grid[y][x] = ch


HAIR_STATES = ("rest", "lift", "squash", "sweep")
EXPRESSIONS = tuple(_EXPRESSIONS)


def head(expression: str = "smile", hair: str = "rest", cap: bool = False, glint: bool = False) -> Sprite:
    """The likeness head for one frame."""
    grid = _grid(_BASE)
    mask = _hair_mask()
    if cap:
        pass
    elif hair == "lift":
        grid = _shift_hair(grid, 0, -1, mask)
    elif hair == "squash":
        grid = _squash(grid, mask)
    elif hair == "sweep":
        grid = _shift_hair(grid, -1, 0, mask)
    elif hair != "rest":
        raise ValueError(f"unknown hair state {hair!r}")
    if hair not in HAIR_STATES:
        raise ValueError(f"unknown hair state {hair!r}")
    _apply(grid, _EXPRESSIONS[expression])
    if glint:
        grid[7][4] = "w"
    if cap:
        _wear_cap(grid, mask, hair)
    text = "\n".join("".join(row) for row in grid)
    return Sprite.parse(text, PALETTE)


def _wear_cap(grid: List[List[str]], mask: List[List[bool]], hair: str) -> None:
    """Replaces the hair mass with the cap. The cap rides the hair states as one piece:
    it pops up a pixel on `lift` and the hair poking out behind it streams back on `sweep`."""
    cap_grid = _grid(_CAP)
    hair_grid = _grid(_CAP_HAIR)
    for y in range(FACE_TOP + 1):
        for x in range(WIDTH):
            if mask[y][x]:
                grid[y][x] = "."
    dy = -1 if hair == "lift" else 0
    dx_back = -1 if hair == "sweep" else 0
    for y in range(HEIGHT):
        for x in range(WIDTH):
            ch = hair_grid[y][x]
            if ch == ".":
                continue
            tx = x + (dx_back if ch in "KhH" else 0)
            if 0 <= tx < WIDTH:
                grid[y][tx] = ch
            if ch in "KhH" and dx_back and x == 0:
                grid[y][x] = ch
    for y in range(HEIGHT):
        for x in range(WIDTH):
            ch = cap_grid[y][x]
            if ch == "." or not (0 <= y + dy < HEIGHT):
                continue
            grid[y + dy][x] = ch


def _squash(grid: List[List[str]], mask: List[List[bool]]) -> List[List[str]]:
    """Landing: the hair mass drops one pixel onto the head (its top row disappears)."""
    out = [row[:] for row in grid]
    for y in range(FACE_TOP - 1, 0, -1):
        for x in range(WIDTH):
            if mask[y][x] and mask[y - 1][x] and grid[y - 1][x] != ".":
                out[y][x] = grid[y - 1][x]
    for x in range(WIDTH):
        if mask[1][x]:
            out[1][x] = "."
    return out


def kit_sheet() -> List[Tuple[str, Sprite]]:
    """Every head the kit can produce, for review."""
    out: List[Tuple[str, Sprite]] = []
    for cap in (False, True):
        for expression in EXPRESSIONS:
            out.append((f"{'cap ' if cap else ''}{expression}", head(expression, cap=cap)))
        for hair in HAIR_STATES[1:]:
            out.append((f"{'cap ' if cap else ''}{hair}", head("smile", hair, cap=cap)))
    out.append(("glint", head("smile", glint=True)))
    return out


def colours_used() -> Optional[int]:
    return len(PALETTE)
