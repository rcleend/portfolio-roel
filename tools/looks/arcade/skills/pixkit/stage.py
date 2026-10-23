"""Review surfaces: the places a skill sprite will actually be seen.

Nothing here ships. These helpers rebuild, in Pillow, the bevelled skill
slot of the select screen and HUD and the two levels' parallax backdrops, so
the generators can be judged where the player will judge them.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw

from .canvas import Sprite, parse_hex

REPO_ROOT = Path(__file__).resolve().parents[5]

#: src/game/ui/theme.ts windowThemes, as (outline, light, mid, dark, fill stops).
SLOT_THEMES: Dict[str, Tuple[str, str, str, str, Tuple[str, str]]] = {
    "steel": ("#0b0a14", "#eef0f6", "#8a90a8", "#3a3f57", ("#343852", "#181a28")),
    "indigo": ("#0b0a1f", "#e4dcff", "#a99cf0", "#3d2f8f", ("#2a2468", "#14123a")),
    "cream": ("#2a2010", "#fffdf0", "#e6d7a0", "#a8955e", ("#fffae6", "#f1e6bd")),
}

#: src/game/ui/theme.ts FRAME_PATTERN, the 12 x 12 bevel tiled as a nine-slice with 4 px insets.
FRAME_PATTERN = (
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
)


def _rgba(color: str) -> Tuple[int, int, int, int]:
    return parse_hex(color) + (255,)


def band_colors(top: str, bottom: str, bands: int) -> List[Tuple[int, int, int, int]]:
    a, b = parse_hex(top), parse_hex(bottom)
    colors = []
    for i in range(bands):
        t = i / max(1, bands - 1)
        colors.append(tuple(round(a[c] + (b[c] - a[c]) * t) for c in range(3)) + (255,))
    return colors


def bevel_window(width: int, height: int, theme: str = "steel") -> Image.Image:
    """A bevelled window like ``drawWindow``: banded fill, then the nine-slice frame."""
    outline, light, mid, dark, (top, bottom) = SLOT_THEMES[theme]
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    colors = band_colors(top, bottom, 4)
    inner_h = height - 4
    for i, color in enumerate(colors):
        y0 = 2 + round(i * inner_h / 4)
        y1 = 2 + round((i + 1) * inner_h / 4) - 1
        draw.rectangle((2, y0, width - 3, y1), fill=color)
    key = {"o": _rgba(outline), "L": _rgba(light), "m": _rgba(mid), "d": _rgba(dark)}
    data = image.load()
    for y in range(height):
        sy = y if y < 4 else (11 - (height - 1 - y) if y >= height - 4 else 4 + (y - 4) % 4)
        for x in range(width):
            sx = x if x < 4 else (11 - (width - 1 - x) if x >= width - 4 else 4 + (x - 4) % 4)
            ch = FRAME_PATTERN[sy][sx]
            if ch in key:
                data[x, y] = key[ch]
    return image


def icon_in_slot(icon: Sprite, theme: str = "steel", border: int = 4) -> Image.Image:
    """The icon sitting in a bevelled slot exactly its size plus the bevel."""
    slot = bevel_window(icon.width + border * 2, icon.height + border * 2, theme)
    slot.alpha_composite(icon.to_image(), (border, border))
    return slot


def upscale(image: Image.Image, factor: int) -> Image.Image:
    return image.resize((image.width * factor, image.height * factor), Image.NEAREST)


def level_backdrop(level: str, camera_x: int = 600, foreground: bool = False) -> Image.Image:
    """The level's parallax stack at one camera position, ground tiles included, like the game draws it."""
    base = REPO_ROOT / "src/game/levels" / level / "art"
    meta = json.loads((base / "layers.json").read_text())
    canvas = Image.new("RGBA", tuple(meta["nativeSize"]), (0, 0, 0, 255))
    for layer in meta["layers"]:
        if layer.get("foreground") and not foreground:
            continue
        image = Image.open(base / layer["file"]).convert("RGBA")
        x = -round(camera_x * layer["factor"])
        if layer["repeatX"]:
            x = x % layer["width"] - layer["width"]
            while x < canvas.width:
                canvas.alpha_composite(image, (x, layer["y"]))
                x += layer["width"]
        else:
            canvas.alpha_composite(image, (x, layer["y"]))
    tiles = Image.open(base / meta["tileset"]["file"]).convert("RGBA")
    size = meta["tileset"]["tileSize"]
    names = meta["tileset"]["tiles"]

    def tile(name: str) -> Image.Image:
        col, row = names[name]
        return tiles.crop((col * size, row * size, col * size + size, row * size + size))

    ground = meta["groundY"]
    for x in range(0, canvas.width, size):
        canvas.alpha_composite(tile("ground_top"), (x, ground))
        canvas.alpha_composite(tile("ground_fill"), (x, ground + size))
        canvas.alpha_composite(tile("ground_base"), (x, ground + size * 2))
    return canvas


