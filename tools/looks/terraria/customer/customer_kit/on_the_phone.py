"""ON THE PHONE: a middle manager, red to the scalp, yelling into a brick phone pressed to his ear and jabbing a
finger at you; won over, he holds the call away from his ear and gives you a thumbs up.

This is the concept (on_the_phone_concept.py, which the concepts board shows as it was judged) redrawn to be
animated: every layer the look's five customer animations pose him in (customer_kit/moves.py) is drawn here, with
short sleeves that bare his forearms, a tie that swings loose and a face shaded to keep its form when it flushes.
"""
from __future__ import annotations

from typing import Dict

from .art import Drawing, Dye, art, full, tones
from .rig import Effect, Figure, Loose, Prop, Worn
from . import dazed

#                    01234567890123456789012345678901
# A bald dome, its shine catching the light, over a face with a nose: the eyes sit halfway down, so the mouth
# has the room to open. The socket behind the eye and the jaw behind the mouth are shaded, so a flushed face
# still has its form.
HEAD = full('head', 12, '''
                     ..............KKKKK.............
                     ............KKssLLsKK...........
                     ............KsssLLsssK..........
                     ............KSsssLssssK.........
                     ............KSsssSssssK.........
                     ............KSsssSsssssK........
                     ............KSssssssssLK........
                     ............KSSssssssssK........
                     ............KSSsssssssK.........
                     ............KSSssSssssK.........
                     .............KSSsSSsssK.........
                     ..............KKKKKKKKK.........
''', neck=(17, 23), mouth=(21, 21), crown=(16, 12))

# The eyes, the brows (in the hair's tones) and the mouth, by expression. The mustache is drawn with every one.
FACES: Dict[str, Drawing] = {
    # The brow driven down onto the eye, and the mouth wide open under the mustache: teeth, throat and tongue.
    'rant': full('face ranting', 14, '''
                     .................OO.............
                     ...................OO...........
                     ..................wi............
                     ..................wi............
                     ................................
                     ...................dddO.........
                     ...................MttM.........
                     ...................MMMM.........
                     ...................MqqM.........
'''),
    # Between two words: the jaw half shut.
    'rant half': full('face ranting, jaw half shut', 14, '''
                     .................OO.............
                     ...................OO...........
                     ..................wi............
                     ..................wi............
                     ................................
                     ...................dddO.........
                     ...................MttM.........
                     ...................MMMM.........
'''),
    # Listening to the hold music, lips pressed in a frown.
    'grumble': full('face grumbling', 14, '''
                     .................OO.............
                     ...................OO...........
                     ..................wi............
                     ..................wi............
                     ................................
                     ...................dddO.........
                     ....................MM..........
                     ...................M..M.........
'''),
    # Hit: the eye squeezed shut and the mouth knocked into an O.
    'wince': full('face wincing', 14, '''
                     .................O..............
                     ..................O.............
                     ...................OO...........
                     ..................O.............
                     ................................
                     ...................dddO.........
                     ....................MM..........
                     ....................MM..........
'''),
    # Won over: the eye closed in a smile, the brow up and a grin as wide as the mustache.
    'happy': full('face delighted', 14, '''
                     ..................OO............
                     ................................
                     ...................O............
                     ..................O.O...........
                     ................................
                     ...................dddO.........
                     ..................MtttM.........
                     ...................MqqM.........
                     ....................MM..........
'''),
}

# Stunned, the lid drooping half over the eye as it rolls up out of sight and back, the brows flat and the jaw
# hanging slack, the tongue lolling out of its corner.
ROLL = {'up': 'ww', 'front': 'wi', 'back': 'iw'}
for _look, _eye in ROLL.items():
    FACES[f'dazed {_look}'] = art(f'face dazed, looking {_look}', 18, 14, f'''
                     OO...
                     .....
                     SS...
                     {_eye}...
                     .....
                     .dddO
                     ..MM.
                     ..Mq.
                     ...q.
''')

