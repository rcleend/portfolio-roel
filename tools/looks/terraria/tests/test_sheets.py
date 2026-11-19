"""The committed Terraria sheets keep the look's promises (docs/LOOKS.md): crisp, on the feet line, one head.

The look's heroes and the revision's looks beside them (kit/revision.py) are held to the same promises, and the
revision's hair, the one part that moves on the head, to moving only at its loose ends and a pixel at a time.

    python3 -m unittest discover -s tools/looks/terraria -t tools/looks/terraria
"""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

from PIL import Image

TOOL = Path(__file__).resolve().parents[1]
ART = TOOL.parents[2] / 'src' / 'game' / 'art' / 'looks'
if str(TOOL) not in sys.path:
    sys.path.insert(0, str(TOOL))

from generate import LAYERED_MOVES, animations, layers  # noqa: E402
from kit import revision  # noqa: E402
from kit.art import CLOTH, Art  # noqa: E402
from kit.body import EYES, HAIR_MOTION, HEAD  # noqa: E402
from kit.outfits import CAP as LOOK_CAP, OUTFITS, Outfit  # noqa: E402
from kit.pose import Pose, Stroke, compose, strokes  # noqa: E402

HEROES = ('hackerman', 'artsy', 'strategy')


class Sheet(NamedTuple):
    """A committed sheet: its folder under the looks' art, the hero whose moves it plays, what he wears."""
    folder: str
    hero: str
    outfit: Outfit
    # The look's heroes ship an attack strip too; the revision's looks play theirs and ship only a sheet.
    stems: Tuple[str, ...]


SHEETS = (
    *(Sheet(f'terraria/characters/{hero}', hero, OUTFITS[hero], ('sheet', 'attack')) for hero in HEROES),
    *(Sheet(f'{look}/characters/{hero}', hero, outfit, ('sheet',))
      for look, heroes in revision.LOOKS.items() for hero, outfit in heroes.items()),
)
# The revision's sheets, whose hair moves.
REVISED = tuple(sheet for sheet in SHEETS if not sheet.folder.startswith('terraria/'))
# What the game shows on the ground: the moves it only plays planted, and the ground frames of the rest.
PLANTED = ('idle', 'run', 'attack', 'skill')

# The art is committed as *.art.ts modules: its PNGs are on disk only while exported (tools/art/README.md).
EXPORTED = any(ART.glob('terraria*/**/*.png'))
NEEDS_PNGS = unittest.skipUnless(
    EXPORTED, 'the PNGs of the art are not on disk: run `pnpm build:art --export src/game` (tools/art/README.md)'
)


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
        # Without the PNGs the generator checks the JSON alone and says so with exit code 2.
        self.assertEqual(result.returncode, 0 if EXPORTED else 2, result.stdout + result.stderr)

    @NEEDS_PNGS
    def test_every_pixel_is_opaque_or_empty_in_a_few_dozen_colours(self) -> None:
        for sheet in SHEETS:
            for stem in sheet.stems:
                image, _ = load(sheet.folder, stem)
                self.assertLessEqual(set(image.getchannel('A').getdata()), {0, 255}, f'{sheet.folder} {stem}')
                colours = {pixel for pixel in image.getdata() if pixel[3]}
                self.assertLessEqual(len(colours), 48, f'{sheet.folder} {stem}')

    @NEEDS_PNGS
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

    @NEEDS_PNGS
    def test_the_idle_hero_is_no_taller_than_the_classic_ones_and_stands_on_the_origin(self) -> None:
        for sheet in SHEETS:
            image, meta = load(sheet.folder, 'sheet')
            left, top, right, bottom = frames(image, meta, 'idle')[0].getbbox()
            self.assertLessEqual(bottom - top, 31, sheet.folder)
            self.assertLess(abs((left + right) / 2 - meta['origin']['x']), 4, sheet.folder)


class Poses(unittest.TestCase):
    @NEEDS_PNGS
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

    @NEEDS_PNGS
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

    @NEEDS_PNGS
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


def over(*layers: Image.Image) -> Image.Image:
    """The layers painted bottom first, as the game draws a hero acting on the move."""
    picture = Image.new('RGBA', layers[0].size, (0, 0, 0, 0))
    for layer in layers:
        picture.alpha_composite(layer)
    return picture


