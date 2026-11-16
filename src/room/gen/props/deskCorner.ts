import { place, type Rgb, type Ring, roundedRect, type Vec3 } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { seeded } from '../kit/hash';
import { MATERIAL } from '../materials';
import { GROUP, PAGE, type Prop } from './types';

const WHITE: Rgb = [0.62, 0.6, 0.57];
const STEEL: Rgb = [0.28, 0.29, 0.3];
const BEIGE: Rgb = [0.6, 0.555, 0.46];
const BEIGE_DARK: Rgb = [0.38, 0.355, 0.3];

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
  budget: 900,
  build(sink) {
    seed = 0;
    const b = sink.mesh('props');
    sink.chart(...boxCharts([-2.225, 0.767, -2.29], [-0.375, 0.785, -1.366], enamel(WHITE, 420)));
    // The drawer unit, its three fronts and their pulls.
    sink.chart(...boxCharts([-1.033, 0.006, -2.265], [-0.414, 0.767, -1.412], enamel(), ['+y']));
    for (const [y0, y1] of [
      [0.041, 0.382],
      [0.4, 0.623],
      [0.639, 0.743],
    ] as const) {
      sink.chart(...boxCharts([-0.992, y0, -1.412], [-0.455, y1, -1.39], enamel(), ['-z']));
      b.beam([-0.8, (y0 + y1) / 2 + 0.03, -1.39], [-0.65, (y0 + y1) / 2 + 0.042, -1.37], STEEL, 1, 0.05);
    }
    // The apron and its drawer, and the frame leg: two posts and a foot.
    sink.chart(...boxCharts([-2.132, 0.613, -2.277], [-1.033, 0.767, -1.421], enamel(), ['+y', '+x']));
    b.beam([-1.7, 0.69, -1.421], [-1.5, 0.702, -1.401], STEEL, 1, 0.05);
    for (const z of [-2.268, -1.465]) b.beam([-2.166, 0.03, z], [-2.126, 0.767, z + 0.04], WHITE);
    b.beam([-2.166, 0.006, -2.268], [-2.126, 0.04, -1.425], WHITE);
    // The mouse mat and three books, lying flat.
    b.box([-0.775, 0.785, -1.885], [-0.545, 0.788, -1.695], [0.03, 0.09, 0.16], 1, ['-y']);
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
    // The mug by the keyboard.
    b.lathe(
      [-0.9, 0.785, -1.93],
      [0, 1, 0],
      [
        [0, 0],
        [0.036, 0],
        [0.04, 0.09],
        [0.035, 0.09],
        [0.033, 0.01],
        [0, 0.01],
      ],
      20,
      [0.5, 0.5, 0.48],
    );
  },
};

/** The swivel chair, facing the desk: a petrol seat and back on a gas lift over a five-armed base on castors. */
export const chair: Prop = {
  name: 'chair',
  budget: 2600,
  build(sink) {
    const b = sink.mesh('props');
    const cloth: Rgb = [0.07, 0.17, 0.24];
    const plastic: Rgb = [0.02, 0.022, 0.026];
    const centre: Vec3 = [-1.28, 0, -0.99];
    b.roundedBox([-1.599, 0.481, -1.27], [-0.959, 0.568, -0.714], 0.04, cloth, 1, 1, 4);
    // The back: a shield, narrow at the lumbar and round at the shoulders, leaning away and turned a little.
    b.placed(place([-1.353, 0, -0.655], -0.178), () => {
      const section = (y: number, half: number, lean: number, depth: number): Ring =>
        roundedRect(-half, half, lean - depth / 2, lean + depth / 2, depth * 0.48, 4).map(([x, z]): Vec3 => [x, y, z]);
      b.skin(
        [
          section(0.648, 0.1, -0.02, 0.05),
          section(0.665, 0.14, -0.018, 0.075),
          section(0.71, 0.205, -0.012, 0.09),
          section(0.77, 0.24, -0.004, 0.095),
          section(0.84, 0.252, 0.006, 0.095),
          section(0.93, 0.255, 0.018, 0.09),
          section(1.0, 0.253, 0.028, 0.085),
          section(1.045, 0.24, 0.034, 0.075),
          section(1.068, 0.215, 0.037, 0.055),
          section(1.076, 0.17, 0.038, 0.03),
        ],
        cloth,
      );
    });
    // The back's spine, the lift and the base.
    b.beam([-1.4, 0.44, -0.72], [-1.3, 0.9, -0.66], plastic, 1, 0.12);
    b.cylinder([centre[0], 0.15, centre[2]], [centre[0], 0.48, centre[2]], 0.03, 0.026, 12, plastic, 1);
    b.cylinder([centre[0], 0.12, centre[2]], [centre[0], 0.2, centre[2]], 0.045, 0.04, 12, plastic, 1);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3;
      const tip: Vec3 = [centre[0] + Math.cos(angle) * 0.3, 0.085, centre[2] + Math.sin(angle) * 0.3];
      b.cylinder([centre[0], 0.13, centre[2]], tip, 0.024, 0.016, 8, plastic, 1);
      b.cylinder(
        [tip[0], 0.006, tip[2] - 0.022],
        [tip[0], 0.006, tip[2] + 0.022],
        0.0001,
        0.0001,
        3,
        plastic,
        1,
        false,
      );
      b.sphere([tip[0], 0.035, tip[2]], 0.03, 10, plastic, 0.8);
    }
  },
};

