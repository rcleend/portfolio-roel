import { cross, dot, type MeshBuilder, place, type Rgb, sub, type Vec3 } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { MATERIAL } from '../materials';
import { mottled, noise3, skin, slab, type Tone, tint } from './form';
import { FLOOR, GROUP, PAGE, type Prop } from './types';

/** The room: 5.6 m × 4.8 m, 3.28 m high on the left, sloping from x = 0.95 down to a 1.88 m knee wall on the right. */
const ROOM = { x0: -2.8, x1: 2.8, z0: -2.405, z1: 2.4, height: 3.28, ridge: 0.95, knee: 1.88 };
/** The window's opening in the back wall. */
export const WINDOW = { x0: -2.1, x1: -0.5, y0: 1.127, y1: 2.52 };
const DOOR = { x0: -1.4, x1: -0.2, y1: 2.26 };

const WALL: Rgb = [0.15, 0.195, 0.225];
const CEILING: Rgb = [0.36, 0.31, 0.32];
const TRIM: Rgb = [0.46, 0.41, 0.38];
/** The window's layered ivory enamel. */
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
    b.beam([-1.36, 0, 2.423], [-0.24, 2.2, 2.477], [0.4, 0.185, 0.12], 1, 0.3);
    b.beam([-1.437, 0, 2.32], [-1.363, 2.24, 2.4], TRIM, 1, 0.3);
    b.beam([-0.237, 0, 2.32], [-0.163, 2.24, 2.4], TRIM, 1, 0.3);
    b.sphere([-0.35, 1.05, 2.39], 0.034, 14, [0.3, 0.26, 0.16]);
  },
};

/** The window's casing (how wide its boards are, where their face stands) and the height its sashes meet at. */
const CASING = { wide: 0.13, face: -2.318 };
const MEETING = 1.65;
/**
 * The blind, hung on the casing's face in front of the opening: twenty slats 50 mm deep on a 36 mm pitch, tilted open
 * with their room-side edges low, the right end drawn up `skew` higher than the left by an uneven pull on its cords.
 */
const BLIND = { z: -2.279, depth: 0.05, slats: 20, top: 2.462, bottom: 1.775, skew: 0.047, head: 2.492 };
/** The window's aged brass, the blind's clear wand, its cords and the turned wooden pull. */
const BRASS: Rgb = [0.3, 0.22, 0.09];
const BRASS_WORN: Rgb = [0.42, 0.32, 0.14];
const WAND: Rgb = [0.5, 0.5, 0.48];
const CORD: Rgb = [0.5, 0.47, 0.42];
const PULL: Rgb = [0.105, 0.058, 0.032];

/** The height of slat `i`'s middle (0 at the top), `s` of the way along it from its left end. */
const slatHeight = (i: number, s: number): number =>
  BLIND.top - (i * (BLIND.top - BLIND.bottom)) / (BLIND.slats - 1) + (BLIND.skew * i * s) / (BLIND.slats - 1);

/**
 * The window in the back wall (the modelled room's parts and measures): a wide casing with a bead at its inner edge and
 * a band at its outer one under a head board and its cap, a stained sill with a rounded nose over its apron, the jamb
 * with its stops, and two sashes, the lower in front of the upper, meeting at 1.65 m where their fasteners show under
 * the blind. The venetian blind hangs in front of the casing, let two thirds down and drawn up crooked: a head rail and
 * valance, twenty crowned slats tilted open on their ladder cords, a bottom rail, the tilt wand at the left and the lift
 * cords with their wooden pull at the right. Every bar and slat is cut into short lengths so the lamp's pool and the
 * blind's shadows can cross it.
 */
