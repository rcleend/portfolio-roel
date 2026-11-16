import { type MeshBuilder, place, type Rgb, type Vec3 } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { MATERIAL } from '../materials';
import { FLOOR, GROUP, PAGE, type Prop } from './types';

/** The room: 5.6 m × 4.8 m, 3.28 m high on the left, sloping from x = 0.95 down to a 1.88 m knee wall on the right. */
const ROOM = { x0: -2.8, x1: 2.8, z0: -2.405, z1: 2.4, height: 3.28, ridge: 0.95, knee: 1.88 };
/** The window's opening in the back wall. */
export const WINDOW = { x0: -2.1, x1: -0.5, y0: 1.127, y1: 2.52 };
const DOOR = { x0: -1.4, x1: -0.2, y1: 2.26 };

const WALL: Rgb = [0.15, 0.195, 0.225];
const CEILING: Rgb = [0.36, 0.31, 0.32];
const TRIM: Rgb = [0.46, 0.41, 0.38];
/** The window's layered ivory enamel (tools/room/restyle.py › palette). */
const FRAME: Rgb = [0.38, 0.36, 0.345];
/** The sill is a stained board, not painted. */
const SILL: Rgb = [0.3, 0.14, 0.085];

const wall = (density = 190): Omit<Chart, 'origin' | 'u' | 'v'> => ({
  page: PAGE.shell,
  group: GROUP.wall,
  material: MATERIAL.wallPaint,
  params: [WALL[0], WALL[1], WALL[2], 0],
  density,
  shade: 1,
});
const trim = (density = 160): Omit<Chart, 'origin' | 'u' | 'v'> => ({
  page: PAGE.shell,
  group: GROUP.wall,
  material: MATERIAL.enamel,
  // The skirting sits in the wall's own shade.
  params: [0.4, 0.385, 0.375, 0.3],
  density,
  shade: 1,
});

/** The oak floor: one chart, 5.6 m × 4.8 m, with a page to itself. Its boards are a surface function. */
export const floor: Prop = {
  name: 'floor',
  budget: 2,
  build(sink) {
    sink.chart({
      page: PAGE.floor,
      group: GROUP.floor,
      material: MATERIAL.oak,
      params: [0, 0, 0, 0],
      density: 365,
      shade: 1,
      origin: [-2.8, FLOOR, 2.4],
      u: [5.6, 0, 0],
      v: [0, 0, -4.8],
    });
  },
};

/**
 * The walls: painted beadboard all round, the back wall in four pieces about the window, the front wall about the
 * door, with the cream skirting along three of them and two wall sockets.
 */
export const walls: Prop = {
  name: 'walls',
  budget: 450,
  build(sink) {
    const { x0, x1, z0, z1, height, knee } = ROOM;
    // A piece of wall facing into the room: its lower-left corner as seen from inside, then across and up.
    const piece = (origin: Vec3, across: Vec3, up: number) =>
      sink.chart({ ...wall(), origin, u: across, v: [0, up, 0] });
    // Back wall (faces +z), about the window.
    piece([x0, 0, z0], [WINDOW.x0 - x0, 0, 0], height);
    piece([WINDOW.x1, 0, z0], [x1 - WINDOW.x1, 0, 0], height);
    piece([WINDOW.x0, 0, z0], [WINDOW.x1 - WINDOW.x0, 0, 0], WINDOW.y0);
    piece([WINDOW.x0, WINDOW.y1, z0], [WINDOW.x1 - WINDOW.x0, 0, 0], height - WINDOW.y1);
    // Left wall (faces +x) and the knee wall on the right (faces -x).
    piece([x0, 0, z1], [0, 0, z0 - z1], height);
    // The knee wall stands under the slope and sees half the room's sky.
    sink.chart({ ...wall(), origin: [x1, 0, z0], u: [0, 0, z1 - z0], v: [0, knee, 0] });
    // Front wall (faces -z), about the door.
    piece([x1, 0, z1], [DOOR.x1 - x1, 0, 0], height);
    piece([DOOR.x0, 0, z1], [x0 - DOOR.x0, 0, 0], height);
    piece([DOOR.x1, DOOR.y1, z1], [DOOR.x0 - DOOR.x1, 0, 0], height - DOOR.y1);
    // Skirting, 15 cm high and 7 cm deep with its top edge eased, along the back and both sides.
    sink.chart(...boxCharts([x0, 0, z0], [x1, 0.15, z0 + 0.07], trim(), ['-y', '-z', '-x', '+x']));
    sink.chart(...boxCharts([x0, 0, z0 + 0.07], [x0 + 0.07, 0.15, z1], trim(), ['-y', '-x', '-z', '+z']));
    sink.chart(...boxCharts([x1 - 0.07, 0, z0 + 0.07], [x1, 0.15, z1], trim(), ['-y', '+x', '-z', '+z']));
    // Two sockets on the back wall.
    const props = sink.mesh('props');
    for (const x of [-2.36, 1.6]) {
      props.roundedBox([x - 0.037, 0.128, z0], [x + 0.037, 0.232, z0 + 0.012], 0.004, [0.5, 0.48, 0.45], 1, 2, 2);
      for (const [dx, dy] of [
        [-0.013, 0.158],
        [0.013, 0.158],
        [-0.013, 0.202],
        [0.013, 0.202],
      ] as const)
        props.box(
          [x + dx - 0.003, dy - 0.007, z0 + 0.012],
          [x + dx + 0.003, dy + 0.007, z0 + 0.0125],
          [0.02, 0.02, 0.02],
          0.5,
          ['-z'],
        );
    }
  },
};

