"""Packs frames into the look-asset format (ASSETS.md) and checks the result.

A strip is a PNG with one row per animation (frames left to right, unused
cells transparent) plus a JSON manifest:

    {"frame": {"w", "h"}, "origin": {"x", "y"},
     "animations": [{"name", "fps", "loop", "frames", "anchors"?}]}

The JSON is written in the exact shape Biome formats it (objects expanded,
arrays inline when they fit in 120 columns), so regenerated files never
churn under `pnpm lint`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Set, Tuple

from PIL import Image

from .grid import Grid

LINE_WIDTH = 120
#: The asset contract allows "a few dozen colours per sheet at most".
MAX_COLORS = 48


@dataclass
class Animation:
    name: str
    fps: float
    loop: bool
    frames: List[Grid]
    #: Named points per frame, in frame pixels (e.g. where a shot leaves the drone).
    anchors: Dict[str, List[Tuple[int, int]]] = field(default_factory=dict)


@dataclass
class Strip:
    """One `<name>.png` + `<name>.json` pair."""

    name: str
    frame_w: int
    frame_h: int
    origin: Tuple[int, int]
    animations: List[Animation]

    def problems(self) -> List[str]:
        """Contract violations; empty when the strip is valid."""
        found = []
        if not self.animations:
            found.append(f"{self.name}: no animations")
        names = [a.name for a in self.animations]
        if len(set(names)) != len(names):
            found.append(f"{self.name}: duplicate animation names {names}")
        for animation in self.animations:
            where = f"{self.name}/{animation.name}"
            if not animation.frames:
                found.append(f"{where}: no frames")
            if animation.fps <= 0:
                found.append(f"{where}: fps must be positive")
            for index, frame in enumerate(animation.frames):
                if (frame.width, frame.height) != (self.frame_w, self.frame_h):
                    found.append(
                        f"{where}[{index}]: frame is {frame.width}x{frame.height}, expected {self.frame_w}x{self.frame_h}"
                    )
            for anchor, points in animation.anchors.items():
                if len(points) != len(animation.frames):
                    found.append(
                        f"{where}: anchor {anchor!r} has {len(points)} points for {len(animation.frames)} frames"
                    )
        colors = self.colors()
        if len(colors) > MAX_COLORS:
            found.append(f"{self.name}: {len(colors)} colours, the budget is {MAX_COLORS}")
        return found

    def colors(self) -> Set[str]:
        found: Set[str] = set()
        for animation in self.animations:
            for frame in animation.frames:
                found |= frame.colors()
        return found

    def image(self) -> Image.Image:
        columns = max(len(a.frames) for a in self.animations)
        sheet = Image.new("RGBA", (self.frame_w * columns, self.frame_h * len(self.animations)), (0, 0, 0, 0))
        for row, animation in enumerate(self.animations):
            for column, frame in enumerate(animation.frames):
                sheet.alpha_composite(frame.to_image(), (column * self.frame_w, row * self.frame_h))
        return sheet

    def manifest(self) -> Dict[str, Any]:
        animations = []
        for animation in self.animations:
            entry: Dict[str, Any] = {
                "name": animation.name,
                "fps": animation.fps,
                "loop": animation.loop,
                "frames": len(animation.frames),
            }
            if animation.anchors:
                entry["anchors"] = {k: [list(p) for p in v] for k, v in animation.anchors.items()}
            animations.append(entry)
        return {
            "frame": {"w": self.frame_w, "h": self.frame_h},
            "origin": {"x": self.origin[0], "y": self.origin[1]},
            "animations": animations,
        }

    def write(self, directory: Path) -> Tuple[Path, Path]:
        problems = self.problems()
        if problems:
            raise ValueError("refusing to write an invalid strip:\n  " + "\n  ".join(problems))
        directory.mkdir(parents=True, exist_ok=True)
        png = directory / f"{self.name}.png"
        manifest = directory / f"{self.name}.json"
        # optimize=False keeps the bytes identical across Pillow runs, so rebuilds are byte-stable.
        self.image().save(png, format="PNG", optimize=False)
        manifest.write_text(format_json(self.manifest()) + "\n")
        return png, manifest


# ── Biome-compatible JSON ─────────────────────────────────────────────────


def format_json(value: Any, indent: int = 0) -> str:
    """JSON the way Biome formats it: objects expanded, arrays inline when they fit."""
    pad = " " * indent
    inner = " " * (indent + 2)
    if isinstance(value, dict):
        if not value:
            return "{}"
        items = [
            f"{inner}{json.dumps(k)}: {_inline_or_block(v, indent + 2, len(inner) + len(json.dumps(k)) + 2)}"
            for k, v in value.items()
        ]
        return "{\n" + ",\n".join(items) + "\n" + pad + "}"
    if isinstance(value, list):
        return _inline_or_block(value, indent, indent)
    return json.dumps(value)


def _inline_or_block(value: Any, indent: int, column: int) -> str:
    if isinstance(value, list):
        inline = _inline(value)
        # +1 leaves room for a trailing comma, which Biome counts against the line width.
        if inline is not None and column + len(inline) + 1 <= LINE_WIDTH:
            return inline
        inner = " " * (indent + 2)
        items = [inner + _inline_or_block(v, indent + 2, len(inner)) for v in value]
        return "[\n" + ",\n".join(items) + "\n" + " " * indent + "]"
    if isinstance(value, dict):
        return format_json(value, indent)
    return json.dumps(value)


def _inline(value: Any) -> Optional[str]:
    """The one-line form of an array, or None if it contains an object (always expanded)."""
    if isinstance(value, dict):
        return None
    if isinstance(value, list):
        parts = [_inline(v) for v in value]
        if any(p is None for p in parts):
            return None
        return "[" + ", ".join(p for p in parts if p is not None) + "]"
    return json.dumps(value)


# ── Reading back ──────────────────────────────────────────────────────────


def validate_files(png: Path, manifest: Path) -> List[str]:
    """Checks a written pair against the asset contract, independent of how it was made."""
    found = []
    data: Mapping[str, Any] = json.loads(manifest.read_text())
    frame = data["frame"]
    animations = data["animations"]
    with Image.open(png) as opened:
        mode = opened.mode
        image = opened.convert("RGBA")
    if mode != "RGBA":
        found.append(f"{png.name}: mode {mode}, expected RGBA")
    columns = max(a["frames"] for a in animations)
    expected = (frame["w"] * columns, frame["h"] * len(animations))
    if image.size != expected:
        found.append(f"{png.name}: size {image.size}, expected {expected}")
    alphas = {px[3] for px in image.getdata()}
    if not alphas <= {0, 255}:
        found.append(f"{png.name}: partial alpha values {sorted(alphas - {0, 255})[:5]}")
    for row, animation in enumerate(animations):
        for column in range(animation["frames"], columns):
            cell = image.crop(
                (column * frame["w"], row * frame["h"], (column + 1) * frame["w"], (row + 1) * frame["h"])
            )
            if any(px[3] for px in cell.getdata()):
                found.append(f"{png.name}: unused cell ({column}, {row}) of {animation['name']} is not transparent")
    colors = {px[:3] for px in image.getdata() if px[3]}
    if len(colors) > MAX_COLORS:
        found.append(f"{png.name}: {len(colors)} colours, the budget is {MAX_COLORS}")
    return found
