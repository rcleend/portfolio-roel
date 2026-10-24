"""The committed Terraria sheets keep the look's promises (docs/LOOKS.md): crisp, on the feet line, one head.

The look's heroes and the revision's designs beside them (kit/revision.py) are held to the same promises.

    python3 -m unittest discover -s tools/looks/terraria -t tools/looks/terraria
"""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, NamedTuple, Tuple

from PIL import Image

TOOL = Path(__file__).resolve().parents[1]
ART = TOOL.parents[2] / 'src' / 'game' / 'art' / 'looks' / 'terraria'
if str(TOOL) not in sys.path:
    sys.path.insert(0, str(TOOL))

from generate import animations  # noqa: E402
from kit import revision  # noqa: E402
from kit.body import EYES, HEAD  # noqa: E402
from kit.outfits import OUTFITS, Outfit  # noqa: E402
from kit.pose import Pose, strokes  # noqa: E402

HEROES = ('hackerman', 'artsy', 'strategy')


class Sheet(NamedTuple):
    """A committed sheet: its folder under the look's art, the hero whose moves it plays, what he wears."""
    folder: str
    hero: str
    outfit: Outfit
    # The look's heroes ship an attack strip too; the revision's designs only their sheet.
    stems: Tuple[str, ...]


SHEETS = (
    *(Sheet(f'characters/{hero}', hero, OUTFITS[hero], ('sheet', 'attack')) for hero in HEROES),
    *(Sheet(f'revised/{name}', design.hero, design.outfit, ('sheet',)) for name, design in revision.DESIGNS.items()),
)
# What the game shows on the ground: the moves it only plays planted, and the ground frames of the rest.
PLANTED = ('idle', 'run', 'attack', 'skill')


def load(folder: str, stem: str) -> Tuple[Image.Image, Dict[str, Any]]:
    with Image.open(ART / folder / f'{stem}.png') as image:
        return image.convert('RGBA'), json.loads((ART / folder / f'{stem}.json').read_text())


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
        for sheet in SHEETS:
            for stem in sheet.stems:
                image, _ = load(sheet.folder, stem)
                self.assertLessEqual(set(image.getchannel('A').getdata()), {0, 255}, f'{sheet.folder} {stem}')
                colours = {pixel for pixel in image.getdata() if pixel[3]}
                self.assertLessEqual(len(colours), 48, f'{sheet.folder} {stem}')

    def test_planted_moves_stand_on_the_feet_line_and_nothing_sinks_below_it(self) -> None:
        for sheet in SHEETS:
            image, meta = load(sheet.folder, 'sheet')
            for animation in meta['animations']:
                for index, frame in enumerate(frames(image, meta, animation['name'])):
                    where = f"{sheet.folder} {animation['name']}[{index}]"
                    bottom = frame.getbbox()[3]
                    if animation['name'] in PLANTED:
                        self.assertEqual(bottom, meta['origin']['y'], where)
                    self.assertLessEqual(bottom, meta['origin']['y'], where)

    def test_the_idle_hero_is_no_taller_than_the_classic_ones_and_stands_on_the_origin(self) -> None:
        for sheet in SHEETS:
            image, meta = load(sheet.folder, 'sheet')
            left, top, right, bottom = frames(image, meta, 'idle')[0].getbbox()
            self.assertLessEqual(bottom - top, 31, sheet.folder)
            self.assertLess(abs((left + right) / 2 - meta['origin']['x']), 4, sheet.folder)


class Poses(unittest.TestCase):
    def test_nothing_rises_above_his_head_in_the_air_or_when_hit_so_only_victory_cheers(self) -> None:
        # Above the top of his skull, three rows under the crown of his hair or cap, a frame may show no more
        # than the standing one does: the hair or cap, never a raised fist.
        for sheet in SHEETS:
            image, meta = load(sheet.folder, 'sheet')
            standing = frames(image, meta, 'idle')[0]
            for animation in meta['animations']:
                if animation['name'] not in ('jump', 'fall', 'hurt'):
                    continue
                crowns = animation['anchors']['head']
                for index, frame in enumerate(frames(image, meta, animation['name'])):
                    skull = crowns[index][1] + 3
                    self.assertEqual(opaque_above(frame, skull), opaque_above(standing, skull),
                                     f"{sheet.folder} {animation['name']}[{index}] raises something above his head")

    def test_every_attack_and_skill_moves_on_every_frame(self) -> None:
        # An attack restarts with every shot, so its last frame leads into its first; a skill plays once.
        for sheet in SHEETS:
            image, meta = load(sheet.folder, 'sheet')
            for animation in meta['animations']:
                name = animation['name']
                if not (name == 'attack' or name.startswith('skill')):
                    continue
                strip = frames(image, meta, name)
                pairs = zip(strip, strip[1:] + strip[:1]) if name == 'attack' else zip(strip, strip[1:])
                for index, (before, after) in enumerate(pairs):
                    self.assertNotEqual(before.tobytes(), after.tobytes(), f'{sheet.folder} {name}[{index}] is held')

    def test_every_frame_is_one_figure(self) -> None:
        # A torso lifted off its legs, or a limb that misses its joint, splits the figure; only the light a
        # prop gives off (a glint, a burst, summoning motes) may float free of it.
        for sheet in SHEETS:
            image, meta = load(sheet.folder, 'sheet')
            for animation in meta['animations']:
                for index, frame in enumerate(frames(image, meta, animation['name'])):
                    sizes = sorted(len(part) for part in figures(frame))
                    self.assertTrue(all(size <= LIGHT for size in sizes[:-1]),
                                    f"{sheet.folder} {animation['name']}[{index}] splits into parts of {sizes} pixels")

    def test_the_designer_drinks_ux_elixir_with_the_cork_at_his_lips(self) -> None:
        elixir = next(animation for animation in animations('artsy') if animation.name == 'skill-ux-elixir')
        for sheet in (sheet for sheet in SHEETS if sheet.hero == 'artsy'):
            for index, frame in enumerate(elixir.frames[1:], start=1):
                where = f'{sheet.folder} skill-ux-elixir[{index}]'
                cork = [(x + stroke.at[0], y + stroke.at[1]) for stroke in strokes(sheet.outfit, frame.pose, where)
                        if stroke.art.name.startswith('potion') for x, y, tone in stroke.art.pixels if tone == CORK]
                mx, my = frame.anchors['mouth']
                self.assertTrue(cork, f'{where} has no cork')
                self.assertLessEqual(min(max(abs(x - mx), abs(y - my)) for x, y in cork), 2, where)


