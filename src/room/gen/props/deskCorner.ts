import { place, type Rgb, type Vec3 } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { seeded } from '../kit/hash';
import { MATERIAL } from '../materials';
import { swivelChair } from './chair';
import { deskLamp } from './deskLamp';
import { deskThings, pull } from './deskThings';
import { keyboard } from './keyboard';
import { monitor } from './monitor';
import { mouse } from './mouse';
import { tower } from './tower';
import { GROUP, PAGE, type Prop } from './types';
import { wireBasket } from './wireBasket';

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

/** The swivel chair at the desk (chair.ts). */
export const chair: Prop = {
  name: 'chair',
  budget: 8000,
  build(sink) {
    swivelChair(sink);
  },
};

/** The wire wastepaper basket by the wall (wireBasket.ts) and its eighteen crumpled sheets (fifteen inside, three on the floor) and one flat sheet beside it. */
export const basket: Prop = {
  name: 'basket',
  budget: 6600,
  build(sink) {
    const b = sink.mesh('desk');
    const paper: Rgb = [0.3, 0.3, 0.29];
    const centre: Vec3 = [-2.47, 0.006, -1.48];
    wireBasket(b, centre, sink.detail);
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
      b.blob([x, 0.05, z], 0.042, 10, 0.22, i, paper);
    // One printed sheet lying on the boards by the basket (the room had four; the three further off are gone), a chart each so the blind's stripes cross them.
    for (const [x, z] of [[-2.41, -0.97]] as const)
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
