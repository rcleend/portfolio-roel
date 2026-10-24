"""Arms and legs, one drawing per pose, the way Terraria draws its player's limbs frame by frame.

Measured from Terraria 1.4's own player sheets and drawn at about 5/4 of their art-pixel size (Terraria
stands 23 art pixels tall, these 30):
- The body is turned a little toward the viewer, so the near limbs sit at the back and the far ones peek
  out in front. Standing, the near arm hangs over the back of the torso from a shoulder beside the jaw
  and only the far hand shows, where the torso steps in at the waist; the near leg is the wide one at
  the back and the far leg a lit sliver ahead of it.
- An arm is a sleeve, a pixel fuller at the shoulder than below, ending in a ribbed cuff and a hand a
  pixel wider than the sleeve, outlined all round. A foot is the leg's last rows: its toe a pixel ahead
  of the shin on the sole row, its heel a pixel behind the calf.

Each drawing is placed where it sits on the standing body, so a pose only names its limbs; the body's
bob then carries the arms. Every near arm covers the near shoulder and every far arm the far one, and
every pair of legs both hips, so a limb always joins the body where the standing one does.
"""
from __future__ import annotations

from typing import Dict, NamedTuple

from .art import Art, Point, art

NEAR_SHOULDER: Point = (10, 22)
FAR_SHOULDER: Point = (19, 23)
HIPS = ((14, 32), (18, 32))


class Arm(NamedTuple):
    """An arm in one pose, and the middle of its hand, where it holds things."""
    art: Art
    hand: Point


# ── Legs ───────────────────────────────────────────────────────────────────────────────────────────
# Trousers in cloth tones and shoes in digits, the near leg drawn over the far one.
LEGS: Dict[str, Art] = {
    'stand': art('legs standing', 11, 32, '''
                     .#xo++#+#.
                     .#xoo+#+#.
                     .#xxo+#+#.
                     #xxoo+#+#.
                     012233030.
                     011223030.
                     0444444040
                     0000000000
'''),
    # Terraria's walk, frames 7 to 19 of its leg sheet. Its body bobs a pixel up on the first three frames of
    # each stride, and the legs stretch a row higher to meet it.
    # The near foot planted behind, the far foot lifted under the hip.
    'stride lift': art('legs: stride, far foot lifted', 7, 31, '''
                     .....#xo++x+#.....
                     .....#xoo+xo+#....
                     ....#xxo++#xo+#...
                     ....#xo++#01230...
                     ...#xxoo+#01120...
                     ...0122330044440..
                     ...0112230000000..
                     ...04444440.......
                     ...00000000.......
'''),
    # The far foot swinging forward a row off the ground.
    'stride swing': art('legs: stride, far foot swinging', 7, 31, '''
                     .....#xo++x+#.....
                     .....#xoo+xo+#....
                     ....#xxo+##xx+#...
                     ....#xo++##xxo+#..
                     ...#xxo+#.012330..
                     ...012330.011230..
                     ...011230.0444440.
                     ...04444400000000.
                     ...0000000........
'''),
    # Both feet down, the widest stance.
    'stride wide': art('legs: stride, wide', 7, 31, '''
                     .....#xo++xo+#....
                     ....#xxoo+xoo+#...
                     ....#xxo+##xx+#...
                     ...#xoo++##xo++#..
                     ..#xxoo+#..#xxo+#.
                     ..0122330..012330.
                     ..0112230..011230.
                     ..04444440.0444440
                     ..00000000.0000000
'''),
    # Closing, the body back down.
    'stride close': art('legs: stride, closing', 7, 32, '''
                     .....#xo++x+#.....
                     .....#xoo+xo+#....
                     ....#xxo++#x+#....
                     ...#xxoo+##xo+#...
                     ...012233001230...
                     ...011223001120...
                     ...0444444044440..
                     ...0000000000000..
'''),
    # Passing: the legs together, a pixel forward.
    'pass': art('legs: passing', 7, 32, '''
                     ......#xo++#......
                     ......#xoo+#......
                     ......#xxo+#......
                     .....#xxoo+#......
                     .....0122330......
                     .....0112230......
                     .....04444440.....
                     .....00000000.....
'''),
    # Crossing: the near leg now in front, the far one a sliver behind it.
    'cross': art('legs: crossing', 7, 32, '''
                     .....#x#xo++#.....
                     .....#x#xoo+#.....
                     .....#x#xxo+#.....
                     ....#x#xxoo+#.....
                     ....010122330.....
                     ....010112230.....
                     ....0404444440....
                     ....0000000000....
'''),
    # The near foot lifted and swinging forward, the far one planted behind.
    'step lift': art('legs: step, near foot lifted', 7, 31, '''
                     ....#xo+xo++#.....
                     ....#xo+xoo+#.....
                     ....#xx#xxo++#....
                     ...#xo+#xxoo+#....
                     ...#xxo0122330....
                     ...01230112230....
                     ...011204444440...
                     ...044400000000...
                     ...0000000........
'''),
    # The near foot reaching forward a row off the ground.
    'step swing': art('legs: step, near foot swinging', 7, 31, '''
                     ....#xo+xo++#.....
                     ....#xo+#xoo+#....
                     ...#xxo+#xxo++#...
                     ...#xo+#.#xxoo+#..
                     ..#xxo+#.0122330..
                     ..012330.0112230..
                     ..011230.04444440.
                     ..044444000000000.
                     ..0000000.........
'''),
    # Both feet down, the near one in front.
    'step wide': art('legs: step, wide', 7, 31, '''
                     ....#xo+xo++#.....
                     ...#xoo+#xoo+#....
                     ...#xx+##xxo+#....
                     ..#xo++#.#xo++#...
                     .#xxo+#...#xxo+#..
                     .012330...012330..
                     .011230...011230..
                     .0444440..0444440.
                     .0000000..0000000.
'''),
    # Closing, the body back down.
    'step close': art('legs: step, closing', 7, 32, '''
                     .....#x+xo++#.....
                     ....#xo+xxoo+#....
                     ...##xx+#xxo+#....
                     ..#xxo+##xxoo+#...
                     ..0123300122330...
                     ..0112300112230...
                     ..04444404444440..
                     ..00000000000000..
'''),
    # Terraria's one airborne frame, for every jump and fall: the near leg back, the far one forward.
    'split': art('legs: split', 7, 32, '''
                     .....#xo++xo+#......
                     ....#xoo+##xo+#.....
                     ...##xxo+#.#xx+##...
                     ..#xxo+##...#xxo+#..
                     ..012330....012330..
                     ..011230....011230..
                     ..0444440...0444440.
                     ..0000000...0000000.
'''),
}

