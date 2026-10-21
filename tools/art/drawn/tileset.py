"""The tileset grid shared by every level.

Both levels use the same names at the same grid cells, so level maps can be
written once against names and the engine never hard-codes coordinates.
"""

from __future__ import annotations

from typing import Callable, Dict, List, Mapping, Optional, Tuple

from PIL import Image

from arttools.canvas import Canvas

TILE = 16

# Rows top to bottom. ``*_left``/``*_right`` are the end caps of a run;
# ``pit_edge_left`` is the last ground tile on the LEFT side of a pit (its
# right side drops away) and ``pit_edge_right`` the first one after it.
GRID: List[List[Optional[str]]] = [
    ["ground_top_left", "ground_top", "ground_top_alt", "ground_top_right",
     "platform_left", "platform_mid", "platform_right", "block_highlight"],
    ["ground_fill_left", "ground_fill", "ground_fill_alt", "ground_fill_right",
     "pit_edge_left", "pit_edge_right", "pit_top", "block_highlight_shine"],
    ["ground_base_left", "ground_base", "ground_base_alt", "ground_base_right",
     "platform_support", "platform_mid_alt", "pit_fill", "block_used"],
]

TileDrawer = Callable[[Canvas], None]


def tile_positions() -> Dict[str, Tuple[int, int]]:
    """Map tile name to ``[col, row]`` in the grid."""
    return {name: (col, row) for row, names in enumerate(GRID) for col, name in enumerate(names) if name}


def assemble(drawers: Mapping[str, TileDrawer], palette: Mapping[str, str]) -> Image.Image:
    missing = set(tile_positions()) - set(drawers)
    if missing:
        raise ValueError(f"no drawer for tiles: {sorted(missing)}")
    sheet = Canvas(TILE * len(GRID[0]), TILE * len(GRID), palette)
    for name, (col, row) in tile_positions().items():
        tile = Canvas(TILE, TILE, palette)
        drawers[name](tile)
        sheet.paste(tile, col * TILE, row * TILE)
    return sheet.image