# Balding, so the flush climbs all the way up his scalp: a horseshoe of short dark hair from the temple, over
# the ear and round the back to the nape, in the heroes' clumps. It stops short of the brow, so the dome
# reads bald down to the ear.
HAIR = full('hair', 14, '''
                     ............OOOO................
                     ...........OdmlmO...............
                     ...........OmlO.................
                     ...........OdmO.................
                     ...........OmdO.................
                     ...........OdlO.................
                     ...........OmdO.................
                     ............OdO.................
                     .............O..................
''')

EAR = full('ear', 16, '''
                     ...............KL...............
                     ...............Ks...............
                     ...............KS...............
''')

# A pale blue short-sleeved office shirt, its collar points either side of the knot so his chin keeps its
# edge, pushed out over his belt by a paunch. The tie's blade hangs loose from the knot (TIE).
SHIRT = full('shirt', 22, '''
                     ...........#o+#......###........
                     ...........#xo+#....#+*#........
                     ...........#xoo+#*56*#+#........
                     ...........#xoo++#67#+*#........
                     ...........#xooo+oo+oo+*#.......
                     ...........#xooo+oo+ooo+*#......
                     ...........#xxoo+oo+oooo+#......
                     ...........#xooxooo+oooo+*#.....
                     ...........#xxoxoxoooxoo+#......
                     ..................#######.......
''', neck=(17, 23), knot=(19, 26), **{'near shoulder': (10, 22), 'far shoulder': (20, 23), 'hips': (16, 32)})

BELT = full('belt', 31, '''
                     ...........0001113..............
''', legend=tones('@shoes', '0123'))

NECK = full('neck', 22, '''
                     ...............Ss...............
''')

TIE_LEGEND = tones('@trim', '5678')

# A loud gold tie, its blade swinging behind his moves: hanging on his paunch, kicked out by a stomp, and
# flung up off his chest by a hit or a hop.
TIE = Loose('knot', {
    'rest': art('tie hanging', 18, 26, '''
                     576
                     576
                     576
                     .55
''', legend=TIE_LEGEND, knot=(19, 26)),
    'bounce': art('tie kicked out', 18, 26, '''
                     5776
                     .5776
                     ..55.
''', legend=TIE_LEGEND, knot=(19, 26)),
    'fly': art('tie flung up', 18, 24, '''
                     .....55
                     ...5775
                     5776...
''', legend=TIE_LEGEND, knot=(19, 26)),
}, Dye(trim='tie-gold'))