export const windowFrame: Prop = {
  name: 'window',
  budget: 10800,
  build(sink) {
    const b = sink.mesh('props');
    const { detail } = sink;
    const fine = detail >= 0.8;
    const { x0, x1, y0, y1 } = WINDOW;
    const [zOut, wallZ] = [-2.45, ROOM.z0];
    const { wide, face } = CASING;
    const paint: Tone = (point) => mottled(FRAME, point, 0.04, 0.07, 81);
    const stain: Tone = (point) => mottled(SILL, point, 0.12, 0.012, 82);
    /** A painted board with eased edges, cut along its length for the light. */
    const board = (min: Vec3, max: Vec3, axis: 0 | 1 | 2, tone: Tone = paint, ease = 0.003, corner = 1): void => {
      const cuts: [number, number, number] = [1, 1, 1];
      cuts[axis] = Math.max(1, Math.round((max[axis] - min[axis]) / (fine ? 0.14 : 0.3)));
      slab(b, min, max, axis, ease, tone, { corner, cuts, ease, turns: 1 });
    };

    // The casing's legs: a flat board, a bead standing at its inner edge and a band at its outer one.
    for (const side of [-1, 1]) {
      const inner = side < 0 ? x0 : x1;
      const outer = inner + side * wide;
      board([Math.min(inner, outer), y0 - 0.02, wallZ], [Math.max(inner, outer), y1 + 0.004, face], 1, paint, 0.004);
      board(
        [Math.min(inner - side * 0.004, inner + side * 0.016), y0 - 0.016, face - 0.006],
        [Math.max(inner - side * 0.004, inner + side * 0.016), BLIND.head - 0.001, face + 0.008],
        1,
        paint,
        0.005,
      );
      board(
        [Math.min(outer - side * 0.018, outer + side * 0.008), y0 - 0.02, wallZ],
        [Math.max(outer - side * 0.018, outer + side * 0.008), y1 + 0.064, face + 0.012],
        1,
        paint,
        0.005,
      );
    }
    // The head: its board, the bed mould and the cap standing over them.
    board([x0 - wide + 0.016, y1 + 0.002, wallZ], [x1 + wide - 0.016, y1 + 0.066, face + 0.004], 0, paint, 0.004);
    board([x0 - wide - 0.014, y1 + 0.062, wallZ], [x1 + wide + 0.014, y1 + 0.078, face + 0.017], 0, paint, 0.006);
    board([x0 - wide - 0.03, y1 + 0.076, wallZ], [x1 + wide + 0.03, y1 + 0.096, face + 0.032], 0, paint, 0.006);
    // The sill: a stained board with a rounded nose, its horns past the casing, and the apron under it.
    board([x0 - 0.2, y0 - 0.08, -2.43], [x1 + 0.2, y0 - 0.014, -2.19], 0, stain, 0.02, fine ? 3 : 2);
    board([x0 - 0.105, y0 - 0.148, wallZ], [x1 + 0.105, y0 - 0.082, -2.367], 0, paint, 0.006);
    // The jamb: its two sides, its head, and its own sill the lower sash shuts on.
    const jamb = -2.345;
    const [l, r] = [x0 + 0.03, x1 - 0.03];
    board([x0, y0 - 0.016, zOut], [l, y1, jamb], 1);
    board([r, y0 - 0.016, zOut], [x1, y1, jamb], 1);
    board([l, y1 - 0.03, zOut], [r, y1, jamb], 0);
    board([l, y0 - 0.016, zOut], [r, y0 + 0.035, jamb], 0);

    // The sashes, the upper behind and the lower in front: stiles, rails, and a glazing bar down the middle.
    const middle = (x0 + x1) / 2;
    const sash = (low: number, high: number, z: number, lower: boolean): void => {
      const [bottom, top] = lower ? [0.058, 0.036] : [0.036, 0.045];
      board([l, low, z], [l + 0.045, high, z + 0.028], 1);
      board([r - 0.045, low, z], [r, high, z + 0.028], 1);
      board([l + 0.045, low, z], [r - 0.045, low + bottom, z + 0.028], 0);
      board([l + 0.045, high - top, z], [r - 0.045, high, z + 0.028], 0);
      board([middle - 0.016, low + bottom - 0.004, z + 0.003], [middle + 0.016, high - top + 0.004, z + 0.025], 1);
    };
    sash(MEETING - 0.018, y1 - 0.03, -2.425, false);
    sash(y0 + 0.035, MEETING + 0.018, -2.395, true);
    // The stops that keep the lower sash in its run.
    board([l, y0 + 0.035, -2.3665], [l + 0.012, y1 - 0.03, jamb - 0.0005], 1);
    board([r - 0.012, y0 + 0.035, -2.3665], [r, y1 - 0.03, jamb - 0.0005], 1);

    // The blind's head rail on the casing's face, and the valance before it.
    const slat: Rgb = [0.62, 0.6, 0.57];
    const metal: Tone = (point) => mottled(slat, point, 0.03, 0.05, 83);
    const [left, right] = [x0 + 0.005, x1 - 0.005];
    const { z: zc, depth, slats } = BLIND;
    board([x0 - 0.015, BLIND.head, face], [x1 + 0.015, 2.545, -2.247], 0, metal, 0.003);
    board([x0 - 0.03, 2.4895, -2.2465], [x1 + 0.03, 2.5505, -2.235], 0, metal, 0.003);
    // The slats: shallow arches across their depth, lit above and seen from below, no two tilted quite alike.
    const pieces = fine ? 8 : 4;
    // Where a slat is cut along its length: evenly, and closely where the upper sash's glazing bar throws its shadow
    // through the blind (the night's light stands a little right of the window's middle, so the shadow falls a
    // little left of it). A slat's light is its vertices': a shadow a hand wide between cuts 20 cm apart is a blotch.
    const shadow = (x0 + x1) / 2 - 0.0067;
    const cuts = [
      ...Array.from({ length: pieces + 1 }, (_, k) => k / pieces),
      ...(fine ? [-0.05, -0.03, -0.012, 0.026, 0.046] : [-0.042, -0.018, 0.03]).map(
        (offset) => (shadow + offset - left) / (right - left),
      ),
    ].sort((a, b) => a - b);
    const crown = 0.004;
    const pitchOf = (i: number): number => 0.8 + 0.05 * Math.sin(i * 2.4 + 1);
    for (let i = 0; i < slats; i++) {
      const [cp, sp] = [Math.cos(pitchOf(i)), Math.sin(pitchOf(i))];
      const line = (across: number, drop = 0): Vec3[] =>
        cuts.map((s): Vec3 => {
          const [up, out] = [crown * (1 - across * across) - drop, (across * depth) / 2];
          return [left + (right - left) * s, slatHeight(i, s) + up * cp - out * sp, zc + up * sp + out * cp];
        });
      const edge = line(1);
      skin(b, [line(-1), line(0), edge], () => slat, {
        facing: { along: [0, 1, 0] },
        closed: false,
        shade: () => 0.9,
        back: () => tint(slat, 0.82),
      });
      // The rolled edge towards the room: what catches the light along every slat.
      const lip = line(1.04, 0.0024);
      for (let k = 0; k + 1 < cuts.length; k++)
        b.quad(lip[k] as Vec3, lip[k + 1] as Vec3, edge[k + 1] as Vec3, edge[k] as Vec3, slat, 1);
    }
    // The bottom rail under the last slat, hanging as crooked as it does.
    const run = right - left;
    const lean = Math.atan2(BLIND.skew, run);
    b.placed(place([left, slatHeight(slats - 1, 0) - 0.034, zc], 0, 0, lean), () =>
      board([0, -0.013, -0.022], [run / Math.cos(lean), 0.013, 0.022], 0, metal, 0.005),
    );
    // The ladder cords the slats lie in, before and behind them, a rung under every slat.
    for (const x of [x0 + 0.23, x1 - 0.23]) {
      const s = (x - left) / run;
      const foot = slatHeight(slats - 1, s) - 0.021;
      for (const side of [-1, 1]) {
        const z = zc + side * 0.0178;
        b.box([x - 0.0011, foot, z - 0.0006], [x + 0.0011, BLIND.head, z + 0.0006], CORD, 1, ['+y', '-y']);
      }
      if (fine)
        for (let i = 0; i < slats; i++) {
          const [cp, sp] = [Math.cos(pitchOf(i)), Math.sin(pitchOf(i))];
          const y = slatHeight(i, s) - 0.0012;
          b.cylinder(
            [x, y + (sp * depth) / 2, zc - (cp * depth) / 2],
            [x, y - (sp * depth) / 2, zc + (cp * depth) / 2],
            0.0008,
            0.0008,
            3,
            CORD,
            0.9,
            false,
          );
        }
    }
    windowFittings(b, detail);
  },
};

