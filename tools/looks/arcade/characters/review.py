#!/usr/bin/env python3
"""Review boards for the arcade characters, rendered from the built sheets (what ships, not the recipe).

    python3 tools/looks/arcade/characters/review.py [--out DIR] [--refs DIR]

Writes, at whole-pixel zoom:
  contact-<subject>.png   every animation of a sheet, frames left to right, with origin guides
  gif/<subject>-<anim>.gif each animation at its own fps, for stepping through the motion
  scene-scripe.png        key frames standing on the Berlin level (layers from layers.json)
  scene-luna.png          the same on the San Francisco level
  select.png              the hero on the character-select pedestal, for scale
  style.png               the cast next to the style reference grid
  likeness.png            the head kit next to the captain's photos
  cast.png                key poses of every subject side by side
  action-<level>.png      each hero firing at a customer: pose, muzzle, shot, hit

`--refs` points at the look references (style-reference-grid.png, roel-photo-*.jpg,
current-character-select.png); boards that need a missing reference are skipped.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw, ImageOps

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
ART = REPO / "src" / "game" / "art" / "looks" / "arcade"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "tools" / "art"))

from kit import head as HEAD  # noqa: E402
from kit.compose import Frame, Part  # noqa: E402

SUBJECTS = {
    "hackerman": ART / "characters" / "hackerman",
    "artsy": ART / "characters" / "artsy",
    "strategy": ART / "characters" / "strategy",
    "customer": ART / "customer",
}
INDIGO = (34, 28, 66, 255)
GUIDE = (70, 62, 112, 255)


class Strip:
    """A loaded sheet: frames by animation name."""

    def __init__(self, directory: Path, stem: str = "sheet") -> None:
        with Image.open(directory / f"{stem}.png") as image:
            self.image = image.convert("RGBA")
        self.meta = json.loads((directory / f"{stem}.json").read_text())
        self.fw = self.meta["frame"]["w"]
        self.fh = self.meta["frame"]["h"]
        self.origin = (self.meta["origin"]["x"], self.meta["origin"]["y"])

    def names(self) -> List[str]:
        return [a["name"] for a in self.meta["animations"]]

    def anim(self, name: str) -> Dict:
        return next(a for a in self.meta["animations"] if a["name"] == name)

    def frames(self, name: str) -> List[Image.Image]:
        row = self.names().index(name)
        count = self.anim(name)["frames"]
        return [
            self.image.crop((i * self.fw, row * self.fh, (i + 1) * self.fw, (row + 1) * self.fh)) for i in range(count)
        ]


def zoom(image: Image.Image, scale: int) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


def contact(strip: Strip, scale: int = 4) -> Image.Image:
    rows = strip.names()
    cols = max(strip.anim(n)["frames"] for n in rows)
    pad = 2
    w = cols * (strip.fw + pad) + pad
    h = len(rows) * (strip.fh + pad) + pad
    out = Image.new("RGBA", (w, h), (20, 17, 36, 255))
    draw = ImageDraw.Draw(out)
    for r, name in enumerate(rows):
        anchors = strip.anim(name).get("anchors", {})
        for c, frame in enumerate(strip.frames(name)):
            x, y = pad + c * (strip.fw + pad), pad + r * (strip.fh + pad)
            draw.rectangle([x, y, x + strip.fw - 1, y + strip.fh - 1], fill=INDIGO)
            ox, oy = strip.origin
            draw.line([x, y + oy - 1, x + strip.fw - 1, y + oy - 1], fill=GUIDE)
            out.alpha_composite(frame, (x, y))
            for points in anchors.values():
                ax, ay = points[c]
                out.putpixel((x + ax, y + ay), (255, 60, 60, 255))
    return zoom(out, scale)


def gif(frames: Sequence[Image.Image], fps: int, path: Path, scale: int = 4, bg=(34, 28, 66)) -> None:
    images = []
    for frame in frames:
        canvas = Image.new("RGB", frame.size, bg)
        canvas.paste(frame, (0, 0), frame)
        images.append(zoom(canvas, scale))
    images[0].save(path, save_all=True, append_images=images[1:], duration=round(1000 / fps), loop=0)


def level_backdrop(level: str, camera_x: int) -> Image.Image:
    from preview import Level, draw_layer

    lv = Level(level)
    scene = Image.new("RGBA", (lv.width, lv.height), (0, 0, 0, 255))
    for layer in lv.manifest["layers"]:
        if not layer["foreground"]:
            draw_layer(scene, lv.images[layer["id"]], layer, camera_x)
    for x in range(0, lv.width, 16):
        scene.alpha_composite(lv.tile("ground_top"), (x, lv.ground_y))
        scene.alpha_composite(lv.tile("ground_fill"), (x, lv.ground_y + 16))
        scene.alpha_composite(lv.tile("ground_base"), (x, lv.ground_y + 32))
    return scene


def place(scene: Image.Image, frame: Image.Image, x: int, feet: int, origin=(32, 64), flip: bool = False) -> None:
    if flip:
        frame = ImageOps.mirror(frame)
        x = x + (frame.width - 2 * origin[0])
    scene.alpha_composite(frame, (x - origin[0], feet - origin[1]))


def scene_board(strips: Dict[str, Strip], level: str, camera_x: int) -> Image.Image:
    scene = level_backdrop(level, camera_x)
    ground = 200
    cast = (
        ("hackerman", "idle", 0, 34),
        ("artsy", "attack", 0, 86),
        ("strategy", "skill", 2, 138),
        ("hackerman", "run", 3, 190),
        ("customer", "shout", 1, 242),
        ("customer", "walk", 1, 292),
    )
    for subject, anim, index, x in cast:
        frames = strips[subject].frames(anim)
        place(scene, frames[index % len(frames)], x, ground, flip=subject == "customer")
    return zoom(scene, 3)


def cast_board(strips: Dict[str, Strip]) -> Image.Image:
    """Key poses of every subject side by side, on the select screen's indigo, at 3x."""
    rows = {
        "hackerman": (("idle", 0), ("run", 3), ("jump", 2), ("fall", 1), ("attack", 0), ("skill", 3), ("hurt", 0), ("victory", 2)),
        "artsy": (("idle", 0), ("run", 0), ("jump", 2), ("fall", 1), ("attack", 0), ("skill", 4), ("hurt", 0), ("victory", 1)),
        "strategy": (("idle", 0), ("run", 7), ("jump", 2), ("fall", 1), ("attack", 0), ("skill", 3), ("hurt", 0), ("victory", 3)),
        "customer": (("walk", 0), ("walk", 1), ("shout", 1), ("hurt", 0), ("stunned", 0), ("stunned", 3), ("happy", 2), ("happy", 5)),
    }
    out = Image.new("RGBA", (8 * 64, 4 * 64), INDIGO)
    for r, (subject, picks) in enumerate(rows.items()):
        for c, (anim, index) in enumerate(picks):
            out.alpha_composite(strips[subject].frames(anim)[index], (c * 64, r * 64))
    return zoom(out, 3)


