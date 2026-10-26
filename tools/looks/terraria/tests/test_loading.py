"""The NOW LOADING vignette's strips (loading.py) are the game's own frames, cut from its committed sheets.

    python3 -m unittest discover -s tools/looks/terraria -t tools/looks/terraria
"""
from __future__ import annotations

import io
import json
import re
import sys
import unittest
from pathlib import Path

from PIL import Image

TOOL = Path(__file__).resolve().parents[1]
if str(TOOL) not in sys.path:
    sys.path.insert(0, str(TOOL))

from loading import ACTORS, LOOKS, OUT, outputs  # noqa: E402

SELECTION = LOOKS / 'selection.ts'


def shipped_looks() -> dict[str, str]:
    """The look `DEFAULT_LOOKS` (selection.ts) ships for Hackerman and for the customer."""
    block = re.search(r'export const DEFAULT_LOOKS\b.*?\n};', SELECTION.read_text(), re.S)
    assert block, f'no DEFAULT_LOOKS in {SELECTION}'
    return dict(re.findall(r"\b(hackerman|customer): '([^']+)'", block.group(0)))


class LoadingStrips(unittest.TestCase):
    def test_committed_strips_are_what_the_script_writes(self) -> None:
        for name, data in outputs().items():
            with self.subTest(name):
                self.assertEqual((OUT / name).read_bytes(), data, f'run python3 tools/looks/terraria/loading.py')

    def test_actors_are_cut_from_the_looks_the_game_ships(self) -> None:
        shipped = shipped_looks()
        sources = {actor.name: actor.source for actor in ACTORS}
        expected = {
            'runner': f"{shipped['hackerman']}/characters/hackerman",
            'chaser': f"{shipped['customer']}/customer",
        }
        self.assertEqual(sources, expected, 'DEFAULT_LOOKS changed: update ACTORS in loading.py and run it')

    def test_every_frame_is_the_game_frame_cut_around_the_same_feet(self) -> None:
        for actor in ACTORS:
            game = json.loads((LOOKS / actor.source / 'sheet.json').read_text())
            strip = json.loads((OUT / f'{actor.name}.json').read_text())
            game_image = Image.open(LOOKS / actor.source / 'sheet.png').convert('RGBA')
            strip_image = Image.open(io.BytesIO((OUT / f'{actor.name}.png').read_bytes())).convert('RGBA')
            gw, gh = game['frame']['w'], game['frame']['h']
            sw, sh = strip['frame']['w'], strip['frame']['h']
            left = game['origin']['x'] - strip['origin']['x']
            top = game['origin']['y'] - strip['origin']['y']
            rows = [entry['name'] for entry in game['animations']]
            for row, entry in enumerate(strip['animations']):
                game_row = rows.index(entry['name'])
                self.assertEqual(entry['frames'], game['animations'][game_row]['frames'], entry['name'])
                for column in range(entry['frames']):
                    with self.subTest(actor=actor.name, animation=entry['name'], frame=column):
                        frame = game_image.crop((column * gw, game_row * gh, (column + 1) * gw, (game_row + 1) * gh))
                        cut = strip_image.crop((column * sw, row * sh, (column + 1) * sw, (row + 1) * sh))
                        self.assertEqual(frame.getchannel('A').getbbox() is None, False)
                        self.assertEqual(frame.crop((left, top, left + sw, top + sh)).tobytes(), cut.tobytes())
                        # Nothing of the figure lies outside the cut.
                        self.assertEqual(frame.getchannel('A').point(lambda a: 255 if a else 0).getbbox(),
                                         _shifted(cut.getchannel('A').getbbox(), left, top))


def _shifted(box, dx: int, dy: int):
    return None if box is None else (box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy)


if __name__ == '__main__':
    unittest.main()
