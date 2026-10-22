"""Key-frame storyboards for review mockups: where each sprite sits at each beat.

This is review-only composition, not game code. It also prototypes the parts
the motion spec leaves to Phase B code (`draw_code`: beam tiling, rings that
grow in whole-pixel steps, trails), so the mockups show the whole effect.

Positions assume the new hero scale: 64 x 64 frames, feet on the ground line,
a standing hero ~58 px tall. Hand anchors are assumptions until the portrait
character sheets land; Phase B reads the real `hand` anchors.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Sequence, Tuple

from PIL import Image

GROUND_Y = 200


@dataclass
class Stage:
    hero: int = 92
    customers: Sequence[Tuple[int, bool]] = ((176, False), (226, False), (270, False))
    camera: int = 0


@dataclass
class Sprite:
    """One sprite placed in a mockup by its origin, in native screen pixels."""

    strip: str
    animation: str
    frame: int
    x: int
    y: int
    flip: bool = False
    layer: str = "front"  # behind | front


@dataclass
class Moment:
    label: str
    sprites: List[Sprite]
    code: List[Tuple[str, dict]] = field(default_factory=list)  # code-drawn layers: (kind, params)


# ── Code-drawn layers (Phase B prototypes) ───────────────────────────────


def _rgba(color: str) -> Tuple[int, int, int, int]:
    return (int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16), 255)


def _put(canvas: Image.Image, x: int, y: int, color: str) -> None:
    if 0 <= x < canvas.width and 0 <= y < canvas.height:
        canvas.putpixel((x, y), _rgba(color))


def draw_code(canvas: Image.Image, kind: str, params: dict) -> None:
    DRAWERS[kind](canvas, params)


def _ellipse_ring(canvas: Image.Image, p: dict) -> None:
    """A ring that grows in whole-pixel steps: stepped colour bands from the leading edge inwards."""
    cx, cy, rx, ry = p["cx"], p["cy"], p["rx"], p["ry"]
    bands: Sequence[str] = p["bands"]
    dash = p.get("dash", 0)
    floor = p.get("floor", canvas.height)  # rings roll over the street rather than cutting into it
    for i, color in enumerate(bands):
        r = rx - i
        if r <= 0:
            continue
        sy = ry * r / rx
        steps = max(16, int(2 * math.pi * r))
        for s in range(steps):
            a = 2 * math.pi * s / steps
            if dash and (s // dash) % 2:
                continue
            y = round(cy + math.sin(a) * sy - 0.5)
            if y <= floor:
                _put(canvas, round(cx + math.cos(a) * r - 0.5), y, color)


def _tile_x(canvas: Image.Image, p: dict) -> None:
    """Repeats a strip frame along x from `x0` to `x1` (the beam body), scrolled by `offset`."""
    tile: Image.Image = p["image"]
    x0, x1, y, offset = p["x0"], p["x1"], p["y"], p.get("offset", 0)
    left, right = min(x0, x1), max(x0, x1)
    x = left - (offset % tile.width)
    while x < right:
        crop_left = max(0, left - x)
        crop_right = min(tile.width, right - x)
        if crop_right > crop_left:
            canvas.alpha_composite(tile.crop((crop_left, 0, crop_right, tile.height)), (x + crop_left, y))
        x += tile.width


def _line(canvas: Image.Image, p: dict) -> None:
    points: Sequence[Tuple[int, int]] = p["points"]
    colors: Sequence[str] = p["colors"]
    for i, (x, y) in enumerate(points):
        _put(canvas, x, y, colors[min(i * len(colors) // max(1, len(points)), len(colors) - 1)])


DRAWERS: Dict[str, Callable[[Image.Image, dict], None]] = {
    "ellipse_ring": _ellipse_ring,
    "tile_x": _tile_x,
    "line": _line,
}

# ── Storyboards, per skill ────────────────────────────────────────────────

#: Assumed `hand` anchors of the hero `skill` pose, relative to the feet (x right, y up), until the
#: portrait character sheets exist. Phase B reads the real anchors per frame.
HAND = {
    "hackerman": (14, 34),  # keyboard held out in front, chest height
    "artsy-potion": (11, 40),  # potion raised towards the mouth
    "artsy-strum": (6, 25),  # the Strat's body, where the pick crosses the strings
    "strategy": (14, 36),  # throwing / casting hand
}


def hand(stage: Stage, key: str) -> Tuple[int, int]:
    dx, dy = HAND[key]
    return stage.hero + dx, GROUND_Y - dy


def _strip_image(skill_id: str, strip: str, animation: str, frame: int) -> Image.Image:
    from portrait_fx.skills import SKILLS

    found = next(s for s in SKILLS[skill_id].strips() if s.name == strip)
    anim = next(a for a in found.animations if a.name == animation)
    return anim.frames[min(frame, len(anim.frames) - 1)].to_image()


def full_stack_attack(stage: Stage) -> List[Moment]:
    hx, hy = hand(stage, "hackerman")
    beam_y = hy - 8  # fx-beam origin is (0, 8): the middle row of the 17-row beam
    targets = [(cx, GROUND_Y - 34) for cx, _ in stage.customers]

    def beam(animation: str, frame: int, length: int, offset: int = 0) -> Tuple[str, dict]:
        return ("tile_x", {"image": _strip_image("full-stack-attack", "fx-beam", animation, frame),
                           "x0": hx, "x1": hx + length, "y": beam_y, "offset": offset, "layer": "front"})

    return [
        Moment("tick 2 - charge at the hand", [Sprite("fx-muzzle", "charge", 1, hx, hy)]),
        Moment("tick 4 - the beam races out", [
            Sprite("fx-muzzle", "charge", 3, hx, hy),
            Sprite("fx-tip", "race", 0, hx + 120, hy),
        ], [beam("grow", 1, 120)]),
        Moment("tick 12 - hold: every customer in line is hit", [
            Sprite("fx-muzzle", "hold", 0, hx, hy),
            *[Sprite("fx-hit", "hit", 1 + i % 2, x, y) for i, (x, y) in enumerate(targets)],
        ], [beam("hold", 0, 320 - hx, 6)]),
        Moment("tick 31 - collapse", [
            Sprite("fx-muzzle", "fade", 1, hx, hy),
            *[Sprite("fx-hit", "hit", 4, x, y) for x, y in targets],
        ], [beam("fade", 1, 320 - hx, 12)]),
    ]


def agent_summon(stage: Stage) -> List[Moment]:
    centre_y = GROUND_Y - 14  # SkillCaster.y: the centre of the 28 px collision box

    def orbit(seconds: float) -> Tuple[int, int, str]:
        angle = seconds / 1.6 * 2 * math.pi
        x = round(stage.hero + math.cos(angle) * 22)
        y = round(centre_y - 22 + math.sin(angle) * 6)
        return x, y, "behind" if math.sin(angle) < 0 else "front"

    target_x, target_y = stage.customers[0][0], GROUND_Y - 34
    x0, y0, l0 = orbit(0.2)
    x1, y1, l1 = orbit(1.62)
    x2, y2, l2 = orbit(1.2)
    x3, y3, l3 = orbit(7.85)
    sx = x1 + 11 + round((target_x - x1) * 0.45)
    sy = y1 + round((target_y - y1) * 0.45)
    return [
        Moment("0.2 s - summoned: the hologram prints itself", [Sprite("fx-drone", "summon", 3, x0, y0, layer=l0)]),
        Moment("1.6 s - fires at the nearest customer", [
            Sprite("fx-drone", "fire", 0, x1, y1, layer=l1),
            Sprite("fx-shot", "fly", 0, sx, sy),
            Sprite("fx-impact", "hit", 1, target_x, target_y),
        ], [("line", {"points": [(sx - 3 - i, sy) for i in range(4)],
                      "colors": ["#62cde2", "#2c93ae", "#17596e"], "layer": "front"})]),
        Moment("1.2 s - far side of the orbit, behind the hero", [Sprite("fx-drone", "hover", 4, x2, y2, flip=True, layer=l2)]),
        Moment("7.85 s - dismissed", [Sprite("fx-drone", "dismiss", 2, x3, y3, layer=l3)]),
    ]


ROSE_BANDS = ("#ffc0dc", "#ea74ad", "#c23f88")


def ux_elixir(stage: Stage) -> List[Moment]:
    hx, hy = hand(stage, "artsy-potion")
    chest = (stage.hero, GROUND_Y - 30)
    heads = [(cx, GROUND_Y - 61) for cx, _ in stage.customers]
    everyone = list(range(len(stage.customers)))

    def wave(rx: int) -> Tuple[str, dict]:
        return ("ellipse_ring", {"cx": chest[0], "cy": chest[1], "rx": rx, "ry": max(4, rx * 3 // 10),
                                 "bands": ROSE_BANDS, "dash": 3, "layer": "behind"})

    motes = [Sprite("fx-calm-motes", "heart", 0, heads[0][0] - 9, heads[0][1] + 10),
             Sprite("fx-calm-motes", "spark", 0, heads[1][0] + 8, heads[1][1] + 4),
             Sprite("fx-calm-motes", "bubble", 1, heads[2][0] - 7, heads[2][1] + 16),
             Sprite("fx-calm-motes", "heart", 1, heads[1][0] - 10, heads[1][1] - 6)]
    return [
        Moment("0.1 s - the elixir appears in his hand", [Sprite("fx-potion", "appear", 2, hx, hy)]),
        Moment("0.35 s - he drinks; the elixir stays level as the flask tips", [Sprite("fx-potion", "drink", 2, hx, hy)]),
        Moment("0.5 s - glint, and a wave of understanding goes out", [
            Sprite("fx-potion", "drink", 4, hx, hy),
            Sprite("fx-glint", "glint", 2, hx + 4, hy - 6),
        ], [wave(96)]),
        Moment("2 s - every customer calmed: aura, heart, motes", [
            *[Sprite("fx-calm-heart", "beat", 4 if i == 1 else 0, x, y) for i, (x, y) in enumerate(heads)],
            *motes,
        ], [("aura", {"customers": everyone, "color": "#ea74ad"})]),
    ]


SOUND_BANDS = ("#ebe7ff", "#bdb2f6", "#8676dc")


def power_chord(stage: Stage) -> List[Moment]:
    gx, gy = hand(stage, "artsy-strum")
    tops = [(cx, GROUND_Y - 56) for cx, _ in stage.customers]

    def ring(rx: int, fresh: int = 3, layer: str = "behind") -> Tuple[str, dict]:
        return ("ellipse_ring", {"cx": gx, "cy": gy, "rx": rx, "ry": max(3, rx * 9 // 20),
                                 "bands": SOUND_BANDS[:fresh], "floor": GROUND_Y, "layer": layer})

    return [
        Moment("tick 0 - the pick crosses the strings", [Sprite("fx-strum", "strum", 0, gx, gy)]),
        Moment("tick 3 - the chord lands; the first ring leaves", [Sprite("fx-strum", "strum", 1, gx, gy)], [ring(26)]),
        Moment("0.15 s - three rings sweep the screen and throw off notes", [
            Sprite("fx-strum", "strum", 3, gx, gy),
            Sprite("fx-notes", "eighth", 1, gx + 52, gy - 22),
            Sprite("fx-notes", "beamed", 0, gx + 96, gy - 30),
            Sprite("fx-notes", "eighth", 0, gx - 40, gy - 18, flip=True),
        ], [ring(160, 2), ring(118, 3), ring(74, 3)]),
        Moment("1 s - every customer stunned for three seconds", [
            *[Sprite("fx-stun", "orbit", i * 3, x, y) for i, (x, y) in enumerate(tops)],
            Sprite("fx-notes", "beamed", 1, tops[0][0] + 16, tops[0][1] - 14),
            Sprite("fx-notes", "eighth", 0, tops[2][0] - 18, tops[2][1] - 20),
        ]),
    ]


def homing_path(x: float, y: float, facing: int, target: Tuple[float, float], seconds: float) -> List[Tuple[float, float]]:
    """HomingStar's flight (src/game/entities/shots/HomingStar.ts), one point per 60 Hz step."""
    speed, turn_rate, dt = 200.0, 6.5, 1 / 60
    vx, vy = facing * speed * 0.6, -speed * 0.8
    points = []
    for _ in range(round(seconds / dt)):
        desired = math.atan2(target[1] - y, target[0] - x)
        current = math.atan2(vy, vx)
        turn = math.atan2(math.sin(desired - current), math.cos(desired - current))
        heading = current + max(-turn_rate * dt, min(turn_rate * dt, turn))
        vx, vy = math.cos(heading) * speed, math.sin(heading) * speed
        x, y = x + vx * dt, y + vy * dt
        points.append((x, y))
    return points


