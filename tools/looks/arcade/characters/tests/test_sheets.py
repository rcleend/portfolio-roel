"""The committed arcade character sheets honour the look-asset contract (ASSETS.md, STYLES.md)."""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Tuple

from PIL import Image

HERE = Path(__file__).resolve().parent
TOOL = HERE.parent
REPO = TOOL.parents[3]
ART = REPO / "src" / "game" / "art" / "looks" / "arcade"

HEROES = ("hackerman", "artsy", "strategy")
HERO_ANIMATIONS = ("idle", "run", "jump", "fall", "attack", "skill", "hurt", "victory")
CUSTOMER_ANIMATIONS = ("walk", "shout", "hurt", "stunned", "happy")
LOOPING = {"idle", "run", "fall", "victory", "walk", "shout", "stunned", "happy", "projectile"}

# The art is committed as *.art.ts modules: its PNGs are on disk only while exported (tools/art/README.md).
EXPORTED = any(ART.rglob("*.png"))
NEEDS_PNGS = unittest.skipUnless(
    EXPORTED, "the art's PNGs are not on disk: run `pnpm build:art --export src/game` (tools/art/README.md)"
)


def load(directory: Path, stem: str) -> Tuple[Image.Image, Dict[str, Any]]:
    with Image.open(directory / f"{stem}.png") as image:
        return image.convert("RGBA"), json.loads((directory / f"{stem}.json").read_text())


def frames(image: Image.Image, meta: Dict[str, Any], name: str) -> List[Image.Image]:
    fw, fh = meta["frame"]["w"], meta["frame"]["h"]
    names = [a["name"] for a in meta["animations"]]
    row = names.index(name)
    count = meta["animations"][row]["frames"]
    return [image.crop((i * fw, row * fh, (i + 1) * fw, (row + 1) * fh)) for i in range(count)]


class SheetContract(unittest.TestCase):
    def assert_sheet(self, directory: Path, stem: str, names: Tuple[str, ...], size: Tuple[int, int]) -> None:
        image, meta = load(directory, stem)
        label = f"{directory.name}/{stem}"
        self.assertEqual((meta["frame"]["w"], meta["frame"]["h"]), size, label)
        self.assertEqual(tuple(a["name"] for a in meta["animations"])[: len(names)], names, label)
        widest = max(a["frames"] for a in meta["animations"])
        self.assertEqual(image.size, (size[0] * widest, size[1] * len(meta["animations"])), label)
        colours = set()
        for r, g, b, a in image.getdata():
            self.assertIn(a, (0, 255), f"{label}: alpha must be binary")
            if a:
                colours.add((r, g, b))
        self.assertLessEqual(len(colours), 64, f"{label}: palette too large")
        for row, anim in enumerate(meta["animations"]):
            self.assertGreater(anim["fps"], 0)
            self.assertEqual(anim["loop"], anim["name"].split("-")[0] in LOOPING, f"{label}:{anim['name']} loop flag")
            for anchor, points in anim.get("anchors", {}).items():
                self.assertEqual(len(points), anim["frames"], f"{label}:{anim['name']}.{anchor}")
                for x, y in points:
                    self.assertTrue(0 <= x < size[0] and 0 <= y < size[1], f"{label}:{anim['name']}.{anchor}")
            for i, frame in enumerate(frames(image, meta, anim["name"])):
                self.assertIsNotNone(frame.getbbox(), f"{label}:{anim['name']}[{i}] is empty")

    @NEEDS_PNGS
    def test_hero_sheets(self) -> None:
        for hero in HEROES:
            directory = ART / "characters" / hero
            self.assert_sheet(directory, "sheet", HERO_ANIMATIONS, (64, 64))
            _, meta = load(directory, "sheet")
            self.assertEqual(meta["origin"], {"x": 32, "y": 64})
            anims = {a["name"]: a for a in meta["animations"]}
            self.assertIn("muzzle", anims["attack"]["anchors"], hero)
            self.assertIn("hand", anims["skill"]["anchors"], hero)

    @NEEDS_PNGS
    def test_heroes_stand_on_the_feet_line_at_scale(self) -> None:
        for hero in HEROES:
            image, meta = load(ART / "characters" / hero, "sheet")
            stand = frames(image, meta, "idle")[0]
            left, top, right, bottom = stand.getbbox()
            self.assertEqual(bottom, 64, f"{hero}: soles rest on the bottom edge")
            self.assertTrue(54 <= bottom - top <= 61, f"{hero}: standing height {bottom - top}")
            feet = [x for x in range(64) if stand.getpixel((x, 63))[3]]
            self.assertLess(abs((min(feet) + max(feet)) / 2 - 32), 4, f"{hero}: feet centred on the origin")

    @NEEDS_PNGS
    def test_attack_sheets(self) -> None:
        for hero in HEROES:
            directory = ART / "characters" / hero
            self.assert_sheet(directory, "attack", ("projectile", "impact", "muzzle"), (32, 32))
            _, meta = load(directory, "attack")
            self.assertEqual(meta["origin"], {"x": 16, "y": 16})

    @NEEDS_PNGS
    def test_customer_sheet(self) -> None:
        directory = ART / "customer"
        self.assert_sheet(directory, "sheet", CUSTOMER_ANIMATIONS, (64, 64))
        image, meta = load(directory, "sheet")
        self.assertEqual(meta["origin"], {"x": 32, "y": 64})
        anims = {a["name"]: a for a in meta["animations"]}
        self.assertIn("mouth", anims["shout"]["anchors"])
        # The game holds walk frame 1 as the standing pose: both feet on the ground.
        standing = frames(image, meta, "walk")[1]
        self.assertEqual(standing.getbbox()[3], 64)

    def test_build_is_reproducible(self) -> None:
        result = subprocess.run(
            [sys.executable, str(TOOL / "build.py"), "--check"], capture_output=True, text=True, check=False
        )
        # Without the PNGs the generator checks the JSON alone and says so with exit code 2.
        self.assertEqual(result.returncode, 0 if EXPORTED else 2, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