LEGS: Dict[str, Drawing] = {
    # Pressed slacks over black office shoes, planted wide.
    'stand': art('legs planted', 10, 32, '''
                     ..#xoo++o+#..
                     ..#xoo+#x+#..
                     ..#xo+#.#o+#.
                     ..#xo+#.#o+#.
                     ..#xo+#.#xo#.
                     .012321001230.
                     .0111110011110
                     .0000000000000
'''),
    # The walk, a heavy plod that keeps the foot he stands on planted while he moves over it: the far foot
    # strikes out ahead, takes his weight (the stomp), stands under his hips while the near foot passes it lifted,
    # and pushes off behind as the near foot swings through to strike; then the other way round.
    'far strike': art('legs: far foot striking', 8, 32, '''
                     ....#xoo++o+#....
                     ...#xo+#xxo#.....
                     ..#xo+#.#xxo#....
                     .#xo+#...#xxo#...
                     #xo+#.....#xxo#..
                     0123200...0122200
                     0111110...0111110
                     0000000...0000000
'''),
    'far down': art('legs: weight on the far foot', 7, 32, '''
                     .....#xoo++o+#..
                     ....#xo+#xxo#...
                     ...#xo+#.#xxo#..
                     ..#xo+#..#xxo#..
                     .#xo+#...#xxo#..
                     01210....0122200
                     .01110...0111110
                     ..0000...0000000
'''),
    'far pass': art('legs: near foot passing the far', 10, 32, '''
                     ..#xoo++o#
                     ..#xo+#o#.
                     .#xo+#xo#.
                     01210xxo#.
                     011110xo#.
                     .000002210
                     ...0111110
                     ...0000000
'''),
    'far push': art('legs: far foot pushing off', 11, 32, '''
                     .#xoo++o+#...
                     ..#xx#xo+#...
                     ..#xxo#xo+#..
                     .#xxo#.01300.
                     .#xxo#0111110
                     012221000000
                     0111110......
                     0000000......
'''),
    'near strike': art('legs: near foot striking', 8, 32, '''
                     ....#xoo++o+#....
                     ...#xxo#xo+#.....
                     ..#xxo#.#xo+#....
                     .#xxo#...#xo+#...
                     #xxo#.....#xo+#..
                     0122200...0123200
                     0111110...0111110
                     0000000...0000000
'''),
    'near down': art('legs: weight on the near foot', 7, 32, '''
                     .....#xoo++o+#..
                     ....#xxo#xo+#...
                     ...#xxo#.#xo+#..
                     ..#xxo#..#xo+#..
                     .#xxo#...#xo+#..
                     01110....0123200
                     .01110...0111110
                     ..0000...0000000
'''),
    'near pass': art('legs: far foot passing the near', 10, 32, '''
                     ..#xoo++o#
                     ..#x#xo+#.
                     .#xx#xo+#.
                     0111#xo+#.
                     0111#xo+#.
                     .000123210
                     ...0111110
                     ...0000000
'''),
    'near push': art('legs: near foot pushing off', 11, 32, '''
                     .#xoo++o+#...
                     ..#xo+#o#....
                     ..#xo+#xo#...
                     .#xo+#.01200.
                     .#xo+#0111110
                     012321000000
                     0111110......
                     0000000......
'''),
    # Knocked off his feet: both feet thrown out ahead of him, the front one higher.
    'knocked': art('legs: knocked off his feet', 7, 32, '''
                     .....#xoo++o+#......
                     .....#xoo####o##....
                     ....#xo+#....#xo##..
                     ....#xo+#.....01230.
                     ...#xo+#......011110
                     ...0123300....000000
                     ...0111110..........
                     ...0000000..........
'''),
    # Hopping for joy, a knee tucked up under him.
    'tuck far': art('legs: far knee tucked', 7, 32, '''
                     .....#xoo++o+#......
                     .....#xoo+##xo##....
                     .....#xo+#..#xoo##..
                     .....#xo+#...#xo0100
                     .....#xo+#....00110.
                     ....0123210....000..
                     ....0111110.........
                     ....0000000.........
'''),
    'tuck near': art('legs: near knee tucked', 7, 32, '''
                     .....#xoo++o+#......
                     ...##oo+##o+#.......
                     ..#xoo+#.#o+#.......
                     .#xo0120.#o+#.......
                     ..0011110#xo#.......
                     ...000000012300.....
                     ........0111110.....
                     ........0000000.....
'''),
}

# Each arm: a short sleeve, then the bare forearm and the hand in the hands' ramp.
NEAR_ARMS: Dict[str, Drawing] = {
    # The phone pressed to his ear, his elbow up behind his head, the forearm bare from the sleeve's hem.
    'phone': art('near arm holding the phone to his ear', 3, 16, '''
                     ..KKKKKKKKK...
                     .KsLLLLLLLsK..
                     .KSsssssssKKKK
                     ..KSSS#KKKsLLK
                     ...K#xo+#KsssK
                     ...#xo+#.KSSSK
                     ....#xo+#.KKK.
                     .....#o+#.....
                     ......##......
''', shoulder=(10, 22), hand=(14, 19)),
    # Knocked off his ear by a hit, the phone yanked out behind him at arm's length, the elbow straight.
    'phone flung': art('near arm flung back with the phone', 0, 16, '''
                     .KKK..........
                     KsLsK.........
                     KsssSKK.......
                     .KSSsLsKK.....
                     ..KKKSsLsK##..
                     .....KKSs#**#.
                     .......K#o+*+#
                     ........#xo+*#
                     .........####.
''', shoulder=(10, 22), hand=(2, 18)),
    # Won over, the call held out at arm's length: I'll call you back.
    'phone out': art('near arm holding the phone out', 2, 20, '''
                     .KKK......
                     KsLsKKK##.
                     KsssKso+*#
                     KSSsKxo+*#
                     .KKKK#xo+#
                     .....####.
''', shoulder=(10, 22), hand=(4, 22)),
    # Stunned, hanging, the phone gone slack in his fingers.
    'limp': art('near arm hanging limp', 7, 21, '''
                     ...##..
                     ..#**#.
                     .#o+*+#
                     .#xo+*#
                     ..#xx#.
                     .KsLK..
                     KSssK..
                     KsLsK..
                     KsssK..
                     .KKK...
''', shoulder=(10, 22), hand=(9, 28)),
    'hang': art('near arm hanging', 8, 21, '''
                     ..##..
                     .#**#.
                     #o+*+#
                     #xo+*#
                     .#xx#.
                     .KsLK.
                     KSssSK
                     KsLsSK
                     KsssSK
                     .KKKK.
''', shoulder=(10, 22), hand=(11, 28)),
}

