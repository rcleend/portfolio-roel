"""Validates the committed portrait-look sheets against the look asset contract.

  python3 -m unittest discover -s tools/looks/portrait/characters -t tools/looks/portrait/characters
"""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image

HERE = Path(__file__).resolve().parents[1]
REPO = HERE.parents[3]
LOOK = REPO / "src" / "game" / "art" / "looks" / "portrait"
HEROES = ("hackerman", "artsy", "strategy")
HERO_ANIMS = ["idle", "run", "jump", "fall", "attack", "skill", "hurt", "victory"]
CUSTOMER_ANIMS = ["walk", "shout", "hurt", "stunned", "happy"]
LOOPING = {"idle", "run", "walk", "victory"}
ONCE = {"attack", "skill", "hurt"}
MAX_COLOURS = 52


def load(png: Path) -> Tuple[Image.Image, dict]:
    with Image.open(png) as image:
        return image.copy(), json.loads(png.with_suffix(".json").read_text())


def cell(image: Image.Image, meta: dict, row: int, col: int) -> Image.Image:
    w, h = meta["frame"]["w"], meta["frame"]["h"]
    return image.crop((col * w, row * h, col * w + w, row * h + h))


def opaque_box(image: Image.Image):
    alpha = image.getchannel("A")
    return alpha.getbbox()


class SheetContract(unittest.TestCase):
    def check_sheet(self, png: Path, expected: List[str], frame: Tuple[int, int], origin: Tuple[int, int]) -> dict:
        image, meta = load(png)
        name = png.relative_to(LOOK)
        self.assertEqual(image.mode, "RGBA", name)
        self.assertEqual((meta["frame"]["w"], meta["frame"]["h"]), frame, name)
        self.assertEqual((meta["origin"]["x"], meta["origin"]["y"]), origin, name)
        anims = meta["animations"]
        if expected:
            self.assertEqual([a["name"] for a in anims], expected, name)
        widest = max(a["frames"] for a in anims)
        self.assertEqual(image.size, (frame[0] * widest, frame[1] * len(anims)), name)
        alphas = set(image.getchannel("A").getdata())
        self.assertLessEqual(alphas, {0, 255}, f"{name}: alpha must be 0 or 255")
        colours = {p[:3] for p in image.getdata() if p[3]}
        self.assertLessEqual(len(colours), MAX_COLOURS, f"{name}: {len(colours)} colours")
        for row, a in enumerate(anims):
            self.assertGreater(a["fps"], 0, f"{name}:{a['name']}")
            self.assertIsInstance(a["loop"], bool)
            for col in range(widest):
                box = opaque_box(cell(image, meta, row, col))
                if col < a["frames"]:
                    self.assertIsNotNone(box, f"{name}:{a['name']}[{col}] is empty")
                else:
                    self.assertIsNone(box, f"{name}:{a['name']}: unused cell {col} must be transparent")
            for key, points in a.get("anchors", {}).items():
                self.assertEqual(len(points), a["frames"], f"{name}:{a['name']}.{key}")
                for x, y in points:
                    self.assertTrue(0 <= x < frame[0] and 0 <= y < frame[1], f"{name}:{a['name']}.{key} {x},{y}")
        return meta

    def test_hero_sheets(self) -> None:
        for hero in HEROES:
            meta = self.check_sheet(LOOK / "characters" / hero / "sheet.png", HERO_ANIMS, (64, 64), (32, 64))
            by_name = {a["name"]: a for a in meta["animations"]}
            for name in LOOPING & set(by_name):
                self.assertTrue(by_name[name]["loop"], f"{hero}:{name} must loop")
            for name in ONCE:
                self.assertFalse(by_name[name]["loop"], f"{hero}:{name} plays once")
                self.assertLessEqual(by_name[name]["frames"] / by_name[name]["fps"], 0.45, f"{hero}:{name} too long")
            self.assertIn("muzzle", by_name["attack"].get("anchors", {}), hero)
            self.assertIn("hand", by_name["skill"].get("anchors", {}), hero)
            if hero == "artsy":
                # UX ELIXIR's potion meets his lips (PHASE-B-NOTES: mouth anchor).
                self.assertIn("mouth", by_name["skill"]["anchors"])

    def test_customer_sheet(self) -> None:
        meta = self.check_sheet(LOOK / "customer" / "sheet.png", CUSTOMER_ANIMS, (64, 64), (32, 64))
        by_name = {a["name"]: a for a in meta["animations"]}
        self.assertTrue(by_name["walk"]["loop"])
        self.assertTrue(by_name["happy"]["loop"], "happy plays while he strolls off")

    def test_attack_sheets(self) -> None:
        for hero in HEROES:
            meta = self.check_sheet(LOOK / "characters" / hero / "attack.png", [], (32, 24), (16, 12))
            names = [a["name"] for a in meta["animations"]]
            for required in ("projectile", "impact", "muzzle"):
                self.assertIn(required, names, hero)

    def test_standing_height_and_feet(self) -> None:
        sheets = [(h, LOOK / "characters" / h / "sheet.png", "idle") for h in HEROES]
        sheets.append(("customer", LOOK / "customer" / "sheet.png", "walk"))
        for who, png, anim in sheets:
            image, meta = load(png)
            row = [a["name"] for a in meta["animations"]].index(anim)
            for col in range(meta["animations"][row]["frames"]):
                box = opaque_box(cell(image, meta, row, col))
                self.assertEqual(box[3], 64, f"{who}:{anim}[{col}] feet must rest on the bottom row")
            box = opaque_box(cell(image, meta, row, 1 if who == "customer" else 0))
            height = box[3] - box[1]
            low, high = (46, 56) if who == "customer" else (54, 60)
            self.assertTrue(low <= height <= high, f"{who} stands {height} px tall")

    def test_outputs_are_current(self) -> None:
        result = subprocess.run([sys.executable, str(HERE / "build.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class HeadKit(unittest.TestCase):
    """The likeness must never wobble: only lens interiors and the mouth change."""

    def test_expressions_share_hair_glasses_and_jaw(self) -> None:
        sys.path.insert(0, str(HERE))
        from portraitkit import heads

        for cap in (False, True):
            kit = heads.build(cap=cap)
            base = kit["smile"].cells
            for name, pm in kit.items():
                for (x, y), c in base.items():
                    if y in heads.EXPRESSIONS[name]:
                        continue
                    self.assertEqual(pm.cells.get((x, y)), c, f"cap={cap} {name} differs at {x},{y}")

    def test_cap_only_replaces_the_hair(self) -> None:
        sys.path.insert(0, str(HERE))
        from portraitkit import heads

        bare, cap = heads.build(False)["smile"].cells, heads.build(True)["smile"].cells
        rows = len(heads.CAP_ROWS)
        for (x, y), c in bare.items():
            if y >= rows:
                self.assertEqual(cap.get((x, y)), c, f"cap changes the face at {x},{y}")


if __name__ == "__main__":
    unittest.main()
