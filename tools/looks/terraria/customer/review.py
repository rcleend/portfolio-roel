#!/usr/bin/env python3
"""Review boards for the customer concepts, rendered from the committed sheets (what ships, not the recipe).

    python3 tools/looks/terraria/customer/review.py [--out DIR] [--refs DIR]

Writes, at whole-pixel zoom, each concept shouting then won over beside a Terraria Roel:
  lineup-x8.png        on a mid stage, the feet line marked
  silhouettes-x8.png   the same figures filled black, to judge their shapes alone
  concepts-x1.png      at native size on dark, blueprint and warm stages, the way the screen shows them
With --refs, a folder of Terraria sprite frames (one figure per PNG, at Terraria's own two screen pixels per
art pixel), those stand first, halved to one pixel per art pixel so every figure shares one size of pixel.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
LOOKS = HERE.parents[3] / 'src' / 'game' / 'art' / 'looks' / 'terraria'
CONCEPTS = LOOKS / 'customer-concepts'
HERO = LOOKS / 'characters' / 'strategy' / 'sheet.png'

if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from customer_kit.concepts import CONCEPTS as ORDER  # noqa: E402

MID = (92, 112, 104, 255)
FLOOR = (60, 74, 70, 255)
STAGES = ((22, 20, 40, 255), (31, 83, 160, 255), (196, 140, 88, 255))
GAP = 6


def frames(sheet: Path) -> List[Image.Image]:
    """Every animation's first frame, in sheet order."""
    spec = json.loads(sheet.with_suffix('.json').read_text())
    w, h = spec['frame']['w'], spec['frame']['h']
    with Image.open(sheet) as image:
        rgba = image.convert('RGBA')
    return [rgba.crop((0, row * h, w, (row + 1) * h)) for row in range(len(spec['animations']))]


def trimmed(figure: Image.Image) -> Image.Image:
    """The figure cropped to its pixels, side to side only, so every figure keeps its feet on the bottom row."""
    box = figure.getbbox()
    if box is None:
        raise ValueError('an empty figure')
    return figure.crop((box[0], 0, box[2], figure.height))


def reference(path: Path, height: int) -> Image.Image:
    """A Terraria frame at one pixel per art pixel, on a canvas as tall as ours with its feet on the bottom row."""
    with Image.open(path) as image:
        rgba = image.convert('RGBA')
    halved = rgba.resize((rgba.width // 2, rgba.height // 2), Image.NEAREST)
    box = halved.getbbox()
    if box is None:
        raise ValueError(f'{path} is empty')
    figure = halved.crop(box)
    out = Image.new('RGBA', (figure.width, height), (0, 0, 0, 0))
    out.alpha_composite(figure, (0, height - figure.height))
    return out


def row(figures: List[Image.Image], background: Tuple[int, int, int, int], floor: bool) -> Image.Image:
    width = sum(figure.width for figure in figures) + GAP * (len(figures) + 1)
    height = max(figure.height for figure in figures) + 2
    out = Image.new('RGBA', (width, height), background)
    if floor:
        ImageDraw.Draw(out).line([(0, height - 2), (width, height - 2)], fill=FLOOR)
    x = GAP
    for figure in figures:
        out.alpha_composite(figure, (x, height - 2 - figure.height))
        x += figure.width + GAP
    return out


def silhouette(figure: Image.Image) -> Image.Image:
    black = Image.new('RGBA', figure.size, (0, 0, 0, 255))
    out = Image.new('RGBA', figure.size, (0, 0, 0, 0))
    out.paste(black, mask=figure.getchannel('A'))
    return out


def zoom(image: Image.Image, scale: int) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--out', type=Path, default=Path('/tmp/terraria-customer-review'))
    parser.add_argument('--refs', type=Path, help='a folder of Terraria sprite frames to stand first')
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)

    # Cropped to the figures' own rows: the frames' 64 px leave room above the tallest pose.
    concepts = [trimmed(frame) for concept in ORDER for frame in frames(CONCEPTS / f'{concept}.png')]
    roel = trimmed(frames(HERO)[0])
    top = min(figure.getbbox()[1] for figure in [*concepts, roel])
    concepts = [figure.crop((0, top, figure.width, figure.height)) for figure in concepts]
    roel = roel.crop((0, top, roel.width, roel.height))
    height = roel.height
    refs = [reference(path, height) for path in sorted(args.refs.glob('*.png'))] if args.refs else []
    figures = [*refs, roel, *concepts]

    zoom(row(figures, MID, floor=True), 8).save(args.out / 'lineup-x8.png')
    zoom(row([silhouette(figure) for figure in figures], (255, 255, 255, 255), floor=False), 8).save(
        args.out / 'silhouettes-x8.png'
    )
    stages = [row([roel, *concepts], stage, floor=False) for stage in STAGES]
    sheet = Image.new('RGBA', (stages[0].width, sum(stage.height for stage in stages)))
    for index, stage in enumerate(stages):
        sheet.paste(stage, (0, index * stage.height))
    sheet.save(args.out / 'concepts-x1.png')
    print(f'wrote 3 boards to {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
