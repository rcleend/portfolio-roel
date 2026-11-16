import type { ArtRect } from '../art';
import {
  add,
  basis,
  compose,
  type MeshBuilder,
  type Placement,
  place,
  type Rgb,
  type Ring,
  roundedRect,
  scale,
  spline,
  type Vec3,
} from '../kit/builder';
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
 * The CD player on the dresser: a portable radio cassette CD deck of the nineties, drawn for this room. Two speaker
 * pods with louvred fronts either side of a silver panel (a raised display lens, a round transport cluster, a tuning
 * dial, and a chin of switches under them), a cassette deck and the CD lid on its sloping top, a folded handle and an
 * aerial along the back.
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
 */

/** How far the lid is open where its underside is generated and lit (the spec's open angle), as a placement. */
const OPEN = (() => {
  const angle = (RADIO_SPEC.hinge.openDegrees * Math.PI) / 180;
  return compose(place(HINGE, 0, -angle), place([-HINGE[0], -HINGE[1], -HINGE[2]]));
})();

const SHELL: Rgb = [0.017, 0.019, 0.03];
const CLOTH_DARK: Rgb = [0.0055, 0.0065, 0.0105];
const CLOTH_LIGHT: Rgb = [0.013, 0.015, 0.024];
const CLOTH_END: Rgb = [0.009, 0.0105, 0.017];
const SILVER: Rgb = [0.4, 0.4, 0.44];
const SILVER_LIGHT: Rgb = [0.52, 0.52, 0.56];
const SILVER_DARK: Rgb = [0.22, 0.22, 0.25];
const DECK: Rgb = [0.05, 0.047, 0.05];
const DECK_LIGHT: Rgb = [0.075, 0.07, 0.074];
const TUB: Rgb = [0.055, 0.05, 0.05];
const DARK: Rgb = [0.008, 0.008, 0.01];
const GLASS: Rgb = [0.0045, 0.005, 0.007];
const LCD_OFF: Rgb = [0.03, 0.042, 0.034];
const INK: Rgb = [0.028, 0.03, 0.038];
const CHROME: Rgb = [0.46, 0.46, 0.5];
const WHITE: Rgb = [0.62, 0.62, 0.64];

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

