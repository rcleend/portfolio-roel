"""Packs rendered frames into the look sheet format (docs: ASSETS.md).

One row per animation in the order given, frames left to right, unused
cells transparent. Alpha is strictly 0 or 255 and every colour comes from
the character's material ramps, so the PNG is palette-limited by
construction. The JSON carries frame size, origin and per-animation fps,
loop, frame count and optional named anchors.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image

Anchor = Tuple[int, int]


@dataclass
class Strip:
    name: str
    fps: float
    loop: bool
    frames: List[Image.Image]
    anchors: Dict[str, List[Anchor]] = field(default_factory=dict)


def pack(strips: Sequence[Strip], frame_w: int, frame_h: int, origin: Tuple[int, int]) -> Tuple[Image.Image, dict]:
    cols = max(len(s.frames) for s in strips)
    sheet = Image.new("RGBA", (frame_w * cols, frame_h * len(strips)), (0, 0, 0, 0))
    meta: dict = {
        "frame": {"w": frame_w, "h": frame_h},
        "origin": {"x": origin[0], "y": origin[1]},
        "animations": [],
    }
    for row, strip in enumerate(strips):
        for col, image in enumerate(strip.frames):
            if image.size != (frame_w, frame_h):
                raise ValueError(f"{strip.name}[{col}] is {image.size}, expected {(frame_w, frame_h)}")
            sheet.paste(binary_alpha(image), (col * frame_w, row * frame_h))
        entry: dict = {"name": strip.name, "fps": _number(strip.fps), "loop": strip.loop, "frames": len(strip.frames)}
        if strip.anchors:
            for name, points in strip.anchors.items():
                if len(points) != len(strip.frames):
                    raise ValueError(f"{strip.name}: anchor {name!r} has {len(points)} points for {len(strip.frames)} frames")
            entry["anchors"] = {name: [[int(x), int(y)] for x, y in pts] for name, pts in strip.anchors.items()}
        meta["animations"].append(entry)
    return sheet, meta


def binary_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    out = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    src = rgba.load()
    dst = out.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = src[x, y]
            if a >= 128:
                dst[x, y] = (r, g, b, 255)
    return out


def _number(v: float):
    return int(v) if float(v).is_integer() else round(float(v), 3)


def dumps(meta: dict) -> str:
    """JSON with two-space indents, but every [x, y] list of points on one line."""
    text = json.dumps(meta, indent=2)
    text = re.sub(r"\[\s*(-?\d+),\s*(-?\d+)\s*\]", r"[\1, \2]", text)
    text = re.sub(r"\[\s*((?:\[-?\d+, -?\d+\],?\s*)+)\]",
                  lambda m: "[" + ", ".join(re.findall(r"\[-?\d+, -?\d+\]", m.group(1))) + "]", text)
    text = re.sub(r'\{\s*"(w|x)": (-?\d+),\s*"(h|y)": (-?\d+)\s*\}', r'{ "\1": \2, "\3": \4 }', text)
    return text + "\n"


def write(directory: Path, stem: str, sheet: Image.Image, meta: dict) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    sheet.save(directory / f"{stem}.png", optimize=True)
    (directory / f"{stem}.json").write_text(dumps(meta))
