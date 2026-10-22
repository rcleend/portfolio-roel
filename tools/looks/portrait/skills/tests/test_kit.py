"""Unit tests for the drawing kit: the grid, the rasterisers and the sheet writer."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from portrait_fx import raster
from portrait_fx.grid import Grid, rows
from portrait_fx.sheet import MAX_COLORS, Animation, Strip, format_json, validate_files


class GridTest(unittest.TestCase):
    def test_outline_rims_outside_the_silhouette(self) -> None:
        g = Grid(5, 5)
        g.set(2, 2, "#ffffff")
        rimmed = g.outline("#000000")
        self.assertEqual(len(list(rimmed.points())), 9)
        self.assertEqual(rimmed.get(2, 2), "#ffffff")
        round_rim = g.outline("#000000", corners=False)
        self.assertIsNone(round_rim.get(1, 1))
        self.assertEqual(round_rim.get(1, 2), "#000000")

    def test_stamp_and_from_rows(self) -> None:
        art = rows("""
            .a.
            aba
        """)
        g = Grid.from_rows(art, {".": None, "a": "#111111", "b": "#222222"})
        self.assertEqual((g.width, g.height), (3, 2))
        self.assertEqual(g.get(1, 1), "#222222")
        self.assertIsNone(g.get(0, 0))

    def test_rejects_non_hex_colours(self) -> None:
        with self.assertRaises(ValueError):
            Grid(1, 1).set(0, 0, "red")

    def test_flips(self) -> None:
        g = Grid(3, 1)
        g.set(0, 0, "#ffffff")
        self.assertEqual(g.flipped_x().get(2, 0), "#ffffff")


class RasterTest(unittest.TestCase):
    def test_even_disc_is_symmetric(self) -> None:
        mask = raster.disc(4.0, 4.0, 3.0)
        self.assertEqual(mask, {(7 - x, y) for x, y in mask})
        self.assertEqual(mask, {(x, 7 - y) for x, y in mask})

    def test_thin_ring_has_no_doubled_corners(self) -> None:
        ring = raster.thin(raster.ring(10.0, 10.0, 7.0, 7.0))
        for x, y in ring:
            # A pixel-perfect curve never fills both the horizontal and the vertical neighbour plus the elbow.
            for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
                l_shape = {(x + dx, y), (x, y + dy)} <= ring
                self.assertFalse(l_shape and (x + dx, y + dy) not in ring and raster._degree(ring, (x, y)) == 2)

    def test_dashed_keeps_the_duty_cycle(self) -> None:
        ring = raster.thin(raster.ring(20.0, 20.0, 15.0, 15.0))
        dashed = raster.dashed(ring, 20.0, 20.0, segments=8, duty=0.5)
        self.assertAlmostEqual(len(dashed) / len(ring), 0.5, delta=0.1)


class SheetTest(unittest.TestCase):
    def strip(self) -> Strip:
        a, b = Grid(4, 2), Grid(4, 2)
        a.set(0, 0, "#ff0000")
        b.set(3, 1, "#00ff00")
        return Strip("fx-test", 4, 2, (2, 1), [
            Animation("go", 10, False, [a, b], {"tip": [(1, 1), (2, 1)]}),
            Animation("stay", 4, True, [a]),
        ])

    def test_packs_one_row_per_animation(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            png, manifest = self.strip().write(Path(scratch))
            self.assertEqual(validate_files(png, manifest), [])
            data = json.loads(manifest.read_text())
            self.assertEqual(data["frame"], {"w": 4, "h": 2})
            self.assertEqual(data["animations"][0]["anchors"], {"tip": [[1, 1], [2, 1]]})

    def test_refuses_invalid_strips(self) -> None:
        strip = self.strip()
        strip.animations[0].anchors["tip"].pop()
        with tempfile.TemporaryDirectory() as scratch, self.assertRaises(ValueError):
            strip.write(Path(scratch))

    def test_colour_budget(self) -> None:
        frame = Grid(MAX_COLORS + 1, 1)
        for x in range(MAX_COLORS + 1):
            frame.set(x, 0, f"#{x:06x}")
        strip = Strip("fx-busy", MAX_COLORS + 1, 1, (0, 0), [Animation("a", 1, True, [frame])])
        self.assertTrue(any("colours" in p for p in strip.problems()))

    def test_json_is_biome_shaped(self) -> None:
        text = format_json({"frame": {"w": 4}, "a": [{"n": [[1, 2], [3, 4]]}]})
        self.assertEqual(text, '{\n  "frame": {\n    "w": 4\n  },\n  "a": [\n    {\n      "n": [[1, 2], [3, 4]]\n    }\n  ]\n}')


if __name__ == "__main__":
    unittest.main()
