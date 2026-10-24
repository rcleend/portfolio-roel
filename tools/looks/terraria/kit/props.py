"""The heroes' props, drawn in Terraria's item style: chunky, few tones, each outlined in its own darkest.

None of them is ever carried: they appear only for an attack or a skill, the way Terraria shows an item
only while it is used. Each is placed where its pose holds it, in design space.
"""
from __future__ import annotations

from typing import Optional

from .art import BODY, Art, Point, art, tones

# ── ENGINEER: a summoned keyboard ────────────────────────────────────────────────────────────────
KEYS = tones('keyboard', '#xokEgGW')
# Two-pixel keycaps over a dark case, the green underglow along its lower edge.
_KEYBOARD = '''
.##############.
#EkEEkEEkEEkEEk#
#kkkkkkkkkkkkkk#
#oooooooooooooo#
#gGgGgGgGgGgGgG#
.##############.
'''
KEYBOARD_AT: Point = (12, 26)
# Where the glyphs leave: the keyboard's front corner, on its keys.
KEYBOARD_FRONT: Point = (27, 26)


def keyboard(lit: Optional[int] = None) -> Art:
    """The keyboard in front of him at chest height; `lit` lights the key that many keys from the back."""
    rows = _KEYBOARD.strip('\n').split('\n')
    if lit is not None:
        start = 2 + 3 * lit
        rows[1] = rows[1][:start] + 'WW' + rows[1][start + 2:]
    return art('keyboard' if lit is None else f'keyboard, key {lit} lit', *KEYBOARD_AT, '\n'.join(rows), KEYS)


# The Enter key struck hard: a burst of green off the keyboard's front.
KEY_BURST = art('key burst', 22, 22, '''
...W....
.W.G..W.
..GWWG..
WGWWWWGW
''', KEYS)

# ── DESIGNER: the white Stratocaster ─────────────────────────────────────────────────────────────
STRAT = {**tones('strat', '#xoL'), **tones('pickguard', '@P'), **tones('rosewood', 'Ff'),
         **tones('maple', 'Mmn'), **tones('chrome', 'Ccw')}
# Slung across the hips with the neck up and forward past his face, the way Terraria holds its guitars:
# a double-cutaway body whose lower horn shows past the strumming hand, the mint pickguard with its
# pickups and the chrome bridge, a rosewood board on the maple neck, and the long six-in-line headstock.
GUITAR = art('stratocaster', 9, 21, '''
           ...................####
           .................##nnn#
           ...............##nnmm#.
           .............##FFmm##..
           ...........##FFmm##....
           .........##FFmm##......
           ...###.##FFmm##........
           ..#oLo#FFmm##.##.......
           .#ooo@PFm##.#oL#.......
           #ooo@PPPP@##oo#........
           #xoo@PwPwP@ooL#........
           #xoo@@PPP@@ooL#........
           #xooo@CcCc@ooo#........
           .#xoooooooooo#.........
           ..#xxxooooxx#..........
           ...##########..........
''', STRAT)
# Where the strum rings out, over the pickups, and where its paint leaves, up the neck by the fretting hand.
STRINGS: Point = (16, 32)
NECK: Point = (25, 25)

# The far hand on the neck, gripping it in front of the chest while its sleeve stays behind the torso.
FRET_HAND = art('far hand on the neck', 20, 24, '''
.KKK.
KsLsK
KsssK
.KKK.
''', BODY)

# ── STRATEGIST: sticky notes ─────────────────────────────────────────────────────────────────────
NOTE_TONES = tones('note', '#xoL')
_NOTE = '''
#####
#LLo#
#ooo#
#xxx#
#####
'''


def note(at: Point) -> Art:
    """A sticky note pinched in the hand whose middle is `at`."""
    return art('sticky note', at[0] - 2, at[1] - 3, _NOTE, NOTE_TONES)


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
