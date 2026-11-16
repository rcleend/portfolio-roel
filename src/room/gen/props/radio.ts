import type { ArtRect } from '../art';
import {
  add,
  basis,
  compose,
  inset,
  type MeshBuilder,
  type Placement,
  place,
  type Rgb,
  type Ring,
  roundedRect,
  scale,
  type Vec3,
} from '../kit/builder';
import { hash32 } from '../kit/hash';
import { RADIO_PRINTS, type RadioLabel } from '../radioArt';
import {
  CLUSTER,
  DECK_TILT,
  deckY,
  FLOOR_NORMAL,
  floorY,
  HINGE,
  KEY_TILT,
  keyFaceZ,
  LCD,
  LID,
  type Pt,
  RADIO_SPEC,
  ROCKER_CORNER,
  SEAT,
  SIDE_CORNER,
  X0,
} from './radioSpec';
import type { Prop, PropSink } from './types';

/**
 * The CD player on the dresser: a portable radio cassette CD deck of the nineties, drawn for this room. A moulded
 * shell whose two pods swell out at either end, each with a speaker cloth let into it behind a raised rim; between
 * them a silver panel standing proud, a shield in outline with a rounded edge, and under it a foot with a tray. In
 * the panel, each in a seat cut into its face: the display's smoked window, the transport cluster, a tuning dial, and
 * on the chin a push button and a tone knob, a headphone socket, two slide switches and the volume's thumbwheel. On
 * the sloping top a cassette deck and the CD lid; a strap handle folded back round them, an aerial along the back.
 *
 * The machine's measurements (hinge, rocker, key travel, turntable, slot, well, display, lamp) are radioSpec.ts's:
 * the geometry below is built from them, and the device hangs the parts on the pivots `RADIO_SPEC` names, so the two
 * cannot drift. The numbers are those the room's cameras, the disc choreography and the app's overlays were made for
 * (radio/device/deckLayout.ts › DECK, radio/radioFraming.ts › LID_FRAMING; radio.test.ts holds them together).
 *
 * The parts are separate meshes: the body, the lid and its underside, the rocker's two halves, the side keys, the
 * well and the plate that closes the body under a shut lid. The well and the lid's underside are only seen with the
 * lid open, so the underside is generated where the open lid holds it (the bake lights it there) and the lid itself
 * casts no shadow in the bake (GeneratedRadio.ts).
 *
 * It is lit at its vertices and has no texture, so what a texture would carry is in the mesh: every seat is a real
 * recess whose `shade` darkens to its foot, a moulding's rounded edge is a shade lighter than its face (where a gloss
 * would shine), the plastic's colour wanders a few per cent (`plastic`), and the cloth is woven of bands.
 */

/** How far the lid is open where its underside is generated and lit (the spec's open angle), as a placement. */
const OPEN = (() => {
  const angle = (RADIO_SPEC.hinge.openDegrees * Math.PI) / 180;
  return compose(place(HINGE, 0, -angle), place([-HINGE[0], -HINGE[1], -HINGE[2]]));
})();

const SHELL: Rgb = [0.024, 0.026, 0.038];
/** The shell where a moulded edge turns to the light. */
const SHELL_EDGE: Rgb = [0.052, 0.055, 0.07];
const HANDLE: Rgb = [0.034, 0.036, 0.05];
const CLOTH_DARK: Rgb = [0.021, 0.025, 0.046];
const CLOTH_LIGHT: Rgb = [0.0245, 0.029, 0.053];
const SILVER: Rgb = [0.4, 0.4, 0.44];
const SILVER_LIGHT: Rgb = [0.52, 0.52, 0.56];
const SILVER_DARK: Rgb = [0.22, 0.22, 0.25];
const DECK: Rgb = [0.05, 0.047, 0.05];
const DECK_LIGHT: Rgb = [0.075, 0.07, 0.074];
const DECK_KEY: Rgb = [0.088, 0.082, 0.086];
const TUB: Rgb = [0.1, 0.09, 0.086];
const DARK: Rgb = [0.008, 0.008, 0.01];
const GLASS: Rgb = [0.0045, 0.005, 0.007];
const LCD_OFF: Rgb = [0.03, 0.042, 0.034];
const INK: Rgb = [0.028, 0.03, 0.038];
const CHROME: Rgb = [0.3, 0.3, 0.33];
/** The foot's tray lies in the panel's shadow: lighter, to be read at all there. */
const TRAY: Rgb = [0.7, 0.7, 0.76];
const WHEEL: Rgb = [0.56, 0.56, 0.6];
const WHEEL_DARK: Rgb = [0.2, 0.2, 0.23];

const smooth = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Smooth noise on a lattice of `cell` metres, 0–1: the same on every device (kit/hash.ts). */
function grain([x, y, z]: Vec3, cell: number, seed: number): number {
  const [fx, fy, fz] = [x / cell, y / cell, z / cell];
  const [ix, iy, iz] = [Math.floor(fx), Math.floor(fy), Math.floor(fz)];
  const at = (i: number, j: number, k: number): number =>
    hash32(Math.imul(ix + i, 0x9e3779b1) ^ hash32(Math.imul(iy + j, 0x85ebca6b) ^ hash32(iz + k + seed))) / 4294967296;
  const [u, v, w] = [smooth(0, 1, fx - ix), smooth(0, 1, fy - iy), smooth(0, 1, fz - iz)];
  const mix = (a: number, c: number, t: number): number => a + (c - a) * t;
  return mix(
    mix(mix(at(0, 0, 0), at(1, 0, 0), u), mix(at(0, 1, 0), at(1, 1, 0), u), v),
    mix(mix(at(0, 0, 1), at(1, 0, 1), u), mix(at(0, 1, 1), at(1, 1, 1), u), v),
    w,
  );
}

/** A moulding is never one colour: broad clouds and a finer mottle, a few per cent either way. */
const plastic = (point: Vec3): number =>
  1 + 0.13 * (grain(point, 0.034, 7) - 0.5) + 0.03 * (grain(point, 0.0085, 19) - 0.5);

/** Frames on the sloping top, all through the hinge line: `x` is the world's. */
const TOP_ORIGIN: Vec3 = [0, HINGE[1], HINGE[2]];
/** y the height above the deck, z the distance towards the front along the slope. */
const ON_DECK = place(TOP_ORIGIN, 0, -DECK_TILT);
/** y the distance towards the back (negative in front of the hinge), z out of the deck: an outline lying on the deck. */
const DECK_PLAN = place(TOP_ORIGIN, 0, -(Math.PI / 2 + DECK_TILT));
/** y the distance towards the front, z down out of the lid's underside. */
const UNDER_LID = place(TOP_ORIGIN, 0, Math.PI / 2 - DECK_TILT);
const along = (z: number): number => (z - HINGE[2]) / Math.cos(DECK_TILT);
const LID_LENGTH = along(LID.frontZ);

/** The well floor's frame at the turntable: y along the floor's normal, z up the floor towards the front. */
const ON_FLOOR = place(SEAT, 0, Math.asin(FLOOR_NORMAL[2]));
const FLOOR_DROP = 0.00402;

/** The display's glass, and the panel's upper face standing proud of it (the display is let into the face). */
const glassZ = (y: number): number => LCD.z - (LCD.normal[1] / LCD.normal[2]) * (y - (LCD.min[1] + LCD.max[1]) / 2);
const FACE_LIFT = 0.0012;
const upperZ = (y: number): number => glassZ(y) + FACE_LIFT / LCD.normal[2];
const CREASE_Y = 1.032;
const PANEL = { back: -1.931, top: 1.0868, bottom: 0.9612 };
/** The panel's face from its foot to its top, as (y, z): a chin that bulges, a soft crease, the upper face leaning back. */
const FACE: readonly Pt[] = [
  [PANEL.bottom, -1.8945],
  [0.967, -1.89],
  [0.976, -1.8868],
  [0.988, -1.88445],
  [1.0, -1.8829],
  [1.012, -1.8819],
  [1.022, -1.8814],
  [CREASE_Y, upperZ(CREASE_Y)],
  [PANEL.top, upperZ(PANEL.top)],
];

function faceZ(y: number): number {
  for (let i = 0; i + 1 < FACE.length; i++) {
    const [y0, z0] = FACE[i] as Pt;
    const [y1, z1] = FACE[i + 1] as Pt;
    if (y <= y1 || i + 2 === FACE.length) return z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
  }
  return PANEL.back;
}

/** A frame lying on the panel's face at (x, y): x across, y up the face, z out of it. */
function onFace(x: number, y: number): Placement {
  const slope = (faceZ(y + 0.0005) - faceZ(y - 0.0005)) / 0.001;
  return place([x, y, faceZ(y)], 0, Math.atan(slope));
}

/** The transport keys' frame: their faces' plane through the cluster's centre. */
const ON_KEYS = place([CLUSTER.centre[0], CLUSTER.centre[1], keyFaceZ(CLUSTER.centre[1])], 0, -KEY_TILT);
const ON_DIAL = place([2 * X0 - CLUSTER.centre[0], CLUSTER.centre[1], keyFaceZ(CLUSTER.centre[1])], 0, -KEY_TILT);
const ON_GLASS = place([X0, (LCD.min[1] + LCD.max[1]) / 2, LCD.z], 0, -Math.atan(LCD.normal[1] / LCD.normal[2]));

