"""Review renders: contact sheets, the game's bevelled slots, level backdrops.

Nothing here ships. These helpers draw the way the game draws (the slot is
``drawWindow`` with the steel and indigo themes, backdrops come from the
level-art preview), so what we judge at 4x is what the captain will see.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Sequence, Tuple

from PIL import Image, ImageDraw

from .pix import Canvas, dither_on, mix, parse_hex
from .sheet import Sheet

REPO = Path(__file__).resolve().parents[5]
# Review inputs that live outside the repo; override with environment variables.
REFS = Path(os.environ.get("HIBIT_REFS", "/Users/roel/conductor/workspaces/firstmate/gwangju/.context/looks/refs"))
STANDINS = Path(os.environ.get("HIBIT_STANDINS", "/tmp/arcade-looks-hibit-skills/standins"))

THEMES = {
    "steel": {"o": "#0b0a14", "L": "#eef0f6", "m": "#8a90a8", "d": "#3a3f57", "fill": ("#343852", "#181a28", 4)},
    "indigo": {"o": "#0b0a1f", "L": "#e4dcff", "m": "#a99cf0", "d": "#3d2f8f", "fill": ("#2a2468", "#14123a", 4)},
    "cream": {"o": "#2a2010", "L": "#fffdf0", "m": "#e6d7a0", "d": "#a8955e", "fill": ("#fffae6", "#f1e6bd", 3)},
}

FRAME_PATTERN = [
    ".oooooooooo.",
    "oLLLLLLLLLLo",
    "oLmmmmmmmmdo",
    "oLmddddddmdo",
    "oLmd....Lmdo",
    "oLmd....Lmdo",
    "oLmd....Lmdo",
    "oLmd....Lmdo",
    "oLmLLLLLLmdo",
    "oLmmmmmmmmdo",
    "oddddddddddo",
    ".oooooooooo.",
]


def banded(canvas: Canvas, x: int, y: int, w: int, h: int, top: str, bottom: str, bands: int) -> None:
    """The engine's vertical banded gradient with a bayer2 seam (``Gfx.fillRect`` with ``bands``)."""
    colors = [mix(top, bottom, i / (bands - 1)) for i in range(bands)]
    edge = lambda i: round(i * h / bands)  # noqa: E731
    for i, color in enumerate(colors):
        canvas.rect(x, y + edge(i), w, edge(i + 1) - edge(i), color)
    for i in range(bands - 1):
        row = y + edge(i + 1) - 1
        for px in range(w):
            if dither_on(px, row - y, 0.5, 2):
                canvas.set(x + px, row, colors[i + 1])


def window(canvas: Canvas, x: int, y: int, w: int, h: int, theme: str = "steel") -> None:
    """``drawWindow``: banded fill plus the tiled 12 x 12 bevel (corners 4 px)."""
    t = THEMES[theme]
    top, bottom, bands = t["fill"]
    banded(canvas, x + 2, y + 2, w - 4, h - 4, top, bottom, bands)
    size, inset = 12, 4
    for dy in range(h):
        sy = dy if dy < inset else (size - (h - dy) if dy >= h - inset else inset + (dy - inset) % (size - 2 * inset))
        for dx in range(w):
            sx = dx if dx < inset else (size - (w - dx) if dx >= w - inset else inset + (dx - inset) % (size - 2 * inset))
            key = FRAME_PATTERN[sy][sx]
            if key in t:
                canvas.set(x + dx, y + dy, t[key])


def slot(icon: Canvas, theme: str = "steel", pad: int = 4) -> Canvas:
    """An icon in a bevelled slot, as the select screen and HUD frame it."""
    size = icon.w + pad * 2
    out = Canvas(size, size)
    window(out, 0, 0, size, size, theme)
    out.blit(icon, pad, pad)
    return out


def upscale(image: Image.Image, factor: int) -> Image.Image:
    return image.resize((image.width * factor, image.height * factor), Image.Resampling.NEAREST)


def on_color(canvas: Canvas, color: str) -> Image.Image:
    base = Image.new("RGBA", (canvas.w, canvas.h), parse_hex(color) + (255,))
    base.alpha_composite(canvas.to_image())
    return base


