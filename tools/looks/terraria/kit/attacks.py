"""Each hero's attack strip (docs/LOOKS.md, `spriteAttack`): its projectiles, impacts and muzzle flash.

Drawn the way Terraria draws its projectiles and dust: a small, bright shape outlined in its own darkest
tone, flying with a short trail, and impacts that burst into square motes which fly out, shrink and are
gone. Every frame is 24 x 24 with the shot's centre on the origin, facing right; the game mirrors them.
"""
from __future__ import annotations

import math
from typing import Dict, List, Sequence, Tuple

from PIL import Image

from .art import Dye, colour
from .sheet import Strip

FRAME = (24, 24)
ORIGIN = (12, 12)
Pixels = Dict[Tuple[int, int], Tuple[str, int]]

def shape(rows: str, ramp: str, at: Tuple[int, int] = ORIGIN) -> Pixels:
    """Text art centred on `at`, digits naming the tones of `ramp` (0 is its outline), '.' nothing."""
    lines = [line.strip() for line in rows.strip('\n').split('\n')]
    height, width = len(lines), max(len(line) for line in lines)
    left, top = at[0] - width // 2, at[1] - height // 2
    return {(left + x, top + y): (ramp, int(char)) for y, line in enumerate(lines)
            for x, char in enumerate(line) if char != '.'}


def outlined(pixels: Pixels, ramp: str) -> Pixels:
    """`pixels` with every empty neighbour, diagonals too, filled in the ramp's outline."""
    out: Pixels = {}
    for x, y in pixels:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if (x + dx, y + dy) not in pixels:
                    out[(x + dx, y + dy)] = (ramp, 0)
    out.update(pixels)
    return out


def picture(*layers: Pixels) -> Image.Image:
    image = Image.new('RGBA', FRAME, (0, 0, 0, 0))
    for layer in layers:
        for (x, y), (ramp, tone) in layer.items():
            if not (0 <= x < FRAME[0] and 0 <= y < FRAME[1]):
                raise ValueError(f'attack strip: a {ramp} pixel leaves the frame at ({x}, {y})')
            image.putpixel((x, y), colour((ramp, tone), Dye(), 'attack strip'))
    return image