/** The wire wastepaper basket by the wall and its eighteen crumpled sheets: fifteen inside, three on the floor. */
export const basket: Prop = {
  name: 'basket',
  budget: 4200,
  build(sink) {
    const b = sink.mesh('props');
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
    for (let i = 0; i < 15; i++) {
      const layer = i < 6 ? 0 : i < 12 ? 1 : 2;
      const angle = random() * Math.PI * 2;
      const out = layer === 2 ? random() * 0.04 : 0.03 + random() * 0.06;
      b.blob(
        [centre[0] + Math.cos(angle) * out, 0.07 + layer * 0.055, centre[2] + Math.sin(angle) * out],
        0.042,
        10,
        0.22,
        i,
        paper,
        0.8,
      );
    }
    for (const [x, z, i] of [
      [-2.04, -0.93, 15],
      [-2.3, -0.75, 16],
      [-1.95, -0.6, 17],
    ] as const)
      b.blob([x, 0.042, z], 0.042, 10, 0.22, i, paper);
    // Four printed sheets lying on the boards (room.glb › 02_Desk_surfaces), a chart each so the blind's stripes cross them.
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

/** The tower under the desk and the lamp on it: a beige case with two drive bays, and a jointed arm lamp. */
export const towerAndLamp: Prop = {
  name: 'tower-and-desk-lamp',
  budget: 1500,
  build(sink) {
    const b = sink.mesh('props');
    b.roundedBox([-2.06, 0.036, -2.19], [-1.84, 0.586, -1.77], 0.006, BEIGE, 1, 1, 2);
    b.roundedBox([-2.063, 0.031, -1.779], [-1.837, 0.591, -1.741], 0.008, BEIGE, 1, 2, 2);
    for (const y of [0.466, 0.401]) b.box([-2.04, y, -1.741], [-1.86, y + 0.05, -1.732], BEIGE_DARK, 0.8, ['-z']);
    b.box([-2.025, 0.345, -1.741], [-1.875, 0.377, -1.733], BEIGE_DARK, 0.8, ['-z']);
    b.cylinder([-1.892, 0.3, -1.741], [-1.892, 0.3, -1.735], 0.009, 0.009, 12, BEIGE_DARK, 1);
    // The lamp: a weighted foot, two arms on spring joints and a cone shade tipped down at the desk.
    const metal: Rgb = [0.03, 0.035, 0.05];
    const foot: Vec3 = [-2.085, 0.785, -2.035];
    const elbow: Vec3 = [-2.165, 1.09, -2.035];
    const wrist: Vec3 = [-1.975, 1.235, -2.035];
    const mouth: Vec3 = [-1.945, 1.095, -2.02];
    b.cylinder(foot, [foot[0], 0.81, foot[2]], 0.07, 0.062, 20, metal, 1);
    for (const dz of [-0.012, 0.012]) {
      b.cylinder([foot[0], 0.81, foot[2] + dz], [elbow[0], elbow[1], elbow[2] + dz], 0.005, 0.005, 6, metal, 1);
      b.cylinder([elbow[0], elbow[1], elbow[2] + dz], [wrist[0], wrist[1], wrist[2] + dz], 0.005, 0.005, 6, metal, 1);
    }
    b.sphere(elbow, 0.016, 10, metal);
    b.sphere(wrist, 0.016, 10, metal);
    // The shade: a bell of dark enamelled steel, its mouth down at the desk.
    const down: Vec3 = [mouth[0] - wrist[0], mouth[1] - wrist[1], mouth[2] - wrist[2]];
    b.lathe(
      wrist,
      down,
      [
        [0, 0],
        [0.024, 0],
        [0.05, 0.022],
        [0.072, 0.06],
        [0.083, 0.105],
        [0.086, 0.144],
      ],
      20,
      [0.05, 0.03, 0.035],
    );
    // Inside it, the lit reflector and the bulb just proud of the mouth.
    b.cylinder([mouth[0] - 0.005, mouth[1] + 0.03, mouth[2]], mouth, 0.045, 0.082, 20, [0.9, 0.62, 0.3], 3, false);
    b.sphere([mouth[0], mouth[1] + 0.004, mouth[2]], 0.03, 10, [1, 0.8, 0.5], 3);
  },
};

/**
 * The beige desktop set: the CRT monitor on its swivel foot (its glass keeps the shipped screen's contract), the
 * two-tone keyboard with every key, and the wheel mouse. It faces +z.
 */
export const desktop: Prop = {
  name: 'desktop',
  budget: 4200,
  build(sink) {
    const b = sink.mesh('props');
    const face = -1.662;
    const screen = { x0: -1.518, x1: -1.162, y0: 0.929, y1: 1.213 };
    const axis: Vec3 = [-1.34, 1.06, -1.9];
    const ring = (z: number, x0: number, x1: number, y0: number, y1: number, r: number): Ring =>
      roundedRect(x0, x1, y0, y1, r, 4).map(([x, y]): Vec3 => [x, y, z]);
    const outward = { from: axis };
    // The foot: three stacked discs.
    b.lathe(
      [-1.34, 0.785, -1.86],
      [0, 1, 0],
      [
        [0, 0],
        [0.132, 0],
        [0.139, 0.012],
        [0.139, 0.022],
        [0.1, 0.03],
        [0.07, 0.075],
        [0, 0.075],
      ],
      28,
      BEIGE,
    );
    // The bezel: from the glass's rim forward to the face, then back along the case as it tapers to the tube's neck.
    const lipIn = ring(-1.672, screen.x0, screen.x1, screen.y0, screen.y1, 0.012);
    const lipOut = ring(face, screen.x0 - 0.016, screen.x1 + 0.016, screen.y0 - 0.016, screen.y1 + 0.016, 0.02);
    const faceOut = ring(face, -1.562, -1.118, 0.866, 1.26, 0.022);
    b.loft(lipIn, lipOut, { towards: [-1.34, 1.07, -1.2] }, BEIGE_DARK, 0.7);
    b.loft(lipOut, faceOut, { along: [0, 0, 1] }, BEIGE);
    const rings = [
      ring(face - 0.008, -1.57, -1.11, 0.858, 1.268, 0.028),
      ring(-1.7, -1.57, -1.11, 0.858, 1.268, 0.03),
      ring(-1.76, -1.552, -1.128, 0.872, 1.25, 0.04),
      ring(-2.0, -1.5, -1.18, 0.9, 1.19, 0.05),
      ring(-2.085, -1.45, -1.23, 0.93, 1.15, 0.04),
    ];
    b.loft(faceOut, rings[0] as Ring, outward, BEIGE);
    for (let i = 0; i + 1 < rings.length; i++) b.loft(rings[i] as Ring, rings[i + 1] as Ring, outward, BEIGE);
    b.cap(rings[rings.length - 1] as Ring, [0, 0, -1], BEIGE);
    for (const x of [-1.485, -1.454, -1.423, -1.392, -1.276, -1.246])
      b.box([x - 0.008, 0.874, face], [x + 0.008, 0.886, face + 0.004], BEIGE_DARK, 1, ['-z']);
    // The keyboard: a sloped tray and six rows of keys, the outer blocks in the darker tone.
    const tilt = Math.atan2(0.02, 0.2);
    b.placed(place([-1.345, 0.785, -1.505], 0, tilt), () => {
      b.roundedBox([-0.245, 0, -0.1], [0.245, 0.022, 0.1], 0.006, BEIGE, 1, 1, 2);
      for (let row = 0; row < 6; row++)
        for (let col = 0; col < 23; col++) {
          if (row === 0 && (col === 1 || col === 14 || col === 18)) continue;
          if (col === 15 || col === 19) continue;
          const x = -0.232 + col * 0.0202;
          const z = -0.086 + row * 0.03 + (row === 0 ? -0.004 : 0);
          const edge = col < 1 || col > 13 || row === 0;
          b.box([x, 0.022, z], [x + 0.0165, 0.03, z + 0.0245], edge ? BEIGE_DARK : [0.55, 0.52, 0.45], 1, ['-y']);
        }
    });
    // The mouse.
    b.roundedBox([-0.944, 0.788, -1.626], [-0.876, 0.826, -1.524], 0.016, [0.5, 0.47, 0.4], 1, 2, 3);
    b.cylinder([-0.914, 0.826, -1.604], [-0.906, 0.826, -1.604], 0.007, 0.007, 8, [0.1, 0.1, 0.1], 1);
  },
};
