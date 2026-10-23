#!/usr/bin/env python3
"""Key-frame mock-ups of every hibit skill effect, in a level, at the new hero scale.

  python3 tools/looks/hibit/skills/mockups.py                 # all skills
  python3 tools/looks/hibit/skills/mockups.py full-stack-attack --level luna

Each mock-up is the Phase B drawing logic prototyped in Python: sprites from
the built sheets placed the way the game will place them (beam tiles from the
hand anchor to the screen edge, data scrolling per layer, bursts on hits).
Bodies are stand-ins (see ``hibitfx.review``). Output goes to
/tmp/arcade-looks-hibit-skills/mockups/ and is never committed.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from PIL import Image, ImageDraw  # noqa: E402

from hibitfx import review  # noqa: E402
from hibitfx.pix import Canvas  # noqa: E402
from hibitfx.sheet import Sheet  # noqa: E402
from hibitfx.skills import SKILLS  # noqa: E402

OUT = Path("/tmp/arcade-looks-hibit-skills/mockups")
GROUND = 200
SCREEN = (320, 240)


def frame_of(sheet: Sheet, anim: str, index: int) -> Canvas:
    for a in sheet.anims:
        if a.name == anim:
            return a.frames[max(0, min(index, len(a.frames) - 1))]
    raise KeyError(f"{sheet.name} has no animation {anim}")


def at(base: Image.Image, sheet: Sheet, anim: str, index: int, x: int, y: int, flip: bool = False) -> None:
    """Draws one frame with the sheet origin on (x, y), mirrored for left-facing."""
    frame = frame_of(sheet, anim, index)
    ox, oy = sheet.origin
    left = x - (frame.w - 1 - ox) if flip else x - ox
    review.paste(base, frame, left, y - oy, flip=flip)


class Stage:
    """A level backdrop with stand-in bodies, ready for effects on top."""

    def __init__(self, level: str = "scripe", camera_x: int = 0) -> None:
        self.level = level
        self.backdrop = review.level_backdrop(level, camera_x).convert("RGBA")

    def frame(self) -> Image.Image:
        return self.backdrop.copy()


def sheet_map(skill: str) -> Dict[str, Sheet]:
    return {s.name: s for s in SKILLS[skill].sheets()}


def save_sheet(name: str, frames: Sequence[Tuple[str, Image.Image]], scale: int = 2, columns: int = 3) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    tiles = [(label, review.upscale(img, scale)) for label, img in frames]
    sheet = review.labelled(tiles, columns)
    path = OUT / f"{name}.png"
    sheet.save(path)
    return path


def caption(image: Image.Image, text: str) -> Image.Image:
    draw = ImageDraw.Draw(image)
    draw.text((4, 228), text, fill=(255, 255, 255))
    return image


# ── FULL-STACK ATTACK ───────────────────────────────────────────────────

def full_stack_attack(level: str) -> List[Tuple[str, Image.Image]]:
    sheets = sheet_map("full-stack-attack")
    beam, data, muzzle, tip, hit = (sheets[n] for n in ("fx-beam", "fx-beam-data", "fx-beam-muzzle", "fx-beam-tip", "fx-beam-hit"))
    stage = Stage(level, 0)
    hero_x, hand = 64, (78, GROUND - 33)
    customers = [190, 262]
    out = []
    reach = SCREEN[0] - hand[0]
    keys = [0, 2, 4, 9, 18, 27, 30, 33]
    for f in keys:
        img = stage.frame()
        review.place_feet(img, review.standin_hero("hackerman"), hero_x, GROUND)
        grow = min(1.0, (f + 1) / 5)
        length = int(round(reach * (1 - (1 - grow) ** 3)))
        tip_x = hand[0] + length
        for cx in customers:
            hit_age = f - next((g for g in range(40) if hand[0] + int(round(reach * (1 - (1 - min(1.0, (g + 1) / 5)) ** 3))) >= cx - 6), 0)
            pose, frm = ("hurt", 0) if 0 <= hit_age < 12 else ("walk", 1)
            review.place_feet(img, review.standin_customer(pose, frm), cx, GROUND, flip=True)
        # beam body
        if f <= 4:
            anim, idx = "open", f
        elif f <= 26:
            anim, idx = "sustain", (f // 3) % 4
        else:
            anim, idx = "collapse", min(6, (f - 27))
        x = hand[0]
        while x < tip_x:
            at(img, beam, anim, idx, x, hand[1])
            x += beam.frame[0]
        # data rides the layers at three speeds (front-end fastest)
        if anim != "collapse" and (anim == "sustain" or idx >= 3):
            for track, row, speed in (("front-end", -6, 4), ("back-end", 0, 3), ("database", 6, 2)):
                offset = (f * speed) % data.frame[0]
                x = hand[0] + 8 - offset
                while x < tip_x - 10:
                    at(img, data, track, 0, x, hand[1] + row)
                    x += data.frame[0]
        # crop the beam at the tip so the spearhead leads
        if f < 5:
            at(img, tip, "grow", f % 3, tip_x - 12, hand[1])
        # muzzle
        if f <= 2:
            at(img, muzzle, "charge", f, *hand)
        elif f <= 26:
            at(img, muzzle, "sustain", (f // 3) % 4, *hand)
        else:
            at(img, muzzle, "collapse", min(5, (f - 27) // 2 + 1), *hand)
        # hits
        for cx in customers:
            first = next((g for g in range(40) if hand[0] + int(round(reach * (1 - (1 - min(1.0, (g + 1) / 5)) ** 3))) >= cx - 6), 0)
            age = f - first
            if 0 <= age < 18:
                at(img, hit, "pierce", age // 2, cx, hand[1])
        out.append((f"f{f:02d} {anim}[{idx}]", caption(img, f"FULL-STACK ATTACK f{f}  (stand-in bodies)")))
    return out


# ── AGENT SUMMON ────────────────────────────────────────────────────────

ORBIT_SECONDS, ORBIT_X, ORBIT_Y, ORBIT_LIFT = 1.6, 22, 6, 22


def agent_summon(level: str) -> List[Tuple[str, Image.Image]]:
    sheets = sheet_map("agent-summon")
    drone, shot, impact = sheets["fx-drone"], sheets["fx-drone-shot"], sheets["fx-drone-impact"]
    stage = Stage(level, 0)
    hero_x, feet = 96, GROUND
    caster_y = feet - 14  # gameplay centre of the 12 x 28 body
    target = (236, feet - 30)
    out = []
    for t in (0.05, 0.2, 0.42, 0.5, 0.62, 0.95, 1.35, 7.2, 7.95):
        img = stage.frame()
        angle = (t / ORBIT_SECONDS) * math.pi * 2
        dx, dy = hero_x + math.cos(angle) * ORBIT_X, caster_y - ORBIT_LIFT + math.sin(angle) * ORBIT_Y
        pos = (int(round(dx)), int(round(dy)))
        behind = math.sin(angle) < 0
        review.place_feet(img, review.standin_customer("walk", 1), target[0], feet, flip=True)

        def draw_drone() -> None:
            if t < 0.4:
                at(img, drone, "summon", int(t * 30), *pos)
            elif t > 7.75:
                at(img, drone, "dissolve", int((t - 7.75) * 30), *pos)
            elif t > 7.0:
                at(img, drone, "powerdown", int(t * 8) % 4, *pos)
            elif 0.35 <= t < 0.55:
                at(img, drone, "fire", int((t - 0.35) * 30), *pos)
            else:
                at(img, drone, "hover-far" if behind else "hover", int(t * 15) % 24, *pos)

        if behind:
            draw_drone()
        review.place_feet(img, review.standin_hero("hackerman"), hero_x, feet)
        if not behind:
            draw_drone()
        # one shot in flight from the 0.35 s volley, and its impact
        if 0.35 <= t < 0.35 + 0.6:
            fired = (0.35 / ORBIT_SECONDS) * math.pi * 2
            sx = hero_x + math.cos(fired) * ORBIT_X
            sy = caster_y - ORBIT_LIFT + math.sin(fired) * ORBIT_Y
            dist = math.hypot(target[0] - sx, target[1] - sy)
            travelled = (t - 0.35) * 250
            if travelled < dist:
                k = travelled / dist
                px, py = sx + (target[0] - sx) * k, sy + (target[1] - sy) * k
                for i, back in enumerate((4, 8, 12)):
                    kb = max(0.0, (travelled - back) / dist)
                    at(img, shot, "trail", i, int(sx + (target[0] - sx) * kb), int(sy + (target[1] - sy) * kb))
                at(img, shot, "fly", int(t * 20) % 4, int(px), int(py))
            else:
                age = travelled - dist
                at(img, impact, "impact", min(6, int(age / 250 * 30)), *target)
        out.append((f"t={t:.2f}s", caption(img, f"AGENT SUMMON t={t:.2f}s  (stand-in bodies)")))
    return out


# ── UX ELIXIR ───────────────────────────────────────────────────────────

def calm_wave(img: Image.Image, cx: int, cy: int, radius: int) -> None:
    """Code-drawn calm wave: a pastel ring in whole-pixel steps, drawn behind the bodies."""
    from hibitfx.palette import CALM, MINT
    from hibitfx.pix import Canvas as _C, midpoint_circle

    layer = _C(*SCREEN)
    for i, color in enumerate((CALM[5], CALM[3], MINT[3])):
        r = radius - i
        if r <= 0:
            continue
        for x, y in midpoint_circle(cx, cy, r):
            if i == 2 and (x + y) % 2:
                continue
            layer.set(x, y, color)
    review.paste(img, layer, 0, 0)


def ux_elixir(level: str) -> List[Tuple[str, Image.Image]]:
    sheets = sheet_map("ux-elixir")
    potion, calm, burst, aura = sheets["fx-potion"], sheets["fx-calm"], sheets["fx-elixir-burst"], sheets["fx-elixir-aura"]
    stage = Stage(level, 300)
    hero_x, feet = 80, GROUND
    hand = (hero_x + 12, feet - 30)
    lips = (hero_x + 9, feet - 46)
    customers = [(196, "walk", 1), (262, "walk", 0)]
    out = []
    for t in (0.05, 0.16, 0.26, 0.4, 0.52, 0.7, 0.95, 2.5, 5.95):
        img = stage.frame()
        sip = 0.3
        if t >= sip:
            radius = int((t - sip) * 420)
            if radius < 340:
                calm_wave(img, hero_x, feet - 30, radius)
        if t >= sip:
            age = t - sip
            if t > 5.6:
                at(img, aura, "fade", int((t - 5.6) * 12), hero_x, feet)
            elif age < 0.3:
                at(img, aura, "rise", int(age * 20), hero_x, feet)
            else:
                at(img, aura, "loop", int(age * 10) % 8, hero_x, feet)
        for cx, anim, fr in customers:
            review.place_feet(img, review.standin_customer(anim, fr), cx, feet, flip=True)
        review.place_feet(img, review.standin_hero("artsy"), hero_x, feet)
        # potion choreography
        if t < 0.17:
            at(img, potion, "appear", int(t * 30), *hand)
        elif t < 0.3:
            k = min(1.0, (t - 0.17) / 0.1)
            k = 1 - (1 - k) ** 3
            pos = (int(hand[0] + (lips[0] + 6 - hand[0]) * k), int(hand[1] + (lips[1] - hand[1]) * k))
            at(img, potion, "uncork", int((t - 0.17) * 20 * 1.5), *pos)
        elif t < 0.7:
            at(img, potion, "drink", int((t - 0.3) * 20), lips[0] + 6, lips[1])
        elif t < 1.1:
            u = (t - 0.7) / 0.4
            x = int(lips[0] + 6 - u * 34)
            y = int(lips[1] - 20 * math.sin(u * math.pi) + u * 20)
            if u < 0.8:
                at(img, potion, "tumble", int((t - 0.7) * 20), x, y)
            else:
                at(img, potion, "poof", int((u - 0.8) * 20), x, y)
        if 0.3 <= t < 0.6:
            at(img, burst, "aha", int((t - 0.3) * 30), hero_x + 2, feet - 52)
        for i, (cx, _, _) in enumerate(customers):
            reach = abs(cx - hero_x) / 420 + sip
            if t >= reach:
                anim = "heart-pop" if t > 5.9 else "heart"
                at(img, calm, anim, int((t - reach) * 8) % 8 if anim == "heart" else 0, cx, feet - 64)
                at(img, calm, "mote", int(t * 12 + i * 3) % 6, cx - 6 + i * 4, feet - 50 - int((t * 20) % 12))
        out.append((f"t={t:.2f}s", caption(img, f"UX ELIXIR t={t:.2f}s  (stand-in bodies)")))
    return out


# ── POWER CHORD ─────────────────────────────────────────────────────────

def shock_rings(img: Image.Image, cx: int, cy: int, t: float) -> None:
    """Code-drawn rings as Phase B draws them: three, staggered, banded and thinning, behind the bodies."""
    from hibitfx.palette import SOUND, WHITE
    from hibitfx.pix import Canvas as _C, midpoint_circle

    layer = _C(*SCREEN)
    for k, (delay, radius) in enumerate(((0.0, 300), (0.07, 260), (0.14, 220))):
        age = t - delay
        if not 0 <= age < 0.45:
            continue
        p = 1 - (1 - age / 0.45) ** 3
        r = max(1, int(round(radius * p)))
        thickness = 3 if p < 0.4 else (2 if p < 0.75 else 1)
        bands = (WHITE, SOUND[4], SOUND[3]) if k != 1 else (SOUND[5], SOUND[3], SOUND[2])
        for i in range(thickness):
            for x, y in midpoint_circle(cx, cy, r - i):
                layer.set(x, y, bands[i])
    review.paste(img, layer, 0, 0)


def power_chord(level: str) -> List[Tuple[str, Image.Image]]:
    sheets = sheet_map("power-chord")
    strum, crest, stun, notes = sheets["fx-strum"], sheets["fx-wavefront"], sheets["fx-stun"], sheets["fx-notes"]
    stage = Stage(level, 600)
    hero_x, feet = 120, GROUND
    hand = (hero_x + 3, feet - 25)
    customers = [36, 214, 280]
    out = []
    for t in (0.0, 0.03, 0.08, 0.15, 0.25, 0.4, 0.8, 2.0, 2.9):
        img = stage.frame()
        shock_rings(img, hero_x, feet - 14, t)
        for cx in customers:
            stunned = t >= abs(cx - hero_x) / 520
            review.place_feet(img, review.standin_customer("stunned" if stunned else "walk", 0), cx, feet, flip=cx > hero_x)
        review.place_feet(img, review.standin_hero("artsy"), hero_x, feet)
        if t < 0.3:
            at(img, strum, "strum", int(t * 30), *hand)
        for direction in (-1, 1):
            x = int(hero_x + direction * t * 520)
            if 0 <= x < SCREEN[0] and t < 0.5:
                at(img, crest, "crest", int(t * 20) % 4, x, feet - 1, flip=direction < 0)
        for i, cx in enumerate(customers):
            reach = abs(cx - hero_x) / 520
            if t >= reach:
                age = t - reach
                anim = "fade" if age > 2.5 else "orbit"
                at(img, stun, anim, int(age * 12) % (12 if anim == "orbit" else 6), cx, feet - 63)
        for k in range(6):
            age = t - k * 0.04
            if 0 <= age < 0.9:
                x = int(hand[0] + math.cos(-1.2 + k * 0.45) * age * 70)
                y = int(hand[1] - age * 60 + age * age * 30)
                at(img, notes, ("eighth", "beamed")[k % 2], min(5, int(age * 8)), x, y)
        out.append((f"t={t:.2f}s", caption(img, f"POWER CHORD t={t:.2f}s  (stand-in bodies)")))
    return out


# ── NORTH STAR ──────────────────────────────────────────────────────────

def north_star(level: str) -> List[Tuple[str, Image.Image]]:
    sheets = sheet_map("north-star")
    star, trail, launch, impact = sheets["fx-star"], sheets["fx-star-trail"], sheets["fx-star-launch"], sheets["fx-star-impact"]
    stage = Stage(level, 900)
    hero_x, feet = 70, GROUND
    hand = (hero_x + 11, feet - 30)
    target = (250, feet - 32)
    # Simulate the homing flight exactly as HomingStar does (200 px/s, 6.5 rad/s turn).
    path, x, y, vx, vy = [], float(hand[0]), float(hand[1]), 120.0, -160.0
    for _ in range(160):
        desired = math.atan2(target[1] - y, target[0] - x)
        current = math.atan2(vy, vx)
        turn = math.atan2(math.sin(desired - current), math.cos(desired - current))
        heading = current + max(-6.5 / 60, min(6.5 / 60, turn))
        vx, vy = math.cos(heading) * 200, math.sin(heading) * 200
        x, y = x + vx / 60, y + vy / 60
        path.append((x, y))
        if math.hypot(target[0] - x, target[1] - y) < 8:
            break
    hit = len(path)
    out = []
    for f in (0, 3, 8, 16, 26, 36, hit - 2, hit + 3, hit + 9):
        img = stage.frame()
        review.place_feet(img, review.standin_customer("walk", 1), target[0], feet, flip=True)
        review.place_feet(img, review.standin_customer("walk", 0), 170, feet, flip=True)
        review.place_feet(img, review.standin_hero("strategy"), hero_x, feet)
        if f < 7:
            at(img, launch, "launch", f // 2 + (0 if f < 2 else 0), *hand)
        if f < hit:
            for age in range(2, 14, 2):
                if f - age >= 0:
                    px, py = path[f - age]
                    at(img, trail, "twinkle", min(5, age // 2 - 1), int(px), int(py))
            px, py = path[f] if f < len(path) else path[-1]
            if f < 4:
                at(img, star, "spawn", f, int(px), int(py))
            else:
                at(img, star, "spin", (f // 4) % 8, int(px), int(py))
        else:
            at(img, impact, "impact", min(10, (f - hit) // 2), *target)
        out.append((f"f{f}", caption(img, f"NORTH STAR f{f}  (stand-in bodies)")))
    return out


# ── CHURN SHIELD ────────────────────────────────────────────────────────

def churn_shield(level: str) -> List[Tuple[str, Image.Image]]:
    sheets = sheet_map("churn-shield")
    bubble, bump, puff = sheets["fx-bubble"], sheets["fx-bubble-bump"], sheets["fx-shield-calm"]
    stage = Stage(level, 1200)
    hero_x, feet = 120, GROUND
    centre = (hero_x, feet - 30)
    hand = (hero_x + 10, feet - 30)
    out = []
    for t in (0.03, 0.08, 0.14, 0.6, 1.2, 1.25, 1.4, 4.5, 5.05):
        img = stage.frame()
        cust_x = 176 if t >= 1.15 else 200
        review.place_feet(img, review.standin_customer("hurt" if 1.2 <= t < 1.5 else "walk", 0), cust_x, feet, flip=True)
        review.place_feet(img, review.standin_hero("strategy"), hero_x, feet)
        if t < 0.27:
            k = min(1.0, t / 0.2)
            pos = (int(hand[0] + (centre[0] - hand[0]) * k), int(hand[1] + (centre[1] - hand[1]) * k))
            at(img, bubble, "form", int(t * 30), *pos)
        elif t < 4.2:
            at(img, bubble, "shell", int(t * 10) % 12, *centre)
        elif t < 5.0:
            at(img, bubble, "thin", int(t * 10) % 2, *centre)
        else:
            at(img, bubble, "pop", int((t - 5.0) * 30), *centre)
        if 1.2 <= t < 1.5:
            at(img, bump, "bump", int((t - 1.2) * 30), centre[0] + 33, centre[1])
            at(img, puff, "puff", int((t - 1.2) * 12), cust_x, feet - 62)
        out.append((f"t={t:.2f}s", caption(img, f"CHURN SHIELD t={t:.2f}s  (stand-in bodies)")))
    return out


MOCKUPS: Dict[str, Callable[[str], List[Tuple[str, Image.Image]]]] = {
    "north-star": north_star,
    "churn-shield": churn_shield,
    "power-chord": power_chord,
    "ux-elixir": ux_elixir,
    "full-stack-attack": full_stack_attack,
    "agent-summon": agent_summon,
}


# ── boards: the icon set, the HUD, the select screen, the style reference ─

ORDER = ("full-stack-attack", "agent-summon", "ux-elixir", "power-chord", "north-star", "churn-shield")
HERO_OF = {"full-stack-attack": "hackerman", "agent-summon": "hackerman", "ux-elixir": "artsy", "power-chord": "artsy", "north-star": "strategy", "churn-shield": "strategy"}


def icon_frames(skill: str) -> List[Canvas]:
    return SKILLS[skill].sheets()[0].anims[0].frames


def native_ref(name: str) -> Image.Image:
    """A 3x reference screenshot back at native 320 x 240 (exact cell-centre sampling)."""
    big = review.ref_image(name)
    small = Image.new("RGBA", (big.width // 3, big.height // 3))
    src, dst = big.load(), small.load()
    for y in range(small.height):
        for x in range(small.width):
            dst[x, y] = src[x * 3 + 1, y * 3 + 1]
    return small


def icon_board() -> Image.Image:
    """The six icons at rest in steel slots (4x), their accent frames, the lit slot, and the native 1x row."""
    scale = 4
    slot = 32
    cols = len(ORDER)
    w = 16 + cols * (slot * scale + 16)
    h = 16 + 3 * (slot * scale + 30) + 120
    board = Image.new("RGBA", (w, h), (14, 13, 26, 255))
    draw = ImageDraw.Draw(board)
    accents = {"full-stack-attack": 6, "agent-summon": 18, "ux-elixir": 6, "power-chord": 18, "north-star": 6, "churn-shield": 19}
    for i, skill in enumerate(ORDER):
        frames = icon_frames(skill)
        x = 16 + i * (slot * scale + 16)
        for row, (label, frame, theme) in enumerate((
            ("rest (frame 0)", frames[0], "steel"),
            (f"accent (frame {accents[skill]})", frames[accents[skill]], "steel"),
            ("highlighted slot", frames[0], "indigo"),
        )):
            y = 16 + row * (slot * scale + 30)
            draw.text((x, y), f"{skill}  {label}", fill=(220, 220, 230))
            board.alpha_composite(review.upscale(review.slot(frame, theme).to_image(), scale), (x, y + 14))
    # Native 1x rows, as the game shows them: HUD-sized steel slots, then the lit slot.
    y = 16 + 3 * (slot * scale + 30)
    draw.text((16, y), "native 1x (steel, indigo) and 2x", fill=(220, 220, 230))
    for i, skill in enumerate(ORDER):
        frame = icon_frames(skill)[0]
        board.alpha_composite(review.slot(frame, "steel").to_image(), (16 + i * 36, y + 16))
        board.alpha_composite(review.slot(frame, "indigo").to_image(), (16 + i * 36, y + 52))
        board.alpha_composite(review.upscale(review.slot(frame, "steel").to_image(), 2), (260 + i * 70, y + 16))
    return board


def hud_board(level: str = "scripe") -> Image.Image:
    """Each hero's HUD: the portrait, then their two skills in 30 x 30 slots, over the level at native scale."""
    frames = []
    for hero, skills in (("hackerman", ORDER[0:2]), ("artsy", ORDER[2:4]), ("strategy", ORDER[4:6])):
        img = Stage(level, 0).frame()
        for k, skill in enumerate(skills):
            x = 96 + k * 34
            slot = review.slot(icon_frames(skill)[0], "steel", pad=3)
            review.paste(img, slot, x, 3)
        review.place_feet(img, review.standin_hero(hero), 90, GROUND)
        frames.append((f"HUD {hero}", caption(img, f"HUD mock, {hero} (30 px slots; stand-in body)")))
    return review.labelled([(label, review.upscale(img, 2)) for label, img in frames], 1)