class Layers(unittest.TestCase):
    """The legs of every move a hero attacks or casts on, and the upper body of every attack and skill pose."""

    def test_every_action_drawn_over_its_own_legs_is_the_whole_pose(self) -> None:
        # So the split loses nothing, and the far arm, painted behind the legs in the whole pose and over them
        # when split, never crosses them.
        for sheet in SHEETS:
            outfit = sheet.outfit
            for animation in (animation for animation, layer in layers(sheet.hero) if layer == 'upper'):
                for index, frame in enumerate(animation.frames):
                    where = f'{sheet.folder} {animation.name}[{index}]'
                    split = over(compose(outfit, frame.pose, where, 'legs'), compose(outfit, frame.pose, where, 'upper'))
                    self.assertEqual(split.tobytes(), compose(outfit, frame.pose, where).tobytes(), where)

    @NEEDS_PNGS
    def test_the_rows_play_in_step_with_the_moves_and_poses_they_split(self) -> None:
        for sheet in SHEETS:
            _, meta = load(sheet.folder, 'sheet')
            rows = {animation['name']: animation for animation in meta['animations']}
            for animation, layer in layers(sheet.hero):
                split, whole = rows[f'{animation.name}-{layer}'], rows[animation.name]
                where = f"{sheet.folder} {split['name']}"
                self.assertEqual((split['frames'], split['fps'], split['loop']),
                                 (whole['frames'], whole['fps'], whole['loop']), where)
                # The game reads the pose's anchors off its upper body, and nothing off the legs.
                self.assertEqual(split.get('anchors', {}), whole['anchors'] if layer == 'upper' else {}, where)
            names = {name for name in rows if name.endswith(('-legs', '-upper'))}
            self.assertEqual(names, {f'{animation.name}-{layer}' for animation, layer in layers(sheet.hero)},
                             sheet.folder)

    @NEEDS_PNGS
    def test_every_attack_and_skill_on_the_move_is_one_figure(self) -> None:
        # Whatever stride or jump the legs are in, the torso meets them.
        for sheet in SHEETS:
            image, meta = load(sheet.folder, 'sheet')
            legs = [(name, picture) for name in (f'{move}-legs' for move in LAYERED_MOVES)
                    for picture in frames(image, meta, name)]
            for animation in meta['animations']:
                if not animation['name'].endswith('-upper'):
                    continue
                for index, upper in enumerate(frames(image, meta, animation['name'])):
                    for name, picture in legs:
                        sizes = sorted(len(part) for part in figures(over(picture, upper)))
                        self.assertTrue(all(size <= LIGHT for size in sizes[:-1]),
                                        f"{sheet.folder} {animation['name']}[{index}] over {name} splits: {sizes}")


def every_frame(sheet: Sheet):
    """Each frame of the sheet's animations as (where, animation, index, pose, strokes it paints)."""
    for animation in animations(sheet.hero):
        for index, frame in enumerate(animation.frames):
            where = f'{sheet.folder} {animation.name}[{index}]'
            yield where, animation, index, frame.pose, strokes(sheet.outfit, frame.pose, where)


def carried_by(pose: Pose) -> Tuple[int, int]:
    """Where the pose's body has moved everything it carries: the torso, the head and all on it."""
    return pose.body[0], pose.body[1] - pose.lift


class Head(unittest.TestCase):
    def test_every_frame_paints_the_same_head_moved_only_with_the_body(self) -> None:
        # The glasses too, so they stay registered on his face; only the eye changes, and the hair's loose ends.
        for sheet in SHEETS:
            outfit, hero = sheet.outfit, sheet.hero
            names = {HEAD.name, outfit.glasses.name, *(part.name for part, _ in outfit.headgear)}
            names |= {outfit.ear.name} if outfit.ear else set()
            standing = {s.art.name: s.art for s in strokes(outfit, animations(hero)[0].frames[0].pose, hero)}
            for where, _, _, pose, painted in every_frame(sheet):
                hair = outfit.hair[pose.hair]
                for stroke in painted:
                    if stroke.art.name in names:
                        self.assertEqual(stroke.art, standing[stroke.art.name], where)
                    if stroke.art.name in names or stroke.art == hair:
                        self.assertEqual(stroke.at, carried_by(pose), f'{where} {stroke.art.name}')
                eyes = [stroke.art for stroke in painted if stroke.art in EYES.values()]
                self.assertEqual(len(eyes), 1, where)
                self.assertEqual(sum(stroke.art == hair for stroke in painted), 1, where)
                # Painted over the hair, no strand ever covers the glasses.
                order = [stroke.art for stroke in painted]
                self.assertLess(order.index(hair), order.index(outfit.glasses), where)

    def test_props_appear_only_while_attacking_or_using_a_skill(self) -> None:
        for hero in HEROES:
            for animation in animations(hero):
                if animation.name == 'attack' or animation.name.startswith('skill'):
                    continue
                for index, frame in enumerate(animation.frames):
                    self.assertEqual(frame.pose.props, (), f'{hero} {animation.name}[{index}] holds something')


