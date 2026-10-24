"""The moves every hero shares, timed and posed after Terraria's own player.

Terraria's player stands perfectly still but for a blink; walks on a 13-frame cycle with its upper
body bobbing a pixel on the first three frames of each stride; and has one airborne frame, legs split
and both arms up, for jumping, falling and being knocked back. The ones Terraria has no frames for
(victory) are built from the frames it has.
"""
from __future__ import annotations

from typing import Dict, NamedTuple, Tuple

from .art import Point
from .pose import Pose, carried

# The mouth Terraria never draws: where a skill puts a potion to the lips, a pixel below the nose.
MOUTH: Point = (21, 22)
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


# Terraria shows the same frame rising and falling; so do these, each in its own row of the sheet.
AIRBORNE = Pose(legs='split', near='up', far='up')


def jump() -> Animation:
    return Animation('jump', 10, False, (Frame(AIRBORNE),))


def fall() -> Animation:
    return Animation('fall', 10, True, (Frame(AIRBORNE),))


def hurt() -> Animation:
    """Knocked back into Terraria's airborne frame, screwed shut, the far arm flung back and the body shoved
    a pixel back by the hit; 0.3 s."""
    hit = AIRBORNE._replace(far='walk behind', eyes='wince')
    return Animation('hurt', 10, False, (
        Frame(hit._replace(body=(-1, 0))),
        Frame(hit),
        Frame(hit),
    ))


def victory() -> Animation:
    """A fist raised high and a hop on the spot, as a Terraria player celebrates: in the air, the split."""
    cheer = Pose(near='up')
    hop = AIRBORNE._replace(far='walk out')
    lifts = (0, 0, 2, 4, 5, 4, 2, 0)
    frames = tuple(Frame(hop._replace(lift=lift) if lift else cheer) for lift in lifts)
    return Animation('victory', 10, True, frames)

