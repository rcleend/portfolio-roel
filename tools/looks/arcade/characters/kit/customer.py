"""The Unhappy Customer: a caricature of exasperation, built on the same rig as the heroes.

Older, shorter and rounder than Roel: a sunburnt bald dome with a grey
comb-over, bushy brows, a bristling moustache, a pot belly under a pale blue
short-sleeved shirt and a loud tie, khakis, loafers, and a phone he waves like
a warrant. Fury reads as a red face; once won over he calms to a normal
skin tone and skips off with a thumbs up.

The comb-over is the running gag: it lifts off his scalp when he is hit and
flops while he is dizzy.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Dict, List, Mapping, Optional, Tuple

from . import palette as P
from .compose import Part
from .grid import Grid, Point
from .hands import OrientedHands
from .heroes.common import fill, ramp_keys, shoes
from .heroes.moves import Anim, leg
from .raster import outline_outside
from .rig import Attachment, Limb, LimbStyle, Material, Outfit, Pose, Posed, Skeleton, TorsoKit, Vec

GROUND = 59

# ── Head: fill rows, pivot = under the jaw. a/b/c skin (hi/light/mid), k/K shadow/line, N nose,
#    g/G grey hair, B brows, M/m moustache, w eye white, e pupil, t teeth, o mouth, r tongue, V vein, p blush. ──
HEAD_PIVOT = (7, 16)
HEAD_BASE = (
    "......aaaa.....",
    "....aaabbbbc...",
    "...abbbbbbbbc..",
    "..abGGGbbbbbbc.",
    ".gbbbbGGGGbbbc.",
    ".ggbbbbbbbbbbbc",
    "gggbBBbbbbbBBbc",
    "ggbbbbBBbbBBbbc",
    "gSsbbwebbwebNNc",
    "gSkSbbbbbbbNNNN",
    ".gSkbbbbbbmNNNc",
    ".gSSbbbmMMMMMMc",
    "..SSbbMMMMMMMMm",
    "..kSSbKtttttKc.",
    "...kSSbbbbbbcc.",
    "....kkSSSSScc..",
)

HEAD_EXPRESSIONS: Mapping[str, Mapping[Point, str]] = {
    # Walking: jaw clenched under the moustache, brows hammered into a V.
    "angry": {},
    # Mid-rant: brows up in outrage, mouth a wide open hole, a vein throbbing on the dome.
    "shout": {
        (4, 5): "B", (5, 5): "B", (11, 5): "B", (12, 5): "B", (4, 6): "b", (5, 6): "B", (12, 6): "B",
        (5, 13): "o", (6, 13): "t", (7, 13): "t", (8, 13): "t", (9, 13): "t", (10, 13): "t", (11, 13): "o",
        (5, 14): "o", (6, 14): "o", (7, 14): "o", (8, 14): "r", (9, 14): "r", (10, 14): "o", (11, 14): "c",
        (6, 15): "o", (7, 15): "o", (8, 15): "o", (9, 15): "o", (10, 15): "c",
        (8, 1): "V", (9, 2): "V", (8, 3): "V", (9, 3): "V",
    },
    # Hit: eyes squeezed into chevrons, mouth an "O", the comb-over flung straight up off the scalp.
    "hurt": {
        (5, 8): "K", (6, 8): "b", (9, 8): "b", (10, 8): "K", (5, 7): "b", (6, 7): "K", (9, 7): "K", (10, 7): "b",
        (4, 3): "b", (5, 3): "b", (6, 3): "b", (6, 4): "b", (7, 4): "b", (8, 4): "b", (9, 4): "b",
        (4, -1): "G", (5, -2): "G", (6, -3): "G", (7, -2): "G", (8, -3): "G", (5, -1): "G", (7, -1): "G",
        (6, 13): "K", (7, 13): "o", (8, 13): "o", (9, 13): "o", (10, 13): "K", (11, 13): "b",
        (7, 14): "o", (8, 14): "r", (9, 14): "o",
    },
    # Dizzy: spiral eyes, brows gone slack, tongue lolling out of a wobbly grin.
    "dizzy": {
        (4, 6): "b", (5, 6): "b", (11, 6): "b", (12, 6): "b", (4, 7): "B", (5, 7): "B", (6, 7): "B", (7, 7): "b",
        (10, 7): "B", (11, 7): "B", (12, 7): "B",
        (4, 8): "w", (5, 8): "e", (6, 8): "w", (9, 8): "w", (10, 8): "e", (11, 8): "w",
        (5, 9): "w", (10, 9): "w",
        (6, 13): "K", (7, 13): "o", (8, 13): "o", (9, 13): "o", (10, 13): "o", (11, 13): "K",
        (8, 14): "r", (9, 14): "r", (9, 15): "r",
    },
    # Won over: eyes shut in bliss, cheeks pink, the moustache riding up on a huge grin.
    "happy": {
        (4, 6): "b", (5, 6): "b", (12, 6): "b", (6, 7): "b", (7, 7): "b", (10, 7): "b", (11, 7): "b",
        (5, 7): "B", (4, 7): "B", (12, 7): "B", (13, 7): "B",
        (5, 8): "K", (6, 8): "b", (4, 8): "b", (9, 8): "b", (10, 8): "K", (11, 8): "b",
        (5, 7): "K", (6, 7): "B", (10, 7): "K", (11, 7): "B",
        (4, 9): "p", (5, 9): "p", (10, 9): "p",
        (5, 13): "K", (6, 13): "t", (7, 13): "t", (8, 13): "t", (9, 13): "t", (10, 13): "t", (11, 13): "K",
        (6, 14): "o", (7, 14): "o", (8, 14): "r", (9, 14): "r", (10, 14): "o",
    },
}


def _head_palette(skin: P.Ramp) -> Dict[str, str]:
    return {
        "a": skin.hi,
        "b": skin.light,
        "c": skin.mid,
        "s": skin.light,
        "S": skin.mid,
        "k": skin.shadow,
        "K": skin.line,
        "N": skin.mid,
        "V": skin.line,
        "g": P.GREY_HAIR.mid,
        "G": P.GREY_HAIR.light,
        "B": P.GREY_HAIR.hi,
        "M": P.GREY_HAIR.light,
        "m": P.GREY_HAIR.mid,
        "e": "#1d1420",
        "w": P.WHITE,
        "p": "#ff9fb8",
        "y": P.WHITE,
        "o": "#3a0f19",
        "t": P.TEETH,
        "r": P.TONGUE,
    }


def head(expression: str) -> Grid:
    cells = {(x, y): k for y, row in enumerate(HEAD_BASE) for x, k in enumerate(row) if k != "."}
    cells.update(HEAD_EXPRESSIONS[expression])
    return Grid.from_cells(outline_outside(cells), HEAD_PIVOT)


# ── Torso: pale blue short-sleeved shirt over a proud belly, loud tie, belt. ──
TORSO_FILL = """
....wWWw.......
...bwTTwb......
..abbbTbbbc....
.abbbbTTbbbc...
abbabbTTbbbbc..
bbbbbbTTbbabbc.
bbbbbbbTTbbbbcc
cbbbbbbTTbbbbcc
cbbbbbbbTbbbccd
.cbbbbbbbbbccd.
..cccbbbbcccd..
...xxxxxxxyx...
"""
TORSO_PIVOT = (6, 11)
TORSO_PALETTE: Dict[str, str] = dict(ramp_keys(P.CUSTOMER_SHIRT))
TORSO_PALETTE.update(
    {
        "w": P.CUSTOMER_SHIRT.hi,
        "W": P.WHITE,
        "T": P.TIE.light,
        "x": "#3b2618",
        "y": P.BUCKLE,
    }
)


def _torso(lean: int) -> Grid:
    from .skew import skew_rows

    g = Grid.parse(TORSO_FILL, TORSO_PIVOT)
    if lean:
        g = skew_rows(g, step=(5 if abs(lean) == 1 else 3) * (1 if lean > 0 else -1), pivot_y=TORSO_PIVOT[1])
    return Grid.from_cells(outline_outside(dict(g.cells)), g.pivot)


def _kit(lean: int) -> TorsoKit:
    return TorsoKit(
        _torso(lean),
        neck=(1 + lean, -11),
        near_shoulder=(-4 + lean, -9),
        far_shoulder=(4 + lean, -9),
        near_hip=(-2, 0),
        far_hip=(2, 0),
    )


TORSOS: Mapping[str, TorsoKit] = {
    "stand": _kit(0),
    "lean1": _kit(1),
    "lean2": _kit(2),
    "back1": _kit(-1),
    "back2": _kit(-2),
}

# Short sleeves: cloth keys A-D over a skin limb.
SLEEVE: Tuple[Tuple[str, str], ...] = (
    ("A", P.CUSTOMER_SHIRT.hi),
    ("B", P.CUSTOMER_SHIRT.light),
    ("C", P.CUSTOMER_SHIRT.mid),
    ("D", P.CUSTOMER_SHIRT.shadow),
)


def _arm(skin: P.Ramp, group: str, darker: bool) -> Material:
    tones = (skin.light, skin.mid, skin.shadow, skin.line) if darker else (skin.hi, skin.light, skin.mid, skin.shadow)
    return Material(*tones, skin.line, group, extra=SLEEVE)


def _cloth(ramp: P.Ramp, group: str, darker: bool) -> Material:
    tones = (ramp.light, ramp.mid, ramp.shadow, ramp.line) if darker else (ramp.hi, ramp.light, ramp.mid, ramp.shadow)
    return Material(*tones, ramp.line, group)


SKELETON = Skeleton(upper_arm=7.0, forearm=6.5, thigh=9.0, shin=8.5)


def outfit(calm: bool) -> Outfit:
    skin = P.CALM_SKIN if calm else P.FURIOUS_SKIN
    heads = {
        name: Attachment(head(name), _head_palette(skin), skin.line, "c", "head") for name in HEAD_EXPRESSIONS
    }
    hands_palette = {"a": skin.hi, "b": skin.light, "c": skin.mid, "d": skin.shadow}
    return Outfit(
        name="unhappy-customer",
        torsos=TORSOS,
        torso_palette=TORSO_PALETTE,
        torso_line=P.CUSTOMER_SHIRT.line,
        torso_demote="d",
        torso_group="shirt",
        sleeve=_arm(skin, "arm_near", False),
        sleeve_style=LimbStyle(3.0, 2.6, 2.5, sleeve=3.5),
        far_sleeve=_arm(skin, "arm_far", True),
        trousers=_cloth(P.KHAKI, "khaki", False),
        far_trousers=_cloth(P.KHAKI, "khaki_far", True),
        leg_style=LimbStyle(4.0, 3.4, 3.1, cuff=1.0),
        hands=OrientedHands(hands_palette, skin.line),
        feet=shoes(P.LOAFER, "#2a1810", leather=True),
        heads=heads,
        skeleton=SKELETON,
    )


ANGRY = outfit(calm=False)
CALM = outfit(calm=True)

# ── The phone he waves: side on while he rants, face on (five stars) once he is happy. ──
PHONE = fill(
    """
    dd
    bd
    ad
    bd
    bd
    dd
    """,
    (0, 5),
)
PHONE_REVIEW = fill(
    """
    ddddd
    dbbbd
    dyyyd
    dbbbd
    dbbbd
    ddddd
    """,
    (2, 5),
)
PHONE_PALETTE = {"a": P.PHONE.hi, "b": P.PHONE.light, "c": P.PHONE.mid, "d": P.PHONE.shadow, "y": "#ffd23f"}


def _phone(grid: Grid, at: Vec) -> Part:
    return Part(grid, (int(at[0]), int(at[1])), PHONE_PALETTE, P.PHONE.line, "d", group="phone", name="phone")


def phone_in_far_hand(layer: str = "far_arm", review: bool = False):
    """The phone gripped in the far hand, held up where the head does not hide it."""

    def factory(posed: Posed) -> Optional[Part]:
        x, y = posed.far_wrist
        return _phone(PHONE_REVIEW if review else PHONE, (x + (0 if review else 1), y - 1))

    return (layer, factory)


# ── Animations ──
# The front corner of the mouth relative to the head pivot: where complaint bubbles leave.
MOUTH = (4, -3)


def _pose(
    hip: Vec,
    near_foot: Tuple[Vec, str],
    far_foot: Tuple[Vec, str],
    near_arm: Limb,
    far_arm: Limb,
    head: str,
    torso: str = "lean1",
    head_offset: Tuple[int, int] = (0, 0),
    extras: Tuple = (),
) -> Pose:
    return Pose(
        hip=hip,
        near_arm=near_arm,
        far_arm=far_arm,
        near_leg=leg(near_foot[0], near_foot[1]),
        far_leg=leg(far_foot[0], far_foot[1]),
        torso=torso,
        head=head,
        head_offset=head_offset,
        extras=extras,
    )


def _arm(end: Vec, tip: str, joint: Optional[Vec] = None, bend: int = -1) -> Limb:
    return Limb(end=end, bend=bend, tip=tip, joint=joint)


# Walk: an indignant stomp, 8 frames at 8 fps. An accusing finger jabs on every step and the phone
# is brandished overhead. Frame 1 doubles as his standing pose (the game holds it while he waits at
# shouting distance), so it plants both feet.
_WALK = (
    # hip, near foot, far foot, finger (elbow, wrist), phone (elbow, wrist), head bob, torso
    ((31, 42), ((38, GROUND), "heel"), ((25, 57), "toe"), ((33, 38), (41, 36)), ((40, 28), (45, 21)), 0, "lean2"),
    ((31, 43), ((35, GROUND), "flat"), ((27, GROUND), "flat"), ((33, 39), (40, 38)), ((40, 29), (45, 22)), 1, "lean1"),
    ((31, 42), ((32, GROUND), "flat"), ((29, 55), "toe"), ((32, 39), (38, 39)), ((40, 28), (44, 21)), 1, "lean1"),
    ((31, 41), ((28, 57), "toe"), ((35, 56), "toe"), ((31, 39), (36, 38)), ((40, 27), (44, 20)), 0, "lean1"),
    ((31, 42), ((25, 57), "toe"), ((38, GROUND), "heel"), ((33, 38), (41, 36)), ((40, 28), (45, 21)), 0, "lean2"),
    ((31, 43), ((27, GROUND), "flat"), ((35, GROUND), "flat"), ((33, 39), (40, 38)), ((40, 29), (45, 22)), 1, "lean1"),
    ((31, 42), ((29, 55), "toe"), ((32, GROUND), "flat"), ((32, 39), (38, 39)), ((40, 28), (44, 21)), 1, "lean1"),
    ((31, 41), ((35, 56), "toe"), ((28, 57), "toe"), ((31, 39), (36, 38)), ((40, 27), (44, 20)), 0, "lean1"),
)


def walk() -> Anim:
    poses = []
    for hip, near, far, (ne, nw), (fe, fw), bob, torso in _WALK:
        poses.append(
            _pose(
                hip,
                near,
                far,
                _arm(nw, "point@0", ne),
                _arm(fw, "grip@290", fe, bend=1),
                "angry",
                torso=torso,
                head_offset=(1, bob),
                extras=(phone_in_far_hand(),),
            )
        )
    return Anim("walk", 8, True, poses)


def shout() -> Anim:
    """Leaning in, finger jabbing, phone shaken overhead: 4 frames at 8 fps, looped through the wind-up."""
    frames = (
        ((32, 42), (44, 35), (46, 19), (1, 0)),
        ((32, 42), (45, 34), (47, 18), (2, 0)),
        ((33, 43), (44, 36), (46, 20), (1, 1)),
        ((32, 42), (45, 35), (47, 19), (2, 0)),
    )
    poses = []
    mouths = []
    for hip, finger, phone, hoff in frames:
        pose = _pose(
            hip,
            ((27, GROUND), "flat"),
            ((37, GROUND), "flat"),
            _arm(finger, "point@0", (finger[0] - 7, finger[1] + 3)),
            _arm(phone, "grip@290", (phone[0] - 5, phone[1] + 7), bend=1),
            "shout",
            torso="lean2",
            head_offset=hoff,
            extras=(phone_in_far_hand(),),
        )
        poses.append(pose)
        from .rig import resolve

        posed = resolve(pose, ANGRY)
        mouths.append((int(posed.head_at[0]) + MOUTH[0] + 1, int(posed.head_at[1]) + MOUTH[1]))
    return Anim("shout", 8, True, poses, {"mouth": mouths})


def hurt() -> Anim:
    """Rocked back, comb-over airborne: 3 frames at 14 fps (0.21 s; the game holds hurt for 0.22 s)."""
    frames = (
        ((29, 42), ((33, 57), "toe"), ((36, GROUND), "flat"), ((23, 32), (18, 29)), ((39, 29), (44, 24)), "back2", (-2, -1)),
        ((28, 43), ((32, 57), "toe"), ((36, GROUND), "flat"), ((22, 33), (17, 30)), ((39, 29), (45, 23)), "back2", (-2, 0)),
        ((30, 42), ((30, GROUND), "flat"), ((35, GROUND), "flat"), ((25, 35), (23, 39)), ((38, 31), (42, 28)), "back1", (-1, 0)),
    )
    poses = []
    for hip, near, far, (ne, nw), (fe, fw), torso, hoff in frames:
        poses.append(
            _pose(hip, near, far, _arm(nw, "open", ne), _arm(fw, "open", fe, bend=1), "hurt", torso=torso, head_offset=hoff,
                  extras=(phone_in_far_hand(),))
        )
    return Anim("hurt", 14, False, poses)


# Stars that orbit a dizzy head, in head-relative offsets per frame.
_STAR = fill(
    """
    .a.
    aba
    .a.
    """,
    (1, 1),
)
_STAR_PALETTE = {"a": "#ffd23f", "b": P.WHITE}


def _stars(phase: int):
    orbit = ((-8, -18), (-3, -21), (3, -21), (8, -18), (3, -16), (-3, -16))

    def factory(posed: Posed) -> Optional[Part]:
        cells: Dict[Point, str] = {}
        hx, hy = posed.head_at
        for k in range(3):
            ox, oy = orbit[(phase + k * 2) % len(orbit)]
            for (x, y), key in _STAR.cells.items():
                cells[(int(hx) + ox + x - _STAR.pivot[0], int(hy) + oy + y - _STAR.pivot[1])] = key
        return Part(Grid.from_cells(cells), (0, 0), {**_STAR_PALETTE, "o": "#5a3a0a"}, "#5a3a0a", "a", name="stars")

    return ("top", factory)


def stunned() -> Anim:
    """Seeing stars: a loose, swaying daze, 6 frames at 8 fps, looped for the whole stun."""
    sway = (-1, 0, 1, 1, 0, -1)
    poses = []
    for i, dx in enumerate(sway):
        hip = (31 + dx, 43)
        poses.append(
            _pose(
                hip,
                ((28, GROUND), "flat"),
                ((35, GROUND), "flat"),
                _arm((25 + dx, 43), "relax", (25 + dx, 36)),
                _arm((39 + dx, 43), "relax", (39 + dx, 36)),
                "dizzy",
                torso="back1" if dx < 0 else ("lean1" if dx > 0 else "stand"),
                head_offset=(dx, 0),
                extras=(phone_in_far_hand(), _stars(i)),
            )
        )
    return Anim("stunned", 8, True, poses)


def happy() -> Anim:
    """Won over: a delighted skip with a thumbs up, calm colours. Loops while he strolls off."""
    frames = (
        ((31, 42), ((34, GROUND), "flat"), ((27, 57), "toe"), 0),
        ((31, 40), ((33, 58), "toe"), ((29, 55), "toe"), -1),
        ((31, 38), ((34, 56), "toe"), ((30, 53), "toe"), -1),
        ((31, 40), ((33, 58), "toe"), ((29, 56), "toe"), 0),
        ((31, 42), ((28, 57), "toe"), ((35, GROUND), "flat"), 0),
        ((31, 40), ((29, 55), "toe"), ((34, 58), "toe"), -1),
        ((31, 38), ((30, 53), "toe"), ((35, 56), "toe"), -1),
        ((31, 40), ((29, 56), "toe"), ((34, 58), "toe"), 0),
    )
    poses = []
    for hip, near, far, bob in frames:
        hx, hy = hip
        poses.append(
            _pose(
                hip,
                near,
                far,
                Limb(end=(hx + 11, hy - 7), bend=-1, tip="thumbup", joint=(hx + 5, hy - 4)),
                Limb(end=(hx + 14, hy - 21), bend=1, tip="grip@290", joint=(hx + 9, hy - 14)),
                "happy",
                torso="stand",
                head_offset=(0, bob),
                extras=(phone_in_far_hand(review=True),),
            )
        )
    return Anim("happy", 10, True, poses)


def animations() -> List[Tuple[Anim, Outfit]]:
    return [(walk(), ANGRY), (shout(), ANGRY), (hurt(), ANGRY), (stunned(), ANGRY), (happy(), CALM)]