/** The ceilings: flat over the left of the room, sloping down to the knee wall on the right. Painted plaster. */
export const ceilings: Prop = {
  name: 'ceilings',
  budget: 4,
  build(sink) {
    const { x0, x1, z0, z1, height, ridge, knee } = ROOM;
    const plaster: Omit<Chart, 'origin' | 'u' | 'v'> = {
      page: PAGE.shell,
      group: GROUP.wall,
      material: MATERIAL.plaster,
      params: [CEILING[0], CEILING[1], CEILING[2], 0],
      density: 120,
      shade: 1,
    };
    sink.chart({ ...plaster, origin: [x0, height, z0], u: [ridge - x0, 0, 0], v: [0, 0, z1 - z0] });
    sink.chart({ ...plaster, origin: [ridge, height, z0], u: [x1 - ridge, knee - height, 0], v: [0, 0, z1 - z0] });
  },
};

/** The door in the front wall, behind the camera in every view but seen in flights: a slab, two jambs and a knob. */
export const door: Prop = {
  name: 'door',
  budget: 400,
  build(sink) {
    const b = sink.mesh('props');
    b.beam([-1.36, 0, 2.423], [-0.24, 2.2, 2.477], [0.11, 0.05, 0.034], 1, 0.3);
    b.beam([-1.437, 0, 2.32], [-1.363, 2.24, 2.4], TRIM, 1, 0.3);
    b.beam([-0.237, 0, 2.32], [-0.163, 2.24, 2.4], TRIM, 1, 0.3);
    b.sphere([-0.35, 1.05, 2.39], 0.034, 14, [0.3, 0.26, 0.16]);
  },
};

/**
 * The window in the back wall: a narrow casing, the deep sill, two sashes (the lower one's stiles and rails, the
 * meeting rail, a glazing bar) and a venetian blind hung inside the reveal and let halfway down, twenty-four slats
 * tilted nearly shut. Every bar is cut into short lengths so the lamp's pool and the blind's shadows can cross it.
 */