# ── Far arm ────────────────────────────────────────────────────────────────────────────────────────
# Behind the torso, so standing only its hand's front pixel and outline show at the waist; each is drawn
# whole from the shoulder, so a swing brings out exactly as much of it as clears the torso.
FAR_ARMS: Dict[str, Arm] = {
    'hang': Arm(art('far arm hanging', 17, 23, '''
                     #xo+#.
                     #xo+#.
                     #xo+#.
                     #xo+#.
                     #xo+#.
                     #xox#.
                     ..KSSK
                     ..KsSK
                     ..KsSK
                     ...KK.
'''), (21, 30)),
    # Terraria's back-arm cells for the walk: the far hand swings out in front of the torso and back
    # behind it, a pixel at a time, always opposite the near hand.
    'walk out': Arm(art('far arm walking, out in front', 17, 23, '''
                     #xo+#..
                     .#xo+#.
                     .#xo+#.
                     ..#xo+#
                     ..#xox#
                     ..KSSSK
                     ..KsLSK
                     ..KsssK
                     ...KKK.
'''), (22, 28)),
    'walk': Arm(art('far arm walking', 17, 23, '''
                     #xo+#.
                     #xo+#.
                     .#xo+#
                     .#xo+#
                     .#xo+#
                     .#xox#
                     ..KSSK
                     ..KsSK
                     ..KsSK
                     ...KK.
'''), (21, 29)),
    'walk in': Arm(art('far arm walking, tucked in', 17, 23, '''
                     #xo+#.
                     #xo+#.
                     #xo+#.
                     #xo+#.
                     #xo+#.
                     #xox#.
                     .KSSK.
                     .KsSK.
                     .KsSK.
                     ..KK..
'''), (20, 30)),
    'walk behind': Arm(art('far arm walking, behind', 16, 23, '''
                     ..#xo+#
                     ..#xo+#
                     .#xo+#.
                     .#xo+#.
                     .#xo+#.
                     .#xox#.
                     .KSSK..
                     .KsSK..
                     .KsSK..
                     ..KK...
'''), (19, 30)),
    # Reaching forward to grip a prop in front of the chest (the guitar's neck): the sleeve stays behind
    # the torso and the hand is drawn over the prop (props.FRET_HAND), so only the sleeve is drawn here.
    'grip': Arm(art('far arm gripping', 17, 23, '''
                     #xo+#.
                     #xo+#.
                     .#xo+#
                     .#xox#
                     ..###.
'''), (21, 24)),
    # Raised up and forward, the jump's far arm: behind the head, only the sleeve along the face and the
    # hand in front of the quiff clear it, as Terraria's back arm does.
    'up': Arm(art('far arm raised', 19, 11, '''
                     ....KKKK.
                     ...KsLLsK
                     ...KssssK
                     ...KSssSK
                     ...#xoxo#
                     ...#xo+#.
                     ...#xo+#.
                     ..#xo+#..
                     ..#xo+#..
                     .#xo+#...
                     .#xo+#...
                     #xo+#....
                     #xo+#....
'''), (24, 13)),
}

