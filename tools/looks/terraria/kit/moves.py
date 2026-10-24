"""The moves every hero shares, timed and posed after Terraria's own player.

Terraria's player stands perfectly still but for a blink; walks on a 13-frame cycle with its upper
body bobbing a pixel on the first three frames of each stride; and has one airborne frame, legs split,
the front fist folded up behind the head and the back hand peeking out ahead of the face, for jumping,
falling and being knocked back. The ones Terraria has no frames for (the hit itself, victory) are built
from the frames it has.
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


def run() -> Animation:
    """At full speed Terraria steps its walk about 29 times a second; 30 keeps every frame two game ticks."""
    frames = tuple(
        Frame(Pose(legs=legs, near=near, far=far, body=(0, -bob)))
        for legs, near, far, bob in zip(RUN_LEGS, RUN_NEAR, RUN_FAR, RUN_BOB)
    )
    return Animation('run', 30, True, frames)


# Terraria's one airborne frame, for rising and falling alike: legs split, the near fist folded up behind the
# head and the far hand peeking out ahead of the face. Falling, the far hand sinks a pixel.
AIRBORNE = Pose(legs='split', near='air', far='air')


def jump() -> Animation:
    return Animation('jump', 10, False, (Frame(AIRBORNE),))


def fall() -> Animation:
    return Animation('fall', 10, True, (Frame(AIRBORNE._replace(far='air low')),))


def hurt() -> Animation:
    """Knocked back, 0.3 s: the hit throws his arms open and his body a pixel back with his eyes screwed shut,
    then he curls into Terraria's airborne frame, which the jump or fall that follows picks up."""
    hit = Pose(legs='split', near='flung', far='flung', eyes='wince')
    return Animation('hurt', 10, False, (
        Frame(hit._replace(body=(-1, 0))),
        Frame(hit),
        Frame(AIRBORNE._replace(eyes='wince')),
    ))


# A hop's lift at 20 frames a second: off the ground fast, hanging at the top, and back down.
HOP = (0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 5, 5, 5, 5, 4, 2)


def victory() -> Animation:
    """A fist raised high and a hop on the spot, as a Terraria player celebrates: in the air, the split. Only
    victory raises a fist above the head, so nothing else ever reads as a cheer."""
    cheer = Pose(near='up')
    hop = Pose(legs='split', near='up', far='walk out')
    frames = tuple(Frame(hop._replace(lift=lift) if lift else cheer) for lift in HOP)
    return Animation('victory', 20, True, frames)
