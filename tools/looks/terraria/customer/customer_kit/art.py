"""Hand-placed drawings, the joints they hang from, and the paint that puts them in a frame.

A drawing is text art, one character per pixel and '.' for nothing, placed at a column and row of the
design space the Terraria heroes are drawn in: a 32 x 40 standing frame, its feet on row 39, centred on
the sheets' bottom-centre origin. A drawing may reach outside it (a raised arm, a long receipt), because
the 64 x 64 frames leave room on every side.

Every drawing is placed where it sits on the standing customer and names the points it is posed by: the
joint it hangs from (a shoulder, the hips, the neck), and the points others hang from it (a hand, the
mouth). Moving a drawing moves its points with it, so a pose that lifts the body carries the head, the
arms and whatever the hands hold, and a prop is placed by its grip on the hand that holds it.

A character names a tone of a ramp through a legend: body characters always mean the same material (K is
the skin's outline), cloth characters (# x o + *) a tone of whatever the drawing is dyed in, and trim
digits (5-8) a tone of its second material, so one cut can be worn in several colours. As in Terraria,
every material is outlined in the darkest tone of its own ramp.
"""
from __future__ import annotations

from typing import Dict, Iterable, Mapping, NamedTuple, Optional, Tuple

from PIL import Image

from .palette import RAMPS

# The sheets' frames (docs/LOOKS.md), the design space's feet on their bottom-centre origin.
FRAME = (64, 64)
ORIGIN = (32, 64)
DESIGN = (32, 40)
DESIGN_AT = (ORIGIN[0] - DESIGN[0] // 2, ORIGIN[1] - DESIGN[1])
GROUND = DESIGN[1] - 1

Point = Tuple[int, int]
# A tone: the ramp it comes from (a ramp's name, or '@slot' for whatever the layer dyes that slot in) and its
# index, outline first.
Tone = Tuple[str, int]


def tones(ramp: str, chars: str) -> Dict[str, Tone]:
    """A legend giving `chars` the tones of `ramp`, darkest first."""
    return {char: (ramp, index) for index, char in enumerate(chars)}


# The body: skin dyed per mood (flushed while unhappy), hair dyed per customer, and the face's fixed parts.
BODY: Dict[str, Tone] = {
    **tones('@skin', 'KSsL'),
    **tones('@hair', 'Odmlh'),
    **tones('eye', 'wi'),
    # The open mouth: its dark inside, the teeth, the tongue.
    **tones('mouth', 'Mtq'),
}
CLOTH = tones('@cloth', '#xo+*')
TRIM = tones('@trim', '5678')
SHOES = tones('@shoes', '0123')
WORN: Dict[str, Tone] = {**BODY, **CLOTH, **TRIM, **SHOES}


class Drawing(NamedTuple):
    """One drawing: its pixels in design space, each with its tone, and the named points it is posed by."""
    name: str
    pixels: Tuple[Tuple[int, int, Tone], ...]
    points: Tuple[Tuple[str, Point], ...] = ()

    def point(self, name: str) -> Point:
        for key, value in self.points:
            if key == name:
                return value
        raise KeyError(f'{self.name} has no point {name!r}; it has {[key for key, _ in self.points]}')

    def moved(self, dx: int, dy: int) -> 'Drawing':
        return Drawing(
            self.name,
            tuple((x + dx, y + dy, tone) for x, y, tone in self.pixels),
            tuple((key, (x + dx, y + dy)) for key, (x, y) in self.points),
        )

    def swung(self, below: int, dx: int) -> 'Drawing':
        """The drawing with every row under row `below` moved `dx` across, as if it swung on that row: a pixel's
        lag of a dangling end is how Terraria tilts a hanging thing without redrawing it."""
        return self._replace(pixels=tuple((x + dx if y > below else x, y, tone) for x, y, tone in self.pixels))

    def placed(self, joint: str, at: Point) -> 'Drawing':
        """The drawing moved so its point `joint` lands on `at`."""
        x, y = self.point(joint)
        return self.moved(at[0] - x, at[1] - y)

    def covers(self, point: Point) -> bool:
        return any((x, y) == point for x, y, _ in self.pixels)


def art(
    name: str, left: int, top: int, rows: str, legend: Mapping[str, Tone] = WORN, **points: Point,
) -> Drawing:
    """Text art whose first row is design row `top` and first column design column `left`.

    `points` are named design-space points of the drawing as it stands, e.g. `shoulder=(10, 22)`.
    """
    lines = [line.strip() for line in rows.strip('\n').split('\n')]
    pixels = []
    for dy, line in enumerate(lines):
        for dx, char in enumerate(line):
            if char == '.':
                continue
            if char not in legend:
                raise ValueError(f'{name}: unknown pixel {char!r} at ({left + dx}, {top + dy})')
            pixels.append((left + dx, top + dy, legend[char]))
    return Drawing(name, tuple(pixels), tuple(points.items()))


def full(name: str, top: int, rows: str, legend: Mapping[str, Tone] = WORN, **points: Point) -> Drawing:
    """Text art drawn over the whole width of the design space, so a row shows where it sits."""
    for dy, line in enumerate(rows.strip('\n').split('\n')):
        if len(line.strip()) != DESIGN[0]:
            raise ValueError(f'{name}: row {top + dy} is {len(line.strip())} wide, not {DESIGN[0]}')
    return art(name, 0, top, rows, legend, **points)


class Dye(NamedTuple):
    """What a drawing's slots are painted in."""
    skin: Optional[str] = None
    hair: Optional[str] = None
    cloth: Optional[str] = None
    trim: Optional[str] = None
    shoes: Optional[str] = None


def colour(tone: Tone, dye: Dye, where: str) -> Tuple[int, int, int, int]:
    ramp, index = tone
    if ramp.startswith('@'):
        slot = ramp[1:]
        dyed = getattr(dye, slot)
        if dyed is None:
            raise ValueError(f'{where}: has {slot} pixels but is not dyed for them')
        ramp = dyed
    values = RAMPS[ramp]
    if index >= len(values):
        raise ValueError(f'{where}: needs tone {index} of {ramp}, which has {len(values)}')
    value = values[index]
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), 255


class Stroke(NamedTuple):
    """A drawing as a frame paints it: placed, and dyed."""
    drawing: Drawing
    dye: Dye


def paint(strokes: Iterable[Stroke], where: str) -> Image.Image:
    """Every stroke over the ones before it, in a sheet frame; nothing may fall outside it."""
    image = Image.new('RGBA', FRAME, (0, 0, 0, 0))
    for stroke in strokes:
        for x, y, tone in stroke.drawing.pixels:
            px, py = to_frame((x, y))
            if not (0 <= px < FRAME[0] and 0 <= py < FRAME[1]):
                raise ValueError(f'{where}: {stroke.drawing.name} leaves the frame at ({px}, {py})')
            image.putpixel((px, py), colour(tone, stroke.dye, f'{where}: {stroke.drawing.name}'))
    return image


def to_frame(point: Point) -> Point:
    """A design-space point in sheet-frame pixels."""
    return point[0] + DESIGN_AT[0], point[1] + DESIGN_AT[1]
