"""Review renders: contact sheets, animated GIFs and in-scene composites (never shipped)."""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw

DARK = (28, 22, 58, 255)  # select-screen indigo
MID = (120, 110, 130, 255)


def on_bg(img: Image.Image, bg: Tuple[int, int, int, int]) -> Image.Image:
    tile = Image.new("RGBA", img.size, bg)
    tile.alpha_composite(img.convert("RGBA"))
    return tile


def contact_sheet(
    rows: Sequence[Tuple[str, Sequence[Image.Image]]],
    scale: int = 4,
    bg: Tuple[int, int, int, int] = DARK,
    label_width: int = 90,
    guides: bool = True,
) -> Image.Image:
    """One labelled row per animation, every frame at `scale`, with the feet line marked."""
    fw = max(f.width for _, frames in rows for f in frames)
    fh = max(f.height for _, frames in rows for f in frames)
    cols = max(len(frames) for _, frames in rows)
    gap = 4
    out = Image.new("RGBA", (label_width + cols * (fw * scale + gap), len(rows) * (fh * scale + 14)), (18, 16, 24, 255))
    draw = ImageDraw.Draw(out)
    for r, (name, frames) in enumerate(rows):
        y = r * (fh * scale + 14)
        draw.text((4, y + 4), name, fill=(230, 230, 240, 255))
        for c, frame in enumerate(frames):
            x = label_width + c * (fw * scale + gap)
            tile = on_bg(frame, bg).resize((frame.width * scale, frame.height * scale), Image.NEAREST)
            out.alpha_composite(tile, (x, y))
            if guides:
                draw.line([(x, y + fh * scale - 1), (x + fw * scale - 1, y + fh * scale - 1)], fill=(255, 80, 80, 120))
                draw.line([(x + fw * scale // 2, y), (x + fw * scale // 2, y + 6)], fill=(255, 80, 80, 160))
            draw.text((x + 2, y + fh * scale + 1), str(c), fill=(160, 160, 180, 255))
    return out


def gif(frames: Sequence[Image.Image], path: Path, fps: float, scale: int = 4, bg=DARK, loops: bool = True,
        hold_last: int = 0) -> None:
    imgs = [on_bg(f, bg).resize((f.width * scale, f.height * scale), Image.NEAREST).convert("P", palette=Image.ADAPTIVE)
            for f in frames]
    durations = [int(round(1000 / fps))] * len(imgs)
    if hold_last:
        durations[-1] += hold_last
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=durations, loop=0 if loops else 1, disposal=2)


def strip(frames: Sequence[Image.Image], scale: int = 4, bg=DARK, gap: int = 2) -> Image.Image:
    w = sum(f.width * scale + gap for f in frames)
    h = max(f.height for f in frames) * scale
    out = Image.new("RGBA", (w, h), (18, 16, 24, 255))
    x = 0
    for f in frames:
        out.alpha_composite(on_bg(f, bg).resize((f.width * scale, f.height * scale), Image.NEAREST), (x, 0))
        x += f.width * scale + gap
    return out