FAR_ARMS: Dict[str, Drawing] = {
    # Thrust out at you, finger first.
    'point': art('far arm pointing', 19, 22, '''
                     .#*#...........
                     #+*+#KKKKKKKK..
                     #o++o#sLLLsLLKK
                     #xoox#SsssKKKK.
                     .####.KKKKK....
''', shoulder=(20, 23), hand=(28, 24)),
    # Halfway between the wag and the point, the elbow bent and the finger cocked up at you: a jab on its way.
    'jab': art('far arm jabbing', 19, 17, '''
                     ............K.
                     ...........KLK
                     ........KKKLK.
                     .......KsLssK.
                     ......KKsssSK.
                     .#*#.KsLKSSK..
                     #+*+#KssKKK...
                     #o++o#KK......
                     #xoox#........
                     .####.........
''', shoulder=(20, 23), hand=(29, 21)),
    # Pulled back between jabs, the finger wagging at you.
    'wag': art('far arm wagging a finger', 19, 15, '''
                     ......K..
                     .....KLK.
                     .....KsK.
                     ....KKsKK
                     ....KsLsK
                     ....KssSK
                     .....KSK.
                     .#*#.KsK.
                     #+*+#KsK.
                     #o++o#K..
                     #xoox#...
                     .####....
''', shoulder=(20, 23), hand=(25, 19)),
    # Thrown up by a hit, the hand open.
    'flung': art('far arm flung up', 19, 14, '''
                     ........KK.
                     .......KsLK
                     ......KssK.
                     .....KSsK..
                     ....KKSK...
                     ....#*K....
                     ...#+*#....
                     ..#o+*#....
                     .#oo+#.....
                     #xoo+#.....
                     #xox#......
                     .###.......
''', shoulder=(20, 23), hand=(27, 15)),
    # Stunned, hanging forward off the shoulder, the hand dangling.
    'limp': art('far arm hanging limp', 19, 22, '''
                     .#*#....
                     #+*+#...
                     #o++o#..
                     #xoo+#..
                     .#xo#K..
                     ..KKsK..
                     ...KsK..
                     ...KsLK.
                     ...KssK.
                     ....KK..
''', shoulder=(20, 23), hand=(24, 30)),
    # Bounced up on a hop.
    'thumbs high': art('far arm thumbs up, raised', 19, 16, '''
                     ..........K..
                     .........KLK.
                     .........KsK.
                     ........KKsKK
                     ........KssLK
                     ........KsssK
                     ........KSSsK
                     .#*#.....KKK.
                     #+*+#..KK....
                     #o++o#KsK....
                     #xoox#SK.....
                     .####KK......
''', shoulder=(20, 23), hand=(29, 21)),
    # Held out in front of his chest, clear of his face: a fist, and the thumb up out of it.
    'thumbs up': art('far arm thumbs up', 19, 19, '''
                     ..........K..
                     .........KLK.
                     .........KsK.
                     .#*#KKKKKKsKK
                     #+*+#sLLKssLK
                     #o++#ssSKsssK
                     #xox#SSSKSSsK
                     .###.KKK.KKK.
''', shoulder=(20, 23), hand=(29, 24)),
}

