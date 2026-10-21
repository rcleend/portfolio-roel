from __future__ import annotations

import unittest

from PIL import Image

from tests import helpers  # noqa: F401

from arttools.tiling import edge_columns, find_seam, make_tileable, seam_error  # noqa: E402


def _buildings(widths, height: int = 12) -> Image.Image:
    """A row of flat-coloured 'buildings' separated by dark party walls."""
    colours = [(200, 120, 80), (90, 160, 150), (180, 170, 90), (150, 110, 170)]
    total = sum(widths)
    image = Image.new("RGBA", (total, height))
    x = 0
    for i, w in enumerate(widths):
        for dx in range(w):
            for y in range(height):
                image.putpixel((x + dx, y), (20, 20, 30, 255) if dx == 0 else colours[i % len(colours)] + (255,))
        x += w
    return image


class TilingTest(unittest.TestCase):
    def test_cut_finds_a_perfect_period(self) -> None:
        image = _buildings([10, 14, 9, 10, 14, 9, 10, 14, 9])
        result = make_tileable(image, range(28, 40))
        self.assertIn(result.width, range(28, 40))
        self.assertEqual(seam_error(result), 0)

    def test_edges_are_party_walls(self) -> None:
        image = _buildings([10, 14, 9, 12])
        self.assertTrue({10, 24, 33} <= set(edge_columns(image, keep=0.2)))

    def test_on_edges_cuts_between_buildings(self) -> None:
        image = _buildings([10, 14, 9, 10, 14, 9, 10, 14])
        start, width = find_seam(image, range(30, 36), on_edges=True)
        self.assertIn(start, {10, 24, 33, 43, 57, 66, 76})
        self.assertEqual(width, 33)

    def test_blend_keeps_width(self) -> None:
        image = _buildings([10, 14, 9, 10, 14, 9, 10, 14])
        self.assertEqual(make_tileable(image, [30], mode="blend", overlap=4).width, 30)

    def test_mirror_is_seamless(self) -> None:
        image = _buildings([10, 14, 9])
        self.assertEqual(seam_error(make_tileable(image, [20], mode="mirror")), 0)


if __name__ == "__main__":
    unittest.main()
