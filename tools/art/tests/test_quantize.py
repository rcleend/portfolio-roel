from __future__ import annotations

import unittest

from PIL import Image

from tests import helpers  # noqa: F401

from arttools.quantize import adaptive_palette, despeckle, map_to_palette, used_colors  # noqa: E402


def _gradient(width: int = 32, height: int = 8) -> Image.Image:
    image = Image.new("RGBA", (width, height))
    for x in range(width):
        for y in range(height):
            image.putpixel((x, y), (x * 8, 40, 255 - x * 8, 255))
    return image


class QuantizeTest(unittest.TestCase):
    def test_adaptive_palette_respects_size_and_ignores_transparency(self) -> None:
        image = _gradient()
        image.putpixel((0, 0), (0, 255, 0, 0))
        palette = adaptive_palette(image, 4)
        self.assertLessEqual(len(palette), 4)
        self.assertNotIn((0, 255, 0), palette)

    def test_output_only_uses_palette_colours(self) -> None:
        palette = [(0, 40, 255), (128, 40, 128), (248, 40, 7)]
        for dither in (None, "bayer2", "bayer4"):
            result = map_to_palette(_gradient(), palette, dither)
            self.assertTrue(set(used_colors(result)) <= set(palette), dither)

    def test_ordered_dither_mixes_neighbouring_entries(self) -> None:
        palette = [(0, 40, 255), (248, 40, 7)]
        flat = used_colors(map_to_palette(_gradient(), palette, "bayer4", strength=200).crop((14, 0, 18, 8)))
        self.assertEqual(len(flat), 2)

    def test_despeckle_replaces_lone_pixels(self) -> None:
        image = Image.new("RGBA", (3, 3), (10, 10, 10, 255))
        image.putpixel((1, 1), (250, 0, 0, 255))
        self.assertEqual(despeckle(image).getpixel((1, 1)), (10, 10, 10, 255))


if __name__ == "__main__":
    unittest.main()