export const windowFrame: Prop = {
  name: 'window',
  budget: 5200,
  build(sink) {
    const b = sink.mesh('props');
    const { x0, x1, y0, y1 } = WINDOW;
    const [zOut, zIn] = [-2.45, -2.36];
    const casing = 0.075;
    // The casing round the opening, proud of the wall, with a bead along its inner edge, and the deep sill.
    b.beam([x0 - casing, y0 - 0.1, ROOM.z0], [x0, y1 + casing, zIn], FRAME);
    b.beam([x1, y0 - 0.1, ROOM.z0], [x1 + casing, y1 + casing, zIn], FRAME);
    b.beam([x0, y1, ROOM.z0], [x1, y1 + casing, zIn], FRAME);
    b.beam([x0 - 0.012, y0, zIn], [x0 + 0.01, y1 + 0.012, zIn + 0.012], FRAME);
    b.beam([x1 - 0.01, y0, zIn], [x1 + 0.012, y1 + 0.012, zIn + 0.012], FRAME);
    b.beam([x0 + 0.01, y1 - 0.01, zIn], [x1 - 0.01, y1 + 0.012, zIn + 0.012], FRAME);
    b.beam([x0 - 0.16, y0 - 0.08, -2.43], [x1 + 0.16, y0 - 0.014, -2.19], SILL);
    // The reveal's inside faces.
    b.beam([x0, y0, zOut], [x0 + 0.03, y1, ROOM.z0], FRAME);
    b.beam([x1 - 0.03, y0, zOut], [x1, y1, ROOM.z0], FRAME);
    b.beam([x0, y0, zOut], [x1, y0 + 0.035, ROOM.z0], FRAME);
    b.beam([x0, y1 - 0.03, zOut], [x1, y1, ROOM.z0], FRAME);
    // Sashes: the meeting rail at mid height and one upright bar.
    const mid = (y0 + y1) / 2;
    b.beam([x0 + 0.03, mid - 0.025, -2.41], [x1 - 0.03, mid + 0.025, -2.37], FRAME);
    b.beam([(x0 + x1) / 2 - 0.016, y0 + 0.035, -2.41], [(x0 + x1) / 2 + 0.016, y1 - 0.03, -2.38], FRAME);
    // The lower sash's own frame: two stiles and the bottom rail.
    for (const x of [x0 + 0.03, x1 - 0.075]) b.beam([x, y0 + 0.035, -2.4], [x + 0.045, mid - 0.025, -2.37], FRAME);
    b.beam([x0 + 0.075, y0 + 0.035, -2.4], [x1 - 0.075, y0 + 0.09, -2.37], FRAME);
    // The blind, inside the casing: a head rail, the slats from the top down to 1.76 m, and its bottom rail.
    const slat: Rgb = [0.6, 0.56, 0.54];
    const slatShade: Rgb = [0.3, 0.27, 0.27];
    const [left, right] = [x0 + 0.035, x1 - 0.035];
    b.beam([left, y1 - 0.045, -2.365], [right, y1 - 0.005, -2.32], slat);
    const slats = 24;
    for (let i = 0; i < slats; i++) {
      const y = 2.462 - (i * (2.462 - 1.775)) / (slats - 1);
      // A slat is curved: its upper half faces the room, its lower half turns down into its own shade.
      b.placed(place([0, y, -2.342], 0, 0.95), () => {
        b.beam([left, -0.001, -0.026], [right, 0.001, 0.002], slat, 0.9, 0.4);
        b.beam([left, -0.001, 0.002], [right, 0.001, 0.026], slatShade, 0.9, 0.4);
      });
    }
    b.beam([left, 1.735, -2.355], [right, 1.755, -2.33], slat);
    for (const x of [x0 + 0.27, x1 - 0.27])
      b.box([x - 0.0012, 1.755, -2.3235], [x + 0.0012, y1 - 0.045, -2.3225], [0.4, 0.38, 0.36], 1);
    windowFittings(b, sink.detail);
  },
};

/** The window's brass, the blind's clear wand and its cords. */
const BRASS: Rgb = [0.46, 0.33, 0.13];
const BRASS_WORN: Rgb = [0.56, 0.43, 0.2];
const WAND: Rgb = [0.5, 0.5, 0.48];
const CORD: Rgb = [0.5, 0.47, 0.42];

/**
 * What a hand touches at the window. The meeting rail stands behind the lowered blind, so the brass is on the lower
 * sash's bottom rail: two cam fasteners on its top (a plate, the cam on its pivot under the keeper's lip, a thumb
 * lever) and two hook lifts on its face. On the blind: the tilt wand, a clear hexagonal rod hooked to the head rail at
 * the left, and at the right the two lift cords out of their lock, joined in a tassel under the blind. All of it
 * stands on the room's side of the slats (z > -2.32) or on the rail, touching nothing else.
 */
