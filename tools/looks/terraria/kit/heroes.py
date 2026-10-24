"""Each hero's attack and skill poses: the only moves with props, which appear only while they are used.

An attack's first frame is the moment its shot leaves, because the game fires as the pose starts: its
`muzzle` anchor (docs/LOOKS.md) is where the shot is drawn from. Attacks repeat for as long as the
button is held, each starting over, so every attack ends in the pose that leads into its first frame.
A skill's first frame is its cast, its `hand` where a skill's effect attaches and its `mouth` the lips.
A hero's `skill` suits both of his skills unless he poses one of them its own way (`skill-<skillId>`), as
Terraria gives every item its own use animation: the DESIGNER drinks UX ELIXIR rather than strumming it.
"""
from __future__ import annotations

from typing import Callable, Dict, NamedTuple, Tuple

from .art import Art, Point
from .moves import Animation, Frame, mouth
from .outfits import OUTFITS
from .pose import Pose, Prop, carried, far_hand, hand
from .props import (
    DRINK_HAND, FRET_HAND, GUITAR, KEY_BURST, KEYBOARD_FRONT, NECK, STRINGS, SUMMONED, TYPE_HAND, glint,
    held_potion, key_spark, keyboard,
)

# ── ENGINEER: types on a summoned keyboard; his skill slams Enter ──────────────────────────────────────


def typing(near_down: bool, far_down: bool, board: Art, *extra: Prop, raised: bool = False) -> Pose:
    """Both hands on the summoned keyboard, each resting on the keys or striking one a pixel lower; raised,
    both fists are up off it, about to come down."""
    if raised:
        return Pose(near='type raised', far='type', props=(Prop(board), Prop(TYPE_HAND.moved(0, -3), 'grip'), *extra))
    return Pose(near='type close', far='type', near_at=(0, 1) if near_down else (0, 0),
                props=(Prop(board), Prop(TYPE_HAND.moved(0, 1) if far_down else TYPE_HAND, 'grip'), *extra))


def hackerman_attack() -> Animation:
    """A two-handed flurry in 0.2 s, about the attack's cooldown, a key a frame, each one lit as it is struck.
    The first stroke fires the glyph with a spark off its key; the keyboard appears without the summoning
    motes, which held fire would replay on every shot."""
    keys = (
        typing(True, False, keyboard('alt'), Prop(key_spark('alt'), 'front')),
        typing(False, True, keyboard('enter', fading='alt')),
        typing(True, False, keyboard('space', fading='enter')),
        typing(False, True, keyboard('enter', fading='space')),
    )
    frames = tuple(Frame(pose, {'muzzle': carried(KEYBOARD_FRONT, pose)}) for pose in keys)
    return Animation('attack', 20, False, frames)


def hackerman_skill() -> Animation:
    """Execute: the keyboard winks into being under both raised fists as the skill fires, they slam Enter
    and it bursts green, then they rest on the lit key while FULL-STACK ATTACK's beam or AGENT SUMMON's drone
    leaves the keyboard's front, and lift off as it fades."""
    slam = typing(True, True, keyboard('enter'))
    poses = (
        typing(False, False, keyboard(), Prop(SUMMONED, 'front'), raised=True),
        slam._replace(body=(0, 1), props=slam.props + (Prop(KEY_BURST, 'front'),)),
        slam._replace(props=slam.props + (Prop(key_spark('enter'), 'front'),)),
        slam,
        typing(True, True, keyboard(fading='enter')),
        typing(False, False, keyboard()),
    )
    return Animation('skill', 15, False, tuple(skill_frame(pose, carried(KEYBOARD_FRONT, pose)) for pose in poses))


# ── DESIGNER: strums the white Strat; POWER CHORD crashes a chord, UX ELIXIR is drunk ─────────────────

GUITAR_HELD = (Prop(GUITAR), Prop(FRET_HAND, 'grip'))
# Terraria's guitar pumps the strumming arm's stretch Full, 3/4, 1/4, None and back over each use.
STRUM = ('strum full', 'strum 3/4', 'strum 1/4', 'strum none', 'strum 1/4', 'strum 3/4')


def strum(near: str, props: Tuple[Prop, ...] = GUITAR_HELD, **changes) -> Pose:
    return Pose(near=near, far='grip', props=props, **changes)


