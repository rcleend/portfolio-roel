"""The shipped hibit cast honours the look-asset contract (.context/looks/ASSETS.md)."""

import json
import unittest
from pathlib import Path

from PIL import Image

from hibit.sheet import MAX_COLOURS, colours

REPO = Path(__file__).resolve().parents[5]
ART = REPO / "src" / "game" / "art" / "looks" / "hibit"
HEROES = ("hackerman", "artsy", "strategy")
HERO_ANIMATIONS = ["idle", "run", "jump", "fall", "attack", "skill", "hurt", "victory"]
CUSTOMER_ANIMATIONS = ["walk", "shout", "hurt", "stunned", "happy"]
LOOPS = {"idle", "run", "walk", "victory"}
ONCE = {"attack", "skill", "hurt"}

# The art is committed as *.art.ts modules: its PNGs are on disk only while exported (tools/art/README.md).
EXPORTED = any(ART.rglob("*.png"))
NEEDS_PNGS = unittest.skipUnless(
    EXPORTED, "the art's PNGs are not on disk: run `pnpm build:art --export src/game` (tools/art/README.md)"
)


def load(png: Path):
    return Image.open(png).convert("RGBA"), json.loads(png.with_suffix(".json").read_text())


class SheetContract(unittest.TestCase):
    def assert_sheet(self, png: Path, names, frame, origin) -> dict:
        img, meta = load(png)
        self.assertEqual(meta["frame"], {"w": frame[0], "h": frame[1]})
        self.assertEqual(meta["origin"], {"x": origin[0], "y": origin[1]})
        if names is not None:
            self.assertEqual([a["name"] for a in meta["animations"]], names)
        widest = max(a["frames"] for a in meta["animations"])
        self.assertEqual(img.size, (frame[0] * widest, frame[1] * len(meta["animations"])))
        alphas = {a for _, (_, _, _, a) in img.getcolors(1 << 20)}
        self.assertLessEqual(alphas, {0, 255})
        self.assertLessEqual(len(colours(img)), MAX_COLOURS)
        for row, anim in enumerate(meta["animations"]):
            self.assertGreater(anim["fps"], 0)
            if anim["name"] in LOOPS:
                self.assertTrue(anim["loop"], anim["name"])
            if anim["name"] in ONCE:
                self.assertFalse(anim["loop"], anim["name"])
            for col in range(anim["frames"]):
                cell = img.crop((col * frame[0], row * frame[1], (col + 1) * frame[0], (row + 1) * frame[1]))
                self.assertIsNotNone(cell.getbbox(), f"{png.name} {anim['name']}[{col}] is empty")
            for name, points in anim.get("anchors", {}).items():
                self.assertEqual(len(points), anim["frames"], f"{anim['name']}.{name}")
                for x, y in points:
                    self.assertTrue(0 <= x < frame[0] and 0 <= y < frame[1], f"{anim['name']}.{name} {x},{y}")
        return meta

    @NEEDS_PNGS
    def test_hero_sheets(self) -> None:
        for hero in HEROES:
            with self.subTest(hero=hero):
                meta = self.assert_sheet(ART / "characters" / hero / "sheet.png", HERO_ANIMATIONS, (64, 64), (32, 64))
                anims = {a["name"]: a for a in meta["animations"]}
                self.assertIn("muzzle", anims["attack"]["anchors"])
                self.assertIn("hand", anims["skill"]["anchors"])
        artsy = load(ART / "characters" / "artsy" / "sheet.png")[1]
        skill = next(a for a in artsy["animations"] if a["name"] == "skill")
        self.assertIn("mouth", skill["anchors"], "UX ELIXIR needs Artsy's lips")

    @NEEDS_PNGS
    def test_attack_sprites(self) -> None:
        for hero in HEROES:
            with self.subTest(hero=hero):
                meta = self.assert_sheet(ART / "characters" / hero / "attack.png", None, (32, 32), (16, 16))
                anims = {a["name"]: a for a in meta["animations"]}
                self.assertTrue(anims["projectile"]["loop"])
                self.assertFalse(anims["impact"]["loop"])
                self.assertIn("muzzle", anims)

    @NEEDS_PNGS
    def test_customer_sheet(self) -> None:
        self.assert_sheet(ART / "customer" / "sheet.png", CUSTOMER_ANIMATIONS, (64, 64), (32, 64))

    @NEEDS_PNGS
    def test_heroes_stand_on_the_feet_line_at_hibit_scale(self) -> None:
        for hero in HEROES:
            img, _ = load(ART / "characters" / hero / "sheet.png")
            idle = img.crop((0, 0, 64, 64))
            left, top, right, bottom = idle.getbbox()
            with self.subTest(hero=hero):
                self.assertEqual(bottom, 64, "feet rest on the bottom edge")
                self.assertTrue(54 <= bottom - top <= 61, f"standing height {bottom - top}")


if __name__ == "__main__":
    unittest.main()
