"""Hand-placed drawings and the stack that paints them into a frame.

A drawing is text art, one character per pixel and '.' for nothing, placed at a column and row of the
design space: the 32 x 40 standing frame the designs were drawn in, its feet on row 39. A drawing may
reach outside it (a raised arm, a prop), because the sheets' 64 x 64 frames leave room on every side.

A character names a tone of a ramp through a legend. Body characters always mean the same material (K is
the skin's outline, w the white of the eye); cloth characters (# x o + * ~) mean a tone of whatever the
part is dyed in, and shoe digits (0-4) a tone of the shoes, so one cut of sleeve or trousers can be worn
in several colours. As in Terraria, every material is outlined in the darkest tone of its own ramp.
"""
from __future__ import annotations

from typing import Dict, Iterable, Mapping, NamedTuple, Optional, Tuple

from PIL import Image

from .palette import RAMPS

# The sheets' frames (docs/LOOKS.md), with the design space's feet on their bottom-centre origin.
FRAME = (64, 64)
ORIGIN = (32, 64)
DESIGN = (32, 40)
DESIGN_AT = (ORIGIN[0] - DESIGN[0] // 2, ORIGIN[1] - DESIGN[1])
GROUND = DESIGN[1] - 1

Point = Tuple[int, int]
# A tone: the ramp it comes from (a ramp's name, or '@slot' for whatever the outfit dyes that slot in) and
# its index, outline first.
Tone = Tuple[str, int]


def tones(ramp: str, chars: str) -> Dict[str, Tone]:
    """A legend giving `chars` the tones of `ramp`, darkest first."""
    return {char: (ramp, index) for index, char in enumerate(chars)}


BODY: Dict[str, Tone] = {
    **tones('skin', 'KSsL'),
    # Seven tones of hair, as many as Terraria shades its hair with.
    **tones('hair', 'OdmnlhH'),
    **tones('eye', 'wi'),
    **tones('glasses', 'Gg'),
}
# Outline, shade, base, light, highlight, accent. A part may give a tone its own meaning: the hoodie's
# accent is the tips of its drawstrings, the cap's its glossy spot, the belt's highlight its buckle.
CLOTH = tones('@cloth', '#xo+*~')
SHOES = tones('@shoes', '01234')
# What most drawings are made of: the body, the cloth they are dyed in and the shoes.
WORN: Dict[str, Tone] = {**BODY, **CLOTH, **SHOES}


class Art(NamedTuple):
    """One drawing: its pixels in design space with the tone each one is painted in."""
    name: str
    pixels: Tuple[Tuple[int, int, Tone], ...]

    def moved(self, dx: int, dy: int) -> 'Art':
        return Art(self.name, tuple((x + dx, y + dy, tone) for x, y, tone in self.pixels))

    def covers(self, point: Point) -> bool:
        return any((x, y) == point for x, y, _ in self.pixels)


def art(name: str, left: int, top: int, rows: str, legend: Mapping[str, Tone] = WORN) -> Art:
    """Text art whose first row is design row `top` and first column design column `left`."""
    lines = [line.strip() for line in rows.strip('\n').split('\n')]
    pixels = []
    for dy, line in enumerate(lines):
        for dx, char in enumerate(line):
            if char == '.':
                continue
            if char not in legend:
                raise ValueError(f'{name}: unknown pixel {char!r} at ({left + dx}, {top + dy})')
            pixels.append((left + dx, top + dy, legend[char]))
    return Art(name, tuple(pixels))


def full(name: str, top: int, rows: str, legend: Mapping[str, Tone] = WORN) -> Art:
    """Text art drawn over the whole width of the design space, so a row shows where it sits."""
    for dy, line in enumerate(rows.strip('\n').split('\n')):
        if len(line.strip()) != DESIGN[0]:
            raise ValueError(f'{name}: row {top + dy} is {len(line.strip())} wide, not {DESIGN[0]}')
    return art(name, 0, top, rows, legend)


class Dye(NamedTuple):
    """What a drawing's slots are dyed in: its cloth, and its shoes if it has any."""
    cloth: Optional[str] = None
    shoes: Optional[str] = None


def colour(tone: Tone, dye: Dye, where: str) -> Tuple[int, int, int, int]:
    ramp, index = tone
    if ramp.startswith('@'):
        slot = ramp[1:]
        ramp = getattr(dye, slot)
        if ramp is None:
            raise ValueError(f'{where}: has {slot} pixels but is not dyed for them')
    values = RAMPS[ramp]
    if index >= len(values):
        raise ValueError(f'{where}: needs tone {index} of {ramp}, which has {len(values)}')
    value = values[index]
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), 255


class Stroke(NamedTuple):
    """A drawing as one frame paints it: dyed, and moved by whatever carries it."""
    art: Art
    dye: Dye = Dye()
    at: Point = (0, 0)


def paint(strokes: Iterable[Stroke], where: str) -> Image.Image:
    """Every stroke over the ones before it, in a sheet frame; nothing may fall outside it."""
    image = Image.new('RGBA', FRAME, (0, 0, 0, 0))
    for stroke in strokes:
        for x, y, tone in stroke.art.pixels:
            px, py = x + stroke.at[0] + DESIGN_AT[0], y + stroke.at[1] + DESIGN_AT[1]
            if not (0 <= px < FRAME[0] and 0 <= py < FRAME[1]):
                raise ValueError(f'{where}: {stroke.art.name} leaves the frame at ({px}, {py})')
            image.putpixel((px, py), colour(tone, stroke.dye, f'{where}: {stroke.art.name}'))
    return image


def to_frame(point: Point) -> Point:
    """A design-space point in sheet-frame pixels."""
    return point[0] + DESIGN_AT[0], point[1] + DESIGN_AT[1]