const arc = (cx: number, cy: number, radius: number, from: number, to: number, steps: number): Pt[] =>
  Array.from({ length: steps + 1 }, (_, i): Pt => {
    const angle = from + ((to - from) * i) / steps;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });

const flat = (points: readonly Pt[], z: number): Ring => points.map(([x, y]): Vec3 => [x, y, z]);

/** A polygon with each corner rounded and each edge cut into pieces: the same count whatever its measurements. */
function roundedLoop(corners: readonly Pt[], radii: readonly number[], steps: number, pieces: readonly number[]): Pt[] {
  const n = corners.length;
  const arcs = corners.map((c, i) => {
    const p = corners[(i + n - 1) % n] as Pt;
    const q = corners[(i + 1) % n] as Pt;
    const [l1, l2] = [Math.hypot(p[0] - c[0], p[1] - c[1]), Math.hypot(q[0] - c[0], q[1] - c[1])];
    const d1: Pt = [(p[0] - c[0]) / l1, (p[1] - c[1]) / l1];
    const d2: Pt = [(q[0] - c[0]) / l2, (q[1] - c[1]) / l2];
    const half = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))) / 2;
    const reach = Math.min((radii[i] ?? 0) / Math.tan(half), 0.45 * Math.min(l1, l2));
    const radius = reach * Math.tan(half);
    const bl = Math.hypot(d1[0] + d2[0], d1[1] + d2[1]) || 1;
    const centre: Pt = [
      c[0] + ((d1[0] + d2[0]) / bl) * (radius / Math.sin(half)),
      c[1] + ((d1[1] + d2[1]) / bl) * (radius / Math.sin(half)),
    ];
    const a: Pt = [c[0] + d1[0] * reach, c[1] + d1[1] * reach];
    const b: Pt = [c[0] + d2[0] * reach, c[1] + d2[1] * reach];
    const from = Math.atan2(a[1] - centre[1], a[0] - centre[0]);
    let sweep = Math.atan2(b[1] - centre[1], b[0] - centre[0]) - from;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    return radius < 1e-6
      ? Array.from({ length: steps + 1 }, () => c)
      : arc(centre[0], centre[1], radius, from, from + sweep, steps);
  });
  const loop: Pt[] = [];
  arcs.forEach((points, i) => {
    loop.push(...points);
    const from = points[points.length - 1] as Pt;
    const to = (arcs[(i + 1) % n] as Pt[])[0] as Pt;
    const count = pieces[i] ?? 1;
    for (let k = 1; k < count; k++)
      loop.push([from[0] + ((to[0] - from[0]) * k) / count, from[1] + ((to[1] - from[1]) * k) / count]);
  });
  return loop;
}

/**
 * A flat plate in the current frame: `outline` (convex, or seen whole from its middle) at height `z`, facing +z. With
 * a `grid` it is cut into rows so light can change across it (the builder's own fill; not for round outlines, whose
 * mirrored points it cannot row).
 */
function inlay(b: MeshBuilder, outline: readonly Pt[], z: number, color: Rgb, shade = 1, grid = Infinity): void {
  if (Number.isFinite(grid)) b.extrude(outline, z - 0.00004, z, color, { back: false, grid }, shade);
  else b.cap(flat(outline, z), [0, 0, 1], color, shade);
}

