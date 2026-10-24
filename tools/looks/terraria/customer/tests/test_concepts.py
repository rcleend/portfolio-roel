"""The committed customer concepts keep their promises: the generator's output, crisp, Terraria-built, ready to animate.

    python3 -m unittest discover -s tools/looks/terraria/customer -t tools/looks/terraria/customer
"""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

from PIL import Image

TOOL = Path(__file__).resolve().parents[1]
ART = TOOL.parents[3] / 'src' / 'game' / 'art' / 'looks' / 'terraria' / 'customer-concepts'
for path in (TOOL, TOOL.parent):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from customer_kit import one_star  # noqa: E402
from customer_kit.art import DESIGN_AT, GROUND, paint  # noqa: E402
from customer_kit.concepts import CONCEPTS, KEY_POSES  # noqa: E402
from customer_kit.palette import RAMPS  # noqa: E402
from customer_kit.rig import hung, pose  # noqa: E402

# The Terraria heroes stand about 30 px tall (docs/LOOKS.md); a customer stands in the same world.
HEIGHT = (28, 32)
# Terraria's own figures use 24 to 36 colours, the heroes' sheets 33 to 46.
COLOURS = 40
FEET_ROW = DESIGN_AT[1] + GROUND


def load(concept: str) -> Tuple[Image.Image, Dict[str, Any]]:
    with Image.open(ART / f'{concept}.png') as image:
        return image.convert('RGBA'), json.loads((ART / f'{concept}.json').read_text())


def frame(image: Image.Image, meta: Dict[str, Any], name: str) -> Image.Image:
    w, h = meta['frame']['w'], meta['frame']['h']
    row = [animation['name'] for animation in meta['animations']].index(name)
    return image.crop((0, row * h, w, (row + 1) * h))


def body(concept: str, name: str) -> Image.Image:
    """The pose without its effects (steam, an anger mark), which float free of the figure by design."""
    module = CONCEPTS[concept]
    return paint(pose(module.FIGURE, module.POSES[name]._replace(effects=()), concept).strokes, concept)


def parts(picture: Image.Image) -> List[Set[Tuple[int, int]]]:
    """The picture's opaque pixels in 8-connected parts."""
    alpha = picture.getchannel('A')
    return parts_of({(x, y) for y in range(picture.height) for x in range(picture.width) if alpha.getpixel((x, y))})


def parts_of(points: Set[Tuple[int, int]]) -> List[Set[Tuple[int, int]]]:
    """`points` in 8-connected parts."""
    todo, found = set(points), []
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
        found.append(part)
    return found


def rgba(value: str) -> Tuple[int, int, int, int]:
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), 255


OUTLINES = {rgba(ramp[0]) for ramp in RAMPS.values()}


