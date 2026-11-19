"""The committed portrait skill art honours the look-asset contract (ASSETS.md) and is up to date.

  python3 -m unittest discover -s tools/looks/portrait/skills -t tools/looks/portrait/skills
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from portrait_fx.sheet import validate_files
from portrait_fx.skills import SKILLS

sys.path.insert(1, str(Path(__file__).resolve().parents[3]))  # tools/looks, for artfiles

import artfiles  # noqa: E402

REPO = Path(__file__).resolve().parents[5]
OUT = REPO / "src" / "game" / "art" / "looks" / "portrait" / "skills"
SKILL_IDS = ("full-stack-attack", "agent-summon", "ux-elixir", "power-chord", "north-star", "churn-shield")

# The art is committed as *.art.ts modules: its PNGs are on disk only while exported (tools/art/README.md).
EXPORTED = any(OUT.rglob("*.png"))
NEEDS_PNGS = unittest.skipUnless(
    EXPORTED, "the art's PNGs are not on disk: run `pnpm build:art --export src/game` (tools/art/README.md)"
)


class ContractTest(unittest.TestCase):
    def test_every_skill_is_drawn(self) -> None:
        self.assertEqual(sorted(SKILLS), sorted(SKILL_IDS))

    def test_icons(self) -> None:
        for skill_id in SKILL_IDS:
            with self.subTest(skill_id):
                manifest = json.loads((OUT / skill_id / "icon.json").read_text())
                self.assertEqual(manifest["frame"], {"w": 24, "h": 24})
                self.assertEqual(manifest["origin"], {"x": 0, "y": 0})
                self.assertEqual([a["name"] for a in manifest["animations"]], ["idle"])
                self.assertTrue(manifest["animations"][0]["loop"])

    @NEEDS_PNGS
    def test_every_strip_follows_the_sheet_format(self) -> None:
        for skill_id in SKILL_IDS:
            for manifest in sorted((OUT / skill_id).glob("*.json")):
                with self.subTest(f"{skill_id}/{manifest.name}"):
                    self.assertTrue(manifest.name == "icon.json" or manifest.name.startswith("fx-"))
                    png = manifest.with_suffix(".png")
                    self.assertEqual(validate_files(png, manifest), [])
                    data = json.loads(manifest.read_text())
                    for animation in data["animations"]:
                        for name, points in animation.get("anchors", {}).items():
                            self.assertEqual(len(points), animation["frames"], name)
                            for x, y in points:
                                self.assertTrue(0 <= x < data["frame"]["w"] and 0 <= y < data["frame"]["h"], name)

    @NEEDS_PNGS
    def test_no_frame_is_empty(self) -> None:
        # Fades may end on a single pixel, but never on a blank cell.
        for skill_id in SKILL_IDS:
            for manifest in sorted((OUT / skill_id).glob("*.json")):
                data = json.loads(manifest.read_text())
                w, h = data["frame"]["w"], data["frame"]["h"]
                with Image.open(manifest.with_suffix(".png")) as image:
                    sheet = image.convert("RGBA")
                for row, animation in enumerate(data["animations"]):
                    for column in range(animation["frames"]):
                        cell = sheet.crop((column * w, row * h, (column + 1) * w, (row + 1) * h))
                        with self.subTest(f"{skill_id}/{manifest.stem}/{animation['name']}[{column}]"):
                            self.assertTrue(any(px[3] for px in cell.getdata()))


class FreshnessTest(unittest.TestCase):
    def test_committed_assets_match_the_generators(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            for skill_id in SKILL_IDS:
                produced = set()
                for strip in SKILLS[skill_id].strips():
                    png, manifest = strip.write(Path(scratch) / skill_id)
                    for path in (png, manifest):
                        produced.add(path.name)
                        committed = OUT / skill_id / path.name
                        if path.suffix == ".png" and not EXPORTED:
                            continue
                        with self.subTest(str(committed.relative_to(REPO))):
                            # A manifest byte for byte, a PNG pixel for pixel (an exported PNG is another encoder's).
                            self.assertTrue(artfiles.same(committed, path), "run tools/looks/portrait/skills/build.py")
                art = {p.name for p in (OUT / skill_id).iterdir() if p.suffix in (".png", ".json")}
                stray = art - produced
                self.assertEqual(stray, set(), f"{skill_id}: files no generator produces")

    def test_generation_is_deterministic(self) -> None:
        for skill_id in SKILL_IDS:
            first = [strip.image().tobytes() for strip in SKILLS[skill_id].strips()]
            second = [strip.image().tobytes() for strip in SKILLS[skill_id].strips()]
            self.assertEqual(first, second, skill_id)


if __name__ == "__main__":
    unittest.main()