def _erase_todays_hero(img: Image.Image, box: Tuple[int, int, int, int] = (68, 128, 96, 171)) -> None:
    """Paints over today's idle sprite on the select card with each row's background from its edges."""
    left, top, right, bottom = box
    pixels = img.load()
    for y in range(top, bottom):
        a, b = pixels[left - 1, y], pixels[right, y]
        for x in range(left, right):
            pixels[x, y] = a if x < (left + right) // 2 else b


def select_board() -> Image.Image:
    """Hackerman's select screen with 32 px skill slots, and the card's pedestal with effects for scale."""
    base = native_ref("current-character-select.png")
    select = base.copy()
    for row, skill in enumerate(ORDER[0:2]):
        # Today's layout spaces names for 24 px slots; the 32 px slot steps left so the names stay clear.
        review.paste(select, review.slot(icon_frames(skill)[0], "indigo" if row == 0 else "steel"), 164, 130 + row * 34)
    sheets = {skill: sheet_map(skill) for skill in ORDER}
    card = (23, 19, 141, 207)
    pedestals = []
    for hero, draw in (
        ("hackerman", lambda img: at(img, sheets["agent-summon"]["fx-drone"], "hover", 0, 104, 136)),
        ("artsy", lambda img: (at(img, sheets["power-chord"]["fx-stun"], "orbit", 2, 82, 108), at(img, sheets["ux-elixir"]["fx-potion"], "held", 0, 98, 140))),
        ("strategy", lambda img: at(img, sheets["churn-shield"]["fx-bubble"], "shell", 0, 82, 140)),
    ):
        img = base.copy()
        _erase_todays_hero(img)
        review.place_feet(img, review.standin_hero(hero), 82, 170)
        draw(img)
        pedestals.append((f"pedestal: {hero}", review.upscale(img.crop(card), 3)))
    top = review.labelled([("select screen, 32 px slots (Hackerman)", review.upscale(select, 3))], 1)
    bottom = review.labelled(pedestals, 3)
    board = Image.new("RGB", (max(top.width, bottom.width), top.height + bottom.height), (20, 20, 24))
    board.paste(top, (0, 0))
    board.paste(bottom, (0, top.height))
    return board