/** The display's glass, and the panel's upper face a lens's height behind it: z as a function of y. */
const glassZ = (y: number): number => LCD.z - (LCD.normal[1] / LCD.normal[2]) * (y - (LCD.min[1] + LCD.max[1]) / 2);
const LENS_HEIGHT = 0.0022;
const upperZ = (y: number): number => glassZ(y) - LENS_HEIGHT / LCD.normal[2];
const CREASE_Y = 1.032;
const PANEL = { minX: 0.872, maxX: 1.158, back: -1.908, top: 1.0868, bottom: 0.9612 };
/** The panel's face from its foot to its top lip, as (y, z): a chin that bulges, a crease, the upper face leaning back. */
const FACE: readonly Pt[] = [
  [0.962, -1.8945],
  [0.967, -1.89],
  [0.976, -1.8868],
  [0.988, -1.88445],
  [1.0, -1.8829],
  [1.012, -1.882],
  [1.022, -1.8822],
  [1.029, -1.8832],
  [CREASE_Y, upperZ(CREASE_Y)],
  [1.045, upperZ(1.045)],
  [1.058, upperZ(1.058)],
  [1.071, upperZ(1.071)],
  [1.0835, upperZ(1.0835)],
  [1.0858, -1.8995],
  [PANEL.top, -1.9025],
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
/** The panel's face under the keys, in their frame. */
const UNDER_KEYS = -0.0032;
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
  r: [0.03, 0.006, 0.008, 0.012],
};
/** The pods, by distance from the middle: they round off to the ends. */
const POD: readonly (readonly [number, Section])[] = [
  [0.225, { zf: -1.912, zb: -2.178, yb: 0.8905, ytf: 1.0765, ytb: 1.031, r: [0.035, 0.02, 0.03, 0.04] }],
  [0.245, { zf: -1.916, zb: -2.166, yb: 0.896, ytf: 1.071, ytb: 1.022, r: [0.035, 0.028, 0.04, 0.05] }],
  [0.26, { zf: -1.919, zb: -2.14, yb: 0.915, ytf: 1.06, ytb: 1.02, r: [0.035, 0.03, 0.04, 0.05] }],
  [0.27, { zf: -1.924, zb: -2.1, yb: 0.935, ytf: 1.045, ytb: 1.018, r: [0.03, 0.03, 0.035, 0.045] }],
  [0.277, { zf: -1.935, zb: -2.05, yb: 0.955, ytf: 1.027, ytb: 1.012, r: [0.025, 0.025, 0.025, 0.03] }],
  [0.28, { zf: -1.953, zb: -2.0, yb: 0.975, ytf: 1.005, ytb: 1.0, r: [0.012, 0.012, 0.012, 0.012] }],
];
/** The middle's stations: the panel's edges, the lid's opening, and enough between for the light to change. */
const MIDDLE_X = [
  DECK_X.min,
  0.842,
  PANEL.minX,
  0.905,
  0.94,
  0.975,
  1.01,
  1.045,
  1.08,
  1.115,
  PANEL.maxX,
  1.188,
  1.213,
  DECK_X.max,
];
/** Where the pods are cut: closer together where they turn most. */
const POD_STATIONS = [0.214, 0.225, 0.235, 0.245, 0.2525, 0.26, 0.265, 0.27, 0.2738, 0.277, 0.2788, 0.28];
/** The louvres stop where the pod's end begins to close; the cloth goes on plain. */
const LOUVRES_END = 0.256;

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
const CORNER_STEPS = 4;
const FRONT_PIECES = 24;
const TOP_PIECES = 6;
const SIDE_PIECES = 3;
/** Ring indices: the front's slats run from the foot-front arc's end to the top-front arc's start, the top after it. */
const FRONT_FROM = CORNER_STEPS;
const TOP_FROM = FRONT_FROM + FRONT_PIECES + CORNER_STEPS;

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

/** The opening in the deck the lid lies in. */
const HOLE = { x0: 1.01, x1: 1.213, z0: -2.1614, z1: -1.9382 };
/** The lid rests this far under the deck, on the well's ledge. */
const LEDGE_DROP = 0.0034;

