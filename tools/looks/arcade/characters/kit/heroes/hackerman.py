"""HACKERMAN ROEL: black hoodie (hood down), dark jeans, white sneakers, a mechanical keyboard on a strap.

His attack is a typing burst: the board swings up level like a keytar solo,
both hands hammer the keys and code glyphs fire off its far end. His skill is
`execute`: a wind-up, a slam on the Enter key and the board thrust forward,
glowing, for the beam or the drone to leave from.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

from .. import palette as P
from ..compose import Part
from ..grid import Grid
from ..head import GLINT
from ..raster import line, outline_outside
from ..rig import Attachment, Limb, LimbStyle, Outfit, Pose, Posed, TorsoKit, Vec, attach
from ..skew import skew_columns, skew_rows
from . import moves
from .common import OrientedHands, far_material, heads, material, ramp_keys, shoes, torso_kits
from .moves import GROUND, Anim, leg

# ── Torso: 3/4 front, facing right. Fill rows; pivot = pelvis centre on the bottom row. ──
# Hood bunched behind the neck, white drawstrings with terminal-green tips, kangaroo pocket, ribbed hem.
TORSO_FILL = """
..cbbbbc....
.cbaaabdssc.
cbddddbdSSdc
bbabbbcdcdcc
babbbbbcccdd
bbbbbbbccccd
cbbbbbbccccd
cbbbbbbccccd
cbbbbbcccccd
.cbbbccccdd.
.cbcdddddcd.
.cbcbbbbbdd.
.cbcbbbbbdd.
.cccccccccd.
.dcdcdcdcdd.
"""
TORSO_PIVOT = (5, 14)

PALETTE: Dict[str, str] = dict(ramp_keys(P.HOODIE))
PALETTE.update(
    {
        "w": "#e8eef0",
        "v": "#9aa3b4",
        "g": P.TERMINAL_GREEN,
        "s": P.SKIN.light,
        "S": P.SKIN.mid,
        "k": P.SKIN.shadow,
    }
)

TORSOS: Mapping[str, TorsoKit] = torso_kits(TORSO_FILL, TORSO_PIVOT)

# ── Drawstrings: drawn per frame so they swing behind the body's motion. ──
# Lower-end offsets (dx, dy) per move frame; idle hangs straight.
STRING_SWING = {
    "run": ((-1, 0), (-1, 0), (0, 0), (-1, -1), (-1, 0), (-1, 0), (0, 0), (-1, -1)),
    "jump": ((0, 1), (-1, -1), (-1, -2), (-1, -2)),
    "fall": ((0, -2), (1, -2), (0, -2), (-1, -2)),
    "hurt": ((2, -2), (2, -1), (1, 0), (0, 0)),
}


def strings(swing: Tuple[int, int] = (0, 0)):
    """Two white drawstrings with terminal-green tips, hanging from the hood opening."""

    def factory(posed: Posed) -> Optional[Part]:
        nx, ny = int(round(posed.neck[0])), int(round(posed.neck[1]))
        cells: Dict[Tuple[int, int], str] = {}
        for x0 in (nx + 2, nx + 4):
            top = (x0, ny + 2)
            bottom = (x0 + swing[0], ny + 6 + swing[1])
            run = line(top, bottom)
            for p in run:
                cells[p] = "w"
            cells[run[-1]] = "g"
        return Part(Grid.from_cells(cells), (0, 0), {"w": "#e8eef0", "g": P.TERMINAL_GREEN}, "#9aa3b4", "w", name="strings")

    return ("torso", factory)


# ── The keyboard: a chunky mechanical board with an RGB underglow. ──
# k keycap, e keycap shadow / gap, x accent key (Enter), b/c case, d case front, g glow.
KEYBOARD_FILL = """
cbbbbbbbbbbbbbbbbbbbc
bkekekekekekekekekexb
bekekekekekekekekekeb
bkkkkekkkkkkkkekekeeb
ddddddddddddddddddddd
.ggggggggggggggggggg.
"""
KEYBOARD_PIVOT = (1, 2)
KEYBOARD_LENGTH = 21
KEYBOARD_PALETTE: Dict[str, str] = {
    "a": P.KEYBOARD_CASE.hi,
    "b": P.KEYBOARD_CASE.light,
    "c": P.KEYBOARD_CASE.mid,
    "d": P.KEYBOARD_CASE.shadow,
    "k": P.KEYCAP.light,
    "e": P.KEYCAP.shadow,
    "W": P.WHITE,
    "x": P.KEY_ACCENT,
    "g": P.TERMINAL_GREEN,
    "G": P.TERMINAL_GREEN_DARK,
    "L": P.TERMINAL_GREEN,
}

_KEY_ROWS = (1, 2, 3)
_ALL_KEYS = tuple(range(1, 20))


def lit_keys(columns: Sequence[int], colour: str = "L") -> Dict[Tuple[int, int], str]:
    """Keycaps that light up under the fingers (fill coordinates of the key rows)."""
    return {(x, y): colour for x in columns for y in _KEY_ROWS}


def keyboard(tilt: int = 0, lit: Optional[Mapping[Tuple[int, int], str]] = None, glow: str = "g") -> Grid:
    """The keyboard, pivot at its near end. `tilt` = columns per pixel of rise (0 = flat)."""
    g = Grid.parse(KEYBOARD_FILL, KEYBOARD_PIVOT)
    cells = {p: (glow if k == "g" else k) for p, k in g.cells.items()}
    if lit:
        cells.update({p: k for p, k in lit.items() if p in cells and cells[p] in "ekx"})
    g = Grid(g.w, g.h, cells, g.pivot)
    if tilt:
        g = skew_columns(g, tilt, pivot_x=g.pivot[0])
    return Grid.from_cells(outline_outside(dict(g.cells)), g.pivot)


def keyboard_point(at: Vec, tilt: int, column: int, row: int = 0) -> Tuple[int, int]:
    """Frame position of a fill (column, row) of the board placed with its pivot at `at`."""
    run = column - KEYBOARD_PIVOT[0]
    rise = (run // tilt) if tilt else 0
    return (int(at[0]) + run, int(at[1]) + (row - KEYBOARD_PIVOT[1]) - rise)


def keyboard_tip(at: Vec, tilt: int = 0) -> Tuple[int, int]:
    """Just past the board's far end: where code bolts leave."""
    x, y = keyboard_point(at, tilt, KEYBOARD_LENGTH - 1, 2)
    return (x + 2, y)