# ── Near arm ───────────────────────────────────────────────────────────────────────────────────────
# Standing, every hero wears his own sleeve (outfits.py); these are the other poses, in a cut every
# outfit shares.
NEAR_ARMS: Dict[str, Arm] = {
    # Terraria's front-arm cells for the walk: bent at the elbow with the forearm toward the viewer, so the
    # fist sits at the elbow's front, and swung a pixel at a time from the back to the front.
    'walk back': Arm(art('near arm walking, back', 5, 21, '''
                     .....##....
                     ....#**#...
                     ...#o+*+#..
                     ...#o++*#..
                     ..#o+*#....
                     .#o+*#KKKK.
                     .#o+*sLLsK.
                     .#o+*sssSK.
                     .#xoxSSSSK.
                     ..###KKKK..
'''), (11, 28)),
    'walk': Arm(art('near arm walking', 6, 21, '''
                     ....##.....
                     ...#**#....
                     ..#o+*+#...
                     ..#o++*#...
                     .#o+*#.....
                     .#o+*KKKK..
                     .#o+*sLLsK.
                     .#o+*sssSK.
                     .#xoxSSSSK.
                     ..###KKKK..
'''), (12, 28)),
    'walk forward': Arm(art('near arm walking, forward', 7, 21, '''
                     ...##......
                     ..#**#.....
                     .#o+*+#....
                     .#o++*#....
                     .#o+*#.....
                     .#o+*KKKK..
                     .#o+*sLLsK.
                     .#o+*sssSK.
                     .#xoxSSSSK.
                     ..###KKKK..
'''), (13, 28)),
    'walk front': Arm(art('near arm walking, in front', 8, 21, '''
                     ..##.......
                     .#**#......
                     #o+*+#.....
                     #o++*#.....
                     .#o+*#.....
                     .#o+*KKKK..
                     .#o+*sLLsK.
                     .#o+*sssSK.
                     .#xoxSSSSK.
                     ..###KKKK..
'''), (14, 28)),
    # Terraria's swing, its item-use frames 1 to 4: straight up past the back of the head (also the jump's
    # near arm), up and forward over the face, straight out at the shoulder, and down and forward.
    'up': Arm(art('near arm raised', 4, 10, '''
                     .KKKK....
                     KsLLsK...
                     KssssK...
                     KSssSK...
                     #xoxo#...
                     #o+*#....
                     #o+*#....
                     .#o+*#...
                     .#o++#...
                     ..#o+*#..
                     ..#o++*#.
                     ...#o+*+#
                     ....#**#.
                     .....##..
'''), (7, 12)),
    'reach': Arm(art('near arm reaching up', 8, 10, '''
                     .........KKKK.
                     ........KsLLsK
                     ........KssssK
                     .......#xSssSK
                     ......#xox#KK.
                     .....#o+*#....
                     ....#o+*#.....
                     ...#o+*#......
                     ..#o+*#.......
                     .#o+*+#.......
                     .#o++*#.......
                     .#o+*+#.......
                     ..#**#........
                     ...##.........
'''), (18, 12)),
    'forward': Arm(art('near arm forward', 8, 21, '''
                     ..##............
                     .#**########....
                     #o+*+***++*xKKK.
                     #o++*+++++oxsLsK
                     #o+*#######SssSK
                     .###.......KSSSK
                     ............KKK.
'''), (20, 24)),
    'down': Arm(art('near arm down and forward', 8, 21, '''
                     ..##.......
                     .#**#......
                     #o+*+#.....
                     #o++*+#....
                     .#o+*+*#...
                     ..#o+*+*#..
                     ...#o+*o#..
                     ....#xoxKK.
                     .....#KsLsK
                     .....KsssSK
                     .....KSSSSK
                     ......KKKK.
'''), (13, 30)),
    # Typing on the summoned keyboard: the arm out at the shoulder with the hand on the keys, near its front
    # or nearer the body, and the same a pixel lower as a key goes down.
    'type': Arm(art('near arm typing', 8, 21, '''
                     ..##............
                     .#**########....
                     #o+*+***++*xKKK.
                     #o++*+++++oxsLsK
                     #o+*#######SssSK
                     .###.......KSSSK
                     ............KKK.
'''), (20, 25)),
    'type close': Arm(art('near arm typing close', 8, 21, '''
                     ..##.........
                     .#**#####....
                     #o+*+*++xKKK.
                     #o++*++oxsLsK
                     #o+*####SssSK
                     .###....KSSSK
                     .........KKK.
'''), (17, 25)),
    # Strumming the Strat: the arm down and forward with the hand over the strings, high for the upstroke,
    # low through the downstroke.
    'strum high': Arm(art('near arm strumming high', 8, 21, '''
                     ..##.......
                     .#**#......
                     #o+*+#.....
                     #o++*+#....
                     .#o+*+*#...
                     ..#o+*xKKK.
                     ...#xoKsLsK
                     ....#KsssSK
                     .....KSSSSK
                     ......KKKK.
'''), (16, 28)),
    'strum low': Arm(art('near arm strumming low', 8, 21, '''
                     ..##........
                     .#**#.......
                     #o+*+#......
                     #o++*+#.....
                     .#o+*+*#....
                     ..#o+*+*#...
                     ...#o+*+*#..
                     ....#o+*o#..
                     .....#xoxKK.
                     ......#KsLsK
                     ......KsssSK
                     ......KSSSSK
                     .......KKKK.
'''), (17, 31)),
}
