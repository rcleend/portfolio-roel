#!/usr/bin/env python3
"""Review sheets for the portrait look's characters, read from the built files.

  python3 tools/looks/portrait/characters/review.py            # everything
  python3 tools/looks/portrait/characters/review.py contact scene
  python3 tools/looks/portrait/characters/review.py --out /tmp/review

Kinds:
  contact   every animation of every sheet at 4x, frames numbered, anchors marked
  effects   every attack.png strip at 5x on a night sky
  scene     heroes and customers standing in both levels, at 3x
  combat    each hero firing: muzzle flash, shots in flight and an impact on a customer
  select    each hero on the character-select pedestal, at 3x
  grid      the cast next to the captain's style reference at the same pixel scale
  likeness  the head kit at 8x next to the photos, and the heroes at play size
  moveset   key poses of every hero and every customer state on one sheet
  gifs      one animated GIF per animation (4x) for stepping through motion

Everything is read back from src/game/art/looks/portrait/, so this also
proves the PNG + JSON pair loads the way the game will load it.
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
sys.path.insert(0, str(REPO / "tools" / "art"))

from preview import Level, render as render_level  # noqa: E402

LOOK = REPO / "src" / "game" / "art" / "looks" / "portrait"
REFS = Path("/Users/roel/conductor/workspaces/firstmate/gwangju/.context/looks/refs")
HEROES = ("hackerman", "artsy", "strategy")
NIGHT = (26, 16, 58)
DUSK = (92, 84, 120)


class Sheet:
    """A loaded PNG + JSON look sheet."""

    def __init__(self, png: Path) -> None:
        self.meta = json.loads(png.with_suffix(".json").read_text())
        self.image = Image.open(png).convert("RGBA")
        self.w = self.meta["frame"]["w"]
        self.h = self.meta["frame"]["h"]
        self.origin = (self.meta["origin"]["x"], self.meta["origin"]["y"])
        self.anims = {a["name"]: (row, a) for row, a in enumerate(self.meta["animations"])}

    def frame(self, name: str, index: int) -> Image.Image:
        row, a = self.anims[name]
        index = min(index, a["frames"] - 1)
        return self.image.crop((index * self.w, row * self.h, index * self.w + self.w, row * self.h + self.h))

    def frames(self, name: str) -> List[Image.Image]:
        return [self.frame(name, i) for i in range(self.anims[name][1]["frames"])]


def hero(hero_id: str) -> Sheet:
    return Sheet(LOOK / "characters" / hero_id / "sheet.png")


def attack(hero_id: str) -> Sheet:
    return Sheet(LOOK / "characters" / hero_id / "attack.png")


def customer() -> Sheet:
    return Sheet(LOOK / "customer" / "sheet.png")


def zoom(image: Image.Image, scale: int) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


def on(bg, image: Image.Image) -> Image.Image:
    out = Image.new("RGB", image.size, bg)
    out.paste(image, (0, 0), image)
    return out


def stack(images: Sequence[Image.Image], vertical: bool = True, gap: int = 6, bg=(30, 30, 36)) -> Image.Image:
    if vertical:
        w, h = max(i.width for i in images), sum(i.height for i in images) + gap * (len(images) - 1)
    else:
        w, h = sum(i.width for i in images) + gap * (len(images) - 1), max(i.height for i in images)
    out = Image.new("RGB", (w, h), bg)
    pos = 0
    for i in images:
        out.paste(i.convert("RGB"), (0, pos) if vertical else (pos, 0))
        pos += (i.height if vertical else i.width) + gap
    return out


# ── kinds ──────────────────────────────────────────────────────────────────

def contact(sheet: Sheet, title: str, scale: int = 4) -> Image.Image:
    rows = []
    for name, (row, a) in sheet.anims.items():
        label_h = 14
        strip = Image.new("RGB", (a["frames"] * (sheet.w * scale + 4) + 4, sheet.h * scale + label_h + 4), DUSK)
        draw = ImageDraw.Draw(strip)
        loop = "loop" if a["loop"] else "once"
        draw.text((4, 1), f"{title} · {name} · {a['fps']} fps · {loop} · {a['frames']} f", fill=(255, 255, 255))
        for i, f in enumerate(sheet.frames(name)):
            cell = on((80, 72, 108), zoom(f, scale))
            d = ImageDraw.Draw(cell)
            d.line([(0, sheet.origin[1] * scale - 1), (cell.width, sheet.origin[1] * scale - 1)], fill=(255, 196, 80))
            for key, pts in a.get("anchors", {}).items():
                x, y = pts[i]
                c = (255, 64, 64) if key in ("muzzle", "mouth") else (64, 255, 160)
                d.rectangle([x * scale, y * scale, x * scale + scale - 1, y * scale + scale - 1], outline=c)
            d.text((3, 2), str(i), fill=(255, 255, 0))
            strip.paste(cell, (4 + i * (sheet.w * scale + 4), label_h + 2))
        rows.append(strip)
    return stack(rows, gap=2)


def effects_sheet(scale: int = 5) -> Image.Image:
    rows = []
    for hero_id in HEROES:
        sheet = attack(hero_id)
        for name, (row, a) in sheet.anims.items():
            cells = []
            for f in sheet.frames(name):
                cell = on(NIGHT, zoom(f, scale))
                d = ImageDraw.Draw(cell)
                ox, oy = sheet.origin[0] * scale, sheet.origin[1] * scale
                d.point([(ox, oy)], fill=(255, 0, 0))
                cells.append(cell)
            label = Image.new("RGB", (150, cells[0].height), (30, 30, 36))
            ImageDraw.Draw(label).text((4, 4), f"{hero_id}\n{name}\n{a['fps']} fps", fill=(255, 255, 255))
            rows.append(stack([label] + cells, vertical=False, gap=4))
    return stack(rows, gap=4)


def place(canvas: Image.Image, frame: Image.Image, x: int, feet: int, origin=(32, 64), flip: bool = False) -> None:
    sprite = frame.transpose(Image.FLIP_LEFT_RIGHT) if flip else frame
    left = x - origin[0] if not flip else x - (frame.width - origin[0])
    canvas.alpha_composite(sprite, (left, feet - origin[1]))


def scene(level_id: str, camera_x: int, scale: int = 3) -> Image.Image:
    level = Level(level_id)
    frame = render_level(level, camera_x).convert("RGBA")
    ground = level.ground_y
    sheets = {h: hero(h) for h in HEROES}
    cust = customer()
    place(frame, sheets["hackerman"].frame("idle", 0), 44, ground)
    place(frame, sheets["artsy"].frame("run", 2), 104, ground)
    place(frame, sheets["strategy"].frame("attack", 0), 162, ground)
    place(frame, cust.frame("shout", 0), 226, ground, flip=True)
    place(frame, cust.frame("walk", 1), 286, ground, flip=True)
    return zoom(frame.convert("RGB"), scale)


def combat(level_id: str, camera_x: int, scale: int = 3) -> Image.Image:
    """Each hero firing: muzzle flash on the anchor, shots in flight, an impact on a customer."""
    level = Level(level_id)
    frame = render_level(level, camera_x).convert("RGBA")
    ground = level.ground_y
    lanes = [(28, "hackerman", "impact"), (128, "artsy", "impact"), (228, "strategy", "impact")]
    cust = customer()
    for x, hero_id, _ in lanes:
        sheet = hero(hero_id)
        fx = attack(hero_id)
        row, a = sheet.anims["attack"]
        mx, my = a["anchors"]["muzzle"][0]
        place(frame, sheet.frame("attack", 0), x, ground)
        left, top = x - sheet.origin[0], ground - sheet.origin[1]
        muzzle = (left + mx, top + my)
        frame.alpha_composite(fx.frame("muzzle", 1), (muzzle[0] - fx.origin[0], muzzle[1] - fx.origin[1]))
        for k, dist in enumerate((22, 40)):
            proj = fx.frame("projectile", k)
            drop = 0 if hero_id != "artsy" else (-6 if k == 0 else -4)
            frame.alpha_composite(proj, (muzzle[0] + dist - fx.origin[0], muzzle[1] + drop - fx.origin[1]))
        place(frame, cust.frame("hurt", 0), x + 78, ground, flip=True)
        frame.alpha_composite(fx.frame("impact", 1), (x + 70 - fx.origin[0], muzzle[1] + 2 - fx.origin[1]))
    return zoom(frame.convert("RGB"), scale)


def select_screen(hero_id: str, scale: int = 3) -> Image.Image:
    shot = Image.open(REFS / "current-character-select.png").convert("RGBA")
    native = shot.resize((shot.width // 3, shot.height // 3), Image.NEAREST)
    # Erase the old 32 x 40 sprite by copying the light beam from 34 rows up
    # (an even offset keeps its dither phase), then stand ours on the pedestal.
    px = native.load()
    for y in range(134, 163):
        for x in range(72, 94):
            px[x, y] = px[x, y - 34]
    place(native, hero(hero_id).frame("idle", 0), 84, 168)
    return zoom(native.convert("RGB"), scale)


def grid(scale: int = 3) -> Image.Image:
    ref = Image.open(REFS / "style-reference-grid.png").convert("RGB")
    native = ref.resize((ref.width // 2, ref.height // 2), Image.BOX)
    bg = native.getpixel((2, 2))
    ours = Image.new("RGBA", (64 * 4 + 24, 66), bg + (255,))
    for i, h in enumerate(HEROES):
        place(ours, hero(h).frame("idle", 0), 32 + i * 68, 64)
    place(ours, customer().frame("walk", 1), 32 + 3 * 68, 64)
    return stack([zoom(native, scale), zoom(ours.convert("RGB"), scale)], vertical=False, gap=12, bg=bg)


def likeness(scale: int = 8) -> Image.Image:
    """The captain's photos next to the head kit and the heroes at play size."""
    sys.path.insert(0, str(HERE))
    from portraitkit import heads, palette

    def head_image(pm, pal) -> Image.Image:
        im = Image.new("RGBA", (pm.w, pm.h), (0, 0, 0, 0))
        px = im.load()
        for x, y, m, t in pm:
            px[x, y] = pal[m].rgb(t) + (255,)
        return im

    height = 14 * scale
    photos = []
    for name, box in (("roel-photo-white-shirt-blazer.jpg", (205, 185, 565, 670)),
                      ("roel-photo-smile-closeup.jpg", (35, 40, 238, 305)),
                      ("roel-photo-cap-sweater.jpg", (740, 955, 950, 1255))):
        p = Image.open(REFS / name).convert("RGB").crop(box).transpose(Image.FLIP_LEFT_RIGHT)
        photos.append(p.resize((round(p.width * height / p.height), height)))
    bare = heads.build(cap=False)
    capped = heads.build(cap=True)
    big = [on((120, 116, 132), zoom(head_image(bare["smile"], palette.HACKERMAN), scale)),
           on((120, 116, 132), zoom(head_image(capped["smile"], palette.ARTSY), scale))]
    top = stack(photos[:2] + big[:1] + [photos[2]] + big[1:], vertical=False, gap=10)
    faces = [on((120, 116, 132), zoom(head_image(bare[n], palette.HACKERMAN), 5))
             for n in ("smile", "neutral", "focus", "grin", "hurt")]
    row2 = stack(faces, vertical=False, gap=8)
    sprites = Image.new("RGB", (3 * 64 * 3 + 20, 64 * 3), NIGHT)
    for i, h in enumerate(HEROES):
        f = zoom(hero(h).frame("idle", 0), 3)
        sprites.paste(f, (i * (64 * 3 + 10), 0), f)
    return stack([top, stack([row2, sprites], vertical=False, gap=16)], gap=10)


