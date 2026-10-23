#!/usr/bin/env python3
"""Composite a level's layers the way the game will, for visual review.

  preview.py luna                       # -> tools/art/.preview/luna.png
  preview.py scripe --x 0,900,1800 --scale 3 -o /tmp/scripe.png
  preview.py luna --tiles               # tileset grid plus tiled runs
  preview.py luna --seams               # each repeating layer around its wrap point

Each frame draws, back to front: non-foreground layers by their parallax
factor, a demo play plane built from the tileset (ground, a pit, platforms,
highlight blocks) with the level's props, then foreground layers. Frames are
scaled with nearest neighbour so every native pixel stays a crisp square.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
TILE = 16

# A tiny repeating demo stage (in tiles). Period 60 tiles = 960 px.
DEMO_PERIOD = 60
DEMO_PIT = range(30, 33)
DEMO_PLATFORM = (12, 16, 9)  # first col, last col, row (y = row * 16)
DEMO_BLOCKS = ((20, 8), (21, 8), (22, 8))


class Level:
    def __init__(self, level_id: str) -> None:
        self.dir = REPO / "src" / "game" / "levels" / level_id / "art"
        self.manifest: Dict[str, Any] = json.loads((self.dir / "layers.json").read_text())
        self.width, self.height = self.manifest["nativeSize"]
        self.ground_y: int = self.manifest["groundY"]
        self.images = {layer["id"]: self._load(layer["file"]) for layer in self.manifest["layers"]}
        self.tileset = self._load(self.manifest["tileset"]["file"])
        self.tiles: Mapping[str, Sequence[int]] = self.manifest["tileset"]["tiles"]
        self.props = {name: (self._load(p["file"]), p) for name, p in self.manifest["props"].items()}

    def _load(self, name: str) -> Image.Image:
        with Image.open(self.dir / name) as image:
            return image.convert("RGBA")

    def tile(self, name: str) -> Image.Image:
        col, row = self.tiles[name]
        return self.tileset.crop((col * TILE, row * TILE, col * TILE + TILE, row * TILE + TILE))

    def prop_frame(self, name: str, frame: int = 0) -> Image.Image:
        image, meta = self.props[name]
        w = meta["w"]
        return image.crop((frame * w, 0, frame * w + w, meta["h"]))


def draw_layer(frame: Image.Image, image: Image.Image, layer: Mapping[str, Any], camera_x: int) -> None:
    offset = -round(camera_x * layer["factor"])
    y = layer["y"]
    if layer["repeatX"]:
        start = offset % image.width - image.width
        for x in range(start, frame.width, image.width):
            _composite_clipped(frame, image, x, y)
    else:
        _composite_clipped(frame, image, offset, y)


def _composite_clipped(frame: Image.Image, image: Image.Image, x: int, y: int) -> None:
    # alpha_composite rejects negative destinations; crop the source instead.
    sx, sy = max(0, -x), max(0, -y)
    if sx >= image.width or sy >= image.height:
        return
    frame.alpha_composite(image.crop((sx, sy, image.width, image.height)), (max(0, x), max(0, y)))


def ground_column(col: int) -> List[str]:
    """Tile names from the ground line down for world column ``col``."""
    c = col % DEMO_PERIOD
    if c in DEMO_PIT:
        return ["pit_top", "pit_fill", "pit_fill"]
    alt = "_alt" if c % 2 else ""
    if c == DEMO_PIT.start - 1:
        return ["pit_edge_left", "ground_fill_right", "ground_base_right"]
    if c == DEMO_PIT.stop:
        return ["pit_edge_right", "ground_fill_left", "ground_base_left"]
    return [f"ground_top{alt}", f"ground_fill{alt}", f"ground_base{alt}"]


def draw_play_plane(frame: Image.Image, level: Level, camera_x: int) -> None:
    first = math.floor(camera_x / TILE)
    for col in range(first, first + level.width // TILE + 2):
        x = col * TILE - camera_x
        for i, name in enumerate(ground_column(col)):
            _composite_clipped(frame, level.tile(name), x, level.ground_y + i * TILE)
        c = col % DEMO_PERIOD
        p_first, p_last, p_row = DEMO_PLATFORM
        if p_first <= c <= p_last:
            name = "platform_left" if c == p_first else "platform_right" if c == p_last else ("platform_mid_alt" if c % 3 == 0 else "platform_mid")
            _composite_clipped(frame, level.tile(name), x, p_row * TILE)
            if c in (p_first, p_last):
                for row in range(p_row + 1, level.ground_y // TILE):
                    _composite_clipped(frame, level.tile("platform_support"), x, row * TILE)
        for b_col, b_row in DEMO_BLOCKS:
            if c == b_col:
                name = "block_used" if b_col == DEMO_BLOCKS[0][0] else "block_highlight_shine" if b_col == DEMO_BLOCKS[2][0] else "block_highlight"
                _composite_clipped(frame, level.tile(name), x, b_row * TILE)
    # Props spread along the demo period, standing on the ground line.
    names = list(level.props)
    for period_start in (math.floor(camera_x / (DEMO_PERIOD * TILE)) + k for k in (0, 1)):
        for i, name in enumerate(names):
            for frame_index in range(level.props[name][1]["frames"]):
                image = level.prop_frame(name, frame_index)
                world_x = period_start * DEMO_PERIOD * TILE + 560 + i * 170 + frame_index * (image.width + 8)
                _composite_clipped(frame, image, world_x - camera_x, level.ground_y - image.height)


def render(level: Level, camera_x: int) -> Image.Image:
    frame = Image.new("RGBA", (level.width, level.height), (0, 0, 0, 255))
    layers = level.manifest["layers"]
    for layer in (l for l in layers if not l["foreground"]):
        draw_layer(frame, level.images[layer["id"]], layer, camera_x)
    draw_play_plane(frame, level, camera_x)
    for layer in (l for l in layers if l["foreground"]):
        draw_layer(frame, level.images[layer["id"]], layer, camera_x)
    return frame


def contact_sheet(frames: Sequence[Tuple[str, Image.Image]], scale: int, columns: int) -> Image.Image:
    w, h = frames[0][1].width * scale, frames[0][1].height * scale
    label_h = 14
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGB", (columns * (w + 8) + 8, rows * (h + label_h + 8) + 8), (24, 24, 28))
    draw = ImageDraw.Draw(sheet)
    for i, (label, frame) in enumerate(frames):
        x = 8 + (i % columns) * (w + 8)
        y = 8 + (i // columns) * (h + label_h + 8)
        draw.text((x, y), label, fill=(220, 220, 220))
        sheet.paste(frame.convert("RGB").resize((w, h), Image.Resampling.NEAREST), (x, y + label_h))
    return sheet


def tiles_sheet(level: Level, scale: int) -> Image.Image:
    """The tileset with a grid and labels, plus each ground/platform run tiled
    3x so seams and edge caps can be checked at a glance."""
    ts = level.tileset
    grid = Image.new("RGBA", ts.size, (60, 70, 60, 255))
    grid.alpha_composite(ts)
    big = grid.resize((ts.width * scale, ts.height * scale), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(big)
    for name, (col, row) in level.tiles.items():
        draw.rectangle((col * TILE * scale, row * TILE * scale, (col + 1) * TILE * scale - 1, (row + 1) * TILE * scale - 1), outline=(255, 255, 255))
        draw.text((col * TILE * scale + 2, row * TILE * scale + 1), name.replace("ground_", "g_").replace("platform_", "p_").replace("block_", "b_"), fill=(255, 255, 255))
    runs = [
        ["ground_top_left", "ground_top", "ground_top_alt", "ground_top", "pit_edge_left", "pit_top", "pit_top", "pit_edge_right", "ground_top_alt", "ground_top_right"],
        ["ground_fill_left", "ground_fill", "ground_fill_alt", "ground_fill", "ground_fill_right", "pit_fill", "pit_fill", "ground_fill_left", "ground_fill_alt", "ground_fill_right"],
        ["ground_base_left", "ground_base", "ground_base_alt", "ground_base", "ground_base_right", "pit_fill", "pit_fill", "ground_base_left", "ground_base_alt", "ground_base_right"],
        ["ground_base_left", "ground_base", "ground_base_alt", "ground_base", "ground_base_right", "pit_fill", "pit_fill", "ground_base_left", "ground_base_alt", "ground_base_right"],
        [None] * 10,
        ["platform_left", "platform_mid", "platform_mid_alt", "platform_mid", "platform_right", None, "block_used", "block_highlight", "block_highlight_shine", None],
        [None, "platform_support", None, None, None, None, None, None, None, None],
    ]
    strip = Image.new("RGBA", (10 * TILE, len(runs) * TILE), (60, 70, 60, 255))
    for r, names in enumerate(runs):
        for c, name in enumerate(names):
            if name:
                strip.alpha_composite(level.tile(name), (c * TILE, r * TILE))
    strip_big = strip.resize((strip.width * scale, strip.height * scale), Image.Resampling.NEAREST)
    out = Image.new("RGB", (max(big.width, strip_big.width) + 16, big.height + strip_big.height + 24), (24, 24, 28))
    out.paste(big.convert("RGB"), (8, 8))
    out.paste(strip_big.convert("RGB"), (8, big.height + 16))
    return out


def seams_sheet(level: Level, scale: int, half_window: int = 64) -> Image.Image:
    """Each repeating layer drawn twice side by side, cropped around the wrap
    point, so a seam would show up dead centre."""
    crops: List[Tuple[str, Image.Image]] = []
    for layer in level.manifest["layers"]:
        if not layer["repeatX"]:
            continue
        image = level.images[layer["id"]]
        doubled = Image.new("RGBA", (image.width * 2, image.height), (40, 44, 60, 255))
        doubled.alpha_composite(image, (0, 0))
        doubled.alpha_composite(image, (image.width, 0))
        crops.append((f"{layer['id']} seam at x={image.width}", doubled.crop((image.width - half_window, 0, image.width + half_window, image.height))))
    width = max(c.width for _, c in crops) * scale
    height = sum(c.height * scale + 22 for _, c in crops)
    out = Image.new("RGB", (width + 16, height + 8), (24, 24, 28))
    draw = ImageDraw.Draw(out)
    y = 8
    for label, crop in crops:
        draw.text((8, y), label, fill=(220, 220, 220))
        big = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.NEAREST)
        out.paste(big.convert("RGB"), (8, y + 14))
        draw.line((8 + big.width // 2, y + 12, 8 + big.width // 2, y + 14), fill=(255, 0, 0))
        y += big.height + 22
    return out


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("level")
    parser.add_argument("--x", default="0,700,1500,2300,3100,3520", help="camera x positions in native pixels")
    parser.add_argument("--scale", type=int, default=3)
    parser.add_argument("--columns", type=int, default=2)
    parser.add_argument("--tiles", action="store_true", help="render the tileset review sheet instead")
    parser.add_argument("--seams", action="store_true", help="render the repeat-seam review sheet instead")
    parser.add_argument("-o", "--out", type=Path)
    args = parser.parse_args(argv)
    level = Level(args.level)
    out_dir = HERE / ".preview"
    if args.seams:
        image = seams_sheet(level, args.scale)
        out = args.out or out_dir / f"{args.level}-seams.png"
    elif args.tiles:
        image = tiles_sheet(level, max(args.scale, 4))
        out = args.out or out_dir / f"{args.level}-tiles.png"
    else:
        xs = [int(v) for v in args.x.split(",")]
        image = contact_sheet([(f"{args.level} x={x}", render(level, x)) for x in xs], args.scale, args.columns)
        out = args.out or out_dir / f"{args.level}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