def keyboard_part(
    at: Vec, tilt: int = 0, lit: Optional[Mapping[Tuple[int, int], str]] = None, glow: str = "g"
) -> Part:
    return Part(
        keyboard(tilt, lit, glow),
        (int(at[0]), int(at[1])),
        KEYBOARD_PALETTE,
        P.KEYBOARD_CASE.line,
        "d",
        group="keyboard",
        name="keyboard",
    )


def strap_part(start: Vec, end: Vec) -> Part:
    a = (int(round(start[0])), int(round(start[1])))
    b = (int(round(end[0])), int(round(end[1])))
    cells = {p: "d" for p in line(a, b)}
    return Part(Grid.from_cells(cells, (0, 0)), (0, 0), {"d": "#14121c"}, "#14121c", "d", group="strap", name="strap")


OUTFIT = Outfit(
    name="hackerman",
    torsos=TORSOS,
    torso_palette=PALETTE,
    torso_line=P.HOODIE.line,
    torso_demote="d",
    torso_group="hoodie",
    sleeve=material(P.HOODIE_NEAR, "hoodie_near", rim=P.RIM_HOODIE),
    sleeve_style=LimbStyle(3.3, 3.0, 2.9, cuff=1.6),
    far_sleeve=far_material(P.HOODIE, "hoodie", rim=P.RIM_HOODIE),
    trousers=material(P.JEANS, "jeans", rim=P.RIM_JEANS),
    far_trousers=far_material(P.JEANS, "jeans", rim=P.RIM_JEANS),
    leg_style=LimbStyle(3.8, 3.2, 3.0, cuff=1.2),
    hands=OrientedHands(),
    feet=shoes(P.SNEAKER_WHITE, "#d9cbb0"),
    heads=heads(cap=False),
    lift=2,
    torso_rim=P.RIM_HOODIE,
)

