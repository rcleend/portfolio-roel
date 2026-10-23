"""Re-space separate objects (street lamps, bins, cars) along a repeating strip.

Generators crowd props together; a near layer needs them spaced so the layer
behind breathes. Objects are found as connected groups of opaque pixels, where
pixels within ``join`` pixels of each other count as touching so that thin
gaps (a lamp's glass, a bicycle's spokes) do not split one object in two.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from PIL import Image


@dataclass(frozen=True)
class Piece:
    left: int
    top: int
    image: Image.Image  # cropped to the piece's bounding box, other pieces cleared

    @property
    def width(self) -> int:
        return self.image.width


def find_pieces(image: Image.Image, join: int = 2, min_pixels: int = 12) -> List[Piece]:
    """Return the separate objects in ``image``, ordered left to right."""
    rgba = image.convert("RGBA")
    w, h = rgba.size
    alpha = rgba.getchannel("A").load()
    label = [[-1] * w for _ in range(h)]
    offsets = [(dx, dy) for dy in range(-join, join + 1) for dx in range(-join, join + 1) if dx or dy]
    groups: List[List[Tuple[int, int]]] = []
    for y in range(h):
        for x in range(w):
            if alpha[x, y] == 0 or label[y][x] != -1:
                continue
            index = len(groups)
            stack = [(x, y)]
            label[y][x] = index
            members: List[Tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                members.append((cx, cy))
                for dx, dy in offsets:
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and alpha[nx, ny] and label[ny][nx] == -1:
                        label[ny][nx] = index
                        stack.append((nx, ny))
            groups.append(members)
    groups = _merge_enclosed(groups)
    source = rgba.load()
    pieces: List[Piece] = []
    for members in groups:
        if len(members) < min_pixels:
            continue
        xs = [p[0] for p in members]
        ys = [p[1] for p in members]
        left, top = min(xs), min(ys)
        piece = Image.new("RGBA", (max(xs) - left + 1, max(ys) - top + 1), (0, 0, 0, 0))
        dst = piece.load()
        for px, py in members:
            dst[px - left, py - top] = source[px, py]
        pieces.append(Piece(left, top, piece))
    pieces.sort(key=lambda p: p.left)
    return pieces


def _bbox(members: Sequence[Tuple[int, int]]) -> Tuple[int, int, int, int]:
    xs = [p[0] for p in members]
    ys = [p[1] for p in members]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def _merge_enclosed(groups: List[List[Tuple[int, int]]]) -> List[List[Tuple[int, int]]]:
    """Fold a group into a bigger one when most of its box lies inside it.

    Glowing neon tubes or a lamp's light are often drawn detached from their
    fixture; they belong to whatever object surrounds them.
    """
    ordered = sorted(groups, key=len, reverse=True)
    merged: List[List[Tuple[int, int]]] = []
    boxes: List[Tuple[int, int, int, int]] = []
    for members in ordered:
        l, t, r, b = _bbox(members)
        area = (r - l) * (b - t)
        for i, (bl, bt, br, bb) in enumerate(boxes):
            overlap = max(0, min(r, br) - max(l, bl)) * max(0, min(b, bb) - max(t, bt))
            if overlap >= area * 0.5:
                merged[i].extend(members)
                break
        else:
            merged.append(list(members))
            boxes.append((l, t, r, b))
    return merged


def arrange(image: Image.Image, width: int, order: Optional[Sequence[int]] = None) -> Image.Image:
    """Lay the selected pieces out across ``width`` with equal gaps.

    Vertical positions are kept, so objects still stand on the same baseline.
    Half a gap sits before the first piece and after the last, so when the
    strip repeats the wrap-around gap matches the others and no object is
    ever cut by the seam.
    """
    pieces = find_pieces(image)
    picked = [pieces[i] for i in order] if order is not None else pieces
    used = sum(p.width for p in picked)
    if used > width:
        raise ValueError(f"pieces need {used}px but the strip is only {width}px wide")
    gap = (width - used) / len(picked)
    result = Image.new("RGBA", (width, image.height), (0, 0, 0, 0))
    cursor = gap / 2
    for piece in picked:
        result.alpha_composite(piece.image, (round(cursor), piece.top))
        cursor += piece.width + gap
    return result


def drop_fragments(image: Image.Image, min_pixels: int) -> Image.Image:
    """Remove disconnected bits smaller than ``min_pixels``.

    Thin structures (crane booms, antennas, wires) break apart when shrunk;
    floating stubs read as dirt, so they are dropped rather than kept.
    """
    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    for piece in find_pieces(image, join=1, min_pixels=min_pixels):
        result.alpha_composite(piece.image, (piece.left, piece.top))
    return result