def contact_sheet(
    sheet: Sheet,
    scale: int = 4,
    backgrounds: Sequence[str] = ("#16142a", "#8a7a9a"),
    label_h: int = 14,
    max_width: int = 1500,
    marker: bool = True,
) -> Image.Image:
    """Every animation of a sheet on dark and mid backgrounds, frames wrapped into a grid and numbered."""
    fw, fh = sheet.frame
    cell_w, cell_h = fw * scale, fh * scale
    per_row = max(1, min(max(len(a.frames) for a in sheet.anims), (max_width - 8) // (cell_w + 4)))
    blocks = []
    for anim in sheet.anims:
        for bg in backgrounds:
            lines = math.ceil(len(anim.frames) / per_row)
            blocks.append((anim, bg, lines))
    height = 8 + sum(label_h + lines * (cell_h + 4) + 6 for _, _, lines in blocks)
    out = Image.new("RGB", (8 + per_row * (cell_w + 4), height), (20, 20, 24))
    draw = ImageDraw.Draw(out)
    y = 8
    for anim, bg, lines in blocks:
        draw.text((8, y), f"{sheet.name} / {anim.name}  fps {anim.fps}  {'loop' if anim.loop else 'once'}  bg {bg}", fill=(220, 220, 220))
        y += label_h
        for i, frame in enumerate(anim.frames):
            x = 8 + (i % per_row) * (cell_w + 4)
            yy = y + (i // per_row) * (cell_h + 4)
            out.paste(upscale(on_color(frame, bg), scale).convert("RGB"), (x, yy))
            draw.text((x + 2, yy + 1), str(i), fill=(255, 255, 255))
            if marker:
                ox, oy = sheet.origin
                draw.rectangle((x + ox * scale - 1, yy + oy * scale - 1, x + ox * scale + 1, yy + oy * scale + 1), outline=(255, 0, 80))
        y += lines * (cell_h + 4) + 6
    return out


def level_backdrop(level: str, camera_x: int = 0) -> Image.Image:
    """A level frame as the game composes it (parallax layers + demo play plane)."""
    sys.path.insert(0, str(REPO / "tools" / "art"))
    import preview  # type: ignore  # noqa: E402

    return preview.render(preview.Level(level), camera_x)


def paste(base: Image.Image, canvas: Canvas, x: int, y: int, flip: bool = False) -> None:
    """Composites a canvas at (x, y) top-left, clipped to the base."""
    image = canvas.to_image()
    if flip:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    sx, sy = max(0, -x), max(0, -y)
    if sx >= image.width or sy >= image.height:
        return
    base.alpha_composite(image.crop((sx, sy, image.width, image.height)), (max(0, x), max(0, y)))


def labelled(images: Sequence[Tuple[str, Image.Image]], columns: int, gap: int = 8, label_h: int = 14, bg=(20, 20, 24)) -> Image.Image:
    w = max(i.width for _, i in images)
    h = max(i.height for _, i in images)
    rows = math.ceil(len(images) / columns)
    out = Image.new("RGB", (gap + columns * (w + gap), gap + rows * (h + label_h + gap)), bg)
    draw = ImageDraw.Draw(out)
    for n, (label, image) in enumerate(images):
        x = gap + (n % columns) * (w + gap)
        y = gap + (n // columns) * (h + label_h + gap)
        draw.text((x, y), label, fill=(225, 225, 225))
        out.paste(image.convert("RGB"), (x, y + label_h))
    return out


def ref_image(name: str) -> Image.Image:
    with Image.open(REFS / name) as image:
        return image.convert("RGBA")


# ── stand-ins for mock-ups (never shipped) ──────────────────────────────
#
# The hibit heroes and customer are being drawn in parallel by another crew.
# Mock-ups need bodies at the new ~58 px scale, so they borrow that crew's
# 58 px concept heroes and today's customer at 2x (about 60 px tall) from
# HIBIT_STANDINS when present (current-sheets.json is dumped from
# src/game/art), and fall back to plain silhouettes otherwise. Review images
# label them as stand-ins.

HERO_FILES = {"hackerman": "concept_0_58.png", "artsy": "concept_1_58.png", "strategy": "concept_2_58.png"}


def _silhouette(w: int, h: int, body: str, rim: str) -> Image.Image:
    """A plain stand-in body: head, torso and legs, filled flat with a lit right edge."""
    c = Canvas(w, h)
    head = max(5, h // 10)
    c.disc(w / 2, head + 1, head, body)
    c.rect(w // 2 - w // 5, head * 2, max(4, w * 2 // 5), h // 2 - head, body)
    c.rect(w // 2 - w // 5, head * 2 + h // 2 - head, max(2, w // 6), h - (head * 2 + h // 2 - head), body)
    c.rect(w // 2 + w // 5 - max(2, w // 6), head * 2 + h // 2 - head, max(2, w // 6), h - (head * 2 + h // 2 - head), body)
    for x, y, _ in list(c.points()):
        if not c.opaque(x + 1, y):
            c.set(x, y, rim)
    return c.to_image()


def standin_hero(hero: str) -> Image.Image:
    """A 58 px stand-in hero (alpha snapped to 0/255), feet on the bottom row."""
    path = STANDINS / HERO_FILES[hero]
    if not path.exists():
        return _silhouette(24, 58, "#2a2840", "#8a86b0")
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
    rgba.putdata([(r, g, b, 255 if a >= 128 else 0) for r, g, b, a in rgba.getdata()])
    return rgba


def standin_customer(animation: str = "walk", frame: int = 0, scale: int = 2) -> Image.Image:
    """Today's customer sprite at ``scale`` (2x is ~60 px tall), cropped to its pixels."""
    path = STANDINS / "current-sheets.json"
    if not path.exists():
        return _silhouette(28, 60, "#7a3a30", "#e0907a")
    data = json.loads(path.read_text())["customer"]
    frame_rows = data["animations"][animation]["frames"][frame]
    palette = data["palette"]
    image = Image.new("RGBA", (len(frame_rows[0]), len(frame_rows)), (0, 0, 0, 0))
    for y, row in enumerate(frame_rows):
        for x, key in enumerate(row):
            if key in palette:
                image.putpixel((x, y), parse_hex(palette[key]) + (255,))
    box = image.getbbox()
    image = image.crop(box) if box else image
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


def place_feet(base: Image.Image, sprite: Image.Image, cx: int, feet: int, flip: bool = False) -> Tuple[int, int, int, int]:
    """Composites a body with its bottom-centre at (cx, feet); returns its box."""
    if flip:
        sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    x, y = cx - sprite.width // 2, feet - sprite.height
    base.alpha_composite(sprite, (x, y))
    return x, y, x + sprite.width, y + sprite.height
