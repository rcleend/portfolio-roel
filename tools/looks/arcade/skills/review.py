#!/usr/bin/env python3
"""Review renders for the arcade skill art (nothing here ships).

    python3 tools/looks/arcade/skills/review.py icons            # the set in its slots, 1x and 4x, plus idle loops
    python3 tools/looks/arcade/skills/review.py strips           # every strip as a contact sheet, 4x
    python3 tools/looks/arcade/skills/review.py scenes           # key frames of each effect in both levels
    python3 tools/looks/arcade/skills/review.py --out DIR ...    # default: /tmp/arcade-looks-arcade-skills/review

The renders read the built PNG + JSON files, exactly what the game will load.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from pixkit import stage  # noqa: E402
from pixkit.canvas import Sprite  # noqa: E402
from skillart import SKILLS  # noqa: E402

ASSETS = HERE.parents[3] / "src/game/art/looks/arcade/skills"
DEFAULT_OUT = Path("/tmp/arcade-looks-arcade-skills/review")


class LoadedStrip:
    """A built strip read back from disk: its manifest and every frame as a ``Sprite``."""

    def __init__(self, png: Path) -> None:
        self.name = png.stem
        self.manifest = json.loads(png.with_suffix(".json").read_text())
        image = Image.open(png).convert("RGBA")
        w, h = self.manifest["frame"]["w"], self.manifest["frame"]["h"]
        self.origin: Tuple[int, int] = (self.manifest["origin"]["x"], self.manifest["origin"]["y"])
        self.frames: Dict[str, List[Sprite]] = {}
        for row, animation in enumerate(self.manifest["animations"]):
            self.frames[animation["name"]] = [
                Sprite.from_image(image.crop((col * w, row * h, col * w + w, row * h + h)))
                for col in range(animation["frames"])
            ]

    def animation(self, name: str) -> dict:
        return next(a for a in self.manifest["animations"] if a["name"] == name)


def load(skill_id: str, name: str) -> LoadedStrip:
    return LoadedStrip(ASSETS / skill_id / f"{name}.png")


def icons(out: Path) -> Path:
    loaded = [load(skill_id, "icon") for skill_id in SKILLS]
    rest = [strip.frames["idle"][0] for strip in loaded]
    one_x = stage.stack(
        [
            stage.stack([stage.icon_in_slot(icon, theme) for icon in rest], gap=3, horizontal=True)
            for theme in ("steel", "indigo")
        ],
        gap=3,
    )
    four_x = stage.upscale(stage.stack([stage.icon_in_slot(icon) for icon in rest], gap=3, horizontal=True), 4)
    loops = [
        stage.label(stage.filmstrip(strip.frames["idle"], scale=3, background="#242838"), skill_id)
        for skill_id, strip in zip(SKILLS, loaded)
    ]
    sheet = stage.stack(
        [
            stage.label(stage.upscale(one_x, 2), "1x in steel and lit slots (shown 2x)"),
            stage.label(four_x, "4x"),
            *loops,
        ],
        gap=6,
    )
    path = out / "icons.png"
    sheet.save(path)
    return path


def strips(out: Path) -> List[Path]:
    paths: List[Path] = []
    for skill_id in SKILLS:
        rows = []
        for png in sorted((ASSETS / skill_id).glob("fx-*.png")):
            strip = LoadedStrip(png)
            for animation in strip.manifest["animations"]:
                frames = strip.frames[animation["name"]]
                timing = f"{animation['fps']} fps  {'loop' if animation['loop'] else 'once'}"
                caption = f"{strip.name}/{animation['name']}  {timing}"
                rows.append(stage.label(stage.filmstrip(frames, scale=4, guides=strip.origin), caption))
        if rows:
            path = out / f"strips-{skill_id}.png"
            stage.stack(rows, gap=6).save(path)
            paths.append(path)
    return paths


# ── Key frames in a level ───────────────────────────────────────────────────
#
# Each skill's beat sheet staged on a real level backdrop with a 58 px hero
# and customers (stand-ins unless --hero/--customer give 64 x 64 frames), so
# scale and readability are judged where they matter.

HERO_X, FEET = 84, 200
CUSTOMERS = (172, 232, 288)


class Cast:
    #: Where the hero's ``hand`` anchor is in the staged pose, in screen pixels (None: the stand-in's default).
    hand: Optional[Tuple[int, int]] = None

    def __init__(self, hero: Optional[Path], customer: Optional[Path]) -> None:
        self.hero = Sprite.from_image(Image.open(hero)) if hero else stage.mannequin(58, coat="#1e1e2c")
        self.customer = (
            Sprite.from_image(Image.open(customer))
            if customer
            else stage.mannequin(56, coat="#c8501c", skin="#f08a6a", hair="#c8c8d0")
        )

    def stage(self, level: str, customers: Sequence[int] = CUSTOMERS) -> stage.Scene:
        scene = stage.Scene(level)
        scene.place(self.hero, HERO_X, FEET, (32, 64))
        for x in customers:
            scene.place(self.customer, x, FEET, (32, 64), flip=True)
        return scene


def _frame(strip: LoadedStrip, animation: str, index: int) -> Sprite:
    frames = strip.frames[animation]
    return frames[min(index, len(frames) - 1)]


def full_stack_attack_keys(cast: Cast, level: str) -> List[Tuple[str, Image.Image]]:
    beam, head, muzzle = (
        load("full-stack-attack", "fx-beam"),
        load("full-stack-attack", "fx-beam-head"),
        load("full-stack-attack", "fx-muzzle"),
    )
    hit, bits = load("full-stack-attack", "fx-hit"), load("full-stack-attack", "fx-bits")
    hand = (HERO_X + 14, FEET - 30)
    keys = []

    def lay_beam(scene: stage.Scene, length: int, animation: str, index: int, with_head: bool) -> None:
        x = hand[0]
        segment = _frame(beam, animation, index)
        end = hand[0] + length
        while x < end:
            piece = Sprite(min(segment.width, end - x), segment.height)
            piece.blit(segment)
            scene.place(piece, x, hand[1], beam.origin)
            x += segment.width
        if with_head:
            scene.place(_frame(head, "head", index), end, hand[1], head.origin)

    s = cast.stage(level)
    s.place(_frame(muzzle, "charge", 0), *hand, muzzle.origin)
    keys.append(("t=1 charge", s.image))
    s = cast.stage(level)
    s.place(_frame(muzzle, "charge", 1), *hand, muzzle.origin)
    keys.append(("t=3 impact frame", s.image))
    s = cast.stage(level)
    lay_beam(s, 120, "fire", 0, True)
    s.place(_frame(muzzle, "charge", 2), *hand, muzzle.origin)
    keys.append(("t=4 beam racing out", s.image))
    s = cast.stage(level)
    lay_beam(s, 320 - hand[0], "fire", 1, False)
    s.place(_frame(muzzle, "flare", 0), *hand, muzzle.origin)
    for i, x in enumerate(CUSTOMERS):
        s.place(_frame(hit, "hit", 1 + i), x, FEET - 30, hit.origin)
    keys.append(("t=12 full beam, hits", s.image))
    s = cast.stage(level)
    lay_beam(s, 320 - hand[0], "collapse", 1, False)
    s.place(_frame(muzzle, "smoke", 1), *hand, muzzle.origin)
    for i, x in enumerate(CUSTOMERS):
        s.place(_frame(hit, "hit", 4 + i % 2), x, FEET - 30, hit.origin)
        s.place(_frame(bits, "variants", i * 3), x - 10 - i * 3, FEET - 44 + i * 4, bits.origin)
        s.place(_frame(bits, "variants", i * 3 + 1), x + 9, FEET - 48 + i * 2, bits.origin)
    keys.append(("t=30 collapse, smoke", s.image))
    return keys


def agent_summon_keys(cast: Cast, level: str) -> List[Tuple[str, Image.Image]]:
    drone, shot, zap, circle = (
        load("agent-summon", n) for n in ("fx-drone", "fx-drone-shot", "fx-drone-zap", "fx-summon-circle")
    )
    centre = (HERO_X, FEET - 14)

    def orbit(angle_degrees: float) -> Tuple[int, int]:
        a = math.radians(angle_degrees)
        return round(centre[0] + math.cos(a) * 22), round(centre[1] - 22 + math.sin(a) * 6)

    keys = []
    spawn = orbit(0)
    s = cast.stage(level)
    s.place(_frame(circle, "open", 1), spawn[0], spawn[1] + 12, circle.origin)
    s.place(_frame(drone, "summon", 1), *spawn, drone.origin)
    keys.append(("t=0.05 summon column", s.image))
    s = cast.stage(level)
    s.place(_frame(circle, "open", 4), spawn[0], spawn[1] + 12, circle.origin)
    s.place(_frame(drone, "summon", 4), *spawn, drone.origin)
    keys.append(("t=0.2 drone prints in", s.image))
    # Behind the hero on the far half of the orbit.
    s = stage.Scene(level)
    behind = orbit(-90)
    s.place(_frame(drone, "hover", 3), *behind, drone.origin)
    s.place(cast.hero, HERO_X, FEET, (32, 64))
    for x in CUSTOMERS:
        s.place(cast.customer, x, FEET, (32, 64), flip=True)
    keys.append(("t=1.2 orbiting behind", s.image))
    s = cast.stage(level)
    front = orbit(90)
    s.place(_frame(drone, "hover", 6), *front, drone.origin)
    keys.append(("t=1.6 orbiting in front", s.image))
    s = cast.stage(level)
    at = orbit(10)
    s.place(_frame(drone, "fire", 1), *at, drone.origin)
    target = (CUSTOMERS[0], FEET - 30)
    for i, f in enumerate((0.25, 0.45, 0.65)):
        x = round(at[0] + (target[0] - at[0]) * f)
        y = round(at[1] + (target[1] - at[1]) * f)
        s.place(_frame(shot, "trail", 2 - i), x - 4, y, shot.origin)
    s.place(
        _frame(shot, "fly", 0),
        round(at[0] + (target[0] - at[0]) * 0.8),
        round(at[1] + (target[1] - at[1]) * 0.8),
        shot.origin,
    )
    s.place(_frame(zap, "hit", 1), CUSTOMERS[1], FEET - 32, zap.origin)
    keys.append(("t=2.4 firing, a zap", s.image))
    s = cast.stage(level)
    s.place(_frame(drone, "dismiss", 2), *orbit(140), drone.origin)
    keys.append(("t=7.8 warp out", s.image))
    return keys


def ripple(scene: stage.Scene, cx: int, cy: int, rx: int, ry: int, tones: Sequence[str]) -> None:
    """A stand-in for the code-drawn ring a skill sends out: concentric 1 px ellipses in stepped tones."""
    from pixkit.canvas import ring as ring_mask

    art = Sprite(320, 240)
    for i, tone in enumerate(tones):
        art.fill(ring_mask(cx, cy, rx - i * 2, ry - i, 1), tone)
    scene.place(art, 0, 0)


def ux_elixir_keys(cast: Cast, level: str) -> List[Tuple[str, Image.Image]]:
    from pixkit.palette import PINK

    potion, glint, calm = (load("ux-elixir", n) for n in ("fx-potion", "fx-glint", "fx-calm"))
    hand, head = cast.hand or (HERO_X + 9, FEET - 38), (HERO_X + 3, FEET - 49)
    # The flask tips towards the face: drawn for a hand in front of it, mirrored when the hand is behind.
    behind = hand[0] < head[0]
    keys = []
    s = cast.stage(level)
    s.place(_frame(potion, "appear", 2), *hand, potion.origin, flip=behind)
    keys.append(("t=0.07 potion pops into hand", s.image))
    s = cast.stage(level)
    s.place(_frame(potion, "drink", 2), *hand, potion.origin, flip=behind)
    keys.append(("t=0.2 drinking", s.image))
    s = cast.stage(level)
    s.place(_frame(potion, "drink", 5), *hand, potion.origin, flip=behind)
    s.place(_frame(glint, "twinkle", 3), *head, glint.origin)
    keys.append(("t=0.35 the glint", s.image))
    s = cast.stage(level)
    s.place(_frame(potion, "pop", 2), *hand, potion.origin, flip=behind)
    ripple(s, HERO_X, FEET - 4, 70, 12, [PINK.light, PINK.mid, PINK.dark])
    keys.append(("t=0.5 bottle pops, calm spreads", s.image))
    s = cast.stage(level)
    for i, x in enumerate(CUSTOMERS):
        s.place(_frame(calm, "heart", i), x, FEET - 64, calm.origin)
        s.place(_frame(calm, "wave", i), x + 9, FEET - 54 - i, calm.origin)
        s.place(_frame(calm, "sparkle", 2 - i % 2), x - 9, FEET - 42 + i * 3, calm.origin)
    keys.append(("t=2.0 customers calm", s.image))
    return keys


def power_chord_keys(cast: Cast, level: str) -> List[Tuple[str, Image.Image]]:
    from pixkit.palette import LAVENDER, WHITE

    strum, wave, stun, notes = (load("power-chord", n) for n in ("fx-strum", "fx-wave", "fx-stun", "fx-notes"))
    body = (HERO_X + 5, FEET - 24)
    keys = []
    s = cast.stage(level)
    s.place(_frame(strum, "strum", 0), *body, strum.origin)
    keys.append(("t=0 the pick hits the strings", s.image))
    s = cast.stage(level)
    s.place(_frame(strum, "strum", 1), *body, strum.origin)
    keys.append(("t=0.03 impact frame", s.image))
    s = cast.stage(level)
    ripple(s, HERO_X, FEET - 28, 64, 64, [WHITE, LAVENDER.pale, LAVENDER.light])
    s.place(_frame(strum, "strum", 3), *body, strum.origin)
    s.place(_frame(wave, "travel", 0), HERO_X + 52, FEET, wave.origin)
    s.place(_frame(wave, "travel", 2), HERO_X - 52, FEET, wave.origin, flip=True)
    for i, (dx, dy) in enumerate(((20, -48), (-16, -54), (30, -36))):
        s.place(_frame(notes, "variants", i), body[0] + dx, body[1] + dy, notes.origin)
    keys.append(("t=0.12 rings, sound walls, notes", s.image))
    s = cast.stage(level)
    ripple(s, HERO_X, FEET - 28, 150, 150, [LAVENDER.pale, LAVENDER.light])
    s.place(_frame(strum, "strum", 6), *body, strum.origin)
    s.place(_frame(wave, "travel", 1), HERO_X + 150, FEET, wave.origin)
    for i, x in enumerate(CUSTOMERS):
        s.place(_frame(stun, "spin", i * 3), x, FEET - 58, stun.origin)
    keys.append(("t=0.3 wave passes, customers stunned", s.image))
    s = cast.stage(level)
    for i, x in enumerate(CUSTOMERS):
        s.place(_frame(stun, "spin", i * 2 + 1), x, FEET - 58, stun.origin)
    keys.append(("t=1.5 stunned for 3 s", s.image))
    return keys


def north_star_keys(cast: Cast, level: str) -> List[Tuple[str, Image.Image]]:
    star, trail, lock, impact = (
        load("north-star", n) for n in ("fx-star", "fx-star-trail", "fx-star-lock", "fx-star-impact")
    )
    launch = (HERO_X + 8, FEET - 30)
    target = (CUSTOMERS[1], FEET - 30)
    keys = []
    s = cast.stage(level)
    s.place(_frame(star, "launch", 1), *launch, star.origin)
    keys.append(("t=0.03 launch flash", s.image))
    # A homing arc: up and forward, then curling down onto the most frustrated customer.
    path = [(launch[0] + 6 * i, launch[1] - round(34 * math.sin(i / 14 * math.pi))) for i in range(15)]
    s = cast.stage(level)
    for age, point in enumerate(reversed(path[:9])):
        if age % 2 == 0:
            s.place(_frame(trail, "sparkle", age // 2), *point, trail.origin)
    s.place(_frame(lock, "lock", 1), *target, lock.origin)
    s.place(_frame(star, "spin", 2), *path[9], star.origin)
    keys.append(("t=0.45 homing, target locked", s.image))
    s = cast.stage(level)
    s.place(_frame(lock, "lock", 3), *target, lock.origin)
    s.place(_frame(impact, "burst", 1), *target, impact.origin)
    keys.append(("t=0.9 arrival", s.image))
    s = cast.stage(level)
    s.place(_frame(impact, "burst", 4), *target, impact.origin)
    keys.append(("t=1.0 star ring", s.image))
    return keys


def churn_shield_keys(cast: Cast, level: str) -> List[Tuple[str, Image.Image]]:
    shell, bump = load("churn-shield", "fx-shield"), load("churn-shield", "fx-shield-bump")
    centre = (HERO_X, FEET - 29)
    keys = []
    s = cast.stage(level, customers=(150, 232, 288))
    s.place(_frame(shell, "form", 1), *centre, shell.origin)
    keys.append(("t=0.03 bubble forms", s.image))
    s = cast.stage(level, customers=(150, 232, 288))
    s.place(_frame(shell, "form", 3), *centre, shell.origin)
    keys.append(("t=0.1 overshoot", s.image))
    s = cast.stage(level, customers=(122, 232, 288))
    s.place(_frame(shell, "hold", 2), *centre, shell.origin)
    s.place(_frame(bump, "bump", 1), centre[0] + 31, centre[1], bump.origin)
    keys.append(("t=1.5 a customer bumps it", s.image))
    s = cast.stage(level, customers=(150, 232, 288))
    s.place(_frame(shell, "wobble", 0), *centre, shell.origin)
    keys.append(("t=4.4 wobble warning", s.image))
    s = cast.stage(level, customers=(150, 232, 288))
    s.place(_frame(shell, "pop", 2), *centre, shell.origin)
    keys.append(("t=5.0 pop", s.image))
    return keys


KEYFRAMES = {
    "north-star": north_star_keys,
    "churn-shield": churn_shield_keys,
    "full-stack-attack": full_stack_attack_keys,
    "agent-summon": agent_summon_keys,
    "ux-elixir": ux_elixir_keys,
    "power-chord": power_chord_keys,
}


def scenes(out: Path, cast: Cast, only: Sequence[str]) -> List[Path]:
    paths: List[Path] = []
    for skill_id, script in KEYFRAMES.items():
        if only and skill_id not in only:
            continue
        for level in ("scripe", "luna"):
            keys = script(cast, level)
            tiles = [stage.label(stage.upscale(image, 2), caption) for caption, image in keys]
            rows = [stage.stack(tiles[i : i + 2], gap=4, horizontal=True) for i in range(0, len(tiles), 2)]
            path = out / f"scene-{skill_id}-{level}.png"
            stage.stack(rows, gap=4).save(path)
            paths.append(path)
    return paths


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("what", nargs="+", choices=["icons", "strips", "scenes"])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--only", nargs="*", default=[], help="skill ids for scenes")
    parser.add_argument("--hero", type=Path, help="a 64 x 64 hero frame to stage effects with")
    parser.add_argument("--customer", type=Path, help="a 64 x 64 customer frame")
    parser.add_argument(
        "--hand",
        type=int,
        nargs=2,
        metavar=("X", "Y"),
        help="the hero frame's hand anchor in frame pixels (origin 32, 64)",
    )
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    if "icons" in args.what:
        print(icons(args.out))
    if "strips" in args.what:
        for path in strips(args.out):
            print(path)
    if "scenes" in args.what:
        cast = Cast(args.hero, args.customer)
        if args.hand:
            cast.hand = (HERO_X + args.hand[0] - 32, FEET + args.hand[1] - 64)
        for path in scenes(args.out, cast, args.only):
            print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
