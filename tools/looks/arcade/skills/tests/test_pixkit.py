"""The pixel kit: shapes come out crisp, manifests come out in Biome's shape, calm twins drop flashes."""

from __future__ import annotations

import unittest

from pixkit import jsonfmt
from pixkit.canvas import Sprite, arc, disc, ellipse, line_points, outline_of, thin_corners
from pixkit.sheet import Animation, Strip, with_calm


class ShapeTest(unittest.TestCase):
    def test_circles_have_no_nubs(self) -> None:
        # A half-pixel centre with a whole radius puts pixel centres exactly on the four tips.
        for radius in (5.0, 11.0, 31.0):
            shape = disc(radius + 0.5, radius + 0.5, radius)
            top = min(y for _, y in shape)
            row = [x for x, y in shape if y == top]
            self.assertGreater(len(row), 1, f"radius {radius}: a lone pixel tops the circle")

    def test_ellipse_is_symmetric(self) -> None:
        shape = ellipse(10.5, 7.5, 8.0, 5.0)
        self.assertEqual(shape, {(20 - x, y) for x, y in shape})
        self.assertEqual(shape, {(x, 14 - y) for x, y in shape})

    def test_lines_are_single_steps(self) -> None:
        points = line_points(0, 0, 7, 3)
        self.assertEqual(points[0], (0, 0))
        self.assertEqual(points[-1], (7, 3))
        self.assertEqual(len(points), 8)

    def test_thin_corners_removes_elbows_only(self) -> None:
        elbow = {(0, 0), (1, 0), (1, 1)}
        self.assertEqual(thin_corners(elbow), {(0, 0), (1, 1)})
        block = {(0, 0), (1, 0), (0, 1), (1, 1)}
        self.assertEqual(thin_corners(block), block)

    def test_arcs_are_thin_and_connected(self) -> None:
        points = arc(20.0, 20.0, 12.0, 12.0, 0, 90)
        for x, y in points:
            neighbours = {(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)} - {(x, y)}
            self.assertTrue(neighbours & points, f"({x}, {y}) is cut off")
        self.assertEqual(thin_corners(points), points)

    def test_outline_hugs_from_outside(self) -> None:
        shape = {(2, 2)}
        self.assertEqual(len(outline_of(shape, corners=True)), 8)
        self.assertEqual(len(outline_of(shape, corners=False)), 4)

    def test_sprites_round_trip_through_images(self) -> None:
        sprite = Sprite.from_rows(["a.", ".b"], {"a": "#ff0000", "b": "#00ff00"})
        self.assertEqual(Sprite.from_image(sprite.to_image()).mask(), sprite.mask())
        with self.assertRaises(ValueError):
            Sprite.from_rows(["ab", "a"], {"a": "#ff0000", "b": "#00ff00"})
        with self.assertRaises(ValueError):
            Sprite.from_rows(["az"], {"a": "#ff0000"})


class ManifestTest(unittest.TestCase):
    def test_short_values_stay_inline_and_object_lists_break(self) -> None:
        text = jsonfmt.dumps(
            {
                "frame": {"w": 24, "h": 24},
                "origin": {"x": 0, "y": 0},
                "animations": [
                    {"name": "idle", "fps": 8, "loop": True, "frames": 16},
                    {"name": "fire", "fps": 24, "loop": False, "frames": 4},
                ],
            }
        )
        self.assertEqual(
            text,
            (
                "{\n"
                '  "frame": { "w": 24, "h": 24 },\n'
                '  "origin": { "x": 0, "y": 0 },\n'
                '  "animations": [\n'
                '    { "name": "idle", "fps": 8, "loop": true, "frames": 16 },\n'
                '    { "name": "fire", "fps": 24, "loop": false, "frames": 4 }\n'
                "  ]\n"
                "}\n"
            ),
        )

    def test_long_objects_expand(self) -> None:
        anchors = {"muzzle": [[22, 16], [21, 16], [21, 16], [22, 16]]}
        text = jsonfmt.dumps(
            {
                "animations": [
                    {"name": "fire", "fps": 24, "loop": False, "frames": 4, "anchors": anchors},
                    {"name": "hover", "fps": 12, "loop": True, "frames": 12},
                ]
            }
        )
        self.assertIn('      "anchors": { "muzzle": [[22, 16], [21, 16], [21, 16], [22, 16]] }\n', text)


class CalmTwinTest(unittest.TestCase):
    def test_flash_frames_are_replaced_by_their_neighbours(self) -> None:
        frames = [Sprite(2, 2) for _ in range(4)]
        for index, frame in enumerate(frames):
            frame.set(0, 0, f"#0000{index:02x}")
        original, calm = with_calm(
            Animation("hit", 30, False, frames, {"at": [(0, 0), (1, 0), (0, 1), (1, 1)]}), [0, 3]
        )
        self.assertEqual(calm.name, "hit-calm")
        self.assertEqual([f.get(0, 0) for f in calm.frames], ["#000001", "#000001", "#000002", "#000002"])
        self.assertEqual(list(calm.anchors["at"]), [(1, 0), (1, 0), (0, 1), (0, 1)])
        self.assertIs(original.frames, frames)

    def test_strips_reject_mismatched_frames(self) -> None:
        strip = Strip(frame=(4, 4), origin=(0, 0), animations=[Animation("a", 8, True, [Sprite(4, 4), Sprite(3, 4)])])
        with self.assertRaises(ValueError):
            strip.validate("test")


if __name__ == "__main__":
    unittest.main()
