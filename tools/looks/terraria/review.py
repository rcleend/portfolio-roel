#!/usr/bin/env python3
"""Review boards for the Terraria look, rendered from the committed sheets (what ships, not the recipe).

    python3 tools/looks/terraria/review.py [--out DIR] [--refs DIR]

Writes, at whole-pixel zoom on a dark stage with the feet line marked:
  gif/<hero>-<animation>-x1.gif and -x4.gif   each animation at its own frame rate
  strip/<hero>-<animation>-x1.png and -x4.png its frames left to right
  sheet-<hero>-x2.png                         the whole sheet with its anchors marked
  run-vs-terraria-x1.gif, -x2.gif, -frames.png the captain's Terraria running GIF beside the three runs, at
                                              the same size of art pixel (with --refs, the folder holding
                                              terraria-running.gif)
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
LOOK = HERE.parents[2] / 'src' / 'game' / 'art' / 'looks' / 'terraria' / 'characters'
STAGE = (43, 53, 80, 255)
FLOOR = (92, 104, 140, 255)
MARK = (255, 220, 0, 255)


def load(hero: str, stem: str) -> Tuple[Image.Image, dict]:
    with Image.open(LOOK / hero / f'{stem}.png') as image:
        return image.convert('RGBA'), json.loads((LOOK / hero / f'{stem}.json').read_text())


def frames(sheet: Image.Image, spec: dict, row: int) -> List[Image.Image]:
    w, h = spec['frame']['w'], spec['frame']['h']
    count = spec['animations'][row]['frames']
    return [sheet.crop((i * w, row * h, (i + 1) * w, (row + 1) * h)) for i in range(count)]


def staged(frame: Image.Image, scale: int, origin_y: int) -> Image.Image:
    out = Image.new('RGBA', frame.size, STAGE)
    ImageDraw.Draw(out).line([(0, origin_y), (frame.width, origin_y)], fill=FLOOR)
    out.alpha_composite(frame)
    return out.resize((frame.width * scale, frame.height * scale), Image.NEAREST)


def save_gif(images: List[Image.Image], fps: float, loop: bool, path: Path) -> None:
    durations = [round(1000 / fps)] * len(images)
    if not loop:
        durations[-1] = max(durations[-1], 500)
    rgb = [image.convert('RGB') for image in images]
    rgb[0].save(path, save_all=True, append_images=rgb[1:], duration=durations, loop=0, disposal=1)


def row(images: List[Image.Image], gap: int = 2) -> Image.Image:
    out = Image.new('RGBA', (sum(i.width for i in images) + gap * (len(images) - 1), images[0].height), (16, 16, 22, 255))
    x = 0
    for image in images:
        out.alpha_composite(image, (x, 0))
        x += image.width + gap
    return out


def anchored(sheet: Image.Image, spec: dict) -> Image.Image:
    out = Image.new('RGBA', sheet.size, STAGE)
    out.alpha_composite(sheet)
    draw = ImageDraw.Draw(out)
    w, h = spec['frame']['w'], spec['frame']['h']
    for r, animation in enumerate(spec['animations']):
        for points in animation.get('anchors', {}).values():
            for i, (x, y) in enumerate(points):
                draw.point((i * w + x, r * h + y), fill=MARK)
    for x in range(0, sheet.width, w):
        draw.line([(x, 0), (x, sheet.height)], fill=(255, 255, 255, 40))
    for y in range(0, sheet.height, h):
        draw.line([(0, y), (sheet.width, y)], fill=(255, 255, 255, 40))
    return out.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)


def run_versus(refs: Path, heroes: List[str], out: Path) -> None:
    """The captain's Terraria GIF beside the three runs, sampled at the same instants, art pixel for art pixel.

    The GIF steps every 70 ms and draws one Terraria art pixel as about 3 of its pixels, so our frames are
    drawn at 3x beside it; it runs left, so it is mirrored to face the way our sheets do. Writes the GIF
    at 1x and 2x and, as a still, its first eight frames over our whole cycle.
    """
    gif = Image.open(refs / 'terraria-running.gif')
    reference = []
    for index in range(gif.n_frames):
        gif.seek(index)
        reference.append(gif.convert('RGBA').crop((20, 0, 140, 130)).transpose(Image.FLIP_LEFT_RIGHT))
    runs = []
    for hero in heroes:
        sheet, spec = load(hero, 'sheet')
        row_index = [a['name'] for a in spec['animations']].index('run')
        runs.append((frames(sheet, spec, row_index), spec['animations'][row_index]['fps']))
    boards = []
    for index, picture in enumerate(reference[:8] * 3):
        t = index * 0.07
        figures = [staged(frs[int(t * fps) % len(frs)].crop((8, 20, 56, 64)), 3, 43) for frs, fps in runs]
        boards.append(row([picture] + figures, gap=6))
    save_gif(boards, 1000 / 70, True, out.with_name(f'{out.stem}-x1.gif'))
    save_gif([board.resize((board.width * 2, board.height * 2), Image.NEAREST) for board in boards], 1000 / 70, True,
             out.with_name(f'{out.stem}-x2.gif'))
    terraria = row(reference[:8], gap=2)
    ours = [row([staged(frame.crop((8, 20, 56, 64)), 3, 43) for frame in frs], gap=2) for frs, _ in runs]
    still = Image.new('RGBA', (max(i.width for i in [terraria, *ours]), terraria.height + sum(i.height + 6 for i in ours)),
                      (16, 16, 22, 255))
    still.alpha_composite(terraria, (0, 0))
    y = terraria.height + 6
    for strip_image in ours:
        still.alpha_composite(strip_image, (0, y))
        y += strip_image.height + 6
    still.save(out.with_name(f'{out.stem}-frames.png'))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--out', type=Path, default=Path('/tmp/fm-terraria-roels-2/review'))
    parser.add_argument('--refs', type=Path)
    args = parser.parse_args()
    heroes = sorted(path.name for path in LOOK.iterdir() if path.is_dir())
    (args.out / 'gif').mkdir(parents=True, exist_ok=True)
    (args.out / 'strip').mkdir(parents=True, exist_ok=True)
    for hero in heroes:
        sheet, spec = load(hero, 'sheet')
        origin_y = spec['origin']['y'] - 1
        for r, animation in enumerate(spec['animations']):
            name = animation['name']
            frs = frames(sheet, spec, r)
            for scale in (1, 4):
                images = [staged(frame, scale, origin_y) for frame in frs]
                save_gif(images, animation['fps'], animation['loop'], args.out / 'gif' / f'{hero}-{name}-x{scale}.gif')
                row(images).save(args.out / 'strip' / f'{hero}-{name}-x{scale}.png')
        anchored(sheet, spec).save(args.out / f'sheet-{hero}-x2.png')
    if args.refs:
        run_versus(args.refs, heroes, args.out / 'run-vs-terraria')
    print(f'wrote review boards to {args.out}')


if __name__ == '__main__':
    main()
