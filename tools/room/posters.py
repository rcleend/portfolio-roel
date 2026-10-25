"""The decorated attic: 29 printed pieces and a corkboard baked in the room's own night scene.

Reads tools/room/assets/posters/layout.json (docs/ROOM.md › Posters) and the artwork masters
(POSTERS_SOURCE, not committed; masters.json pins their hashes). Three stages, each in its own
Blender process; the room scene is opened fresh and never saved:

  layout   validates the layout (keep-outs incl. tapes, pins and skirts; surface bounds; declared
           overlaps on distinct layers; the eleven topics), derives every shipped mesh piece and
           packs the atlas islands (MaxRects, even texel coordinates) into
           WORK/posters-layout.json and WORK/posters-geometry.json. Needs no scene (plain python3
           runs it too): seconds.
  bake     builds the detailed bake sheets, the lit tape strips, pins and the corkboard in the
           room scene and bakes them onto the flat shipped pieces, one whole-atlas pass per
           process (--passes beauty|under|bare|shadow|albedo|normal → WORK/posters-bake-<pass>).
  compose  needs no scene: OIDN-denoises the lit islands (albedo + normal guides), derives the
           skirt factors, die-cuts the sheets, writes WORK/posters-atlas-2k.png, the per-island
           Lanczos3 WORK/posters-atlas-1k.png and WORK/posters-tapes.json (tape, skirt and noise
           measurements). Exits 3 after widening a skirt side (WORK/posters-skirts.json): the
           layout and every pass then run again.

tools/room/build-posters.mjs runs the loop; tools/room/posters.mjs turns the outputs into the
runtime files (posters.glb, posters-2k.webp, posters-1k.webp).

  "$BLENDER_BIN" -b --python-exit-code 1 --python tools/room/posters.py -- \\
    --work .context/room-build --stage layout

Coordinates are Blender's (Z up) unless named `three`; three.js = (x, z, -y). A surface point is
(a, b): on the back wall (x, z) on y = BACK_Y, on the slope (y, s) with s metres down the slope
from the ridge.
"""

import argparse
import bisect
import hashlib
import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'tools/room/assets/posters'

BACK_Y = 2.405
RIDGE = (0.95, 3.28)
SLOPE_DIR = (0.797, 0.0, -0.603)  # down the slope, ridge to knee wall
SLOPE_NORMAL = (-0.603, 0.0, -0.797)  # into the room
SLOPE_LENGTH = 2.32

#: Layer n's card sits CARD_BASE + CARD_STEP·n off its surface; cork pieces (layer ≥ 11) sit on the cork.
CARD_BASE, CARD_STEP = 0.001, 0.00075
CORK_FACE, CORK_STEP = 0.0185, 0.0005
#: A tape overhang lies this far over what is under it, ramping down from the card within OVERHANG_RAMP.
TAPE_LIFT, OVERHANG_RAMP = 0.0003, 0.004
#: How far a corner tape reaches onto its sheet, along the diagonal.
TAPE_IN = 0.004
#: Hidden tapes (≥ this share under a higher sheet) are baked on the sheet but emit no overhang.
HIDDEN_SKIP = 0.9
PIN_RADIUS = 0.0055
#: Pixel gutter on every side of an island at the 2K tier (8 px between islands; 4 px at the 1K).
GUTTER_SIDE = 4
SMALL_DENSITY = 6.0  # px/cm: cork pieces, the sticker and the cut-out (small type, tape edges)
CORK_DENSITY = 4.25
PIN_PALETTE_PX = 16

CORNERS = {'BL': (-1, -1), 'BR': (1, -1), 'TR': (1, 1), 'TL': (-1, 1)}


# ---------------------------------------------------------------- data

def load_layout():
    return json.loads((ASSETS / 'layout.json').read_text())


def load_masters():
    return {m['key']: m for m in json.loads((ASSETS / 'masters.json').read_text())}


def sources_dir():
    path = os.environ.get('POSTERS_SOURCE')
    if not path:
        raise SystemExit('Set POSTERS_SOURCE to the folder of artwork masters (tools/room/assets/posters/SOURCES.md)')
    return Path(path).resolve()


def assert_masters(layout, masters, root):
    """Every master is the exact file the layout was designed on (they came through a re-encoding proxy)."""
    for item in layout['items']:
        master = masters[item['key']]
        path = root / master['file']
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == master['sha256'], (item['key'], 'master hash differs', path)
        assert item['source'] == master['file'], (item['key'], 'layout and masters.json disagree')


# ---------------------------------------------------------------- 2D geometry (surface coordinates, metres)

def rotate(u, v, degrees):
    t = math.radians(degrees)
    return u * math.cos(t) - v * math.sin(t), u * math.sin(t) + v * math.cos(t)


def to_surface(item, u, v):
    """Sheet-local (u right, v up) → surface (a, b). On the slope a sheet's right is -y and its up the ridge."""
    ur, vr = rotate(u, v, item['rot'])
    if item['surface'] == 'slope':
        return item['a'] - ur, item['b'] - vr
    return item['a'] + ur, item['b'] + vr


def rect(item, pad=0.0):
    w, h = item['w'] / 2 + pad, item['h'] / 2 + pad
    return [to_surface(item, su * w, sv * h) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


#: Skirt sides in sheet-local terms: bottom, top, left, right.
SKIRT_KEYS = ('b', 't', 'l', 'r')


def skirt_sides(layout, key, skirts=None):
    """An item's skirt width per side: the layout's default, its committed `skirtSides` override, then any widening
    the compose stage asked for (WORK/posters-skirts.json, {key: {side: metres}})."""
    sides = dict.fromkeys(SKIRT_KEYS, layout['skirt'])
    sides.update(layout.get('skirtSides', {}).get(key, {}))
    sides.update((skirts or {}).get(key, {}))
    return sides


def skirt_corner(item, sides, corner):
    """Sheet-local outer corner of the skirt at a corner given as signs (±1, ±1)."""
    sx, sy = corner
    return (sx * (item['w'] / 2 + sides['r' if sx > 0 else 'l']), sy * (item['h'] / 2 + sides['t' if sy > 0 else 'b']))


def skirt_rect(item, sides):
    return [to_surface(item, *skirt_corner(item, sides, c)) for c in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def box(b):
    return [(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])]


def signed_area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2


def area(p):
    return abs(signed_area(p))


def ccw(p):
    return p if signed_area(p) > 0 else p[::-1]


def clip(subject, clipper):
    """Sutherland-Hodgman: subject ∩ convex clipper."""
    subject, clipper = ccw(list(subject)), ccw(list(clipper))

    def inside(p, a, b):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0

    def cross(p1, p2, a, b):
        d = (p1[0] - p2[0]) * (a[1] - b[1]) - (p1[1] - p2[1]) * (a[0] - b[0])
        if abs(d) < 1e-15:
            return p2
        t = ((p1[0] - a[0]) * (a[1] - b[1]) - (p1[1] - a[1]) * (a[0] - b[0])) / d
        return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]))

    out = subject
    for i in range(len(clipper)):
        a, b = clipper[i], clipper[(i + 1) % len(clipper)]
        points, out = out, []
        if not points:
            break
        s = points[-1]
        for e in points:
            if inside(e, a, b):
                if not inside(s, a, b):
                    out.append(cross(s, e, a, b))
                out.append(e)
            elif inside(s, a, b):
                out.append(cross(s, e, a, b))
            s = e
    return out


def overlap(p, q):
    r = clip(p, q)
    return area(r) if len(r) >= 3 else 0.0


def gap(p, q):
    """Smallest distance between two convex polygons (0 when they touch or overlap)."""
    if overlap(p, q) > 1e-10:
        return 0.0

    def segment(pt, a, b):
        ax, ay = b[0] - a[0], b[1] - a[1]
        t = max(0.0, min(1.0, ((pt[0] - a[0]) * ax + (pt[1] - a[1]) * ay) / (ax * ax + ay * ay)))
        return math.hypot(pt[0] - a[0] - t * ax, pt[1] - a[1] - t * ay)

    return min(min(segment(pt, q[i], q[(i + 1) % len(q)]) for pt in p for i in range(len(q))),
               min(segment(pt, p[i], p[(i + 1) % len(p)]) for pt in q for i in range(len(p))))


def outside_rect(subject, w, h):
    """Parts of a convex polygon (sheet-local) outside the centred w×h rectangle: [(edge, convex piece)],
    edge = (nx, ny, d), the sheet edge n·p = d the piece lies beyond."""
    pieces, rest = [], list(subject)
    for edge in ((1, 0, w / 2), (-1, 0, w / 2), (0, 1, h / 2), (0, -1, h / 2)):
        nx, ny, d = edge
        beyond = half_plane(rest, nx, ny, d, keep_beyond=True)
        if len(beyond) >= 3 and area(beyond) > 1e-10:
            pieces.append((edge, beyond))
        rest = half_plane(rest, nx, ny, d, keep_beyond=False)
        if len(rest) < 3:
            break
    return pieces


def half_plane(poly, nx, ny, d, keep_beyond):
    """Clip a polygon to n·p ≥ d (keep_beyond) or n·p ≤ d."""
    out = []
    sign = 1 if keep_beyond else -1
    for i, p in enumerate(poly):
        q = poly[(i + 1) % len(poly)]
        fp, fq = sign * (nx * p[0] + ny * p[1] - d), sign * (nx * q[0] + ny * q[1] - d)
        if fp >= 0:
            out.append(p)
        if (fp >= 0) != (fq >= 0):
            t = fp / (fp - fq)
            out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out


# ---------------------------------------------------------------- what an item emits

def tape_frame(tape):
    """Centre, along and across unit vectors of a tape strip in its sheet's frame."""
    a = math.radians(tape['angle'])
    du, dv = math.cos(a), math.sin(a)
    return (tape['u'], tape['v']), (du, dv), (-dv, du)


