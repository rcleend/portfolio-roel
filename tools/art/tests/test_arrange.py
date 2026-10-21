from __future__ import annotations

import unittest

from PIL import Image

from tests import helpers  # noqa: F401

from arttools.arrange import arrange, drop_fragments, find_pieces  # noqa: E402


def _scene() -> Image.Image:
    image = Image.new("RGBA", (40, 20), (0, 0, 0, 0))
    for y in range(10, 20):
        for x in range(2, 6):
            image.putpixel((x, y), (200, 0, 0, 255))  # a post
    for y in range(14, 20):
        for x in range(8, 16):
            image.putpixel((x, y), (0, 200, 0, 255))  # a bench
    image.putpixel((11, 16), (0, 0, 0, 0))
    image.putpixel((30, 2), (0, 0, 200, 255))  # a stray fragment
    return image


class ArrangeTest(unittest.TestCase):
    def test_finds_objects_and_merges_enclosed_bits(self) -> None:
        pieces = find_pieces(_scene(), min_pixels=4)
        self.assertEqual([(p.left, p.width) for p in pieces], [(2, 4), (8, 8)])

    def test_arrange_spaces_evenly_and_keeps_baseline(self) -> None:
        result = arrange(_scene(), 40, order=[0, 1])
        pieces = find_pieces(result, min_pixels=4)
        gap = (40 - 12) / 2
        self.assertEqual(pieces[0].left, round(gap / 2))
        self.assertEqual(pieces[0].top, 10)
        self.assertEqual(pieces[1].top, 14)

    def test_drop_fragments(self) -> None:
        self.assertEqual(drop_fragments(_scene(), 4).getpixel((30, 2))[3], 0)


if __name__ == "__main__":
    unittest.main()
