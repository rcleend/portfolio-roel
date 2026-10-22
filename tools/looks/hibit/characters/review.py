#!/usr/bin/env python3
"""Review renders for the hibit cast, made from the built sheets (exactly what ships).

  python3 tools/looks/hibit/characters/review.py                 # -> /tmp/arcade-looks-hibit-chars/review
  python3 tools/looks/hibit/characters/review.py --out DIR --scale 4

Writes per-sheet contact sheets and GIFs, then composites key frames onto the real level
backdrops (layered by their layers.json, foreground in front), onto the character
select pedestal, and next to the captain's style reference at matching pixel scale.
Nothing here is loaded by the game.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "tools" / "art"))

from hibit.preview import DARK, MID, contact_sheet, gif  # noqa: E402

ART = REPO / "src" / "game" / "art" / "looks" / "hibit"
REFS = Path("/Users/roel/conductor/workspaces/firstmate/gwangju/.context/looks/refs")
HEROES = ("hackerman", "artsy", "strategy")

Frames = Dict[str, List[Image.Image]]


def load_sheet(png: Path) -> Tuple[Frames, dict]:
    meta = json.loads(png.with_suffix(".json").read_text())
    img = Image.open(png).convert("RGBA")
    w, h = meta["frame"]["w"], meta["frame"]["h"]
    out: Frames = {}
    for row, anim in enumerate(meta["animations"]):
        out[anim["name"]] = [img.crop((c * w, row * h, c * w + w, row * h + h)) for c in range(anim["frames"])]
    return out, meta


def sheets(directory: Path, scale: int) -> None:
    targets = [(f"hero-{h}", ART / "characters" / h / "sheet.png") for h in HEROES]
    targets += [(f"attack-{h}", ART / "characters" / h / "attack.png") for h in HEROES]
    targets.append(("customer", ART / "customer" / "sheet.png"))
    for name, png in targets:
        if not png.exists():
            continue
        frames, meta = load_sheet(png)
        fps = {a["name"]: a["fps"] for a in meta["animations"]}
        rows = [(f"{a} {fps[a]}fps", fs) for a, fs in frames.items()]
        s = scale if meta["frame"]["w"] >= 48 else scale * 2
        contact_sheet(rows, scale=s, bg=DARK).save(directory / f"{name}-dark.png")
        contact_sheet(rows, scale=s, bg=MID).save(directory / f"{name}-mid.png")
        gif_dir = directory / "gif"
        gif_dir.mkdir(exist_ok=True)
        for anim, fs in frames.items():
            gif(fs, gif_dir / f"{name}-{anim}.gif", fps[anim], scale=s)


# ── Level backdrops ──────────────────────────────────────────────────────────────


def level_scene(level_id: str, camera_x: int, placements: Sequence[Tuple[Image.Image, int, int]]) -> Image.Image:
    """The level as the game draws it, with sprites (image, centre x, feet y) on the play plane."""
    import preview as level_preview  # tools/art/preview.py

    level = level_preview.Level(level_id)
    frame = Image.new("RGBA", (level.width, level.height), (0, 0, 0, 255))
    layers = level.manifest["layers"]
    for layer in (l for l in layers if not l["foreground"]):
        level_preview.draw_layer(frame, level.images[layer["id"]], layer, camera_x)
    level_preview.draw_play_plane(frame, level, camera_x)
    for img, cx, feet in placements:
        frame.alpha_composite(img, (cx - img.width // 2, feet - img.height))
    for layer in (l for l in layers if l["foreground"]):
        level_preview.draw_layer(frame, level.images[layer["id"]], layer, camera_x)
    return frame


def hero_frames() -> Dict[str, Frames]:
    out = {}
    for h in HEROES:
        png = ART / "characters" / h / "sheet.png"
        if png.exists():
            out[h] = load_sheet(png)[0]
    return out


def customer_frames() -> Optional[Frames]:
    png = ART / "customer" / "sheet.png"
    return load_sheet(png)[0] if png.exists() else None


def scenes(directory: Path, scale: int) -> None:
    heroes = hero_frames()
    customer = customer_frames()
    for level_id, camera_x in (("scripe", 140), ("luna", 120)):
        placements = []
        picks = [("hackerman", "idle", 0), ("artsy", "attack", 0), ("strategy", "run", 2)]
        for i, (h, anim, f) in enumerate(picks):
            if h in heroes:
                placements.append((heroes[h][anim][f], 40 + i * 62, 200))
        if customer:
            placements.append((customer["walk"][2].transpose(Image.FLIP_LEFT_RIGHT), 236, 200))
            placements.append((customer["shout"][2].transpose(Image.FLIP_LEFT_RIGHT), 288, 200))
        frame = level_scene(level_id, camera_x, placements)
        frame.resize((frame.width * scale, frame.height * scale), Image.NEAREST).save(directory / f"scene-{level_id}.png")


def select_screen(directory: Path, scale: int) -> None:
    """Each hero on the character-select pedestal (native 320x240, feet at the old sprite's)."""
    base = Image.open(REFS / "current-character-select.png").convert("RGBA").resize((320, 240), Image.NEAREST)
    heroes = hero_frames()
    tiles = []
    for h in HEROES:
        if h not in heroes:
            continue
        frame = base.copy()
        # Erase the old sprite (x 74-91, y 137-169) by extending each row's background
        # from just left of it, so the spotlight gradient and the pedestal survive.
        for y in range(137, 170):
            left = frame.getpixel((73, y))
            right = frame.getpixel((92, y))
            for x in range(74, 92):
                frame.putpixel((x, y), left if x < 83 else right)
        img = heroes[h]["idle"][0]
        frame.alpha_composite(img, (81 - img.width // 2, 169 - img.height))
        tiles.append(frame.crop((0, 0, 160, 240)))
    if not tiles:
        return
    out = Image.new("RGBA", (len(tiles) * 160 * scale, 240 * scale))
    for i, t in enumerate(tiles):
        out.alpha_composite(t.resize((160 * scale, 240 * scale), Image.NEAREST), (i * 160 * scale, 0))
    out.save(directory / "select-pedestal.png")


def style_reference(directory: Path, scale: int) -> None:
    """Our cast beside the captain's reference grid, both at native pixel scale.

    The reference is a ~1.45x upscale of native art (its figures measure ~84 px for
    ~58 px sprites), so it is brought back to native first; ours are native already."""
    ref = Image.open(REFS / "style-reference-grid.png").convert("RGBA")
    native = ref.resize((round(ref.width / 1.45), round(ref.height / 1.45)), Image.LANCZOS)
    bg = native.getpixel((2, 2))
    heroes = hero_frames()
    customer = customer_frames()
    picks: List[Image.Image] = []
    for h in HEROES:
        if h in heroes:
            picks += [heroes[h]["idle"][0], heroes[h]["attack"][0]]
    if customer:
        picks.append(customer["walk"][0])
    panel = Image.new("RGBA", (len(picks) * 40 + 16, native.height), bg)
    for i, img in enumerate(picks):
        panel.alpha_composite(img, (8 + i * 40 - 12, native.height // 2 - 64 + 30))
    out = Image.new("RGBA", (native.width + panel.width, native.height), bg)
    out.alpha_composite(native, (0, 0))
    out.alpha_composite(panel, (native.width, 0))
    out.resize((out.width * scale, out.height * scale), Image.NEAREST).save(directory / "style-reference.png")


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", type=Path, default=Path("/tmp/arcade-looks-hibit-chars/review"))
    parser.add_argument("--scale", type=int, default=3)
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    sheets(args.out, args.scale)
    scenes(args.out, args.scale)
    select_screen(args.out, args.scale)
    style_reference(args.out, args.scale)
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
