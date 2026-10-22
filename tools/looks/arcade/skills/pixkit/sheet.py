"""Packs animations into the look asset format (ASSETS.md): one PNG + one JSON.

One row per animation, in manifest order, frames left to right; the image is
as wide as the longest animation, and the cells after a shorter animation's
last frame stay transparent. Alpha is binary by construction because a
``Sprite`` only holds opaque colours and holes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image

from . import jsonfmt
from .canvas import Sprite

#: "A few dozen colours per sheet at most" (ASSETS.md); the generators stay well under it.
MAX_COLORS = 48


@dataclass(frozen=True)
class Animation:
    name: str
    fps: int
    loop: bool
    frames: Sequence[Sprite]
    #: Named points per frame, in frame pixels (e.g. the drone's ``muzzle``).
    anchors: Optional[Dict[str, Sequence[Tuple[int, int]]]] = None


def with_calm(animation: Animation, flashes: Sequence[int]) -> List[Animation]:
    """The animation plus a ``<name>-calm`` twin for reduced motion, without its white impact frames.

    Each flash frame is replaced by the next frame that is not one (the previous
    one at the end), so the twin keeps the same length and timing and the game
    can swap names without touching durations. Anchors follow their frames.
    """
    count = len(animation.frames)
    sources: List[int] = []
    for index in range(count):
        source = index
        while source in flashes and source + 1 < count:
            source += 1
        while source in flashes and source > 0:
            source -= 1
        sources.append(source)
    anchors = None
    if animation.anchors:
        anchors = {key: [points[i] for i in sources] for key, points in animation.anchors.items()}
    twin = Animation(
        f"{animation.name}-calm", animation.fps, animation.loop, [animation.frames[i] for i in sources], anchors
    )
    return [animation, twin]


@dataclass(frozen=True)
class Strip:
    """A sheet of equally sized frames sharing one origin."""

    frame: Tuple[int, int]
    origin: Tuple[int, int]
    animations: Sequence[Animation] = field(default_factory=list)

    def validate(self, name: str) -> None:
        w, h = self.frame
        if not self.animations:
            raise ValueError(f"{name}: a sheet needs at least one animation")
        names = [animation.name for animation in self.animations]
        if len(set(names)) != len(names):
            raise ValueError(f"{name}: duplicate animation names {names}")
        for animation in self.animations:
            where = f"{name}/{animation.name}"
            if not animation.frames:
                raise ValueError(f"{where}: no frames")
            if animation.fps <= 0:
                raise ValueError(f"{where}: fps must be positive")
            for index, sprite in enumerate(animation.frames):
                if (sprite.width, sprite.height) != (w, h):
                    raise ValueError(f"{where}[{index}]: frame is {sprite.width}x{sprite.height}, sheet is {w}x{h}")
            for anchor, points in (animation.anchors or {}).items():
                if len(points) != len(animation.frames):
                    raise ValueError(
                        f"{where}: anchor {anchor!r} has {len(points)} points for {len(animation.frames)} frames"
                    )
        colors = self.colors()
        if len(colors) > MAX_COLORS:
            raise ValueError(f"{name}: {len(colors)} colours, more than the {MAX_COLORS} a sheet may use")

    def colors(self) -> set:
        return {color for animation in self.animations for sprite in animation.frames for color in sprite.colors()}

    def image(self) -> Image.Image:
        w, h = self.frame
        columns = max(len(animation.frames) for animation in self.animations)
        sheet = Image.new("RGBA", (w * columns, h * len(self.animations)), (0, 0, 0, 0))
        for row, animation in enumerate(self.animations):
            for column, sprite in enumerate(animation.frames):
                sheet.paste(sprite.to_image(), (column * w, row * h))
        return sheet

    def manifest(self) -> dict:
        w, h = self.frame
        animations: List[dict] = []
        for animation in self.animations:
            entry: dict = {
                "name": animation.name,
                "fps": animation.fps,
                "loop": animation.loop,
                "frames": len(animation.frames),
            }
            if animation.anchors:
                entry["anchors"] = {key: [list(point) for point in points] for key, points in animation.anchors.items()}
            animations.append(entry)
        return {
            "frame": {"w": w, "h": h},
            "origin": {"x": self.origin[0], "y": self.origin[1]},
            "animations": animations,
        }


def write(strip: Strip, directory: Path, name: str) -> Tuple[Path, Path]:
    """Writes ``<name>.png`` and ``<name>.json``; deterministic for the same input."""
    strip.validate(f"{directory.name}/{name}")
    directory.mkdir(parents=True, exist_ok=True)
    png = directory / f"{name}.png"
    manifest = directory / f"{name}.json"
    # Fixed encoder settings and no metadata keep rebuilds byte-identical.
    strip.image().save(png, format="PNG", optimize=True)
    manifest.write_text(jsonfmt.dumps(strip.manifest()), encoding="utf-8")
    return png, manifest
