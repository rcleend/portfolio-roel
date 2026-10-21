from __future__ import annotations

import unittest

from PIL import Image

from tests import helpers  # noqa: F401

from arttools.chroma import chroma_key, despill_edges, remove_specks  # noqa: E402
from arttools.color import MAGENTA  # noqa: E402


def _square_on_magenta(fringe: tuple) -> Image.Image:
    image = Image.new("RGBA", (12, 12), MAGENTA + (255,))
    for y in range(3, 9):
        for x in range(3, 9):
            image.putpixel((x, y), (40, 20, 90, 255))  # a deep purple the key must keep
    for y in range(3, 9):
        image.putpixel((2, y), fringe)
    return image


class ChromaKeyTest(unittest.TestCase):
    def test_removes_background_and_keeps_interior_purple(self) -> None:
        keyed = chroma_key(_square_on_magenta((200, 30, 210, 255)), MAGENTA)
        self.assertEqual(keyed.getpixel((0, 0))[3], 0)
        self.assertEqual(keyed.getpixel((5, 5)), (40, 20, 90, 255))

    def test_eats_magenta_tinted_fringe(self) -> None:
        keyed = chroma_key(_square_on_magenta((160, 60, 170, 255)), MAGENTA, tolerance=40)
        self.assertEqual(keyed.getpixel((2, 5))[3], 0)

    def test_keeps_neutral_edge_pixels(self) -> None:
        keyed = chroma_key(_square_on_magenta((90, 90, 90, 255)), MAGENTA)
        self.assertEqual(keyed.getpixel((2, 5)), (90, 90, 90, 255))


class DespillTest(unittest.TestCase):
    def test_repaints_tinted_edge_from_interior(self) -> None:
        image = Image.new("RGBA", (5, 3), (0, 0, 0, 0))
        image.putpixel((1, 1), (200, 60, 200, 255))
        for x in (2, 3):
            image.putpixel((x, 1), (100, 120, 60, 255))
        cleaned = despill_edges(image)
        self.assertEqual(cleaned.getpixel((1, 1)), (100, 120, 60, 255))

    def test_interior_purple_untouched(self) -> None:
        image = Image.new("RGBA", (3, 3), (200, 60, 200, 255))
        self.assertEqual(despill_edges(image).getpixel((1, 1)), (200, 60, 200, 255))


class SpeckTest(unittest.TestCase):
    def test_clears_lone_pixels_and_fills_pinholes(self) -> None:
        image = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
        image.putpixel((0, 0), (255, 255, 255, 255))
        for y in range(2, 5):
            for x in range(2, 5):
                image.putpixel((x, y), (10, 20, 30, 255))
        image.putpixel((3, 3), (0, 0, 0, 0))
        cleaned = remove_specks(image)
        self.assertEqual(cleaned.getpixel((0, 0))[3], 0)
        self.assertEqual(cleaned.getpixel((3, 3)), (10, 20, 30, 255))


if __name__ == "__main__":
    unittest.main()