def trail(length: int, ramp: str, y: int = ORIGIN[1], start: int = ORIGIN[0] - 7) -> Pixels:
    """A speed line behind the shot, fading toward its tail."""
    return {(start - i, y): (ramp, 1 if i < length // 2 else 0) for i in range(length)}


def motes(step: int, ramp: str, count: int = 8, spin: float = 0.0) -> Pixels:
    """Terraria dust at `step` of its flight: square motes that fly out, shrink and darken."""
    radius = (2, 4, 6, 8, 9, 10)[step]
    size = (2, 2, 2, 1, 1, 1)[step]
    tone = (4, 3, 2, 2, 1, 1)[step]
    pixels: Pixels = {}
    for index in range(count):
        angle = spin + index * 2 * math.pi / count
        reach = radius - (index % 2) * (1 if step else 0)
        cx = ORIGIN[0] + round(math.cos(angle) * reach)
        cy = ORIGIN[1] + round(math.sin(angle) * reach)
        for dx in range(size):
            for dy in range(size):
                pixels[(cx + dx - size // 2, cy + dy - size // 2)] = (ramp, tone)
    return pixels


def burst(ramp: str, spin: float = 0.0) -> Tuple[Image.Image, ...]:
    """A Terraria hit: a flash that opens into a ring of motes, which fly out and fade."""
    flash = (outlined(shape('''
.4.
444
.4.
''', ramp), ramp), outlined(shape('''
..3..
.343.
33433
.343.
..3..
''', ramp), ramp))
    frames: List[Image.Image] = [picture(flash[0], motes(0, ramp, spin=spin)), picture(flash[1], motes(1, ramp, spin=spin))]
    frames += [picture(motes(step, ramp, spin=spin)) for step in range(2, 6)]
    return tuple(frames)


# ── ENGINEER: code glyphs ──────────────────────────────────────────────────────────────────────────
# Each glyph a pixel stroke wide in the bright green, its first pixels lit white, with a pixel of dark
# between strokes so `</>` still reads as three characters at native size.
_GLYPHS = {
    'tag': '''
..4....4..4..
.3.....3...3.
3.....3.....3
.3...3.....3.
..3..3....3..
''',
    'braces': '''
.43..34.
.3....3.
3......3
.3....3.
.33..33.
''',
    'arrow': '''
.....4.
44444.3
.......
33333.3
.....3.
''',
    'semicolon': '''
4
.
.
3
3
''',
}


def edged(pixels: Pixels, ramp: str) -> Pixels:
    """`pixels` outlined on their four sides only, so thin strokes keep the gaps between them."""
    out: Pixels = {}
    for x, y in pixels:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in pixels:
                out[(x + dx, y + dy)] = (ramp, 0)
    out.update(pixels)
    return out


def code(name: str) -> Tuple[Image.Image, ...]:
    """A glyph in flight with a flickering streak behind it."""
    glyph = edged(shape(_GLYPHS[name], 'code'), 'code')
    left = min(x for x, _ in glyph)
    return tuple(picture(trail(4 if frame % 2 else 2, 'code', start=left - 1), glyph) for frame in range(4))


def keystroke() -> Tuple[Image.Image, ...]:
    """The muzzle: a key struck, a spark off the keyboard."""
    return (
        picture(outlined(shape('''
.4.
434
.4.
''', 'code'), 'code')),
        picture(shape('''
3...3
.....
..4..
.....
3...3
''', 'code')),
        picture(shape('''
2.....2
.......
.......
.......
2.....2
''', 'code')),
    )


# ── DESIGNER: paintballs ───────────────────────────────────────────────────────────────────────────
_BALL = '''
.322.
33342
22234
.222.
'''


def paintball(ramp: str) -> Tuple[Image.Image, ...]:
    """Terraria's paintball: a round glob, its shine turning as it tumbles, flicking drops behind."""
    shines = ((1, -1), (0, -1), (-1, 0), (0, 0))
    frames = []
    for index, (sx, sy) in enumerate(shines):
        ball = shape(_BALL, ramp)
        ball[(ORIGIN[0] + sx, ORIGIN[1] - 1 + sy)] = (ramp, 4)
        drops = {(ORIGIN[0] - 5 - index % 2, ORIGIN[1] + (index % 2)): (ramp, 2),
                 (ORIGIN[0] - 8 + index % 2, ORIGIN[1] - 1): (ramp, 1)}
        frames.append(picture(outlined(ball, ramp), drops))
    return tuple(frames)


def splat(ramp: str) -> Tuple[Image.Image, ...]:
    """The paint bursts on what it hits and flies off in drops."""
    first = outlined(shape('''
..2.2..
.23332.
2334332
.23432.
..222..
''', ramp), ramp)
    second = outlined(shape('''
2...2...2
.2.232.2.
..23332..
.2334332.
..23332..
.2.222.2.
2.......2
''', ramp), ramp)
    return (picture(first), picture(second), *(picture(motes(step, ramp, count=6, spin=0.5)) for step in range(2, 6)))


def notes() -> Tuple[Image.Image, ...]:
    """The muzzle: a note rising off the strings and fading."""
    note = '''
.44
.3.
.3.
33.
33.
'''
    return tuple(picture(outlined(shape(note, 'paint-pink', (ORIGIN[0], ORIGIN[1] - rise)), 'paint-pink'))
                 for rise in (0, 2, 4))


# ── STRATEGIST: sticky notes ───────────────────────────────────────────────────────────────────────
_NOTE_FLAT = '''
33332
33332
33332
22221
'''
_NOTE_TURNED = '''
..3..
.333.
33332
.322.
..2..
'''


def sticky() -> Tuple[Image.Image, ...]:
    """A note spun flat like a shuriken: square, turned, square, turned, with a white streak behind."""
    frames = []
    for index in range(4):
        body = outlined(shape(_NOTE_FLAT if index % 2 == 0 else _NOTE_TURNED, 'paper'), 'paper')
        streak = {(ORIGIN[0] - 5 - i, ORIGIN[1] - 1 + (index % 2)): ('paper', 4 if i < 2 else 3) for i in range(3)}
        frames.append(picture(streak, body))
    return tuple(frames)


def tear() -> Tuple[Image.Image, ...]:
    """The note slaps into its target and tears into scraps of paper."""
    slap = outlined(shape('''
.333.
34443
34443
.333.
''', 'paper'), 'paper')
    return (picture(slap), *(picture(motes(step, 'paper', count=5, spin=0.3)) for step in range(1, 6)))


def strips(hero: str) -> List[Strip]:
    """The hero's attack strip, its animations in the order spriteAttack takes turns with them."""
    def anim(name: str, fps: float, loop: bool, pictures: Sequence[Image.Image]) -> Strip:
        return Strip(name, fps, loop, tuple(pictures), {})

    if hero == 'hackerman':
        return [anim('projectile', 15, True, code('tag')), anim('impact', 20, False, burst('code')),
                anim('muzzle', 20, False, keystroke()),
                anim('projectile-braces', 15, True, code('braces')), anim('projectile-arrow', 15, True, code('arrow')),
                anim('projectile-semicolon', 15, True, code('semicolon'))]
    if hero == 'artsy':
        return [anim('projectile', 15, True, paintball('paint-pink')), anim('impact', 20, False, splat('paint-pink')),
                anim('muzzle', 15, False, notes()),
                anim('projectile-cyan', 15, True, paintball('paint-cyan')), anim('impact-cyan', 20, False, splat('paint-cyan')),
                anim('projectile-yellow', 15, True, paintball('paint-yellow')),
                anim('impact-yellow', 20, False, splat('paint-yellow'))]
    if hero == 'strategy':
        return [anim('projectile', 20, True, sticky()), anim('impact', 20, False, tear())]
    raise ValueError(f'no attack strip for {hero}')
