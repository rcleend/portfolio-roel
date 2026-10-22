"""The committed hibit skill art honours the looks contract and matches a fresh build.

  python3 -m unittest discover -s tools/looks/hibit/skills -t tools/looks/hibit/skills
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any, Dict, List

from PIL import Image

import build
from hibitfx.sheet import MAX_SHEET_COLORS
from hibitfx.skills import SKILLS

SKILL_IDS = ("full-stack-attack", "agent-summon", "ux-elixir", "power-chord", "north-star", "churn-shield")


def _sheets(skill: str) -> List[Path]:
    return sorted((build.OUT / skill).glob("*.json"))


def _load(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _image(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGBA")


class LooksContractTest(unittest.TestCase):
    def test_every_skill_has_an_icon_and_effects(self) -> None:
        self.assertEqual(set(SKILLS), set(SKILL_IDS))
        for skill in SKILL_IDS:
            names = [p.stem for p in _sheets(skill)]
            self.assertIn("icon", names, skill)
            fx = [n for n in names if n.startswith("fx-")]
            self.assertTrue(fx, f"{skill} has no effect strips")
            self.assertEqual(set(names), {"icon", *fx}, f"{skill}: only icon and fx-* sheets belong here")

    def test_icons_are_24px_idle_loops(self) -> None:
        for skill in SKILL_IDS:
            manifest = _load(build.OUT / skill / "icon.json")
            self.assertEqual(manifest["frame"], {"w": 24, "h": 24}, skill)
            self.assertEqual(manifest["origin"], {"x": 0, "y": 0}, skill)
            self.assertEqual([a["name"] for a in manifest["animations"]], ["idle"], skill)
            self.assertTrue(manifest["animations"][0]["loop"], skill)

    def test_sheets_follow_the_layout(self) -> None:
        for skill in SKILL_IDS:
            for path in _sheets(skill):
                with self.subTest(sheet=f"{skill}/{path.stem}"):
                    manifest = _load(path)
                    w, h = manifest["frame"]["w"], manifest["frame"]["h"]
                    anims = manifest["animations"]
                    image = _image(path.with_suffix(".png"))
                    columns = max(a["frames"] for a in anims)
                    self.assertEqual(image.size, (w * columns, h * len(anims)))
                    ox, oy = manifest["origin"]["x"], manifest["origin"]["y"]
                    self.assertTrue(0 <= ox <= w and 0 <= oy <= h, "origin inside the frame")
                    names = [a["name"] for a in anims]
                    self.assertEqual(len(names), len(set(names)), "unique animation names")
                    for row, anim in enumerate(anims):
                        self.assertGreater(anim["fps"], 0)
                        self.assertIsInstance(anim["loop"], bool)
                        for anchor, points in anim.get("anchors", {}).items():
                            self.assertEqual(len(points), anim["frames"], f"{anim['name']}.{anchor}")
                        # Cells past an animation's last frame stay transparent.
                        for col in range(anim["frames"], columns):
                            cell = image.crop((col * w, row * h, col * w + w, row * h + h))
                            self.assertIsNone(cell.getbbox(), f"{anim['name']} cell {col} not empty")
                        # Every frame draws something.
                        for col in range(anim["frames"]):
                            cell = image.crop((col * w, row * h, col * w + w, row * h + h))
                            self.assertIsNotNone(cell.getchannel("A").getbbox(), f"{anim['name']} frame {col} is empty")

    def test_pixels_are_binary_alpha_and_palette_limited(self) -> None:
        for skill in SKILL_IDS:
            for path in _sheets(skill):
                with self.subTest(sheet=f"{skill}/{path.stem}"):
                    image = _image(path.with_suffix(".png"))
                    alphas = set(image.getchannel("A").getdata())
                    self.assertLessEqual(alphas, {0, 255})
                    colors = {px[:3] for px in image.getdata() if px[3] == 255}
                    self.assertLessEqual(len(colors), MAX_SHEET_COLORS)

    def test_committed_files_match_a_fresh_build(self) -> None:
        for skill in SKILL_IDS:
            self.assertEqual(build.check(skill), [], skill)

    def test_icon_rest_frame_is_the_hud_frame(self) -> None:
        """The HUD freezes a recharging icon on frame 0, so frame 0 must be the calm rest pose."""
        for skill in SKILL_IDS:
            frames = SKILLS[skill].sheets()[0].anims[0].frames
            self.assertEqual(len(frames), 24)
            # The rest pose recurs: some later frame is identical to frame 0 (no event in progress).
            self.assertTrue(any(f.px == frames[0].px for f in frames[1:]), skill)


if __name__ == "__main__":
    unittest.main()