PHONE_LEGEND = tones('phone', '012345')

# A 1996 brick phone in light grey, its display lit green and its antenna up, his hand round its middle.
PHONE = Prop(art('brick phone', 13, 8, '''
                     0...
                     0...
                     0...
                     0000
                     0330
                     0450
                     0440
                     0230
                     0320
                     0230
                     0210
                     0120
                     0210
                     0120
                     0210
                     0110
                     0000
''', legend=PHONE_LEGEND, grip=(14, 19)))

# Jolted off his ear, his fist round its middle, clear of whatever the game shows over his head.
PHONE_FLUNG = Prop(PHONE.drawing._replace(name='brick phone yanked off his ear', points=(('grip', (14, 16)),)))
# Slack in a limp hand, hanging upside down at his side: the fingers gone loose round its middle, behind the
# hand, its antenna pointing at the ground and its light still from above. Its lower end swings on the hand, a pixel behind his
# sway, so the brick hangs heavy.
DANGLING = art('brick phone hanging upside down', 13, 8, '''
                     0000
                     0330
                     0120
                     0210
                     0120
                     0210
                     0120
                     0230
                     0320
                     0230
                     0440
                     0540
                     0230
                     0000
                     0...
                     0...
                     0...
''', legend=PHONE_LEGEND, grip=(16, 14))
# The rows the hand closes over and above stay put as the rest swings.
DANGLING_PIVOT = 15
PHONE_DANGLING = {
    'phone dangling': Prop(DANGLING),
    'phone swinging ahead': Prop(DANGLING.swung(DANGLING_PIVOT, 1)._replace(name='brick phone swinging ahead')),
    'phone swinging back': Prop(DANGLING.swung(DANGLING_PIVOT, -1)._replace(name='brick phone swinging back')),
}

# Terraria's anger emote: a vein popping in four arcs round a cross. Terraria draws it in a white bubble, so
# floating free over a busy street its arcs take their dark red on the outside, the red and orange within. It
# floats up behind his head, clear of the phone's antenna as he lunges.
VEIN = Effect(art('anger vein', -3, 5, '''
                     ...02..20...
                     ...01..10...
                     .011....110.
                     012......210
                     ............
                     012......210
                     .011....110.
                     ...01..10...
                     ...02..20...
''', legend=tones('anger', '012'), crown=(16, 12)))

# Between yells, the emote shrinks back: it pulses.
VEIN_SMALL = Effect(art('anger vein, pulsing', -1, 6, '''
                     ..0..0..
                     .01..10.
                     01....10
                     ........
                     01....10
                     .01..10.
                     ..0..0..
''', legend=tones('anger', '012'), crown=(16, 12)))

FIGURE = Figure(
    name='on the phone',
    legs=LEGS,
    legs_dye=Dye(cloth='slacks-grey', shoes='oxfords'),
    torso=(
        Worn(SHIRT, Dye(cloth='shirt-blue', trim='tie-gold')),
        Worn(NECK),
        Worn(BELT, Dye(shoes='oxfords')),
    ),
    head=HEAD,
    faces=FACES,
    headwear=(Worn(HAIR), Worn(EAR)),
    near_arms=NEAR_ARMS,
    far_arms=FAR_ARMS,
    sleeves=Dye(cloth='shirt-blue'),
    props={'phone': PHONE, 'phone flung': PHONE_FLUNG, **PHONE_DANGLING},
    effects={'vein': VEIN, 'vein small': VEIN_SMALL, **dazed.STARS},
    hair='hair-office',
    skin={'unhappy': 'skin-fuming', 'happy': 'skin-office'},
    hands={'unhappy': 'hands-office-warm', 'happy': 'skin-office'},
    loose=(TIE,),
)