def artsy_attack() -> Animation:
    """One strum per shot, 0.3 s: the paint flies as the downstroke lands at full stretch on the pickups, the
    hand rides up off the strings toward the elbow and sweeps back down through them for the next."""
    strokes = tuple(strum(near) for near in STRUM)
    return Animation('attack', 20, False, tuple(Frame(pose, {'muzzle': carried(NECK, pose)}) for pose in strokes))


def artsy_skill() -> Animation:
    """POWER CHORD: a chord crashed down through the strings as the skill fires, the body dipping into it,
    which flash and ring while the hand rides back up off them."""
    flash = GUITAR_HELD + (Prop(glint(STRINGS, big=True), 'front'),)
    ring = GUITAR_HELD + (Prop(glint(STRINGS, big=False), 'front'),)
    poses = (
        strum('strum full', near_at=(0, 1), body=(0, 1), props=flash),
        strum('strum full', props=ring),
        strum('strum 3/4', props=ring),
        strum('strum 1/4'),
        strum('strum none'),
        strum('strum 1/4'),
    )
    return Animation('skill', 15, False, tuple(skill_frame(pose, hand(OUTFITS['artsy'], pose)) for pose in poses))


def drink(arm: str, potion: Art, **changes) -> Pose:
    return Pose(far=arm, props=(Prop(potion), Prop(DRINK_HAND[arm], 'grip')), **changes)


def artsy_elixir() -> Animation:
    """UX ELIXIR, drunk as Terraria drinks a potion (useStyle 9), the guitar put away as Terraria shows only
    the item in use: the far hand lifts the pink potion from the chest to his lips and tips its bulb up as it
    drains, his head tipped back a pixel for the swig."""
    poses = (
        drink('lift', held_potion('lifted')),
        drink('tip', held_potion('tipped')),
        drink('tip', held_potion('tipped', 3), body=(-1, 0)),
        drink('tip', held_potion('tipped', 2), body=(-1, 0)),
        drink('tip', held_potion('tipped', 1), body=(-1, 0)),
        drink('tip', held_potion('tipped', 0)),
    )
    return Animation('skill-ux-elixir', 15, False, tuple(skill_frame(pose, far_hand(pose)) for pose in poses))


# ── STRATEGIST: flicks sticky notes like shuriken; his skill raises both hands ──────────────────────


def strategy_attack() -> Animation:
    """Terraria's overhand throw (useStyle 1) in its own order: up behind the head as the note leaves, as
    Terraria spawns a thrown projectile at the start of the use, then over the top, out and down in the
    follow-through, which leads back up into the next. Empty-handed throughout, as Terraria hides a thrown
    item: the note is only ever the one in flight, and a single tap ends low, never across the face."""
    throw = (Pose(near='up'), Pose(near='reach'), Pose(near='forward'), Pose(near='down'))
    release = hand(OUTFITS['strategy'], throw[2])
    # The note leaves from where the throw lets it go, just ahead of the outstretched hand, on every frame.
    muzzle = (release[0] + 3, release[1])
    return Animation('attack', 20, False, tuple(Frame(pose, {'muzzle': muzzle}) for pose in throw))


def strategy_skill() -> Animation:
    """Both hands thrown up as the skill fires, a star glinting over the front one, where NORTH STAR's star
    leaves (or CHURN SHIELD's bubble rises round him), then the arms spread and come down."""
    up = Pose(near='up', far='up')
    top = far_hand(up)
    star = (top[0], top[1] - 4)
    poses = (
        up._replace(props=(Prop(glint(star, big=True), 'front'),)),
        up._replace(props=(Prop(glint(star, big=False), 'front'),)),
        up,
        Pose(near='spread', far='spread'),
        Pose(near='flung', far='flung'),
        Pose(far='walk'),
    )
    return Animation('skill', 15, False, tuple(skill_frame(pose, far_hand(pose)) for pose in poses))


def skill_frame(pose: Pose, held: Point) -> Frame:
    """A skill frame with its `hand` anchor, where the skill's effect attaches, and its `mouth`."""
    return Frame(pose, {'hand': held, 'mouth': mouth(pose)})


class Moves(NamedTuple):
    attack: Callable[[], Animation]
    skill: Callable[[], Animation]
    # Skills the hero poses their own way, each as `skill-<skillId>`, played instead of `skill` for that skill.
    own: Tuple[Callable[[], Animation], ...] = ()


MOVES: Dict[str, Moves] = {
    'hackerman': Moves(hackerman_attack, hackerman_skill),
    'artsy': Moves(artsy_attack, artsy_skill, (artsy_elixir,)),
    'strategy': Moves(strategy_attack, strategy_skill),
}
