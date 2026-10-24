"""The heroes' props, drawn in Terraria's item style: chunky, few tones, each outlined in its own darkest.

None of them is ever carried: they appear only for an attack or a skill, the way Terraria shows an item
only while it is used. Each is placed where its pose holds it, in design space.
"""
from __future__ import annotations

from typing import Dict, Optional, Tuple

from .art import BODY, Art, Point, art, tones

# ── ENGINEER: a summoned keyboard ────────────────────────────────────────────────────────────────
KEYS = tones('keyboard', '#xokEgGW')
# A chunky mechanical keyboard as a Terraria item draws one, flat and outlined: three staggered rows of
# two-pixel keycaps with a space bar and a tall Enter, the dark front of its case, and the green underglow
# along its foot.
_KEYBOARD = '''
.###########.
#EEoEEoEEoEE#
#oEEoEEoEoEE#
#EEoEEEEEoEE#
#xxxxxxxxxxx#
.#gGgGgGgGg#.
'''
KEYBOARD_AT: Point = (14, 26)
# Where the glyphs leave: the keyboard's front corner, on its keys.
KEYBOARD_FRONT: Point = (26, 26)
# The keys that light up, the ones the hands leave in view: each as the rows it spans, its first column and
# its width.
_KEYS: Dict[str, Tuple[Tuple[int, ...], int, int]] = {
    'alt': ((3,), 1, 2),
    'space': ((3,), 4, 5),
    'enter': ((2, 3), 10, 2),
}


def keyboard(lit: Optional[str] = None, fading: Optional[str] = None) -> Art:
    """The keyboard in front of him at chest height, with the key just struck lit and the one before it
    still glowing as it fades."""
    rows = _KEYBOARD.strip('\n').split('\n')
    for key, tone in ((fading, 'G'), (lit, 'W')):
        if key is None:
            continue
        spans, start, width = _KEYS[key]
        for row in spans:
            if set(rows[row][start:start + width]) != {'E'}:
                raise ValueError(f'keyboard: {key} is not a keycap at row {row}')
            rows[row] = rows[row][:start] + tone * width + rows[row][start + width:]
    name = 'keyboard' + (f', {lit} lit' if lit else '') + (f', {fading} fading' if fading else '')
    return art(name, *KEYBOARD_AT, '\n'.join(rows), KEYS)


# Summoned: green motes wink at its corners on the frame it appears.
SUMMONED = art('keyboard summoned', 12, 24, '''
.W.............W.
W.G...........G.W
.................
.................
.................
.................
.................
..G...........G..
.W.............W.
''', KEYS)

# The far hand on the keys, a shade darker than the near one, typing on the keyboard's front half.
TYPE_HAND = art('far hand on the keys', 21, 24, '''
.KKK.
KSsSK
KSSSK
.KKK.
''', BODY)

# The Enter key struck hard: a burst of green off the keyboard's front.
KEY_BURST = art('key burst', 21, 23, '''
...W....
.W.G..W.
..GWWG..
WGWWWWGW
''', KEYS)

# ── DESIGNER: the white Stratocaster ─────────────────────────────────────────────────────────────
STRAT = {**tones('strat', '#xoL'), **tones('pickguard', '@P'), **tones('rosewood', 'Ff'),
         **tones('maple', 'Mmn'), **tones('chrome', 'Ccw')}
# Held the way Terraria holds its guitars, the whole instrument along one diagonal: the body low across the
# hips with its two horns pointing up the neck, the maple neck rising past the chest, edged by its rosewood
# board, to the six-in-line headstock ahead of the chin. A mint pickguard with white pickups and a chrome
# bridge mark it a Stratocaster; it is small enough that both legs still show below and behind it.
GUITAR = art('stratocaster', 12, 16, '''
           .................MM
           ................MwM
           ...............MnwM
           ..............MnnM.
           .............MnmF..
           ............MnmF...
           ...........MnmF....
           ..........MnmF.....
           .....##..MnmF......
           ....#Lo#MnmF.......
           ...#LooMnmF##......
           ..#Lo@PmFoLo#......
           .#Lo@wP@ooL#.......
           #Lo@PwP@oo#........
           #oo@@Pw@ox#........
           #ooo@Ccox#.........
           #ooooxCx#..........
           #xoooox#...........
           .#xxxx#............
           ..####.............
''', STRAT)
# Where the strum rings out, over the pickups, and where its paint leaves, up the neck past the fretting hand.
STRINGS: Point = (17, 29)
NECK: Point = (26, 21)

# The far hand on the neck, gripping it in front of the chest while its sleeve stays behind the torso.
FRET_HAND = art('far hand on the neck', 22, 22, '''
.KKK.
KsLsK
KsssK
.KKK.
''', BODY)

# A Terraria healing potion, the pink of the UX ELIXIR flask, tipped up out of the fist so its neck is at his
# lips; held, so the fist closes over its neck.
POTION = art('potion', 22, 15, '''
...###
..#LWo#
.#Looo#
.#ooox#
.Mxxx#.
MM##...
''', {**tones('paint-pink', '#xoLW'), **tones('maple', 'M')})

# ── STRATEGIST: the North Star ───────────────────────────────────────────────────────────────────
# The North Star's glint in the raised hand: a four-pointed Terraria star.
GLINT = tones('flash', 'WLY')


def glint(at: Point, big: bool) -> Art:
    rows = '''
..W..
..L..
WLYLW
..L..
..W..
''' if big else '''
.W.
WYW
.W.
'''
    half = 2 if big else 1
    return art('glint', at[0] - half, at[1] - half, rows, GLINT)
