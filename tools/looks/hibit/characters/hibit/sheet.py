"""Packs animations into the look-asset format (docs: .context/looks/ASSETS.md).

One row per animation in the JSON's order, frames left to right, `frame.w` x the largest
frame count wide; unused cells stay transparent. Alpha is strictly 0 or 255 and the
sheet is palette-limited; `validate` enforces both before anything is written.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image

from .canvas import Sprite, hex_to_rgba

#: "A few dozen colours per sheet at most" (ASSETS.md). Hero sheets carry three materials'
#: worth of hue-shifted ramps plus props, so the budget is four dozen.
MAX_COLOURS = 48


@dataclass
class Animation:
    name: str
    fps: int
    loop: bool
    frames: List[Sprite]
    anchors: Dict[str, List[Tuple[int, int]]] = field(default_factory=dict)


@dataclass
class Sheet:
    frame_w: int
    frame_h: int
    origin: Tuple[int, int]
    animations: List[Animation]

    def image(self) -> Image.Image:
        cols = max(len(a.frames) for a in self.animations)
        img = Image.new("RGBA", (self.frame_w * cols, self.frame_h * len(self.animations)), (0, 0, 0, 0))
        for row, anim in enumerate(self.animations):
            for col, frame in enumerate(anim.frames):
                if frame.width != self.frame_w or frame.height != self.frame_h:
                    raise ValueError(f"{anim.name}[{col}] is {frame.width}x{frame.height}, expected "
                                     f"{self.frame_w}x{self.frame_h}")
                img.alpha_composite(frame.to_image(), (col * self.frame_w, row * self.frame_h))
        return img

    def manifest(self) -> dict:
        animations = []
        for anim in self.animations:
            entry: dict = {"name": anim.name, "fps": anim.fps, "loop": anim.loop, "frames": len(anim.frames)}
            if anim.anchors:
                for name, points in anim.anchors.items():
                    if len(points) != len(anim.frames):
                        raise ValueError(f"anchor {name!r} of {anim.name!r} has {len(points)} points for "
                                         f"{len(anim.frames)} frames")
                entry["anchors"] = {name: [[int(x), int(y)] for x, y in points] for name, points in anim.anchors.items()}
            animations.append(entry)
        return {
            "frame": {"w": self.frame_w, "h": self.frame_h},
            "origin": {"x": self.origin[0], "y": self.origin[1]},
            "animations": animations,
        }


def colours(img: Image.Image) -> List[Tuple[int, int, int]]:
    found = img.getcolors(1 << 20) or []
    return sorted({(r, g, b) for _, (r, g, b, a) in found if a == 255})


def validate(img: Image.Image, max_colours: int = MAX_COLOURS) -> None:
    alphas = {a for _, (_, _, _, a) in (img.getcolors(1 << 20) or [])}
    if not alphas <= {0, 255}:
        raise ValueError(f"alpha must be 0 or 255, found {sorted(alphas)}")
    count = len(colours(img))
    if count > max_colours:
        raise ValueError(f"{count} colours, budget is {max_colours}")


def write(sheet: Sheet, directory: Path, stem: str = "sheet", max_colours: int = MAX_COLOURS) -> Tuple[Path, Path]:
    img = sheet.image()
    validate(img, max_colours)
    directory.mkdir(parents=True, exist_ok=True)
    png = directory / f"{stem}.png"
    js = directory / f"{stem}.json"
    # Deterministic bytes: no timestamps or text chunks, fixed compression.
    img.save(png, format="PNG", optimize=True)
    js.write_text(dumps(sheet.manifest()))
    return png, js


def dumps(manifest: dict) -> str:
    """JSON with two-space indents, but anchor point lists on one line, as in ASSETS.md."""
    text = json.dumps(manifest, indent=2)
    # [\n  x,\n  y\n] -> [x, y]
    text = re.sub(r"\[\s*(-?\d+),\s*(-?\d+)\s*\]", r"[\1, \2]", text)
    # a list of [x, y] points -> one line
    text = re.sub(r"\[\s*((?:\[-?\d+, -?\d+\],?\s*)+)\]",
                  lambda m: "[" + ", ".join(re.findall(r"\[-?\d+, -?\d+\]", m.group(1))) + "]", text)
    return text + "\n"


def unify_palette(frames: Sequence[Sprite], budget: int) -> List[Sprite]:
    """Merges the closest colour pairs (by perceptual distance, keeping the more used one)
    until the frames together use at most `budget` colours."""
    counts: Dict[str, int] = {}
    for frame in frames:
        for p in frame.pixels:
            if p:
                counts[p] = counts.get(p, 0) + 1
    mapping: Dict[str, str] = {c: c for c in counts}

    def rgb(c: str) -> Tuple[int, int, int]:
        r, g, b, _ = hex_to_rgba(c)
        return r, g, b

    def dist(a: str, b: str) -> float:
        (r1, g1, b1), (r2, g2, b2) = rgb(a), rgb(b)
        rm = (r1 + r2) / 2
        return ((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2) ** 0.5

    live = set(counts)
    while len(live) > budget:
        best: Optional[Tuple[float, str, str]] = None
        items = sorted(live)
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                d = dist(a, b)
                if best is None or d < best[0]:
                    best = (d, a, b)
        assert best is not None
        _, a, b = best
        keep, drop = (a, b) if counts[a] >= counts[b] else (b, a)
        counts[keep] += counts[drop]
        live.discard(drop)
        for k, v in mapping.items():
            if v == drop:
                mapping[k] = keep
    return [frame.recolored({k: v for k, v in mapping.items() if k != v}) for frame in frames]
