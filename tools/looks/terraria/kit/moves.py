"""The moves every hero shares, timed and posed after Terraria's own player.

Terraria's player stands perfectly still but for a blink; walks on a 13-frame cycle with its upper
body bobbing a pixel on the first three frames of each stride; and has one airborne frame, legs split,
the front fist folded up behind the head and the back hand peeking out ahead of the face, for jumping,
falling and being knocked back. The ones Terraria has no frames for (the hit itself, victory) are built
from the frames it has.

His hair follows the body a frame behind, as Terraria's hairstyle 143 does through the walk: its front lock
flips up a pixel after the body rises and settles a frame after it comes down. In the air Terraria draws the
hair as it rests, so rising it rests; once he starts to come down it floats, the nape off the ear too, and it
drops back to rest the frame he lands, a pixel at each loose end, as his body lands in one frame. A hair that
never moves (the look's, or any under a cap or a hood) draws every state the same.
"""
from __future__ import annotations

from typing import Dict, NamedTuple, Tuple

from .art import Point
from .pose import Pose, carried

# The mouth Terraria never draws: the lips, just under the nose and behind its tip, where a potion meets them.
MOUTH: Point = (20, 21)
# The top of his head, hair or cap: every frame's `head` anchor, which tells the HUD where to frame its
# portrait, and a skill's effect what to clear, on a hero drawn smaller than his frame (docs/LOOKS.md).
CROWN: Point = (17, 10)


class Frame(NamedTuple):
    pose: Pose
    # Named points of this frame in design space (docs/LOOKS.md anchors), already moved with the body.
    anchors: Dict[str, Point] = {}


class Animation(NamedTuple):
    name: str
    fps: float
    loop: bool
    frames: Tuple[Frame, ...]


def mouth(pose: Pose) -> Point:
    return carried(MOUTH, pose)


def idle() -> Animation:
    """Standing still, blinking once every two seconds the way Terraria 1.4's eyelids close."""
    eyes = ['open'] * 16 + ['half', 'shut', 'half', 'open']
    return Animation('idle', 10, True, tuple(Frame(Pose(eyes=state)) for state in eyes))


# Terraria's walk, its leg-sheet frames 7 to 19, with the arm cells and the bob it pairs with each.
RUN_LEGS = ('stride lift', 'stride swing', 'stride wide', 'stride close', 'stand', 'pass', 'cross',
            'step lift', 'step swing', 'step wide', 'step close', 'step close', 'cross')
RUN_NEAR = ('walk back',) * 4 + ('walk',) * 3 + ('walk forward', 'walk front', 'walk front', 'walk forward',
                                                  'walk', 'walk')
RUN_FAR = ('walk out',) * 4 + ('walk',) * 3 + ('walk in', 'walk behind', 'walk behind', 'walk in', 'walk', 'walk')
RUN_BOB = (1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0)
# Hairstyle 143's frames 1 to 13, which go with those leg frames: its lock bounces up a frame after the first
# bob starts, with the second (as Terraria draws it), and stays up until a frame after each ends.
RUN_HAIR = ('rest', 'bounce', 'bounce', 'bounce', 'rest', 'rest', 'rest', 'bounce', 'bounce', 'bounce', 'bounce',
            'rest', 'rest')


def run() -> Animation:
    """At full speed Terraria steps its walk about 29 times a second; 30 keeps every frame two game ticks."""
    frames = tuple(
        Frame(Pose(legs=legs, near=near, far=far, body=(0, -bob), hair=hair))
        for legs, near, far, bob, hair in zip(RUN_LEGS, RUN_NEAR, RUN_FAR, RUN_BOB, RUN_HAIR)
    )
    return Animation('run', 30, True, frames)


# Terraria's one airborne frame, for rising and falling alike: legs split, the near fist folded up behind the
# head and the far hand peeking out ahead of the face. Falling, the far hand sinks a pixel.
AIRBORNE = Pose(legs='split', near='air', far='air')


def jump() -> Animation:
    """Rising, his hair rests, as Terraria draws it in its airborne frame: it hangs behind the climb."""
    return Animation('jump', 10, False, (Frame(AIRBORNE),))


def fall() -> Animation:
    """Falling, his loose hair floats up off his head, the nape too, until he lands."""
    return Animation('fall', 10, True, (Frame(AIRBORNE._replace(far='air low', hair='float')),))


def hurt() -> Animation:
    """Knocked back, 0.3 s: the hit throws his arms open and his body a pixel back with his eyes screwed shut,
    leaving his lock behind, flared forward on his head; then it floats as he curls into Terraria's airborne
    frame, which the jump or fall that follows picks up."""
    hit = Pose(legs='split', near='flung', far='flung', eyes='wince')
    return Animation('hurt', 10, False, (
        Frame(hit._replace(body=(-1, 0), hair='flung')),
        Frame(hit._replace(hair='float')),
        Frame(AIRBORNE._replace(eyes='wince', hair='float')),
    ))


# A hop's lift at 20 frames a second: off the ground fast, hanging at the top, and back down.
HOP = (0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 5, 5, 5, 5, 4, 2)
# His hair through the hop, as through a jump and its fall: at rest on the ground and on the way up, floating a
# frame after he reaches the top, until he lands. So the loop starts at rest, however he comes to cheer.
HOP_HAIR = ('rest',) * 11 + ('float',) * 5


def victory() -> Animation:
    """A fist raised high and a hop on the spot, as a Terraria player celebrates: in the air, the split. Only
    victory raises a fist above the head, so nothing else ever reads as a cheer."""
    cheer = Pose(near='up')
    hop = Pose(legs='split', near='up', far='walk out')
    frames = tuple(
        Frame(hop._replace(lift=lift, hair=hair) if lift else cheer._replace(hair=hair))
        for lift, hair in zip(HOP, HOP_HAIR)
    )
    return Animation('victory', 20, True, frames)