# ── Prop helpers ──

CARRY_OFFSET = (-8, 2)
CARRY_TILT = 3


def board_at(at: Vec, tilt: int, lit=None, glow: str = "g", layer: str = "front"):
    """An extra that draws the board with its pivot at a fixed frame point."""

    def factory(posed: Posed) -> Optional[Part]:
        return keyboard_part(at, tilt, lit, glow)

    return (layer, factory)


def strap_to(end: Vec):
    def factory(posed: Posed) -> Optional[Part]:
        return strap_part((posed.far_shoulder[0], posed.far_shoulder[1] + 1), end)

    return ("front", factory)


def hand_on_top(shape: str, at: Vec):
    """A hand drawn above the board (its arm stays behind it): fingers reaching over the top."""

    def factory(posed: Posed) -> Optional[Part]:
        hands: Mapping[str, Attachment] = OUTFIT.hands
        return attach(hands[shape], at, "hand.top")

    return ("near_arm", factory)


def glint(posed: Posed) -> Tuple[int, int]:
    return (int(posed.head_at[0]) + GLINT[0], int(posed.head_at[1]) + GLINT[1])


def carry(kind: str, index: int, pose: Pose) -> Pose:
    _, ly = moves.lag(kind, index)
    # The strap gives a little: the board trails the body by about half its motion.
    hx, hy = pose.hip
    at = (hx + CARRY_OFFSET[0], hy + CARRY_OFFSET[1] + round(ly * 0.6))
    swing = STRING_SWING[kind][index]
    return replace(
        pose, extras=pose.extras + (strings(swing), strap_to((at[0] + 1, at[1] - 1)), board_at(at, CARRY_TILT))
    )


# ── Idle: weight on the back leg, hands resting on the board, a bouncy breath. ──


def idle() -> Anim:
    poses: List[Pose] = []
    for i, beat in enumerate(moves.BREATH):
        hip = (31, 35 + beat.hip_dy)
        at = (hip[0] + CARRY_OFFSET[0], 35 + CARRY_OFFSET[1] + beat.prop_dy)
        tap = i == 4
        near_hand = keyboard_point(at, CARRY_TILT, 5, -1 + (1 if tap else 0))
        far_hand = keyboard_point(at, CARRY_TILT, 17, 0)
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=near_hand, bend=-1, tip="type@80"),
            far_arm=Limb(end=far_hand, bend=-1, tip="grip@70", joint=(far_hand[0] - 4, far_hand[1] - 2)),
            near_leg=leg((27, GROUND)),
            far_leg=leg((35, GROUND)),
            torso=beat.torso,
            head=beat.face,
            head_offset=beat.head,
            extras=(
                strings((0, -1 if beat.prop_dy < 0 else 0)),
                strap_to((at[0] + 1, at[1] - 1)),
                board_at(at, CARRY_TILT, lit_keys((5, 6)) if tap else None),
            ),
        )
        poses.append(_with_glint(pose) if beat.glint else pose)
    return Anim("idle", 8, True, poses)


def _with_glint(pose: Pose, both: bool = False) -> Pose:
    """A white glint on the near lens (and the far one, for the big moments)."""

    def factory(posed: Posed) -> Optional[Part]:
        x, y = glint(posed)
        cells = {(0, 0): "w"}
        if both:
            cells[(5, 0)] = "w"
            cells[(1, 1)] = "w"
        return Part(Grid.from_cells(cells), (x, y), {"w": P.WHITE}, P.WHITE, "w", name="glint")

    return replace(pose, extras=pose.extras + (("top", factory),))


