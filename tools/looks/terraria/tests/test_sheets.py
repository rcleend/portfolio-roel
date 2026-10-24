"""The committed Terraria sheets keep the look's promises (docs/LOOKS.md): crisp, on the feet line, one head.

    python3 -m unittest discover -s tools/looks/terraria -t tools/looks/terraria
"""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Tuple

from PIL import Image

TOOL = Path(__file__).resolve().parents[1]
ART = TOOL.parents[2] / 'src' / 'game' / 'art' / 'looks' / 'terraria' / 'characters'
if str(TOOL) not in sys.path:
    sys.path.insert(0, str(TOOL))

from generate import animations  # noqa: E402
from kit.body import EAR, EYES, GLASSES, HEAD  # noqa: E402
from kit.outfits import OUTFITS  # noqa: E402
from kit.pose import strokes  # noqa: E402

HEROES = ('hackerman', 'artsy', 'strategy')
# What the game shows on the ground: the moves it only plays planted, and the ground frames of the rest.
PLANTED = ('idle', 'run', 'attack', 'skill')


def load(hero: str, stem: str) -> Tuple[Image.Image, Dict[str, Any]]:
    with Image.open(ART / hero / f'{stem}.png') as image:
        return image.convert('RGBA'), json.loads((ART / hero / f'{stem}.json').read_text())


def frames(image: Image.Image, meta: Dict[str, Any], name: str) -> List[Image.Image]:
    w, h = meta['frame']['w'], meta['frame']['h']
    row = [a['name'] for a in meta['animations']].index(name)
    return [image.crop((i * w, row * h, (i + 1) * w, (row + 1) * h)) for i in range(meta['animations'][row]['frames'])]


# The most pixels a prop's light (a glint, a burst, a summoning mote) may have and float free of the figure.
LIGHT = 12
# The potion's cork, in the maple it is drawn in.
CORK = ('maple', 1)