# What the revision may redraw; the rest of every outfit is the look's own, so each design is the same body.
HEAD_LAYERS = {'hair', 'ear', 'glasses', 'headgear', 'front'}


def painted(outfit: Outfit, pose: Pose = Pose()) -> Dict[Tuple[int, int], Tuple[str, Tuple[str, int]]]:
    """The pose in design space (standing by default): the drawing on top at each pixel, by name, and its tone."""
    return on_top(strokes(outfit, pose, 'painted'))


def on_top(painting: List[Stroke]) -> Dict[Tuple[int, int], Tuple[str, Tuple[str, int]]]:
    top: Dict[Tuple[int, int], Tuple[str, Tuple[str, int]]] = {}
    for stroke in painting:
        for x, y, tone in stroke.art.pixels:
            top[(x + stroke.at[0], y + stroke.at[1])] = (stroke.art.name, tone)
    return top


# The darkest hair tone that may rest on the glasses: the mid tones, a step lighter than the hair's outline and
# shadow, which are as dark as the rim.
RESTING = 2


class Revision(unittest.TestCase):
    def test_redraws_only_the_head_over_the_heroes_own_bodies(self) -> None:
        for sheet in REVISED:
            look = OUTFITS[sheet.hero]
            for field in set(Outfit._fields) - HEAD_LAYERS:
                self.assertEqual(getattr(sheet.outfit, field), getattr(look, field), f'{sheet.folder} {field}')

    def test_the_fringe_rests_on_the_glasses_without_sticking_up_from_the_rim(self) -> None:
        # The look's fringe stood single dark strands on the rim, which read as the frame sticking up. Over the
        # revision's rim is forehead, or fringe at least two pixels wide in mid tones, so the rim's top edge stays
        # one clean line, however the hair moves.
        for sheet, state in ((sheet, state) for sheet in REVISED for state in HAIR_MOTION):
            where = f'{sheet.folder} {state}'
            outfit = sheet.outfit
            top = painted(outfit, Pose(hair=state))
            rim = [point for point, (drawing, _) in top.items() if drawing == outfit.glasses.name]
            row = min(y for _, y in rim)
            hair = {point: tone for point, (drawing, (ramp, tone)) in top.items()
                    if drawing == outfit.hair[state].name and ramp == 'hair'}
            for x in sorted(x for x, y in rim if y == row):
                above = (x, row - 1)
                if above not in hair:
                    continue
                self.assertGreaterEqual(hair[above], RESTING, f'{where}: dark hair on the rim at {above}')
                self.assertTrue({(x - 1, row - 1), (x + 1, row - 1)} & hair.keys(), f'{where}: lone strand at {above}')

    def test_the_designer_cap_keeps_only_its_front_spot(self) -> None:
        # The cap's glossy tones (highlight and accent) on its crown, above the brim, make one spot.
        spot = {(x, y) for x, y, (ramp, tone) in revision.CAP.pixels if ramp == '@cloth' and tone >= 4 and y < 13}
        self.assertEqual(len(figures_of(spot)), 1)
        self.assertGreater(min(x for x, _ in spot), 16, 'the spot is on the front half of the crown')

    def test_the_designer_cap_is_the_look_cap_with_its_back_spot_painted_over(self) -> None:
        # The same crown and brim pixel for pixel, so the board shows only the spot gone; what changed is the
        # back half of the crown, in the knit's base tone.
        look = {(x, y): tone for x, y, tone in LOOK_CAP.pixels}
        cap = {(x, y): tone for x, y, tone in revision.CAP.pixels}
        self.assertEqual(cap.keys(), look.keys())
        changed = {point for point in cap if cap[point] != look[point]}
        self.assertTrue(changed)
        for x, y in changed:
            self.assertEqual(cap[(x, y)], CLOTH['o'], f'({x}, {y}) is not the base tone')
            self.assertLessEqual(x, 16, f'({x}, {y}) changed on the front half of the crown')


