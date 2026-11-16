import { dot, type MeshBuilder, normalize, place, type Rgb, type Ring, type Vec3 } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { hash32, seeded } from '../kit/hash';
import { MATERIAL } from '../materials';
import { swivelChair } from './chair';
import { deskLamp } from './deskLamp';
import { deskThings, pull } from './deskThings';
import { keyboard } from './keyboard';
import { monitor } from './monitor';
import { mouse } from './mouse';
import { tower } from './tower';
import { FLOOR, GROUP, PAGE, type Prop } from './types';

const WHITE: Rgb = [0.62, 0.6, 0.57];

let seed = 0;
const enamel = (color: Rgb = WHITE, density = 380): Omit<Chart, 'origin' | 'u' | 'v'> => ({
  page: PAGE.furniture,
  group: GROUP.desk,
  material: MATERIAL.enamel,
  params: [color[0], color[1], color[2], (seed++ % 16) / 16],
  density,
  shade: 1,
});

/**
 * The desk under the window: a white top on a frame leg at the left and a three-drawer unit at the right, with a
 * shallow drawer under the top between them, a mouse mat and three books.
 */
export const desk: Prop = {
  name: 'desk',
  budget: 4200,
  build(sink) {
    seed = 0;
    const b = sink.mesh('desk');
    sink.chart(...boxCharts([-2.225, 0.767, -2.29], [-0.375, 0.785, -1.366], enamel(WHITE, 420)));
    // The drawer unit, its three fronts and their pulls.
    sink.chart(...boxCharts([-1.033, 0.006, -2.265], [-0.414, 0.767, -1.412], enamel(), ['+y']));
    for (const [y0, y1] of [
      [0.041, 0.382],
      [0.4, 0.623],
      [0.639, 0.743],
    ] as const) {
      sink.chart(...boxCharts([-0.992, y0, -1.412], [-0.455, y1, -1.39], enamel(), ['-z']));
      pull(sink, -0.8135, -0.6555, y1 - 0.058, -1.39);
    }
    // The apron and its drawer, and the frame leg: two posts and a foot.
    sink.chart(...boxCharts([-2.132, 0.613, -2.277], [-1.033, 0.767, -1.421], enamel(), ['+y', '+x']));
    pull(sink, -1.6581, -1.5002, 0.6851, -1.421);
    for (const z of [-2.268, -1.465]) b.beam([-2.166, 0.03, z], [-2.126, 0.767, z + 0.04], WHITE);
    b.beam([-2.166, 0.006, -2.268], [-2.126, 0.04, -1.425], WHITE);
    deskThings(sink);
    // Three books, lying flat.
    const books: Rgb[] = [
      [0.05, 0.12, 0.17],
      [0.3, 0.08, 0.06],
      [0.09, 0.16, 0.17],
    ];
    books.forEach((color, i) => {
      const y = 0.785 + i * 0.028;
      b.placed(place([-0.615, y, -2.06], (i - 1) * 0.07), () => {
        b.box([-0.14, 0, -0.166], [0.14, 0.025, 0.166], color, 1, ['-y']);
        b.box([-0.132, 0.003, -0.168], [0.14, 0.022, 0.168], [0.5, 0.48, 0.42], 0.9, ['-x', '+y', '-y']);
      });
    });
  },
};

/** The widest a crumpled sheet reaches from its middle. */
const BALL = 0.046;
/** An icosahedron's corners and faces (counter-clockwise from outside): what a crumpled sheet is cut from. */
const PHI = (1 + Math.sqrt(5)) / 2;
const CORNERS: readonly Vec3[] = (
  [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ] as const
).map(normalize);
const FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

/**
 * A crumpled sheet of paper: a ball cut flat by fourteen planes (the sheet's panels, meeting in sharp folds), creased
 * inwards along a few arcs and dented point by point, each facet its own grey so the folds read in any light. It is a
 * geodesic ball of `20 × cuts²` triangles about `centre`, no wider than `radius`, and lies on a flat `rest` radii
 * under its middle. Every point's place follows from its direction alone, so facets meet without gaps.
 */