def action_board(strips: Dict[str, Strip], level: str, camera_x: int) -> Image.Image:
    """Each hero firing at a customer: attack pose, muzzle flash, the shot in flight, and the hit."""
    scene = level_backdrop(level, camera_x)
    ground = 200
    lanes = (("hackerman", 18, 6), ("artsy", 120, -6), ("strategy", 222, 0))
    for hero, x, arc in lanes:
        attack = Strip(SUBJECTS[hero], "attack")
        pose = strips[hero].frames("attack")[0]
        mx, my = strips[hero].anim("attack")["anchors"]["muzzle"][0]
        place(scene, pose, x, ground)
        fx, fy = x - 32 + mx, ground - 64 + my
        muzzle = attack.frames("muzzle")[0]
        scene.alpha_composite(muzzle, (fx - 16, fy - 16))
        shot = attack.frames("projectile")[1]
        scene.alpha_composite(shot, (fx + 22 - 16, fy - 16 + arc))
        place(scene, strips["customer"].frames("hurt")[0], x + 72, ground, flip=True)
        hit = attack.frames("impact")[1]
        scene.alpha_composite(hit, (x + 64 - 16, ground - 38 - 16))
    return zoom(scene, 3)


def select_board(strips: Dict[str, Strip], refs: Path) -> Optional[Image.Image]:
    """Each hero idling on the character-select pedestal (the card cropped from today's screen), at 3x."""
    path = refs / "current-character-select.png"
    if not path.exists():
        return None
    with Image.open(path) as image:
        screen = image.convert("RGBA").resize((320, 240), Image.NEAREST)
    # Paint the old sprite out from its row neighbours before standing the new one on the pedestal.
    px = screen.load()
    box = (72, 134, 93, 170)
    for y in range(box[1], box[3]):
        left, right = px[box[0] - 1, y], px[box[2], y]
        for x in range(box[0], box[2]):
            px[x, y] = left if x < (box[0] + box[2]) // 2 else right
    card = (24, 20, 141, 206)
    boards = []
    for subject in ("hackerman", "artsy", "strategy"):
        shot = screen.copy()
        place(shot, strips[subject].frames("idle")[0], 82, 169)
        boards.append(zoom(shot.crop(card), 3))
    gap = 12
    out = Image.new("RGBA", (sum(b.width for b in boards) + gap * 2, boards[0].height), (12, 10, 24, 255))
    x = 0
    for b in boards:
        out.alpha_composite(b, (x, 0))
        x += b.width + gap
    return out


