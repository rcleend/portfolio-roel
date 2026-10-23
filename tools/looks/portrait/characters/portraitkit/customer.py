"""The Unhappy Customer: an exasperated tourist-dad who wants the manager.

A different man from the captain in every way the eye reads first: short,
stout and bald, with a grey horseshoe, a comb-over strand, bushy brows, a
big nose and a walrus moustache; a tucked-in mustard polo over a pot belly,
khaki shorts belted high, tube socks and chunky white dad sneakers. He
waves a crumpled receipt and jabs his phone. When he is won over the red
drains from his face (a palette swap) and he skips off with a thumbs up.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Dict, List, Optional, Tuple

from . import draw, palette
from .body import Character, Outfit
from .canvas import Frame, PartStyle
from .motion import GROUND_ANKLE_Y, Anim, plant
from .outfits import Spine, cells_of, paint_hand, shoes
from .pixmap import Legend, Pixmap
from .skeleton import Arm, Build, Joints, Leg, Pose, solve

BUILD = Build(
    thigh=9.5,
    shin=10.0,
    upper_arm=7.0,
    forearm=6.5,
    torso=13.0,
    near_hip=(-2.5, 0.5),
    far_hip=(2.5, 0.5),
    near_shoulder=(-5.5, 3.2),
    far_shoulder=(5.5, 3.6),
)
STAND = (31.5, 40.5)
HEAD_OFFSET = (-6.5, -14.0)

LEGEND: Legend = {
    "q": ("skin", 0), "S": ("skin", 1), "s": ("skin", 2), "w": ("skin", 3), "W": ("skin", 4),
    "K": ("grey", 0), "g": ("grey", 1), "G": ("grey", 2), "h": ("grey", 3), "H": ("grey", 4),
    "e": ("eye", 0), "E": ("eye", 1),
    "m": ("mouth", 0), "M": ("mouth", 1), "r": ("mouth", 2),
    "t": ("teeth", 1), "T": ("teeth", 0),
    "o": ("nose", 0), "p": ("nose", 1), "P": ("nose", 2), "R": ("nose", 3),
}

# 15 x 15, three-quarter view facing right: a big bald dome, grey tufts
# behind the ear, angry brows, a glare, the red bulb of a nose and a
# drooping walrus moustache over a stubborn chin.
HEAD = """
......qSSq.....
....qSsWWwSq...
...qSsWWWwsSq..
..qSswWwwwssSq.
.GhSsswwssssSSq
hGhgSsssssssSSq
GhgSSKggKSsKgg.
gGgSSsEeSSsEeoS
.ggqSsssSsopRpo
..gqSsssSopPPpo
..qSsgGhGgGoppo
..qSgGhhGGGhhGh
...qgGgGgGgGgGg
....qSSSSSSSq..
.....qqSSSqq...
"""

FACES: Dict[str, Dict[int, str]] = {
    "angry": {},
    # Brows crushed down, a vein popping, eyes bulging, and the moustache
    # lifted off a wide-open bellow.
    "shout": {
        3: "..qSswWwoossSq.",
        6: "GhgSSsKgKSsKgK.",
        7: "gGgSSEeESSEeEoS",
        12: "...qgTTTTTTgGg.",
        13: "...qSmrrrrmmSq.",
        14: "....qqmmmmmqq..",
    },
    # Eyes screwed shut, teeth gritted under the bristling moustache.
    "hurt": {
        6: "GhgSSsgggSsggg.",
        7: "gGgSSqqqSSqqqoS",
        13: "....qSqTtTqSq..",
    },
    # Spiral eyes and the tongue lolling out.
    "dizzy": {
        6: "GhgSSsssSSsss..",
        7: "gGgSSEeESsEeEoS",
        13: "....qSSmrrmSq..",
        14: ".....qqSrrqq...",
    },
    # Won over: eyes creased shut with joy, a huge grin under the moustache.
    "happy": {
        6: "GhgSKggKSsKggS.",
        7: "gGgSSqSqSSqSqoS",
        12: "...qgGtttttGgG.",
        13: "....qSmrrrmSq..",
        14: ".....qqmmmqq...",
    },
}

# The comb-over strand: lies flat, or flies up when he blows his top.
STRAND_FLAT = [(4, 0), (5, -1), (6, -1), (7, -2), (8, -2)]
STRAND_UP = [(6, -1), (6, -2), (7, -3), (8, -4), (9, -4)]


def heads() -> Dict[str, Pixmap]:
    base = Pixmap.parse(HEAD, LEGEND, "customer")
    out = {}
    for name, rows in FACES.items():
        cells = {xy: c for xy, c in base.cells.items() if xy[1] not in rows}
        for y, text in rows.items():
            for x, ch in enumerate(text):
                if ch != ".":
                    cells[(x, y)] = LEGEND[ch]
        out[name] = Pixmap(base.w, base.h, cells, f"customer/{name}")
    return out


# ── outfit ─────────────────────────────────────────────────────────────────

POLO_BODY = [(-3.2, 0.0), (3.2, 0.0), (5.8, 1.4), (6.6, 3.6), (6.8, 7.0), (6.4, 12.4),
             (-5.6, 12.4), (-6.4, 9.5), (-6.9, 3.6), (-5.8, 1.4)]
# Wide khaki shorts around the hips; the legs carry on below.
SHORTS = [(-6.4, 11.6), (6.0, 11.6), (7.2, 15.8), (6.8, 17.6), (-6.6, 17.6), (-7.0, 15.0)]


class _Top:
    top = 4


def polo_torso(frame: Frame, part: int, j: Joints, pose: Pose) -> None:
    sp = Spine(j, rest=BUILD.torso)
    # Shorts first: the belly hangs over their waistband.
    draw.shaded_polygon(frame, sp.poly(SHORTS), "khaki", part, 1, 4)
    draw.line(frame, sp.at(0.6, 13.6), sp.at(0.9, 17.4), "khaki", 1, part, only_on=part)  # fly seam
    draw.shaded_polygon(frame, sp.poly(POLO_BODY), "polo", part, 1, 4)
    # The pot belly: a dome pushing forward, lit on top, rolling into shadow.
    bx, by = sp.at(4.4, 9.0)
    frame.blob((bx, by), 5.0, 4.4, "polo", part, _Top(), lo=1, hi=4)
    # Belt peeking out under the overhang, buckle at the front.
    draw.line(frame, sp.at(-5.8, 12.6), sp.at(1.6, 12.8), "belt", 1, part)
    x, y = sp.at(2.6, 13.2)
    frame.put(int(math.floor(x)), int(math.floor(y)), "buckle", 1, part)
    # Polo collar flaps and a two-button placket.
    for a, b, t in ((-1.6, 0.2, 4), (-0.8, 1.0, 4), (1.6, 0.2, 3), (2.4, 1.0, 3), (1.0, 2.4, 1), (1.0, 3.8, 1)):
        x, y = sp.at(a, b)
        frame.put(int(math.floor(x)), int(math.floor(y)), "polo", t, part)
    # A sweat patch under the near arm: honest exasperation.
    draw.line(frame, sp.at(-5.4, 4.4), sp.at(-4.8, 6.4), "polo", 2, part, only_on=part)


def polo_sleeve(along: float, across: float, tone: int, segment: int):
    """Short sleeves: polo to just above the elbow, bare chubby forearms."""
    if segment == 0 and along < 4.4:
        return None
    return ("skin", max(1, min(tone, 3)))


def shorts_leg(along: float, across: float, tone: int, segment: int):
    """Khaki shorts to the knee, bare calves, tube socks pulled high."""
    if segment == 0:
        return None if along < 7.2 else ("skin", max(1, min(tone, 3)))
    return ("skin", max(1, min(tone, 3))) if along < 3.2 else ("sock", max(1, min(tone, 2)))


DAD_SHOES = {
    "flat": ("""
        .22......
        12233....
        122333332
        ooooooooo
    """, (2, 0)),
    "toe": ("""
        .12.....
        1223....
        .123333.
        ..oo3332
        ....oooo
    """, (2, 0)),
    "heel": ("""
        .22.....33
        12233.3332
        12233333o.
        oooooo....
    """, (2, 0)),
    "point": ("""
        .22..
        1223.
        12333
        .1233
        ..o32
        ...o.
    """, (2, 0)),
    "lift": ("""
        .22.......
        122333....
        .12333332.
        ..oooooooo
    """, (2, 0)),
}
SHOE_LEGEND: Legend = {"o": ("sole", 0), "O": ("sole", 1), "1": ("sneaker", 1), "2": ("sneaker", 2), "3": ("sneaker", 3)}

PROP_LEGEND: Legend = {
    "k": ("phone", 0), "K": ("phone", 1), "c": ("phone", 2),
    "b": ("screen", 0), "B": ("screen", 1), "L": ("screen", 2),
    "o": ("paper", 0), "w": ("paper", 1), "W": ("paper", 2),
    "y": ("star", 1), "Y": ("star", 2), "i": ("grey", 1),
}
PHONE = Pixmap.parse("""
    kccc
    kBLL
    kbBB
    kbbB
    kKKK
