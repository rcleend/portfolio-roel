"""Each hero's attack and skill: the only moves with props, which appear only while they are used.

An attack's first frame is the moment its shot leaves, because the game fires as the pose starts: its
`muzzle` anchor (docs/LOOKS.md) is where the shot is drawn from. Attacks repeat for as long as the
button is held, each starting over, so every attack ends in the pose that leads into its first frame.
A skill's `hand` is where a skill's effect attaches and its `mouth` where a potion would meet the lips;
each hero has one skill pose that suits both of his skills.
"""
from __future__ import annotations

from typing import Callable, Dict, Optional, Tuple

from .art import Art, Point
from .moves import Animation, Frame, mouth
from .outfits import OUTFITS
from .pose import Pose, Prop, carried, hand
from .props import (
    FRET_HAND, GUITAR, KEY_BURST, KEYBOARD_FRONT, NECK, POTION, STRINGS, SUMMONED, TYPE_HAND, glint, keyboard,
)

# ── ENGINEER: types on a summoned keyboard; his skill slams Enter ──────────────────────────────────────


def typing(near_down: bool, far_down: bool, board: Art, *extra: Prop) -> Pose:
    """Both hands on the summoned keyboard, each resting on the keys or striking one a pixel lower."""
    return Pose(near='type close', far='type', near_at=(0, 1) if near_down else (0, 0),
                props=(Prop(board), Prop(TYPE_HAND.moved(0, 1) if far_down else TYPE_HAND, 'grip'), *extra))


def hackerman_attack() -> Animation:
    """A two-handed flurry in 0.2 s, about the attack's cooldown, a key a frame, each one lit as it is struck:
    the keyboard winks into being under the first stroke, which fires the glyph."""
    keys = (
        typing(True, False, keyboard('alt'), Prop(SUMMONED, 'front')),
        typing(False, True, keyboard('enter', fading='alt')),
        typing(True, False, keyboard('space', fading='enter')),
        typing(False, True, keyboard('enter', fading='space')),
    )
    return Animation('attack', 20, False, tuple(Frame(pose, {'muzzle': carried(KEYBOARD_FRONT, pose)}) for pose in keys))


def hackerman_skill() -> Animation:
    """Execute: both hands slam Enter as the skill fires, bursting green, then rest on the lit key while
    FULL-STACK ATTACK's beam or AGENT SUMMON's drone leaves the keyboard's front."""
    held = typing(True, True, keyboard('enter'))
    burst = held._replace(props=held.props + (Prop(KEY_BURST, 'front'),))
    poses = (burst._replace(body=(0, 1)), burst, held, held, held, typing(False, False, keyboard()))
    return Animation('skill', 15, False, tuple(skill_frame('hackerman', pose, KEYBOARD_FRONT) for pose in poses))


# ── DESIGNER: strums the white Strat; his skill is a power chord and a swig ──────────────────────────

GUITAR_HELD = (Prop(GUITAR), Prop(FRET_HAND, 'grip'))
# Terraria's guitar pumps the strumming arm's stretch Full, 3/4, 1/4, None and back over each use.
STRUM = ('strum full', 'strum 3/4', 'strum 1/4', 'strum none', 'strum 1/4', 'strum 3/4')


def strum(near: str, props: Tuple[Prop, ...] = GUITAR_HELD, **changes) -> Pose:
    return Pose(near=near, far='grip', props=props, **changes)


def artsy_attack() -> Animation:
    """One strum per shot, 0.3 s: the paint flies as the downstroke lands at full stretch, the hand rides up
    off the strings to the elbow and sweeps back down through them for the next."""
    strokes = tuple(strum(near) for near in STRUM)
    return Animation('attack', 20, False, tuple(Frame(pose, {'muzzle': carried(NECK, pose)}) for pose in strokes))


def artsy_skill() -> Animation:
    """A power chord crashed down through the strings as the skill fires (POWER CHORD), which flash, then the
    potion swigged with the head tipped back (UX ELIXIR), the Strat still held by its neck."""
    flash = GUITAR_HELD + (Prop(glint(STRINGS, big=True), 'front'),)
    ring = GUITAR_HELD + (Prop(glint(STRINGS, big=False), 'front'),)
    swig = (Prop(POTION),) + GUITAR_HELD
    poses = (
        strum('strum full', near_at=(0, 1), body=(0, 1), props=flash),
        strum('strum full', props=ring),
        strum('strum none'),
        strum('drink', props=swig),
        strum('drink', props=swig, body=(-1, 0)),
        strum('drink', props=swig, body=(-1, 0)),
    )
    return Animation('skill', 15, False, tuple(skill_frame('artsy', pose) for pose in poses))


# ── STRATEGIST: flicks sticky notes like shuriken; his skill raises both hands ──────────────────────


def strategy_attack() -> Animation:
    """Terraria's overhand throw, its swing frames turned so the release comes first: out as the note flies,
    down in the follow-through, back up behind the head and over the top into the next throw. Empty-handed
    throughout, as Terraria hides a thrown item: the note is only ever the one in flight."""
    throw = (Pose(near='forward'), Pose(near='down'), Pose(near='up'), Pose(near='reach'))
    release = hand(OUTFITS['strategy'], throw[0])
    # The note leaves from the fingertips, just ahead of the hand's middle.
    muzzle = (release[0] + 3, release[1])
    return Animation('attack', 20, False, tuple(Frame(pose, {'muzzle': muzzle}) for pose in throw))


def strategy_skill() -> Animation:
    """Both hands thrown up as the skill fires, a star glinting in the near one: NORTH STAR launched from
    it, or CHURN SHIELD raised around him; then the hands come down to his head."""
    up = Pose(near='up', far='up', body=(0, -1))
    top = hand(OUTFITS['strategy'], up)
    star = (top[0], top[1] - 4)
    poses = (
        up._replace(props=(Prop(glint(star, big=True), 'front'),)),
        up._replace(props=(Prop(glint(star, big=False), 'front'),)),
        up,
        up._replace(body=(0, 0)),
        up._replace(body=(0, 0)),
        Pose(near='air', far='air'),
    )
    return Animation('skill', 15, False, tuple(skill_frame('strategy', pose) for pose in poses))


def skill_frame(hero: str, pose: Pose, held: Optional[Point] = None) -> Frame:
    """A skill frame with its `hand` (the held prop's point, or the near hand) and `mouth` anchors."""
    point = carried(held, pose) if held else hand(OUTFITS[hero], pose)
    return Frame(pose, {'hand': point, 'mouth': mouth(pose)})


MOVES: Dict[str, Tuple[Callable[[], Animation], Callable[[], Animation]]] = {
    'hackerman': (hackerman_attack, hackerman_skill),
    'artsy': (artsy_attack, artsy_skill),
    'strategy': (strategy_attack, strategy_skill),
}
