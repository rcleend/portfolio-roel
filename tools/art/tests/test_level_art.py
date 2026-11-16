"""Validates the level art against the layers.json contract: the manifests always, the pixels once exported."""

from __future__ import annotations

import importlib
import json
import unittest
from typing import Any, Dict

from PIL import Image

from tests.helpers import REPO_ROOT

from drawn.tileset import GRID, TILE  # noqa: E402

LEVELS = ("luna", "scripe")
REQUIRED_LAYERS = ("sky", "far", "mid", "near")

# The art is committed as *.art.ts modules: its PNGs are on disk only while exported (tools/art/README.md).
EXPORTED = any((REPO_ROOT / "src/game/levels").rglob("*.png"))
NEEDS_PNGS = unittest.skipUnless(
    EXPORTED, "the art's PNGs are not on disk: run `pnpm build:art --export src/game` (tools/art/README.md)"
)


def _manifest(level: str) -> Dict[str, Any]:
    return json.loads((REPO_ROOT / "src/game/levels" / level / "art/layers.json").read_text())


def _image(level: str, name: str) -> Image.Image:
    with Image.open(REPO_ROOT / "src/game/levels" / level / "art" / name) as image:
        return image.convert("RGBA")


class LevelArtTest(unittest.TestCase):
    @NEEDS_PNGS
    def test_manifest_matches_files(self) -> None:
        for level in LEVELS:
            m = _manifest(level)
            self.assertEqual(m["levelId"], level)
            self.assertEqual(m["nativeSize"], [320, 240])
            ids = [layer["id"] for layer in m["layers"]]
            for required in REQUIRED_LAYERS:
                self.assertIn(required, ids, level)
            for layer in m["layers"]:
                image = _image(level, layer["file"])
                self.assertEqual(image.size, (layer["width"], layer["height"]), f"{level}/{layer['id']}")
            for name, prop in m["props"].items():
                image = _image(level, prop["file"])
                self.assertEqual(image.size, (prop["w"] * prop["frames"], prop["h"]), f"{level}/{name}")

    def test_layers_cover_the_screen(self) -> None:
        for level in LEVELS:
            for layer in _manifest(level)["layers"]:
                if layer["opaque"]:
                    self.assertGreaterEqual(layer["width"], 320)
                    self.assertGreaterEqual(layer["height"], 240)
                if layer["id"] == "far":
                    # Covers a 3,840 px level without repeating.
                    self.assertGreaterEqual(layer["width"] - 320, round((3840 - 320) * layer["factor"]))
                if layer["repeatX"]:
                    self.assertGreaterEqual(layer["width"], 480, f"{level}/{layer['id']}")

    @NEEDS_PNGS
    def test_pixels_are_crisp(self) -> None:
        for level in LEVELS:
            m = _manifest(level)
            files = [layer["file"] for layer in m["layers"]] + [p["file"] for p in m["props"].values()] + ["tileset.png"]
            for name in files:
                image = _image(level, name)
                alphas = set(image.getchannel("A").getdata())
                self.assertTrue(alphas <= {0, 255}, f"{level}/{name} has soft alpha")
                colours = {px[:3] for px in image.getdata() if px[3]}
                self.assertLessEqual(len(colours), 64, f"{level}/{name} palette too large")

    @NEEDS_PNGS
    def test_tileset_grid(self) -> None:
        for level in LEVELS:
            m = _manifest(level)
            tiles = m["tileset"]["tiles"]
            sheet = _image(level, m["tileset"]["file"])
            self.assertEqual(sheet.size, (len(GRID[0]) * TILE, len(GRID) * TILE))
            for name in ("ground_top", "ground_fill", "ground_base", "platform_mid", "block_highlight", "block_used"):
                self.assertIn(name, tiles)

    @NEEDS_PNGS
    def test_ground_tiles_join_seamlessly(self) -> None:
        """Every tile in a run family must share its silhouette on both sides,
        and the solid ground rows must have no transparent pixel at all."""
        families = [
            ("ground_top_left", "ground_top", "ground_top_alt", "ground_top_right", "pit_edge_left", "pit_edge_right"),
            ("ground_fill_left", "ground_fill", "ground_fill_alt", "ground_fill_right"),
            ("ground_base_left", "ground_base", "ground_base_alt", "ground_base_right"),
            ("platform_left", "platform_mid", "platform_mid_alt", "platform_right"),
        ]
        for level in LEVELS:
            m = _manifest(level)
            sheet = _image(level, m["tileset"]["file"])
            tiles = m["tileset"]["tiles"]

            def tile(name: str) -> Image.Image:
                col, row = tiles[name]
                return sheet.crop((col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE))

            for family in families:
                # Columns that meet another tile of the run: the right column of
                # everything but the right cap, the left column of everything
                # but the left cap. Their silhouettes must be identical.
                joints = set()
                for name in family:
                    t = tile(name)
                    if not name.endswith("_right"):
                        joints.add(tuple(t.getpixel((TILE - 1, y))[3] for y in range(TILE)))
                    if not name.endswith("_left"):
                        joints.add(tuple(t.getpixel((0, y))[3] for y in range(TILE)))
                    if name.startswith(("ground_", "pit_edge")):
                        self.assertEqual(t.getchannel("A").getextrema(), (255, 255), f"{level}/{name}")
                self.assertEqual(len(joints), 1, f"{level}: {family[0]} run has mismatched joints")
            for name in ("ground_base", "ground_base_alt", "pit_fill", "platform_support"):
                t = tile(name)
                top = [t.getpixel((x, 0))[3] for x in range(TILE)]
                bottom = [t.getpixel((x, TILE - 1))[3] for x in range(TILE)]
                self.assertEqual(top, bottom, f"{level}/{name} does not repeat vertically")

    def test_palette_matches_drawn_module(self) -> None:
        for level in LEVELS:
            drawn = importlib.import_module(f"drawn.{level}")
            self.assertEqual(set(_manifest(level)["palette"]), {v.lower() for v in drawn.PALETTE.values()})


if __name__ == "__main__":
    unittest.main()
