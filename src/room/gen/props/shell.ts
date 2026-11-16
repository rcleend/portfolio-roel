import { place, type Rgb, type Vec3 } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { MATERIAL } from '../materials';
import { GROUP, PAGE, type Prop } from './types';

/** The room: 5.6 m × 4.8 m, 3.28 m high on the left, sloping from x = 0.95 down to a 1.88 m knee wall on the right. */
const ROOM = { x0: -2.8, x1: 2.8, z0: -2.405, z1: 2.4, height: 3.28, ridge: 0.95, knee: 1.88 };
/** The window's opening in the back wall. */
export const WINDOW = { x0: -2.1, x1: -0.5, y0: 1.127, y1: 2.52 };
const DOOR = { x0: -1.4, x1: -0.2, y1: 2.26 };

const WALL: Rgb = [0.115, 0.15, 0.165];
const CEILING: Rgb = [0.36, 0.31, 0.32];
const TRIM: Rgb = [0.46, 0.41, 0.38];
/** The window's layered ivory enamel (tools/room/restyle.py › palette). */
const FRAME: Rgb = [0.22, 0.208, 0.19];

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
      origin: [-2.8, 0, 2.4],
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
    sink.chart({ ...wall(), shade: 0.45, origin: [x1, 0, z0], u: [0, 0, z1 - z0], v: [0, knee, 0] });
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
    b.beam([x0 - 0.16, y0 - 0.08, -2.43], [x1 + 0.16, y0 - 0.014, -2.19], FRAME);
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
  },
};

/**
 * The rug: a 2.35 m square of navy and ivory checks, turned 15° clockwise, 3 cm thick, with the corner nearest the TV
 * folded back to show its grey backing.
 */
export const rug: Prop = {
  name: 'rug',
  budget: 80,
  build(sink) {
    const half = 2.3514 / 2;
    const centre: Vec3 = [0.0415, 0, 0.4265];
    const turn = place(centre, -Math.PI / 12);
    const r = turn.rotation as number[];
    const at = (x: number, y: number, z: number): Vec3 => [
      (r[0] as number) * x + (r[2] as number) * z + centre[0],
      y,
      (r[6] as number) * x + (r[8] as number) * z + centre[2],
    ];
    const top = 0.035;
    const o = at(-half, top, half);
    const ux = at(half, top, half);
    const vz = at(-half, top, -half);
    sink.chart({
      page: PAGE.floor,
      group: GROUP.floor,
      material: MATERIAL.rug,
      params: [2.3514 / 5, 0, 0, 0],
      density: 420,
      shade: 1,
      origin: o,
      u: [ux[0] - o[0], 0, ux[2] - o[2]],
      v: [vz[0] - o[0], 0, vz[2] - o[2]],
    });
    const b = sink.mesh('props');
    const edge: Rgb = [0.2, 0.2, 0.24];
    b.placed(turn, () => {
      b.beam([-half, 0.004, -half], [half, top - 0.001, half - 0.0001], edge, 0.8, 3);
      // The folded corner (+x, -z): the backing, rolled over along the diagonal and lying back on the pile, and the
      // boards where the corner was.
      const fold = 0.3;
      const [cx, cz] = [half, -half];
      const backing: Rgb = [0.22, 0.22, 0.26];
      const facing = (a: Vec3, c: Vec3, d: Vec3, towards: Vec3): void => {
        const nx = (c[1] - a[1]) * (d[2] - a[2]) - (c[2] - a[2]) * (d[1] - a[1]);
        const ny = (c[2] - a[2]) * (d[0] - a[0]) - (c[0] - a[0]) * (d[2] - a[2]);
        const nz = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]);
        if (nx * towards[0] + ny * towards[1] + nz * towards[2] >= 0) b.tri(a, c, d, backing, 1);
        else b.tri(a, d, c, backing, 1);
      };
      const lift = 0.03;
      const [p, q]: [Vec3, Vec3] = [
        [cx - fold, top, cz],
        [cx, top, cz + fold],
      ];
      // The roll: up from the crease, a little out over where the corner was, then back in.
      const [p1, q1]: [Vec3, Vec3] = [
        [p[0] + 0.012, top + lift * 0.6, p[2] - 0.012],
        [q[0] + 0.012, top + lift * 0.6, q[2] - 0.012],
      ];
      const [p2, q2]: [Vec3, Vec3] = [
        [p[0] - 0.012, top + lift, p[2] + 0.012],
        [q[0] - 0.012, top + lift, q[2] + 0.012],
      ];
      const tip: Vec3 = [cx - fold * 0.96, top + 0.006, cz + fold * 0.96];
      const out: Vec3 = [1, 0.3, -1];
      facing(p, q, p1, out);
      facing(q, q1, p1, out);
      facing(p1, q1, p2, [0.4, 1, -0.4]);
      facing(q1, q2, p2, [0.4, 1, -0.4]);
      facing(p2, q2, tip, [0, 1, 0]);
      b.tri(
        [cx - fold, top + 0.0015, cz],
        [cx, top + 0.0015, cz + fold],
        [cx, top + 0.0015, cz],
        [0.42, 0.2, 0.11],
        0.6,
      );
    });
  },
};