const rect = (x0: number, x1: number, y0: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const circle = (radius: number, steps: number, cx = 0, cy = 0): Pt[] =>
  arc(cx, cy, radius, 0, Math.PI * 2, steps).slice(0, steps);

/**
 * A turned part about the axis through `origin`: `profile` is (radius, height) pairs, listed with the outside on the
 * right hand (up an outer wall, inwards across a top, down an inner wall), so every band faces the way it should,
 * flat ones included (the builder's own lathe cannot tell which way a flat band faces).
 */
function turned(
  b: MeshBuilder,
  origin: Vec3,
  axis: Vec3,
  profile: readonly Pt[],
  segments: number,
  color: Rgb,
  shade = 1,
): void {
  const [side, up] = basis(axis);
  const rings = profile.map(([radius, height]) =>
    Array.from({ length: segments }, (_, i): Vec3 => {
      const angle = (i / segments) * Math.PI * 2;
      return add(
        add(origin, scale(axis, height)),
        add(scale(side, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius)),
      );
    }),
  );
  for (let i = 0; i + 1 < rings.length; i++) {
    const [a, c] = [rings[i] as Vec3[], rings[i + 1] as Vec3[]];
    for (let k = 0; k < segments; k++) {
      const n = (k + 1) % segments;
      b.quad(a[k] as Vec3, a[n] as Vec3, c[n] as Vec3, c[k] as Vec3, color, shade);
    }
  }
}

// ─── The shell ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A cross-section of the shell: its front and back, its foot, its top at the front and at the back, its corners. */
interface Section {
  readonly zf: number;
  readonly zb: number;
  readonly yb: number;
  readonly ytf: number;
  readonly ytb: number;
  /** Corner radii: foot-front, top-front, top-back, foot-back. */
  readonly r: readonly [number, number, number, number];
}

const SHELL_FRONT = -1.903;
const SHELL_BACK = -2.19;
/** The flat deck's width: from here the shoulders fall to the pods. */
const DECK_X = { min: X0 - 0.203, max: X0 + 0.203 };
const MIDDLE: Section = {
  zf: SHELL_FRONT,
  zb: SHELL_BACK,
  yb: 0.8905,
  ytf: deckY(SHELL_FRONT),
  ytb: deckY(SHELL_BACK),
  r: [0.04, 0.028, 0.008, 0.012],
};
/** The pods, by distance from the middle: they round off to the ends, and turn under from their middle down. */
const POD: readonly (readonly [number, Section])[] = [
  [0.225, { zf: -1.91, zb: -2.178, yb: 0.8905, ytf: 1.0765, ytb: 1.031, r: [0.042, 0.03, 0.03, 0.04] }],
  [0.245, { zf: -1.915, zb: -2.166, yb: 0.896, ytf: 1.071, ytb: 1.022, r: [0.042, 0.032, 0.04, 0.05] }],
  [0.26, { zf: -1.919, zb: -2.14, yb: 0.915, ytf: 1.06, ytb: 1.02, r: [0.04, 0.03, 0.04, 0.05] }],
  [0.27, { zf: -1.924, zb: -2.1, yb: 0.935, ytf: 1.045, ytb: 1.018, r: [0.035, 0.03, 0.035, 0.045] }],
  [0.277, { zf: -1.935, zb: -2.05, yb: 0.955, ytf: 1.027, ytb: 1.012, r: [0.028, 0.025, 0.025, 0.03] }],
  [0.28, { zf: -1.953, zb: -2.0, yb: 0.975, ytf: 1.005, ytb: 1.0, r: [0.012, 0.012, 0.012, 0.012] }],
];
/** The middle's stations: enough for the light to change along it. */
const MIDDLE_X = Array.from({ length: 9 }, (_, i) => DECK_X.min + ((DECK_X.max - DECK_X.min) * i) / 8);
/** Where the pods are cut: closer together where they turn most. */
const POD_STATIONS = [0.214, 0.225, 0.235, 0.245, 0.2525, 0.26, 0.265, 0.27, 0.2738, 0.277, 0.2788, 0.28];

/** The pod's section `dx` from the middle: a smooth curve (Catmull-Rom) through the table's rows, measure by measure. */
function pod(dx: number): Section {
  const rows: (readonly [number, Section])[] = [
    [0.181, MIDDLE],
    [0.203, MIDDLE],
    ...POD,
    [0.283, (POD[POD.length - 1] as [number, Section])[1]],
  ];
  let i = 1;
  while (i + 2 < rows.length - 1 && dx > (rows[i + 1] as [number, Section])[0]) i++;
  type Row = readonly [number, Section];
  const [p0, p1, p2, p3] = [rows[i - 1] as Row, rows[i] as Row, rows[i + 1] as Row, rows[i + 2] as Row];
  const t = Math.max(0, Math.min(1, (dx - p1[0]) / (p2[0] - p1[0])));
  const curve = (a: number, b: number, c: number, d: number): number => {
    // Tangents by distance, so unevenly spaced rows do not overshoot; held between the two rows' own values.
    const m1 = ((c - a) / (p2[0] - p0[0])) * (p2[0] - p1[0]);
    const m2 = ((d - b) / (p3[0] - p1[0])) * (p2[0] - p1[0]);
    const [t2, t3] = [t * t, t * t * t];
    const value = (2 * t3 - 3 * t2 + 1) * b + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * c + (t3 - t2) * m2;
    return Math.max(Math.min(b, c), Math.min(Math.max(b, c), value));
  };
  const of = (pick: (s: Section) => number): number => curve(pick(p0[1]), pick(p1[1]), pick(p2[1]), pick(p3[1]));
  return {
    zf: of((s) => s.zf),
    zb: of((s) => s.zb),
    yb: of((s) => s.yb),
    ytf: of((s) => s.ytf),
    ytb: of((s) => s.ytb),
    r: [of((s) => s.r[0]), of((s) => s.r[1]), of((s) => s.r[2]), of((s) => s.r[3])],
  };
}
const CORNER_STEPS = 5;
const FRONT_PIECES = 6;
const TOP_PIECES = 6;
const SIDE_PIECES = 3;
/** Ring indices: the front runs from the foot to the top-front arc's end, the top after it. */
const TOP_FROM = CORNER_STEPS + FRONT_PIECES + CORNER_STEPS;

function section(x: number, s: Section): Ring {
  return roundedLoop(
    [
      [s.zf, s.yb],
      [s.zf, s.ytf],
      [s.zb, s.ytb],
      [s.zb, s.yb],
    ],
    s.r,
    CORNER_STEPS,
    [FRONT_PIECES, TOP_PIECES, SIDE_PIECES, SIDE_PIECES],
  ).map(([z, y]): Vec3 => [x, y, z]);
}

/** The shell's sections from end to end. */
const STATIONS: readonly { readonly x: number; readonly ring: Ring }[] = (() => {
  const pods = POD_STATIONS.map((dx): [number, Section] => [dx, pod(dx)]);
  return [
    ...[...pods].reverse().map(([dx, s]) => ({ x: X0 - dx, ring: section(X0 - dx, s) })),
    ...MIDDLE_X.map((x) => ({ x, ring: section(x, MIDDLE) })),
    ...pods.map(([dx, s]) => ({ x: X0 + dx, ring: section(X0 + dx, s) })),
  ];
})();

/** The shell's front at (x, y): what lies on it (the speaker cloth, its rim) is built from this. */
function shellFront(x: number, y: number): number {
  const front = (ring: Ring): number => {
    for (let j = 0; j < TOP_FROM; j++) {
      const [p, q] = [ring[j] as Vec3, ring[j + 1] as Vec3];
      if (y <= q[1] || j + 1 === TOP_FROM) {
        const t = Math.max(0, Math.min(1, (y - p[1]) / (q[1] - p[1] || 1)));
        return p[2] + (q[2] - p[2]) * t;
      }
    }
    return (ring[TOP_FROM] as Vec3)[2];
  };
  let i = 0;
  while (i + 2 < STATIONS.length && x > (STATIONS[i + 1] as { x: number }).x) i++;
  const [a, c] = [STATIONS[i] as { x: number; ring: Ring }, STATIONS[i + 1] as { x: number; ring: Ring }];
  const t = Math.max(0, Math.min(1, (x - a.x) / (c.x - a.x)));
  return front(a.ring) * (1 - t) + front(c.ring) * t;
}

/** The opening in the deck the lid lies in. */
const HOLE = { x0: 1.01, x1: 1.213, z0: -2.1614, z1: -1.9382 };
/** The lid rests this far under the deck, on the well's ledge. */
const LEDGE_DROP = 0.0034;

function shell(b: MeshBuilder): void {
  const count = (STATIONS[0] as { ring: Ring }).ring.length;
  for (let i = 0; i + 1 < STATIONS.length; i++) {
    const [a, c] = [STATIONS[i] as { x: number; ring: Ring }, STATIONS[i + 1] as { x: number; ring: Ring }];
    const onDeck = a.x >= DECK_X.min - 1e-6 && c.x <= DECK_X.max + 1e-6;
    for (let j = 0; j < count; j++) {
      const k = (j + 1) % count;
      // The deck's own plate, with the lid's opening, takes the top's place between the shoulders.
      if (onDeck && j >= TOP_FROM && j < TOP_FROM + TOP_PIECES) continue;
      b.quad(a.ring[j] as Vec3, c.ring[j] as Vec3, c.ring[k] as Vec3, a.ring[k] as Vec3, SHELL);
    }
  }
  b.cap((STATIONS[0] as { ring: Ring }).ring, [-1, 0, 0], SHELL);
  b.cap((STATIONS[STATIONS.length - 1] as { ring: Ring }).ring, [1, 0, 0], SHELL);

  // Four feet.
  for (const x of [X0 - 0.19, X0 + 0.19])
    for (const z of [-1.99, -2.14]) {
      b.cylinder([x, 0.8872, z], [x, 0.892, z], 0.0115, 0.0125, 14, DARK, 0.4);
    }
}

// ─── The speakers ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The cloth's outline on a pod, by distance from the radio's middle: a superellipse, cut off by the panel. */
const CLOTH = { from: 0.142, reach: 0.1205, y: 0.985, half: 0.087, power: 2.6, rows: 58, columns: 10 };
/** How wide the rim round the cloth is, and how far under the panel's edge the cloth runs. */
const CLOTH_RIM = 0.0062;

/** The cloth's inner edge at a height: under the panel's edge, and clear of the foot. */
function clothFrom(y: number): number {
  if (y < APRON.top) return apronHalf(y) + 0.0012;
  return shieldHalf(Math.max(SHIELD.bottom, Math.min(SHIELD.top, y))) + SHIELD.bevel - 0.005;
}

function speaker(b: MeshBuilder, side: 1 | -1): void {
  const { from, reach, y: cy, half, power, rows, columns } = CLOTH;
  const end = (y: number): number => {
    const v = Math.min(1, Math.abs((y - cy) / half));
    return Math.max(clothFrom(y), from + reach * (1 - v ** power) ** (1 / power));
  };
  /** 0 at the cloth's middle, 1 on its rim. */
  const edge = (dx: number, y: number): number =>
    Math.min(1, Math.max(0, (dx - from) / reach) ** power + Math.abs((y - cy) / half) ** power);
  const point = (j: number, k: number): { p: Vec3; e: number } => {
    const y = cy - half + (2 * half * j) / rows;
    const [x0, x1] = [clothFrom(y), end(y)];
    const dx = x0 + (x1 - x0) * (1 - (1 - k / columns) ** 1.7);
    const e = j === 0 || j === rows || k === columns ? 1 : edge(dx, y);
    const x = X0 + side * dx;
    // Sunk into the shell at its rim, swelling out of it inside.
    return { p: [x, y, shellFront(x, y) - 0.0016 + 0.0056 * (1 - e) ** 0.7], e };
  };
  b.shaded(
    ([x, y]) => 0.5 + 0.5 * smooth(0, 0.3, 1 - edge(Math.abs(x - X0), y)),
    () => {
      for (let j = 0; j < rows; j++) {
        // A fine weave: bands a few millimetres high, one a shade lighter than the next.
        const color = j % 2 === 0 ? CLOTH_DARK : CLOTH_LIGHT;
        for (let k = 0; k < columns; k++) {
          const [p00, p01, p11, p10] = [point(j, k).p, point(j, k + 1).p, point(j + 1, k + 1).p, point(j + 1, k).p];
          if (side > 0) b.quad(p00, p01, p11, p10, color);
          else b.quad(p01, p00, p10, p11, color);
        }
      }
    },
  );
  // The shell's rim round the cloth: a chamfer that catches the light.
  const outline: Pt[] = [];
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / steps;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    outline.push([from + reach * Math.abs(c) ** (2 / power), cy + half * Math.sign(s) * Math.abs(s) ** (2 / power)]);
  }
  const top = cy + half;
  for (let i = 1; i <= 3; i++) outline.push([from + ((clothFrom(top) - 0.004 - from) * i) / 3, top]);
  const ring = outline.map(([dx, y], i): { inner: Vec3; crest: Vec3; middle: Vec3; outer: Vec3 } => {
    const before = outline[Math.max(0, i - 1)] as Pt;
    const after = outline[Math.min(outline.length - 1, i + 1)] as Pt;
    const [tx, ty] = [after[0] - before[0], after[1] - before[1]];
    const l = Math.hypot(tx, ty) || 1;
    // The outline runs counter-clockwise about the cloth: its outside is to the right of its direction.
    // Wider round the pod's end, where the shell's two halves meet.
    const wide = CLOTH_RIM * (1 + 0.25 * smooth(from + reach * 0.6, from + reach, dx));
    const out = (by: number): Pt => [dx + (ty / l) * by, y - (tx / l) * by];
    const at = ([px, py]: Pt, lift: number): Vec3 => {
      // Never past the pod's own end.
      const x = X0 + side * Math.min(px, 0.2715);
      return [x, py, shellFront(x, py) + lift];
    };
    // A bead standing on the shell: up to a lip at the cloth's edge, and down inside it to the cloth.
    return {
      inner: at([dx, y], -0.0016),
      crest: at(out(0.0011), 0.0025),
      middle: at(out(wide * 0.55), 0.0021),
      outer: at(out(wide), 0.0012),
    };
  });
  type Rim = (typeof ring)[number];
  for (let i = 0; i + 1 < ring.length; i++) {
    const [a, c] = [ring[i] as Rim, ring[i + 1] as Rim];
    const strip = (p: Vec3, q: Vec3, r: Vec3, t: Vec3, color: Rgb, shade = 1): void =>
      side > 0 ? b.quad(p, q, r, t, color, shade) : b.quad(q, p, t, r, color, shade);
    strip(a.middle, a.outer, c.outer, c.middle, SHELL_EDGE);
    strip(a.crest, a.middle, c.middle, c.crest, SHELL_EDGE);
    strip(a.inner, a.crest, c.crest, c.inner, SHELL, 0.6);
  }
}