def tape_outline(layout, tape):
    """The strip's four corners in its sheet's frame (sheet-local metres)."""
    length, width = layout['tapeSize']
    (cu, cv), (du, dv), (nu, nv) = tape_frame(tape)
    half_l, half_w = length / 2, width / 2
    return [(cu + du * sl * half_l + nu * sw * half_w, cv + dv * sl * half_l + nv * sw * half_w)
            for sl, sw in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def overhangs(layout, item):
    """{spot: [(edge, convex piece of the strip beyond that sheet edge)]} (sheet-local), hidden tapes excluded."""
    out = {}
    for tape in item['tapes']:
        if tape.get('hiddenFraction', 0) >= HIDDEN_SKIP:
            continue
        pieces = outside_rect(tape_outline(layout, tape), item['w'], item['h'])
        if pieces:
            out[tape['spot']] = pieces
    return out


def pin_spots(item):
    """Push pins, sheet-local: one near the top centre of a cork piece."""
    if item['attach'] == 'pin1':
        return [(0.0, 0.4 * item['h'])]
    return []


def card_offset(item):
    if item.get('cork'):
        return CORK_FACE + CORK_STEP * (item['layer'] - 10)
    return CARD_BASE + CARD_STEP * item['layer']


def footprint(layout, item, sides=None):
    """Every polygon the item emits, in surface coordinates: [(name, polygon)]."""
    out = [('sheet', rect(item))]
    for tape in item['tapes']:
        out.append(('tape ' + tape['spot'], [to_surface(item, u, v) for u, v in tape_outline(layout, tape)]))
    for k, (u, v) in enumerate(pin_spots(item)):
        r = PIN_RADIUS
        out.append((f'pin {k}', [to_surface(item, u + r * math.cos(t), v + r * math.sin(t))
                                 for t in (i * math.pi / 4 for i in range(8))]))
    if not item.get('cork'):
        out.append(('skirt', skirt_rect(item, sides or skirt_sides(layout, item['key']))))
    return out


def corkboard_item(layout):
    c = layout['corkboard']
    return dict(key='corkboard', surface='back', a=c['x'], b=c['z'], w=c['w'], h=c['h'], rot=0.0, layer=0)


def on_surface(surface, a, b):
    if surface == 'back':
        top = RIDGE[1] if a <= RIDGE[0] else RIDGE[1] - (a - RIDGE[0]) * 0.757
        return -2.80 <= a <= 2.80 and 0 <= b <= top
    return -2.40 <= a <= 2.40 and 0 <= b <= SLOPE_LENGTH


# ---------------------------------------------------------------- the contract

def validate(layout, skirts=None):
    """Returns the list of violations of docs/ROOM.md's posters contract (empty when it holds)."""
    bad = []
    skirts = skirts or {}
    items = layout['items']
    topics = {item['topic'] for item in items}
    if topics != set(layout['topics']) or len(topics) != 11:
        bad.append(f'topics {sorted(topics ^ set(layout["topics"]))}')
    keys = [item['key'] for item in items]
    if len(set(keys)) != len(keys):
        bad.append('duplicate keys')
    board = corkboard_item(layout)
    emitters = items + [board]
    for item in emitters:
        sides = skirt_sides(layout, item['key'], skirts)
        polys = footprint(layout, item, sides) if item is not board else \
            [('corkboard', rect(board)), ('skirt', skirt_rect(board, sides))]
        for name, poly in polys:
            for zone, zbox in layout['keepouts'][item['surface']].items():
                a = overlap(poly, box(zbox))
                if a > 0:
                    bad.append(f"{item['key']} {name} enters the {zone} keep-out by {a * 1e4:.2f} cm²")
            # A skirt may run past its surface's edge (into the room's corner, behind the slope): it is hidden there.
            if name != 'skirt' and not all(on_surface(item['surface'], *q) for q in poly):
                bad.append(f"{item['key']} {name} leaves its surface")
    declared = {tuple(sorted(pair)) for pair in layout['overlaps']}
    wall = [item for item in items if not item.get('cork')]
    for i, p in enumerate(wall):
        for q in wall[i + 1:]:
            if p['surface'] != q['surface'] or overlap(rect(p), rect(q)) <= 0:
                continue
            pair = tuple(sorted((p['key'], q['key'])))
            if pair not in declared:
                bad.append(f'undeclared overlap {pair}')
            if p['layer'] == q['layer']:
                bad.append(f'same-layer overlap {pair}')
    for pair in declared:
        a, b = (next(i for i in items if i['key'] == k) for k in pair)
        if overlap(rect(a), rect(b)) <= 0:
            bad.append(f'declared overlap {pair} does not overlap')
    cork = [item for item in items if item.get('cork')]
    for i, p in enumerate(cork):
        if overlap(rect(p), rect(board)) < 0.8 * area(rect(p)):
            bad.append(f"{p['key']} hangs off the corkboard")
        for q in cork[i + 1:]:
            if overlap(rect(p), rect(q)) > 0 and p['layer'] == q['layer']:
                bad.append(f"cork same-layer overlap {p['key']} {q['key']}")
    return bad


# ---------------------------------------------------------------- atlas islands and packing

def even(n):
    n = math.ceil(n - 1e-9)
    return n + (n & 1)


def islands(layout, skirts=None):
    """Every atlas island: {id, kind, item, w, h (content px, even), frame (how its geometry maps onto it)}."""
    skirts = skirts or {}
    skirt_density = layout['atlas']['skirtDensity']
    out = []
    for item in layout['items']:
        d = item['density']
        out.append(dict(id=item['key'], kind='card', item=item['key'], density=d,
                        w=even(item['w'] * 100 * d), h=even(item['h'] * 100 * d)))
        for spot, pieces in overhangs(layout, item).items():
            tape = next(t for t in item['tapes'] if t['spot'] == spot)
            (cu, cv), along, across = tape_frame(tape)
            pts = [p for _edge, piece in pieces for p in piece]
            s = [(p[0] - cu) * along[0] + (p[1] - cv) * along[1] for p in pts]
            t = [(p[0] - cu) * across[0] + (p[1] - cv) * across[1] for p in pts]
            out.append(dict(id=f"{item['key']}.tape.{spot}", kind='overhang', item=item['key'], spot=spot, density=d,
                            extent=[min(s), min(t), max(s), max(t)],
                            w=even((max(s) - min(s)) * 100 * d), h=even((max(t) - min(t)) * 100 * d)))
        if not item.get('cork'):
            out.extend(skirt_islands(item['key'], item['w'], item['h'], skirt_sides(layout, item['key'], skirts),
                                     skirt_density))
    board = layout['corkboard']
    out.extend(skirt_islands('corkboard', board['w'], board['h'], skirt_sides(layout, 'corkboard', skirts),
                             skirt_density))
    out.append(dict(id='corkboard.face', kind='cork-face', item='corkboard', density=CORK_DENSITY,
                    w=even(board['w'] * 100 * CORK_DENSITY), h=even(board['h'] * 100 * CORK_DENSITY)))
    perimeter = 2 * (board['w'] + board['h'])
    out.append(dict(id='corkboard.sides', kind='cork-sides', item='corkboard', density=CORK_DENSITY,
                    w=even(perimeter * 100 * CORK_DENSITY), h=even(1.8 * CORK_DENSITY)))
    out.append(dict(id='pins', kind='pins', item='corkboard', density=None, w=PIN_PALETTE_PX, h=PIN_PALETTE_PX))
    return out


def skirt_islands(key, w, h, sides, density):
    """A skirt is four trapezoids around the sheet, each as wide as its side's skirt; each maps planar onto a strip
    as long as its outer edge. `skirt` carries all four widths (a side's outer corners take its neighbours')."""
    lengths = {'b': w + sides['l'] + sides['r'], 't': w + sides['l'] + sides['r'],
               'l': h + sides['b'] + sides['t'], 'r': h + sides['b'] + sides['t']}
    return [dict(id=f'{key}.skirt.{side}', kind='skirt', item=key, side=side, skirt=dict(sides), density=density,
                 w=even(lengths[side] * 100 * density), h=even(sides[side] * 100 * density))
            for side in SKIRT_KEYS]


def maxrects(rects, width, height):
    """MaxRects best-short-side-fit with 90° rotation. rects: [(id, w, h)] → {id: (x, y, w, h, rotated)} or None."""
    free = [(0, 0, width, height)]
    out = {}
    for rid, w, h in sorted(rects, key=lambda r: (-max(r[1], r[2]) * min(r[1], r[2]), r[0])):
        best = None
        for fx, fy, fw, fh in free:
            for rw, rh, turned in ((w, h, False), (h, w, True)):
                if rw <= fw and rh <= fh:
                    score = (min(fw - rw, fh - rh), max(fw - rw, fh - rh))
                    if best is None or score < best[0]:
                        best = (score, (fx, fy, rw, rh, turned))
        if best is None:
            return None
        x, y, rw, rh, turned = best[1]
        out[rid] = best[1]
        split = []
        for fx, fy, fw, fh in free:
            if x >= fx + fw or x + rw <= fx or y >= fy + fh or y + rh <= fy:
                split.append((fx, fy, fw, fh))
                continue
            if x > fx:
                split.append((fx, fy, x - fx, fh))
            if x + rw < fx + fw:
                split.append((x + rw, fy, fx + fw - x - rw, fh))
            if y > fy:
                split.append((fx, fy, fw, y - fy))
            if y + rh < fy + fh:
                split.append((fx, y + rh, fw, fy + fh - y - rh))
        free = [a for a in split if not any(a != b and a[0] >= b[0] and a[1] >= b[1] and a[0] + a[2] <= b[0] + b[2]
                                            and a[1] + a[3] <= b[1] + b[3] for b in split)]
    return out


def pack(layout, skirts=None):
    width, height = layout['atlas']['size']
    found = islands(layout, skirts)
    rects = [(i['id'], i['w'] + 2 * GUTTER_SIDE, i['h'] + 2 * GUTTER_SIDE) for i in found]
    placed = maxrects(rects, width, height)
    assert placed is not None, 'The posters atlas islands do not fit'
    for island in found:
        x, y, w, h, turned = placed[island['id']]
        assert x % 2 == 0 and y % 2 == 0 and w % 2 == 0 and h % 2 == 0, (island['id'], 'odd island placement')
        # Content rectangle (top-left origin, pixels) inside the gutter; `turned` swaps the content's axes.
        island['rect'] = [x + GUTTER_SIDE, y + GUTTER_SIDE, w - 2 * GUTTER_SIDE, h - 2 * GUTTER_SIDE]
        island['turned'] = turned
    used = sum((i['w'] + 2 * GUTTER_SIDE) * (i['h'] + 2 * GUTTER_SIDE) for i in found)
    return found, used / (width * height)


# ---------------------------------------------------------------- shipped geometry (what posters.glb draws)

#: A curled corner lifts the paper within CURL_REACH·min(w, h) of the corner, quadratically.
CURL_REACH = 0.28
#: The shipped card carries a curl on a CURL_STEPS × CURL_STEPS sub-grid of its corner region.
CURL_STEPS = 4
#: A lifted tape's free end rises this far, in proportion to how far it overhangs the sheet.
TAPE_FREE_LIFT = 0.006
#: Skirts lie flat this far over their surface (under every card and overhang).
SKIRT_LIFT = 0.0001
#: The corkboard: its face (the frame's front) stands this far off the wall; cork is recessed below it.
CORK_DEPTH, CORK_SURFACE, CORK_FRAME = 0.018, 0.017, 0.02
#: Push pins: an octagonal head on the paper, PIN_CELL px cells in the pins island.
PIN_HEIGHT, PIN_SIDES, PIN_CELL = 0.007, 8, 5
#: Atlas-pixel inset of the pins' UVs inside their cell, so a cell's border texels never bleed.
PIN_UV_RADIUS = 2.0


def surface_normal(surface):
    """Unit normal into the room."""
    return (0.0, -1.0, 0.0) if surface == 'back' else SLOPE_NORMAL


def surface_world(surface, a, b, lift):
    """Surface coordinates (a, b) plus `lift` metres along the normal → Blender world point."""
    if surface == 'back':
        return (a, BACK_Y - lift, b)
    return (RIDGE[0] + SLOPE_DIR[0] * b + SLOPE_NORMAL[0] * lift, a,
            RIDGE[1] + SLOPE_DIR[2] * b + SLOPE_NORMAL[2] * lift)


def world_surface(surface, p):
    """Inverse of surface_world: Blender world point → (a, b, lift)."""
    if surface == 'back':
        return p[0], p[2], BACK_Y - p[1]
    dx, dz = p[0] - RIDGE[0], p[2] - RIDGE[1]
    along = (dx * SLOPE_DIR[0] + dz * SLOPE_DIR[2]) / (SLOPE_DIR[0] ** 2 + SLOPE_DIR[2] ** 2)
    lift = (dx * SLOPE_NORMAL[0] + dz * SLOPE_NORMAL[2]) / (SLOPE_NORMAL[0] ** 2 + SLOPE_NORMAL[2] ** 2)
    return p[1], along, lift


def from_surface(item, a, b):
    """Surface (a, b) → the item's sheet-local (u, v); inverse of to_surface."""
    du, dv = (a - item['a'], b - item['b']) if item['surface'] == 'back' else (item['a'] - a, item['b'] - b)
    return rotate(du, dv, -item['rot'])


def item_world(item, u, v, lift):
    return surface_world(item['surface'], *to_surface(item, u, v), lift)


def curl_lift(item, u, v):
    """How far the item's curled corners lift its paper at sheet-local (u, v); also beyond the edge, where the
    curl carries its tape."""
    lift = 0.0
    reach = CURL_REACH * min(item['w'], item['h'])
    for spot, amount in item.get('curl', {}).items():
        cu, cv = CORNERS[spot]
        t = max(0.0, 1 - math.hypot(u - cu * item['w'] / 2, v - cv * item['h'] / 2) / reach)
        lift += amount * t * t
    return lift


def inside(poly, p):
    poly = ccw(poly)
    return all((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-12
               for a, b in zip(poly, poly[1:] + poly[:1]))


def under_offset(layout, item, a, b):
    """Height over the surface of whatever lies under the item at surface (a, b): a lower card or the bare wall."""
    lower = [other['layer'] for other in layout['items']
             if other['surface'] == item['surface'] and not other.get('cork') and other['layer'] < item['layer']
             and inside(rect(other), (a, b))]
    return CARD_BASE + CARD_STEP * max(lower) if lower else 0.0


def atlas_uv(layout, island, fu, fv):
    """Island content fraction (fu right, fv up) → atlas UV (glTF-style v measured upwards here, Blender's)."""
    width, height = layout['atlas']['size']
    x, y, w, h = island['rect']
    px, py = (x + fv * w, y + fu * h) if island['turned'] else (x + fu * w, y + (1 - fv) * h)
    return px / width, 1 - py / height


def atlas_px(layout, island, fu, fv):
    """The same point in atlas pixels from the top-left (for the compose stage's masks)."""
    width, height = layout['atlas']['size']
    u, v = atlas_uv(layout, island, fu, fv)
    return u * width, (1 - v) * height


def fan(n, start=0):
    return [(start, start + i, start + i + 1) for i in range(1, n - 1)]


def card_grid(item):
    """The card's sheet-local grid lines: its edges, plus a sub-grid that carries each curled corner."""
    w, h = item['w'], item['h']
    us, vs = {-w / 2, w / 2}, {-h / 2, h / 2}
    reach = CURL_REACH * min(w, h)
    for spot in item.get('curl', {}):
        cu, cv = CORNERS[spot]
        for k in range(1, CURL_STEPS + 1):
            us.add(round(cu * (w / 2 - reach * k / CURL_STEPS), 9))
            vs.add(round(cv * (h / 2 - reach * k / CURL_STEPS), 9))
    return sorted(us), sorted(vs)


def card_lift(item, u, v):
    """The curl lift of the card as shipped (its triangulated grid, diagonal a-c as in card_mesh) at a sheet-local
    point clamped to the sheet, continued beyond the edge by the analytic curl, so a tape's overhang starts exactly on
    the card's surface instead of up to 0.3 mm off a coarsely triangulated curl."""
    us, vs = card_grid(item)
    cu = min(max(u, us[0]), us[-1])
    cv = min(max(v, vs[0]), vs[-1])
    i = min(bisect.bisect_right(us, cu) - 1, len(us) - 2)
    j = min(bisect.bisect_right(vs, cv) - 1, len(vs) - 2)
    fu = (cu - us[i]) / (us[i + 1] - us[i])
    fv = (cv - vs[j]) / (vs[j + 1] - vs[j])
    la, lb = curl_lift(item, us[i], vs[j]), curl_lift(item, us[i + 1], vs[j])
    lc, ld = curl_lift(item, us[i + 1], vs[j + 1]), curl_lift(item, us[i], vs[j + 1])
    on_card = la + fu * (lb - la) + fv * (lc - lb) if fu >= fv else la + fv * (ld - la) + fu * (lc - ld)
    return on_card + curl_lift(item, u, v) - curl_lift(item, cu, cv)


def card_mesh(layout, item, island):
    """The flat export card at its layer offset, with a sub-grid that carries each curled corner."""
    w, h = item['w'], item['h']
    us, vs = card_grid(item)
    offset = card_offset(item)
    positions, uvs, tris = [], [], []
    for v in vs:
        for u in us:
            positions.append(item_world(item, u, v, offset + curl_lift(item, u, v)))
            uvs.append(atlas_uv(layout, island, u / w + 0.5, v / h + 0.5))
    n = len(us)
    for j in range(len(vs) - 1):
        for i in range(n - 1):
            a, b, c, d = j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i
            tris += [(a, b, c), (a, c, d)]
    return dict(positions=positions, uvs=uvs, tris=tris)


def overhang_mesh(layout, item, island):
    """A tape's overhang: the strip clipped against its sheet, starting at the card's own height on the sheet edge
    and ramping to TAPE_LIFT over what is under it within OVERHANG_RAMP; a lifted tape rises at its free end."""
    tape = next(t for t in item['tapes'] if t['spot'] == island['spot'])
    (cu, cv), along, across = tape_frame(tape)
    s0, t0, s1, t1 = island['extent']
    half_length = layout['tapeSize'][0] / 2
    offset = card_offset(item)
    positions, uvs, tris, edge_vertices = [], [], [], []

    def height(u, v):
        a, b = to_surface(item, u, v)
        dist = max(abs(u) - item['w'] / 2, abs(v) - item['h'] / 2, 0.0)
        ramp = min(1.0, dist / OVERHANG_RAMP)
        z = offset + (under_offset(layout, item, a, b) + TAPE_LIFT - offset) * ramp + card_lift(item, u, v)
        if tape.get('lifted'):
            z += TAPE_FREE_LIFT * min(1.0, dist / half_length)
        return z

    for (nx, ny, d), piece in overhangs(layout, item)[island['spot']]:
        for part in (half_plane(piece, nx, ny, d + OVERHANG_RAMP, keep_beyond=False),
                     half_plane(piece, nx, ny, d + OVERHANG_RAMP, keep_beyond=True)):
            part = dedupe(ccw(part))
            if len(part) < 3 or area(part) < 1e-12:
                continue
            start = len(positions)
            for u, v in part:
                positions.append(item_world(item, u, v, height(u, v)))
                s = (u - cu) * along[0] + (v - cv) * along[1]
                t = (u - cu) * across[0] + (v - cv) * across[1]
                uvs.append(atlas_uv(layout, island, (s - s0) / (s1 - s0), (t - t0) / (t1 - t0)))
                if abs(nx * u + ny * v - d) < 1e-9 and abs(u) <= item['w'] / 2 + 1e-9 and abs(v) <= item['h'] / 2 + 1e-9:
                    edge_vertices.append(len(positions) - 1)
            tris += fan(len(part), start)
    return dict(positions=positions, uvs=uvs, tris=tris, edgeVertices=edge_vertices)


def dedupe(poly):
    out = []
    for p in poly:
        if not out or math.dist(p, out[-1]) > 1e-9:
            out.append(p)
    if len(out) > 1 and math.dist(out[0], out[-1]) <= 1e-9:
        out.pop()
    return out


SKIRT_SIDES = {
    # side: (inner edge start, inner edge end) as sheet-local corner signs, outward direction
    'b': ((-1, -1), (1, -1), (0, -1)),
    't': ((1, 1), (-1, 1), (0, 1)),
    'l': ((-1, 1), (-1, -1), (-1, 0)),
    'r': ((1, -1), (1, 1), (1, 0)),
}


def skirt_mesh(layout, item, island):
    """One trapezoid of the contact-shadow skirt, flat on the surface, mapped planar onto its strip (fv 0 at the
    outer edge, 1 at the sheet)."""
    w, h, s = item['w'] / 2, item['h'] / 2, island['skirt'][island['side']]
    (ia, ib, (ox, oy)) = SKIRT_SIDES[island['side']]
    inner = [(ia[0] * w, ia[1] * h), (ib[0] * w, ib[1] * h)]
    outer = [skirt_corner(item, island['skirt'], ia), skirt_corner(item, island['skirt'], ib)]
    quad = [outer[0], outer[1], inner[1], inner[0]]
    tx, ty = ib[0] - ia[0], ib[1] - ia[1]
    norm = math.hypot(tx, ty)
    tx, ty = tx / norm, ty / norm
    length = (outer[1][0] - outer[0][0]) * tx + (outer[1][1] - outer[0][1]) * ty
    # fu runs along the outer edge; fv = 1 - (distance beyond the sheet edge) / s: 0 outside, 1 at the sheet.
    edge = w * abs(ox) + h * abs(oy)
    return dict(positions=[item_world(item, u, v, SKIRT_LIFT) for u, v in quad],
                uvs=[atlas_uv(layout, island, ((u - outer[0][0]) * tx + (v - outer[0][1]) * ty) / length,
                              1 - (u * ox + v * oy - edge) / s) for u, v in quad],
                tris=[(0, 1, 2), (0, 2, 3)])


def corkboard_meshes(layout, face, sides):
    board = corkboard_item(layout)
    w, h = board['w'] / 2, board['h'] / 2
    corners = [(-w, -h), (w, -h), (w, h), (-w, h)]
    face_mesh = dict(positions=[item_world(board, u, v, CORK_DEPTH) for u, v in corners],
                     uvs=[atlas_uv(layout, face, u / board['w'] + 0.5, v / board['h'] + 0.5) for u, v in corners],
                     tris=[(0, 1, 2), (0, 2, 3)])
    perimeter = 2 * (board['w'] + board['h'])
    positions, uvs, tris, walked = [], [], [], 0.0
    for k in range(4):
        (u0, v0), (u1, v1) = corners[k], corners[(k + 1) % 4]
        length = math.hypot(u1 - u0, v1 - v0)
        start = len(positions)
        for (u, v), fu, depth in (((u0, v0), walked, 0.0), ((u1, v1), walked + length, 0.0),
                                  ((u1, v1), walked + length, CORK_DEPTH), ((u0, v0), walked, CORK_DEPTH)):
            positions.append(item_world(board, u, v, depth))
            uvs.append(atlas_uv(layout, sides, fu / perimeter, depth / CORK_DEPTH))
        tris += [(start, start + 1, start + 2), (start, start + 2, start + 3)]
        walked += length
    return face_mesh, dict(positions=positions, uvs=uvs, tris=tris)


def pins_mesh(layout, island):
    """The cork pieces' push pins: an octagonal head each, every pin on its own cell of the pins island."""
    positions, uvs, tris = [], [], []
    cork = [item for item in layout['items'] if item.get('cork')]
    per_row = island['w'] // PIN_CELL
    for k, item in enumerate(cork):
        (pu, pv), = pin_spots(item)
        base = card_offset(item)
        cx = (k % per_row + 0.5) * PIN_CELL / island['w']
        cy = 1 - (k // per_row + 0.5) * PIN_CELL / island['h']
        rx, ry = PIN_UV_RADIUS / island['w'], PIN_UV_RADIUS / island['h']
        start = len(positions)
        positions.append(item_world(item, pu, pv, base + PIN_HEIGHT))
        uvs.append(atlas_uv(layout, island, cx, cy))
        ring = [(math.cos(2 * math.pi * i / PIN_SIDES), math.sin(2 * math.pi * i / PIN_SIDES)) for i in range(PIN_SIDES)]
        for top, scale in ((True, 1.0), (False, 1.25)):
            for c, s in ring:
                positions.append(item_world(item, pu + PIN_RADIUS * c, pv + PIN_RADIUS * s,
                                            base + (PIN_HEIGHT if top else 0.0005)))
                uvs.append(atlas_uv(layout, island, cx + rx * scale * c, cy + ry * scale * s))
        for i in range(PIN_SIDES):
            j = (i + 1) % PIN_SIDES
            tris.append((start, start + 1 + i, start + 1 + j))
            a, b = start + 1 + i, start + 1 + j
            tris += [(a + PIN_SIDES, b + PIN_SIDES, b), (a + PIN_SIDES, b, a)]
    return dict(positions=positions, uvs=uvs, tris=tris)


def geometry(layout, found):
    """Every shipped mesh piece: [{island, item, kind, layer, primitive, positions, uvs, tris}] in Blender world
    coordinates, card triangles first in ascending layer order."""
    by_key = {item['key']: item for item in layout['items']}
    out = []
    face = next(i for i in found if i['kind'] == 'cork-face')
    sides = next(i for i in found if i['kind'] == 'cork-sides')
    face_mesh, sides_mesh = corkboard_meshes(layout, face, sides)
    for island in found:
        kind = island['kind']
        if kind == 'card':
            mesh = card_mesh(layout, by_key[island['item']], island)
        elif kind == 'overhang':
            mesh = overhang_mesh(layout, by_key[island['item']], island)
        elif kind == 'skirt':
            item = by_key.get(island['item']) or corkboard_item(layout)
            mesh = skirt_mesh(layout, item, island)
        elif kind == 'cork-face':
            mesh = face_mesh
        elif kind == 'cork-sides':
            mesh = sides_mesh
        else:
            mesh = pins_mesh(layout, island)
        item = by_key.get(island['item'])
        layer = 10 if island['item'] == 'corkboard' else item['layer']
        out.append(dict(island=island['id'], item=island['item'], kind=kind, layer=layer,
                        primitive='skirts' if kind == 'skirt' else 'cards', **mesh))
    out.sort(key=lambda g: (g['primitive'] == 'skirts', g['layer'], g['island']))
    return out


# ---------------------------------------------------------------- the bake (Blender)

#: The tape per surface, (albedo, mix over what is under it): cream masking tape on the back wall's sage plaster. On
#: the pale ivory slope that tape read only 1.01-1.09 over the paint, so the ceiling sheets go up with an opaque white
#: paper tape, the brightest thing the slope can show (TAPE_WALL_MIN holds both).
TAPE = {'back': ((0.92, 0.89, 0.78), 0.55), 'slope': ((0.97, 0.97, 0.95), 0.9)}
#: A fold's memory (layout 'creases' [across u, across v]: S4 and S5 folded in four, F1 once): the fold across u stands
#: out as a ridge, the one across v lies back as a valley, each face CREASE_HALF wide and CREASE_DEPTH deep (about 14
#: degrees) on its own flat-shaded strip of the bake sheet, so the moonlight and the lamp light its two faces apart.
#: At 10 degrees the folds showed in the atlas only with the contrast raised; at 14 they read at the room view's
#: distance, still as a fold rather than a drawn line.
CREASE_HALF, CREASE_DEPTH = 0.004, 0.001
ROUGHNESS = {'matte': 0.62, 'satin': 0.5, 'semi-gloss': 0.4, 'gloss': 0.32}
SPECULAR = {'matte': 0.3, 'satin': 0.4, 'semi-gloss': 0.45, 'gloss': 0.5}
WHITE_STOCK = (0.9, 0.88, 0.84)  # the white vinyl / paper an alpha master is printed on (linear)
CORK_RGB = (0.40, 0.25, 0.12)
PIN_RGB = ((0.8, 0.05, 0.04), (0.05, 0.2, 0.75), (0.85, 0.7, 0.05), (0.08, 0.55, 0.12))
#: The desktop room eye (three (-0.55, 1.62, 2.1)): glossy paper bakes its highlight from here.
ROOM_EYE = (-0.55, -2.1, 1.62)
WALLS = {'back': 'Continuous window wall | no panel seams', 'slope': 'Cutaway_sloped_attic_ceiling'}
SHEET_GRID = (14, 18)
CORK_GRID = (6, 6)
CAGE = 0.01


def art_uv(item, fu, fv):
    """Sheet fraction → the master's UV (Blender, v up), through the crop and the printed margin."""
    pad = item.get('pad', 0.0)
    fu, fv = (fu * item['w'] - pad) / (item['w'] - 2 * pad), (fv * item['h'] - pad) / (item['h'] - 2 * pad)
    u0, v0, u1, v1 = item['crop']
    return u0 + fu * (u1 - u0), 1 - v0 - (1 - fv) * (v1 - v0)


def crease_folds(item):
    """The fold lines as sheet fractions: (across u, across v), each fold splitting the sheet evenly."""
    cx, cy = item.get('creases', (0, 0))
    return [k / (cx + 1) for k in range(1, cx + 1)], [k / (cy + 1) for k in range(1, cy + 1)]


def crease_lift(item, fu, fv):
    folds_u, folds_v = crease_folds(item)
    z = sum(CREASE_DEPTH * max(0.0, 1 - abs(fu - f) * item['w'] / CREASE_HALF) for f in folds_u)
    return z + sum(CREASE_DEPTH * min(1.0, abs(fv - f) * item['h'] / CREASE_HALF) for f in folds_v)


def sheet_fractions(cells, length, folds):
    """A sheet grid's fractions along one side: even cells, plus each fold line and its strip's two edges."""
    fs = {round(i / cells, 9) for i in range(cells + 1)}
    fs |= {round(f + d / length, 9) for f in folds for d in (-CREASE_HALF, 0.0, CREASE_HALF)}
    return sorted(fs)


def in_crease(length, folds, a, b):
    """Whether the grid cell (a, b) along one side lies on a fold's strip."""
    return any(abs((a + b) / 2 - f) * length < CREASE_HALF for f in folds)


def sheet_lift(item, fu, fv):
    """The bake sheet's shape over its flat card: bow, waviness fading 8 cm from every edge, creases, curls."""
    w, h = item['w'], item['h']
    small = item.get('cork')
    sag, wave = (0.001, 0.0) if small else (0.0025, 0.0012)
    z = sag * math.sin(math.pi * fu) * math.sin(math.pi * fv)
    edge = min(fu * w, (1 - fu) * w, fv * h, (1 - fv) * h)
    z += wave * min(1.0, edge / 0.08) * math.sin(fu * 7.1 + fv * 3.3) * math.sin(fv * 5.7)
    return z + crease_lift(item, fu, fv) + curl_lift(item, (fu - 0.5) * w, (fv - 0.5) * h)


class BakeScene:
    """The room scene with every bake-only object built in it: detailed sheets, lit tape strips, the corkboard
    and pins. Objects are named pst_* so the room's own objects are never confused with them."""

    def __init__(self, layout, sources):
        import bpy
        self.bpy = bpy
        self.layout = layout
        self.sources = sources
        self.items = {item['key']: item for item in layout['items']}
        self.sheets, self.tapes, self.pins, self.cork = {}, {}, [], []
        self.images, self.small = {}, {}
        self.walls = {surface: bpy.data.objects[name] for surface, name in WALLS.items()}
        self.albedo = {}
        for surface, obj in self.walls.items():
            bsdf = next(n for n in obj.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            assert not bsdf.inputs['Base Color'].is_linked, (obj.name, 'expected a flat wall colour')
            self.albedo[surface] = tuple(bsdf.inputs['Base Color'].default_value[:3])

    # -- materials

    def image(self, item):
        key = item['source']
        if key not in self.images:
            img = self.bpy.data.images.load(str(self.sources / key), check_existing=True)
            img.colorspace_settings.name = 'sRGB'
            self.images[key] = img
        return self.images[key]

    def art_nodes(self, mat, item, uv_name):
        nt = mat.node_tree
        coords = nt.nodes.new('ShaderNodeUVMap')
        coords.uv_map = uv_name
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = self.image(item)
        tex.interpolation = 'Cubic'
        tex.extension = 'CLIP' if item.get('pad') else 'EXTEND'
        nt.links.new(coords.outputs['UV'], tex.inputs['Vector'])
        if not item.get('alpha'):
            return tex.outputs['Color']
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.inputs['A'].default_value = (*WHITE_STOCK, 1)
        nt.links.new(tex.outputs['Alpha'], mix.inputs['Factor'])
        nt.links.new(tex.outputs['Color'], mix.inputs['B'])
        return mix.outputs['Result']

    def principled(self, name, roughness, specular):
        mat = self.bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Specular IOR Level'].default_value = specular
        return mat, bsdf

    def paper_material(self, item):
        mat, bsdf = self.principled('pst_paper_' + item['key'], ROUGHNESS[item['finish']], SPECULAR[item['finish']])
        mat.node_tree.links.new(self.art_nodes(mat, item, 'UVMap'), bsdf.inputs['Base Color'])
        return mat

    def tape_material(self, item):
        """mix(under_albedo, tape albedo, tape mix) (TAPE): the art through the sheet's UVs on the sheet, the wall's or a
        lower sheet's albedo (per vertex) beyond its edge. Frosted, so its baked highlight is view-independent."""
        mat, bsdf = self.principled('pst_tape_' + item['key'], 0.6, 0.5)
        nt = mat.node_tree
        art = self.art_nodes(mat, item, 'UVMap')
        frac = nt.nodes.new('ShaderNodeUVMap')
        frac.uv_map = 'SheetFrac'
        split = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(frac.outputs['UV'], split.inputs['Vector'])
        on = None
        for axis in ('X', 'Y'):
            for op, edge in (('GREATER_THAN', 0.0), ('LESS_THAN', 1.0)):
                test = nt.nodes.new('ShaderNodeMath')
                test.operation = op
                nt.links.new(split.outputs[axis], test.inputs[0])
                test.inputs[1].default_value = edge
                if on is None:
                    on = test.outputs[0]
                else:
                    both = nt.nodes.new('ShaderNodeMath')
                    both.operation = 'MULTIPLY'
                    nt.links.new(on, both.inputs[0])
                    nt.links.new(test.outputs[0], both.inputs[1])
                    on = both.outputs[0]
        under = nt.nodes.new('ShaderNodeAttribute')
        under.attribute_name = 'under'
        base = nt.nodes.new('ShaderNodeMix')
        base.data_type = 'RGBA'
        nt.links.new(under.outputs['Color'], base.inputs['A'])
        nt.links.new(art, base.inputs['B'])
        nt.links.new(on, base.inputs['Factor'])
        tape = nt.nodes.new('ShaderNodeMix')
        tape.data_type = 'RGBA'
        rgb, mix = TAPE[item['surface']]
        tape.inputs['Factor'].default_value = mix
        tape.inputs['B'].default_value = (*rgb, 1)
        nt.links.new(base.outputs['Result'], tape.inputs['A'])
        nt.links.new(tape.outputs['Result'], bsdf.inputs['Base Color'])
        return mat

    def flat_material(self, name, rgb, roughness):
        mat, bsdf = self.principled(name, roughness, 0.5)
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        return mat

    def link(self, name, positions, faces, material, uvs=None, flat=()):
        bpy = self.bpy
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(p) for p in positions], [], [tuple(f) for f in faces])
        for name_uv, per_vertex in (uvs or {}).items():
            layer = mesh.uv_layers.new(name=name_uv)
            for loop in mesh.loops:
                layer.data[loop.index].uv = per_vertex[loop.vertex_index]
        mesh.materials.append(material)
        for poly in mesh.polygons:
            poly.use_smooth = poly.index not in flat
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj

    # -- geometry

    def build(self):
        for item in self.layout['items']:
            self.sheets[item['key']] = self.build_sheet(item)
        self.build_corkboard()
        self.bpy.context.view_layer.update()
        for item in self.layout['items']:
            if item['tapes']:
                material = self.tape_material(item)
                for tape in item['tapes']:
                    self.tapes[(item['key'], tape['spot'])] = self.build_tape(item, tape, material)
        self.bpy.context.view_layer.update()
        self.assert_tapes_on_top()

    def build_sheet(self, item):
        cols, rows = CORK_GRID if item.get('cork') else SHEET_GRID
        folds_u, folds_v = crease_folds(item)
        us, vs = sheet_fractions(cols, item['w'], folds_u), sheet_fractions(rows, item['h'], folds_v)
        offset = card_offset(item)
        positions, uvs = [], []
        for fv in vs:
            for fu in us:
                positions.append(item_world(item, (fu - 0.5) * item['w'], (fv - 0.5) * item['h'],
                                            offset + sheet_lift(item, fu, fv)))
                uvs.append(art_uv(item, fu, fv))
        n = len(us)
        faces, flat = [], set()
        for j in range(len(vs) - 1):
            for i in range(n - 1):
                if in_crease(item['w'], folds_u, us[i], us[i + 1]) or in_crease(item['h'], folds_v, vs[j], vs[j + 1]):
                    flat.add(len(faces))
                faces.append((j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i))
        return self.link('pst_sheet_' + item['key'], positions, faces, self.paper_material(item), {'UVMap': uvs},
                         flat)

    def build_corkboard(self):
        board = corkboard_item(self.layout)
        w, h, f = board['w'], board['h'], CORK_FRAME
        cork = self.bpy.data.materials.new('pst_cork')
        cork.use_nodes = True
        nt = cork.node_tree
        bsdf = nt.nodes['Principled BSDF']
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 180
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (0.32, 0.17, 0.07, 1)
        ramp.color_ramp.elements[1].color = (0.62, 0.40, 0.20, 1)
        nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.9
        wood = self.flat_material('pst_frame', (0.55, 0.38, 0.22), 0.55)
        boxes = [((0, 0), (w - 2 * f, h - 2 * f), CORK_SURFACE, cork),
                 ((0, (h - f) / 2), (w, f), CORK_DEPTH, wood), ((0, -(h - f) / 2), (w, f), CORK_DEPTH, wood),
                 ((-(w - f) / 2, 0), (f, h - 2 * f), CORK_DEPTH, wood), (((w - f) / 2, 0), (f, h - 2 * f), CORK_DEPTH, wood)]
        for k, ((cu, cv), (sw, sh), depth, material) in enumerate(boxes):
            corners = [(cu + su * sw / 2, cv + sv * sh / 2) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            positions = [item_world(board, u, v, 0.0) for u, v in corners] + \
                        [item_world(board, u, v, depth) for u, v in corners]
            faces = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
            self.cork.append(self.link(f'pst_cork_{k}', positions, faces, material))
        for k, item in enumerate(i for i in self.layout['items'] if i.get('cork')):
            (pu, pv), = pin_spots(item)
            base = card_offset(item)
            ring = [(math.cos(2 * math.pi * i / 16), math.sin(2 * math.pi * i / 16)) for i in range(16)]
            positions = [item_world(item, pu + PIN_RADIUS * c, pv + PIN_RADIUS * s, base + 0.0005) for c, s in ring]
            positions += [item_world(item, pu + PIN_RADIUS * 0.92 * c, pv + PIN_RADIUS * 0.92 * s, base + PIN_HEIGHT)
                          for c, s in ring]
            positions.append(item_world(item, pu, pv, base + PIN_HEIGHT + 0.0012))
            faces = [(i, (i + 1) % 16, 16 + (i + 1) % 16, 16 + i) for i in range(16)]
            faces += [(16 + i, 16 + (i + 1) % 16, 32) for i in range(16)]
            colour = PIN_RGB[(sum(map(ord, item['key']))) % len(PIN_RGB)]
            self.pins.append(self.link('pst_pin_' + item['key'], positions, faces,
                                       self.flat_material('pst_pin_' + item['key'], colour, 0.25)))

    def project(self, item, u, v):
        """The evaluated surface under sheet-local (u, v): a ray along the normal from 3 cm out that skips
        higher sheets, pins and tapes. Returns (world point, normal, hit object or None)."""
        from mathutils import Vector
        bpy = self.bpy
        depsgraph = bpy.context.evaluated_depsgraph_get()
        n = Vector(surface_normal(item['surface']))
        origin = Vector(item_world(item, u, v, 0.03))
        layer = item['layer']
        for _ in range(12):
            hit, loc, _normal, _index, obj, _matrix = bpy.context.scene.ray_cast(depsgraph, origin, -n, distance=0.2)
            if not hit:
                break
            name = obj.name
            other = self.items.get(name[len('pst_sheet_'):]) if name.startswith('pst_sheet_') else None
            if name.startswith(('pst_tape', 'pst_pin')) or (other and other['layer'] > layer):
                origin = loc - n * 0.0002
                continue
            return loc, n, obj
        return Vector(item_world(item, u, v, 0.0)), n, None

    def small_pixels(self, item):
        """A ≤ 96 px linear copy of the item's art, to read an under-tape albedo per vertex."""
        import numpy as np
        if item['key'] not in self.small:
            img = self.image(item).copy()
            w, h = img.size
            scale = 96 / max(w, h)
            img.scale(max(2, round(w * scale)), max(2, round(h * scale)))
            px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
            rgb = np.where(px[..., :3] <= 0.04045, px[..., :3] / 12.92, ((px[..., :3] + 0.055) / 1.055) ** 2.4)
            if item.get('alpha'):
                rgb = rgb * px[..., 3:] + np.array(WHITE_STOCK) * (1 - px[..., 3:])
            self.small[item['key']] = rgb
            self.bpy.data.images.remove(img)
        return self.small[item['key']]

    def albedo_at(self, obj, loc, surface):
        if obj is None or obj.name in (o.name for o in self.walls.values()):
            return self.albedo[surface]
        if obj.name.startswith('pst_sheet_'):
            item = self.items[obj.name[len('pst_sheet_'):]]
            a, b, _ = world_surface(item['surface'], tuple(loc))
            u, v = from_surface(item, a, b)
            au, av = art_uv(item, min(1, max(0, u / item['w'] + 0.5)), min(1, max(0, v / item['h'] + 0.5)))
            rgb = self.small_pixels(item)
            if item.get('pad') and not (0 <= au <= 1 and 0 <= av <= 1):
                return WHITE_STOCK
            y = min(rgb.shape[0] - 1, max(0, int(av * rgb.shape[0])))
            x = min(rgb.shape[1] - 1, max(0, int(au * rgb.shape[1])))
            return tuple(float(c) for c in rgb[y, x])
        return CORK_RGB

    def build_tape(self, item, tape, material):
        """The tape strip as lit geometry: 15 × 3 vertices, torn ends, every vertex projected onto the evaluated
        surface below it + TAPE_LIFT; a lifted tape rises at its free end; a curled corner carries it."""
        import random
        import zlib
        rng = random.Random(zlib.crc32(f"{item['key']}.{tape['spot']}".encode()))
        length, width = self.layout['tapeSize']
        (cu, cv), (du, dv), (nu, nv) = tape_frame(tape)
        cols, rows = 14, 2
        jitter = {(i, j): rng.uniform(0.0004, 0.0012) * rng.choice((-1, 1)) for i in (0, cols) for j in range(rows + 1)}
        positions, art, frac, under = [], [], [], []
        for j in range(rows + 1):
            for i in range(cols + 1):
                s = -length / 2 + length * i / cols + jitter.get((i, j), 0.0)
                t = -width / 2 + width * j / rows
                u, v = cu + du * s + nu * t, cv + dv * s + nv * t
                loc, n, hit = self.project(item, u, v)
                dist = max(abs(u) - item['w'] / 2, abs(v) - item['h'] / 2, 0.0)
                lift = TAPE_LIFT + (TAPE_FREE_LIFT * min(1.0, dist / (length / 2)) if tape.get('lifted') else 0.0)
                if dist > 0:
                    lift += curl_lift(item, u, v)
                positions.append(tuple(loc + n * lift))
                fu, fv = u / item['w'] + 0.5, v / item['h'] + 0.5
                art.append(art_uv(item, fu, fv))
                frac.append((fu, fv))
                under.append(self.albedo_at(hit, loc, item['surface']) if dist > 0 else self.albedo[item['surface']])
        faces = [(j * (cols + 1) + i, j * (cols + 1) + i + 1, (j + 1) * (cols + 1) + i + 1, (j + 1) * (cols + 1) + i)
                 for j in range(rows) for i in range(cols)]
        obj = self.link(f"pst_tape_{item['key']}_{tape['spot']}", positions, faces, material,
                        {'UVMap': art, 'SheetFrac': frac})
        colour = obj.data.color_attributes.new('under', 'FLOAT_COLOR', 'POINT')
        for k, rgb in enumerate(under):
            colour.data[k].color = (*rgb, 1.0)
        return obj

    def assert_tapes_on_top(self):
        """A ray along the surface normal at every tape's centre hits that tape first (4.2's bake-mesh rule)."""
        from mathutils import Vector
        bpy = self.bpy
        depsgraph = bpy.context.evaluated_depsgraph_get()
        bad = []
        for (key, spot), obj in self.tapes.items():
            item = self.items[key]
            tape = next(t for t in item['tapes'] if t['spot'] == spot)
            if tape.get('hiddenFraction', 0) > 0.5:
                continue
            n = Vector(surface_normal(item['surface']))
            origin = Vector(item_world(item, tape['u'], tape['v'], 0.05))
            hit, _loc, _n, _i, first, _m = bpy.context.scene.ray_cast(depsgraph, origin, -n, distance=0.2)
            if not hit or first != obj:
                bad.append(f'{key}.{spot} → {first.name if hit else None}')
        assert not bad, f'tapes buried under other geometry: {bad}'

    # -- bake passes

    def poster_objects(self):
        return list(self.sheets.values()) + list(self.tapes.values()) + self.pins + self.cork

    def selection(self, bake_pass):
        """The high-poly set a pass's rays may land on (pins and the corkboard included: their own islands)."""
        everything = self.poster_objects() + list(self.walls.values())
        if bake_pass == 'beauty':
            return everything
        if bake_pass == 'under':
            return [o for o in everything if o.name != 'pst_sheet_' + DIE_CUT]
        return list(self.walls.values())

    def hidden(self, bake_pass):
        """Poster objects a pass with the posters showing still leaves out of the render. The sticker's own sheet,
        in the pass that bakes what lies under it: left in, it shadows all of that (its card came out black beyond the
        bear). The tape strips, in the skirts' shadow pass: a strip lies 0.3 mm over the wall, so its contact shadow is
        nil, but left in it baked the skirt near black under each overhang, and the skirt's blur spread that 5-10 mm
        past the overhang as a dark ring round every tape."""
        if bake_pass == 'under':
            return [self.sheets[DIE_CUT]]
        if bake_pass == 'shadow':
            return list(self.tapes.values())
        return []


#: The die-cut sticker: its card also bakes what lies under it, and the compose stage cuts it out by its alpha.
DIE_CUT = 'M6'

#: Every island the beauty pass lights (and the denoiser's albedo and normal guides cover).
LIT_KINDS = ('card', 'overhang', 'cork-face', 'cork-sides', 'pins')
#: {pass: (island kinds or ids, posters visible, samples option, bake type)}. Every pass is one bake call over the
#: whole atlas, each in its own Blender process: the room scene's sync dominates any per-group split.
#: A lower card's texels under a higher sheet bake that sheet; they are hidden under it at runtime.
BAKE_PASSES = {
    'albedo': (LIT_KINDS, True, 'guide_samples', 'DIFFUSE'),
    'normal': (LIT_KINDS, True, 'guide_samples', 'NORMAL'),
    'beauty': (LIT_KINDS, True, 'samples', 'COMBINED'),
    'under': ((DIE_CUT,), True, 'samples', 'COMBINED'),
    'bare': (('overhang', 'skirt'), False, 'skirt_samples', 'COMBINED'),
    'shadow': (('skirt',), True, 'skirt_samples', 'COMBINED'),
}
#: The denoiser's guides are data, saved raw as float EXR; the lit passes go through the scene's display transform.
GUIDE_PASSES = ('albedo', 'normal')


def bake_file(bake_pass):
    return f'posters-bake-{bake_pass}.' + ('exr' if bake_pass in GUIDE_PASSES else 'png')


def pass_islands(found, bake_pass):
    keys = BAKE_PASSES[bake_pass][0]
    return [i['id'] for i in found if i['kind'] in keys or i['id'] in keys]


def stage_bake(args, work):
    import time

    import bpy
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import bake as room_bake

    layout = load_layout()
    assert_masters(layout, load_masters(), sources_dir())
    found = json.loads((work / 'posters-layout.json').read_text())['islands']
    meshes = {m['island']: m for m in json.loads((work / 'posters-geometry.json').read_text())['meshes']}
    wanted = list(BAKE_PASSES) if args.passes == 'all' else args.passes.split(',')
    started = time.time()
    bpy.ops.wm.open_mainfile(filepath=str(work / 'room-source.blend'))
    scene = bpy.context.scene
    room_bake.configure_bake(scene, args.samples, args.device)
    room_bake.prepare_scene(scene)
    # The scene denoises its renders; a bake denoises per island in the compose stage instead (5.2), so the
    # path tracer's own full-image pass would only blur islands into their gutters (and costs minutes).
    scene.cycles.use_denoising = False
    built = BakeScene(layout, sources_dir())
    built.build()
    print(f'SCENE_READY {time.time() - started:.1f}s sheets {len(built.sheets)} tapes {len(built.tapes)}', flush=True)
    eye = bpy.data.objects.new('pst_eye', bpy.data.cameras.new('pst_eye'))
    eye.location = ROOM_EYE
    scene.collection.objects.link(eye)
    scene.camera = eye
    settings = scene.render.bake
    settings.use_selected_to_active = True
    settings.cage_extrusion = CAGE
    settings.max_ray_distance = 2 * CAGE
    settings.view_from = 'ACTIVE_CAMERA'
    settings.margin = 2
    settings.margin_type = 'EXTEND'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '16'
    width, height = layout['atlas']['size']
    for bake_pass in wanted:
        _kinds, visible, samples, bake_type = BAKE_PASSES[bake_pass]
        t0 = time.time()
        positions, faces, uvs = join_meshes([meshes[i] for i in pass_islands(found, bake_pass)])
        target = built.link('pst_target', positions, faces, bpy.data.materials.new('pst_target'), uvs)
        for flag in ('camera', 'diffuse', 'glossy', 'transmission', 'volume_scatter', 'shadow'):
            setattr(target, 'visible_' + flag, False)
        image = bpy.data.images.new('pst_' + bake_pass, width, height, alpha=False, float_buffer=True)
        if bake_pass in GUIDE_PASSES:
            image.colorspace_settings.name = 'Non-Color'
        material = target.data.materials[0]
        material.use_nodes = True
        node = material.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        material.node_tree.nodes.active = node
        scene.cycles.samples = getattr(args, samples)
        for obj in built.poster_objects():
            obj.hide_render = not visible
        bpy.ops.object.select_all(action='DESELECT')
        for obj in built.selection(bake_pass):
            obj.hide_render = False
            obj.select_set(True)
        for obj in built.hidden(bake_pass):
            obj.hide_render = True
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        if bake_type == 'DIFFUSE':
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
        elif bake_type == 'NORMAL':
            # The target sits at the world origin unrotated: its object space is world space.
            bpy.ops.object.bake(type='NORMAL', normal_space='OBJECT')
        else:
            bpy.ops.object.bake(type='COMBINED')
        if bake_pass in GUIDE_PASSES:
            image.filepath_raw = str(work / bake_file(bake_pass))
            image.file_format = 'OPEN_EXR'
            image.save()
        else:
            image.save_render(str(work / bake_file(bake_pass)), scene=scene)
        print(f'BAKE_DONE {bake_pass} {time.time() - t0:.1f}s', flush=True)
        bpy.data.images.remove(image)
        data = target.data
        bpy.data.objects.remove(target, do_unlink=True)
        bpy.data.meshes.remove(data)


def join_meshes(parts):
    positions, faces, uvs = [], [], []
    for part in parts:
        start = len(positions)
        positions += part['positions']
        uvs += part['uvs']
        faces += [tuple(start + k for k in tri) for tri in part['tris']]
    return positions, faces, {'BakeUV': uvs}


# ---------------------------------------------------------------- compose (Blender's numpy; no scene)

#: The paper's thickness reads as a 1 px darker rim round every sheet.
RIM_SHADE = 0.85
#: Contact-shadow factor = with / max(without, SHADOW_FLOOR). A skirt side's outer SKIRT_RING_PX ring must reach
#: SKIRT_RING_MIN on average over the wall it shows, and no 1 cm segment of it may cut off more than SKIRT_STEP_MAX
#: of the wall's displayed value ((1 - factor) x the bare pass's luma): the outermost row is exactly 1 by construction
#: (skirt_factor), so these bound how much shadow the ease cuts off, along the side and locally (a curled corner's
#: longer shadow). The local bound is a display step (5 of 255 levels, spread over the ease) rather than a factor
#: floor because a factor floor chases the ratio's grain where the night wall is dark: between two bakes of an
#: unchanged side (repacked, so other samples) a 1 cm segment's minimum moved by up to 0.049 (90th percentile 0.011)
#: while the side's mean moved by at most 0.005, and a 0.95 floor flagged new sides on every relayout.
SHADOW_FLOOR, SKIRT_RING_MIN, SKIRT_STEP_MAX, SKIRT_RING_PX = 0.02, 0.99, 0.02, 2


def ring_holds(ring):
    return ring is None or (ring['mean'] >= SKIRT_RING_MIN and ring['step'] <= SKIRT_STEP_MAX)


#: The die-cut sticker's white vinyl margin beyond its art's alpha.
DIE_CUT_MARGIN = 0.0015
#: Tape acceptance (4.3): overhang over its wall, and on-sheet tape over the art round it. Pale tape cannot read
#: lighter than pale art (lit, the on-sheet halves read 0.05-0.46 display luma), so the on-sheet rule binds every tape
#: whose art reads darker than TAPE_DARK_ART: all 38 such tapes of the shipped layout read >= 1.32 (TAPE_ART_MIN
#: leaves a margin), while those over paler art are reported, not gated (the share was 76% against a 75% floor).
TAPE_ART_MIN, TAPE_DARK_ART, TAPE_RING_PX = 1.15, 0.06, 3
#: The overhang over its own bare wall, per surface: the back wall's sage plaster, and the pale slope, where even
#: white tape lit as the paint is can read only its albedo over the paint's: the white paper tape reads 1.13-1.21 over
#: 25 slope overhangs (the cream masking tape read 1.01-1.09 there), so the slope holds 1.10, a deliberate departure
#: from the spec's 1.3 that the physics sets, not the tape.
TAPE_WALL_MIN = {'back': 1.3, 'slope': 1.10}
#: A wall texel darker than this in the bare pass (corkboard's shade, the slope's foot) says nothing about tape.
BARE_MIN = 0.01
#: The ring check reads 1 cm segments of the outer ring; the far-field bands keep SKIRT_CLEAR_PX off every opaque
#: footprint.
SKIRT_SEGMENT, SKIRT_CLEAR_PX = 0.01, 1
LUMA = (0.2126, 0.7152, 0.0722)


def read_png(np, path):
    """A 16-bit PNG as float rows from the top, through Blender's loader with no colour conversion."""
    import bpy
    image = bpy.data.images.load(str(path))
    image.colorspace_settings.name = 'Non-Color'
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    channels = pixels.reshape(height, width, 4)[::-1, :, :3]
    bpy.data.images.remove(image)
    return np.ascontiguousarray(channels)


def write_png(np, path, rgb):
    """16-bit RGB PNG (filter 0, zlib 6): deterministic bytes from the float atlas."""
    import struct
    import zlib
    height, width, _ = rgb.shape
    samples = (np.clip(rgb, 0, 1) * 65535 + 0.5).astype('>u2')
    rows = np.concatenate([np.zeros((height, 1), np.uint8), samples.view(np.uint8).reshape(height, -1)], axis=1)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    header = struct.pack('>IIBBBBB', width, height, 16, 2, 0, 0, 0)
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
                           + chunk(b'IDAT', zlib.compress(rows.tobytes(), 6)) + chunk(b'IEND', b''))


def island_fractions(np, island):
    """(fu, fv) at every texel centre of an island's content, rows from the top."""
    _x, _y, w, h = island['rect']
    i, j = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    if island['turned']:
        return j / h, i / w
    return i / w, 1 - j / h


def coverage(np, layout, island, mesh):
    """Texels whose centre lies within 0.75 px of one of the island's triangles (the bake's margin covers them)."""
    width, height = layout['atlas']['size']
    x, y, w, h = island['rect']
    pts = np.array([(u * width - x, (1 - v) * height - y) for u, v in mesh['uvs']])
    cx, cy = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    covered = np.zeros((h, w), bool)
    for tri in mesh['tris']:
        p = pts[list(tri)]
        if abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0])) < 1e-9:
            continue
        sign = 1.0 if (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) > 0 else -1.0
        inside_all = np.ones((h, w), bool)
        for a, b in ((p[0], p[1]), (p[1], p[2]), (p[2], p[0])):
            ex, ey = b[0] - a[0], b[1] - a[1]
            distance = sign * (ex * (cy - a[1]) - ey * (cx - a[0])) / math.hypot(ex, ey)
            inside_all &= distance >= -0.75
        covered |= inside_all
    return covered