def style_board(strips: Dict[str, Strip], refs: Path) -> Optional[Image.Image]:
    path = refs / "style-reference-grid.png"
    if not path.exists():
        return None
    with Image.open(path) as image:
        ref = image.convert("RGBA")
    bg = ref.getpixel((0, 0))
    lineup = Image.new("RGBA", (300, 110), bg)
    picks = (
        ("hackerman", "idle", 0),
        ("artsy", "idle", 0),
        ("strategy", "idle", 0),
        ("customer", "walk", 1),
        ("hackerman", "victory", 1),
        ("artsy", "victory", 1),
    )
    for i, (subject, anim, index) in enumerate(picks):
        place(lineup, strips[subject].frames(anim)[index], 26 + i * 48, 106, flip=subject == "customer")
    out = Image.new("RGBA", (ref.width + lineup.width, 110), bg)
    out.alpha_composite(ref.crop((0, 0, ref.width, 110)), (0, 0))
    out.alpha_composite(lineup, (ref.width, 0))
    return zoom(out, 3)


def likeness_board(refs: Path) -> Optional[Image.Image]:
    photos = sorted(refs.glob("roel-photo-*.jpg"))
    if not photos:
        return None
    heads = []
    for cap in (False, True):
        for expression in ("smile", "neutral", "focus", "hurt"):
            g = HEAD.head(expression, cap)
            frame = Frame(w=22, h=22)
            frame.add(Part(g, (9, 20), HEAD.PALETTE, HEAD.LINE, HEAD.DEMOTE))
            heads.append(frame.render())
    tiles = []
    for h in heads:
        tile = Image.new("RGBA", h.size, (199, 198, 214, 255))
        tile.alpha_composite(h)
        tiles.append(zoom(tile, 9))
    row_h = tiles[0].height
    photo_tiles = []
    for p in photos:
        with Image.open(p) as image:
            im = image.convert("RGBA")
        if "white-shirt" in p.name:
            im = ImageOps.mirror(im).crop((im.width - 580, 170, im.width - 180, 690))
        elif "cap" in p.name:
            im = im.crop((700, 940, 1020, 1300))
        else:
            im = im.crop((40, 40, 240, 320))
        im = im.resize((round(im.width * row_h * 2 / im.height), row_h * 2))
        photo_tiles.append(im)
    width = max(sum(t.width for t in tiles[:4]), sum(t.width for t in photo_tiles))
    out = Image.new("RGBA", (width + 16, row_h * 4 + 24), (16, 14, 28, 255))
    x = 0
    for t in photo_tiles:
        out.alpha_composite(t, (x, 0))
        x += t.width + 8
    for r in range(2):
        x = 0
        for t in tiles[r * 4 : r * 4 + 4]:
            out.alpha_composite(t, (x, row_h * 2 + 12 + r * (row_h + 4)))
            x += t.width + 4
    return out


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=Path("/tmp/arcade-looks-arcade-chars/review"))
    parser.add_argument("--refs", type=Path, default=REPO.parent / ".looks-refs")
    args = parser.parse_args(argv)
    out: Path = args.out
    (out / "gif").mkdir(parents=True, exist_ok=True)
    strips = {name: Strip(path) for name, path in SUBJECTS.items()}
    for name, strip in strips.items():
        contact(strip).save(out / f"contact-{name}.png")
        for anim in strip.names():
            gif(strip.frames(anim), strip.anim(anim)["fps"], out / "gif" / f"{name}-{anim}.gif")
    for hero in ("hackerman", "artsy", "strategy"):
        contact(Strip(SUBJECTS[hero], "attack"), 4).save(out / f"contact-{hero}-attack.png")
    scene_board(strips, "scripe", 320).save(out / "scene-scripe.png")
    scene_board(strips, "luna", 900).save(out / "scene-luna.png")
    cast_board(strips).save(out / "cast.png")
    action_board(strips, "scripe", 1200).save(out / "action-scripe.png")
    action_board(strips, "luna", 300).save(out / "action-luna.png")
    for name, board in (
        ("select", select_board(strips, args.refs)),
        ("style", style_board(strips, args.refs)),
        ("likeness", likeness_board(args.refs)),
    ):
        if board is not None:
            board.save(out / f"{name}.png")
    print(f"review boards in {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
