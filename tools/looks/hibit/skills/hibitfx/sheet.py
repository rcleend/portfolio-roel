"""Packs animations into the looks sheet format (docs: .context ASSETS.md).

One row per animation, frames left to right, unused cells transparent; the
JSON names each row in order. JSON is printed the way Biome formats it, so
``pnpm lint`` accepts the generated files byte for byte.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

from PIL import Image

from .pix import Canvas

LINE_WIDTH = 120
# The contract asks for "a few dozen colours per sheet at most".
MAX_SHEET_COLORS = 48


@dataclass
class Anim:
    name: str
    fps: int
    loop: bool
    frames: List[Canvas]
    anchors: Dict[str, List[Tuple[int, int]]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.frames:
            raise ValueError(f"animation {self.name!r} has no frames")
        for anchor, points in self.anchors.items():
            if len(points) != len(self.frames):
                raise ValueError(f"{self.name}.{anchor}: {len(points)} anchors for {len(self.frames)} frames")


@dataclass
class Sheet:
    """A PNG + JSON pair: equal-sized frames and an origin shared by every animation."""

    name: str
    frame: Tuple[int, int]
    origin: Tuple[int, int]
    anims: List[Anim]

    def validate(self) -> None:
        w, h = self.frame
        names = [a.name for a in self.anims]
        if len(set(names)) != len(names):
            raise ValueError(f"{self.name}: duplicate animation names {names}")
        for anim in self.anims:
            for i, frame in enumerate(anim.frames):
                if (frame.w, frame.h) != (w, h):
                    raise ValueError(f"{self.name}/{anim.name}[{i}] is {frame.w}x{frame.h}, expected {w}x{h}")
                if frame.bbox() is None:
                    # An empty frame is either wasted time or a blink of nothing: end the animation instead.
                    raise ValueError(f"{self.name}/{anim.name}[{i}] is empty")
        colors = set()
        for anim in self.anims:
            for frame in anim.frames:
                colors |= frame.colors()
        if len(colors) > MAX_SHEET_COLORS:
            raise ValueError(f"{self.name}: {len(colors)} colours, the contract allows a few dozen")

    def image(self) -> Image.Image:
        self.validate()
        w, h = self.frame
        columns = max(len(a.frames) for a in self.anims)
        sheet = Image.new("RGBA", (w * columns, h * len(self.anims)), (0, 0, 0, 0))
        for row, anim in enumerate(self.anims):
            for col, frame in enumerate(anim.frames):
                sheet.paste(frame.to_image(), (col * w, row * h))
        return sheet

    def manifest(self) -> Dict[str, Any]:
        animations: List[Dict[str, Any]] = []
        for anim in self.anims:
            entry: Dict[str, Any] = {"name": anim.name, "fps": anim.fps, "loop": anim.loop, "frames": len(anim.frames)}
            if anim.anchors:
                entry["anchors"] = {k: [list(p) for p in v] for k, v in anim.anchors.items()}
            animations.append(entry)
        return {
            "frame": {"w": self.frame[0], "h": self.frame[1]},
            "origin": {"x": self.origin[0], "y": self.origin[1]},
            "animations": animations,
        }

    def colors(self) -> List[str]:
        found = set()
        for anim in self.anims:
            for frame in anim.frames:
                found |= frame.colors()
        return sorted(found)

    def write(self, directory: Path) -> Tuple[Path, Path]:
        directory.mkdir(parents=True, exist_ok=True)
        png = directory / f"{self.name}.png"
        manifest = directory / f"{self.name}.json"
        # optimize=False and no metadata keep the bytes identical run to run.
        self.image().save(png, format="PNG", optimize=False)
        manifest.write_text(dump_json(self.manifest()))
        return png, manifest


def dump_json(data: Any) -> str:
    """JSON as Biome prints it: two-space indent, containers inline whenever they fit 120 columns.

    The top-level object is always expanded (Biome keeps an expanded object
    expanded); arrays collapse onto one line whenever they fit, as Biome does.
    """
    return _format(data, 0, force_expand=True) + "\n"


def _inline(value: Any) -> str:
    if isinstance(value, dict):
        if not value:
            return "{}"
        return "{ " + ", ".join(f"{json.dumps(k)}: {_inline(v)}" for k, v in value.items()) + " }"
    if isinstance(value, list):
        return "[" + ", ".join(_inline(v) for v in value) + "]"
    return json.dumps(value)


def _format(value: Any, indent: int, prefix_width: int = 0, force_expand: bool = False) -> str:
    flat = _inline(value)
    if not force_expand and (not isinstance(value, (dict, list)) or indent + prefix_width + len(flat) <= LINE_WIDTH):
        return flat
    pad = " " * (indent + 2)
    if isinstance(value, dict):
        items = []
        for k, v in value.items():
            key = f"{json.dumps(k)}: "
            items.append(pad + key + _format(v, indent + 2, len(key)))
        return "{\n" + ",\n".join(items) + "\n" + " " * indent + "}"
    items = [pad + _format(v, indent + 2) for v in value]
    return "[\n" + ",\n".join(items) + "\n" + " " * indent + "]"