def figures(frame: Image.Image) -> List[set]:
    """The frame's opaque pixels in 8-connected parts."""
    alpha = frame.getchannel('A')
    todo = {(x, y) for y in range(frame.height) for x in range(frame.width) if alpha.getpixel((x, y))}
    parts = []
    while todo:
        part, edge = set(), [todo.pop()]
        while edge:
            x, y = edge.pop()
            part.add((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if (x + dx, y + dy) in todo:
                        todo.remove((x + dx, y + dy))
                        edge.append((x + dx, y + dy))
        parts.append(part)
    return parts


def opaque_above(frame: Image.Image, row: int) -> int:
    return sum(1 for alpha in frame.crop((0, 0, frame.width, row)).getchannel('A').getdata() if alpha)


class Sheets(unittest.TestCase):
    def test_the_committed_sheets_are_what_the_generator_writes(self) -> None:
        result = subprocess.run([sys.executable, str(TOOL / 'generate.py'), '--check'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_every_pixel_is_opaque_or_empty_in_a_few_dozen_colours(self) -> None:
        for hero in HEROES:
            for stem in ('sheet', 'attack'):
                image, _ = load(hero, stem)
                self.assertLessEqual(set(image.getchannel('A').getdata()), {0, 255}, f'{hero} {stem}')
                colours = {pixel for pixel in image.getdata() if pixel[3]}
                self.assertLessEqual(len(colours), 48, f'{hero} {stem}')

    def test_planted_moves_stand_on_the_feet_line_and_nothing_sinks_below_it(self) -> None:
        for hero in HEROES:
            image, meta = load(hero, 'sheet')
            for animation in meta['animations']:
                for index, frame in enumerate(frames(image, meta, animation['name'])):
                    where = f"{hero} {animation['name']}[{index}]"
                    bottom = frame.getbbox()[3]
                    if animation['name'] in PLANTED:
                        self.assertEqual(bottom, meta['origin']['y'], where)
                    self.assertLessEqual(bottom, meta['origin']['y'], where)

    def test_the_idle_hero_is_no_taller_than_the_classic_ones_and_stands_on_the_origin(self) -> None:
        for hero in HEROES:
            image, meta = load(hero, 'sheet')
            left, top, right, bottom = frames(image, meta, 'idle')[0].getbbox()
            self.assertLessEqual(bottom - top, 31, hero)
            self.assertLess(abs((left + right) / 2 - meta['origin']['x']), 4, hero)


class Poses(unittest.TestCase):
    def test_nothing_rises_above_his_head_in_the_air_or_when_hit_so_only_victory_cheers(self) -> None:
        # Above the top of his skull, three rows under the crown of his hair or cap, a frame may show no more
        # than the standing one does: the hair or cap, never a raised fist.
        for hero in HEROES:
            image, meta = load(hero, 'sheet')
            standing = frames(image, meta, 'idle')[0]
            for animation in meta['animations']:
                if animation['name'] not in ('jump', 'fall', 'hurt'):
                    continue
                crowns = animation['anchors']['head']
                for index, frame in enumerate(frames(image, meta, animation['name'])):
                    skull = crowns[index][1] + 3
                    self.assertEqual(opaque_above(frame, skull), opaque_above(standing, skull),
                                     f"{hero} {animation['name']}[{index}] raises something above his head")

    def test_every_attack_and_skill_moves_on_every_frame(self) -> None:
        # An attack restarts with every shot, so its last frame leads into its first; a skill plays once.
        for hero in HEROES:
            image, meta = load(hero, 'sheet')
            for animation in meta['animations']:
                name = animation['name']
                if not (name == 'attack' or name.startswith('skill')):
                    continue
                strip = frames(image, meta, name)
                pairs = zip(strip, strip[1:] + strip[:1]) if name == 'attack' else zip(strip, strip[1:])
                for index, (before, after) in enumerate(pairs):
                    self.assertNotEqual(before.tobytes(), after.tobytes(), f'{hero} {name}[{index}] is held')

    def test_every_frame_is_one_figure(self) -> None:
        # A torso lifted off its legs, or a limb that misses its joint, splits the figure; only the light a
        # prop gives off (a glint, a burst, summoning motes) may float free of it.
        for hero in HEROES:
            image, meta = load(hero, 'sheet')
            for animation in meta['animations']:
                for index, frame in enumerate(frames(image, meta, animation['name'])):
                    sizes = sorted(len(part) for part in figures(frame))
                    self.assertTrue(all(size <= LIGHT for size in sizes[:-1]),
                                    f"{hero} {animation['name']}[{index}] splits into parts of {sizes} pixels")

    def test_the_designer_drinks_ux_elixir_with_the_cork_at_his_lips(self) -> None:
        elixir = next(animation for animation in animations('artsy') if animation.name == 'skill-ux-elixir')
        for index, frame in enumerate(elixir.frames[1:], start=1):
            cork = [(x + stroke.at[0], y + stroke.at[1]) for stroke in strokes(OUTFITS['artsy'], frame.pose, 'artsy')
                    if stroke.art.name.startswith('potion') for x, y, tone in stroke.art.pixels if tone == CORK]
            mx, my = frame.anchors['mouth']
            self.assertTrue(cork, f'skill-ux-elixir[{index}] has no cork')
            self.assertLessEqual(min(max(abs(x - mx), abs(y - my)) for x, y in cork), 2, f'skill-ux-elixir[{index}]')


class Head(unittest.TestCase):
    def test_every_frame_paints_the_same_head_moved_only_with_the_body(self) -> None:
        head = {HEAD.name, EAR.name, GLASSES.name}
        for hero in HEROES:
            outfit = OUTFITS[hero]
            names = head | {outfit.hair.name} | {part.name for part, _ in outfit.headgear}
            standing = {s.art.name: s.art for s in strokes(outfit, animations(hero)[0].frames[0].pose, hero)}
            for animation in animations(hero):
                for index, frame in enumerate(animation.frames):
                    pose = frame.pose
                    body = (pose.body[0], pose.body[1] - pose.lift)
                    painted = strokes(outfit, pose, hero)
                    for stroke in painted:
                        if stroke.art.name in names:
                            self.assertEqual(stroke.art, standing[stroke.art.name], f'{hero} {animation.name}[{index}]')
                            self.assertEqual(stroke.at, body, f'{hero} {animation.name}[{index}] {stroke.art.name}')
                    eyes = [stroke.art for stroke in painted if stroke.art in EYES.values()]
                    self.assertEqual(len(eyes), 1, f'{hero} {animation.name}[{index}]')

    def test_props_appear_only_while_attacking_or_using_a_skill(self) -> None:
        for hero in HEROES:
            for animation in animations(hero):
                if animation.name == 'attack' or animation.name.startswith('skill'):
                    continue
                for index, frame in enumerate(animation.frames):
                    self.assertEqual(frame.pose.props, (), f'{hero} {animation.name}[{index}] holds something')


if __name__ == '__main__':
    unittest.main()
