"""A customer as layers hung from joints, and a pose as the drawing each layer wears and where the joints go.

Terraria poses its characters by picking a drawing per limb and moving the upper body, never by redrawing
the whole figure, and this rig does the same:
- The legs stand on the ground as drawn. The torso hangs from the hips and carries the upper body: the
  head hangs from its neck and each arm from its shoulder, so a bob or a lean moves them together.
- Each hand holds whatever is put in it: a prop is placed by its grip on the hand of the arm drawing the
  pose picks, so the same phone follows the arm into any pose.
- The face (eyes, brows, mouth), the hair and any hat are drawn over the head and move with it, and an
  effect (steam, an anger mark, stars) hangs from a point of the head, in front of the figure or behind it.
- A loose part (a tie) hangs from a joint of the torso in the drawing its swing names, so it rides the body
  and lags behind its moves.
- A hop lifts the whole figure, legs and all, off the ground.
- The mood dyes the skin: the face, the scalp and the ears flush while the customer is unhappy and calm once
  won over. The hands, and whatever skin a held prop shows, only warm a little, so the anger reads as a
  flush rather than a red-skinned person, a fist stays a fist and what it holds stays legible.
Every drawing is checked against the joint it hangs from, so a new arm or a new pair of legs always joins
the body where the standing one does: animating is a matter of adding drawings and poses.
"""
from __future__ import annotations

from typing import Dict, List, Mapping, NamedTuple, Tuple

from PIL import Image

from .art import Drawing, Dye, Point, Stroke, paint

# Where a prop is drawn: behind the torso with the far arm, in front of the torso under the near arm (so the
# near hand closes over it), or over the whole figure.
LAYERS = ('behind', 'held', 'front')
# The joints the torso hangs everything from, and the points every head names.
TORSO_JOINTS = ('neck', 'near shoulder', 'far shoulder', 'hips')
HEAD_POINTS = ('neck', 'mouth', 'crown')


class Worn(NamedTuple):
    """A drawing and what it is dyed in; its skin and hair, if it shows any, are the figure's."""
    drawing: Drawing
    dye: Dye = Dye()


class Prop(NamedTuple):
    """Something held: its drawing, with a `grip` point placed on the holding hand, and the layer it is drawn on."""
    drawing: Drawing
    dye: Dye = Dye()
    layer: str = 'held'


class Effect(NamedTuple):
    """Something the mood puts in the air, hung by its point `on` from the same point of the head, and drawn in
    front of the figure or, like a star circling round the back of the head, behind it."""
    drawing: Drawing
    on: str = 'crown'
    layer: str = 'front'


EFFECT_LAYERS = ('behind', 'front')


class Loose(NamedTuple):
    """A part hanging loose from a joint of the torso, a tie from its knot: a drawing per swing, each placed by
    its `knot` on that joint."""
    on: str
    swings: Mapping[str, Drawing]
    dye: Dye = Dye()


class Figure(NamedTuple):
    """One customer's layers: what every pose of them is drawn from.

    The first torso layer names the joints in TORSO_JOINTS, the head the points in HEAD_POINTS, every arm its
    `shoulder` and `hand`; every pair of legs covers the hips.
    """
    name: str
    legs: Mapping[str, Drawing]
    legs_dye: Dye
    torso: Tuple[Worn, ...]
    head: Drawing
    # Drawn over the head, by expression: eyes, brows (in the hair's tones) and mouth.
    faces: Mapping[str, Drawing]
    # Drawn over the face: the hair itself, then an ear or a hat.
    headwear: Tuple[Worn, ...]
    near_arms: Mapping[str, Drawing]
    far_arms: Mapping[str, Drawing]
    sleeves: Dye
    props: Mapping[str, Prop]
    effects: Mapping[str, Effect]
    # The skin's ramp in each mood (flushed while unhappy, calm once won over): what the head and the torso's
    # skin pixels are painted in; the hands' ramp in each mood, which the arms and held props are; and the
    # hair's, which every layer's hair pixels are.
    skin: Mapping[str, str]
    hands: Mapping[str, str]
    hair: str
    # Drawn over the torso and under the head, each in the swing the pose names.
    loose: Tuple[Loose, ...] = ()


class Held(NamedTuple):
    """A prop and what holds it: the `near` or `far` hand, or a point of the torso (a pocket)."""
    prop: str
    by: str


class Pose(NamedTuple):
    mood: str
    face: str
    legs: str = 'stand'
    near: str = 'hang'
    far: str = 'hang'
    # How far the upper body moves from standing, and the head on top of it (a lean, a thrust chin).
    body: Point = (0, 0)
    head: Point = (0, 0)
    held: Tuple[Held, ...] = ()
    effects: Tuple[str, ...] = ()
    # How far the whole figure leaves the ground, legs and all: a hop.
    lift: int = 0
    # How every loose part swings: hanging at rest, or bounced and flung by the body's moves.
    swing: str = 'rest'


class Posed(NamedTuple):
    """A pose resolved: every layer placed and dyed, in painting order, the figure's alone (without the effects in
    the air round it), and the head and hands where they went."""
    strokes: Tuple[Stroke, ...]
    figure: Tuple[Stroke, ...]
    head: Drawing
    hands: Mapping[str, Point]


