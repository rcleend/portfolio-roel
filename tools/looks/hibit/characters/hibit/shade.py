"""Turns a G-buffer into hibit pixels: banded ramps, coloured outlines, rim light, clean clusters.

The rules are the ones a pixel artist applies by hand:
- light from the top-left: half-Lambert brightness quantised into each material's bands;
- a cool TV-glow rim on right-facing silhouette edges;
- a 1 px coloured outline (the material's darkest tone) that lightens where the
  silhouette faces the light;
- a darker contact line on a surface where a nearer part overlaps it, so an arm reads in
  front of the torso without a heavy black line;
- orphan pixels inside a band are merged into their neighbours, so clusters stay clean.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional

from .canvas import Canvas, neighbors4
from .ramps import RAMPS, Ramp
from .render3d import GBuffer, Hit
from .vec import Vec, dot, norm

#: Key light from the top-left, a little towards the viewer.
LIGHT: Vec = norm((-0.62, 0.70, 0.45))
#: Depth difference (px) that counts as one part passing in front of another.
OCCLUSION_STEP = 1.6


@dataclass
class ShadeOptions:
    rim: bool = True
    contact_lines: bool = True
    outline: bool = True
    despeckle: bool = True


def brightness(normal: Vec) -> float:
    lam = dot(normal, LIGHT)
    half = lam * 0.5 + 0.5
    return half * half


def _material(hit: Hit) -> tuple:
    material, offset = hit.prim.material, 0
    if hit.prim.pattern is not None:
        override, offset = hit.prim.pattern(hit)
        if override:
            material = override
    return material, offset


def _surface_key(hit: Optional[Hit]) -> Optional[str]:
    if hit is None:
        return None
    return hit.prim.group or hit.prim.part


def shade(gbuf: GBuffer, options: ShadeOptions = ShadeOptions(), layer: str = "body") -> Canvas:
    """Colours every covered pixel of `gbuf` and returns it as a z-carrying canvas."""
    w, h = gbuf.width, gbuf.height
    canvas = Canvas(w, h)
    materials: List[Optional[Ramp]] = [None] * (w * h)
    tone_index: List[int] = [0] * (w * h)

    for y in range(h):
        for x in range(w):
            hit = gbuf.at(x, y)
            if hit is None:
                continue
            name, offset = _material(hit)
            ramp = RAMPS[name]
            b = brightness(hit.normal)
            color = ramp.tone(b, offset)
            if ramp.gloss is not None and b >= ramp.gloss:
                color = ramp.tones[-1]
            elif ramp.gloss is not None and color == ramp.tones[-1]:
                color = ramp.tones[-2]
            i = y * w + x
            materials[i] = ramp
            tone_index[i] = ramp.tones.index(color)
            canvas.set(x, y, color, hit.z, layer)

    if options.despeckle:
        _despeckle(gbuf, canvas, materials)

    if options.contact_lines:
        for y in range(h):
            for x in range(w):
                hit = gbuf.at(x, y)
                if hit is None:
                    continue
                key = _surface_key(hit)
                for nx, ny in neighbors4(x, y):
                    other = gbuf.at(nx, ny)
                    if other is None or _surface_key(other) == key:
                        continue
                    if other.z - hit.z > OCCLUSION_STEP:
                        ramp = materials[y * w + x]
                        assert ramp is not None
                        current = canvas.get(x, y)
                        idx = ramp.tones.index(current) if current in ramp.tones else 2
                        canvas.set(x, y, ramp.tones[max(1, idx - 2)], hit.z, layer)
                        break

    if options.outline:
        _outline(gbuf, canvas, materials, rim=options.rim)
    return canvas


def _edge_mask(gbuf: GBuffer) -> List[bool]:
    w, h = gbuf.width, gbuf.height
    mask = [False] * (w * h)
    for y in range(h):
        for x in range(w):
            if gbuf.at(x, y) is None:
                continue
            for nx, ny in neighbors4(x, y):
                if gbuf.at(nx, ny) is None:
                    mask[y * w + x] = True
                    break
    return mask


def _despeckle(gbuf: GBuffer, canvas: Canvas, materials: List[Optional[Ramp]]) -> None:
    w, h = gbuf.width, gbuf.height
    snapshot = list(canvas.pixels)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            c = snapshot[i]
            if c is None:
                continue
            same_surface = []
            hit = gbuf.at(x, y)
            for nx, ny in neighbors4(x, y):
                if not (0 <= nx < w and 0 <= ny < h):
                    continue
                other = gbuf.at(nx, ny)
                if other is None or _surface_key(other) != _surface_key(hit):
                    continue
                if materials[ny * w + nx] is not materials[i]:
                    continue
                same_surface.append(snapshot[ny * w + nx])
            if len(same_surface) >= 3 and c not in same_surface:
                counts: Dict[str, int] = {}
                for n in same_surface:
                    counts[n] = counts.get(n, 0) + 1
                best = max(counts.items(), key=lambda kv: kv[1])[0]
                canvas.pixels[i] = best


def _outline(gbuf: GBuffer, canvas: Canvas, materials: List[Optional[Ramp]], rim: bool = True) -> None:
    """1 px coloured outline on the silhouette.

    Left/top edges that face the key light take the ramp's lit outline; right-facing
    edges take its cool rim tone (the TV glow); everything else the dark outline.
    """
    w, h = gbuf.width, gbuf.height
    edges = []
    for y in range(h):
        for x in range(w):
            hit = gbuf.at(x, y)
            if hit is None:
                continue
            exposed_dirs = []
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                if gbuf.at(x + dx, y + dy) is None:
                    exposed_dirs.append((dx, dy))
            if not exposed_dirs:
                continue
            ramp = materials[y * w + x]
            assert ramp is not None
            n = hit.normal
            if rim and ramp.rim and (1, 0) in exposed_dirs and n[0] > 0.2 and n[1] > -0.7:
                color = ramp.rim
            elif any(dx < 0 or dy < 0 for dx, dy in exposed_dirs) and dot(n, LIGHT) > 0.45:
                color = ramp.outline_lit
            else:
                color = ramp.outline
            edges.append((x, y, color, hit.z))
    for x, y, color, z in edges:
        canvas.set(x, y, color, z, canvas.layer[y * w + x])


def angle_deg(a: float) -> float:
    return math.degrees(a)