// ─── The top: the cassette deck, the handle, the aerial ───────────────────────────────────────────────────────────

/** A surface a recess is cut into: its height at (x, y) of the frame it is built in. */
type Surface = (x: number, y: number) => number;
const LEVEL: Surface = () => 0;

/**
 * A recess in a face: from `rim` (counter-clockwise; a hole of the face's plate) inwards and down by `steps`, each how
 * far inside the rim and how deep, and a floor at the last. It darkens to `dark` at its foot. The floor's outline is
 * handed back.
 */
function recess(
  b: MeshBuilder,
  rim: readonly Pt[],
  surface: Surface,
  steps: readonly (readonly [inset: number, depth: number])[],
  wall: Rgb,
  floor: Rgb | null,
  dark = 0.5,
  grid = Infinity,
  sink: Surface = LEVEL,
): Pt[] {
  const deepest = (steps[steps.length - 1] as readonly [number, number])[1];
  // `sink` deepens the floor point by point (a ramp), and the walls with it in proportion.
  const ring = (loop: readonly Pt[], depth: number): Ring =>
    loop.map(([x, y]): Vec3 => [x, y, surface(x, y) - depth - (sink(x, y) * depth) / deepest]);
  const middle = rim.reduce<Pt>((sum, p) => [sum[0] + p[0] / rim.length, sum[1] + p[1] / rim.length], [0, 0]);
  const towards: Vec3 = [middle[0], middle[1], surface(middle[0], middle[1]) + 0.05];
  let [loop, depth] = [rim as Pt[], 0];
  b.shaded(
    ([x, y, z]) => 1 - (1 - dark) * Math.max(0, Math.min(1, (surface(x, y) - z) / (deepest + sink(x, y)))),
    () => {
      for (const [inside, deep] of steps) {
        const next = inset(rim, inside) as Pt[];
        b.loft(ring(loop, depth), ring(next, deep), { towards }, wall);
        [loop, depth] = [next, deep];
      }
    },
  );
  if (floor) b.plate([loop], 0, floor, { relief: (x, y) => surface(x, y) - deepest - sink(x, y), grid }, dark);
  return loop;
}

function topDeck(b: MeshBuilder): void {
  const ring = (STATIONS[STATIONS.length >> 1] as { ring: Ring }).ring;
  const front = -along((ring[TOP_FROM] as Vec3)[2]);
  const back = -along((ring[TOP_FROM + TOP_PIECES] as Vec3)[2]);
  b.placed(DECK_PLAN, () => {
    // The deck: the top between the shoulders, on the lid's plane, around the lid's opening and the keys' trough.
    const opening = roundedRect(HOLE.x0, HOLE.x1, -along(HOLE.z1), -along(HOLE.z0), 0.0052, 4);
    const trough = roundedRect(0.8425, 0.9955, -along(-1.9655), -along(-2.004), 0.0025, 3);
    b.plate([rect(DECK_X.min, DECK_X.max, front, back), opening, trough], 0, DECK, { grid: 0.05 });
    // The opening's own edge, down to the ledge the lid rests on.
    recess(b, opening, LEVEL, [[0, LEDGE_DROP]], DARK, null, 0.4);
    recess(
      b,
      trough,
      LEVEL,
      [
        [0.0005, 0.0005],
        [0.0009, 0.0036],
      ],
      DECK,
      DARK,
      0.4,
    );
    // The cassette door: a low plate with its window, a groove round it.
    inlay(b, roundedRect(0.8335, 1.0005, -along(-2.0165), -along(-2.1535), 0.0075, 4), 0.0001, DARK, 0.45);
    const door = roundedRect(0.836, 0.998, -along(-2.019), -along(-2.151), 0.006, 4);
    b.extrude(door, -0.0005, 0.0018, DECK_LIGHT, { bevel: 0.0011, steps: 2, back: false, grid: 0.03 });
    const window = roundedRect(0.868, 0.966, -along(-2.086), -along(-2.097), 0.0016, 3);
    inlay(b, inset(window, -0.0012), 0.00185, DECK, 0.7);
    inlay(b, window, 0.0019, GLASS, 0.5);
    // A grip line at the door's front edge.
    inlay(b, roundedRect(0.892, 0.942, -along(-2.03), -along(-2.0325), 0.0008, 2), 0.00185, DECK, 0.55);
    // The handle, folded back: two arms along the shoulders and a grip across the back, behind the lid's swing.
    const [inner, outer, tip, heel, grip] = [0.2058, 0.2238, -along(-2.002), 0.0085, 0.0235];
    const strap: Pt[] = [
      [X0 - inner, tip + 0.012],
      [X0 - inner, heel],
      [X0 + inner, heel],
      [X0 + inner, tip + 0.012],
      [X0 + inner + 0.006, tip],
      [X0 + outer, tip + 0.002],
      [X0 + outer, grip - 0.006],
      [X0 + outer - 0.006, grip],
      [X0 - outer + 0.006, grip],
      [X0 - outer, grip - 0.006],
      [X0 - outer, tip + 0.002],
      [X0 - inner - 0.006, tip],
    ];
    b.extrude(strap, -0.014, 0.0036, HANDLE, {
      bevel: 0.0014,
      steps: 2,
      back: false,
      grid: 0.03,
      // The arms lie lower than the deck, on the shoulders; the grip rides over its back edge.
      relief: (x, y) =>
        -0.0062 * (1 - smooth(-0.006, heel, y)) - 0.004 * smooth(inner + 0.004, outer, Math.abs(x - X0)),
    });
  });
  b.placed(ON_DECK, () => {
    // Six keys: record (its dot), play, rewind, wind, stop and eject, pause.
    for (let i = 0; i < 6; i++) {
      const x = 0.845 + i * 0.02475;
      b.roundedBox([x, -0.003, along(-2.0018)], [x + 0.0229, 0.0034, along(-1.968)], 0.0016, DECK_KEY, 1, 1, 1);
    }
    b.cylinder([0.8565, 0.0034, along(-1.985)], [0.8565, 0.00355, along(-1.985)], 0.003, 0.003, 12, [0.3, 0.02, 0.02]);
  });
  // The handle's pivots, at the back of either shoulder.
  for (const side of [-1, 1]) {
    const x = X0 + side * 0.2148;
    b.cylinder([x - 0.0105, 1.0375, -2.156], [x + 0.0105, 1.0375, -2.156], 0.0078, 0.0078, 14, HANDLE);
  }
  // The aerial, clipped along the back, its tip a little proud of the deck; its hinge block and its clip.
  b.cylinder([1.2, 1.0295, -2.1975], [0.812, 1.0745, -2.1975], 0.0024, 0.0017, 8, CHROME);
  b.sphere([0.809, 1.0749, -2.1975], 0.0034, 10, CHROME);
  b.cylinder([1.2, 1.0295, -2.1975], [1.19, 1.0307, -2.1975], 0.0034, 0.0034, 10, CHROME);
  b.roundedBox([1.196, 1.019, -2.2035], [1.21, 1.0365, -2.189], 0.002, SHELL_EDGE, 1, 1, 2);
  b.cylinder([1.203, 1.0295, -2.2042], [1.203, 1.0295, -2.2035], 0.003, 0.003, 10, CHROME);
  for (const x of [0.832, 1.022])
    b.roundedBox([x - 0.005, 1.016, -2.2], [x + 0.005, 1.031, -2.188], 0.0015, SHELL_EDGE, 1, 1, 2);
}

// ─── The front panel ──────────────────────────────────────────────────────────────────────────────────────────────

/** The panel's face is a shield: wide at the dial and the keys, drawn in to its foot, its corners round. */
const SHIELD = { top: PANEL.top, bottom: PANEL.bottom, bevel: 0.0036 };

/** Half the face's width at a height: the flat of it, inside the bevel. */
function shieldHalf(y: number): number {
  const base = 0.0952 + (0.1149 - 0.0952) * smooth(0.972, 1.044, y);
  const cut = (radius: number, from: number): number =>
    from >= radius ? 0 : radius - Math.sqrt(Math.max(0, radius * radius - (radius - Math.max(0, from)) ** 2));
  return base - cut(0.013, y - (SHIELD.bottom + SHIELD.bevel)) - cut(0.009, SHIELD.top - SHIELD.bevel - y);
}

/** The foot under the panel: a ramp, wider at the dresser. Its face runs from `bottom` up and back to `top`. */
const APRON = { bottom: 0.899, top: 0.9603, z0: -1.8962, z1: -1.9002, wide: 0.141, narrow: 0.094 };
const apronHalf = (y: number): number =>
  APRON.wide + ((APRON.narrow - APRON.wide) * (y - APRON.bottom)) / (APRON.top - APRON.bottom) + 0.002;

/** Heights 50 µm apart at most are one height: the fill makes a row of every height its outlines have. */
const snap = (loop: readonly Pt[]): Pt[] => loop.map(([x, y]): Pt => [x, Math.round(y * 2e4) / 2e4]);