function windowFittings(b: MeshBuilder, detail: number): void {
  const { x0, x1, y0 } = WINDOW;
  const [left, right] = [x0 + 0.035, x1 - 0.035];
  const fine = detail >= 0.8;
  const round = fine ? 8 : 6;
  /** A screw's head, standing along +y of wherever it is placed. */
  const screw = (x: number, z: number, y: number): void => {
    if (detail < 0.55) return;
    b.lathe(
      [x, y, z],
      [0, 1, 0],
      [
        [0.0027, 0],
        [0.0021, 0.0008],
        [0, 0.001],
      ],
      6,
      BRASS_WORN,
      0.9,
    );
  };

  // The fasteners, on the bottom rail's top (y0 + 0.09, 30 mm deep). Each is turned shut: its lever lies along the rail.
  const railTop = y0 + 0.09;
  for (const [x, turn] of [
    [x0 + 0.43, 0.45],
    [x1 - 0.4, 0.38],
  ] as const)
    b.placed(place([x, railTop, -2.385]), () => {
      b.roundedBox([-0.027, 0, -0.011], [0.027, 0.0022, 0.011], 0.004, BRASS, 1, 1, 1);
      screw(-0.0215, 0.004, 0.0022);
      screw(0.0215, -0.004, 0.0022);
      // The keeper at the glass side: a lug and the lip the cam turns under.
      b.box([-0.016, 0.0022, -0.011], [0.004, 0.0085, -0.0075], BRASS, 1, ['-y']);
      b.box([-0.016, 0.0062, -0.0075], [0.004, 0.0085, -0.004], BRASS, 0.9, ['-z']);
      // The cam and its pivot.
      const pivot: Vec3 = [-0.006, 0.0022, 0.002];
      b.lathe(
        pivot,
        [0, 1, 0],
        [
          [0.0085, 0],
          [0.0085, 0.003],
          [0.0075, 0.0036],
          [0.0034, 0.0036],
          [0.003, 0.0052],
          [0, 0.0056],
        ],
        round,
        BRASS_WORN,
        0.95,
      );
      // The lever: a flat arm from the cam, rising to a round thumb pad past the plate's end.
      const [dx, dz] = [Math.cos(turn), Math.sin(turn)];
      const section = (along: number, half: number, low: number, high: number): Vec3[] => {
        const [cx, cz] = [pivot[0] + dx * along, pivot[2] + dz * along];
        return [
          [cx + dz * half, low, cz - dx * half],
          [cx - dz * half, low, cz + dx * half],
          [cx - dz * half, high, cz + dx * half],
          [cx + dz * half, high, cz - dx * half],
        ];
      };
      b.skin(
        [
          section(0.002, 0.0032, 0.0058, 0.0079),
          section(0.016, 0.0027, 0.0061, 0.0081),
          section(0.0275, 0.0023, 0.0074, 0.0092),
        ],
        BRASS_WORN,
      );
      b.lathe(
        [pivot[0] + dx * 0.03, 0.0071, pivot[2] + dz * 0.03],
        [0, 1, 0],
        [
          [0, 0],
          [0.0042, 0.0006],
          [0.005, 0.0021],
          [0.0042, 0.0036],
          [0, 0.0042],
        ],
        round,
        BRASS_WORN,
      );
    });

  // The lifts, on the bottom rail's face (z = -2.37): a plate, two screws, and a finger hook curling out and down.
  for (const x of [x0 + 0.24, x1 - 0.24])
    b.placed(place([x, y0 + 0.0625, -2.37]), () => {
      b.roundedBox([-0.021, -0.015, 0], [0.021, 0.015, 0.002], 0.004, BRASS, 1, 2, 1);
      // Screws stand along +y: turned to stand out of the plate.
      b.placed(place([0, 0, 0.002], 0, Math.PI / 2), () => {
        screw(-0.015, 0.009, 0);
        screw(0.015, 0.009, 0);
      });
      const hook: readonly (readonly [number, number, number])[] = [
        [0.0075, 0.0015, 0.0013],
        [0.0085, 0.0095, 0.0013],
        [0.0055, 0.0165, 0.0012],
        [-0.001, 0.0195, 0.0011],
        [-0.0065, 0.0175, 0.001],
      ];
      b.skin(
        hook.map(([y, z, half], i): Vec3[] => {
          const [py, pz] = hook[Math.max(0, i - 1)] as readonly [number, number, number];
          const [ny, nz] = hook[Math.min(hook.length - 1, i + 1)] as readonly [number, number, number];
          const l = Math.hypot(ny - py, nz - pz);
          // Across the hook's own run: its thickness.
          const [ty, tz] = [(-(nz - pz) / l) * half, ((ny - py) / l) * half];
          return [
            [-0.014, y - ty, z - tz],
            [0.014, y - ty, z - tz],
            [0.014, y + ty, z + tz],
            [-0.014, y + ty, z + tz],
          ];
        }),
        BRASS_WORN,
      );
    });

  // The tilt wand: a stub out of the head rail's face, a wire hook, the coupler, and the rod with its grip. It hangs
  // a hand's breadth in from the blind's left end, 8 mm clear of the slats, leaning as it was last let go.
  const wandX = left + 0.085;
  const hung: Vec3 = [wandX, 2.488, -2.3115];
  b.cylinder([wandX, 2.488, -2.32], [wandX, 2.488, -2.3095], 0.0042, 0.0042, 6, WAND, 0.9);
  b.cylinder(hung, [wandX, 2.462, -2.3115], 0.0012, 0.0012, 4, [0.3, 0.3, 0.31], 1, false);
  const foot: Vec3 = [wandX + 0.006, 1.868, -2.31];
  const down = (t: number): Vec3 => [
    hung[0] + (foot[0] - hung[0]) * t,
    2.466 + (foot[1] - 2.466) * t,
    hung[2] + (foot[2] - hung[2]) * t,
  ];
  b.cylinder(down(0), down(0.03), 0.0048, 0.0048, 6, WAND, 0.9);
  // The rod in lengths, so the light on it can change down the blind.
  const lengths = fine ? 6 : 3;
  for (let i = 0; i < lengths; i++)
    b.cylinder(
      down(0.03 + (0.87 * i) / lengths),
      down(0.03 + (0.87 * (i + 1)) / lengths),
      0.0034,
      0.0034,
      6,
      WAND,
      1,
      false,
    );
  const axis: Vec3 = [foot[0] - hung[0], foot[1] - 2.466, foot[2] - hung[2]];
  b.lathe(
    down(0.9),
    axis,
    [
      [0.0034, 0],
      [0.0056, 0.006],
      [0.0062, 0.03],
      [0.0056, 0.054],
      [0.0038, 0.06],
      [0, 0.06],
    ],
    6,
    WAND,
  );

  // The lift cords: out of the lock on the head rail's face, down in front of the slats, and joined in a tassel
  // under the blind, in front of the lower sash's glass.
  const cordX = right - 0.09;
  b.box([cordX - 0.012, 2.476, -2.32], [cordX + 0.012, 2.494, -2.313], [0.55, 0.52, 0.5], 1, ['-z']);
  const tassel: Vec3 = [cordX + 0.004, 1.47, -2.3145];
  const steps = fine ? 11 : 6;
  for (const side of [-1, 1]) {
    const path: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Apart at the lock, together at the tassel, with the slack of a cord that hangs free.
      const apart = side * 0.0045 * (1 - t) ** 0.6;
      const slack = Math.sin(t * Math.PI) * 0.004 * side;
      path.push([
        cordX + (tassel[0] - cordX) * t + apart + slack,
        2.476 + (tassel[1] - 2.476) * t,
        -2.3165 + (tassel[2] + 2.3165) * t,
      ]);
    }
    b.tube(path, 0.0011, 3, CORD, 1, false);
  }
  b.lathe(
    tassel,
    [0, -1, 0],
    [
      [0.0018, -0.002],
      [0.0045, 0.004],
      [0.0058, 0.02],
      [0.0062, 0.034],
      [0.0042, 0.04],
      [0, 0.04],
    ],
    round,
    [0.55, 0.52, 0.5],
  );
}

