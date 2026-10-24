"""THE RECEIPT: a shopper in a raincoat, steam puffing, holding up a receipt as long as she is."""
from __future__ import annotations

from .art import Dye, art, full, tones
from .rig import Effect, Figure, Held, Pose, Prop, Worn

#                    01234567890123456789012345678901
HEAD = full('head', 13, '''
                     ..............KKKKK.............
                     ............KKsssssLK...........
                     ............KsssssssLK..........
                     ............KSssssssLK..........
                     ............KSsssssssK..........
                     ............KSsssssssK..........
                     ............KSsssssssK..........
                     ............KSSssssssLK.........
                     .............KSSsssssK..........
                     ..............KSSsssK...........
                     ...............KKKKK............
''', neck=(17, 23), mouth=(20, 21), crown=(15, 9))

FACES = {
    'rant': full('face ranting', 17, '''
                     .................OO.............
                     .................wi.............
                     .................wi.............
                     ................................
                     ...................MM...........
                     ...................q............
'''),
    'happy': full('face delighted', 16, '''
                     .................O..............
                     ................................
                     .................wi.............
                     .................wi.............
                     ................................
                     ..................ttt...........
                     ...................MM...........
'''),
}

# Big auburn curls: a crown of clumps, a curly fringe over the forehead, and a bob falling to the jaw behind.
HAIR = full('hair', 9, '''
                     ............OOOOOO..............
                     ..........OOdmlhlmOOO...........
                     .........OmlhmOdmlhlmO..........
                     ........OdmldmlmdmhmlmO.........
                     ........OmhmdlmhmdmlmdO.........
                     .......OdmldmOdmlOmdmlO.........
                     .......OmlmdO.OmdO.OdO..........
                     .......OdmhmO...O...............
                     ......OdmlmdmO..................
                     ......OmhmdmlO..................
                     ......OdmldmdO..................
                     ......OmdmlmdO..................
                     .......OmdmdO...................
                     ........OOOO....................
''')

COAT = full('raincoat', 22, '''
                     ...........##o#.....##..........
                     ..........#xo++#...#+#..........
                     ..........#xoo+#####+#..........
                     ..........#xooo+o6+o+#..........
                     ..........#xoooo+oo+*#..........
                     ..........#xoxooo+6+*#..........
                     ..........#xoooox+o+*#..........
                     ..........#xooxooo#+*#..........
                     ..........#xooooo+6+*#..........
                     .........#xoxooooo+o+*#.........
                     .........#xooxoooo+o+*#.........
                     .........#xoooooox+6+*#.........
                     .........#xxoxoxoxoxo+#.........
                     .........##############.........
''', neck=(17, 23), **{'near shoulder': (11, 22), 'far shoulder': (19, 23), 'hips': (16, 32)})

NECK = full('neck', 22, '''
                     ...............Ss...............
''')

LEGS = {
    # Tights under the coat and wellies, planted apart.
    'stand': art('legs in wellies', 10, 32, '''
                     ..#xo+##xo#.
                     ..#xo+##xo#.
                     ..#xo+##xo#.
                     .01223001230
                     .01223001230
                     .01112001120
                     .01111101110
                     .00000000000
'''),
}

NEAR_ARMS = {
    # Hanging with the shopping bag.
    'hang': art('near arm hanging', 9, 21, '''
                     ..##..
                     .#**#.
                     #o+*+#
                     #o++*#
                     #o+*+#
                     #o+*#.
                     #xox#.
                     KSSSSK
                     KsLsSK
                     KsssSK
                     .KKKK.
''', shoulder=(11, 22), hand=(12, 29)),
}

FAR_ARMS = {
    # Thrust up and forward, holding the receipt out for all to see.
    'thrust': art('far arm thrust up and forward', 19, 13, '''
                     ........KKK
                     .......KsLsK
                     ......#KsssK
                     .....#xKSSK.
                     ....#xo+KK..
                     ...#xo+#....
                     ..#xo+#.....
                     .#xo+#......
                     #xo+#.......
                     #xo#........
                     #xo#........
                     .##.........
''', shoulder=(19, 23), hand=(27, 15)),
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

# A receipt as long as she is, hanging from her fist in folds to a curl on the floor, printed in grey rows.
RECEIPT = Prop(art('long receipt', 25, 17, '''
                     .#22#.
                     .#31#.
                     .#23#.
                     .#13#.
                     .#32#.
                     #23#..
                     #31#..
                     #23#..
                     #13#..
                     .#32#.
                     .#23#.
                     .#31#.
                     .#23#.
                     #13#..
                     #32#..
                     #23#..
                     #31#..
                     .#23#.
                     .#13#.
                     .#32##
                     ..#333#
                     ...###.
''', legend=tones('receipt', '#123'), grip=(27, 15)))

# A paper bag with a leek poking out, its handle in her fist.
BAG = Prop(art('shopping bag', 7, 25, '''
                     ...66...
                     ...675..
                     ...675..
                     ..#1#...
                     .#1##1#.
                     #233332#
                     #2333320
                     #2333320
                     #2232320
                     #2333320
                     #2333320
                     .000000.
''', legend={**tones('kraft', '0123'), '#': ('kraft', 0), **tones('leek', '5678')}, grip=(12, 28)), layer='front')

# With the receipt folded away into it once she is happy.
BAG_FULL = Prop(art('shopping bag with the receipt', 7, 25, '''
                     ...66...
                     ...675#.
                     ...675r#
                     ..#1#rr.
                     .#1##1#.
                     #233332#
                     #2333320
                     #2333320
                     #2232320
                     #2333320
                     #2333320
                     .000000.
''', legend={
    **tones('kraft', '0123'), '#': ('kraft', 0), **tones('leek', '5678'), 'r': ('receipt', 3),
}, grip=(12, 28)), layer='front')

# Steam puffing off the top of her head in two plumes, each a puff on her curls growing into a cloud as it rises.
STEAM = Effect(art('steam', 0, 0, '''
                     ..00.000..............000.00..
                     .03303330............03330330.
                     .03333330............03333330.
                     .02333320............02333320.
                     ..000000000........000000000..
                     .......03330......03330.......
                     .......02320......02320.......
                     ........000.0....0.000........
                     ...........030..030...........
                     ............0....0............
''', legend=tones('steam', '0123'), crown=(15, 9)))

FIGURE = Figure(
    name='the receipt',
    legs=LEGS,
    legs_dye=Dye(cloth='tights', shoes='wellies'),
    torso=(Worn(COAT, Dye(cloth='raincoat', trim='toggle')), Worn(NECK)),
    head=HEAD,
    faces=FACES,
    headwear=(Worn(HAIR),),
    near_arms=NEAR_ARMS,
    far_arms=FAR_ARMS,
    sleeves=Dye(cloth='raincoat'),
    props={'receipt': RECEIPT, 'bag': BAG, 'bag with the receipt': BAG_FULL},
    effects={'steam': STEAM},
    hair='hair-curls',
    skin={'unhappy': 'skin-fuming', 'happy': 'skin-shopper'},
)

POSES = {
    'shout': Pose(
        mood='unhappy', face='rant', far='thrust', held=(Held('receipt', 'far'), Held('bag', 'near')),
        effects=('steam',),
    ),
    'happy': Pose(mood='happy', face='happy', far='thumbs up', held=(Held('bag with the receipt', 'near'),)),
}