/** A frame's circle as it lies on the face: (x, y) of the room. */
const ringOf = (frame: Placement, radius: number, steps: number): Pt[] =>
  circle(radius, steps).map(([u, v]): Pt => {
    const p = compose(frame, place([u, v, 0])).offset;
    return [p[0], p[1]];
  });

/** The outline round two circles (a keyhole lying on its side), counter-clockwise. */
function keyhole(a: Pt, ra: number, c: Pt, rc: number): Pt[] {
  const [dx, dy] = [c[0] - a[0], c[1] - a[1]];
  const turn = Math.atan2(dy, dx);
  const open = Math.acos((ra - rc) / Math.hypot(dx, dy));
  return [
    ...arc(c[0], c[1], rc, turn - open, turn + open, 14),
    ...arc(a[0], a[1], ra, turn + open, turn + 2 * Math.PI - open, 10),
  ];
}

const DIAL_X = 2 * X0 - CLUSTER.centre[0];
const CONTROLS = {
  button: [0.9272, 1.0188] as Pt,
  knob: [0.954, 1.0057] as Pt,
  jack: [0.9262, 0.9938] as Pt,
  band: [0.9945, 1.0025] as Pt,
  mode: [1.033, 1.0025] as Pt,
  volume: [1.0927, 1.0033] as Pt,
};