def fill_from(np, content, valid):
    """Every invalid texel takes the mean of its valid neighbours, ring by ring (the island's own dilation)."""
    content, valid = content.copy(), valid.copy()
    while not valid.all():
        assert valid.any(), 'an island with no baked texel'
        padded = np.pad(content * valid[..., None], ((1, 1), (1, 1), (0, 0)))
        weight = np.pad(valid.astype(np.float32), 1)
        total = sum(padded[1 + dy:padded.shape[0] - 1 + dy, 1 + dx:padded.shape[1] - 1 + dx]
                    for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        count = sum(weight[1 + dy:weight.shape[0] - 1 + dy, 1 + dx:weight.shape[1] - 1 + dx]
                    for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        grow = ~valid & (count > 0)
        content[grow] = total[grow] / count[grow][:, None]
        valid |= grow
    return content


def blur2(np, plane):
    """Separable binomial blur of radius 2 px, edges clamped to the island."""
    kernel = np.array([1, 4, 6, 4, 1], np.float32) / 16
    for axis in (0, 1):
        padded = np.pad(plane, [(2, 2) if a == axis else (0, 0) for a in (0, 1)], mode='edge')
        n = plane.shape[axis]
        plane = sum(k * np.take(padded, np.arange(n) + t, axis=axis) for t, k in enumerate(kernel))
    return plane


def lanczos_halve(np, n):
    """(n/2, n) Lanczos3 weights for a ×0.5 downsample with edges clamped to the island."""
    out = np.zeros((n // 2, n), np.float64)
    for k in range(n // 2):
        for i in range(2 * k - 5, 2 * k + 7):
            d = (i + 0.5 - (2 * k + 1)) / 2
            weight = 1.0 if d == 0 else 3 * math.sin(math.pi * d) * math.sin(math.pi * d / 3) / (math.pi * d) ** 2
            out[k, min(max(i, 0), n - 1)] += weight if abs(d) < 3 else 0.0
    return out / out.sum(axis=1, keepdims=True)


def item_of(layout, key):
    if key == 'corkboard':
        return corkboard_item(layout)
    return next(i for i in layout['items'] if i['key'] == key)


def inside_all(np, poly, a, b, grow=0.0):
    """Which of the points (a, b) lie inside the convex polygon grown by `grow` metres."""
    poly = ccw(list(poly))
    hit = np.ones(np.shape(a), bool)
    for p, q in zip(poly, poly[1:] + poly[:1]):
        ex, ey = q[0] - p[0], q[1] - p[1]
        hit &= (ex * (b - p[1]) - ey * (a - p[0])) / math.hypot(ex, ey) >= -grow
    return hit


def other_sheets(layout, item):
    """Surface rectangles of every sheet sharing the item's surface (and the corkboard on the back wall)."""
    out = [rect(o) for o in layout['items'] if o['key'] != item['key'] and o['surface'] == item['surface']]
    if item['surface'] == 'back' and item['key'] != 'corkboard':
        out.append(rect(corkboard_item(layout)))
    return out


def opaque_polygons(layout, surface):
    """Every opaque footprint on a surface (sheets, tape strips, pins, the corkboard): what a skirt ring excludes."""
    out = [rect(corkboard_item(layout))] if surface == 'back' else []
    for item in layout['items']:
        if item['surface'] == surface:
            out += [polygon for name, polygon in footprint(layout, item) if name != 'skirt']
    return out


def covered(np, polygons, a, b, grow=0.0):
    hit = np.zeros(np.shape(a), bool)
    for poly in polygons:
        hit |= inside_all(np, poly, a, b, grow)
    return hit


def skirt_points(layout, item, island, fu, fv):
    """Skirt texel fractions → sheet-local (u, v): the inverse of skirt_mesh's planar mapping."""
    w, h, s = item['w'] / 2, item['h'] / 2, island['skirt'][island['side']]
    (ia, ib, (ox, oy)) = SKIRT_SIDES[island['side']]
    tx, ty = ib[0] - ia[0], ib[1] - ia[1]
    norm = math.hypot(tx, ty)
    tx, ty = tx / norm, ty / norm
    o0, o1 = skirt_corner(item, island['skirt'], ia), skirt_corner(item, island['skirt'], ib)
    length = (o1[0] - o0[0]) * tx + (o1[1] - o0[1]) * ty
    along = o0[0] * tx + o0[1] * ty + fu * length
    out = w * abs(ox) + h * abs(oy) + (1 - fv) * s
    return along * tx + out * ox, along * ty + out * oy


def luma(np, rgb):
    return rgb @ np.array(LUMA, np.float32)


def die_cut_mask(np, item, island):
    """The sticker's shape at the island's texels: its art's alpha grown by the vinyl margin, area-sampled."""
    import bpy
    image = bpy.data.images.load(str(sources_dir() / item['source']))
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    solid = pixels.reshape(height, width, 4)[..., 3] > 0.5  # rows from the bottom, like Blender UVs
    bpy.data.images.remove(image)
    grow = round(DIE_CUT_MARGIN / item['w'] * width)
    for k in range(grow):
        step = np.pad(solid, 1)
        if k % 2:
            solid = step[1:-1, 1:-1] | step[:-2, 1:-1] | step[2:, 1:-1] | step[1:-1, :-2] | step[1:-1, 2:]
        else:
            solid = np.maximum.reduce([step[1 + dy:step.shape[0] - 1 + dy, 1 + dx:step.shape[1] - 1 + dx]
                                       for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    fu, fv = island_fractions(np, island)
    _x, _y, w, h = island['rect']
    mask = np.zeros(fu.shape, np.float32)
    for sy in range(4):
        for sx in range(4):
            du, dv = (sx - 1.5) / 4, (sy - 1.5) / 4
            su, sv = (fv + du / w, fu + dv / h) if island['turned'] else (fu + du / w, fv - dv / h)
            mu, mv = art_uv(item, su, sv)
            px = np.clip((np.asarray(mu) * width).astype(int), 0, width - 1)
            py = np.clip((np.asarray(mv) * height).astype(int), 0, height - 1)
            mask += solid[py, px]
    return mask / 16


def tape_report(np, layout, found, beauty, bare):
    """4.3: every tape's overhang against its bare wall, and its on-sheet half against the art round it."""
    by_id = {i['id']: i for i in found}
    walls, sheets = [], []
    for item in layout['items']:
        card = by_id[item['key']]
        x, y, w, h = card['rect']
        fu, fv = island_fractions(np, card)
        u, v = (fu - 0.5) * item['w'], (fv - 0.5) * item['h']
        outlines = {t['spot']: tape_outline(layout, t) for t in item['tapes']}

        def within(poly, grow=0.0):
            poly = ccw(poly)
            hit = np.ones(u.shape, bool)
            for a, b in zip(poly, poly[1:] + poly[:1]):
                ex, ey = b[0] - a[0], b[1] - a[1]
                hit &= (ex * (v - a[1]) - ey * (u - a[0])) / math.hypot(ex, ey) >= -grow
            return hit

        texel = 1 / (item['density'] * 100)
        lum = luma(np, beauty[y:y + h, x:x + w])
        for tape in item['tapes']:
            if tape.get('hiddenFraction', 0) >= 0.5:
                continue
            on = within(outlines[tape['spot']])
            ring = within(outlines[tape['spot']], TAPE_RING_PX * texel) & ~on
            for spot, poly in outlines.items():
                if spot != tape['spot']:
                    ring &= ~within(poly)
            if on.sum() and ring.sum():
                sheets.append(dict(tape=f'{item["key"]}.{tape["spot"]}',
                                   ratio=round(float(lum[on].mean() / max(lum[ring].mean(), 1e-4)), 3),
                                   art=round(float(lum[ring].mean()), 4)))
            island = by_id.get(f'{item["key"]}.tape.{tape["spot"]}')
            if island is None:
                continue
            ox, oy, ow, oh = island['rect']
            fu, fv = island_fractions(np, island)
            (cu, cv), along, across = tape_frame(tape)
            s0, t0, s1, t1 = island['extent']
            s, t = s0 + fu * (s1 - s0), t0 + fv * (t1 - t0)
            pu, pv = cu + s * along[0] + t * across[0], cv + s * along[1] + t * across[1]
            off_sheet = (np.abs(pu) > item['w'] / 2) | (np.abs(pv) > item['h'] / 2)
            strip = (np.abs(s) <= layout['tapeSize'][0] / 2) & (np.abs(t) <= layout['tapeSize'][1] / 2)
            under_lum = luma(np, bare[oy:oy + oh, ox:ox + ow])
            wall = off_sheet & strip & (under_lum > BARE_MIN)
            wall &= ~covered(np, other_sheets(layout, item), *to_surface(item, pu, pv))
            area = wall.sum() * (1 / island['density']) ** 2
            if area < 1.0:
                continue
            lit = luma(np, beauty[oy:oy + oh, ox:ox + ow])[wall].mean()
            under = under_lum[wall].mean()
            walls.append(dict(tape=island['id'], surface=item['surface'], areaCm2=round(float(area), 2),
                              ratio=round(float(lit / max(under, 1e-4)), 3)))
    return walls, sheets


#: The noise gate (5.2): flat patches of NOISE_PATCH texels (24 finds too few flat runs in the art), high-pass
#: residual std at most NOISE_GATE × the room wall's at the same brightness.
NOISE_PATCH, NOISE_GATE, NOISE_BINS = 16, 1.10, (0.02, 0.05, 0.1, 0.2, 0.4, 1.01)
#: A patch is flat art when the master's own residual there stays under this (display luminance).
ART_FLAT = 0.006
#: Skirt sides widen in SKIRT_STEP steps up to SKIRT_MAX; the widened widths live in WORK/posters-skirts.json.
SKIRT_STEP, SKIRT_MAX = 0.01, 0.08
#: A skirt side's far field is its outer SKIRT_FEATHER band: the factor is divided by it (the posters' own small
#: change to the room's bounce light is not the contact shadow, and the room's atlas carries none of it) and eases
#: to exactly 1 across it. The band inside must have decayed to SKIRT_DECAY_MIN of it (else the side widens), and a
#: far field under SKIRT_LEVEL_MIN means an occluder in the skirt. Bands read at least SKIRT_BAND_TEXELS texels.
SKIRT_FEATHER, SKIRT_DECAY_MIN, SKIRT_LEVEL_MIN, SKIRT_BAND_TEXELS = 0.005, 0.98, 0.8, 16
#: A side whose outer edge lies within SKIRT_EDGE of its surface's edge is bounded by it.
SKIRT_EDGE = 0.002
#: The noise gate reads only brightness bands with at least NOISE_MIN_PATCHES flat patches.
NOISE_MIN_PATCHES = 8


def patch_noise(np, lum, flat=None):
    """[(mean, residual std)] of every NOISE_PATCH square patch (optionally only where `flat`)."""
    residual = lum - blur2(np, lum)
    out = []
    n = NOISE_PATCH
    for y in range(0, lum.shape[0] - n + 1, n):
        for x in range(0, lum.shape[1] - n + 1, n):
            if flat is not None and not flat[y:y + n, x:x + n].all():
                continue
            out.append((float(lum[y:y + n, x:x + n].mean()), float(residual[y + 2:y + n - 2, x + 2:x + n - 2].std())))
    return out


def binned(samples):
    """Median residual per brightness bin."""
    out = {}
    for lo, hi in zip(NOISE_BINS, NOISE_BINS[1:]):
        values = sorted(s for m, s in samples if lo <= m < hi)
        if values:
            out[f'{lo}-{hi}'] = (values[len(values) // 2], len(values))
    return out


def art_flatness(np, item, island):
    """Where the master is flat at the island's texels: its residual (same high-pass) under ART_FLAT."""
    import bpy
    image = bpy.data.images.load(str(sources_dir() / item['source']))
    image.colorspace_settings.name = 'Non-Color'
    _x, _y, w, h = island['rect']
    # Twice the island's texels is all the 3x3 supersampling reads; scaling first keeps 29 masters cheap.
    scale = min(1.0, 2 * max(w, h) / max(image.size))
    if scale < 1:
        image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    lum = luma(np, pixels.reshape(height, width, 4)[..., :3])
    fu, fv = island_fractions(np, island)
    art = np.zeros(fu.shape, np.float32)
    for sy in range(3):
        for sx in range(3):
            du, dv = (sx - 1) / 3, (sy - 1) / 3
            su, sv = (fv + du / w, fu + dv / h) if island['turned'] else (fu + du / w, fv - dv / h)
            mu, mv = art_uv(item, su, sv)
            art += lum[np.clip((mv * height).astype(int), 0, height - 1), np.clip((mu * width).astype(int), 0, width - 1)]
    art /= 9
    return np.abs(art - blur2(np, art)) < ART_FLAT


class Clock:
    """Seconds per named phase, so the stage can show where its two-minute budget goes."""

    def __init__(self):
        import time
        self.now, self.spent = time.time, {}
        self.last = self.now()

    def lap(self, name):
        now = self.now()
        self.spent[name] = self.spent.get(name, 0.0) + now - self.last
        self.last = now

    def __str__(self):
        return ', '.join(f'{k} {v:.1f}s' for k, v in sorted(self.spent.items(), key=lambda kv: -kv[1]) if k != '-')


def on_surface_np(np, surface, a, b):
    """on_surface over arrays of points."""
    if surface == 'back':
        top = np.where(a <= RIDGE[0], RIDGE[1], RIDGE[1] - (a - RIDGE[0]) * 0.757)
        return (a >= -2.80) & (a <= 2.80) & (b >= 0) & (b <= top)
    return (a >= -2.40) & (a <= 2.40) & (b >= 0) & (b <= SLOPE_LENGTH)


def skirt_keepouts(layout, item, sides):
    """The keep-outs of its surface that an item's skirt at these widths would enter."""
    poly = skirt_rect(item, sides)
    return [zone for zone, zbox in layout['keepouts'][item['surface']].items() if overlap(poly, box(zbox)) > 0]


def skirt_bounded(layout, item, side, sides):
    """Whether a side's outer edge runs onto its surface's edge (the corkboard's left skirt meets the room's corner):
    its shadow carries on round the corner, so the skirt keeps it whole rather than easing it out."""
    ia, ib, (ox, oy) = SKIRT_SIDES[side]
    o0, o1 = skirt_corner(item, sides, ia), skirt_corner(item, sides, ib)
    u, v = (o0[0] + o1[0]) / 2 + ox * SKIRT_EDGE, (o0[1] + o1[1]) / 2 + oy * SKIRT_EDGE
    return not on_surface(item['surface'], *to_surface(item, u, v))


def skirt_profile(np, layout, island, item, baked, valid):
    """A skirt island's raw shadow ratio (smoothed passes divided, so a dark texel's noise is not clipped into a
    bias), its distances beyond the sheet edge and the texels the checks may read."""
    here = (slice(island['rect'][1], island['rect'][1] + island['rect'][3]),
            slice(island['rect'][0], island['rect'][0] + island['rect'][2]))
    lit, bare = (blur2(np, fill_from(np, luma(np, baked[name][here])[..., None], valid)[..., 0])
                 for name in ('shadow', 'bare'))
    fu, fv = island_fractions(np, island)
    s = island['skirt'][island['side']]
    a, b = to_surface(item, *skirt_points(layout, item, island, fu, fv))
    texel = 1 / (island['density'] * 100)
    seen = valid & ~covered(np, opaque_polygons(layout, item['surface']), a, b, SKIRT_CLEAR_PX * texel)
    seen &= on_surface_np(np, item['surface'], a, b) & (bare > BARE_MIN)
    return dict(lit=lit, bare=bare, raw=lit / np.maximum(bare, SHADOW_FLOOR), fu=fu, fv=fv, dist=(1 - fv) * s, s=s,
                seen=seen)


def band_ratio(profile, lo, hi):
    """Shadow over bare, summed over the seen texels lo..hi metres beyond the sheet edge (None when too few)."""
    band = profile['seen'] & (profile['dist'] >= lo) & (profile['dist'] < hi)
    if band.sum() < SKIRT_BAND_TEXELS:
        return None
    return float(profile['lit'][band].sum() / profile['bare'][band].sum())


def skirt_levels(np, layout, found, baked, valid_of):
    """Every skirt side's far-field level (its outer SKIRT_FEATHER band) and decay (the band inside it, relative)."""
    out = {}
    for island in found:
        if island['kind'] != 'skirt':
            continue
        item = item_of(layout, island['item'])
        profile = skirt_profile(np, layout, island, item, baked, valid_of(island))
        s = profile['s']
        bounded = skirt_bounded(layout, item, island['side'], island['skirt'])
        level = None if bounded else band_ratio(profile, s - SKIRT_FEATHER, s + 1)
        inner = None if level is None else band_ratio(profile, s - 2 * SKIRT_FEATHER, s - SKIRT_FEATHER)
        out[island['id']] = dict(profile=profile, bounded=bounded, level=level,
                                 decay=None if inner is None else inner / level)
    return out


def skirt_factor(np, island, levels):
    """The skirt's multiply factor: the raw ratio over its side's far-field level (interpolated to the neighbours'
    at the outer corners, so the diagonal seams stay continuous), eased to exactly 1 across the outer band."""
    side, key = island['side'], island['item']
    here = levels[island['id']]
    profile = here['profile']
    if here['bounded']:
        return np.clip(profile['raw'], 0, 1)

    def level(name):
        found = levels[f'{key}.skirt.{name}']
        return None if found['bounded'] else found['level']

    own = level(side)
    ia, ib, _out = SKIRT_SIDES[side]
    corners = []
    for corner in (ia, ib):
        other = level(('r' if corner[0] > 0 else 'l') if side in 'bt' else ('t' if corner[1] > 0 else 'b'))
        known = [v for v in (own, other) if v is not None]
        corners.append(sum(known) / len(known) if known else 1.0)
    middle = own if own is not None else sum(corners) / 2
    fu = profile['fu']
    far = np.where(fu < 0.5, corners[0] + (middle - corners[0]) * fu * 2, middle + (corners[1] - middle) * (fu - 0.5) * 2)
    factor = np.clip(profile['raw'] / far, 0, 1)
    # Measured from the outermost texel row's centre, so that row is exactly 1 and the mesh edge, which samples it,
    # meets the bare wall without a step; at 2 px/cm the ease spans the ring's two rows.
    texel = profile['s'] / (island['rect'][3] if not island['turned'] else island['rect'][2])
    t = np.clip((profile['s'] - profile['dist'] - texel / 2) / max(SKIRT_FEATHER, SKIRT_RING_PX * texel), 0, 1)
    return 1 - (1 - factor) * t * t * (3 - 2 * t)


def denoise(np, work, rgb, albedo=None, normal=None):
    """OIDN through the compositor's Denoise node (prefilter Accurate), with the albedo and normal guides when given;
    an empty Workbench scene renders the node tree at the atlas's size."""
    import bpy
    height, width, _ = rgb.shape
    scene = bpy.data.scenes.new('pst_denoise')
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = width, height, 100
    scene.camera = bpy.data.objects.new('pst_denoise_eye', bpy.data.cameras.new('pst_denoise_eye'))
    scene.collection.objects.link(scene.camera)
    tree = bpy.data.node_groups.new('pst_denoise', 'CompositorNodeTree')
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    scene.compositing_node_group = tree
    node = tree.nodes.new('CompositorNodeDenoise')
    node.inputs['HDR'].default_value = False
    node.inputs['Prefilter'].default_value = 'Accurate'
    images = []
    for name, plane in (('Image', rgb), ('Albedo', albedo), ('Normal', normal)):
        if plane is None:
            continue
        image = bpy.data.images.new('pst_dn_' + name, width, height, alpha=True, float_buffer=True)
        image.colorspace_settings.name = 'Non-Color'
        rgba = np.concatenate([plane[::-1], np.ones((height, width, 1), np.float32)], axis=2)
        image.pixels.foreach_set(np.ascontiguousarray(rgba, np.float32).ravel())
        source = tree.nodes.new('CompositorNodeImage')
        source.image = image
        tree.links.new(source.outputs['Image'], node.inputs[name])
        images.append(image)
    tree.links.new(node.outputs['Image'], tree.nodes.new('NodeGroupOutput').inputs[0])
    settings = scene.render.image_settings
    settings.file_format, settings.color_depth, settings.color_mode = 'OPEN_EXR', '32', 'RGB'
    path = work / 'posters-denoised.exr'
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    out = read_png(np, path)
    for image in images:
        bpy.data.images.remove(image)
    bpy.data.scenes.remove(scene)
    return out


def place(np, atlas, island, content, scale=1):
    """Writes an island's content (and its gutter, edge-padded) into an atlas at 1/scale."""
    x, y, w, h = (v // scale for v in island['rect'])
    g = GUTTER_SIDE // scale
    atlas[y - g:y + h + g, x - g:x + w + g] = np.pad(content, ((g, g), (g, g), (0, 0)), mode='edge')


def stage_compose(args, work):
    import time

    import numpy as np
    started = time.time()
    layout = load_layout()
    found = json.loads((work / 'posters-layout.json').read_text())['islands']
    meshes = {m['island']: m for m in json.loads((work / 'posters-geometry.json').read_text())['meshes']}
    width, height = layout['atlas']['size']
    baked = {name: read_png(np, work / bake_file(name)) for name in BAKE_PASSES}
    clock = Clock()
    valid = {i['id']: coverage(np, layout, i, meshes[i['id']]) for i in found}
    clock.lap('coverage')

    # The lit islands, each dilated into its own gutter, denoised together with their albedo and normal guides.
    lit = {name: np.zeros((height, width, 3), np.float32) for name in ('beauty', 'under', 'albedo', 'normal')}
    for island in found:
        if island['kind'] == 'skirt':
            continue
        x, y, w, h = island['rect']
        here = (slice(y, y + h), slice(x, x + w))
        for name in lit:
            if name != 'under' or island['item'] == DIE_CUT:
                place(np, lit[name], island, fill_from(np, baked[name][here], valid[island['id']]))
    lit['normal'] = lit['normal'] * 2 - 1
    clock.lap('fill')
    clean = denoise(np, work, lit['beauty'], lit['albedo'], lit['normal'])
    clean_under = denoise(np, work, lit['under'])
    clock.lap('denoise')

    # The two skirt passes, each island dilated into its gutter and denoised (a ratio of two 512-sample bakes of a
    # dark wall is speckled at the 1 cm scale the ring check reads; the shadows themselves are centimetres wide).
    skirt_passes = {name: np.zeros((height, width, 3), np.float32) for name in ('shadow', 'bare')}
    for island in found:
        if island['kind'] == 'skirt':
            x, y, w, h = island['rect']
            for name, plane in skirt_passes.items():
                place(np, plane, island, fill_from(np, baked[name][y:y + h, x:x + w], valid[island['id']]))
    skirt_passes = {name: denoise(np, work, plane) for name, plane in skirt_passes.items()}
    clock.lap('skirt-denoise')
    levels = skirt_levels(np, layout, found, skirt_passes, lambda island: valid[island['id']])
    clock.lap('skirt-levels')
    full = np.zeros((height, width, 3), np.float32)
    half = np.zeros((height // 2, width // 2, 3), np.float32)
    rings, ring_rects, flat_noise = {}, {}, []
    for island in found:
        x, y, w, h = island['rect']
        item = item_of(layout, island['item'])
        here = (slice(y, y + h), slice(x, x + w))
        if island['kind'] == 'skirt':
            factor = skirt_factor(np, island, levels)
            content = np.repeat(factor[..., None], 3, axis=2)
            profile = levels[island['id']]['profile']
            if not levels[island['id']]['bounded']:
                # The outer 2 px ring, read in 1 cm segment means over the texels the wall shows (never under another
                # card, a tape or a pin, where the multiply is covered); the segments seen whole are what the decoded
                # atlas is checked against (verify.mjs).
                band = profile['dist'] > profile['s'] - SKIRT_RING_PX / (island['density'] * 100)
                ring = band & profile['seen']
                segment = (profile['fu'] * (w if not island['turned'] else h) / (island['density'] * 100)
                           / SKIRT_SEGMENT).astype(int)
                wall = luma(np, skirt_passes['bare'][here])
                segments = [(k, float(factor[ring & (segment == k)].mean()), float(wall[ring & (segment == k)].mean()))
                            for k in np.unique(segment[ring])]
                if segments:
                    rings[island['id']] = dict(mean=float(factor[ring].mean()),
                                               segment=min(f for _, f, _ in segments),
                                               step=max((1 - f) * lit for _, f, lit in segments))
                # The runs of consecutive segments the wall shows whole, one atlas rect each (a few per side, so the
                # contract the shipped glb carries for verify.mjs stays a few kB).
                runs, previous = [], None
                for k, _, _ in segments:
                    whole = band & (segment == k)
                    if (whole & ~ring).any():
                        previous = None
                        continue
                    if previous is None or k != previous + 1:
                        runs.append(whole)
                    else:
                        runs[-1] = runs[-1] | whole
                    previous = k
                for run in runs:
                    rows, cols = np.nonzero(run)
                    ring_rects.setdefault(island['id'], []).append(
                        [int(x + cols.min()), int(y + rows.min()),
                         int(cols.max() - cols.min() + 1), int(rows.max() - rows.min() + 1)])
        else:
            content = clean[here].copy()
            if island['kind'] == 'card':
                edge = np.zeros((h, w), bool)
                if island['item'] == DIE_CUT:
                    shape = die_cut_mask(np, item, island)[..., None]
                    content = content * shape + clean_under[here] * (1 - shape)
                    solid = np.pad(shape[..., 0] > 0.5, 1)
                    edge = solid[1:-1, 1:-1] & ~(solid[:-2, 1:-1] & solid[2:, 1:-1] & solid[1:-1, :-2] & solid[1:-1, 2:])
                else:
                    edge[[0, -1], :] = edge[:, [0, -1]] = True
                    flat_noise += patch_noise(np, luma(np, content), art_flatness(np, item, island))
                content[edge] *= RIM_SHADE
        place(np, full, island, content)
        # Two separable passes (a three-operand einsum would contract naively, O(h·w²·h)).
        small = np.einsum('ikc,lk->ilc', np.einsum('ij,jkc->ikc', lanczos_halve(np, h), content),
                          lanczos_halve(np, w)).clip(0, 1)
        place(np, half, island, small, 2)
    clock.lap('compose')
    print(f'COMPOSED {len(found)} islands {time.time() - started:.1f}s ({clock})', flush=True)

    skirts_path = work / 'posters-skirts.json'
    skirts = json.loads(skirts_path.read_text()) if skirts_path.exists() else {}
    widen, dark, capped, covered = [], [], [], []
    for island_id, here in sorted(levels.items()):
        if here['level'] is not None and here['level'] < SKIRT_LEVEL_MIN:
            dark.append(f"{island_id} far field {here['level']:.3f}")
        if here['level'] is None and not here['bounded']:
            # The side's outer band lies under a neighbouring card (F3's left side runs under A1): the few ring texels
            # the wall still shows sit in that card's own contact shadow, which its skirt carries, so widening this
            # side only slides its ring further under the card. Reported, not held to the ring.
            covered.append(island_id)
        # A side widens when its shadow has not decayed into its far field yet, or when its outer ring still carries
        # one somewhere along it (a curled corner throws a longer shadow than the side's mean decay shows).
        elif (here['decay'] is not None and here['decay'] < SKIRT_DECAY_MIN) or not ring_holds(rings.get(island_id)):
            key, side = island_id.split('.skirt.')
            sides = skirt_sides(layout, key, skirts)
            wider = dict(sides, **{side: round(sides[side] + SKIRT_STEP, 4)})
            # A side that cannot widen without entering a keep-out (the corkboard's right side meets the window
            # frame) keeps its width and eases out from its far field as every side does; reported, not widened.
            if skirt_keepouts(layout, item_of(layout, key), wider):
                capped.append(island_id)
            else:
                widen.append(island_id)
        print(f"SKIRT {island_id} level {here['level'] if here['level'] is None else round(here['level'], 4)} "
              f"decay {here['decay'] if here['decay'] is None else round(here['decay'], 4)}"
              f"{' bounded' if here['bounded'] else ''}", flush=True)
    walls, sheets = tape_report(np, layout, found, full, baked['bare'])
    # The wall's grain is the gate's reference: without it the gate would compare nothing and pass (5.2).
    baseline = work / 'posters-wall-baseline.png'
    assert baseline.exists(), f'{baseline} is missing: build-posters.mjs writes it before this stage'
    room = read_png(np, baseline)
    wall_noise = binned(patch_noise(np, luma(np, room), luma(np, room) > 0.004))
    poster_noise = binned(flat_noise)
    report = dict(skirtLevels={k: dict(level=v['level'], decay=v['decay'], bounded=v['bounded'],
                                       capped=k in capped)
                               for k, v in sorted(levels.items())},
                  skirtRings={k: {m: round(v, 4) for m, v in r.items()} for k, r in sorted(rings.items())},
                  # A capped side keeps its width at a keep-out and a covered side's ring lies under a neighbour, so
                  # their rings are reported, not held to the floor.
                  skirtRingRects={k: v for k, v in sorted(ring_rects.items()) if k not in capped + covered},
                  skirtCapped=sorted(capped), skirtCovered=sorted(covered),
                  tapesOnWall=walls, tapesOnSheet=sheets,
                  noise={'posters': poster_noise, 'roomWall': wall_noise})
    (work / 'posters-tapes.json').write_text(json.dumps(report, indent=1) + '\n')
    weak_walls = [t['tape'] for t in walls if t['ratio'] < TAPE_WALL_MIN[t['surface']]]
    lighter = sum(t['ratio'] >= TAPE_ART_MIN for t in sheets) / max(len(sheets), 1)
    on_dark = [t for t in sheets if t['art'] < TAPE_DARK_ART]
    dull = [t['tape'] for t in on_dark if t['ratio'] < TAPE_ART_MIN]
    print(f'TAPES wall {len(walls)} (min {min(t["ratio"] for t in walls):.2f}, below {len(weak_walls)}) '
          f'sheet {len(sheets)} lighter {lighter * 100:.0f}%, over dark art {len(on_dark)} '
          f'(min {min((t["ratio"] for t in on_dark), default=float("nan")):.2f}, below {len(dull)})', flush=True)
    noisy, compared, skipped = [], [], []
    for band, (value, count) in poster_noise.items():
        base = wall_noise.get(band)
        print(f'NOISE {band} posters {value:.4f} ({count}) wall {base[0] if base else float("nan"):.4f} '
              f'({base[1] if base else 0})', flush=True)
        if base and count >= NOISE_MIN_PATCHES:
            compared.append(band)
            if value > NOISE_GATE * base[0]:
                noisy.append(band)
        else:
            skipped.append(band)
    # Too few flat patches to judge (or no wall to judge against): said, so a band the gate never read is not taken for
    # one that passed.
    if skipped:
        print(f'NOISE_SKIPPED {skipped}: under {NOISE_MIN_PATCHES} flat patches, or none of the wall', flush=True)
    write_png(np, work / 'posters-atlas-2k.png', full)
    write_png(np, work / 'posters-atlas-1k.png', half)
    if capped:
        print(f'SKIRTS_CAPPED by a keep-out: {capped}', flush=True)
    if covered:
        print(f'SKIRTS_COVERED by a neighbouring card: {covered}', flush=True)
    print(f'COMPOSE_DONE {time.time() - started:.1f}s', flush=True)
    assert not dark, f'skirts whose far field hides an occluder: {dark}'
    if widen:
        for island_id in widen:
            key, side = island_id.split('.skirt.')
            sides = skirt_sides(layout, key, skirts)
            skirts.setdefault(key, {})[side] = round(sides[side] + SKIRT_STEP, 4)
            assert skirts[key][side] <= SKIRT_MAX + 1e-9, f'{island_id}: its contact shadow outgrows {SKIRT_MAX} m'
        skirts_path.write_text(json.dumps(skirts, indent=1, sort_keys=True) + '\n')
        print('SKIRTS_WIDENED ' + json.dumps({k: skirts[k] for k in {i.split('.skirt.')[0] for i in widen}}), flush=True)
        sys.exit(3)
    weak_rings = {k: v for k, v in rings.items() if not ring_holds(v) and k not in capped + covered}
    assert not weak_rings, f'skirt rings below {SKIRT_RING_MIN} or stepping over {SKIRT_STEP_MAX}: {weak_rings}'
    assert compared, f'the noise gate found no brightness band to compare with the wall: {sorted(poster_noise)}'
    assert not noisy, f'the noise gate fails in {noisy}'
    assert not weak_walls, f'tape overhangs too dark on the wall: {weak_walls}'
    assert on_dark, 'no on-sheet tape lies over dark art: the on-sheet tape gate would compare nothing'
    assert not dull, f'on-sheet tapes no lighter than the dark art round them: {dull}'


# ---------------------------------------------------------------- stages

def stage_layout(args, work):
    layout = load_layout()
    assert_masters(layout, load_masters(), sources_dir())
    bad = validate(layout, json.loads((work / 'posters-skirts.json').read_text())
                   if (work / 'posters-skirts.json').exists() else None)
    if os.environ.get('POSTERS_PROBE'):
        # A measurement-only work directory: wide skirts probe how far each contact shadow reaches.
        bad = [line for line in bad if ' skirt ' not in line]
    for line in bad:
        print('LAYOUT_VIOLATION', line)
    assert not bad, f'{len(bad)} layout violations'
    skirts_path = work / 'posters-skirts.json'
    skirts = json.loads(skirts_path.read_text()) if skirts_path.exists() else None
    found, fill = pack(layout, skirts)
    print(f'LAYOUT_OK items {len(layout["items"])} islands {len(found)} fill {fill * 100:.1f}%', flush=True)
    (work / 'posters-layout.json').write_text(json.dumps({'islands': found, 'fill': round(fill, 4)}, indent=1) + '\n')
    meshes = geometry(layout, found)
    triangles = sum(len(m['tris']) for m in meshes)
    print(f'GEOMETRY_OK pieces {len(meshes)} triangles {triangles}', flush=True)
    (work / 'posters-geometry.json').write_text(json.dumps({'meshes': meshes, 'triangles': triangles}) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', required=True)
    parser.add_argument('--stage', choices=('layout', 'bake', 'compose'), required=True)
    parser.add_argument('--passes', default='all', help='bake: comma-separated ' + ', '.join(BAKE_PASSES))
    parser.add_argument('--skirt-samples', type=int, default=512)
    parser.add_argument('--samples', type=int, default=256)
    parser.add_argument('--guide-samples', type=int, default=16)
    parser.add_argument('--device', choices=('CPU', 'METAL'), default='CPU')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    work = Path(args.work).resolve()
    work.mkdir(parents=True, exist_ok=True)
    {'layout': stage_layout, 'bake': stage_bake, 'compose': stage_compose}[args.stage](args, work)


if __name__ == '__main__':
    main()
