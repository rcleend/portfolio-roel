"""The shared light: one key light, one rim, coloured outlines.

Form shading uses a fixed key light from the top-left, quantised into a
ramp's tones, so every object in every skill is lit from the same side.
Outlines take the darkest tone of whatever they wrap and lighten where the
edge faces the key light; a cool rim catches right-facing edges.
"""

from __future__ import annotations

import math
from typing import Callable, Dict, Iterable, Optional, Sequence

from .palette import RIM, Ramp, ramp_of
from .pix import Canvas

_KEY = (-0.55, -0.72, 0.42)
_NORM = math.sqrt(sum(v * v for v in _KEY))
KEY = tuple(v / _NORM for v in _KEY)

# Lambert thresholds for tones 2..5 (tone 1 below the first). Tuned so a
# sphere shows a broad mid, a clear core shadow and a small hot spot.
THRESHOLDS = (0.12, 0.38, 0.62, 0.86)


def tone_for(intensity: float, lo: int = 1, hi: int = 5, thresholds: Sequence[float] = THRESHOLDS) -> int:
    tone = lo
    for k, t in enumerate(thresholds):
        if intensity > t:
            tone = lo + 1 + k
    return min(hi, tone)


def shade_ellipse(
    canvas: Canvas,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    ramp: Ramp,
    where: Optional[Callable[[int, int], bool]] = None,
    lo: int = 1,
    hi: int = 5,
    thresholds: Sequence[float] = THRESHOLDS,
) -> None:
    """Fills an ellipse shaded as a lit spheroid (key light top-left)."""
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            dx = (x + 0.5 - cx) / rx
            dy = (y + 0.5 - cy) / ry
            d2 = dx * dx + dy * dy
            if d2 > 1.0 or (where is not None and not where(x, y)):
                continue
            nz = math.sqrt(max(0.0, 1.0 - d2))
            intensity = dx * KEY[0] + dy * KEY[1] + nz * KEY[2]
            canvas.set(x, y, ramp[tone_for(intensity, lo, hi, thresholds)])


def outline(
    canvas: Canvas,
    ramp_for: Optional[Callable[[str], Ramp]] = None,
    diagonals: bool = False,
    lit_lighten: bool = True,
    skip: Iterable[str] = (),
) -> Canvas:
    """Coloured 1 px outline outside the silhouette.

    Each outline pixel takes tone 0 of the ramp it wraps; on the lit sides
    (left of or above the object) it takes tone 1 instead, so the outline
    softens where the light hits and stays darkest in shadow.
    """
    ramp_for = ramp_for or ramp_of
    skipped = set(skip)
    out = canvas.copy()
    steps = [(1, 0), (0, 1), (-1, 0), (0, -1)]
    if diagonals:
        steps += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
    for y in range(canvas.h):
        for x in range(canvas.w):
            if canvas.opaque(x, y):
                continue
            neighbours = [canvas.get(x + sx, y + sy) for sx, sy in steps]
            sources = [c for c in neighbours if c is not None and c not in skipped]
            if not sources:
                continue
            ramp = ramp_for(sources[0])
            lit = canvas.opaque(x + 1, y) or canvas.opaque(x, y + 1)
            shadow = canvas.opaque(x - 1, y) or canvas.opaque(x, y - 1)
            out.set(x, y, ramp.lit_outline if (lit_lighten and lit and not shadow) else ramp.outline)
    return out


def rim(canvas: Canvas, eligible: Callable[[int, int, str], bool], color: str = RIM) -> None:
    """Cool TV-glow rim: opaque pixels with open space to their right."""
    hits = [(x, y) for x, y, c in canvas.points() if not canvas.opaque(x + 1, y) and eligible(x, y, c)]
    for x, y in hits:
        canvas.set(x, y, color)


def lookup(*ramps: Ramp) -> Dict[str, Ramp]:
    table: Dict[str, Ramp] = {}
    for ramp in ramps:
        for tone in ramp.tones:
            table.setdefault(tone, ramp)
    return table