/**
 * What a hand touches at the window. On the lower sash's meeting rail, two cam fasteners: a plate, the keeper's lip,
 * the cam on its pivot and a lever with a knob, turned shut. On its bottom rail's face, two hook lifts. On the blind:
 * the tilt wand, a clear rod hooked under the head rail at the left, and at the right the two lift cords, joined in a
 * turned wooden pull that hangs before the casing. All of it stands clear of the slats, touching nothing else.
 */
function windowFittings(b: MeshBuilder, detail: number): void {
  const { x0, x1, y0 } = WINDOW;
  const fine = detail >= 0.8;
  const round = fine ? 12 : 6;
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

  // The fasteners, on the meeting rail's top (28 mm deep). Each is turned shut: its lever lies along the rail.
  for (const [x, turn] of [
    [x0 + 0.41, 0.42],
    [x1 - 0.41, 0.3],
  ] as const)
    b.placed(place([x, MEETING + 0.018, -2.381]), () => {
      b.roundedBox([-0.027, 0, -0.011], [0.027, 0.0024, 0.011], 0.004, BRASS, 1, 1, 1);
      screw(-0.0215, 0.004, 0.0024);
      screw(0.0215, -0.004, 0.0024);
      // The keeper at the glass side: a lug and the lip the cam turns under.
      b.box([-0.016, 0.0024, -0.011], [0.004, 0.0095, -0.0075], BRASS, 1, ['-y']);
      b.box([-0.016, 0.0068, -0.0075], [0.004, 0.0095, -0.004], BRASS, 0.9, ['-z']);
      // The cam and its pivot.
      const pivot: Vec3 = [-0.006, 0.0024, 0.002];
      b.lathe(
        pivot,
        [0, 1, 0],
        [
          [0.0085, 0],
          [0.0085, 0.0034],
          [0.0075, 0.004],
          [0.0034, 0.004],
          [0.003, 0.0058],
          [0, 0.0062],
        ],
        round,
        BRASS_WORN,
        0.95,
      );
      // The lever: a flat arm from the cam, rising to the knob that stands over the rail's edge.
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
          section(0.002, 0.0034, 0.0062, 0.0086),
          section(0.016, 0.0029, 0.0066, 0.0088),
          section(0.029, 0.0025, 0.0078, 0.0098),
        ],
        BRASS_WORN,
      );
      b.lathe(
        [pivot[0] + dx * 0.03, 0.0086, pivot[2] + dz * 0.03],
        [0, 1, 0],
        [
          [0.0026, 0],
          [0.0022, 0.003],
          [0.0046, 0.0052],
          [0.0056, 0.0085],
          [0.0046, 0.0118],
          [0.0018, 0.0136],
          [0, 0.0138],
        ],
        round,
        BRASS_WORN,
      );
    });

  // The lifts, on the bottom rail's face: a plate, two screws, and a finger hook curling out and down.
  for (const x of [x0 + 0.26, x1 - 0.26])
    b.placed(place([x, y0 + 0.064, -2.367]), () => {
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
          const span = Math.hypot(ny - py, nz - pz);
          // Across the hook's own run: its thickness.
          const [ty, tz] = [(-(nz - pz) / span) * half, ((ny - py) / span) * half];
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

  // The tilt wand: a wire hook out of the head rail's underside, the coupler, and the rod with its grip, hanging a
  // hand's breadth in from the blind's left end, clear of the slats' edges and leaning as it was last let go.
  const front = BLIND.z + 0.0178;
  const wandX = x0 + 0.115;
  const hung: Vec3 = [wandX, BLIND.head, front + 0.0075];
  const top: Vec3 = [wandX, BLIND.head - 0.016, front + 0.008];
  b.cylinder(hung, top, 0.0012, 0.0012, 4, [0.3, 0.3, 0.31], 1, false);
  const foot: Vec3 = [wandX + 0.008, 1.9, front + 0.015];
  const down = (t: number): Vec3 => [
    top[0] + (foot[0] - top[0]) * t,
    top[1] + (foot[1] - top[1]) * t,
    top[2] + (foot[2] - top[2]) * t,
  ];
  b.cylinder(down(0), down(0.035), 0.0048, 0.0048, 6, WAND, 0.9);
  // The rod in lengths, so the light on it can change down the blind.
  const lengths = fine ? 6 : 3;
  for (let i = 0; i < lengths; i++)
    b.cylinder(
      down(0.035 + (0.865 * i) / lengths),
      down(0.035 + (0.865 * (i + 1)) / lengths),
      0.0034,
      0.0034,
      6,
      WAND,
      1,
      false,
    );
  b.lathe(
    down(0.9),
    [foot[0] - top[0], foot[1] - top[1], foot[2] - top[2]],
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

  // The lift cords: out of the head rail past the slats' right ends, down before the casing, and joined in the pull.
  const cordX = x1 - 0.0005;
  const pull: Vec3 = [cordX + 0.003, 1.672, front + 0.004];
  const steps = fine ? 11 : 6;
  for (const side of [-1, 1]) {
    const path: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Apart at the rail, together at the pull, with the kinks of a cord that has been wound round a cleat.
      const apart = side * 0.0045 * (1 - t) ** 0.6;
      const kink = Math.sin(t * Math.PI * 3 + side) * 0.0016 * Math.sin(t * Math.PI);
      path.push([
        cordX + (pull[0] - cordX) * t + apart + kink,
        BLIND.head + (pull[1] - BLIND.head) * t,
        front + 0.001 + (pull[2] - front - 0.001) * t + kink * 0.5,
      ]);
    }
    b.tube(path, 0.0011, 3, CORD, 1, false);
  }
  b.lathe(
    pull,
    [0, -1, 0],
    [
      [0.0018, -0.002],
      [0.0048, 0.003],
      [0.0082, 0.012],
      [0.009, 0.022],
      [0.0082, 0.033],
      [0.0052, 0.042],
      [0.003, 0.045],
      [0, 0.045],
    ],
    round,
    PULL,
  );
}

/** The rug's side, its thickness, and the height of its pile over the room's origin. */
const RUG = 2.3514;
const THICK = 0.021;
const PILE = FLOOR + THICK;
/** A square of the pattern, the backing's jute, and the two yarns seen at the rug's edge. */
const CHECK = RUG / 5;
const JUTE: Rgb = [0.21, 0.195, 0.175];
const NAVY: Rgb = [0.024, 0.04, 0.088];
const IVORY: Rgb = [0.4, 0.37, 0.315];

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
  budget: 15800,
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
      const ridge = (0.018 / broad ** 0.5) * Math.exp(-(((z - ridgeAt) / (0.05 * broad)) ** 2)) * smooth(0.75, 0.1, x);
      const creaseAt = -0.38 + 0.035 * Math.sin(z * 3.1);
      const crease =
        (0.0095 / broad ** 0.5) *
        Math.exp(-(((x - creaseAt) / (0.045 * broad)) ** 2)) *
        smooth(0.05, -0.3, z) *
        smooth(-1.1, -0.75, z);
      const ruck = (cx: number, cz: number, angle: number, pitch: number, reach: number, high: number): number => {
        const along = (x - cx) * Math.cos(angle) + (z - cz) * Math.sin(angle);
        const fall = Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / reach ** 2));
        return (high / broad ** 0.5) * fall * (0.5 + 0.5 * Math.cos((along / (pitch * broad)) * Math.PI * 2));
      };
      const rucks =
        ruck(0.55, 0.62, 0.55, 0.2, 0.3, 0.0135) +
        ruck(-0.55, -0.5, 2.2, 0.22, 0.28, 0.011) +
        ruck(0.35, -0.45, 1.2, 0.24, 0.22, 0.008);
      const slow = 0.0024 * (Math.sin(x * 4.1 + z * 2.3) + Math.sin(z * 5.2 - x * 1.7));
      return calm * (ridge + crease + rucks + slow);
    };
    /** The same in the chart's own terms: 0–1 across it, and metres off its plane. Past the crease it dives away. */
    const height = (s: number, t: number): number => {
      const [x, z] = [(s - 0.5) * RUG, (0.5 - t) * RUG];
      if (past(x, z) > cell * 0.2) return -0.05;
      const rim = Math.min(half - Math.abs(x), half - Math.abs(z));
      // The pile rolls down to the rim: a soft shoulder.
      return lie(x, z) - 0.006 * (1 - smooth(0, 0.045, rim)) ** 2;
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
      // On the rug's own edge a square's number is the last one's, whatever the arithmetic says of the fifth.
      const number = (along: number): number => Math.min(4, Math.max(0, Math.floor(along / CHECK)));
      const square = number(x + half) + number(half - z);
      const [c0, c1, c2] = Math.abs(square) % 2 === 0 ? NAVY : IVORY;
      return [c0 * 0.7, c1 * 0.7, c2 * 0.72];
    };
    // The rim, round the three whole corners from one end of the crease to the other: the pile's shoulder, the cut
    // side, the backing and its foot on the boards. The rim is straight (the relief is calm there), so on the top tier
    // a piece of it spans three cells; a square of the pattern is a whole number of pieces either way.
    const stride = cells % 3 === 0 && Math.round(turned / cell) % 3 === 0 ? 3 : 1;
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
    const whole = (cells - Math.round(turned / cell)) / stride;
    const side = cells / stride;
    run(half - turned, -half, -half, -half, whole, 0, -1);
    run(-half, -half, -half, half, side, -1, 0, 1);
    run(-half, half, half, half, side, 0, 1, 1);
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
      edge(-0.0016, (x, z) => top(x, z) - 0.0032),
      edge(-0.0032, (x, z) => top(x, z) - 0.0062),
      edge(-0.0036, () => FLOOR + 0.0052),
      edge(-0.0026, () => FLOOR + 0.0022),
      edge(-0.0006, () => FLOOR + 0.0003),
    ];
    const backing = tint(JUTE, 0.6);
    /** The strip down to ring `to`: the yarn dimmed by `dim` (or the backing), shaded from `shade[0]` to `shade[1]`. */
    const strip = (to: number, dim: number, shade: readonly [number, number], jute = false): void => {
      const [p, q] = [rings[to - 1] as Vec3[], rings[to] as Vec3[]];
      for (let i = 0; i + 1 < p.length; i++) {
        const [xa, za] = rim[i] as [number, number, number, number];
        const [xb, zb] = rim[i + 1] as [number, number, number, number];
        // One yarn a piece, the one at its middle: a square's edge stays sharp.
        const tone = jute ? backing : tint(yarn((xa + xb) / 2, (za + zb) / 2), dim);
        b.gradient(p[i] as Vec3, q[i] as Vec3, q[i + 1] as Vec3, [tone, tone, tone], [shade[0], shade[1], shade[1]]);
        b.gradient(
          p[i] as Vec3,
          q[i + 1] as Vec3,
          p[i + 1] as Vec3,
          [tone, tone, tone],
          [shade[0], shade[1], shade[0]],
        );
      }
    };
    strip(1, 1, [1, 0.9]);
    strip(2, 0.92, [0.9, 0.78]);
    strip(3, 0.8, [0.78, 0.62]);
    strip(4, 1, [0.62, 0.5], true);
    strip(5, 0.8, [0.5, 0.4], true);
    // Where the rim stops at the crease its section is closed: the cloth's own cut, before it turns up into the roll.
    for (const [index, facing] of [
      [0, at(half, FLOOR, -half)],
      [rim.length - 1, at(half, FLOOR, -half)],
    ] as const) {
      const section = rings.map((ring) => ring[index] as Vec3);
      const [x, z] = rim[index] as [number, number, number, number];
      const inner = at(x, FLOOR + 0.0003, z);
      const tone = tint(yarn(x, z), 0.6);
      for (let k = 0; k + 1 < section.length; k++) {
        const [p, q] = [section[k] as Vec3, section[k + 1] as Vec3];
        const normal = cross(sub(p, inner), sub(q, inner));
        const towards = dot(normal, sub(facing, inner)) > 0;
        b.gradient(inner, towards ? p : q, towards ? q : p, [tone, tone, tone], [0.5, 0.6, 0.6]);
      }
    }

    // The turned corner: the cloth leaves the boards along the crease, rolls over, and lies back on the pile, jute
    // side up. A point of it is `a` along the crease from its middle and `d` round the roll from where it lifts.
    const length = turned * Math.SQRT2;
    const middle: readonly [number, number] = [half - turned / 2, -half + turned / 2];
    /** The cloth's own thickness in the fold. Wool this thick does not crease: it rolls, fullest at its middle. */
    const body = THICK * 0.86;
    const roll = (a: number): number =>
      0.027 + 0.007 * Math.sqrt(Math.min(1, Math.max(0, length / 2 - Math.abs(a)) / 0.12));
    // The corner's point is worn round, and no edge of a rug this old is quite straight.
    const reach = (a: number): number => {
      const straight = length / 2 - Math.abs(a);
      const worn = 0.03 * Math.exp(-Math.abs(a) / 0.06);
      const wavy = 0.004 * Math.sin(a * 21 + 0.5) * Math.min(1, Math.max(0, straight) / 0.06);
      return Math.max(0, straight - worn + wavy);
    };
    const flap = (a: number, d: number, under = 0): Vec3 => {
      const radius = roll(a);
      const arc = Math.PI * radius;
      let [q, y] = [0, 0];
      if (d <= arc) {
        const angle = d / radius;
        // `under` draws the cloth's other face: the same roll, a thickness nearer its middle.
        const rr = radius - under;
        q = rr * Math.sin(angle);
        y = FLOOR + radius - rr * Math.cos(angle);
      } else {
        const lying = d - arc;
        // Heavy cloth: past the roll's crown it comes down in a soft S and lies on the pile, a shallow trough along
        // its middle, its cut edges and its point lifted a little.
        const rest = THICK + body + 0.0015;
        const down = smooth(0, 0.15, lying);
        const settled = Math.min(1, lying / 0.05);
        const edge = Math.exp(-Math.max(0, reach(a) - d) / 0.07);
        const lifted = 0.006 * Math.exp(-Math.max(0, reach(a) - d) / 0.035) * Math.min(1, lying / 0.06);
        const trough = 0.005 * (1 - ((2 * a) / length) ** 2) * down;
        // Its edges wave as a heavy cloth's do, and nothing of it is quite flat.
        const wave = (0.0045 * Math.sin(a * 24 + 1.3) * edge + 0.002 * Math.sin(a * 11 + d * 17)) * settled;
        q = -lying;
        y = FLOOR + rest + (2 * radius - rest) * (1 - down) - trough + lifted + wave - under;
      }
      const x = middle[0] + (a + q) / Math.SQRT2;
      const z = middle[1] + (a - q) / Math.SQRT2;
      return at(x, y, z);
    };
    const [across, round] = sink.detail >= 0.8 ? [32, 28] : [16, 12];
    /** The share of a sheet's rows that go round the roll (a curve wants more of them than the lying cloth), and how
     * far short of the cloth's cut edge a sheet stops: the edge's own rounding is drawn after it. */
    const [turning, shoulder] = [0.6, 0.006];
    /** How much of its rounding the cut edge has here: none where the cloth has only just left the boards. */
    const full = (a: number): number => Math.min(1, reach(a) / 0.035);
    const sheet = (lower: number): Vec3[][] => {
      const rows: Vec3[][] = [];
      for (let j = 0; j <= round; j++) {
        const v = j / round;
        rows.push(
          Array.from({ length: across + 1 }, (_, i) => {
            const a = (i / across - 0.5) * length;
            const far = Math.max(0, reach(a) - shoulder * full(a));
            const arc = Math.min(far, Math.PI * roll(a));
            const d = v < turning ? (v / turning) * arc : arc + ((v - turning) / (1 - turning)) * (far - arc);
            return flap(a, d, lower);
          }),
        );
      }
      return rows;
    };
    /** The backing: jute, uneven as it was woven and worn, darker down in the roll's own shadow. */
    const jute = (point: Vec3): Rgb => {
      const cloth = mottled(JUTE, point, 0.26, 0.05, 91);
      const thread = 0.93 + 0.14 * noise3(point[0] * 260, point[1] * 260, point[2] * 260, 5);
      const low = 0.55 + 0.45 * smooth(FLOOR, FLOOR + 0.02, point[1]);
      return tint(cloth, thread * low);
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
    const lower = sheet(body);
    const pile = tint(NAVY, 0.85);
    paint(lower, (point) => mottled(pile, point, 0.3, 0.02, 92), false, 0.5);
    // The cut edge between them, along the two sides that were the rug's own, rounded as the rim is: the backing
    // turns over its shoulder to the cut side, and the yarn comes up from under it.
    const last = upper.length - 1;
    const ring = (offset: number, inset: number, pileSide: boolean): Vec3[] =>
      Array.from({ length: across + 1 }, (_, i): Vec3 => {
        const a = (i / across - 0.5) * length;
        const under = inset * full(a);
        return flap(a, Math.max(0, reach(a) + offset * full(a)), pileSide ? body - under : under);
      });
    const cut = (high: Vec3[], low: Vec3[], tone: (point: Vec3) => Rgb, shade: readonly [number, number]): void => {
      for (let i = 0; i < across; i++) {
        const [h0, h1, l0, l1] = [high[i] as Vec3, high[i + 1] as Vec3, low[i] as Vec3, low[i + 1] as Vec3];
        const [th0, th1, tl0, tl1] = [tone(h0), tone(h1), tone(l0), tone(l1)];
        // Both ways round: the edge is seen from either side of the corner's point.
        b.gradient(h0, h1, l1, [th0, th1, tl1], [shade[0], shade[0], shade[1]]);
        b.gradient(h0, l1, l0, [th0, tl1, tl0], [shade[0], shade[1], shade[1]]);
        b.gradient(h0, l1, h1, [th0, tl1, th1], [shade[0], shade[1], shade[0]]);
        b.gradient(h0, l0, l1, [th0, tl0, tl1], [shade[0], shade[1], shade[1]]);
      }
    };
    const [over, bulge, below] = [
      ring(-0.0015, 0.0028, false),
      ring(0.002, body * 0.45, false),
      ring(-0.0015, 0.0028, true),
    ];
    const [bound, wool] = [(point: Vec3): Rgb => tint(jute(point), 0.85), tint(NAVY, 0.9)];
    cut(upper[last] as Vec3[], over, jute, [1, 0.92]);
    cut(over, bulge, bound, [0.92, 0.75]);
    cut(bulge, below, () => wool, [0.75, 0.55]);
    cut(below, lower[last] as Vec3[], () => tint(NAVY, 0.8), [0.55, 0.45]);
  },
};
