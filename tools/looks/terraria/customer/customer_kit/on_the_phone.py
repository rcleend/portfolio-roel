"""ON THE PHONE: an office worker, red to the ears, shouting into a brick phone held up on speaker."""
from __future__ import annotations

from .art import Dye, art, full, tones
from .rig import Effect, Figure, Held, Pose, Prop, Worn

#                    01234567890123456789012345678901
# A bald dome a row taller than the heroes' heads, its shine catching the light; the jaw a little heavier.
HEAD = full('head', 12, '''
                     ..............KKKKK.............
                     ............KKssLLsK............
                     ............KsssLsssK...........
                     ............KsssssssLK..........
                     ............KSssssssLK..........
                     ............KSsssssssK..........
                     ............KSsssssssK..........
                     ............KSsssssssK..........
                     ............KSSssssssLK.........
                     ............KSSsssssssK.........
                     .............KSSssssssK.........
                     ..............KKKKKKKK..........
''', neck=(17, 23), mouth=(21, 22), crown=(16, 12))

FACES = {
    'rant': full('face ranting', 16, '''
                     ...............OO...............
                     .................OO.............
                     .................wi.............
                     .................wi.............
                     ................................
                     ..................dddO..........
                     ..................MMq...........
'''),
    'happy': full('face delighted', 16, '''
                     ................OO..............
                     ................................
                     .................wi.............
                     .................wi.............
                     ................................
                     ..................dddO..........
                     ..................ttt...........
'''),
}

# Balding, so the flush climbs all the way up his scalp: a horseshoe of short dark hair round the back and
# the sides, a sideburn down to the ear.
HAIR = full('hair', 13, '''
                     ............OO..................
                     ...........OdmO.................
                     ...........OmlmO................
                     ...........OdmhmO...............
                     ...........OmdmlO...............
                     ...........OdmOdO...............
                     ...........OmdO.O...............
                     ...........OdO..................
                     ............O...................
''')

EAR = full('ear', 18, '''
                     ............KLs.................
                     ............KsS.................
                     ............KS..................
''')

SHIRT = full('shirt and tie', 22, '''
                     ...........#o#....#+#...........
                     ...........#oo#..#+5#...........
                     ...........#xoo#5776#...........
                     ...........#xooo+576#...........
                     ...........#xoooo576+#..........
                     ...........#xoxoo576+#..........
                     ...........#xooox576+#..........
                     ...........#xoooo#5o+#..........
                     ...........#xxoxoxoo#...........
''', neck=(17, 23), **{'near shoulder': (10, 22), 'far shoulder': (19, 23), 'hips': (16, 32)})

BELT = full('belt', 31, '''
                     ...........0111111130...........
''', legend=tones('@shoes', '0123'))

NECK = full('neck', 22, '''
                     ...............Ss...............
''')

LEGS = {
    'stand': art('legs planted', 10, 32, '''
                     ..#xo++#+#..
                     ..#xoo+#+#..
                     ..#xxo+#+#..
                     .#xxoo+#+o#.
                     .#xoo+##xo#.
                     .01223001230
                     .01111101110
                     .00000000000
'''),
}

NEAR_ARMS = {
    # A fist on the hip, the elbow out behind him: the manager will hear about this.
    'hip': art('near arm on the hip', 6, 21, '''
                     ....##.
                     ...#**#
                     ..#o+*#
                     .#o+*#.
                     #o+*#..
                     #o+*#..
                     #xo+#..
                     .#xo+#.
                     ..#xoKK
                     ...KsLK
                     ...KSSK
                     ....KK.
''', shoulder=(10, 22), hand=(10, 30)),
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
    # The phone held up in front of his mouth, to shout into it on speaker.
    'phone': art('far arm holding up the phone', 17, 20, '''
                     .....KKK.
                     .....KsLK
                     ....#KssK
                     #xo+x#KSK
                     #xo+o#.K.
                     .#xo#....
                     ..##.....
''', shoulder=(19, 23), hand=(23, 21)),
    # Out in front at the shoulder, fist closed and thumb up.
    'thumbs up': art('far arm thumbs up', 17, 19, '''
                     .......K...
                     ......KLK..
                     ......KsK..
                     .....KKsSK.
                     #xo+##KssSK
                     #xo++oKsSSK
                     .#xo+xKSSK.
                     ..####.KK..
''', shoulder=(19, 23), hand=(24, 23)),
}

# A 1996 brick phone, its display lit, held by its foot.
PHONE = Prop(art('brick phone', 22, 11, '''
                     ...0
                     ...0
                     0000
                     0230
                     0450
                     0540
                     0230
                     0320
                     0230
                     0000
''', legend=tones('phone', '012345'), grip=(23, 21)))

# Lowered to his side once the call is over, his fingers round it and the antenna up.
PHONE_DOWN = Prop(art('brick phone in the hand', 10, 25, '''
                     ...0
                     ...0
                     0000
                     0230
                     KsLK
                     KssK
                     0320
                     0000
''', legend={**tones('phone', '012345'), **tones('@skin', 'KSsL')}, grip=(11, 29)), layer='front')

# The cross-popping vein of Terraria's anger emote, over the brow.
VEIN = Effect(art('anger vein', 20, 6, '''
                     .0..0.
                     012.21
                     ......
                     012.21
                     .0..0.
''', legend=tones('anger', '012'), crown=(21, 12)))

FIGURE = Figure(
    name='on the phone',
    legs=LEGS,
    legs_dye=Dye(cloth='slacks', shoes='loafers'),
    torso=(
        Worn(SHIRT, Dye(cloth='shirt-blue', trim='tie')),
        Worn(NECK),
        Worn(BELT, Dye(shoes='loafers')),
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
)

POSES = {
    'shout': Pose(
        mood='unhappy', face='rant', near='hip', far='phone', held=(Held('phone', 'far'),), effects=('vein',),
    ),
    'happy': Pose(mood='happy', face='happy', near='hang', far='thumbs up', held=(Held('phone down', 'near'),)),
}