# ── Attack: typing burst, 4 frames at 18 fps (0.22 s, the shot cooldown). ──
# Fires on frame 0; when the button is held the game restarts the pose every shot.
_ATTACK_BOARD = (25, 38)
_ATTACK_TILT = 4
# The board swings up like a keytar solo; the near hand hammers keys, the far hand steadies the neck.
# (board dx, board dy, hip, typing column, finger lift, lit columns)
_ATTACK = (
    (-1, 1, (30, 35), 8, 0, (7, 8, 9, 19)),
    (0, 0, (31, 35), 11, -2, (11, 12)),
    (0, 0, (31, 35), 7, 0, (6, 7)),
    (0, 0, (31, 35), 10, -2, (9, 10, 13)),
)


def attack() -> Anim:
    poses: List[Pose] = []
    muzzles: List[Tuple[int, int]] = []
    for dx, dy, hip, column, lift, lit in _ATTACK:
        at = (_ATTACK_BOARD[0] + dx, _ATTACK_BOARD[1] + dy)
        near = keyboard_point(at, _ATTACK_TILT, column, -2 + lift)
        far = keyboard_point(at, _ATTACK_TILT, 18, 1)
        keys = lit_keys(lit)
        if lift == 0:
            keys.update(lit_keys((column,), "W"))
        extras = [strings((1, -1) if dx < 0 else (0, 0)), strap_to((at[0] + 1, at[1] - 1)), board_at(at, _ATTACK_TILT, keys)]
        if lift == 0:
            extras.append(_tap_spark(keyboard_point(at, _ATTACK_TILT, column + 1, -3)))
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=near, bend=-1, tip="type@80"),
            far_arm=Limb(end=far, bend=-1, tip="grip@60", joint=(far[0] - 3, far[1] - 4)),
            near_leg=leg((25, GROUND)),
            far_leg=leg((37, GROUND)),
            torso="lean1",
            head="focus",
            head_offset=(1, 0),
            extras=tuple(extras),
        )
        poses.append(pose)
        muzzles.append(keyboard_tip(at, _ATTACK_TILT))
    return Anim("attack", 18, False, poses, {"muzzle": muzzles})


def _tap_spark(at: Tuple[int, int]):
    """Two hot pixels and a tick above the struck key: the keystroke you can hear."""

    def factory(posed: Posed) -> Optional[Part]:
        x, y = at
        cells = {(x, y): "w", (x + 1, y - 1): "g", (x + 2, y - 2): "w", (x - 1, y - 2): "g"}
        return Part(Grid.from_cells(cells), (0, 0), {"w": P.WHITE, "g": P.TERMINAL_GREEN}, P.WHITE, "w", name="tap")

    return ("top", factory)


# ── Skill: execute. Wind up, slam Enter, thrust the glowing board forward. 6 frames at 15 fps (0.4 s). ──