/** The rug's side, its thickness, and the height of its pile over the room's origin. */
const RUG = 2.3514;
const THICK = 0.016;
const PILE = FLOOR + THICK;
/** A square of the pattern, the backing's jute, and the two yarns seen at the rug's edge. */
const CHECK = RUG / 5;
const JUTE: Rgb = [0.21, 0.195, 0.175];
const NAVY: Rgb = [0.014, 0.03, 0.105];
const IVORY: Rgb = [0.6, 0.6, 0.63];

const smooth = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/**
 * The rug: a 2.35 m square of navy and ivory checks, turned 15° clockwise, the corner nearest the TV turned back over
 * itself to show its jute backing. Wool on a floor never lies flat: a soft ridge where it was folded for years, a
 * crease across it, and rucks where it has been pushed, all as relief of its one chart (kit/charts.ts), so its
 * pattern keeps its texels and its light is baked on the cloth as it lies. Its rim and the turned corner are geometry.
 */
export const rug: Prop = {
  name: 'rug',
  budget: 15000,
  build(sink) {
    const half = RUG / 2;
    const centre: Vec3 = [0.0415, 0, 0.4265];
    const turn = place(centre, -Math.PI / 12);
    const r = turn.rotation as number[];
    /** A point of the rug, in its own square (x across, z towards the room's front), at a height over the room. */
    const at = (x: number, y: number, z: number): Vec3 => [
      (r[0] as number) * x + (r[2] as number) * z + centre[0],
      y,
      (r[6] as number) * x + (r[8] as number) * z + centre[2],
    ];
    const cells = sink.detail >= 0.8 ? 75 : sink.detail >= 0.55 ? 50 : 25;
    const cell = RUG / cells;
    // The turned corner is (+x, -z); its crease runs across it along the cells' own diagonals.
    const turned = Math.round(0.376 / cell) * cell;
    /** How far past the crease a point of the square is, towards the corner (negative: on the rug). */
    const past = (x: number, z: number): number => (x - z - (RUG - turned)) / Math.SQRT2;
    /** A wrinkle no narrower than the cells can draw: the coarser tiers' are broader and lower. */
    const broad = Math.max(1, cell / 0.0314);
    /** The pile's height over the flat rug at a point of the square: the ridge, the crease, the rucks. */
    const lie = (x: number, z: number): number => {
      const rim = Math.min(half - Math.abs(x), half - Math.abs(z));
      // Flat along the rim, and under the turned corner where the flap rests on it.
      const calm = smooth(0.02, 0.16, rim) * smooth(-0.32, -0.46, past(x, z));
      const ridgeAt = 0.2 - 0.07 * x + 0.03 * Math.sin(x * 2.3);
      const ridge = (0.014 / broad ** 0.5) * Math.exp(-(((z - ridgeAt) / (0.05 * broad)) ** 2)) * smooth(0.75, 0.1, x);
      const creaseAt = -0.38 + 0.035 * Math.sin(z * 3.1);
      const crease =
        (0.0075 / broad ** 0.5) *
        Math.exp(-(((x - creaseAt) / (0.045 * broad)) ** 2)) *
        smooth(0.05, -0.3, z) *
        smooth(-1.1, -0.75, z);
      const ruck = (cx: number, cz: number, angle: number, pitch: number, reach: number, high: number): number => {
        const along = (x - cx) * Math.cos(angle) + (z - cz) * Math.sin(angle);
        const fall = Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / reach ** 2));
        return (high / broad ** 0.5) * fall * (0.5 + 0.5 * Math.cos((along / (pitch * broad)) * Math.PI * 2));
      };
      const rucks =
        ruck(0.55, 0.62, 0.55, 0.2, 0.3, 0.0105) +
        ruck(-0.55, -0.5, 2.2, 0.22, 0.28, 0.0085) +
        ruck(0.35, -0.45, 1.2, 0.24, 0.22, 0.006);
      const slow = 0.0024 * (Math.sin(x * 4.1 + z * 2.3) + Math.sin(z * 5.2 - x * 1.7));
      return calm * (ridge + crease + rucks + slow);
    };
    /** The same in the chart's own terms: 0–1 across it, and metres off its plane. Past the crease it dives away. */
    const height = (s: number, t: number): number => {
      const [x, z] = [(s - 0.5) * RUG, (0.5 - t) * RUG];
      if (past(x, z) > cell * 0.2) return -0.05;
      const rim = Math.min(half - Math.abs(x), half - Math.abs(z));
      // The pile rolls down to the rim.
      return lie(x, z) - 0.0045 * (1 - smooth(0, 0.035, rim)) ** 2;
    };
    const o = at(-half, PILE, half);
    const ux = at(half, PILE, half);
    const vz = at(-half, PILE, -half);
    sink.chart({
      page: PAGE.corner,
      group: GROUP.rug,
      material: MATERIAL.rug,
      params: [CHECK, 0, 0, 0],
      density: 420,
      shade: 1,
      origin: o,
      u: [ux[0] - o[0], 0, ux[2] - o[2]],
      v: [vz[0] - o[0], 0, vz[2] - o[2]],
      relief: { cells: [cells, cells], height, emphasis: 2.4 },
    });

    const b = sink.mesh('props');
    /** The yarn at the rug's edge, a little darker than on its face: the pattern seen from the side. */
    const yarn = (x: number, z: number): Rgb => {
      const square = Math.floor((x + half) / CHECK) + Math.floor((half - z) / CHECK);
      const [c0, c1, c2] = Math.abs(square) % 2 === 0 ? NAVY : IVORY;
      return [c0 * 0.7, c1 * 0.7, c2 * 0.72];
    };
    // The rim, round the three whole corners from one end of the crease to the other: the pile's edge, the cut
    // side and the foot on the boards.
    const rim: [number, number, number, number][] = [];
    const run = (
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      count: number,
      nx: number,
      nz: number,
      first = 0,
    ): void => {
      for (let i = first; i <= count; i++)
        rim.push([x0 + ((x1 - x0) * i) / count, z0 + ((z1 - z0) * i) / count, nx, nz]);
    };
    const whole = cells - Math.round(turned / cell);
    run(half - turned, -half, -half, -half, whole, 0, -1);
    run(-half, -half, -half, half, cells, -1, 0, 1);
    run(-half, half, half, half, cells, 0, 1, 1);
    run(half, half, half, -half + turned, whole, 1, 0, 1);
    // A corner's two normals meet in a mitre.
    const out = rim.map(([, , nx, nz], i): [number, number] => {
      const next = rim[i + 1];
      const corner =
        next && (next[2] !== nx || next[3] !== nz) ? ([nx + next[2], nz + next[3]] as const) : ([nx, nz] as const);
      return [corner[0], corner[1]];
    });
    const edge = (inset: number, y: (x: number, z: number) => number): Vec3[] =>
      rim.map(([x, z], i) => {
        const [nx, nz] = out[i] as [number, number];
        return at(x - nx * inset, y(x, z), z - nz * inset);
      });
    const top = (x: number, z: number): number => PILE + height((x + half) / RUG, (half - z) / RUG);
    const rings = [
      edge(0.0012, (x, z) => top(x, z) - 0.0006),
      edge(-0.002, (x, z) => top(x, z) - 0.0045),
      edge(-0.0024, () => FLOOR + 0.0035),
      edge(-0.0008, () => FLOOR + 0.0003),
    ];
    const strip = (from: number, to: number): void => {
      const [p, q] = [rings[from] as Vec3[], rings[to] as Vec3[]];
      for (let i = 0; i + 1 < p.length; i++) {
        const [x0, z0] = rim[i] as [number, number, number, number];
        const [x1, z1] = rim[i + 1] as [number, number, number, number];
        // Darker down the cut side, darkest at the foot.
        const dim = to === 3 ? 0.55 : to === 2 ? 0.8 : 1;
        const [c0, c1] = [yarn(x0, z0), yarn(x1, z1)];
        const a0: Rgb = [c0[0] * dim, c0[1] * dim, c0[2] * dim];
        const a1: Rgb = [c1[0] * dim, c1[1] * dim, c1[2] * dim];
        b.gradient(p[i] as Vec3, q[i] as Vec3, q[i + 1] as Vec3, [a0, a0, a1], [1, 0.7, 0.7]);
        b.gradient(p[i] as Vec3, q[i + 1] as Vec3, p[i + 1] as Vec3, [a0, a1, a1], [1, 0.7, 1]);
      }
    };
    strip(0, 1);
    strip(1, 2);
    strip(2, 3);

    // The turned corner: the cloth leaves the boards along the crease, rolls over, and lies back on the pile, jute
    // side up. A point of it is `a` along the crease from its middle and `d` round the roll from where it lifts.
    const length = turned * Math.SQRT2;
    const middle: readonly [number, number] = [half - turned / 2, -half + turned / 2];
    const roll = (a: number): number => 0.028 * Math.sqrt(Math.min(1, (length / 2 - Math.abs(a)) / 0.07));
    // The corner's point is worn round.
    const reach = (a: number): number => Math.max(0, length / 2 - Math.abs(a) - 0.014 * Math.exp(-Math.abs(a) / 0.035));
    const flap = (a: number, d: number, under = 0): Vec3 => {
      const radius = Math.max(1e-5, roll(a));
      const arc = Math.PI * radius;
      let [q, y] = [0, 0];
      if (d <= arc) {
        const angle = d / radius;
        // `under` draws the cloth's other face: the same roll, a thickness nearer its middle.
        const rr = Math.max(0, radius - under);
        q = rr * Math.sin(angle);
        y = FLOOR + radius - rr * Math.cos(angle);
      } else {
        const lying = d - arc;
        // A stiff cloth does not lie down again: it sags from the roll and hangs over the pile, lowest near its tip.
        const rest = 2 * THICK + 0.011;
        const up = rest + (2 * radius - rest) * Math.exp(-lying / 0.15);
        q = -lying;
        // It hangs in a shallow trough along its middle and ripples a little at its edges.
        const trough = 0.007 * (1 - ((2 * a) / length) ** 2) * Math.min(1, lying / 0.1);
        y = FLOOR + up - trough + 0.0022 * Math.sin(a * 31) * Math.min(1, lying / 0.12) - under;
      }
      const x = middle[0] + (a + q) / Math.SQRT2;
      const z = middle[1] + (a - q) / Math.SQRT2;
      return at(x, y, z);
    };
    const [across, round] = sink.detail >= 0.8 ? [30, 16] : [16, 9];
    const sheet = (lower: number): Vec3[][] => {
      const rows: Vec3[][] = [];
      for (let j = 0; j <= round; j++) {
        const v = j / round;
        rows.push(
          Array.from({ length: across + 1 }, (_, i) => {
            const a = (i / across - 0.5) * length;
            const far = reach(a);
            const arc = Math.min(far, Math.PI * roll(a));
            // Half the rows go round the roll, half along the lying cloth.
            const d = v < 0.5 ? (v / 0.5) * arc : arc + ((v - 0.5) / 0.5) * (far - arc);
            return flap(a, d, lower);
          }),
        );
      }
      return rows;
    };
    const jute = (point: Vec3): Rgb => {
      const weave = 0.9 + 0.1 * Math.sin(point[0] * 310) * Math.sin(point[2] * 310);
      const low = 0.55 + 0.45 * smooth(FLOOR, FLOOR + 0.018, point[1]);
      return [JUTE[0] * weave * low, JUTE[1] * weave * low, JUTE[2] * weave * low];
    };
    const upper = sheet(0);
    const paint = (rows: Vec3[][], tone: (point: Vec3) => Rgb, flip: boolean, dim: number): void => {
      for (let j = 0; j + 1 < rows.length; j++)
        for (let i = 0; i < across; i++) {
          const [p00, p01, p10, p11] = [
            (rows[j] as Vec3[])[i] as Vec3,
            (rows[j] as Vec3[])[i + 1] as Vec3,
            (rows[j + 1] as Vec3[])[i] as Vec3,
            (rows[j + 1] as Vec3[])[i + 1] as Vec3,
          ];
          const [c00, c01, c10, c11] = [tone(p00), tone(p01), tone(p10), tone(p11)];
          if (flip) {
            b.gradient(p00, p11, p01, [c00, c11, c01], [dim, dim, dim]);
            b.gradient(p00, p10, p11, [c00, c10, c11], [dim, dim, dim]);
          } else {
            b.gradient(p00, p01, p11, [c00, c01, c11], [dim, dim, dim]);
            b.gradient(p00, p11, p10, [c00, c11, c10], [dim, dim, dim]);
          }
        }
    };
    // The jute face, seen from outside the roll and from above; under it, the pile's face, in the roll's shadow.
    paint(upper, jute, true, 1);
    const lower = sheet(THICK * 0.82);
    paint(lower, () => [NAVY[0] * 0.8, NAVY[1] * 0.8, NAVY[2] * 0.8], false, 0.5);
    // The cut edge between them, along the two sides that were the rug's own.
    const last = upper.length - 1;
    for (let i = 0; i < across; i++) {
      const [u0, u1, l0, l1] = [
        (upper[last] as Vec3[])[i] as Vec3,
        (upper[last] as Vec3[])[i + 1] as Vec3,
        (lower[last] as Vec3[])[i] as Vec3,
        (lower[last] as Vec3[])[i + 1] as Vec3,
      ];
      const side: Rgb = [NAVY[0] * 0.9 + 0.02, NAVY[1] * 0.9 + 0.02, NAVY[2] * 0.9 + 0.025];
      // Both ways round: the edge is seen from either side of the corner's point.
      b.quad(u0, u1, l1, l0, side, 0.8);
      b.quad(u0, l0, l1, u1, side, 0.8);
    }
  },
};