# The revision's hair moves only at its loose ends: the front lock, falling past the face ahead of the glasses,
# and the nape (or under the cap, the tuft) behind their arm. The crown and the fringe on the glasses between
# them never move, so the head keeps its shape and the rim its clean top edge.
def loose_end(point: Tuple[int, int]) -> Optional[str]:
    x, y = point
    if x >= 21:
        return 'lock'
    if x <= 15 and y >= 15:
        return 'nape'
    return None


def ends(drawing: Art) -> Dict[str, set]:
    """The pixels of each loose end of a hair drawing."""
    found: Dict[str, set] = {'lock': set(), 'nape': set()}
    for x, y, _ in drawing.pixels:
        end = loose_end((x, y))
        if end:
            found[end].add((x, y))
    return found


def apart(one: set, other: set) -> int:
    """How far apart two shapes are, in pixels: the farthest any pixel of either is from the other's nearest."""
    def reach(points: set, to: set) -> int:
        return max(min(max(abs(x - u), abs(y - v)) for u, v in to) for x, y in points)
    return max(reach(one, other), reach(other, one))


# Where his bare head's hair moves: through the run, as Terraria's hairstyle 143 does through the walk, and as he
# comes down, is hit or cheers. Rising it rests, as Terraria's airborne frame draws it; the poses with props, and
# standing, keep it at rest too, so the head is as still as the look's while he attacks, casts or blinks.
MOVING = ('run', 'fall', 'hurt', 'victory')
# The revision's sheets with nothing on the head. Under a cap or a hood Terraria draws a hairstyle's hat version
# (Player_HairAlt_143), which it never redraws through the walk, so there the hair is still.
BARE = tuple(sheet for sheet in REVISED if not sheet.outfit.headgear)