def skill() -> Anim:
    rest = (24, 31)
    thrust = (27, 29)
    frames = [
        # anticipation: lean back, hand cocked high behind the head
        dict(hip=(30, 36), torso="back1", head="focus", hoff=(-1, 0), board=(rest, 0, None, "g"),
             near=((22, 22), (19, 14), "point@250"), far_col=15, glint=False, swing=(-1, 0)),
        dict(hip=(30, 36), torso="back1", head="focus", hoff=(-1, 0), board=(rest, 0, None, "g"),
             near=((22, 21), (18, 13), "point@250"), far_col=15, glint=True, swing=(-1, -1)),
        # the slam: arm whips down, keys flash white
        dict(hip=(31, 36), torso="lean1", head="shout", hoff=(1, 0), board=(rest, 0, lit_keys(_ALL_KEYS, "W"), "W"),
             near=((33, 25), (39, 28), "fist"), far_col=15, glint=False, smear=True, swing=(1, -2)),
        # impact: squash, everything green
        dict(hip=(31, 37), torso="lean2", head="shout", hoff=(1, 1), board=(rest, 0, lit_keys(_ALL_KEYS), "g"),
             near=((34, 27), (40, 30), "fist"), far_col=15, glint=False, swing=(1, -1)),
        # thrust the board forward, still glowing
        dict(hip=(32, 35), torso="lean2", head="shout", hoff=(2, 0), board=(thrust, 0, lit_keys(_ALL_KEYS), "g"),
             near=((33, 26), (35, 27), "type@80"), far_col=16, glint=False, swing=(0, 0)),
        dict(hip=(32, 35), torso="lean1", head="smile", hoff=(1, 0), board=(thrust, 0, lit_keys(range(1, 20, 2)), "g"),
             near=((32, 27), (34, 27), "type@80"), far_col=16, glint=True, swing=(0, 0)),
    ]
    poses: List[Pose] = []
    hands: List[Tuple[int, int]] = []
    for f in frames:
        at, tilt, lit, glow = f["board"]
        (ne, nw, nh) = f["near"]
        far = keyboard_point(at, tilt, f["far_col"], 1)
        extras = [strings(f["swing"]), strap_to((at[0] + 1, at[1] - 1)), board_at(at, tilt, lit, glow)]
        if f.get("smear"):
            extras.append(("top", _slam_smear))
        pose = Pose(
            hip=f["hip"],
            near_arm=Limb(end=nw, bend=-1, tip=nh, joint=ne),
            far_arm=Limb(end=far, bend=-1, tip="grip@70"),
            near_leg=leg((26, GROUND)),
            far_leg=leg((37, GROUND)),
            torso=f["torso"],
            head=f["head"],
            head_offset=f["hoff"],
            extras=tuple(extras),
        )
        poses.append(_with_glint(pose) if f["glint"] else pose)
        # Both of his skills leave from the board's far end (the beam, the drone), wind-up included.
        hands.append(keyboard_tip(at, tilt))
    return Anim("skill", 15, False, poses, {"hand": hands})


def _slam_smear(posed: Posed) -> Optional[Part]:
    """A pale arc behind the falling fist: the motion the eye misses at 15 fps."""
    from ..raster import arc_band

    cx, cy = posed.near_shoulder
    cells = arc_band((cx, cy), 9.0, 14.0, 200, 300, ((0.45, "b"), (1.0, "a")))
    return Part(Grid.from_cells(cells), (0, 0), {"a": "#ffffff", "b": "#bfe9ff"}, "#bfe9ff", "b", name="smear")


# ── Victory: a keytar solo. Leaning back, laughing, the keys light up in a running wave. ──
_VICTORY_BOUNCE = (0, 1, 1, 0, 0, 1, 1, 0)


def victory() -> Anim:
    poses: List[Pose] = []
    for i, dy in enumerate(_VICTORY_BOUNCE):
        hip = (31, 35 + dy)
        at = (22, 39 + _VICTORY_BOUNCE[i - 1])
        tilt = 2
        wave = (1 + (i * 2) % 18, 2 + (i * 2) % 18, 3 + (i * 2) % 18)
        hammer = i % 2 == 0
        near = keyboard_point(at, tilt, 5, -2 if hammer else -3)
        far = keyboard_point(at, tilt, 17, 1)
        pose = Pose(
            hip=hip,
            near_arm=Limb(end=near, bend=-1, tip="type@80"),
            far_arm=Limb(end=far, bend=-1, tip="grip@60", joint=(far[0] - 2, far[1] + 5)),
            near_leg=leg((25, GROUND)),
            far_leg=leg((38, GROUND)),
            torso="back1",
            head="shout" if i in (1, 2, 5, 6) else "smile",
            head_offset=(-1, dy and -1),
            extras=(strings((0, -1) if dy else (0, 0)), strap_to((at[0] + 1, at[1] - 1)), board_at(at, tilt, lit_keys(wave))),
        )
        poses.append(_with_glint(pose, both=True) if i in (3, 7) else pose)
    return Anim("victory", 10, True, poses)


def animations() -> List[Anim]:
    return [
        idle(),
        moves.run(carry),
        moves.jump(carry),
        moves.fall(carry),
        attack(),
        skill(),
        moves.hurt(carry),
        victory(),
    ]