function crumple(
  b: MeshBuilder,
  centre: Vec3,
  radius: number,
  cuts: number,
  seed: number,
  color: Rgb,
  shade: number,
  rest: number,
): void {
  const random = seeded(977 + seed * 131);
  const direction = (): Vec3 => {
    const [y, around] = [random() * 2 - 1, random() * Math.PI * 2];
    const r = Math.sqrt(1 - y * y);
    return [r * Math.cos(around), y, r * Math.sin(around)];
  };
  const panels = Array.from({ length: 14 }, () => ({ normal: direction(), reach: 0.66 + random() * 0.3 }));
  // A fold is part of a great circle: the points near its plane, on one side of the ball.
  const folds = Array.from({ length: 5 }, () => ({
    across: direction(),
    side: direction(),
    deep: 0.07 + random() * 0.09,
    wide: 0.07 + random() * 0.06,
  }));
  /** How far out the sheet is along a direction, in radii. */
  const reach = (u: Vec3): number => {
    let r = 1;
    for (const { normal, reach } of panels) {
      const facing = dot(u, normal);
      if (facing > 1e-3) r = Math.min(r, reach / facing);
    }
    for (const { across, side, deep, wide } of folds) {
      const off = Math.abs(dot(u, across));
      if (off < wide && dot(u, side) > 0.25) r *= 1 - deep * (1 - off / wide);
    }
    const dent = hash32(
      Math.imul(Math.round(u[0] * 4096), 73856093) ^
        Math.imul(Math.round(u[1] * 4096), 19349663) ^
        Math.imul(Math.round(u[2] * 4096), 83492791) ^
        Math.imul(seed + 1, 0x9e3779b1),
    );
    r *= 1 - 0.2 * (dent / 4294967296) ** 1.4;
    // What it lies on presses it flat.
    return u[1] < 0 ? Math.min(r, rest / -u[1]) : r;
  };
  let facet = 0;
  for (const [i0, i1, i2] of FACES) {
    const [p0, p1, p2] = [CORNERS[i0] as Vec3, CORNERS[i1] as Vec3, CORNERS[i2] as Vec3];
    /** The point `i` steps towards the second corner and `j` towards the third, on the ball, and how far out. */
    const point = (i: number, j: number): readonly [Vec3, number] => {
      const k = cuts - i - j;
      const u = normalize([
        p0[0] * k + p1[0] * i + p2[0] * j,
        p0[1] * k + p1[1] * i + p2[1] * j,
        p0[2] * k + p1[2] * i + p2[2] * j,
      ]);
      const r = reach(u);
      return [[centre[0] + u[0] * r * radius, centre[1] + u[1] * r * radius, centre[2] + u[2] * r * radius], r];
    };
    const emit = (a: readonly [Vec3, number], c: readonly [Vec3, number], d: readonly [Vec3, number]): void => {
      const grain = hash32(Math.imul(seed + 1, 0x85ebca6b) ^ facet++) / 4294967296;
      // A facet deep in a fold sees less of the room; each sheet's panels differ a little in grey.
      const depth = Math.min(1, Math.max(0, ((a[1] + c[1] + d[1]) / 3 - 0.45) / 0.45));
      const grey = 0.8 + 0.34 * grain;
      b.tri(a[0], c[0], d[0], [color[0] * grey, color[1] * grey, color[2] * grey], shade * (0.55 + 0.45 * depth));
    };
    for (let i = 0; i < cuts; i++)
      for (let j = 0; i + j < cuts; j++) {
        emit(point(i, j), point(i + 1, j), point(i, j + 1));
        if (i + j + 1 < cuts) emit(point(i + 1, j), point(i + 1, j + 1), point(i, j + 1));
      }
  }
}

/** The swivel chair at the desk (chair.ts). */
export const chair: Prop = {
  name: 'chair',
  budget: 8000,
  build(sink) {
    swivelChair(sink);
  },
};