class Head(unittest.TestCase):
    def test_every_frame_paints_the_same_head_moved_only_with_the_body(self) -> None:
        for sheet in SHEETS:
            outfit, hero = sheet.outfit, sheet.hero
            names = {HEAD.name, outfit.hair.name, outfit.glasses.name, *(part.name for part, _ in outfit.headgear)}
            names |= {outfit.ear.name} if outfit.ear else set()
            standing = {s.art.name: s.art for s in strokes(outfit, animations(hero)[0].frames[0].pose, hero)}
            for animation in animations(hero):
                for index, frame in enumerate(animation.frames):
                    where = f'{sheet.folder} {animation.name}[{index}]'
                    pose = frame.pose
                    body = (pose.body[0], pose.body[1] - pose.lift)
                    painted = strokes(outfit, pose, where)
                    for stroke in painted:
                        if stroke.art.name in names:
                            self.assertEqual(stroke.art, standing[stroke.art.name], where)
                            self.assertEqual(stroke.at, body, f'{where} {stroke.art.name}')
                    eyes = [stroke.art for stroke in painted if stroke.art in EYES.values()]
                    self.assertEqual(len(eyes), 1, where)

    def test_props_appear_only_while_attacking_or_using_a_skill(self) -> None:
        for hero in HEROES:
            for animation in animations(hero):
                if animation.name == 'attack' or animation.name.startswith('skill'):
                    continue
                for index, frame in enumerate(animation.frames):
                    self.assertEqual(frame.pose.props, (), f'{hero} {animation.name}[{index}] holds something')


# What the revision may redraw; the rest of every outfit is the look's own, so each design is the same body.
HEAD_LAYERS = {'hair', 'ear', 'glasses', 'headgear', 'front'}


def painted(outfit: Outfit) -> Dict[Tuple[int, int], Tuple[str, int]]:
    """The standing frame in design space: the drawing on top at each pixel, by name, and its tone."""
    top: Dict[Tuple[int, int], Tuple[str, int]] = {}
    for stroke in strokes(outfit, Pose(), 'standing'):
        for x, y, (_, tone) in stroke.art.pixels:
            top[(x + stroke.at[0], y + stroke.at[1])] = (stroke.art.name, tone)
    return top


# The darkest hair tone that may rest on the glasses: the mid tones, a step lighter than the hair's outline and
# shadow, which are as dark as the rim.
RESTING = 2


class Revision(unittest.TestCase):
    def test_redraws_only_the_head_over_the_heroes_own_bodies(self) -> None:
        for name, design in revision.DESIGNS.items():
            look = OUTFITS[design.hero]
            for field in set(Outfit._fields) - HEAD_LAYERS:
                self.assertEqual(getattr(design.outfit, field), getattr(look, field), f'{name} {field}')

    def test_the_fringe_rests_on_the_glasses_without_sticking_up_from_the_rim(self) -> None:
        # The look's fringe stood single dark strands on the rim, which read as the frame sticking up. Over the
        # revision's rim is forehead, or fringe at least two pixels wide in mid tones, so the rim's top edge stays
        # one clean line.
        for name, design in revision.DESIGNS.items():
            top = painted(design.outfit)
            rim = [point for point, (drawing, _) in top.items() if drawing == design.outfit.glasses.name]
            row = min(y for _, y in rim)
            hair = {point: tone for point, (drawing, tone) in top.items() if drawing == design.outfit.hair.name}
            for x in sorted(x for x, y in rim if y == row):
                above = (x, row - 1)
                if above not in hair:
                    continue
                self.assertGreaterEqual(hair[above], RESTING, f'{name}: dark hair on the rim at {above}')
                self.assertTrue({(x - 1, row - 1), (x + 1, row - 1)} & hair.keys(), f'{name}: lone strand at {above}')

    def test_the_designer_cap_keeps_only_its_front_spot(self) -> None:
        # The cap's glossy tones (highlight and accent) on its crown, above the brim, make one spot.
        spot = {(x, y) for x, y, (ramp, tone) in revision.CAP.pixels if ramp == '@cloth' and tone >= 4 and y < 13}
        self.assertEqual(len(figures_of(spot)), 1)
        self.assertGreater(min(x for x, _ in spot), 16, 'the spot is on the front half of the crown')


def figures_of(points: set) -> List[set]:
    """`points` in 8-connected parts."""
    image = Image.new('RGBA', (64, 64))
    for x, y in points:
        image.putpixel((x, y), (255, 255, 255, 255))
    return figures(image)


if __name__ == '__main__':
    unittest.main()