""", PROP_LEGEND, "phone")
# The receipt: a long curling strip, in a few flaps.
RECEIPTS = {
    "hang": Pixmap.parse("""
        WWw
        Wiw
        WWo
        Wiw
        .Ww
        .Wi
        .Wo
        ..w
    """, PROP_LEGEND, "receipt/hang"),
    "wave": Pixmap.parse("""
        ....WWw
        ..WWiw.
        .Wiww..
        Ww.....
        w......
    """, PROP_LEGEND, "receipt/wave"),
    "up": Pixmap.parse("""
        .w.
        WW.
        Wiw
        WWo
        .Wi
        .Ww
        WWo
        Ww.
    """, PROP_LEGEND, "receipt/up"),
}


def _grip_point(elbow, wrist, k: float = 1.4):
    dx, dy = wrist[0] - elbow[0], wrist[1] - elbow[1]
    n = math.hypot(dx, dy) or 1.0
    return (wrist[0] + dx / n * k, wrist[1] + dy / n * k)


def paint_props(frame: Frame, layer: str, j: Joints, pose: Pose, ch: Character) -> None:
    if layer == "prop_back":
        # The comb-over strand rides on top of the head; steam puffs and stars sit around it.
        return
    if layer == "prop":
        receipt = pose.get("receipt", "hang")
        if receipt:
            part = frame.part("receipt", PartStyle(outline_tone=0, lit_tone=None))
            gx, gy = _grip_point(j.far_elbow, j.far_wrist)
            pm = RECEIPTS[str(receipt)]
            frame.stamp(pm, int(math.floor(gx)) - 1, int(math.floor(gy)) - (pm.h - 2 if receipt == "up" else 0), part)
        return
    if layer == "prop_front":
        if pose.get("phone", True):
            part = frame.part("phone", PartStyle(outline_tone=0, lit_tone=None))
            gx, gy = _grip_point(j.near_elbow, j.near_wrist, 1.0)
            frame.stamp(PHONE, int(math.floor(gx)) - 1, int(math.floor(gy)) - 2, part)
        _paint_overlays(frame, j, pose, ch)


def _head_origin(j: Joints, pose: Pose) -> Tuple[int, int]:
    from .body import head_origin
    return head_origin(j, pose, HEAD_OFFSET)


def _paint_overlays(frame: Frame, j: Joints, pose: Pose, ch: Character) -> None:
    hx, hy = _head_origin(j, pose)
    strand = pose.get("strand", "flat")
    part = frame.part("strand", PartStyle(outline=False))
    for x, y in (STRAND_UP if strand == "up" else STRAND_FLAT):
        frame.put(hx + x, hy + y, "grey", 3, part)
    phase = pose.get("steam")
    if phase is not None:
        _steam(frame, hx, hy, int(phase))  # type: ignore[arg-type]
    stars = pose.get("stars")
    if stars is not None:
        _stars(frame, hx + 6, hy - 3, float(stars))  # type: ignore[arg-type]


def _steam(frame: Frame, hx: int, hy: int, phase: int) -> None:
    """Puffs rising from the ears: born small and bright, drifting up and fading."""
    part = frame.part("steam", PartStyle(outline=False))
    for k in range(2):
        t = (phase + k * 2) % 4
        for side, ox in ((-1, 1), (1, 11)):
            x = hx + ox + side * t
            y = hy + 6 - t * 2
            size = (1, 2, 2, 1)[t]
            tone = (2, 2, 1, 0)[t]
            for dx in range(size):
                for dy in range(size):
                    frame.put(x + dx, y + dy, "steam", tone, part)


def _stars(frame: Frame, cx: int, cy: int, angle: float) -> None:
    """Three dizzy stars orbiting the stunned customer's head.

    The customer owns this state indicator (PHASE-B-NOTES): it looks the
    same whatever stunned him. Stars on the far side of the orbit are drawn
    smaller and dimmer, which gives the ring depth without any blending.
    """
    part = frame.part("stars", PartStyle(outline=False))
    for k in range(3):
        a = angle + k * 2 * math.pi / 3
        x = cx + int(round(7 * math.cos(a)))
        y = cy + int(round(2.5 * math.sin(a)))
        near = math.sin(a) > -0.2
        frame.put(x, y, "star", 2 if near else 1, part)
        arms = ((1, 0), (-1, 0), (0, 1), (0, -1))
        for dx, dy in arms:
            frame.put(x + dx, y + dy, "star", 1 if near else 0, part)
        if near:
            for dx, dy in arms:
                frame.put(x + 2 * dx, y + 2 * dy, "star", 0, part)


def character(calm: bool = False) -> Character:
    return Character(
        id="unhappy-customer",
        palette=palette.CUSTOMER_CALM if calm else palette.CUSTOMER,
        outfit=Outfit(
            sleeve="polo",
            trousers="khaki",
            torso=polo_torso,
            shoes=shoes(DAD_SHOES, SHOE_LEGEND),
            upper_arm=2.5,
            forearm=1.9,
            thigh=2.9,
            shin=1.8,
            dark=(),
            sleeve_pattern=polo_sleeve,
            trouser_pattern=shorts_leg,
        ),
        heads=heads(),
        props=paint_props,
        hand=paint_hand,
        build=BUILD,
        head_offset=HEAD_OFFSET,
    )


ORDER = ("prop_back", "far_arm", "far_leg", "near_leg", "torso", "head", "prop", "far_hand", "near_arm", "prop_front")


def base(**kw) -> Pose:
    p = Pose(pelvis=STAND, **kw)
    return p.plus(order=ORDER)


def stand(p: Pose, side: str = "near", lift: float = 0.0) -> Pose:
    return plant(p, side, lift=lift, build=BUILD)


# ── animations ─────────────────────────────────────────────────────────────
# renderCustomer samples walk frame 1 as his "standing" pose (time 1/6 s),
# so the cycle starts on "down" and frame 1 is the feet-together passing pose.

_WALK = [
    ("down", Leg(10, -8, "flat"), Leg(-10, -52, "toe")),
    ("passing", Leg(1, -2, "flat"), Leg(14, -20, "point")),
    ("up", Leg(-12, -14, "toe"), Leg(26, 8, "heel")),
    ("contact", Leg(22, 4, "heel"), Leg(-16, -24, "toe")),
]


def walk() -> Anim:
    # Short, heavy stomps leaning into it; the receipt shakes overhead on
    # every step and the phone fist pumps at his side.
    poses = []
    wave = [158, 146, 162, 150, 158, 146, 162, 150]
    pump = [-20, -6, 10, -4, -20, -6, 10, -4]
    for half in (0, 1):
        for k, (name, front, back) in enumerate(_WALK):
            i = half * 4 + k
            near, far = (front, back) if half == 0 else (back, front)
            support = "near" if (half == 0) != (name == "contact") else "far"
            p = base(near_leg=near, far_leg=far, lean=10, face="angry", head=(1.0, 0.0))
            p = stand(p, support, lift=-1.0 if name == "down" else 0.0)
            p = p.with_(near_arm=Arm(pump[i], pump[i] + 50, "fist"), far_arm=Arm(wave[i], wave[i] + 14, "grip"))
            poses.append(p.plus(receipt="up" if i % 2 == 0 else "wave", strand="flat"))
    return Anim("walk", 10, True, tuple(poses))


def shout() -> Anim:
    # Leaning in, shoving his phone at you, receipt brandished overhead,
    # steam out of both ears and the comb-over standing on end.
    poses = []
    for i in range(6):
        jab = i % 2 == 0
        p = base(near_leg=Leg(-10, -2, "flat"), far_leg=Leg(16, 6, "flat"), lean=16, face="shout",
                 head=(2.0 if jab else 1.0, 0.0))
        p = stand(p, "near")
        p = p.with_(pelvis=(p.pelvis[0] + (0.5 if jab else 0.0), p.pelvis[1]),
                    near_arm=Arm(86 if jab else 76, 90 if jab else 72, "fist"),
                    far_arm=Arm(162 if jab else 150, 172 if jab else 160, "grip"))
        poses.append(p.plus(receipt="up", strand="up", steam=i % 4))
    return Anim("shout", 12, True, tuple(poses))


def hurt() -> Anim:
    # The hit snaps him back: eyes screwed shut, arms flung up, strand flying.
    beats = [
        dict(lean=-16, head=(-1.0, 0.0), squash=0.0, near=Arm(-120, -160, "open"), far=Arm(150, 120, "grip")),
        dict(lean=-22, head=(-2.0, 1.0), squash=1.0, near=Arm(-140, -175, "open"), far=Arm(160, 130, "grip")),
        dict(lean=-8, head=(-1.0, 0.0), squash=0.0, near=Arm(40, 90, "open"), far=Arm(150, 180, "grip")),
    ]
    poses = []
    for b in beats:
        p = base(near_leg=Leg(-14, 2, "flat"), far_leg=Leg(12, 16, "toe"), lean=b["lean"], face="hurt",
                 head=b["head"], squash=b["squash"])
        p = stand(p, "near")
        poses.append(p.with_(near_arm=b["near"], far_arm=b["far"]).plus(receipt="up", strand="up"))
    return Anim("hurt", 14, False, tuple(poses))


def stunned() -> Anim:
    # Knees knocking, swaying on the spot, arms hanging, spiral-eyed with
    # his tongue out while three stars circle his head.
    sway = [-6, -4, 0, 4, 6, 4, 0, -4]
    poses = []
    for i, s in enumerate(sway):
        p = base(near_leg=Leg(10, -6, "flat"), far_leg=Leg(-6, 8, "flat"), lean=s, face="dizzy", squash=1.0,
                 head=(1.0 if s > 2 else -1.0 if s < -2 else 0.0, 0.0))
        p = stand(p, "near")
        dangle = -s * 2
        p = p.with_(near_arm=Arm(dangle - 6, dangle - 10, "rest"), far_arm=Arm(dangle + 8, dangle + 4, "grip"))
        poses.append(p.plus(receipt="hang", strand="flat", stars=i * 2 * math.pi / 8))
    return Anim("stunned", 8, True, tuple(poses))


def happy() -> Anim:
    # Won over: the red drains away and he skips off, thumbs up beside his
    # grin, the phone pocketed and the receipt forgotten.
    hop = [0.0, 2.5, 3.5, 1.0, 0.0, 2.5, 3.5, 1.0]
    poses = []
    for i, h in enumerate(hop):
        lead = i < 4
        knee = Leg(46, -30, "point")
        plant_leg = Leg(-6, 0, "flat" if h == 0 else "toe")
        near, far = (plant_leg, knee) if lead else (knee, plant_leg)
        p = base(near_leg=near, far_leg=far, lean=4, face="happy")
        p = stand(p, "near" if lead else "far", lift=h)
        swing = 30 if lead else -30
        p = p.with_(near_arm=Arm(swing, swing + 40, "fist"), far_arm=Arm(120, 178, "thumb"))
        poses.append(p.plus(receipt=None, phone=False, strand="flat"))
    return Anim("happy", 10, True, tuple(poses))


def animations() -> List[Tuple[Anim, bool]]:
    """Each animation with whether it uses the calm palette."""
    return [(walk(), False), (shout(), False), (hurt(), False), (stunned(), False), (happy(), True)]


def anchors(name: str, pose: Pose, j: Joints) -> dict:
    """Where complaint bubbles leave his mouth while he shouts."""
    if name != "shout":
        return {}
    hx, hy = _head_origin(j, pose)
    return {"mouth": (hx + 10, hy + 13)}
