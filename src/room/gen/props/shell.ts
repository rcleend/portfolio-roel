import { place, type Rgb, type Vec3 } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { MATERIAL } from '../materials';
import { GROUP, PAGE, type Prop } from './types';

/** The room: 5.6 m × 4.8 m, 3.28 m high on the left, sloping from x = 0.95 down to a 1.88 m knee wall on the right. */
const ROOM = { x0: -2.8, x1: 2.8, z0: -2.405, z1: 2.4, height: 3.28, ridge: 0.95, knee: 1.88 };
/** The window's opening in the back wall. */
export const WINDOW = { x0: -2.1, x1: -0.5, y0: 1.127, y1: 2.52 };
const DOOR = { x0: -1.4, x1: -0.2, y1: 2.26 };

const WALL: Rgb = [0.1, 0.125, 0.175];
const CEILING: Rgb = [0.36, 0.31, 0.32];
const TRIM: Rgb = [0.46, 0.41, 0.38];

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
  params: [0.17, 0.155, 0.15, 0.3],
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
    piece([x1, 0, z0], [0, 0, z1 - z0], knee);
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
    b.beam([-1.36, 0, 2.423], [-0.24, 2.2, 2.477], TRIM, 1, 0.3);
    b.beam([-1.437, 0, 2.32], [-1.363, 2.24, 2.4], TRIM, 1, 0.3);
    b.beam([-0.237, 0, 2.32], [-0.163, 2.24, 2.4], TRIM, 1, 0.3);
    b.sphere([-0.35, 1.05, 2.39], 0.034, 14, [0.3, 0.26, 0.16]);
  },
};

/**
 * The window in the back wall: casing, sill, two sashes with their meeting rail and a glazing bar each, and a venetian
 * blind let halfway down, twenty slats tilted a third open. Every bar is cut into short lengths so the moon's and the
 * blind's shadows can cross it.
 */
export const windowFrame: Prop = {
  name: 'window',
  budget: 5200,
  build(sink) {
    const b = sink.mesh('props');
    const { x0, x1, y0, y1 } = WINDOW;
    const [zOut, zIn] = [-2.45, -2.31];
    // The casing round the opening, proud of the wall, and the deep sill.
    b.beam([x0 - 0.13, y0 - 0.1, ROOM.z0], [x0, y1 + 0.09, zIn], TRIM);
    b.beam([x1, y0 - 0.1, ROOM.z0], [x1 + 0.13, y1 + 0.09, zIn], TRIM);
    b.beam([x0, y1, ROOM.z0], [x1, y1 + 0.09, zIn], TRIM);
    b.beam([x0 - 0.2, y0 - 0.08, -2.43], [x1 + 0.2, y0 - 0.014, -2.19], TRIM);
    // The reveal's inside faces.
    b.beam([x0, y0, zOut], [x0 + 0.03, y1, ROOM.z0], TRIM);
    b.beam([x1 - 0.03, y0, zOut], [x1, y1, ROOM.z0], TRIM);
    b.beam([x0, y0, zOut], [x1, y0 + 0.035, ROOM.z0], TRIM);
    b.beam([x0, y1 - 0.03, zOut], [x1, y1, ROOM.z0], TRIM);
    // Sashes: the meeting rail at mid height and one upright bar.
    const mid = (y0 + y1) / 2;
    b.beam([x0 + 0.03, mid - 0.025, -2.41], [x1 - 0.03, mid + 0.025, -2.37], TRIM);
    b.beam([(x0 + x1) / 2 - 0.018, y0 + 0.035, -2.41], [(x0 + x1) / 2 + 0.018, y1 - 0.03, -2.38], TRIM);
    // The blind: a head rail, twenty slats from the top down to 1.74 m, tilted, and its bottom rail.
    const slat: Rgb = [0.85, 0.85, 0.85];
    b.beam([x0 + 0.005, y1 - 0.06, -2.31], [x1 - 0.005, y1 - 0.02, -2.25], slat);
    for (let i = 0; i < 20; i++) {
      const y = 2.475 - i * 0.0387;
      b.placed(place([0, y, -2.279], 0, 0.6), () =>
        b.beam([x0 + 0.005, -0.0012, -0.03], [x1 - 0.005, 0.0012, 0.03], slat, 0.9, 0.2),
      );
    }
    b.beam([x0 + 0.005, 1.7, -2.3], [x1 - 0.005, 1.722, -2.26], slat);
    for (const x of [x0 + 0.25, x1 - 0.25])
      b.box([x - 0.001, 1.72, -2.281], [x + 0.001, y1 - 0.06, -2.279], [0.4, 0.38, 0.36], 1);
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
      params: [2.3514 / 6, 0, 0, 0],
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
      // The folded corner (+x, -z): the backing, lying back over the pile.
      const fold = 0.3;
      const [cx, cz] = [half, -half];
      const backing: Rgb = [0.3, 0.3, 0.31];
      b.quad(
        [cx - fold, top + 0.002, cz],
        [cx, top + 0.002, cz + fold],
        [cx - fold * 0.45, top + 0.02, cz + fold * 0.55],
        [cx - fold * 0.55, top + 0.02, cz + fold * 0.45],
        backing,
        1,
      );
      b.tri(
        [cx - fold * 0.55, top + 0.02, cz + fold * 0.45],
        [cx - fold * 0.45, top + 0.02, cz + fold * 0.55],
        [cx - fold * 0.9, top + 0.012, cz + fold * 0.9],
        backing,
        1,
      );
    });
  },
};
