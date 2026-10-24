"""The terraria look's customer keeps its promises: ON THE PHONE in the five customer animations, crisp,
Terraria-built and timed the way customer_kit/moves.py says the game holds them.

    python3 -m unittest discover -s tools/looks/terraria/customer -t tools/looks/terraria/customer

That the committed sheet is what the generator writes is test_concepts' first test; the game's own timings are
held by src/game/art/looks/terraria/customer.test.ts.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, Iterator, Tuple

from PIL import Image

TOOL = Path(__file__).resolve().parents[1]
SHEET = TOOL.parents[3] / 'src' / 'game' / 'art' / 'looks' / 'terraria' / 'customer' / 'sheet.png'
for path in (TOOL, TOOL.parent):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from customer_kit import dazed, on_the_phone  # noqa: E402
from customer_kit.art import paint  # noqa: E402
from customer_kit.moves import ANIMATIONS, STANDING, Animation  # noqa: E402
from customer_kit.rig import Pose, pose  # noqa: E402
from tests import test_concepts as concepts  # noqa: E402

NAMES = ['walk', 'shout', 'hurt', 'stunned', 'happy']
LOOPING = {'walk', 'shout', 'stunned', 'happy'}


def load() -> Tuple[Image.Image, Dict[str, Any]]:
    with Image.open(SHEET) as image:
        return image.convert('RGBA'), json.loads(SHEET.with_suffix('.json').read_text())


def frames(image: Image.Image, meta: Dict[str, Any]) -> Iterator[Tuple[str, int, Image.Image, Dict[str, Any]]]:
    w, h = meta['frame']['w'], meta['frame']['h']
    for row, animation in enumerate(meta['animations']):
        for column in range(animation['frames']):
            yield animation['name'], column, image.crop((column * w, row * h, (column + 1) * w, (row + 1) * h)), animation


def body(posed: Pose, where: str) -> Image.Image:
    """The pose without the stars or the anger mark, which float free of the figure by design."""
    return paint(pose(on_the_phone.FIGURE, posed._replace(effects=()), where).strokes, where)


def poses() -> Iterator[Tuple[str, Animation, int, Pose]]:
    for name, animation in ANIMATIONS.items():
        for index, posed in enumerate(animation.frames):
            yield name, animation, index, posed


class Sheet(unittest.TestCase):
    def test_holds_the_five_customer_animations_crisply(self) -> None:
        image, meta = load()
        self.assertEqual([animation['name'] for animation in meta['animations']], NAMES)
        self.assertEqual(meta['frame'], {'w': 64, 'h': 64})
        self.assertEqual(meta['origin'], {'x': 32, 'y': 64})
        self.assertLessEqual(set(image.getchannel('A').getdata()), {0, 255})
        for animation in meta['animations']:
            self.assertEqual(animation['loop'], animation['name'] in LOOPING, animation['name'])
            self.assertEqual(sorted(animation['anchors']), ['head', 'mouth'], animation['name'])

    def test_stands_on_the_feet_line_unless_he_leaves_it(self) -> None:
        """Every frame's feet are on the line, but for the knockback and the hops, which lift him clear of it."""
        image, meta = load()
        lifts = {(name, index): posed.lift for name, _, index, posed in poses()}
        for name, index, picture, _ in frames(image, meta):
            self.assertEqual(picture.getbbox()[3] - 1, concepts.FEET_ROW - lifts[name, index], f'{name}[{index}]')
        self.assertTrue(all(lift == 0 for (name, _), lift in lifts.items() if name in ('walk', 'shout', 'stunned')))

    def test_uses_a_small_palette(self) -> None:
        image, meta = load()
        for name, index, picture, _ in frames(image, meta):
            colours = {pixel for pixel in picture.getdata() if pixel[3]}
            self.assertLessEqual(len(colours), concepts.COLOURS, f'{name}[{index}]')

    def test_marks_the_mouth_on_the_face_and_the_head_on_top(self) -> None:
        """The complaint leaves the mouth, and everything shown above him clears the top of his head."""
        image, meta = load()
        for name, index, picture, animation in frames(image, meta):
            mouth, head = (tuple(animation['anchors'][key][index]) for key in ('mouth', 'head'))
            self.assertEqual(picture.getpixel(mouth)[3], 255, f'{name}[{index}] mouth')
            self.assertLess(head[1], mouth[1], f'{name}[{index}]')


class Figure(unittest.TestCase):
    def test_stands_as_tall_as_the_terraria_heroes_while_he_walks(self) -> None:
        for index, posed in enumerate(ANIMATIONS['walk'].frames):
            box = body(posed, f'walk[{index}]').getbbox()
            self.assertGreaterEqual(box[3] - box[1], concepts.HEIGHT[0], index)
            self.assertLessEqual(box[3] - box[1], concepts.HEIGHT[1], index)

    def test_is_one_figure_outlined_in_its_own_darkest_tones(self) -> None:
        for name, _, index, posed in poses():
            picture = body(posed, f'{name}[{index}]')
            self.assertEqual(len(concepts.parts(picture)), 1, f'{name}[{index}]')
            self.assertEqual(concepts.off_outline(picture), [], f'{name}[{index}]')

    def test_keeps_the_phone_in_hand_in_every_frame(self) -> None:
        for name, _, index, posed in poses():
            self.assertTrue(any(held.prop.startswith('phone') for held in posed.held), f'{name}[{index}]')

    def test_fumes_until_won_over(self) -> None:
        for name, _, index, posed in poses():
            self.assertEqual(posed.mood, 'happy' if name == 'happy' else 'unhappy', f'{name}[{index}]')
            if name == 'happy':
                self.assertEqual(posed.effects, (), f'happy[{index}]: a happy customer neither steams nor fumes')


