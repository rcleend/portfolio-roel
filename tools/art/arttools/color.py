"""Colour parsing, distance and palette loading."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

RGB = Tuple[int, int, int]
RGBA = Tuple[int, int, int, int]

MAGENTA: RGB = (255, 0, 255)


def parse_hex(value: str) -> RGB:
    """Parse ``#rrggbb`` (the leading ``#`` is optional)."""
    text = value.strip().lstrip("#")
    if len(text) != 6:
        raise ValueError(f"expected #rrggbb, got {value!r}")
    return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))


def to_hex(color: Sequence[int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(color[0], color[1], color[2])


def distance_sq(a: Sequence[int], b: Sequence[int]) -> float:
    """Squared "redmean" distance.

    Plain Euclidean RGB over-weights blue differences and under-weights greens,
    which makes quantised skies band in the wrong places. Redmean is a cheap
    perceptual approximation that needs no colour-space conversion.
    """
    rmean = (a[0] + b[0]) / 2
    dr = a[0] - b[0]
    dg = a[1] - b[1]
    db = a[2] - b[2]
    return (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db


def nearest(color: Sequence[int], palette: Sequence[RGB]) -> RGB:
    best = palette[0]
    best_d = distance_sq(color, best)
    for candidate in palette[1:]:
        d = distance_sq(color, candidate)
        if d < best_d:
            best, best_d = candidate, d
    return best


def load_palette(path: Path) -> List[RGB]:
    """Load a palette from ``.json`` (list of hex strings), ``.hex`` (one per line),
    ``.gpl`` (GIMP) or an image (every distinct opaque colour)."""
    suffix = path.suffix.lower()
    if suffix == ".json":
        data = json.loads(path.read_text())
        entries = data["palette"] if isinstance(data, dict) else data
        return dedupe(parse_hex(e) for e in entries)
    if suffix == ".hex":
        return dedupe(parse_hex(line) for line in path.read_text().splitlines() if line.strip())
    if suffix == ".gpl":
        colors = []
        for line in path.read_text().splitlines():
            parts = line.split()
            if len(parts) >= 3 and all(p.isdigit() for p in parts[:3]):
                colors.append((int(parts[0]), int(parts[1]), int(parts[2])))
        return dedupe(colors)
    from PIL import Image

    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        return dedupe((r, g, b) for r, g, b, a in rgba.getdata() if a > 0)


def dedupe(colors: Iterable[RGB]) -> List[RGB]:
    """Drop repeats while keeping first-seen order (palette order is meaningful)."""
    return list(dict.fromkeys(colors))
