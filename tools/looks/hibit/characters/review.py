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


def action(directory: Path, scale: int) -> None:
    """Each hero firing at a customer: attack frame 0 with the muzzle flash on its anchor,
    the projectile along its path (Artsy's paint lobbed on the game's arc), the impact on
    a recoiling customer. One strip per hero, on the Berlin night."""
    customer = customer_frames()
    rows = []
    for h in HEROES:
        png = ART / "characters" / h / "sheet.png"
        atk = ART / "characters" / h / "attack.png"
        if not (png.exists() and atk.exists() and customer):
            continue
        frames, meta = load_sheet(png)
        fx, _ = load_sheet(atk)
        anchors = next(a for a in meta["animations"] if a["name"] == "attack")["anchors"]["muzzle"]
        hero_x, feet = 70, 200
        placements = [(frames["attack"][0], hero_x, feet)]
        mx, my = anchors[0]
        muzzle = (hero_x - 32 + mx, feet - 64 + my)
        target_x = 250
        level = level_scene("scripe", 300, [])
        scene = level.copy()
        hero_img = frames["attack"][0]
        scene.alpha_composite(hero_img, (hero_x - 32, feet - 64))
        cust = customer["hurt"][0].transpose(Image.FLIP_LEFT_RIGHT)
        scene.alpha_composite(cust, (target_x - 32, feet - 64))
        m = fx["muzzle"][0]
        scene.alpha_composite(m, (muzzle[0] - 16, muzzle[1] - 16))
        # The flight: the game's speed and gravity, sampled every few frames.
        if h == "artsy":
            vx, vy, g = 175.0, -150.0, 720.0
        elif h == "hackerman":
            vx, vy, g = 270.0, 0.0, 0.0
        else:
            vx, vy, g = 215.0, 0.0, 0.0
        x, y = float(muzzle[0]), float(muzzle[1])
        t = 0.0
        k = 0
        while x < target_x - 22:
            t += 1 / 60
            x = muzzle[0] + vx * t
            y = muzzle[1] + vy * t + 0.5 * g * t * t
            if int(t * 60) % 9 == 4:
                p = fx["projectile"][k % len(fx["projectile"])]
                scene.alpha_composite(p, (int(x) - 16, int(y) - 16))
                k += 1
        impact = fx["impact"][1]
        scene.alpha_composite(impact, (target_x - 8 - 16, int(feet - 36) - 16))
        rows.append(scene.crop((20, 120, 300, 210)))
    if not rows:
        return
    out = Image.new("RGBA", (rows[0].width * scale, sum(r.height * scale + 4 for r in rows)), (0, 0, 0, 255))
    y = 0
    for r in rows:
        out.alpha_composite(r.resize((r.width * scale, r.height * scale), Image.NEAREST), (0, y))
        y += r.height * scale + 4
    out.save(directory / "action.png")


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


def _label(img: Image.Image, text: str) -> Image.Image:
    out = Image.new("RGBA", (img.width, img.height + 14), (18, 16, 24, 255))
    out.alpha_composite(img, (0, 14))
    ImageDraw.Draw(out).text((3, 1), text, fill=(225, 225, 235, 255))
    return out


def keyframes(directory: Path, scale: int) -> None:
    """The cast's key poses at a glance: one row per hero, then the customer's states."""
    picks = [("idle", 0), ("run", 1), ("run", 4), ("jump", 3), ("fall", 0), ("attack", 0), ("skill", 3),
             ("hurt", 1), ("victory", 2)]
    rows: List[Image.Image] = []
    heroes = hero_frames()
    for h in HEROES:
        if h not in heroes:
            continue
        cells = []
        for anim, f in picks:
            frames = heroes[h][anim]
            tile = Image.new("RGBA", (64, 64), DARK)
            tile.alpha_composite(frames[min(f, len(frames) - 1)])
            cells.append(_label(tile.resize((64 * scale, 64 * scale), Image.NEAREST), f"{h} {anim}"))
        rows.append(cells)
    customer = customer_frames()
    if customer:
        cells = []
        for anim, f in (("walk", 0), ("walk", 3), ("shout", 1), ("shout", 2), ("hurt", 1), ("stunned", 2),
                        ("happy", 1), ("happy", 2)):
            tile = Image.new("RGBA", (64, 64), DARK)
            tile.alpha_composite(customer[anim][f])
            cells.append(_label(tile.resize((64 * scale, 64 * scale), Image.NEAREST), f"customer {anim}"))
        rows.append(cells)
    cw, ch = rows[0][0].size
    out = Image.new("RGBA", (max(len(r) for r in rows) * (cw + 4), len(rows) * (ch + 4)), (10, 10, 14, 255))
    for r, cells in enumerate(rows):
        for c, cell in enumerate(cells):
            out.alpha_composite(cell, (c * (cw + 4), r * (ch + 4)))
    out.save(directory / "keyframes.png")


def likeness(directory: Path) -> None:
    """The likeness kit next to the photos it was drawn from, and the heroes at game scale."""
    from PIL import ImageOps

    from hibit import head

    def fit(img: Image.Image, h: int = 300) -> Image.Image:
        return img.resize((round(img.width * h / img.height), h), Image.LANCZOS)

    def big(sprite, z: int = 20) -> Image.Image:
        bg = Image.new("RGBA", (sprite.width, sprite.height), MID)
        bg.alpha_composite(sprite.to_image())
        return bg.resize((sprite.width * z, sprite.height * z), Image.NEAREST)

    blazer = ImageOps.mirror(Image.open(REFS / "roel-photo-white-shirt-blazer.jpg").convert("RGBA").crop((190, 180, 600, 720)))
    smile = Image.open(REFS / "roel-photo-smile-closeup.jpg").convert("RGBA").crop((30, 30, 240, 330))
    cap = Image.open(REFS / "roel-photo-cap-sweater.jpg").convert("RGBA").crop((720, 940, 960, 1260))
    heroes = hero_frames()
    game = []
    for h in HEROES:
        if h in heroes:
            tile = Image.new("RGBA", (64, 64), MID)
            tile.alpha_composite(heroes[h]["idle"][0])
            game.append(tile.crop((14, 0, 50, 30)).resize((36 * 6, 30 * 6), Image.NEAREST))
    expressions = [big(head.head(e), 8) for e in ("smile", "neutral", "focus", "hurt", "cheer")]
    top = [fit(blazer), big(head.head("smile")), fit(smile), fit(cap), big(head.head("smile", cap=True))]
    width = max(sum(t.width + 12 for t in top), sum(t.width + 12 for t in game), sum(t.width + 12 for t in expressions))
    height = 300 + 12 + max(t.height for t in game) + 12 + max(t.height for t in expressions)
    out = Image.new("RGBA", (width, height), (36, 34, 44, 255))
    x = 0
    for t in top:
        out.alpha_composite(t, (x, 0))
        x += t.width + 12
    x = 0
    for t in game:
        out.alpha_composite(t, (x, 312))
        x += t.width + 12
    x = 0
    y = 312 + max(t.height for t in game) + 12
    for t in expressions:
        out.alpha_composite(t, (x, y))
        x += t.width + 12
    out.save(directory / "likeness.png")


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", type=Path, default=Path("/tmp/arcade-looks-hibit-chars/review"))
    parser.add_argument("--scale", type=int, default=3)
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    sheets(args.out, args.scale)
    scenes(args.out, args.scale)
    action(args.out, args.scale)
    keyframes(args.out, args.scale)
    likeness(args.out)
    select_screen(args.out, args.scale)
    style_reference(args.out, args.scale)
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
