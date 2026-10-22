#!/usr/bin/env python3
"""Builds the hibit look's characters, attacks and customer into src/game/art/looks/hibit/.

  python3 tools/looks/hibit/characters/build.py            # everything
  python3 tools/looks/hibit/characters/build.py artsy      # one hero (sheet + attack)
  python3 tools/looks/hibit/characters/build.py customer

Deterministic: the same code always writes the same PNG and JSON bytes. Python 3.9+ and
Pillow only. Review renders live in review.py; nothing here writes outside the art folder.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from hibit import customer, effects  # noqa: E402
from hibit.compose import Rendered, render_sequence  # noqa: E402
from hibit.heroes import ANIMATIONS, FPS, HEROES, LOOP, arm_smear, frames_for  # noqa: E402
from hibit.sheet import MAX_COLOURS, Animation, Sheet, colours, unify_palette, write  # noqa: E402

REPO = HERE.parents[3]
OUT = REPO / "src" / "game" / "art" / "looks" / "hibit"


def render_hero(hero_id: str) -> Dict[str, List[Rendered]]:
    hero = HEROES[hero_id]
    out: Dict[str, List[Rendered]] = {}
    for anim in ANIMATIONS:
        specs = frames_for(hero, anim)
        out[anim] = render_sequence(hero.character, specs, arm_smear(hero.sleeve), loop=LOOP[anim])
    return out


def hero_sheet(hero_id: str, rendered: Dict[str, List[Rendered]]) -> Sheet:
    animations: List[Animation] = []
    flat = [r.canvas.to_sprite() for anim in ANIMATIONS for r in rendered[anim]]
    unified = unify_palette(flat, MAX_COLOURS)
    cursor = 0
    for anim in ANIMATIONS:
        frames = unified[cursor:cursor + len(rendered[anim])]
        cursor += len(rendered[anim])
        anchors: Dict[str, List[Tuple[int, int]]] = {}
        names = sorted({name for r in rendered[anim] for name in r.anchors})
        for name in names:
            anchors[name] = [r.anchors[name] for r in rendered[anim]]
        animations.append(Animation(anim, FPS[anim], LOOP[anim], frames, anchors))
    return Sheet(64, 64, (32, 64), animations)


def build_hero(hero_id: str) -> None:
    rendered = render_hero(hero_id)
    sheet = hero_sheet(hero_id, rendered)
    png, js = write(sheet, OUT / "characters" / hero_id)
    print(f"{hero_id}: {png.relative_to(REPO)} ({len(colours(sheet.image()))} colours)")


def attack_sheet(hero_id: str) -> Sheet:
    """The hero's basic-attack sprites: a projectile loop, an impact burst, a muzzle flash.

    Artsy's paint comes in the three colours the game cycles through; the plain names
    are the first colour and `-cyan` / `-yellow` the others."""
    anims: List[Animation] = []
    if hero_id == "hackerman":
        anims = [
            Animation("projectile", 20, True, effects.code_projectile()),
            Animation("impact", 24, False, effects.code_impact()),
            Animation("muzzle", 24, False, effects.code_muzzle()),
        ]
    elif hero_id == "artsy":
        for paint in effects.PAINTS:
            suffix = "" if paint is effects.PAINTS[0] else f"-{paint.name}"
            anims += [
                Animation(f"projectile{suffix}", 16, True, effects.paint_projectile(paint)),
                Animation(f"impact{suffix}", 20, False, effects.paint_impact(paint)),
                Animation(f"muzzle{suffix}", 24, False, effects.paint_muzzle(paint)),
            ]
    elif hero_id == "strategy":
        anims = [
            Animation("projectile", 20, True, effects.note_projectile()),
            Animation("impact", 20, False, effects.note_impact()),
            Animation("muzzle", 24, False, effects.note_muzzle()),
        ]
    return Sheet(effects.SIZE, effects.SIZE, effects.CENTRE, anims)


def build_attack(hero_id: str) -> None:
    sheet = attack_sheet(hero_id)
    png, _ = write(sheet, OUT / "characters" / hero_id, stem="attack")
    print(f"{hero_id} attack: {png.relative_to(REPO)} ({len(colours(sheet.image()))} colours)")


def build_customer() -> None:
    animations: List[Animation] = []
    rendered = {anim: render_sequence(customer.CHARACTER, customer.frames_for(anim), loop=customer.LOOP[anim])
                for anim in customer.ANIMATIONS}
    flat = [r.canvas.to_sprite() for anim in customer.ANIMATIONS for r in rendered[anim]]
    unified = unify_palette(flat, MAX_COLOURS)
    cursor = 0
    for anim in customer.ANIMATIONS:
        count = len(rendered[anim])
        animations.append(Animation(anim, customer.FPS[anim], customer.LOOP[anim], unified[cursor:cursor + count]))
        cursor += count
    sheet = Sheet(64, 64, (32, 64), animations)
    png, _ = write(sheet, OUT / "customer")
    print(f"customer: {png.relative_to(REPO)} ({len(colours(sheet.image()))} colours)")


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("targets", nargs="*", help="hero ids and/or 'customer' (default: all)")
    args = parser.parse_args(argv)
    targets = args.targets or [*HEROES, "customer"]
    for target in targets:
        if target in HEROES:
            build_hero(target)
            build_attack(target)
        elif target == "customer":
            build_customer()
        else:
            parser.error(f"unknown target {target!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
