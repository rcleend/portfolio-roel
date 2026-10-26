"""Packs animations into a sheet's PNG + JSON (docs/LOOKS.md): one row per animation, frames left to right."""
from __future__ import annotations

import io
import json
from typing import Dict, NamedTuple, Sequence, Tuple

from PIL import Image

Point = Tuple[int, int]


class Strip(NamedTuple):
    """One animation's frames, already painted, and its anchors in frame pixels."""
    name: str
    fps: float
    loop: bool
    frames: Tuple[Image.Image, ...]
    anchors: Dict[str, Tuple[Point, ...]]


def pack(strips: Sequence[Strip], frame: Tuple[int, int], origin: Point) -> Tuple[bytes, bytes]:
    """The sheet's PNG and JSON bytes; the same strips always make the same bytes."""
    width = frame[0] * max(len(strip.frames) for strip in strips)
    image = Image.new('RGBA', (width, frame[1] * len(strips)), (0, 0, 0, 0))
    for row, strip in enumerate(strips):
        for column, picture in enumerate(strip.frames):
            if picture.size != frame:
                raise ValueError(f'{strip.name}[{column}] is {picture.size}, not {frame}')
            check_crisp(picture, f'{strip.name}[{column}]')
            image.paste(picture, (column * frame[0], row * frame[1]))
        for name, points in strip.anchors.items():
            if len(points) != len(strip.frames):
                raise ValueError(f'{strip.name}: anchor {name} has {len(points)} points for {len(strip.frames)} frames')
            for x, y in points:
                if not (0 <= x < frame[0] and 0 <= y < frame[1]):
                    raise ValueError(f'{strip.name}: anchor {name} ({x}, {y}) is outside the frame')
    buffer = io.BytesIO()
    image.save(buffer, format='PNG', optimize=False)
    spec = {
        'frame': {'w': frame[0], 'h': frame[1]},
        'origin': {'x': origin[0], 'y': origin[1]},
        'animations': [animation(strip) for strip in strips],
    }
    return buffer.getvalue(), (format_json(spec) + '\n').encode()


def animation(strip: Strip) -> dict:
    entry: dict = {'name': strip.name, 'fps': fps(strip.fps), 'loop': strip.loop, 'frames': len(strip.frames)}
    if strip.anchors:
        entry['anchors'] = {name: [list(point) for point in points] for name, points in strip.anchors.items()}
    return entry


def fps(value: float) -> float:
    """Whole frame rates as integers, so the JSON reads `12`, not `12.0`."""
    return int(value) if float(value).is_integer() else round(value, 4)


def check_crisp(picture: Image.Image, where: str) -> None:
    alphas = set(picture.getchannel('A').getdata())
    if alphas - {0, 255}:
        raise ValueError(f'{where}: alpha must be 0 or 255, found {sorted(alphas - {0, 255})}')


def format_json(spec: dict) -> str:
    """The JSON the way the repository's other sheets print it: one line per animation."""
    rows = ',\n'.join(f'    {inline(entry)}' for entry in spec['animations'])
    return '\n'.join([
        '{', f'  "frame": {inline(spec["frame"])},', f'  "origin": {inline(spec["origin"])},', '  "animations": [',
        rows, '  ]', '}',
    ])


def inline(value: object) -> str:
    """`value` on one line, objects spaced inside their braces: { "w": 64, "h": 64 }."""
    if isinstance(value, dict):
        return '{ ' + ', '.join(f'{json.dumps(key)}: {inline(item)}' for key, item in value.items()) + ' }'
    if isinstance(value, list):
        return '[' + ', '.join(inline(item) for item in value) + ']'
    return json.dumps(value)