function shell(b: MeshBuilder): void {
  const stations: { x: number; ring: Ring }[] = [];
  const pods = POD_STATIONS.map((dx): [number, Section] => [dx, pod(dx)]);
  for (const [dx, s] of [...pods].reverse()) stations.push({ x: X0 - dx, ring: section(X0 - dx, s) });
  for (const x of MIDDLE_X) stations.push({ x, ring: section(x, MIDDLE) });
  for (const [dx, s] of pods) stations.push({ x: X0 + dx, ring: section(X0 + dx, s) });
  const count = (stations[0] as { ring: Ring }).ring.length;
  for (let i = 0; i + 1 < stations.length; i++) {
    const [a, c] = [stations[i] as { x: number; ring: Ring }, stations[i + 1] as { x: number; ring: Ring }];
    const middle = (a.x + c.x) / 2;
    const onDeck = a.x >= DECK_X.min - 1e-6 && c.x <= DECK_X.max + 1e-6;
    const louvred = (middle < PANEL.minX || middle > PANEL.maxX) && Math.abs(middle - X0) < LOUVRES_END;
    for (let j = 0; j < count; j++) {
      const k = (j + 1) % count;
      const front = j >= FRONT_FROM && j < FRONT_FROM + FRONT_PIECES;
      // The deck's own plate, with the lid's opening, takes the top's place between the shoulders.
      if (onDeck && j >= TOP_FROM && j < TOP_FROM + TOP_PIECES) continue;
      const cloth = louvred ? ((j - FRONT_FROM) % 2 === 0 ? CLOTH_DARK : CLOTH_LIGHT) : CLOTH_END;
      const color = front && (louvred || Math.abs(middle - X0) >= LOUVRES_END) ? cloth : SHELL;
      b.quad(a.ring[j] as Vec3, c.ring[j] as Vec3, c.ring[k] as Vec3, a.ring[k] as Vec3, color, front ? 0.9 : 1);
    }
  }
  b.cap((stations[0] as { ring: Ring }).ring, [-1, 0, 0], SHELL);
  b.cap((stations[stations.length - 1] as { ring: Ring }).ring, [1, 0, 0], SHELL);

  // The deck: the top between the shoulders, on the lid's plane, around the lid's opening.
  const ring = section(0, MIDDLE);
  const zFront = (ring[TOP_FROM] as Vec3)[2];
  const zBack = (ring[TOP_FROM + TOP_PIECES] as Vec3)[2];
  const rows = [zFront, HOLE.z1, -1.985, -2.035, -2.085, -2.125, HOLE.z0, zBack];
  const at = (x: number, z: number): Vec3 => [x, deckY(z), z];
  for (let i = 0; i + 1 < MIDDLE_X.length; i++) {
    const [xa, xb] = [MIDDLE_X[i] as number, MIDDLE_X[i + 1] as number];
    const open = xa >= HOLE.x0 - 1e-6 && xb <= HOLE.x1 + 1e-6;
    for (let r = 0; r + 1 < rows.length; r++) {
      if (open && r > 0 && r < rows.length - 2) continue;
      const [z0, z1] = [rows[r] as number, rows[r + 1] as number];
      b.quad(at(xa, z0), at(xb, z0), at(xb, z1), at(xa, z1), DECK);
    }
  }
  // The opening's own edge, down to the ledge the lid rests on.
  const edge = (drop: number): Ring => [
    [HOLE.x0, deckY(HOLE.z0) - drop, HOLE.z0],
    [HOLE.x1, deckY(HOLE.z0) - drop, HOLE.z0],
    [HOLE.x1, deckY(HOLE.z1) - drop, HOLE.z1],
    [HOLE.x0, deckY(HOLE.z1) - drop, HOLE.z1],
  ];
  b.loft(edge(0), edge(LEDGE_DROP), { towards: [HINGE[0], 1.06, -2.05] }, DARK, 0.5);

  // Four feet.
  for (const x of [X0 - 0.19, X0 + 0.19])
    for (const z of [-1.96, -2.14]) b.cylinder([x, 0.8872, z], [x, 0.892, z], 0.012, 0.012, 12, DARK, 0.4);
}

// ─── The top: the cassette deck, the handle, the aerial ───────────────────────────────────────────────────────────

function topDeck(b: MeshBuilder): void {
  b.placed(DECK_PLAN, () => {
    // The cassette door: a low plate with its window.
    const door = roundedRect(0.836, 0.998, -along(-2.02), -along(-2.15), 0.006, 4);
    b.extrude(door, -0.0005, 0.0014, DECK_LIGHT, { bevel: 0.0007, steps: 2, back: false, grid: 0.03 });
    inlay(b, roundedRect(0.866, 0.968, -along(-2.068), -along(-2.084), 0.003, 3), 0.0015, GLASS, 0.6);
    // The trough its keys stand in.
    inlay(b, roundedRect(0.844, 0.994, -along(-1.966), -along(-2.004), 0.003, 3), 0.0001, DARK, 0.5);
  });
  b.placed(ON_DECK, () => {
    // Six keys: record (its dot), play, rewind, wind, stop and eject, pause.
    for (let i = 0; i < 6; i++) {
      const x = 0.8475 + i * 0.0243;
      b.roundedBox([x, -0.001, along(-1.999)], [x + 0.0215, 0.0042, along(-1.971)], 0.0012, SILVER_DARK, 1, 1, 2);
    }
    b.cylinder([0.8582, 0.0042, along(-1.985)], [0.8582, 0.00435, along(-1.985)], 0.003, 0.003, 12, [0.3, 0.02, 0.02]);
  });

  // The handle, folded back: two arms along the pods' tops and a grip across the back, behind the lid's swing.
  const arm = (side: number): Vec3[] => [
    [X0 + side * 0.24, 1.062, -2.0],
    [X0 + side * 0.24, 1.052, -2.06],
    [X0 + side * 0.24, 1.041, -2.13],
    [X0 + side * 0.236, 1.041, -2.172],
    [X0 + side * 0.216, 1.0465, -2.187],
  ];
  const path = [...arm(-1), ...arm(1).reverse()];
  b.tube(spline(path, 4), 0.0045, 8, SHELL);
  for (const side of [-1, 1]) {
    const x = X0 + side * 0.24;
    b.cylinder([x - 0.007, 1.06, -2.0], [x + 0.007, 1.06, -2.0], 0.0085, 0.0085, 14, SHELL);
  }
  // The aerial, clipped along the back, its tip a little proud of the deck.
  b.cylinder([1.205, 1.03, -2.1975], [0.8, 1.077, -2.1975], 0.0023, 0.0016, 8, CHROME);
  b.sphere([0.8, 1.077, -2.1975], 0.003, 8, CHROME);
  b.cylinder([1.196, 1.03, -2.192], [1.214, 1.03, -2.192], 0.0055, 0.0055, 10, SHELL);
}