function panel(b: MeshBuilder, sink: PropSink): void {
  // The face's outline, a point at every height the face turns at.
  const [low, high] = [SHIELD.bottom + SHIELD.bevel, SHIELD.top - SHIELD.bevel];
  const stations = [
    ...Array.from({ length: 6 }, (_, i) => low + 0.013 * (1 - Math.cos((i / 5) * (Math.PI / 2)))),
    ...FACE.map(([y]) => y),
    ...[0.982, 0.994, 1.006, 1.017, 1.027, 1.038, 1.045, 1.052, 1.0645],
    ...Array.from({ length: 5 }, (_, i) => high - 0.009 * (1 - Math.cos((i / 4) * (Math.PI / 2)))),
  ]
    .filter((y) => y > low + 0.0012 && y < high - 0.0012)
    .sort((p, q) => p - q);
  // Not closer than a millimetre or so, the two ends kept.
  const heights = [low];
  for (const y of stations) if (y - (heights[heights.length - 1] as number) > 0.0012) heights.push(y);
  heights.push(high);
  const outline: Pt[] = [
    ...heights.map((y): Pt => [X0 + shieldHalf(y), y]),
    ...[...heights].reverse().map((y): Pt => [X0 - shieldHalf(y), y]),
  ];
  const face: Surface = (_x, y) => faceZ(y);

  // What is let into it.
  const dial = snap(ringOf(ON_DIAL, 0.0229, 28));
  const keys = snap(ringOf(ON_KEYS, 0.0229, 28));
  const display = snap(roundedRect(X0 - 0.0575, X0 + 0.0565, 1.0335, 1.0787, 0.0045, 4));
  const knob = snap(keyhole(CONTROLS.button, 0.0066, CONTROLS.knob, 0.0128));
  const jack = snap(circle(0.006, 14, ...CONTROLS.jack));
  const slot = (at: Pt): Pt[] =>
    snap(roundedRect(at[0] - 0.0076, at[0] + 0.0076, at[1] - 0.0172, at[1] + 0.0172, 0.0024, 3));
  const [band, mode] = [slot(CONTROLS.band), slot(CONTROLS.mode)];
  const volume = snap(circle(0.0205, 24, ...CONTROLS.volume));
  b.plate([outline, dial, keys, display, knob, jack, band, mode, volume], 0, SILVER, { grid: 0.03, relief: face });

  // Its rim: rounded over to the side, and the side back into the shell.
  const inside: Vec3 = [X0, 1.02, -1.93];
  const turns = 3;
  const rims = Array.from({ length: turns + 1 }, (_, i): Ring => {
    const angle = (i / turns) * (Math.PI / 2);
    const drop = SHIELD.bevel * (1 - Math.cos(angle));
    return inset(outline, -SHIELD.bevel * Math.sin(angle)).map(
      ([x, y], k): Vec3 => [x, y, faceZ((outline[k] as Pt)[1]) - drop],
    );
  });
  // The rounding faces the ceiling along the top: a shade lighter, where a moulding's edge shines.
  for (let i = 0; i < turns; i++) b.loft(rims[i] as Ring, rims[i + 1] as Ring, { from: inside }, SILVER_LIGHT);
  const last = rims[turns] as Ring;
  b.shaded(
    ([, , z]) => 0.5 + 0.5 * smooth(-1.915, -1.89, z),
    () =>
      b.loft(
        last,
        last.map(([x, y]): Vec3 => [x, y, PANEL.back]),
        { from: inside },
        SILVER,
      ),
  );

  // The display: a smoked window let into the face behind a bevel, the glass over the LCD its floor.
  const cy = (LCD.min[1] + LCD.max[1]) / 2;
  const v = (y: number): number => (y - cy) / LCD.normal[2];
  const lcd = { u0: LCD.min[0] - X0, u1: LCD.max[0] - X0, v0: v(LCD.min[1]), v1: v(LCD.max[1]) };
  const sunk = FACE_LIFT / LCD.normal[2];
  recess(b, display, face, [[0.0016, sunk]], SILVER_LIGHT, GLASS, 0.82, 0.02);
  b.placed(ON_GLASS, () => {
    // The LCD at rest: its grey-green, a frame's width around the lit picture the device lays over it.
    inlay(
      b,
      roundedRect(lcd.u0 - 0.0008, lcd.u1 + 0.0008, lcd.v0 - 0.0008, lcd.v1 + 0.0008, 0.0008, 2),
      0.0001,
      LCD_OFF,
    );
    // Two small keys either side of it, each in a collar.
    for (const u of [-0.0437, 0.0432]) {
      turned(
        b,
        [u, 0, 0],
        [0, 0, 1],
        [
          [0.0041, 0],
          [0.0039, 0.0006],
          [0.003, 0.0006],
          [0.003, 0.0002],
        ],
        18,
        INK,
      );
      turned(
        b,
        [u, 0, 0],
        [0, 0, 1],
        [
          [0.0027, 0],
          [0.0027, 0.001],
          [0.0021, 0.0015],
          [0, 0.0016],
        ],
        18,
        SILVER_LIGHT,
      );
    }
  });
  const lensPrint = (art: ArtRect, u0: number, u1: number, v0: number, v1: number): void =>
    print(sink, ON_GLASS, art, u0, v0, u1 - u0, v1 - v0, [0.34, 0.35, 0.42]);
  lensPrint(RADIO_PRINTS.scale, -0.052, 0.052, lcd.v0 - 0.0192, lcd.v0 - 0.0032);
  lensPrint(RADIO_PRINTS.mark, -0.0567, -0.0307, -0.008, 0.008);
  lensPrint(RADIO_PRINTS.modes, 0.0302, 0.0562, -0.008, 0.008);

  // The transport cluster's seat: the keys are parts of their own.
  const socket: readonly (readonly [number, number])[] = [
    [0.0007, 0.0007],
    [0.0007, 0.0046],
  ];
  recess(b, keys, face, socket, SILVER, DARK, 0.3);
  // Its twin on the left: the tuning dial, a wheel with a grip moulded across it between two thumb scoops.
  recess(b, dial, face, socket, SILVER, DARK, 0.3);
  b.placed(compose(ON_DIAL, place([0, 0, 0], 0, 0, -0.16)), () => {
    const [top, rim, scoop] = [0.0056, 0.0186, 0.0032];
    turned(
      b,
      [0, 0, 0],
      [0, 0, 1],
      [
        [0.0209, -0.0042],
        [0.0209, top - 0.0012],
        [0.02, top],
        [rim, top],
      ],
      36,
      SILVER_LIGHT,
    );
    // The scoops: the side keys' own shape, dished.
    const [offset, radius] = [0.0205, 0.0165];
    const x = -(rim * rim - radius * radius + offset * offset) / (2 * offset);
    const y = Math.sqrt(rim * rim - x * x);
    const reach = Math.atan2(y, x + offset);
    const round = Math.atan2(y, x);
    for (const side of [1, -1]) {
      const lens: Pt[] = [
        ...arc(-offset, 0, radius, -reach, reach, 12),
        ...arc(0, 0, rim, round, 2 * Math.PI - round, 12).slice(1, -1),
      ].map(([px, py]): Pt => [px * side, py * side]);
      const middle: Pt = [-0.0118 * side, 0];
      const shrunk = (k: number): Pt[] =>
        lens.map(([px, py]): Pt => [middle[0] + (px - middle[0]) * k, middle[1] + (py - middle[1]) * k]);
      b.shaded(
        ([, , z]) => 0.4 + 0.6 * smooth(top - scoop, top, z),
        () => {
          b.loft(
            flat(lens, top),
            flat(shrunk(0.8), top - scoop * 0.7),
            { towards: [middle[0], 0, 0.05] },
            SILVER_LIGHT,
          );
          b.loft(
            flat(shrunk(0.8), top - scoop * 0.7),
            flat(shrunk(0.45), top - scoop),
            { towards: [middle[0], 0, 0.05] },
            SILVER_LIGHT,
          );
          b.cap(flat(shrunk(0.45), top - scoop), [0, 0, 1], SILVER_LIGHT);
        },
      );
    }
    // The grip between them, and the rim's flat.
    const grip: Pt[] = [
      ...arc(offset, 0, radius, Math.PI + reach, Math.PI - reach, 12),
      ...arc(0, 0, rim, Math.PI - round, round, 8).slice(1, -1),
      ...arc(-offset, 0, radius, reach, -reach, 12),
      ...arc(0, 0, rim, 2 * Math.PI - round, Math.PI + round, 8).slice(1, -1),
    ];
    b.plate([grip], top, SILVER_LIGHT);
    inlay(b, roundedRect(-0.0007, 0.0007, 0.0085, 0.0165, 0.0005, 2), top + 0.0001, INK);
  });

  // The chin's controls, each standing where the face is.
  const control = (at: Pt, build: () => void, roll = 0): void =>
    b.placed(compose(onFace(at[0], at[1]), place([0, 0, 0], 0, 0, roll)), build);
  // A push button and the function knob, in one keyhole seat; the headphone socket under the button.
  recess(
    b,
    knob,
    face,
    [
      [0.0007, 0.0007],
      [0.0011, 0.0022],
    ],
    SILVER,
    SILVER,
    0.55,
  );
  control(CONTROLS.button, () =>
    turned(
      b,
      [0, 0, 0],
      [0, 0, 1],
      [
        [0.0047, -0.0022],
        [0.0047, 0.0022],
        [0.0041, 0.0031],
        [0.0022, 0.0035],
        [0, 0.0036],
      ],
      20,
      SILVER_LIGHT,
    ),
  );
  control(
    CONTROLS.knob,
    () => {
      // A collar, a fluted barrel and a grip bar: the tallest thing on the face.
      turned(
        b,
        [0, 0, 0],
        [0, 0, 1],
        [
          [0.0112, -0.0022],
          [0.0112, 0.0002],
          [0.0102, 0.0014],
          [0.0094, 0.0014],
        ],
        24,
        SILVER,
      );
      const flutes = 10;
      const barrel = (radius: number, z: number): Ring =>
        Array.from({ length: flutes * 2 }, (_, i): Vec3 => {
          const angle = ((i + 0.5) / (flutes * 2)) * Math.PI * 2;
          const r = radius * (i % 2 === 0 ? 1 : 0.93);
          return [Math.cos(angle) * r, Math.sin(angle) * r, z];
        });
      b.loft(barrel(0.0094, 0.0014), barrel(0.0086, 0.0118), { from: [0, 0, 0.006] }, SILVER_LIGHT);
      b.loft(barrel(0.0086, 0.0118), barrel(0.0076, 0.0128), { from: [0, 0, 0.006] }, SILVER_LIGHT);
      b.cap(barrel(0.0076, 0.0128), [0, 0, 1], SILVER_LIGHT);
      b.roundedBox([-0.0027, -0.0102, 0.012], [0.0027, 0.0102, KNOB_HEIGHT], 0.0013, SILVER_LIGHT, 1, 2, 2);
      inlay(b, rect(-0.0005, 0.0005, 0.0035, 0.0094), KNOB_HEIGHT + 0.00005, INK);
    },
    0.62,
  );
  recess(
    b,
    jack,
    face,
    [
      [0.0005, 0.0005],
      [0.0007, 0.0016],
    ],
    SILVER,
    SILVER,
    0.5,
  );
  control(CONTROLS.jack, () => {
    turned(
      b,
      [0, 0, 0],
      [0, 0, 1],
      [
        [0.0047, -0.0016],
        [0.0047, 0.0006],
        [0.0041, 0.0012],
        [0.003, 0.0012],
        [0.0025, 0.0004],
        [0.0025, -0.003],
      ],
      20,
      INK,
    );
    inlay(b, circle(0.0025, 14), -0.003, [0.001, 0.001, 0.001], 0.2);
  });
  // The lamp's seat.
  control([RADIO_SPEC.led.point[0], RADIO_SPEC.led.point[1]], () => inlay(b, circle(0.0025, 14), 0.00006, DARK, 0.5));
  // Two slide switches, function and band: a slot, a slit down it, and a cap that fills its width.
  const slider = (rim: Pt[], at: Pt, cap: number): void => {
    recess(
      b,
      rim,
      face,
      [
        [0.0006, 0.0006],
        [0.0008, 0.0028],
      ],
      SILVER,
      SILVER_DARK,
      0.4,
    );
    control(at, () => {
      b.shaded(
        ([, , z]) => 0.7 + 0.3 * smooth(-0.002, 0.003, z),
        () =>
          b.roundedBox([-0.0064, cap - 0.0072, -0.0028], [0.0064, cap + 0.0072, 0.0062], 0.0018, SILVER_LIGHT, 1, 2, 2),
      );
      for (const dy of [-0.003, 0, 0.003])
        b.box([-0.0046, cap + dy - 0.0006, 0.0062], [0.0046, cap + dy + 0.0006, 0.0068], SILVER_LIGHT, 1, ['-z']);
    });
  };
  slider(band, CONTROLS.band, -0.009);
  slider(mode, CONTROLS.mode, 0.009);
  // The volume: a ribbed wheel standing out of a slit in a dished seat.
  recess(
    b,
    volume,
    face,
    [
      [0.001, 0.0009],
      [0.0038, 0.0027],
      [0.0085, 0.0036],
    ],
    SILVER,
    SILVER,
    0.6,
  );
  control(CONTROLS.volume, () => {
    const [floor, radius, proud, half] = [-0.0034, 0.0225, 0.0052, 0.0062];
    inlay(b, roundedRect(-0.0152, 0.0152, -half - 0.0008, half + 0.0008, 0.0012, 2), floor + 0.0002, DARK, 0.35);
    const centre = floor + proud - radius;
    const teeth = 8;
    const sweep = Math.acos((radius - proud) / radius);
    const pitch = (2 * sweep) / (teeth - 0.4);
    const on = (angle: number, r: number, y: number): Vec3 => [Math.sin(angle) * r, y, centre + Math.cos(angle) * r];
    for (let i = 0; i < teeth; i++) {
      const at = -sweep + pitch * (i + 0.3);
      const [a0, a1, a2] = [at - pitch * 0.5, at - pitch * 0.33, at + pitch * 0.33];
      const a3 = at + pitch * 0.5;
      const low = radius - 0.0012;
      for (const [from, to, r0, r1, color] of [
        [a0, a1, low, radius, WHEEL_DARK],
        [a1, a2, radius, radius, WHEEL],
        [a2, a3, radius, low, WHEEL_DARK],
      ] as const)
        b.quad(on(from, r0, -half), on(to, r1, -half), on(to, r1, half), on(from, r0, half), color);
      // Its ends, rounded off into the slit.
      for (const end of [-1, 1]) {
        const [p, q] = [on(a1, radius, end * half), on(a2, radius, end * half)];
        const [pp, qq] = [
          on(a1, radius - 0.0022, end * (half + 0.0012)),
          on(a2, radius - 0.0022, end * (half + 0.0012)),
        ];
        if (end > 0) b.quad(p, q, qq, pp, WHEEL);
        else b.quad(q, p, pp, qq, WHEEL);
      }
    }
  });

  // The legends: small, dark, close to what they name.
  const legend = (art: ArtRect, at: Pt, w: number, h: number): void =>
    print(sink, onFace(at[0], at[1]), art, -w / 2, -h / 2, w, h, [0.5, 0.5, 0.58]);
  const label = (name: RadioLabel, x: number, y: number): void =>
    legend(RADIO_PRINTS.label(name), [x, y], 0.024, 0.005);
  label('TUNING', DIAL_X + 0.0215, 1.0296);
  label('VOLUME', CONTROLS.volume[0], 0.9772);
  label('BASS', CONTROLS.button[0] - 0.001, 1.0292);
  label('PHONES', CONTROLS.jack[0], 0.9842);
  label('TONE', CONTROLS.knob[0] + 0.001, 0.9885);
  label('OPR', RADIO_SPEC.led.point[0], 0.9822);
  label('FUNCTION', CONTROLS.band[0], 0.9805);
  label('BAND', CONTROLS.mode[0], 0.9805);
  legend(RADIO_PRINTS.positions.band, [CONTROLS.band[0] + 0.0165, CONTROLS.band[1]], 0.016, 0.032);
  legend(RADIO_PRINTS.positions.mode, [CONTROLS.mode[0] + 0.0165, CONTROLS.mode[1]], 0.016, 0.032);
}

/** How far the function knob's grip stands off the face: the radio's foremost point. */
const KNOB_HEIGHT = 0.0169;

