"""An orthographic, pixel-exact renderer for character volumes.

Bodies are built from a handful of analytic primitives (tapered capsules, ellipsoids,
boxes) and rendered straight to native resolution, one sample per pixel centre, so every
pixel is either fully covered or empty: no anti-aliasing to clean up afterwards. This is
the Dead Cells approach (3D forms rendered to pixel art) in miniature; the result is a
G-buffer that `shade.py` turns into ramp colours and outlines.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from .vec import Vec, cross, dot, norm, sub

#: A pattern maps a hit to a material override (or None to keep the primitive's material)
#: and a tone offset (negative darkens), so prints, pockets and folds move with the body.
Pattern = Callable[["Hit"], Tuple[Optional[str], int]]


@dataclass
class Hit:
    z: float
    normal: Vec
    #: Primitive-local coordinates for patterns: capsules give (t along the axis,
    #: angle around it, 0); ellipsoids and boxes give the point in their own basis,
    #: ellipsoids normalised to the unit sphere.
    local: Vec
    prim: "Prim"


@dataclass
class Prim:
    part: str
    material: str
    pattern: Optional[Pattern] = field(default=None, repr=False)
    #: Added to z when comparing depth, to settle ties between touching parts.
    bias: float = 0.0
    #: Rendered only where something else is already in front? No: `shade` treats parts
    #: with the same `group` as one surface when drawing interior lines.
    group: Optional[str] = None

    def bbox(self) -> Tuple[float, float, float, float]:  # pragma: no cover - abstract
        raise NotImplementedError

    def hit(self, x: float, y: float) -> Optional[Hit]:  # pragma: no cover - abstract
        raise NotImplementedError


@dataclass
class Capsule(Prim):
    """A sphere swept from `a` (radius `ra`) to `b` (radius `rb`): limbs, necks, straps."""

    a: Vec = (0.0, 0.0, 0.0)
    b: Vec = (0.0, 0.0, 0.0)
    ra: float = 1.0
    rb: float = 1.0
    #: A direction perpendicular-ish to the axis that defines angle 0 for patterns.
    ref: Vec = (0.0, 0.0, 1.0)

    def bbox(self) -> Tuple[float, float, float, float]:
        r = max(self.ra, self.rb)
        return (
            min(self.a[0], self.b[0]) - r,
            min(self.a[1], self.b[1]) - r,
            max(self.a[0], self.b[0]) + r,
            max(self.a[1], self.b[1]) + r,
        )

    def _z_at(self, x: float, y: float, t: float) -> Optional[float]:
        a, b = self.a, self.b
        cx = a[0] + (b[0] - a[0]) * t
        cy = a[1] + (b[1] - a[1]) * t
        cz = a[2] + (b[2] - a[2]) * t
        r = self.ra + (self.rb - self.ra) * t
        rem = r * r - (x - cx) ** 2 - (y - cy) ** 2
        if rem < 0:
            return None
        return cz + math.sqrt(rem)

    def hit(self, x: float, y: float) -> Optional[Hit]:
        a, b = self.a, self.b
        dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        l2 = dx * dx + dy * dy
        candidates = [0.0, 1.0]
        if l2 > 1e-9:
            l = math.sqrt(l2)
            ex, ey = x - a[0], y - a[1]
            along = (ex * dx + ey * dy) / l
            perp2 = ex * ex + ey * ey - along * along
            candidates.append(min(1.0, max(0.0, along / l)))
            k = dz / l
            t = along / l
            # The front-most point of a swept sphere sits ahead of the projected point by
            # k*R/sqrt(1+k^2) along the axis (see module notes); two passes settle the taper.
            for _ in range(2):
                r = self.ra + (self.rb - self.ra) * min(1.0, max(0.0, t))
                rr = r * r - perp2
                if rr <= 0:
                    break
                t = (along + k * math.sqrt(rr) / math.sqrt(1 + k * k)) / l
            candidates.append(min(1.0, max(0.0, t)))
        best_t, best_z = -1.0, -1e9
        for t in candidates:
            z = self._z_at(x, y, t)
            if z is not None and z > best_z:
                best_t, best_z = t, z
        if best_t < 0:
            return None
        c = (a[0] + dx * best_t, a[1] + dy * best_t, a[2] + dz * best_t)
        n = norm((x - c[0], y - c[1], best_z - c[2]))
        axis = norm((dx, dy, dz)) if l2 + dz * dz > 1e-9 else (0.0, 1.0, 0.0)
        u = norm(sub(self.ref, tuple(axis[i] * dot(self.ref, axis) for i in range(3))))  # type: ignore[arg-type]
        w = cross(axis, u)
        angle = math.atan2(dot(n, w), dot(n, u))
        return Hit(best_z, n, (best_t, angle, 0.0), self)


@dataclass
class Ellipsoid(Prim):
    """An ellipsoid with semi-axes `radii` along the orthonormal `basis`: torsos, heads, hands."""

    center: Vec = (0.0, 0.0, 0.0)
    basis: Tuple[Vec, Vec, Vec] = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))
    radii: Vec = (1.0, 1.0, 1.0)

    def bbox(self) -> Tuple[float, float, float, float]:
        ex = math.sqrt(sum((self.basis[i][0] * self.radii[i]) ** 2 for i in range(3)))
        ey = math.sqrt(sum((self.basis[i][1] * self.radii[i]) ** 2 for i in range(3)))
        cx, cy, _ = self.center
        return (cx - ex, cy - ey, cx + ex, cy + ey)

    def hit(self, x: float, y: float) -> Optional[Hit]:
        cx, cy, cz = self.center
        alphas = []
        betas = []
        for e, r in zip(self.basis, self.radii):
            alphas.append(((x - cx) * e[0] + (y - cy) * e[1]) / r)
            betas.append(e[2] / r)
        qa = sum(bb * bb for bb in betas)
        qb = sum(al * bb for al, bb in zip(alphas, betas))
        qc = sum(al * al for al in alphas) - 1
        disc = qb * qb - qa * qc
        if disc < 0 or qa <= 0:
            return None
        w = (-qb + math.sqrt(disc)) / qa
        u = tuple(al + w * bb for al, bb in zip(alphas, betas))
        grad = (0.0, 0.0, 0.0)
        for ui, e, r in zip(u, self.basis, self.radii):
            g = ui / r
            grad = (grad[0] + e[0] * g, grad[1] + e[1] * g, grad[2] + e[2] * g)
        return Hit(cz + w, norm(grad), u, self)  # type: ignore[arg-type]


@dataclass
class Box(Prim):
    """An oriented box: shoe soles, a keyboard case, a pad of sticky notes."""

    center: Vec = (0.0, 0.0, 0.0)
    basis: Tuple[Vec, Vec, Vec] = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))
    half: Vec = (1.0, 1.0, 1.0)

    def bbox(self) -> Tuple[float, float, float, float]:
        ex = sum(abs(self.basis[i][0]) * self.half[i] for i in range(3))
        ey = sum(abs(self.basis[i][1]) * self.half[i] for i in range(3))
        cx, cy, _ = self.center
        return (cx - ex, cy - ey, cx + ex, cy + ey)

    def hit(self, x: float, y: float) -> Optional[Hit]:
        cx, cy, cz = self.center
        lo, hi = -1e9, 1e9
        active = 0
        sign = 1.0
        for i, (e, h) in enumerate(zip(self.basis, self.half)):
            al = (x - cx) * e[0] + (y - cy) * e[1]
            if abs(e[2]) < 1e-9:
                if abs(al) > h:
                    return None
                continue
            w1 = (-h - al) / e[2]
            w2 = (h - al) / e[2]
            near_w, near_sign = (w2, 1.0) if w2 > w1 else (w1, -1.0)
            lo = max(lo, min(w1, w2))
            if near_w < hi:
                hi = near_w
                active, sign = i, near_sign
        if lo > hi:
            return None
        w = hi
        local = tuple((x - cx) * e[0] + (y - cy) * e[1] + w * e[2] for e in self.basis)
        e = self.basis[active]
        return Hit(cz + w, (e[0] * sign, e[1] * sign, e[2] * sign), local, self)  # type: ignore[arg-type]


@dataclass
class GBuffer:
    """Per-pixel nearest surface: the input to shading and outlining."""

    width: int
    height: int
    hits: List[Optional[Hit]]

    def at(self, px: int, py: int) -> Optional[Hit]:
        if 0 <= px < self.width and 0 <= py < self.height:
            return self.hits[py * self.width + px]
        return None


def render(prims: Sequence[Prim], width: int = 64, height: int = 64, origin: Tuple[int, int] = (32, 64)) -> GBuffer:
    """Rasterises `prims` with one sample at every pixel centre; nearest surface wins."""
    ox, oy = origin
    hits: List[Optional[Hit]] = [None] * (width * height)
    depth = [-1e9] * (width * height)
    for prim in prims:
        x0, y0, x1, y1 = prim.bbox()
        px0 = max(0, int(math.floor(x0 + ox - 0.5)))
        px1 = min(width - 1, int(math.ceil(x1 + ox - 0.5)))
        py0 = max(0, int(math.floor(oy - y1 - 0.5)))
        py1 = min(height - 1, int(math.ceil(oy - y0 - 0.5)))
        for py in range(py0, py1 + 1):
            wy = oy - (py + 0.5)
            row = py * width
            for px in range(px0, px1 + 1):
                hit = prim.hit(px + 0.5 - ox, wy)
                if hit is None:
                    continue
                z = hit.z + prim.bias
                if z > depth[row + px]:
                    depth[row + px] = z
                    hits[row + px] = hit
    return GBuffer(width, height, hits)


def merge_parts(prims: Sequence[Prim]) -> Dict[str, List[Prim]]:
    parts: Dict[str, List[Prim]] = {}
    for prim in prims:
        parts.setdefault(prim.part, []).append(prim)
    return parts