/** The wire wastepaper basket by the wall and its eighteen crumpled sheets: fifteen inside, three on the floor. */
export const basket: Prop = {
  name: 'basket',
  budget: 4200,
  build(sink) {
    const b = sink.mesh('desk');
    const wire: Rgb = [0.1, 0.13, 0.2];
    const paper: Rgb = [0.3, 0.3, 0.29];
    const centre: Vec3 = [-2.47, 0.006, -1.48];
    const radius = (y: number) => 0.132 + (y / 0.34) * 0.03;
    b.cylinder(centre, [centre[0], 0.031, centre[2]], 0.13, 0.132, 24, wire, 1);
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const at = (y: number): Vec3 => [
        centre[0] + Math.cos(angle) * radius(y),
        y,
        centre[2] + Math.sin(angle) * radius(y),
      ];
      b.cylinder(at(0.023), at(0.344), 0.003, 0.003, 4, wire, 1, false);
    }
    for (const y of [0.093, 0.194, 0.303, 0.344]) {
      const ring = (r: number, h: number): Ring =>
        Array.from(
          { length: 24 },
          (_, i): Vec3 => [
            centre[0] + Math.cos((i / 24) * Math.PI * 2) * r,
            h,
            centre[2] + Math.sin((i / 24) * Math.PI * 2) * r,
          ],
        );
      b.loft(
        ring(radius(y) + 0.004, y - 0.003),
        ring(radius(y) + 0.004, y + 0.003),
        { from: [centre[0], y, centre[2]] },
        wire,
      );
    }
    const random = seeded(18);
    const { detail } = sink;
    // The deeper a sheet lies, the less of it shows through the wires and the coarser it is cut.
    const cuts = detail >= 0.8 ? [2, 3, 4] : [2, 2, 3];
    for (let i = 0; i < 15; i++) {
      const layer = i < 6 ? 0 : i < 12 ? 1 : 2;
      const angle = random() * Math.PI * 2;
      const out = layer === 2 ? random() * 0.04 : 0.03 + random() * 0.06;
      const at: Vec3 = [centre[0] + Math.cos(angle) * out, 0.07 + layer * 0.055, centre[2] + Math.sin(angle) * out];
      // The lowest six lie on the basket's base; the rest on the sheets under them.
      crumple(b, at, BALL, cuts[layer] as number, i, paper, 0.8, layer === 0 ? (at[1] - 0.031) / BALL : 0.9);
    }
    // Three that missed: on the boards, the last on a printed sheet (1 mm up), each on the flat it landed on.
    for (const [x, z, i, under] of [
      [-2.04, -0.93, 15, FLOOR],
      [-2.3, -0.75, 16, FLOOR],
      [-1.95, -0.6, 17, 0.007],
    ] as const)
      crumple(b, [x, under + 0.0002 + BALL * 0.8, z], BALL, detail >= 0.8 ? 4 : 3, i, paper, 1, 0.8);
    // Four printed sheets lying on the boards, a chart each so the blind's stripes cross them.
    for (const [x, z] of [
      [-2.41, -0.97],
      [-2.08, -0.36],
      [-1.77, -0.12],
      [-2.44, -0.09],
    ] as const)
      sink.chart({
        page: PAGE.floor,
        group: GROUP.floor,
        material: MATERIAL.paper,
        params: [0.74, 0.74, 0.72, 0],
        density: 365,
        shade: 1,
        origin: [x, 0.007, z],
        u: [0.24, 0, 0],
        v: [0, 0, -0.3],
      });
  },
};

/** The tower under the desk (tower.ts) and the arm lamp on it (deskLamp.ts). */
export const towerAndLamp: Prop = {
  name: 'tower-and-desk-lamp',
  budget: 9400,
  build(sink) {
    tower(sink);
    deskLamp(sink);
  },
};

/** The desktop set: the CRT monitor (monitor.ts), the keyboard (keyboard.ts) and the mouse (mouse.ts). It faces +z. */
export const desktop: Prop = {
  name: 'desktop',
  budget: 17000,
  build(sink) {
    monitor(sink);
    keyboard(sink);
    mouse(sink);
  },
};
