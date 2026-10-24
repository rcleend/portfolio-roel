"""ON THE PHONE as the judges chose it: a middle manager, red to the scalp, yelling into a brick phone pressed to his
ear and jabbing a finger at you; won over, he lowers the phone and gives you a thumbs up.

These are the concept's drawings as the concepts board shows them, kept as they were judged so the board still
compares the three concepts like for like. The look's customer is this man redrawn for animation, in
on_the_phone.py; change him there, never here.
"""
from __future__ import annotations

from .art import Dye, art, full, tones
from .rig import Effect, Figure, Held, Pose, Prop, Worn

#                    01234567890123456789012345678901
# A bald dome, its shine catching the light, over a face with a nose: the eyes sit halfway down, so the mouth
# has the room to open.
HEAD = full('head', 12, '''
                     ..............KKKKK.............
                     ............KKssLLsKK...........
                     ............KsssLLsssK..........
                     ............KSsssLssssK.........
                     ............KSssssssssK.........
                     ............KSsssssssssK........
                     ............KSssssssssLK........
                     ............KSSssssssssK........
                     ............KSSsssssssK.........
                     ............KSSsssssssK.........
                     .............KSSssssssK.........
                     ..............KKKKKKKKK.........
''', neck=(17, 23), mouth=(21, 21), crown=(16, 12))

FACES = {
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
    # The brow lifted, and a grin from under the mustache.
    'happy': full('face delighted', 14, '''
                     .................OOO............
                     ................................
                     ..................wi............
                     ..................wi............
                     ................................
                     ...................dddO.........
                     ..................MtttM.........
                     ...................MMM..........
'''),
}

# Balding, so the flush climbs all the way up his scalp: a horseshoe of short dark hair from the temple, over
# the ear and round the back to the nape, in the heroes' clumps.
HAIR = full('hair', 14, '''
                     ............OOOOO...............
                     ...........OdmlmdO..............
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

# A pale blue office shirt, its collar points either side of the knot so his chin keeps its edge, the tie
# lying on a paunch that pushes the shirt out over his belt.
SHIRT = full('shirt and tie', 22, '''
                     ...........#o+#......#*#........
                     ...........#xo+#....#+*#........
                     ...........#xoo+#*56*#+#........
                     ...........#xoo++#67#+*#........
                     ...........#xooo+o576o+*#.......
                     ...........#xooo+o576oo+*#......
                     ...........#xxoo+o576ooo+#......
                     ...........#xooxoo#55#oo+*#.....
                     ...........#xxoxoxoooxoo+#......
                     ..................#######.......
''', neck=(17, 23), **{'near shoulder': (10, 22), 'far shoulder': (20, 23), 'hips': (16, 32)})

BELT = full('belt', 31, '''
                     ...........0111113..............
''', legend=tones('@shoes', '0123'))

NECK = full('neck', 22, '''
                     ...............Ss...............
''')

LEGS = {
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
}

NEAR_ARMS = {
    # The phone pressed to his ear, his elbow up behind his head.
    'phone': art('near arm holding the phone to his ear', 3, 16, '''
                     ..###.........
                     .#xo+####KKKK.
                     .#xo+***#KsLLK
                     .#xoo++*#KsssK
                     ..#xoo+##KSSSK
                     ...#xo+#..KKK.
                     ....#xo+#.....
                     .....#o+#.....
                     ......##......
''', shoulder=(10, 22), hand=(14, 19)),
    'hang': art('near arm hanging', 8, 21, '''
                     ..##..
                     .#**#.
                     #o+*+#
                     #o++*#
                     #o+*#.
                     #xox#.
                     KSSSSK
                     KsLsSK
                     KsssSK
                     .KKKK.
''', shoulder=(10, 22), hand=(11, 28)),
}

FAR_ARMS = {
    # Thrust out at you, finger first.
    'point': art('far arm pointing', 19, 22, '''
                     .#*#..........
                     #+*+###KKKKKK.
                     #o++o+#KsLLLLK
                     #xooxo#KSsKKK.
                     .#####.KKK....
''', shoulder=(20, 23), hand=(28, 24)),
    # Held out in front of his chest, clear of his face: a fist, and the thumb up out of it.
    'thumbs up': art('far arm thumbs up', 19, 19, '''
                     ..........K..
                     .........KLK.
                     .........KsK.
                     .#*#####KKsKK
                     #+*++*+#KssLK
                     #o++o+o#KsssK
                     #xooxox#KSSsK
                     .######..KKK.
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

# Lowered to his side once the call is over, his fingers round it and the antenna up.
PHONE_DOWN = Prop(art('brick phone in the hand', 10, 23, '''
                     0...
                     0...
                     0000
                     0330
                     0450
                     KsLK
                     KssK
                     0210
                     0000
''', legend={**PHONE_LEGEND, **tones('@skin', 'KSsL')}, grip=(11, 29)), layer='front')

# Terraria's anger emote: a vein popping in four arcs round a cross. Terraria draws it in a white bubble, so
# floating free over a busy street its arcs take their dark red on the outside, the red and orange within.
VEIN = Effect(art('anger vein', 18, 1, '''
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
    props={'phone': PHONE, 'phone down': PHONE_DOWN},
    effects={'vein': VEIN},
    hair='hair-office',
    skin={'unhappy': 'skin-fuming', 'happy': 'skin-office'},
    hands={'unhappy': 'hands-office-warm', 'happy': 'skin-office'},
)

POSES = {
    'shout': Pose(
        mood='unhappy', face='rant', near='phone', far='point', held=(Held('phone', 'near'),), effects=('vein',),
    ),
    'happy': Pose(mood='happy', face='happy', near='hang', far='thumbs up', held=(Held('phone down', 'near'),)),
}