/** The foot under the panel: a silver ramp with a tray let into it. */
function apron(b: MeshBuilder): void {
  const { bottom, top, z0, z1, wide, narrow } = APRON;
  const length = Math.hypot(top - bottom, z1 - z0);
  b.placed(place([0, bottom, z0], 0, Math.atan((z1 - z0) / (top - bottom))), () => {
    const outline = roundedLoop(
      [
        [X0 - wide, 0],
        [X0 + wide, 0],
        [X0 + narrow, length],
        [X0 - narrow, length],
      ],
      [0.006, 0.006, 0.004, 0.004],
      3,
      [3, 1, 3, 1],
    );
    const tray = roundedRect(X0 - 0.084, X0 + 0.084, 0.0115, 0.0555, 0.003, 3);
    b.plate([outline, tray], 0, SILVER, { grid: 0.03 });
    const rims = [0, 1, 2].map((i): Ring => {
      const angle = (i / 2) * (Math.PI / 2);
      return flat(inset(outline, -0.002 * Math.sin(angle)), -0.002 * (1 - Math.cos(angle)));
    });
    const inside: Vec3 = [X0, length / 2, -0.03];
    b.loft(rims[0] as Ring, rims[1] as Ring, { from: inside }, SILVER_LIGHT);
    b.loft(rims[1] as Ring, rims[2] as Ring, { from: inside }, SILVER_LIGHT);
    b.shaded(
      ([, , z]) => 0.5 + 0.5 * smooth(-0.012, -0.002, z),
      () =>
        b.loft(
          rims[2] as Ring,
          (rims[2] as Ring).map(([x, y]): Vec3 => [x, y, -0.024]),
          { from: inside },
          SILVER,
        ),
    );
    recess(
      b,
      tray,
      LEVEL,
      [
        [0.0006, 0.0006],
        [0.0022, 0.0022],
      ],
      SILVER_LIGHT,
      TRAY,
      0.9,
      0.03,
      // Its floor is a ramp: deep under the panel, coming up to the lip.
      (_x, y) => 0.0035 * smooth(0.008, 0.05, y),
    );
    // The slit at the tray's head, in the panel's shadow.
    inlay(b, roundedRect(X0 - 0.07, X0 + 0.07, 0.0492, 0.0514, 0.0008, 2), -0.0055, DARK, 0.3);
  });
}

/** A print lying in `frame` at (x, y), `w` by `h`, a hair above z = 0. */
function print(
  sink: PropSink,
  frame: Placement,
  art: ArtRect,
  x: number,
  y: number,
  w: number,
  h: number,
  tint: Rgb,
): void {
  const r = frame.rotation as number[];
  const origin = compose(frame, place([x, y, 0.00018])).offset;
  sink.decal({
    origin,
    u: [(r[0] as number) * w, (r[3] as number) * w, (r[6] as number) * w],
    v: [(r[1] as number) * h, (r[4] as number) * h, (r[7] as number) * h],
    art,
    tint,
  });
}

// ─── The transport keys ───────────────────────────────────────────────────────────────────────────────────────────

const KEY_DEPTH = 0.0045;
const KEY_BEVEL = 0.0009;
/** A key's face is a little crowned: its rim this far under its middle. */
const KEY_CROWN = 0.00022;

/**
 * A key cap in the keys' frame: `outline` (seen whole from `centre`) pulled back `KEY_DEPTH` from its face at z = 0,
 * its rim bevelled, its face in two rings about the centre so its light can change across it.
 */
function keycap(b: MeshBuilder, outline: readonly Pt[], centre: Pt): void {
  let area = 0;
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length] as Pt;
    area += p[0] * q[1] - q[0] * p[1];
  });
  const ccw = area >= 0 ? outline : [...outline].reverse();
  const towards = (amount: number | null, fraction: number, z: number): Vec3[] =>
    ccw.map(([x, y]): Vec3 => {
      const [dx, dy] = [centre[0] - x, centre[1] - y];
      const k = amount === null ? fraction : amount / (Math.hypot(dx, dy) || 1);
      return [x + dx * k, y + dy * k, z];
    });
  const rings = [
    towards(0, 0, -KEY_DEPTH),
    towards(0, 0, -KEY_BEVEL * 1.1),
    towards(KEY_BEVEL * 0.35, 0, -KEY_BEVEL * 0.45),
    towards(KEY_BEVEL, 0, -KEY_CROWN),
    towards(null, 0.5, 0),
  ];
  const n = ccw.length;
  // Its sides stand in the seat's dark: the gap between two keys is a black line.
  b.shaded(
    ([, , z]) => 0.25 + 0.75 * smooth(-KEY_BEVEL * 1.6, -KEY_CROWN, z),
    () => {
      for (let r = 0; r + 1 < rings.length; r++) {
        const [a, c] = [rings[r] as Vec3[], rings[r + 1] as Vec3[]];
        const color = r === 0 ? SILVER_DARK : SILVER_LIGHT;
        for (let i = 0; i < n; i++) {
          const k = (i + 1) % n;
          b.quad(a[i] as Vec3, a[k] as Vec3, c[k] as Vec3, c[i] as Vec3, color);
        }
      }
      const last = rings[rings.length - 1] as Vec3[];
      for (let i = 0; i < n; i++)
        b.tri([centre[0], centre[1], 0], last[i] as Vec3, last[(i + 1) % n] as Vec3, SILVER_LIGHT);
    },
  );
}

/** Ink on a key's face: a triangle wound to face out whichever way its corners were given. */
function ink(b: MeshBuilder, p: Pt, q: Pt, r: Pt): void {
  const area = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
  const z = 0.00012;
  if (area >= 0) b.tri([p[0], p[1], z], [q[0], q[1], z], [r[0], r[1], z], INK);
  else b.tri([p[0], p[1], z], [r[0], r[1], z], [q[0], q[1], z], INK);
}

function inkRect(b: MeshBuilder, x0: number, x1: number, y0: number, y1: number): void {
  ink(b, [x0, y0], [x1, y0], [x1, y1]);
  ink(b, [x0, y0], [x1, y1], [x0, y1]);
}

/** The rocker's upper half (▷II), in the keys' frame; `flip` mirrors it into the lower (■). */
function rockerHalf(b: MeshBuilder, flip: boolean): void {
  const { rockerRadius: outer, arcOffset: a, arcRadius, gap } = CLUSTER;
  const side = arcRadius + gap;
  const [cx, cy] = ROCKER_CORNER;
  const split = 0.00015;
  const start = Math.asin(split / side);
  const outline: Pt[] = [
    // Up the right arc from the waist, over the top along the cluster's rim, down the left arc.
    ...arc(a, 0, side, Math.PI - start, Math.atan2(cy, -cx - a), 10),
    ...arc(0, 0, outer, Math.atan2(cy, -cx), Math.atan2(cy, cx), 14).slice(1, -1),
    ...arc(-a, 0, side, Math.atan2(cy, cx + a), start, 10),
  ];
  const sign = flip ? -1 : 1;
  keycap(
    b,
    outline.map(([x, y]): Pt => [x, y * sign]),
    [0, 0.0118 * sign],
  );
  if (flip) {
    inkRect(b, -0.0019, 0.0019, -0.0142, -0.0104);
    return;
  }
  // ▷ and II.
  ink(b, [-0.0046, 0.0102], [-0.0046, 0.0146], [-0.0006, 0.0124]);
  inkRect(b, 0.0012, 0.0022, 0.0102, 0.0146);
  inkRect(b, 0.0032, 0.0042, 0.0102, 0.0146);
}

/** A side key (⏮), in the keys' frame; `flip` mirrors it into ⏭. */
function sideKey(b: MeshBuilder, flip: boolean): void {
  const { sideRadius: outer, arcOffset: a, arcRadius } = CLUSTER;
  const [cx, cy] = SIDE_CORNER;
  const reach = Math.atan2(cy, cx + a);
  const rim = Math.atan2(cy, cx);
  const outline: Pt[] = [
    ...arc(-a, 0, arcRadius, -reach, reach, 16),
    ...arc(0, 0, outer, rim, 2 * Math.PI - rim, 16).slice(1, -1),
  ];
  const sign = flip ? -1 : 1;
  const m = ([x, y]: Pt): Pt => [x * sign, y];
  keycap(b, outline.map(m), m([-0.0122, 0]));
  // A bar and two arrowheads.
  const inked = (p: Pt, q: Pt, r: Pt): void => ink(b, m(p), m(q), m(r));
  inked([-0.0156, -0.002], [-0.0149, -0.002], [-0.0149, 0.002]);
  inked([-0.0156, -0.002], [-0.0149, 0.002], [-0.0156, 0.002]);
  inked([-0.0146, 0], [-0.012, 0.002], [-0.012, -0.002]);
  inked([-0.0118, 0], [-0.0092, 0.002], [-0.0092, -0.002]);
}

// ─── The lid ──────────────────────────────────────────────────────────────────────────────────────────────────────

const LID_HALF = (LID.maxX - LID.minX) / 2;

