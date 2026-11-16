"""The committed arcade skill art honours the look asset contract (ASSETS.md) and is up to date."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Dict, Iterator, Tuple

from PIL import Image

import build
from skillart import SKILLS

from .helpers import ASSETS

MAX_COLORS = 48

# The art is committed as *.art.ts modules: its PNGs are on disk only while exported (tools/art/README.md).
EXPORTED = any(ASSETS.rglob("*.png"))
NEEDS_PNGS = unittest.skipUnless(
    EXPORTED, "the art's PNGs are not on disk: run `pnpm build:art --export src/game` (tools/art/README.md)"
)


def _sheets() -> Iterator[Tuple[str, Path, dict, Image.Image]]:
    for skill_id in SKILLS:
        for manifest in sorted((ASSETS / skill_id).glob("*.json")):
            with Image.open(manifest.with_suffix(".png")) as image:
                image.load()
                yield skill_id, manifest, json.loads(manifest.read_text()), image


class AssetContractTest(unittest.TestCase):
    def test_every_skill_has_an_icon_and_effects(self) -> None:
        for skill_id in SKILLS:
            names = {p.stem for p in (ASSETS / skill_id).glob("*.json")}
            self.assertIn("icon", names, skill_id)
            self.assertTrue(any(name.startswith("fx-") for name in names), f"{skill_id} has no effect strips")
            for name in names:
                self.assertTrue(name == "icon" or name.startswith("fx-"), f"{skill_id}/{name} is not icon or fx-*")
                if EXPORTED:
                    self.assertTrue((ASSETS / skill_id / f"{name}.png").exists(), f"{skill_id}/{name}.png is missing")
                else:
                    self.assertTrue((ASSETS / skill_id / f"{name}.art.ts").exists(), f"{skill_id}/{name}.art.ts is missing")

    def test_icons_are_24px_with_one_idle_loop(self) -> None:
        for skill_id in SKILLS:
            manifest = json.loads((ASSETS / skill_id / "icon.json").read_text())
            self.assertEqual(manifest["frame"], {"w": 24, "h": 24}, skill_id)
            self.assertEqual(manifest["origin"], {"x": 0, "y": 0}, skill_id)
            self.assertEqual([a["name"] for a in manifest["animations"]], ["idle"], skill_id)
            self.assertTrue(manifest["animations"][0]["loop"], skill_id)

    @NEEDS_PNGS
    def test_manifests_are_well_formed(self) -> None:
        for skill_id, path, manifest, _ in _sheets():
            where = f"{skill_id}/{path.name}"
            self.assertEqual(set(manifest), {"frame", "origin", "animations"}, where)
            w, h = manifest["frame"]["w"], manifest["frame"]["h"]
            self.assertTrue(w > 0 and h > 0, where)
            names = [a["name"] for a in manifest["animations"]]
            self.assertEqual(len(names), len(set(names)), f"{where}: duplicate animation names")
            for animation in manifest["animations"]:
                self.assertGreater(animation["fps"], 0, where)
                self.assertGreater(animation["frames"], 0, where)
                self.assertIsInstance(animation["loop"], bool, where)
                for anchor, points in animation.get("anchors", {}).items():
                    self.assertEqual(len(points), animation["frames"], f"{where}: anchor {anchor}")
                    for x, y in points:
                        self.assertTrue(0 <= x < w and 0 <= y < h, f"{where}: anchor {anchor} outside the frame")

    @NEEDS_PNGS
    def test_calm_twins_match_their_animation(self) -> None:
        for skill_id, path, manifest, _ in _sheets():
            animations: Dict[str, dict] = {a["name"]: a for a in manifest["animations"]}
            for name, animation in animations.items():
                if name.endswith("-calm"):
                    original = animations.get(name[: -len("-calm")])
                    self.assertIsNotNone(original, f"{skill_id}/{path.name}: {name} has no original")
                    for key in ("fps", "loop", "frames"):
                        self.assertEqual(animation[key], original[key], f"{skill_id}/{path.name}: {name}.{key}")

    @NEEDS_PNGS
    def test_pngs_follow_the_sheet_layout(self) -> None:
        for skill_id, path, manifest, image in _sheets():
            where = f"{skill_id}/{path.name}"
            w, h = manifest["frame"]["w"], manifest["frame"]["h"]
            animations = manifest["animations"]
            self.assertEqual(image.mode, "RGBA", where)
            self.assertEqual(image.size, (w * max(a["frames"] for a in animations), h * len(animations)), where)
            alpha = image.getchannel("A")
            self.assertLessEqual(set(alpha.getdata()), {0, 255}, f"{where}: alpha must be 0 or 255")
            colors = {rgba[:3] for rgba in image.getdata() if rgba[3]}
            self.assertLessEqual(len(colors), MAX_COLORS, f"{where}: {len(colors)} colours")
            for row, animation in enumerate(animations):
                for col in range(animation["frames"], image.width // w):
                    cell = alpha.crop((col * w, row * h, col * w + w, row * h + h))
                    self.assertIsNone(cell.getbbox(), f"{where}: unused cell {row},{col} is not empty")
                # Only the last frame of a one-shot may be empty: the moment an effect is gone.
                drawn = range(animation["frames"] - (0 if animation["loop"] else 1))
                for col in drawn:
                    cell = alpha.crop((col * w, row * h, col * w + w, row * h + h))
                    self.assertIsNotNone(cell.getbbox(), f"{where}: {animation['name']} frame {col} is empty")


class FreshnessTest(unittest.TestCase):
    def test_committed_art_matches_the_generators(self) -> None:
        self.assertEqual(build.stale(list(SKILLS)), [], "run tools/looks/arcade/skills/build.py and commit the result")


if __name__ == "__main__":
    unittest.main()