// ─── The front panel ──────────────────────────────────────────────────────────────────────────────────────────────

function panel(b: MeshBuilder, sink: PropSink): void {
  // Its corners are round seen from the front: towards either end the face draws in, and the last station steps back.
  const corner = 0.009;
  const loop = (x: number): Ring => {
    const from = Math.min(x - PANEL.minX, PANEL.maxX - x);
    const inset = from >= corner ? 0 : corner - Math.sqrt(corner * corner - (corner - from) ** 2);
    const bevel = from < 1e-6 ? 0.002 : 0;
    const [middle, half] = [(PANEL.top + PANEL.bottom) / 2, (PANEL.top - PANEL.bottom) / 2];
    const squeeze = (y: number): number => middle + ((y - middle) * (half - inset)) / half;
    const face = FACE.map(([y, z]): Vec3 => [x, squeeze(y), z - bevel]);
    return [[x, squeeze(PANEL.bottom), PANEL.back], ...face, [x, squeeze(PANEL.top), PANEL.back]];
  };
  const ends = [0, 0.0006, 0.002, 0.0045, corner];
  const xs = [
    ...ends.map((d) => PANEL.minX + d),
    0.9,
    0.93,
    0.96,
    0.99,
    1.02,
    1.05,
    1.08,
    1.11,
    1.135,
    ...ends.map((d) => PANEL.maxX - d).reverse(),
  ];
  const inside: Vec3 = [X0, 1.02, -1.93];
  const rings = xs.map(loop);
  for (let i = 0; i + 1 < rings.length; i++) b.loft(rings[i] as Ring, rings[i + 1] as Ring, { from: inside }, SILVER);
  b.cap(rings[0] as Ring, [-1, 0, 0], SILVER);
  b.cap(rings[rings.length - 1] as Ring, [1, 0, 0], SILVER);

  // The display's lens: a smoked block standing off the upper face, the glass over the LCD its top.
  const cy = (LCD.min[1] + LCD.max[1]) / 2;
  const v = (y: number): number => (y - cy) / LCD.normal[2];
  const lcd = { u0: LCD.min[0] - X0, u1: LCD.max[0] - X0, v0: v(LCD.min[1]), v1: v(LCD.max[1]) };
  b.placed(ON_GLASS, () => {
    const lens = roundedRect(-0.057, 0.056, v(1.0333), v(1.0785), 0.004, 4);
    b.extrude(lens, -LENS_HEIGHT - 0.0003, 0, GLASS, { bevel: 0.0008, steps: 2, back: false, grid: 0.025 });
    // The LCD at rest: its grey-green, a frame's width around the lit picture the device lays over it.
    inlay(
      b,
      roundedRect(lcd.u0 - 0.0008, lcd.u1 + 0.0008, lcd.v0 - 0.0008, lcd.v1 + 0.0008, 0.0008, 2),
      0.0001,
      LCD_OFF,
    );
  });
  const lensPrint = (art: ArtRect, u0: number, u1: number, v0: number, v1: number): void =>
    print(sink, ON_GLASS, art, u0, v0, u1 - u0, v1 - v0, [0.4, 0.4, 0.46]);
  lensPrint(RADIO_PRINTS.scale, -0.052, 0.052, lcd.v0 - 0.0188, lcd.v0 - 0.0028);
  lensPrint(RADIO_PRINTS.mark, -0.0558, -0.0298, -0.008, 0.008);
  lensPrint(RADIO_PRINTS.modes, 0.0294, 0.0554, -0.008, 0.008);

  // The transport cluster's seat: a dark floor in a raised ring; the keys are parts of their own.
  b.placed(ON_KEYS, () => socket(b, 0.0219));
  // Its twin on the left: the tuning dial, a dished wheel with a pointer.
  b.placed(ON_DIAL, () => {
    socket(b, 0.0219);
    turned(
      b,
      [0, 0, 0],
      [0, 0, 1],
      [
        [0.0212, UNDER_KEYS],
        [0.0212, 0.0002],
        [0.0203, 0.0011],
        [0.0166, 0.0011],
        [0.015, 0.0002],
        [0.007, -0.0004],
        [0, -0.0005],
      ],
      40,
      SILVER_LIGHT,
    );
    // Its grip: ridges round the rim, and the pointer.
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      const at = (radius: number, side: number, z: number): Vec3 => [c * radius - s * side, s * radius + c * side, z];
      b.quad(
        at(0.0168, -0.0006, 0.00118),
        at(0.0201, -0.0006, 0.00118),
        at(0.0201, 0.0006, 0.00118),
        at(0.0168, 0.0006, 0.00118),
        SILVER_DARK,
        0.7,
      );
    }
    inlay(b, rect(-0.0007, 0.0007, 0.004, 0.0145), 0.0001, [0.5, 0.08, 0.05]);
  });

  // The chin's controls, each lying on the face where it stands.
  const control = (x: number, y: number, build: () => void): void => b.placed(onFace(x, y), build);
  // A push button, and the headphone socket under it.
  control(0.891, 1.008, () => {
    inlay(b, circle(0.0064, 20), 0.0001, DARK, 0.5);
    b.cylinder([0, 0, 0], [0, 0, 0.0022], 0.0052, 0.0047, 20, SILVER_LIGHT);
  });
  control(0.891, 0.986, () => {
    turned(
      b,
      [0, 0, 0],
      [0, 0, 1],
      [
        [0.0056, 0],
        [0.005, 0.0012],
        [0.0026, 0.0012],
        [0.0026, 0.0002],
      ],
      20,
      SILVER_DARK,
    );
    inlay(b, circle(0.0026, 14), 0.0002, GLASS, 0.2);
  });
  // The function knob: a collar, a barrel and a grip bar.
  control(0.936, 0.9975, () => {
    turned(
      b,
      [0, 0, 0],
      [0, 0, 1],
      [
        [0.0138, 0],
        [0.013, 0.002],
        [0.0108, 0.0022],
        [0.0098, 0.0125],
        [0.0088, 0.0135],
        [0, 0.0135],
      ],
      28,
      SILVER_LIGHT,
    );
    b.roundedBox([-0.0026, -0.0105, 0.012], [0.0026, 0.0105, 0.0163], 0.0012, SILVER, 1, 2, 2);
    inlay(b, rect(-0.0005, 0.0005, 0.004, 0.0098), 0.01635, INK);
  });
  // The lamp's seat.
  control(RADIO_SPEC.led.point[0], RADIO_SPEC.led.point[1], () => inlay(b, circle(0.0024, 14), 0.00006, DARK, 0.5));
  // Two slide switches: band and mode.
  const slider = (x: number, knob: number): void =>
    control(x, 0.998, () => {
      inlay(b, roundedRect(-0.0045, 0.0045, -0.0125, 0.0125, 0.002, 3), 0.0001, DARK, 0.4);
      b.roundedBox([-0.0038, knob - 0.0045, 0], [0.0038, knob + 0.0045, 0.0034], 0.0009, SILVER_LIGHT, 1, 2, 2);
      for (const dy of [-0.0018, 0, 0.0018])
        inlay(b, rect(-0.0028, 0.0028, knob + dy - 0.0003, knob + dy + 0.0003), 0.00345, SILVER_DARK);
    });
  slider(0.999, -0.0065);
  slider(1.036, 0.006);
  // The volume: a ribbed wheel showing through a dished window.
  control(1.093, 0.9985, () => {
    turned(
      b,
      [0, 0, 0],
      [0, 0, 1],
      [
        [0.0195, 0],
        [0.0186, 0.0011],
        [0.0172, 0.0011],
        [0.0166, 0.0002],
      ],
      36,
      SILVER_LIGHT,
    );
    inlay(b, circle(0.0166, 28), 0.0002, SILVER_DARK, 0.6);
    inlay(b, roundedRect(-0.0152, 0.0152, -0.0062, 0.0062, 0.0015, 2), 0.0003, DARK, 0.4);
    for (let i = 0; i < 11; i++) {
      const x = (i - 5) * 0.0026;
      const height = 0.0005 + 0.0028 * Math.cos((x / 0.0152) * 1.2);
      b.box([x - 0.00095, -0.0056, 0.0003], [x + 0.00095, 0.0056, height], WHITE, 1, ['-z']);
    }
  });

  const label = (name: RadioLabel, x: number, y: number): void =>
    print(sink, onFace(x, y), RADIO_PRINTS.label(name), -0.016, -0.003, 0.032, 0.006, [0.55, 0.55, 0.6]);
  label('TUNING', 2 * X0 - CLUSTER.centre[0], 1.0255);
  label('VOLUME', 1.093, 1.0235);
  label('BASS', 0.891, 0.9975);
  label('PHONES', 0.891, 0.9755);
  label('FUNCTION', 0.936, 1.0172);
  label('OPR', 0.974, 0.9965);
  label('BAND', 0.999, 0.9795);
  label('MODE', 1.036, 0.9795);

  // The foot under the panel: a silver apron with a dark slot.
  b.extrude(
    [
      [PANEL.minX + 0.006, 0.9606],
      [0.832, 0.9],
      [1.198, 0.9],
      [PANEL.maxX - 0.006, 0.9606],
    ],
    -1.93,
    -1.8962,
    SILVER,
    { bevel: 0.003, steps: 2, back: false, grid: 0.03 },
  );
  b.placed(place([0, 0, -1.8962]), () => {
    inlay(b, roundedRect(0.9, 1.13, 0.922, 0.95, 0.004, 3), 0.0001, DARK, 0.35, 0.04);
    inlay(b, rect(0.905, 1.125, 0.9465, 0.9478), 0.00016, SILVER_DARK, 0.6);
  });
}