def paste_sprite(
    canvas: Image.Image, sprite: Sprite, x: int, y: int, origin: Tuple[int, int], flip: bool = False
) -> None:
    """Places ``sprite`` so its ``origin`` lands on (x, y), like ``gfx.sprite``."""
    art = sprite.flipped_x() if flip else sprite
    ox = sprite.width - 1 - origin[0] if flip else origin[0]
    canvas.alpha_composite(art.to_image(), (x - ox, y - origin[1]))


def filmstrip(
    frames: Sequence[Sprite],
    scale: int = 4,
    background: str = "#1c1a30",
    gap: int = 2,
    guides: Optional[Tuple[int, int]] = None,
) -> Image.Image:
    """Frames side by side on a flat backdrop, optionally with the origin marked, for stepping through motion."""
    if not frames:
        raise ValueError("no frames")
    w, h = frames[0].width, frames[0].height
    strip = Image.new("RGBA", (len(frames) * (w + gap) - gap, h), _rgba(background))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame.to_image(), (index * (w + gap), 0))
    big = upscale(strip, scale)
    if guides is not None:
        draw = ImageDraw.Draw(big)
        gx, gy = guides
        for index in range(len(frames)):
            left = index * (w + gap) * scale
            draw.line(
                (left + gx * scale, gy * scale, left + gx * scale + scale - 1, gy * scale), fill=(255, 0, 255, 255)
            )
    return big


def stack(
    images: Iterable[Image.Image], gap: int = 8, background: str = "#0e0c18", horizontal: bool = False
) -> Image.Image:
    images = list(images)
    if horizontal:
        width = sum(image.width for image in images) + gap * (len(images) + 1)
        height = max(image.height for image in images) + gap * 2
    else:
        width = max(image.width for image in images) + gap * 2
        height = sum(image.height for image in images) + gap * (len(images) + 1)
    sheet = Image.new("RGBA", (width, height), _rgba(background))
    offset = gap
    for image in images:
        if horizontal:
            sheet.alpha_composite(image, (offset, gap))
            offset += image.width + gap
        else:
            sheet.alpha_composite(image, (gap, offset))
            offset += image.height + gap
    return sheet


def mannequin(height: int = 58, coat: str = "#2a2a3a", skin: str = "#e8b89a", hair: str = "#9a8262") -> Sprite:
    """A plain 64 x 64 stand-in figure at the new hero scale, feet on the bottom edge, for judging effect scale.

    It is deliberately simple (flat clothes, no face) so it says "a hero is
    here, this tall" without pretending to be the character crew's art.
    """
    sprite = Sprite(64, 64)
    top = 64 - height
    head_h = round(height / 5)
    shade = "#1a1a26"
    for x, y in _ellipse_box(26, top, 12, head_h + 1):
        sprite.set(x, y, skin)
    for x in range(26, 38):
        for y in range(top, top + 3):
            sprite.set(x, y, hair)
    torso_top = top + head_h + 1
    legs_top = torso_top + round(height * 0.38)
    sprite.rect(25, torso_top, 14, legs_top - torso_top, coat)
    sprite.rect(22, torso_top + 1, 3, round(height * 0.32), coat)
    sprite.rect(39, torso_top + 1, 3, round(height * 0.32), coat)
    sprite.rect(26, legs_top, 5, 64 - legs_top - 1, shade)
    sprite.rect(33, legs_top, 5, 64 - legs_top - 1, shade)
    sprite.rect(25, 63, 6, 1, "#e8e8f0")
    sprite.rect(33, 63, 6, 1, "#e8e8f0")
    return sprite.outlined("#0b0a14", corners=True)


def _ellipse_box(x: int, y: int, w: int, h: int) -> Iterator[Tuple[int, int]]:
    cx, cy = x + w / 2, y + h / 2
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            if ((xx + 0.5 - cx) / (w / 2)) ** 2 + ((yy + 0.5 - cy) / (h / 2)) ** 2 <= 1:
                yield xx, yy


class Scene:
    """A native 320 x 240 frame: a level backdrop and sprites placed by their origins, like the game draws."""

    def __init__(self, level: str, camera_x: int = 600) -> None:
        self.image = level_backdrop(level, camera_x)

    def place(self, sprite: Sprite, x: int, y: int, origin: Tuple[int, int] = (0, 0), flip: bool = False) -> "Scene":
        paste_sprite(self.image, sprite, x, y, origin, flip)
        return self


def label(image: Image.Image, text: str, color: str = "#c8c4e0") -> Image.Image:
    """Adds a caption strip above ``image`` (review sheets only)."""
    captioned = Image.new("RGBA", (image.width, image.height + 14), (0, 0, 0, 0))
    ImageDraw.Draw(captioned).text((2, 1), text, fill=_rgba(color))
    captioned.alpha_composite(image, (0, 14))
    return captioned
