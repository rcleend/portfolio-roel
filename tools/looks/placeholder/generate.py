"""Placeholder sheets in the look format (docs/LOOKS.md), for checking that the game lays out and
draws 64 x 64 heroes and customers and 24 x 24 icons correctly. NOT a look: nothing registers these.

    python3 tools/looks/placeholder/generate.py   # writes tools/looks/placeholder/fixture/

To eyeball them in the game, copy a sheet into a look folder with an index module (docs/LOOKS.md),
look, and delete it again; never commit them as a look.

Every frame is a flat, outlined mannequin 58 px tall with its feet on the origin, numbered by a row of
frame pips, and its anchors marked in pure yellow so their placement can be checked on screen.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).parent / 'fixture'
INK, BODY, SHADE, SKIN, LENS, MARK, PIP = (
    (18, 14, 36, 255), (63, 143, 220, 255), (34, 82, 150, 255), (240, 194, 154, 255),
    (10, 10, 16, 255), (255, 255, 0, 255), (255, 80, 160, 255),
)

HERO = [('idle', 8, True, 4), ('run', 12, True, 6), ('jump', 8, False, 2), ('fall', 8, True, 2),
        ('attack', 15, False, 4), ('skill', 10, False, 4), ('hurt', 8, False, 2), ('victory', 6, True, 4)]
CUSTOMER = [('walk', 8, True, 4), ('shout', 8, False, 2), ('hurt', 8, False, 2), ('stunned', 6, True, 2),
            ('happy', 6, True, 2)]


def mannequin(draw, frame, body, arm_dx, arm_dy, lift):
    """A 58 px figure on a 64 x 64 frame, feet on y = 63, centred on x = 32."""
    top = 6 - lift
    draw.ellipse((24, top, 39, top + 15), fill=SKIN, outline=INK)                  # head
    draw.rectangle((25, top + 6, 30, top + 9), outline=LENS)                       # glasses
    draw.rectangle((33, top + 6, 38, top + 9), outline=LENS)
    draw.rectangle((23, top + 16, 40, top + 38), fill=body, outline=INK)           # torso
    draw.rectangle((24, top + 39, 30, 63 - lift), fill=SHADE, outline=INK)         # legs
    draw.rectangle((33, top + 39, 39, 63 - lift), fill=SHADE, outline=INK)
    hand = (41 + arm_dx, top + 20 + arm_dy)
    draw.line((40, top + 18, hand[0], hand[1]), fill=INK, width=3)                 # front arm
    for pip in range(frame + 1):                                                   # frame number
        draw.point((2 + pip * 2, 2), fill=PIP)
    return hand


def sheet(name, animations, anchors_for):
    width = max(frames for *_, frames in animations) * 64
    image = Image.new('RGBA', (width, 64 * len(animations)), (0, 0, 0, 0))
    spec = {'frame': {'w': 64, 'h': 64}, 'origin': {'x': 32, 'y': 64}, 'animations': []}
    for row, (animation, fps, loop, frames) in enumerate(animations):
        anchors = {}
        for frame in range(frames):
            cell = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
            draw = ImageDraw.Draw(cell)
            swing = (frame % 2) * 4
            lift = 4 if animation in ('jump', 'victory') and frame % 2 else 0
            body = (220, 60, 60, 255) if animation in ('hurt', 'shout') else BODY
            hand = mannequin(draw, frame, body, 8 + swing if animation == 'attack' else swing, -6 if animation in ('skill', 'victory') else 6, lift)
            for anchor in anchors_for(animation):
                draw.point(hand, fill=MARK)
                anchors.setdefault(anchor, []).append(list(hand))
            image.paste(cell, (frame * 64, row * 64))
        entry = {'name': animation, 'fps': fps, 'loop': loop, 'frames': frames}
        if anchors:
            entry['anchors'] = anchors
        spec['animations'].append(entry)
    save(name, image, spec)


def icon():
    image = Image.new('RGBA', (48, 24), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for frame in range(2):
        x = frame * 24
        draw.rectangle((x + 1, 1, x + 22, 22), fill=BODY, outline=INK)
        draw.rectangle((x + 6, 6, x + 17, 17), fill=SKIN if frame else MARK, outline=INK)
    save('icon', image, {'frame': {'w': 24, 'h': 24}, 'origin': {'x': 0, 'y': 0},
                         'animations': [{'name': 'idle', 'fps': 3, 'loop': True, 'frames': 2}]})


def attack():
    image = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for frame in range(2):
        draw.rectangle((frame * 16 + 3, 5, frame * 16 + 12, 10), fill=MARK if frame else PIP, outline=INK)
    for frame in range(4):
        radius = 2 + frame * 2
        draw.ellipse((frame * 16 + 8 - radius, 24 - radius, frame * 16 + 8 + radius, 24 + radius), outline=MARK)
    save('attack', image, {'frame': {'w': 16, 'h': 16}, 'origin': {'x': 8, 'y': 8}, 'animations': [
        {'name': 'projectile', 'fps': 12, 'loop': True, 'frames': 2},
        {'name': 'impact', 'fps': 15, 'loop': False, 'frames': 4}]})


def save(name, image, spec):
    OUT.mkdir(exist_ok=True)
    image.save(OUT / f'{name}.png')
    (OUT / f'{name}.json').write_text(json.dumps(spec, indent=2) + '\n')


if __name__ == '__main__':
    sheet('hero', HERO, lambda animation: {'attack': ['muzzle'], 'skill': ['hand']}.get(animation, []))
    sheet('customer', CUSTOMER, lambda animation: [])
    icon()
    attack()
    print(f'wrote {OUT}')
