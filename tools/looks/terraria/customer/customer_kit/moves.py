"""The terraria look's Unhappy Customer: ON THE PHONE in the five customer animations, timed to the game.

Posed the way Terraria poses its walkers, a drawing per limb chosen frame by frame and the upper body moved
as one, and timed to what the game holds each mood for (entities/customer/Customer.ts):
- `walk` is a heavy plod, 8 frames at 12 a second, the 0.67 s classic's takes: the weight comes down on each
  foot with a 1 px stomp while the phone stays at his ear, his finger jabs on every step and his jaw goes on
  complaining into the phone, so the gag never stops. The game stands a still customer on the frame it
  shows 1/6 s in, so that frame stands on both feet.
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
WALK_LEGS = ('far strike', 'far down', 'stand', 'near lift', 'near strike', 'near down', 'stand', 'far lift')
# The weight coming down on a foot sinks the body a pixel: the stomp.
WALK_STOMP = (0, 1, 0, 0, 0, 1, 0, 0)
WALK_ARM = ('point', 'point', 'wag', 'wag', 'point', 'point', 'wag', 'wag')
WALK_FACE = ('rant half', 'grumble', 'grumble', 'rant half', 'rant half', 'grumble', 'grumble', 'rant half')
WALK_TIE = ('rest', 'bounce', 'rest', 'rest', 'rest', 'bounce', 'rest', 'rest')
# Leaning into the walk, a pixel ahead of his feet.
LEAN = 1


def walk() -> Animation:
    frames = tuple(
        Pose(mood='unhappy', face=face, legs=legs, near='phone', far=far, body=(LEAN, stomp), held=ON_THE_PHONE,
             swing=tie)
        for legs, stomp, far, face, tie in zip(WALK_LEGS, WALK_STOMP, WALK_ARM, WALK_FACE, WALK_TIE)
    )
    return Animation(12, True, frames)


# The frame a still customer stands on: the one `walk` shows 1/6 s in (renderCustomer.ts).
STANDING = 2


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
