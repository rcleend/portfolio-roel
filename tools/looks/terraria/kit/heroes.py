"""Each hero's attack and skill: the only moves with props, which appear only while they are used.

An attack's first frame is the moment its shot leaves, because the game fires as the pose starts: its
`muzzle` anchor (docs/LOOKS.md) is where the shot is drawn from. Attacks repeat for as long as the
button is held, each starting over, so every attack ends in the pose that leads into its first frame.
A skill's `hand` is where a skill's effect attaches and its `mouth` where a potion would meet the lips;
each hero has one skill pose that suits both of his skills.
"""
from __future__ import annotations

from typing import Callable, Dict, Optional, Tuple

from .art import Point
from .moves import Animation, Frame, mouth
from .outfits import OUTFITS
from .pose import Pose, Prop, carried, hand
from .props import FRET_HAND, GUITAR, KEY_BURST, KEYBOARD_FRONT, NECK, STRINGS, glint, keyboard, note

# ── ENGINEER: types on a summoned keyboard; his skill slams Enter ──────────────────────────────────────


def hackerman_attack() -> Animation:
    """A two-key flurry in 0.22 s, the attack's cooldown: struck at the front, then nearer the body."""
    keys = (
        Pose(near='type', near_at=(0, 1), props=(Prop(keyboard(lit=4)),)),
        Pose(near='type close', props=(Prop(keyboard()),)),
        Pose(near='type close', near_at=(0, 1), props=(Prop(keyboard(lit=2)),)),
        Pose(near='type', props=(Prop(keyboard()),)),
    )
    return Animation('attack', 18, False, tuple(Frame(pose, {'muzzle': carried(KEYBOARD_FRONT, pose)}) for pose in keys))


def hackerman_skill() -> Animation:
    """Execute: Enter slammed as the skill fires, bursting green, then the hand held on the lit key while
    FULL-STACK ATTACK's beam or AGENT SUMMON's drone leaves the keyboard's front."""
    slam = Pose(near='type', near_at=(0, 1), body=(0, 1), props=(Prop(keyboard(lit=4)), Prop(KEY_BURST, 'front')))
    held = Pose(near='type', near_at=(0, 1), props=(Prop(keyboard(lit=4)),))
    poses = (slam, slam._replace(body=(0, 0)), held, held, held, Pose(near='type', props=(Prop(keyboard()),)))
    return Animation('skill', 15, False, tuple(skill_frame('hackerman', pose, KEYBOARD_FRONT) for pose in poses))


# ── DESIGNER: strums the white Strat; his skill is one big power chord ───────────────────────────────

GUITAR_HELD = (Prop(GUITAR), Prop(FRET_HAND, 'grip'))


def strum(near: str, props: Tuple[Prop, ...] = GUITAR_HELD, **changes) -> Pose:
    return Pose(near=near, far='grip', props=props, **changes)


def artsy_attack() -> Animation:
    """The downstroke flings the paint; the hand rides back up for the next one, 0.3 s in all."""
    strokes = (strum('strum low'), strum('strum low'), strum('strum high'), strum('strum high'),
               strum('strum high'), strum('strum high'))
    return Animation('attack', 20, False, tuple(Frame(pose, {'muzzle': carried(NECK, pose)}) for pose in strokes))


def artsy_skill() -> Animation:
    """A rock-star power chord: crashed down through the strings as the skill fires (POWER CHORD), which
    flash, then the arm swung on round and thrown up high, where UX ELIXIR's potion is raised to the sky."""
    flash = GUITAR_HELD + (Prop(glint(STRINGS, big=True), 'front'),)
    ring = GUITAR_HELD + (Prop(glint(STRINGS, big=False), 'front'),)
    poses = (
        strum('strum low', near_at=(0, 1), body=(0, 1), props=flash),
        strum('strum low', props=ring),
        strum('forward'),
        strum('up', body=(0, -1)),
        strum('up', body=(0, -1)),
        strum('up'),
    )
    return Animation('skill', 15, False, tuple(skill_frame('artsy', pose) for pose in poses))


# ── STRATEGIST: flicks sticky notes like shuriken; his skill raises both hands ──────────────────────


def strategy_attack() -> Animation:
    """Terraria's overhand throw, its swing frames turned so the release comes first: out (the note is
    gone), down in the follow-through, back up behind the head with the next note, and over the top."""
    def holding(near: str) -> Pose:
        pose = Pose(near=near)
        return pose._replace(props=(Prop(note(hand(OUTFITS['strategy'], pose)), 'front'),))

    throw = (Pose(near='forward'), Pose(near='down'), holding('up'), holding('reach'))
    release = hand(OUTFITS['strategy'], throw[0])
    # The note leaves from the fingertips, just ahead of the hand's middle.
    muzzle = (release[0] + 3, release[1])
    return Animation('attack', 18, False, tuple(Frame(pose, {'muzzle': muzzle}) for pose in throw))


def strategy_skill() -> Animation:
    """Both hands thrown up as the skill fires, a star glinting in the near one: NORTH STAR launched from
    it, or CHURN SHIELD raised around him."""
    up = Pose(near='up', far='up', body=(0, -1))
    top = hand(OUTFITS['strategy'], up)
    star = (top[0], top[1] - 4)
    poses = (
        up._replace(props=(Prop(glint(star, big=True), 'front'),)),
        up._replace(props=(Prop(glint(star, big=False), 'front'),)),
        up,
        up._replace(body=(0, 0)),
        up._replace(body=(0, 0)),
        Pose(near='reach'),
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