def pick(drawings: Mapping[str, Drawing], name: str, what: str, where: str) -> Drawing:
    if name not in drawings:
        raise ValueError(f'{where}: no {what} {name!r}; there are {sorted(drawings)}')
    return drawings[name]


def hung(drawing: Drawing, joint: str, at: Point, where: str) -> Drawing:
    """`drawing` hung by its `joint` from `at`, which it must cover, so the limb meets the body."""
    placed = drawing.placed(joint, at)
    if not placed.covers(at):
        raise ValueError(f'{where}: {drawing.name} does not cover its {joint} at {at}')
    return placed


def pose(figure: Figure, posed: Pose, where: str) -> Posed:
    skin, hand = (ramps.get(posed.mood) for ramps in (figure.skin, figure.hands))
    if skin is None or hand is None:
        raise ValueError(f'{where}: {figure.name} has no skin or hands for the mood {posed.mood!r}')

    def worn(drawing: Drawing, dye: Dye, ramp: str = skin) -> Stroke:
        return Stroke(drawing, dye._replace(skin=ramp, hair=figure.hair))

    legs = pick(figure.legs, posed.legs, 'legs', where)
    standing = figure.torso[0].drawing
    for joint in TORSO_JOINTS:
        standing.point(joint)
    if not legs.covers(standing.point('hips')):
        raise ValueError(f'{where}: legs {posed.legs} do not cover the hips at {standing.point("hips")}')
    if posed.lift < 0:
        raise ValueError(f'{where}: lifts {posed.lift}, below the ground')
    # A hop lifts the legs off the ground and everything else with them.
    legs = legs.moved(0, -posed.lift)
    body = (posed.body[0], posed.body[1] - posed.lift)
    torso = [Worn(part.drawing.moved(*body), part.dye) for part in figure.torso]
    joints = torso[0].drawing

    for point in HEAD_POINTS:
        figure.head.point(point)
    neck = joints.point('neck')
    head = hung(figure.head, 'neck', (neck[0] + posed.head[0], neck[1] + posed.head[1]), where)
    # Whatever is drawn over the head moves as far as the head did.
    nod = (head.point('neck')[0] - figure.head.point('neck')[0], head.point('neck')[1] - figure.head.point('neck')[1])
    face = pick(figure.faces, posed.face, 'face', where).moved(*nod)
    headwear = [Worn(part.drawing.moved(*nod), part.dye) for part in figure.headwear]

    near = hung(pick(figure.near_arms, posed.near, 'near arm', where), 'shoulder', joints.point('near shoulder'), where)
    far = hung(pick(figure.far_arms, posed.far, 'far arm', where), 'shoulder', joints.point('far shoulder'), where)
    hands = {'near': near.point('hand'), 'far': far.point('hand')}
    holders = {**{name: point for name, point in joints.points}, **hands}

    props: Dict[str, List[Stroke]] = {layer: [] for layer in LAYERS}
    for held in posed.held:
        if held.by not in holders:
            raise ValueError(f'{where}: {held.prop} is held by {held.by!r}, not one of {sorted(holders)}')
        prop = figure.props.get(held.prop)
        if prop is None:
            raise ValueError(f'{where}: no prop {held.prop!r}; there are {sorted(figure.props)}')
        if prop.layer not in LAYERS:
            raise ValueError(f'{where}: {held.prop} is drawn on {prop.layer!r}, not one of {LAYERS}')
        props[prop.layer].append(worn(prop.drawing.placed('grip', holders[held.by]), prop.dye, hand))

    loose = []
    for part in figure.loose:
        drawing = pick(part.swings, posed.swing, f'swing of what hangs from the {part.on}', where)
        loose.append(worn(drawing.placed('knot', joints.point(part.on)), part.dye))

    effects: Dict[str, List[Stroke]] = {layer: [] for layer in EFFECT_LAYERS}
    for name in posed.effects:
        effect = figure.effects.get(name)
        if effect is None:
            raise ValueError(f'{where}: no effect {name!r}; there are {sorted(figure.effects)}')
        if effect.layer not in EFFECT_LAYERS:
            raise ValueError(f'{where}: {name} is drawn on {effect.layer!r}, not one of {EFFECT_LAYERS}')
        effects[effect.layer].append(Stroke(effect.drawing.placed(effect.on, head.point(effect.on)), Dye()))

    drawn = (
        worn(far, figure.sleeves, hand),
        *props['behind'],
        worn(legs, figure.legs_dye),
        *(worn(part.drawing, part.dye) for part in torso),
        *loose,
        worn(head, Dye()),
        worn(face, Dye()),
        *(worn(part.drawing, part.dye) for part in headwear),
        *props['held'],
        worn(near, figure.sleeves, hand),
        *props['front'],
    )
    return Posed((*effects['behind'], *drawn, *effects['front']), drawn, head, hands)


def top(posed: Posed) -> Point:
    """The top of the head and of whatever stands on it (its hair, a hat, the antenna of a phone held to the ear):
    the figure's highest pixel over the head's columns, which everything shown above a customer must clear."""
    columns = [x for x, _, _ in posed.head.pixels]
    left, right = min(columns), max(columns)
    rows = [y for stroke in posed.figure for x, y, _ in stroke.drawing.pixels if left <= x <= right]
    return posed.head.point('crown')[0], min(rows)


def compose(figure: Figure, posed: Pose, where: str) -> Image.Image:
    return paint(pose(figure, posed, where).strokes, where)