/** A round seat in the keys' frame: a dark floor and the raised ring round it. */
function socket(b: MeshBuilder, inner: number): void {
  inlay(b, circle(inner + 0.0004, 40), UNDER_KEYS + 0.0002, DARK, 0.45);
  turned(
    b,
    [0, 0, 0],
    [0, 0, 1],
    [
      [inner + 0.0028, UNDER_KEYS - 0.0002],
      [inner + 0.002, -0.0012],
      [inner + 0.001, -0.0005],
      [inner, -0.0005],
      [inner, UNDER_KEYS],
    ],
    48,
    SILVER_LIGHT,
  );
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
const KEY_BEVEL = 0.0005;

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
    towards(0, 0, -KEY_BEVEL),
    towards(KEY_BEVEL, 0, 0),
    towards(null, 0.55, 0),
  ];
  const n = ccw.length;
  for (let r = 0; r + 1 < rings.length; r++) {
    const [a, c] = [rings[r] as Vec3[], rings[r + 1] as Vec3[]];
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      b.quad(a[i] as Vec3, a[k] as Vec3, c[k] as Vec3, c[i] as Vec3, SILVER_LIGHT);
    }
  }
  const last = rings[rings.length - 1] as Vec3[];
  for (let i = 0; i < n; i++)
    b.tri([centre[0], centre[1], 0], last[i] as Vec3, last[(i + 1) % n] as Vec3, SILVER_LIGHT);
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
  budget: 15000,
  build(sink) {
    const body = sink.mesh('radio');
    shell(body);
    topDeck(body);
    panel(body, sink);
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