GOLD_RIBBON = ("#ffe895", "#f4c44a", "#cf8d1e", "#83500e")


def north_star(stage: Stage) -> List[Moment]:
    hx, hy = hand(stage, "strategy")
    target = (stage.customers[1][0], GROUND_Y - 34)
    path = homing_path(hx, hy, 1, target, 2.0)
    hit = next(i for i, (x, y) in enumerate(path) if abs(x - target[0]) < 6 and abs(y - target[1]) < 14)

    def flying(step: int) -> List[Sprite]:
        x, y = path[step]
        trail = [path[max(0, step - k)] for k in (2, 4, 6)]
        return [Sprite("fx-star", "spin", step // 5 % 4, round(x), round(y)),
                *[Sprite("fx-trail", "spark", k, round(tx), round(ty)) for k, (tx, ty) in enumerate(trail)]]

    def ribbon(step: int) -> Tuple[str, dict]:
        points = [(round(x), round(y)) for x, y in reversed(path[max(0, step - 10):step])]
        return ("line", {"points": points, "colors": GOLD_RIBBON, "layer": "front"})

    mid = hit // 2
    return [
        Moment("tick 0 - launched from the hand", [Sprite("fx-sparkle", "launch", 1, hx, hy), *flying(1)[:1]]),
        Moment(f"{mid / 60:.2f} s - arcs up and homes on the most frustrated", flying(mid), [ribbon(mid)]),
        Moment(f"{hit / 60:.2f} s - impact", [Sprite("fx-impact", "impact", 1, round(target[0]), round(target[1]))], [ribbon(hit)]),
        Moment(f"{(hit + 8) / 60:.2f} s - the ring opens into sparkles", [Sprite("fx-impact", "impact", 4, round(target[0]), round(target[1]))]),
    ]


def churn_shield(stage: Stage) -> List[Moment]:
    cx, cy = stage.hero, GROUND_Y - 31
    # One customer has walked right up to the shield; the others hang back.
    stage.customers = ((stage.hero + 40, False), (stage.hero + 128, False), (stage.hero + 176, False))
    contact = (cx + 32, cy - 2)

    def bubble(animation: str, frame: int, back: bool = True) -> List[Sprite]:
        sprites = [Sprite("fx-shell", animation, frame, cx, cy)]
        if back:
            sprites.insert(0, Sprite("fx-shell-back", animation, frame, cx, cy, layer="behind"))
        return sprites

    return [
        Moment("0.1 s - the bubble forms round him", bubble("form", 3)),
        Moment("1.5 s - a customer bumps it: ripple and a heart", [
            *bubble("shimmer", 2),
            Sprite("fx-ripple", "bump", 2, contact[0], contact[1]),
            Sprite("fx-heart", "pop", 2, contact[0] + 6, contact[1] - 22),
        ]),
        Moment("4.4 s - waning: the rim goes to dashes", bubble("wane", 1)),
        Moment("4.85 s - pop", bubble("pop", 2, back=False)),
    ]


STORYBOARDS: Dict[str, Callable[[Stage], List[Moment]]] = {
    "full-stack-attack": full_stack_attack,
    "agent-summon": agent_summon,
    "ux-elixir": ux_elixir,
    "power-chord": power_chord,
    "north-star": north_star,
    "churn-shield": churn_shield,
}

#: Key frames shown beside the style reference: (strip, animation, frame) per skill.
STYLEREF: Dict[str, List[Tuple[str, str, int]]] = {
    "full-stack-attack": [("fx-muzzle", "hold", 0), ("fx-beam", "hold", 0), ("fx-hit", "hit", 1), ("fx-hit", "hit", 2)],
    "agent-summon": [("fx-drone", "hover", 0), ("fx-drone", "fire", 0), ("fx-shot", "fly", 0), ("fx-impact", "hit", 1)],
    "ux-elixir": [("fx-potion", "drink", 0), ("fx-potion", "drink", 2), ("fx-glint", "glint", 2), ("fx-calm-heart", "beat", 0)],
    "power-chord": [("fx-strum", "strum", 1), ("fx-strum", "strum", 2), ("fx-notes", "beamed", 1), ("fx-stun", "orbit", 0)],
    "north-star": [("fx-star", "spin", 0), ("fx-star", "spin", 1), ("fx-impact", "impact", 1), ("fx-impact", "impact", 3)],
    "churn-shield": [("fx-shell", "shimmer", 0), ("fx-ripple", "bump", 2), ("fx-heart", "pop", 2)],
}