class Hair(unittest.TestCase):
    def test_the_look_hair_never_moves_on_his_head(self) -> None:
        for hero, outfit in OUTFITS.items():
            self.assertEqual({outfit.hair[state] for state in HAIR_MOTION}, {outfit.hair['rest']}, hero)

    def test_the_revised_hair_moves_only_at_its_loose_ends(self) -> None:
        for sheet, state in ((sheet, state) for sheet in REVISED for state in HAIR_MOTION):
            where = f'{sheet.folder} {state}'
            rest = {(x, y): tone for x, y, tone in sheet.outfit.hair['rest'].pixels}
            moved = {(x, y): tone for x, y, tone in sheet.outfit.hair[state].pixels}
            changed = {point for point in rest.keys() | moved.keys() if rest.get(point) != moved.get(point)}
            self.assertEqual({point for point in changed if not loose_end(point)}, set(), where)
            # A pixel off, as Terraria moves 143's lock: no end strays further from where it rests.
            at_rest, now = ends(sheet.outfit.hair['rest']), ends(sheet.outfit.hair[state])
            for end in ('lock', 'nape'):
                if at_rest[end] or now[end]:
                    self.assertLessEqual(apart(at_rest[end], now[end]), 1, f'{where} {end}')

    def test_every_edge_of_the_hair_is_outlined_however_it_moves(self) -> None:
        # As Terraria outlines hair: wherever a loose end goes, the hair meets the background only in its outline
        # or its shadow, never in a lit tone, so a lock thrown off the face leaves no gap open between them.
        for sheet, state in ((sheet, state) for sheet in REVISED for state in HAIR_MOTION):
            top = painted(sheet.outfit, Pose(hair=state))
            name = sheet.outfit.hair[state].name
            for (x, y), (drawing, (ramp, tone)) in top.items():
                if drawing != name or ramp != 'hair' or tone <= 1:
                    continue
                open_to = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if (x + dx, y + dy) not in top]
                self.assertEqual(open_to, [], f'{sheet.folder} {state}: hair at {(x, y)} is not outlined')

    def test_under_a_cap_or_a_hood_the_hair_never_moves(self) -> None:
        covered = [sheet for sheet in REVISED if sheet not in BARE]
        self.assertEqual({sheet.folder for sheet in covered},
                         {'terraria-revised/characters/artsy', 'terraria-hooded/characters/hackerman'})
        for sheet in covered:
            self.assertEqual({sheet.outfit.hair[state] for state in HAIR_MOTION}, {sheet.outfit.hair['rest']},
                             sheet.folder)

    def test_the_bare_hair_moves_as_he_runs_comes_down_is_hit_and_cheers_and_only_then(self) -> None:
        for sheet in BARE:
            for animation in animations(sheet.hero):
                states = {frame.pose.hair for frame in animation.frames}
                where = f'{sheet.folder} {animation.name}'
                if animation.name in MOVING:
                    self.assertNotEqual(states, {'rest'}, where)
                    drawings = {sheet.outfit.hair[state] for state in states | {'rest'}}
                    self.assertGreater(len(drawings), 1, f'{where}: the hair is drawn the same in all of it')
                else:
                    self.assertEqual(states, {'rest'}, where)

    def test_every_loose_end_moves_a_pixel_at_a_time_so_nothing_pops(self) -> None:
        # From each frame to the next (round the loop for the moves that loop), no pixel of the lock or the nape
        # lands more than a pixel from where that end was.
        for sheet in REVISED:
            for animation in animations(sheet.hero):
                hair = [ends(sheet.outfit.hair[frame.pose.hair]) for frame in animation.frames]
                pairs = list(zip(hair, hair[1:])) + ([(hair[-1], hair[0])] if animation.loop else [])
                for index, (before, after) in enumerate(pairs):
                    for end in ('lock', 'nape'):
                        if before[end] or after[end]:
                            self.assertLessEqual(apart(before[end], after[end]), 1,
                                                 f'{sheet.folder} {animation.name}[{index}] {end}')

    def test_every_cut_from_one_move_to_another_moves_a_loose_end_a_pixel_at_most(self) -> None:
        # The game cuts from any frame to the start of another move (a jump from the run, a landing from the fall,
        # the hit from anything), so any two drawings the moves use are a pixel apart at most, at every end.
        for sheet in BARE:
            used = sorted({frame.pose.hair for animation in animations(sheet.hero) for frame in animation.frames})
            for one, other in ((one, other) for one in used for other in used if one < other):
                before, after = ends(sheet.outfit.hair[one]), ends(sheet.outfit.hair[other])
                for end in ('lock', 'nape'):
                    self.assertLessEqual(apart(before[end], after[end]), 1, f'{sheet.folder} {one} to {other} {end}')

    def test_the_hood_moves_with_his_head_and_shoulders_and_the_hair_stays_inside_it(self) -> None:
        # Drawn with the body in every frame, it sits on the shoulders as the standing hood does, and whatever the
        # hair does under it, only the fringe and the lock show, in its opening and under its lip at the front.
        hood = next(sheet for sheet in REVISED if sheet.folder.startswith('terraria-hooded/'))
        hoods = [part for part, _ in hood.outfit.headgear]
        self.assertEqual([part.name for part in hoods], [revision.HOOD.name])
        for where, _, _, pose, painting in every_frame(hood):
            at = carried_by(pose)
            self.assertEqual([stroke.at for stroke in painting if stroke.art in hoods], [at], where)
            shown = [(x - at[0], y - at[1]) for (x, y), (drawing, _) in on_top(painting).items()
                     if drawing == hood.outfit.hair[pose.hair].name]
            self.assertTrue(shown, where)
            self.assertGreaterEqual(min(x for x, _ in shown), 16, f'{where}: hair shows behind the hood')
            self.assertGreaterEqual(min(y for _, y in shown), 15, f'{where}: hair shows over the hood')


def figures_of(points: set) -> List[set]:
    """`points` in 8-connected parts."""
    image = Image.new('RGBA', (64, 64))
    for x, y in points:
        image.putpixel((x, y), (255, 255, 255, 255))
    return figures(image)


if __name__ == '__main__':
    unittest.main()