class CommittedSheets(unittest.TestCase):
    def test_are_what_the_generator_writes(self) -> None:
        result = subprocess.run(
            [sys.executable, str(TOOL / 'generate.py'), '--check'], capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_hold_both_key_poses_on_the_feet_line_crisply(self) -> None:
        for concept in CONCEPTS:
            image, meta = load(concept)
            self.assertEqual([animation['name'] for animation in meta['animations']], list(KEY_POSES), concept)
            self.assertEqual(meta['frame'], {'w': 64, 'h': 64}, concept)
            self.assertEqual(meta['origin'], {'x': 32, 'y': 64}, concept)
            self.assertLessEqual(set(image.getchannel('A').getdata()), {0, 255}, concept)
            for name in KEY_POSES:
                picture = frame(image, meta, name)
                self.assertEqual(picture.getbbox()[3] - 1, FEET_ROW, f'{concept} {name}')
                anchors = next(a for a in meta['animations'] if a['name'] == name)['anchors']
                self.assertEqual(sorted(anchors), ['head', 'mouth'], f'{concept} {name}')

    def test_use_a_small_palette(self) -> None:
        for concept in CONCEPTS:
            image, meta = load(concept)
            for name in KEY_POSES:
                colours = {pixel for pixel in frame(image, meta, name).getdata() if pixel[3]}
                self.assertLessEqual(len(colours), COLOURS, f'{concept} {name}')


class Figures(unittest.TestCase):
    def test_stand_as_tall_as_the_terraria_heroes(self) -> None:
        for concept in CONCEPTS:
            for name in KEY_POSES:
                box = body(concept, name).getbbox()
                self.assertGreaterEqual(box[3] - box[1], HEIGHT[0], f'{concept} {name}')
                self.assertLessEqual(box[3] - box[1], HEIGHT[1], f'{concept} {name}')

    def test_are_each_one_figure(self) -> None:
        for concept in CONCEPTS:
            for name in KEY_POSES:
                self.assertEqual(len(parts(body(concept, name))), 1, f'{concept} {name}')

    def test_outline_every_material_in_its_own_darkest_tone(self) -> None:
        """As Terraria does: every pixel on the figure's edge is the outline of the ramp it is painted from."""
        for concept in CONCEPTS:
            for name in KEY_POSES:
                picture = body(concept, name)
                pixels = picture.load()
                w, h = picture.size
                for y in range(h):
                    for x in range(w):
                        if not pixels[x, y][3]:
                            continue
                        edge = any(
                            not (0 <= x + dx < w and 0 <= y + dy < h) or not pixels[x + dx, y + dy][3]
                            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                        )
                        if edge:
                            self.assertIn(pixels[x, y], OUTLINES, f'{concept} {name} at {(x, y)}')

    def test_turn_calm_when_won_over(self) -> None:
        for concept, module in CONCEPTS.items():
            unhappy, happy = (module.POSES[name] for name in KEY_POSES)
            self.assertEqual((unhappy.mood, happy.mood), ('unhappy', 'happy'), concept)
            self.assertNotEqual(module.FIGURE.skin['unhappy'], module.FIGURE.skin['happy'], concept)
            self.assertEqual(happy.effects, (), f'{concept}: a happy customer neither steams nor fumes')

    def test_flush_in_the_face_but_not_the_hands(self) -> None:
        """Red hands read as gloves and swallow what they hold: they only warm while the face flushes."""
        for concept, module in CONCEPTS.items():
            figure = module.FIGURE
            self.assertNotEqual(figure.hands['unhappy'], figure.skin['unhappy'], concept)
            self.assertEqual(figure.hands['happy'], figure.skin['happy'], f'{concept}: calm hands match the face')


class Screens(unittest.TestCase):
    def test_read_the_same_when_the_game_mirrors_the_customer(self) -> None:
        """A customer faces the player, mirrored about half the time, so every glyph on one-star's tablet is
        symmetric: mirrored, the screen shows the same 1, star or five stars, only in the other order."""
        for name, prop in one_star.FIGURE.props.items():
            glyphs = {
                (x, y) for x, y, (ramp, index) in prop.drawing.pixels if ramp == 'star' or (ramp, index) == ('screen', 3)
            }
            self.assertTrue(glyphs, name)
            for glyph in parts_of(glyphs):
                left, right = min(x for x, _ in glyph), max(x for x, _ in glyph)
                mirrored = {(left + right - x, y) for x, y in glyph}
                self.assertEqual(mirrored, glyph, f'{name}: a glyph at x {left}-{right} reads differently mirrored')



class Rig(unittest.TestCase):
    def test_hangs_every_drawing_from_its_joint(self) -> None:
        """Every limb drawn, posed or not, joins the body where the standing one does, ready for new poses."""
        for concept, module in CONCEPTS.items():
            figure = module.FIGURE
            joints = figure.torso[0].drawing
            for side, arms in (('near', figure.near_arms), ('far', figure.far_arms)):
                for name, arm in arms.items():
                    with self.subTest(concept=concept, arm=f'{side} {name}'):
                        hung(arm, 'shoulder', joints.point(f'{side} shoulder'), concept)
                        arm.point('hand')
            for name, legs in figure.legs.items():
                with self.subTest(concept=concept, legs=name):
                    self.assertTrue(legs.covers(joints.point('hips')))
            for name, prop in figure.props.items():
                with self.subTest(concept=concept, prop=name):
                    prop.drawing.point('grip')

    def test_carries_the_upper_body_with_its_bob(self) -> None:
        """Moving the body moves the head, the arms and what they hold, and leaves the legs on the ground."""
        for concept, module in CONCEPTS.items():
            standing = module.POSES['shout']
            bobbed = pose(module.FIGURE, standing._replace(body=(0, 1)), concept)
            still = pose(module.FIGURE, standing, concept)
            self.assertEqual(bobbed.head.point('crown')[1], still.head.point('crown')[1] + 1, concept)
            for hand in ('near', 'far'):
                self.assertEqual(bobbed.hands[hand][1], still.hands[hand][1] + 1, f'{concept} {hand}')


if __name__ == '__main__':
    unittest.main()
