"""Packs rendered frames into the look-asset format (ASSETS.md) and validates it.

One row per animation in `animations` order, frames left to right, image
width = frame width x the longest animation. The JSON is printed the way
Biome formats it (2 spaces, 120 columns), so `pnpm lint` stays clean on
regenerated files.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from PIL import Image

LINE_WIDTH = 120


@dataclass
class SheetAnim:
    name: str
    fps: int
    loop: bool
    frames: Sequence[Image.Image]
    anchors: Mapping[str, Sequence[Tuple[int, int]]] = field(default_factory=dict)


@dataclass
class Sheet:
    frame_w: int
    frame_h: int
    origin: Tuple[int, int]
    animations: List[SheetAnim]

    def image(self) -> Image.Image:
        cols = max(len(a.frames) for a in self.animations)
        out = Image.new("RGBA", (self.frame_w * cols, self.frame_h * len(self.animations)), (0, 0, 0, 0))
        for row, anim in enumerate(self.animations):
            for col, frame in enumerate(anim.frames):
                if frame.size != (self.frame_w, self.frame_h):
                    raise ValueError(f"{anim.name}[{col}] is {frame.size}, expected {(self.frame_w, self.frame_h)}")
                out.alpha_composite(frame, (col * self.frame_w, row * self.frame_h))
        return out

    def manifest(self) -> Dict[str, Any]:
        anims: List[Dict[str, Any]] = []
        for anim in self.animations:
            entry: Dict[str, Any] = {"name": anim.name, "fps": anim.fps, "loop": anim.loop, "frames": len(anim.frames)}
            if anim.anchors:
                for key, points in anim.anchors.items():
                    if len(points) != len(anim.frames):
                        raise ValueError(f"{anim.name}: anchor {key} has {len(points)} points for {len(anim.frames)} frames")
                entry["anchors"] = {key: [[int(x), int(y)] for x, y in points] for key, points in anim.anchors.items()}
            anims.append(entry)
        return {
            "frame": {"w": self.frame_w, "h": self.frame_h},
            "origin": {"x": self.origin[0], "y": self.origin[1]},
            "animations": anims,
        }

    def write(self, directory: Path, stem: str) -> Tuple[Path, Path]:
        directory.mkdir(parents=True, exist_ok=True)
        image = self.image()
        validate_pixels(image, stem)
        png = directory / f"{stem}.png"
        js = directory / f"{stem}.json"
        image.save(png, optimize=True)
        js.write_text(dumps(self.manifest()) + "\n")
        return png, js


def validate_pixels(image: Image.Image, label: str, max_colours: int = 96) -> None:
    """Binary alpha and a small palette: the look's pixel contract."""
    colours = set()
    for r, g, b, a in image.getdata():
        if a not in (0, 255):
            raise ValueError(f"{label}: semi-transparent pixel (alpha {a})")
        if a:
            colours.add((r, g, b))
    if len(colours) > max_colours:
        raise ValueError(f"{label}: {len(colours)} colours, expected at most {max_colours}")


# ── Biome-compatible JSON ──


def dumps(value: Any) -> str:
    return _fmt(value, 0, True, top=True)


def _flat(value: Any) -> str:
    if isinstance(value, dict):
        if not value:
            return "{}"
        return "{ " + ", ".join(f"{json.dumps(k)}: {_flat(v)}" for k, v in value.items()) + " }"
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(_flat(v) for v in value) + "]"
    return json.dumps(value)


def _fmt(value: Any, indent: int, last: bool, top: bool = False, prefix: str = "") -> str:
    flat = _flat(value)
    tail = 0 if last else 1
    if not top and indent + len(prefix) + len(flat) + tail <= LINE_WIDTH:
        return flat
    pad = " " * (indent + 2)
    if isinstance(value, dict):
        items = list(value.items())
        lines = []
        for i, (k, v) in enumerate(items):
            key = f"{json.dumps(k)}: "
            lines.append(pad + key + _fmt(v, indent + 2, i == len(items) - 1, prefix=key))
        return "{\n" + ",\n".join(lines) + "\n" + " " * indent + "}"
    if isinstance(value, (list, tuple)):
        lines = [pad + _fmt(v, indent + 2, i == len(value) - 1) for i, v in enumerate(value)]
        return "[\n" + ",\n".join(lines) + "\n" + " " * indent + "]"
    return flat


def load(directory: Path, stem: str) -> Tuple[Image.Image, Dict[str, Any]]:
    with Image.open(directory / f"{stem}.png") as image:
        return image.convert("RGBA"), json.loads((directory / f"{stem}.json").read_text())


def frame_of(image: Image.Image, manifest: Mapping[str, Any], animation: str, index: int) -> Optional[Image.Image]:
    fw, fh = manifest["frame"]["w"], manifest["frame"]["h"]
    for row, anim in enumerate(manifest["animations"]):
        if anim["name"] == animation:
            return image.crop((index * fw, row * fh, index * fw + fw, row * fh + fh))
    return None