function lid(b: MeshBuilder): void {
  b.placed(compose(DECK_PLAN, place([HINGE[0], 0, 0])), () => {
    const plate = roundedRect(-LID_HALF, LID_HALF, -LID_LENGTH, -0.0004, 0.005, 4);
    b.extrude(plate, -LID.thickness, 0, DECK_LIGHT, { bevel: 0.0008, steps: 2, back: false, grid: 0.035 });
    // A smoked window over the disc, and three grip lines at the front edge.
    inlay(b, roundedRect(-0.072, 0.072, -0.182, -0.052, 0.012, 5), 0.0001, GLASS, 0.9, 0.04);
    for (let i = 0; i < 3; i++)
      inlay(b, roundedRect(-0.019, 0.019, -0.2165 + i * 0.004, -0.2147 + i * 0.004, 0.0008, 2), 0.0001, DARK, 0.6);
    // The hinge's two barrels.
    for (const x of [-0.072, 0.072])
      b.cylinder([x - 0.011, -0.0022, -0.0012], [x + 0.011, -0.0022, -0.0012], 0.0019, 0.0019, 10, DECK);
  });
}

function lidInner(b: MeshBuilder): void {
  b.placed(compose(OPEN, compose(UNDER_LID, place([HINGE[0], 0, 0]))), () => {
    const t = LID.thickness;
    const plate = roundedRect(-LID_HALF + 0.0006, LID_HALF - 0.0006, 0.0008, LID_LENGTH - 0.0004, 0.0045, 4);
    b.extrude(plate, t - 0.0002, t, TUB, { back: false, grid: 0.03 });
    // The skirt that drops inside the well's walls.
    const skirt = (inset: number, z: number): Ring =>
      flat(roundedRect(-LID_HALF + inset, LID_HALF - inset, inset, LID_LENGTH - inset, 0.006 - inset * 0.5, 4), z);
    const middle: Vec3 = [0, LID_LENGTH / 2, t];
    b.loft(skirt(0.005, t), skirt(0.005, t + 0.0024), { from: middle }, TUB);
    b.loft(skirt(0.005, t + 0.0024), skirt(0.0066, t + 0.0024), { along: [0, 0, 1] }, TUB);
    b.loft(skirt(0.0066, t + 0.0024), skirt(0.0066, t), { towards: middle }, TUB, 0.8);
    // Two stiffening ribs, and the clamp that holds the disc on the spindle.
    for (const y of [0.046, 0.19]) b.beam([-0.086, y - 0.0012, t], [0.086, y + 0.0012, t + 0.0016], TUB, 1, 0.03);
    const over = along(SEAT[2]);
    turned(
      b,
      [SEAT[0] - HINGE[0], over, 0],
      [0, 0, 1],
      [
        [0.0175, t],
        [0.0175, t + 0.0014],
        [0.015, t + 0.003],
        [0.0064, t + 0.003],
        [0.0064, t + 0.0018],
        [0, t + 0.0018],
      ],
      32,
      [0.09, 0.085, 0.085],
    );
  });
}

// ─── The well ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A rectangle's edge as a ring, `nx` and `nz` pieces a side, at the height `y` gives. */
function border(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  nx: number,
  nz: number,
  y: (x: number, z: number) => number,
): Ring {
  const ring: Vec3[] = [];
  const push = (x: number, z: number) => ring.push([x, y(x, z), z]);
  for (let i = 0; i < nx; i++) push(x0 + ((x1 - x0) * i) / nx, z0);
  for (let i = 0; i < nz; i++) push(x1, z0 + ((z1 - z0) * i) / nz);
  for (let i = 0; i < nx; i++) push(x1 + ((x0 - x1) * i) / nx, z1);
  for (let i = 0; i < nz; i++) push(x0, z1 + ((z0 - z1) * i) / nz);
  return ring;
}

function well(b: MeshBuilder): void {
  const { minX, maxX, minZ, maxZ } = RADIO_SPEC.well;
  const [nx, nz] = [8, 8];
  const ledge = (_x: number, z: number): number => deckY(z) - LEDGE_DROP;
  const centre: Vec3 = [SEAT[0], 1.06, -2.05];
  const rim = border(HOLE.x0, HOLE.x1, HOLE.z0, HOLE.z1, nx, nz, ledge);
  const lip = border(minX, maxX, minZ, maxZ, nx, nz, ledge);
  const foot = border(minX, maxX, minZ, maxZ, nx, nz, floorY);
  b.loft(rim, lip, { along: [0, 1, 0] }, TUB, 0.8);
  b.loft(lip, foot, { towards: centre }, TUB, 0.6);
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const [xa, xb] = [minX + ((maxX - minX) * i) / nx, minX + ((maxX - minX) * (i + 1)) / nx];
      const [za, zb] = [minZ + ((maxZ - minZ) * k) / nz, minZ + ((maxZ - minZ) * (k + 1)) / nz];
      b.quad(
        [xa, floorY(xa, zb), zb],
        [xb, floorY(xb, zb), zb],
        [xb, floorY(xb, za), za],
        [xa, floorY(xa, za), za],
        TUB,
        0.7,
      );
    }
  b.placed(ON_FLOOR, () => {
    const floor = -FLOOR_DROP;
    const on = (points: readonly Pt[], lift: number, color: Rgb, shade: number): void =>
      b.cap(
        points.map(([x, z]): Vec3 => [x, floor + lift, z]),
        [0, 1, 0],
        color,
        shade,
      );
    // The magazine's slit across the back, where the discs come up, between two raised lips.
    const slot = RADIO_SPEC.slot;
    const z = (slot.z - SEAT[2]) / Math.cos(Math.asin(-FLOOR_NORMAL[2]));
    const [x0, x1] = [slot.minX - SEAT[0], slot.maxX - SEAT[0]];
    on(rect(x0, x1, z - 0.0016, z + 0.0016), 0.00012, [0.001, 0.001, 0.001], 0.1);
    for (const side of [-1, 1])
      b.box(
        [x0 - 0.002, floor, z + side * 0.0016 - 0.0006],
        [x1 + 0.002, floor + 0.0007, z + side * 0.0016 + 0.0006],
        [0.085, 0.08, 0.08],
        0.8,
        ['-y'],
      );
    // The pickup's track, out from the hub, and its lens.
    on(roundedRect(0.021, 0.064, -0.008, 0.008, 0.004, 3), 0.00012, DARK, 0.3);
    b.cylinder([0.036, floor, 0], [0.036, floor + 0.0012, 0], 0.0052, 0.0046, 16, [0.07, 0.07, 0.075], 0.8);
    b.cylinder([0.036, floor + 0.0012, 0], [0.036, floor + 0.0015, 0], 0.0026, 0.0022, 12, [0.05, 0.09, 0.22], 1);
    // The turntable: a platter just under the seated disc, and the spindle through its hole.
    turned(
      b,
      [0, 0, 0],
      [0, 1, 0],
      [
        [0.0172, floor],
        [0.0172, -0.0016],
        [0.016, -0.0008],
        [0.0072, -0.0008],
      ],
      36,
      [0.11, 0.105, 0.105],
      0.9,
    );
    turned(
      b,
      [0, 0, 0],
      [0, 1, 0],
      [
        [0.0072, -0.0008],
        [0.0072, 0.0016],
        [0.0056, 0.0034],
        [0.0028, 0.0034],
        [0.0028, 0.0026],
        [0, 0.0026],
      ],
      28,
      SILVER,
      1,
    );
    // The three balls that hold a disc by its hole.
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.5;
      b.sphere([Math.cos(angle) * 0.0061, 0.0025, Math.sin(angle) * 0.0061], 0.001, 6, CHROME);
    }
    // Four screws in the floor's corners.
    for (const [x, sz] of [
      [-0.088, -0.108],
      [0.088, -0.108],
      [-0.088, 0.09],
      [0.088, 0.09],
    ] as const)
      b.cylinder([x, floor, sz], [x, floor + 0.0005, sz], 0.0022, 0.0019, 10, [0.16, 0.16, 0.17], 0.8);
  });
}

/** What shows through the seam of a shut lid: a dark plate where the ledge is. */
function wellCover(b: MeshBuilder): void {
  const y = (z: number): number => deckY(z) - LEDGE_DROP;
  b.quad(
    [HOLE.x0, y(HOLE.z1), HOLE.z1],
    [HOLE.x1, y(HOLE.z1), HOLE.z1],
    [HOLE.x1, y(HOLE.z0), HOLE.z0],
    [HOLE.x0, y(HOLE.z0), HOLE.z0],
    DARK,
    0.3,
  );
}

export const radio: Prop = {
  name: 'radio',
  budget: 19000,
  build(sink) {
    const body = sink.mesh('radio');
    body.toned(plastic, () => {
      shell(body);
      speaker(body, -1);
      speaker(body, 1);
      topDeck(body);
      panel(body, sink);
      apron(body);
    });
    lid(sink.mesh('radioLid'));
    lidInner(sink.mesh('radioLidInner'));
    for (const [name, flip] of [
      ['radioRockerTop', false],
      ['radioRockerBottom', true],
    ] as const) {
      const b = sink.mesh(name);
      b.placed(ON_KEYS, () => rockerHalf(b, flip));
    }
    for (const [name, flip] of [
      ['radioPrevious', false],
      ['radioNext', true],
    ] as const) {
      const b = sink.mesh(name);
      b.placed(ON_KEYS, () => sideKey(b, flip));
    }
    well(sink.mesh('radioWell'));
    wellCover(sink.mesh('radioWellCover'));
  },
};