def moveset(scale: int = 3) -> Image.Image:
    """Key poses of every hero and every customer state, one row each."""
    picks = [("idle", 0), ("run", 3), ("jump", 1), ("attack", 0), ("skill", 3), ("hurt", 1), ("victory", 2)]
    rows = []
    for h in HEROES:
        sheet = hero(h)
        cells = [on(DUSK, zoom(sheet.frame(n, i), scale)) for n, i in picks]
        rows.append(stack(cells, vertical=False, gap=2, bg=DUSK))
    cust = customer()
    cells = [on(DUSK, zoom(cust.frame(n, i), scale)) for n, i in
             (("walk", 0), ("walk", 1), ("shout", 0), ("hurt", 0), ("stunned", 2), ("happy", 2), ("happy", 6))]
    rows.append(stack(cells, vertical=False, gap=2, bg=DUSK))
    return stack(rows, gap=2, bg=DUSK)


def gifs(out: Path, scale: int = 4) -> None:
    out.mkdir(parents=True, exist_ok=True)
    sets = [(h, hero(h)) for h in HEROES] + [("customer", customer())]
    for title, sheet in sets:
        for name, (row, a) in sheet.anims.items():
            frames = [on((80, 72, 108), zoom(f, scale)) for f in sheet.frames(name)]
            duration = int(round(1000 / a["fps"]))
            frames[0].save(out / f"{title}-{name}.gif", save_all=True, append_images=frames[1:], duration=duration,
                           loop=0, disposal=2)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("kinds", nargs="*",
                        default=["contact", "effects", "scene", "combat", "select", "grid", "likeness", "moveset"])
    parser.add_argument("--out", type=Path, default=Path("/tmp/arcade-looks-portrait-chars/review"))
    args = parser.parse_args(argv)
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    written = []

    def save(image: Image.Image, name: str) -> None:
        path = out / name
        image.save(path)
        written.append(path)

    for kind in args.kinds:
        if kind == "contact":
            for h in HEROES:
                save(contact(hero(h), h), f"contact-{h}.png")
            save(contact(customer(), "customer"), "contact-customer.png")
        elif kind == "effects":
            save(effects_sheet(), "effects.png")
        elif kind == "scene":
            save(scene("scripe", 300), "scene-scripe.png")
            save(scene("luna", 300), "scene-luna.png")
        elif kind == "combat":
            save(combat("scripe", 300), "combat-scripe.png")
            save(combat("luna", 1500), "combat-luna.png")
        elif kind == "select":
            save(stack([select_screen(h) for h in HEROES], vertical=False, gap=8), "select.png")
        elif kind == "grid":
            save(grid(), "grid.png")
        elif kind == "likeness":
            save(likeness(), "likeness.png")
        elif kind == "moveset":
            save(moveset(), "moveset.png")
        elif kind == "gifs":
            gifs(out / "gifs")
        else:
            parser.error(f"unknown kind {kind!r}")
    for path in written:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