# How fast a regular customer walks, in px a second (entities/customer/tuning.ts).
WALK_SPEED = 30


def soles(picture: Image.Image) -> list:
    """The runs of pixels on the feet line, left to right, as (first, last) columns: one per foot on the ground."""
    alpha = picture.getchannel('A').load()
    runs, start = [], None
    for x in range(picture.width + 1):
        on = x < picture.width and alpha[x, concepts.FEET_ROW]
        if on and start is None:
            start = x
        if not on and start is not None:
            runs.append((start, x - 1))
            start = None
    return runs


class Motion(unittest.TestCase):
    def test_stands_a_still_customer_on_both_feet(self) -> None:
        """The game stands a customer who is not walking on the frame `walk` shows 1/6 s in: a foot striking."""
        walk = ANIMATIONS['walk']
        self.assertEqual(int(walk.fps / 6), STANDING)
        self.assertTrue(walk.frames[STANDING].legs.endswith(' strike'), walk.frames[STANDING].legs)
        self.assertEqual(len(soles(body(walk.frames[STANDING], 'walk[standing]'))), 2)

    def test_keeps_the_foot_he_stands_on_planted(self) -> None:
        """From striking ahead to pushing off behind, the foot he stands on steps back as fast as he walks, so it
        stays put on the ground: its toe moves less than a pixel against the street over the whole step."""
        walk = ANIMATIONS['walk']
        count = len(walk.frames)
        advance = WALK_SPEED / walk.fps
        pictures = [soles(body(posed, f'walk[{index}]')) for index, posed in enumerate(walk.frames)]
        strikes = [index for index, posed in enumerate(walk.frames) if posed.legs.endswith(' strike')]
        self.assertEqual(len(strikes), 2)
        for strike in strikes:
            # Ahead while it strikes and takes his weight, alone on the ground while the other foot is lifted past it
            # and swung through, behind once the other strikes in turn.
            picks = (max, max, None, None, min)
            toes = []
            for step, pick in enumerate(picks):
                index = (strike + step) % count
                runs = pictures[index]
                if pick is None:
                    self.assertEqual(len(runs), 1, f'walk[{index}]: the other foot is off the ground')
                    run = runs[0]
                else:
                    self.assertEqual(len(runs), 2, f'walk[{index}]: both feet are down')
                    run = pick(runs)
                toes.append(run[1] + advance * step)
            self.assertLessEqual(max(toes) - min(toes), 1, f'walk[{strike}] on: {toes}')

    def test_stomps_on_each_foot_in_a_walk(self) -> None:
        sinks = [index for index, posed in enumerate(ANIMATIONS['walk'].frames) if posed.body[1] > 0]
        self.assertEqual(len(sinks), 2)
        self.assertEqual(sinks[1] - sinks[0], len(ANIMATIONS['walk'].frames) // 2)

    def test_circles_two_stars_round_his_head_while_stunned(self) -> None:
        """Opposite each other, a station further round every frame, so the loop passes every station."""
        shown = [effect for posed in ANIMATIONS['stunned'].frames for effect in posed.effects]
        self.assertEqual(sorted(set(shown)), sorted(dazed.STARS))
        for posed in ANIMATIONS['stunned'].frames:
            self.assertEqual(len(posed.effects), 2)

    def test_never_stands_one_star_over_the_other(self) -> None:
        """The orbit is tilted, so the two stars a frame shows are always a star's width apart across."""
        for index, posed in enumerate(ANIMATIONS['stunned'].frames):
            near, far = (dazed.station(int(name.split()[-1]))[0] for name in posed.effects)
            self.assertGreaterEqual(abs(near - far), dazed.SIZE, f'stunned[{index}]')

    def test_hangs_the_stunned_phone_upside_down(self) -> None:
        """The antenna, the phone's one-pixel column, points at the ground from a limp hand and up from any other."""
        dangling = {held.prop for posed in ANIMATIONS['stunned'].frames for held in posed.held}
        for name, prop in on_the_phone.FIGURE.props.items():
            widths: Dict[int, int] = {}
            for _, y, _ in prop.drawing.pixels:
                widths[y] = widths.get(y, 0) + 1
            antenna = [y for y, width in widths.items() if width == 1]
            grip = prop.drawing.point('grip')[1]
            self.assertTrue(antenna, name)
            self.assertTrue(all((y > grip) == (name in dangling) for y in antenna), name)

    def test_is_knocked_off_his_feet_and_comes_down_to_land(self) -> None:
        lifts = [posed.lift for posed in ANIMATIONS['hurt'].frames]
        self.assertGreaterEqual(lifts[0], 2)
        self.assertEqual(lifts, sorted(lifts, reverse=True))
        self.assertEqual(lifts[-1], 0)

    def test_lunges_past_his_walk_to_yell(self) -> None:
        yell, walk = ANIMATIONS['shout'].frames[0], ANIMATIONS['walk'].frames[STANDING]
        self.assertGreater(yell.body[0] + yell.head[0], walk.body[0] + walk.head[0])

    def test_yells_on_the_first_frame_of_a_shout(self) -> None:
        """The game restarts `shout` as the complaint leaves, so its first frame is the yell."""
        first = ANIMATIONS['shout'].frames[0]
        self.assertEqual((first.face, first.far), ('rant', 'point'))


if __name__ == '__main__':
    unittest.main()
