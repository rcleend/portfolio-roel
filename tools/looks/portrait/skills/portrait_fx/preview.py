"""Review helpers: the game's bevelled slot, banded fills and contact sheets.

The slot is rebuilt from `src/game/ui/theme.ts` (the 12 x 12 nine-slice
frame and its banded, bayer-dithered fill), so icons are judged on exactly
the background they will sit on in the select screen and the HUD.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple

from PIL import Image, ImageDraw


RGBA = Tuple[int, int, int, int]


@dataclass(frozen=True)
class Theme:
    """One of `windowThemes` (src/game/ui/theme.ts): the frame's four tones and the fill's two stops."""

    outline: str
    light: str
    mid: str
    dark: str
    fill: Tuple[str, str]
    dither: bool = True


THEMES: Dict[str, Theme] = {
    "steel": Theme("#0b0a14", "#eef0f6", "#8a90a8", "#3a3f57", ("#343852", "#181a28")),
    "indigo": Theme("#0b0a1f", "#e4dcff", "#a99cf0", "#3d2f8f", ("#2a2468", "#14123a")),
    "cream": Theme("#2a2010", "#fffdf0", "#e6d7a0", "#a8955e", ("#fffae6", "#f1e6bd"), dither=False),
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
BORDER = 4
BAYER_2 = [0, 2, 3, 1]


def rgba(hex_color: str) -> RGBA:
    return (int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16), 255)


def mix(a: str, b: str, t: float) -> str:
    ca, cb = rgba(a), rgba(b)
    return "#{:02x}{:02x}{:02x}".format(*(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3)))


def banded_fill(w: int, h: int, stops: Sequence[str], bands: int, dither: bool) -> Image.Image:
    """`renderBandedGradient` from src/engine/gfx/Gfx.ts (vertical, bayer2)."""
    bands = max(1, min(bands, h))
    colors = [stops[0] if bands == 1 else mix(stops[0], stops[-1], i / (bands - 1)) for i in range(bands)]
    image = Image.new("RGBA", (w, h))
    px = image.load()
    edge = [round(i * h / bands) for i in range(bands + 1)]
    for i, color in enumerate(colors):
        for y in range(edge[i], edge[i + 1]):
            for x in range(w):
                px[x, y] = rgba(color)
    if dither:
        for i in range(bands - 1):
            boundary = edge[i + 1]
            if boundary - edge[i] < 2:
                continue
            y = boundary - 1
            for x in range(w):
                if 0.5 > BAYER_2[(y % 2) * 2 + (x % 2)] / 4:
                    px[x, y] = rgba(colors[i + 1])
    return image


def slot(size: int, theme: str = "steel") -> Image.Image:
    """A bevelled window of `size` x `size`, like `drawWindow(gfx, rect, windowThemes[theme])`."""
    t = THEMES[theme]
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    image.alpha_composite(banded_fill(size - 4, size - 4, t.fill, 4, t.dither), (2, 2))
    colors = {"o": t.outline, "L": t.light, "m": t.mid, "d": t.dark}
    px = image.load()
    n = len(FRAME_PATTERN)

    def source(i: int) -> int:
        """Nine-slice: the 4 px borders come from the pattern's borders, the middle tiles its centre."""
        if i < BORDER:
            return i
        if i >= size - BORDER:
            return n - (size - i)
        return BORDER + (i - BORDER) % (n - 2 * BORDER)

    for y in range(size):
        for x in range(size):
            color = colors.get(FRAME_PATTERN[source(y)][source(x)])
            if color:
                px[x, y] = rgba(color)
    return image


def scaled(image: Image.Image, scale: int) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


def label_sheet(
    cells: List[Tuple[str, Image.Image]], columns: int, gap: int = 8, background: RGBA = (22, 22, 30, 255)
) -> Image.Image:
    """A labelled contact sheet of same-sized images."""
    if not cells:
        raise ValueError("nothing to lay out")
    w = max(c[1].width for c in cells)
    h = max(c[1].height for c in cells)
    label_h = 12
    rows = math.ceil(len(cells) / columns)
    sheet = Image.new("RGBA", (columns * (w + gap) + gap, rows * (h + label_h + gap) + gap), background)
    draw = ImageDraw.Draw(sheet)
    for i, (label, image) in enumerate(cells):
        x = gap + (i % columns) * (w + gap)
        y = gap + (i // columns) * (h + label_h + gap)
        draw.text((x, y), label, fill=(200, 200, 215, 255))
        sheet.alpha_composite(image, (x, y + label_h))
    return sheet
