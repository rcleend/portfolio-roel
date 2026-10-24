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
                if animation.name in ('attack', 'skill'):
                    continue
                for index, frame in enumerate(animation.frames):
                    self.assertEqual(frame.pose.props, (), f'{hero} {animation.name}[{index}] holds something')


if __name__ == '__main__':
    unittest.main()
