"""The terraria look's Unhappy Customer: ON THE PHONE in the five customer animations, timed to the game.

Posed the way Terraria poses its walkers, a drawing per limb chosen frame by frame and the upper body moved
as one, and timed to what the game holds each mood for (entities/customer/Customer.ts):
- `walk` is a heavy plod, 8 frames at 12 a second, the 0.67 s classic's takes, a step to each foot: the foot he
  stands on stays planted at the game's walking pace while the other passes it lifted and swings through, and
  the weight comes down on each with a 1 px stomp. The phone stays at his ear, his finger jabs on every step
  and his jaw goes on complaining into the phone, so the gag never stops. The game stands a still customer on
  the frame it shows 1/6 s in, so that frame is a foot striking, both feet down.
- `shout` yells for 0.4 s, one loop for the windup, and again as the complaint flies: the game restarts the
  animation when the bubble leaves, so the first frame is the yell itself, its mouth where the bubble
  leaves, and Terraria's anger emote pulses behind his head.
- `hurt` is a Terraria knockback, 0.2 s of the 0.22 s the hit holds: knocked off his feet and back, the phone
  jolted off his ear, eye screwed shut, his tie flung up; then he lands, the phone back at his ear.
- `stunned` sways on the spot for the 3 s stun, the phone hanging upside down from a limp hand and the eye
  rolling, Terraria's Dazed stars circling his head.
- `happy` hops for joy, two hops in the 0.8 s the game lets him cheer before he strolls off hopping: the
  call held away from his ear, a thumbs up bounced at you, his tie flying.
"""
from __future__ import annotations

from typing import Dict, NamedTuple, Tuple

from . import dazed
from .rig import Held, Pose


class Animation(NamedTuple):
    fps: float
    loop: bool
    frames: Tuple[Pose, ...]


ON_THE_PHONE = (Held('phone', 'near'),)

# ── walk ──
# A step to each foot, four frames apiece: the foot strikes ahead with both feet down, takes his weight, stands
# under his hips while the other passes it lifted, and pushes off behind while the other swings through. The
# foot he stands on steps back 2.5 px a frame (30 px/s at 12 frames a second, Customer.ts's walk), so at the
# game's pace it stays planted on the ground while he moves over it.
STEP = ('strike', 'down', 'pass', 'push')
# The weight coming down on the foot sinks the body a pixel: the stomp.
STEP_STOMP = (0, 1, 0, 0)
# The finger jabs at you with every step: from the wag by his face, through a half jab, out to the full point as
# the weight lands, and back.
STEP_ARM = ('jab', 'point', 'jab', 'wag')
STEP_FACE = ('rant half', 'grumble', 'grumble', 'rant half')
STEP_TIE = ('rest', 'bounce', 'rest', 'rest')
# Leaning into the walk, a pixel ahead of his feet.
LEAN = 1
# The game stands a still customer on the frame `walk` shows 1/6 s in (renderCustomer.ts): two frames in, so the
# cycle starts two frames before the far foot strikes and he stands with both feet down.
STANDING = 2


def walk() -> Animation:
    steps = tuple(
        Pose(mood='unhappy', face=face, legs=f'{foot} {phase}', near='phone', far=far, body=(LEAN, stomp),
             held=ON_THE_PHONE, swing=tie)
        for foot in ('far', 'near')
        for phase, stomp, far, face, tie in zip(STEP, STEP_STOMP, STEP_ARM, STEP_FACE, STEP_TIE)
    )
    return Animation(12, True, steps[-STANDING:] + steps[:-STANDING])


# ── shout ──
YELL = Pose(mood='unhappy', face='rant', near='phone', far='point', body=(LEAN, 0), head=(1, 0), held=ON_THE_PHONE,
            effects=('vein',), swing='bounce')


def shout() -> Animation:
    between = YELL._replace(face='rant half', far='wag', head=(0, 0), effects=('vein small',), swing='rest')
    return Animation(10, True, (YELL, between, YELL._replace(swing='rest'), between))


# ── hurt ──
def hurt() -> Animation:
    hit = Pose(mood='unhappy', face='wince', legs='knocked', near='phone flung', far='flung', body=(-2, 0),
               head=(-1, 0), held=(Held('phone flung', 'near'),), lift=1, swing='fly')
    return Animation(15, False, (
        hit,
        hit._replace(body=(-1, 0)),
        Pose(mood='unhappy', face='rant half', near='phone', far='wag', body=(0, 1), held=ON_THE_PHONE, swing='bounce'),
    ))


# ── stunned ──
SWAY = (0, 0, -1, -1, 0, 0, 1, 1)
ROLLING = ('up', 'up', 'front', 'front', 'down', 'down', 'back', 'back')


def stunned() -> Animation:
    frames = tuple(
        Pose(mood='unhappy', face=f'dazed {look}', near='limp', far='limp', body=(sway, 0), head=(sway, 1),
             held=(Held('phone dangling', 'near'),), effects=dazed.pair(index))
        for index, (sway, look) in enumerate(zip(SWAY, ROLLING))
    )
    return Animation(10, True, frames)


# ── happy ──
HOP = (0, 2, 4, 2, 0, 2, 4, 2)
TUCK = ('stand', 'tuck far', 'tuck far', 'tuck far', 'stand', 'tuck near', 'tuck near', 'tuck near')
HAPPY_TIE = ('rest', 'bounce', 'fly', 'fly', 'rest', 'bounce', 'fly', 'fly')


def happy() -> Animation:
    frames = tuple(
        Pose(mood='happy', face='happy', legs=legs, near='phone out', far='thumbs up' if lift < 4 else 'thumbs high',
             body=(0, 1 if lift == 0 else 0), lift=lift, held=(Held('phone', 'near'),), swing=tie)
        for lift, legs, tie in zip(HOP, TUCK, HAPPY_TIE)
    )
    return Animation(10, True, frames)


# In the order of the customer animations (docs/LOOKS.md).
ANIMATIONS: Dict[str, Animation] = {
    'walk': walk(),
    'shout': shout(),
    'hurt': hurt(),
    'stunned': stunned(),
    'happy': happy(),
}
