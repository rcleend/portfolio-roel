"""Frame compositor: stacks key-grid parts and resolves their outlines.

Parts are painted back to front. Each part carries `o` pixels on its own rim;
once everything is stacked, every `o` pixel looks at its four neighbours:

- next to empty space it is part of the silhouette and becomes near-black;
- inside the figure it becomes the part's softer `line` colour, the selective
  inner line that separates an arm from the chest it crosses;
- where it would double up against the rim of a part in front of it, or where
  the part is declared to join a neighbour seamlessly (a sleeve into its own
  shoulder), it melts into the part's `demote` tone instead.

That one rule gives the look its bold outside line and quieter inside lines
without hand-placing a single outline pixel per frame.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, FrozenSet, List, Mapping, Optional, Sequence, Tuple

from PIL import Image

from .grid import HARD_OUTLINE, SOFT_OUTLINE, Grid, Point
from .palette import OUTLINE, rgba

NEIGHBOURS = ((1, 0), (-1, 0), (0, 1), (0, -1))


@dataclass(frozen=True)
class Part:
    grid: Grid
    at: Point
    palette: Mapping[str, str]
    line: str
    demote: str
    group: str = ""
    joins: FrozenSet[str] = frozenset()
    name: str = ""
    # Restricts `joins` to a disc (x, y, radius), e.g. only where a sleeve meets its shoulder.
    join_at: Optional[Tuple[float, float, float]] = None
    # Cool rim light (the TV's glow from the right) on this part's right-hand silhouette edge.
    rim: Optional[str] = None

    def placed(self) -> Dict[Point, str]:
        ox = self.at[0] - self.grid.pivot[0]
        oy = self.at[1] - self.grid.pivot[1]
        return {(x + ox, y + oy): key for (x, y), key in self.grid.cells.items()}


@dataclass
class Frame:
    w: int = 64
    h: int = 64
    parts: List[Part] = field(default_factory=list)
    # Pixels painted after outline resolution, e.g. a lens glint: (x, y) -> colour.
    decals: Dict[Point, str] = field(default_factory=dict)

    def add(self, part: Optional[Part]) -> None:
        if part is not None and part.grid.cells:
            self.parts.append(part)

    def extend(self, parts: Sequence[Optional[Part]]) -> None:
        for part in parts:
            self.add(part)

    def cells(self) -> Dict[Point, Tuple[int, str]]:
        """Final (part index, key) per pixel after stacking."""
        stacked: Dict[Point, Tuple[int, str]] = {}
        for index, part in enumerate(self.parts):
            for point, key in part.placed().items():
                x, y = point
                if 0 <= x < self.w and 0 <= y < self.h:
                    stacked[point] = (index, key)
        return stacked

    def clipped(self) -> int:
        """How many part pixels fall outside the frame (a pose that does not fit)."""
        lost = 0
        for part in self.parts:
            for x, y in part.placed():
                if not (0 <= x < self.w and 0 <= y < self.h):
                    lost += 1
        return lost

    def resolve(self) -> Dict[Point, str]:
        """Colour per opaque pixel."""
        stacked = self.cells()
        colours: Dict[Point, str] = {}
        for point, (index, key) in stacked.items():
            part = self.parts[index]
            if key == HARD_OUTLINE:
                colours[point] = OUTLINE
            elif key == SOFT_OUTLINE:
                colours[point] = self._outline_colour(point, index, stacked)
            else:
                colour = part.palette.get(key)
                if colour is None:
                    raise KeyError(f"part {part.name or index}: no colour for key {key!r}")
                colours[point] = colour
        self._rim_light(stacked, colours)
        for point, colour in self.decals.items():
            if point in colours:
                colours[point] = colour
        return colours

    def _rim_light(self, stacked: Mapping[Point, Tuple[int, str]], colours: Dict[Point, str]) -> None:
        """Dark cloth catches the TV's glow on its right edge, so it never sinks into a night backdrop."""
        for (x, y), (index, key) in stacked.items():
            rim = self.parts[index].rim
            if rim is None or key in (SOFT_OUTLINE, HARD_OUTLINE):
                continue
            right = stacked.get((x + 1, y))
            if right is not None and right[1] == SOFT_OUTLINE and colours.get((x + 1, y)) == OUTLINE:
                # Only where that outline pixel is the silhouette (it touches empty space).
                if any((x + 1 + dx, y + dy) not in stacked for dx, dy in NEIGHBOURS):
                    colours[(x, y)] = rim

    def _outline_colour(self, point: Point, index: int, stacked: Mapping[Point, Tuple[int, str]]) -> str:
        part = self.parts[index]
        x, y = point
        others: List[Tuple[int, str]] = []
        for dx, dy in NEIGHBOURS:
            neighbour = stacked.get((x + dx, y + dy))
            if neighbour is None:
                return OUTLINE
            if neighbour[0] != index:
                others.append(neighbour)
        if not others:
            return part.line
        demoted = part.palette[part.demote]
        if self._joins_here(part, point) and all(self.parts[i].group in part.joins for i, _ in others):
            return demoted
        if any(i > index and key in (SOFT_OUTLINE, HARD_OUTLINE) for i, key in others):
            return demoted
        return part.line

    @staticmethod
    def _joins_here(part: Part, point: Point) -> bool:
        if not part.joins:
            return False
        if part.join_at is None:
            return True
        cx, cy, r = part.join_at
        return (point[0] + 0.5 - cx) ** 2 + (point[1] + 0.5 - cy) ** 2 <= r * r

    def render(self) -> Image.Image:
        image = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        pixels = image.load()
        for (x, y), colour in self.resolve().items():
            pixels[x, y] = rgba(colour)
        return image