def keyframe_board() -> Image.Image:
    """Each skill's signature moment, in a level, at the new hero scale."""
    picks = [
        ("FULL-STACK ATTACK: pierce", full_stack_attack, "scripe", 3),
        ("AGENT SUMMON: fire", agent_summon, "luna", 2),
        ("UX ELIXIR: drink, aha, calm wave", ux_elixir, "scripe", 3),
        ("POWER CHORD: shockwave", power_chord, "scripe", 3),
        ("NORTH STAR: impact", north_star, "luna", 7),
        ("CHURN SHIELD: bump", churn_shield, "luna", 5),
    ]
    tiles = []
    for label, make, level, index in picks:
        frames = make(level)
        tiles.append((label, review.upscale(frames[index][1], 2)))
    return review.labelled(tiles, 2)


def style_board() -> Image.Image:
    """The style reference next to the six icons and key effect frames at the same 1 px = 1 px scale."""
    ref = review.ref_image("style-reference-grid.png")
    panel = Image.new("RGBA", (300, ref.height), (200, 200, 210, 255))
    for i, skill in enumerate(ORDER):
        review.paste(panel, review.slot(icon_frames(skill)[0], "steel"), 8 + (i % 3) * 40, 8 + (i // 3) * 40)
    sheets = {skill: sheet_map(skill) for skill in ORDER}
    picks = [
        ("agent-summon", "fx-drone", "hover", 0, 150, 30),
        ("north-star", "fx-star", "spin", 0, 200, 30),
        ("ux-elixir", "fx-potion", "held", 0, 240, 30),
        ("power-chord", "fx-stun", "orbit", 0, 160, 110),
        ("churn-shield", "fx-bubble", "shell", 0, 60, 200),
        ("full-stack-attack", "fx-beam-hit", "pierce", 2, 160, 170),
        ("north-star", "fx-star-impact", "impact", 1, 240, 200),
        ("ux-elixir", "fx-calm", "heart", 0, 240, 120),
    ]
    for skill, sheet, anim, idx, x, y in picks:
        at(panel, sheets[skill][sheet], anim, idx, x, y)
    beam = sheets["full-stack-attack"]["fx-beam"]
    for x in range(140, 300, 16):
        at(panel, beam, "sustain", 0, x, 280)
    at(panel, sheets["full-stack-attack"]["fx-beam-muzzle"], "sustain", 0, 140, 280)
    board = Image.new("RGBA", (ref.width + panel.width + 8, ref.height), (20, 20, 24, 255))
    board.alpha_composite(ref, (0, 0))
    board.alpha_composite(panel, (ref.width + 8, 0))
    return review.upscale(board, 3)


def write_contacts() -> List[Path]:
    """Contact sheets of every animation of every sheet, frames numbered, on dark and mid backgrounds."""
    paths = []
    directory = OUT / "contacts"
    directory.mkdir(parents=True, exist_ok=True)
    for skill in ORDER:
        for sheet in SKILLS[skill].sheets():
            scale = 6 if sheet.frame[0] <= 16 else (4 if sheet.frame[0] <= 40 else 3)
            path = directory / f"{skill}-{sheet.name}.png"
            review.contact_sheet(sheet, scale=scale).save(path)
            paths.append(path)
    return paths


BOARDS: Dict[str, Callable[[], Image.Image]] = {
    "keyframes": keyframe_board,
    "icons": icon_board,
    "hud": hud_board,
    "select": select_board,
    "style": style_board,
}


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("names", nargs="*", default=list(MOCKUPS) + list(BOARDS) + ["contacts"], help="skill ids, boards and/or 'contacts'")
    parser.add_argument("--level", default="scripe", choices=("scripe", "luna"))
    parser.add_argument("--scale", type=int, default=2)
    args = parser.parse_args(argv)
    OUT.mkdir(parents=True, exist_ok=True)
    for name in args.names:
        if name == "contacts":
            for path in write_contacts():
                print(path)
            continue
        if name in BOARDS:
            path = OUT / f"board-{name}.png"
            try:
                BOARDS[name]().save(path)
            except FileNotFoundError as missing:
                print(f"skipped board {name}: {missing}")
                continue
            print(path)
            continue
        frames = MOCKUPS[name](args.level)
        print(save_sheet(f"{name}-{args.level}", frames, args.scale))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
