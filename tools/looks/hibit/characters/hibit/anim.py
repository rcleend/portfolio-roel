"""Animation helpers: easing, pose interpolation, gait, smears.

Timing is designed in 60 Hz game frames and quantised to each animation's sprite fps,
the `steps()` way: key poses are drawn, in-betweens come from eased interpolation, and
holds are repeated frames.
"""

from __future__ import annotations

import math
from dataclasses import fields, is_dataclass, replace
from typing import Any, Callable, List, Optional, Sequence, Tuple

from .canvas import Sprite
from .rig import Build, Limb, Pose
from .vec import Vec

Ease = Callable[[float], float]


def linear(t: float) -> float:
    return t


def ease_in_out(t: float) -> float:
    return t * t * (3 - 2 * t)


def ease_out(t: float) -> float:
    return 1 - (1 - t) ** 3


def ease_in(t: float) -> float:
    return t ** 3


def ease_out_back(t: float, s: float = 1.7) -> float:
    t -= 1
    return t * t * ((s + 1) * t + s) + 1


def _lerp_value(a: Any, b: Any, t: float) -> Any:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return a + (b - a) * t
    if isinstance(a, tuple) and isinstance(b, tuple) and len(a) == len(b):
        return tuple(_lerp_value(x, y, t) for x, y in zip(a, b))
    if is_dataclass(a) and is_dataclass(b) and type(a) is type(b):
        changes = {}
        for f in fields(a):
            changes[f.name] = _lerp_value(getattr(a, f.name), getattr(b, f.name), t)
        return replace(a, **changes)
    return a if t < 0.5 else b


def lerp_pose(a: Pose, b: Pose, t: float) -> Pose:
    pose = _lerp_value(a, b, t)
    # Free-form extras do not interpolate; take the nearer key's.
    return replace(pose, extra=a.extra if t < 0.5 else b.extra)


def keyed(keys: Sequence[Tuple[float, Any]], t: float, ease: Ease = ease_in_out) -> Any:
    """Value at time `t` from (time, value) keys, eased between neighbours; clamps at the ends."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            u = ease(u)
            if isinstance(v0, Pose):
                return lerp_pose(v0, v1, u)
            return _lerp_value(v0, v1, u)
    return keys[-1][1]


def cyclic(keys: Sequence[Tuple[float, Any]], t: float, ease: Ease = ease_in_out) -> Any:
    """Like `keyed` but wraps: the last key interpolates back to the first at t = 1."""
    t = t % 1.0
    wrapped = list(keys) + [(1.0, keys[0][1])]
    return keyed(wrapped, t, ease)


def wave(t: float, phase: float = 0.0) -> float:
    return math.sin(2 * math.pi * (t + phase))


# ── Gait ─────────────────────────────────────────────────────────────────────────


def foot_path(p: float, stride: float, lift: float, stance: float = 0.4) -> Tuple[float, float, float]:
    """Ankle (x offset, lift, foot pitch) for a leg at cycle phase `p` (0 = heel strike).

    During stance the foot is planted and slides back under the body at ground speed;
    during swing it lifts, the heel kicks up first, then it reaches forward for the next
    strike.
    """
    p %= 1.0
    if p < stance:
        u = p / stance
        x = stride * (0.5 - u)
        pitch = 12.0 * (1 - u) - 28.0 * max(0.0, (u - 0.7) / 0.3)
        return x, 0.0, pitch
    u = (p - stance) / (1 - stance)
    x = stride * (-0.5 + ease_in_out(u))
    # Heel kick: the lift peaks early in the swing, then the foot comes through low.
    h = lift * math.sin(math.pi * min(1.0, u * 1.1) ** 0.75) * (1.0 - 0.3 * u)
    pitch = -30.0 * (1 - u) + 14.0 * u
    return x, max(0.0, h), pitch


# ── Smears ───────────────────────────────────────────────────────────────────────


def smear(points: Sequence[Tuple[float, float]], colors: Sequence[str], width: float = 2.0,
          frame: Tuple[int, int] = (64, 64)) -> Sprite:
    """A motion smear: a tapered stroke along `points` (frame pixels), coloured by segment.

    `colors` runs from the tail (oldest position) to the head; the stroke is thickest at the
    head and thins to a point at the tail, like a hand-drawn smear frame.
    """
    w, h = frame
    pixels: List[Optional[str]] = [None] * (w * h)
    total = len(points) - 1
    if total < 1:
        return Sprite(w, h, pixels)
    for i in range(total):
        (x0, y0), (x1, y1) = points[i], points[i + 1]
        steps = max(2, int(math.hypot(x1 - x0, y1 - y0) * 3))
        for s in range(steps + 1):
            u = s / steps
            along = (i + u) / total
            x = x0 + (x1 - x0) * u
            y = y0 + (y1 - y0) * u
            r = max(0.0, width * (0.35 + 0.65 * along))
            color = colors[min(len(colors) - 1, int(along * len(colors)))]
            for py in range(int(math.floor(y - r)), int(math.ceil(y + r)) + 1):
                for px in range(int(math.floor(x - r)), int(math.ceil(x + r)) + 1):
                    if (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= r * r + 0.25 and 0 <= px < w and 0 <= py < h:
                        pixels[py * w + px] = color
    return Sprite(w, h, pixels)


def fan_smear(prev: Tuple[Tuple[float, float], Tuple[float, float]], cur: Tuple[Tuple[float, float], Tuple[float, float]],
              inner: str, outer: str, edge: str, frame: Tuple[int, int] = (64, 64), steps: int = 14) -> Sprite:
    """The fan a forearm sweeps between two poses: (elbow, hand) then and now, in frame px.

    Filled from the elbow side (`inner`) to the hand side (`outer`), with the leading arc in
    `edge`; the newest sliver is left out so the arm itself draws over the smear's head.
    """
    w, h = frame
    pixels: List[Optional[str]] = [None] * (w * h)
    (pe, ph), (ce, ch) = prev, cur
    for k in range(steps):
        t = k / steps * 0.85
        ex, ey = pe[0] + (ce[0] - pe[0]) * t, pe[1] + (ce[1] - pe[1]) * t
        hx, hy = ph[0] + (ch[0] - ph[0]) * t, ph[1] + (ch[1] - ph[1]) * t
        n = max(2, int(math.hypot(hx - ex, hy - ey) * 2))
        for j in range(n + 1):
            u = j / n
            x, y = ex + (hx - ex) * u, ey + (hy - ey) * u
            color = edge if u > 0.82 and t > 0.25 else (outer if u > 0.45 else inner)
            px, py = int(math.floor(x)), int(math.floor(y))
            for ox, oy in ((0, 0), (1, 0), (0, 1)):
                if 0 <= px + ox < w and 0 <= py + oy < h and pixels[(py + oy) * w + px + ox] is None:
                    pixels[(py + oy) * w + px + ox] = color
    return Sprite(w, h, pixels)


def arc_points(cx: float, cy: float, r: float, a0: float, a1: float, n: int = 8) -> List[Tuple[float, float]]:
    """Points on a circular arc in frame pixels (angles in degrees, 0 = right, CCW on screen)."""
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        out.append((cx + r * math.cos(a), cy - r * math.sin(a)))
    return out


def ground(x: float, z: float, lift: float = 0.0, build: Build = Build()) -> Vec:
    return (x, build.ankle_height + lift, z)


def with_limbs(pose: Pose, **limbs: Limb) -> Pose:
    return replace(pose, **limbs)
