import { ART, artUv } from '../art';
import type { Rgb, Vec3 } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { MATERIAL } from '../materials';
import { GROUP, PAGE, type Prop, type PropSink } from './types';

/**
 * The white TV cabinet against the knee wall: a top slab over a carcass with two drawers on the left and two open
 * shelves on the right, on a low plinth. Cream enamel; every face is a chart, so the set's contact shadow, the lamp's
 * pool and the dark of the shelves are baked into it.
 */
const ENAMEL: Rgb = [0.4, 0.345, 0.33];
const INSIDE: Rgb = [0.34, 0.29, 0.275];
const DENSITY = 420;

const X = { front: 2.132, back: 2.676 };
const Z = { left: -1.103, right: 0.656 };
const TOP = { y0: 0.457, y1: 0.486 };

let seed = 0;
const enamel = (color: Rgb = ENAMEL, shade = 1, density = DENSITY): Omit<Chart, 'origin' | 'u' | 'v'> => ({
  page: PAGE.corner,
  group: GROUP.cabinet,
  material: MATERIAL.enamel,
  params: [color[0], color[1], color[2], (seed++ % 16) / 16],
  density,
  shade,
});

export const cabinet: Prop = {
  name: 'tv-cabinet',
  budget: 700,
  build(sink) {
    seed = 0;
    const box = (min: Vec3, max: Vec3, skip: string[] = [], color?: Rgb, shade?: number, density?: number) =>
      sink.chart(...boxCharts(min, max, enamel(color, shade, density), skip));
    // The top slab, overhanging the carcass by a centimetre in front and at the ends.
    box([2.12, TOP.y0, -1.125], [2.69, TOP.y1, 0.675]);
    // Ends, back, bottom board and plinth.
    box([X.front, 0.041, Z.left], [X.back, TOP.y0, Z.left + 0.03], ['+y']);
    box([X.front, 0.041, Z.right - 0.03], [X.back, TOP.y0, Z.right], ['+y']);
    box([X.back - 0.02, 0.041, Z.left + 0.03], [X.back, TOP.y0, Z.right - 0.03], ['+y', '-z', '+z', '+x'], INSIDE);
    box([X.front, 0.041, Z.left + 0.03], [X.back - 0.02, 0.061, Z.right - 0.03], ['-z', '+z', '+x', '-y']);
    box([X.front + 0.03, 0.006, Z.left + 0.02], [X.back - 0.03, 0.041, Z.right - 0.02], ['+y', '-y'], ENAMEL, 0.6, 200);
    // The divider between the drawers and the shelves, and the middle shelf.
    box([X.front, 0.061, -0.249], [X.back - 0.02, TOP.y0, -0.221], ['+y', '-y', '+x']);
    box([X.front + 0.004, 0.211, -0.221], [X.back - 0.02, 0.237, Z.right - 0.03], ['-z', '+z', '+x'], INSIDE);
    // Two drawer fronts, set a few millimetres back, with a shadow gap around each.
    box([X.front + 0.006, 0.237, -1.051 - 0.016], [X.front + 0.024, 0.447, -0.262], ['+x']);
    box([X.front + 0.006, 0.067, -1.051 - 0.016], [X.front + 0.024, 0.229, -0.262], ['+x']);
    // What shows through the gaps: the dark of the carcass behind the fronts.
    box(
      [X.front + 0.03, 0.061, Z.left + 0.03],
      [X.front + 0.032, TOP.y0, -0.249],
      ['+x', '+y', '-y', '-z', '+z'],
      [0.06, 0.055, 0.05],
      0.4,
      120,
    );
    // The floor of each shelf bay, lit only from the front.
    sink.chart({
      ...enamel(INSIDE),
      origin: [X.front, 0.0612, Z.right - 0.03],
      u: [X.back - 0.02 - X.front, 0, 0],
      v: [0, 0, -0.221 - (Z.right - 0.03)],
    });
    cases(sink);
  },
};

/** The three game cases: one lying on the cabinet top in front of the robot, two in the shelves. */
function cases(sink: PropSink): void {
  const body: Rgb = [0.035, 0.04, 0.075];
  const lie = (min: Vec3, max: Vec3, art: readonly [number, number, number, number]) => {
    sink.mesh('props').roundedBox(min, [max[0], max[1] - 0.0004, max[2]], 0.003, body, 1, 1, 2);
    // The printed insert under the sleeve: its bottom edge towards the room (-x), its right towards +z.
    sink.chart({
      page: PAGE.corner,
      group: GROUP.cabinet,
      material: MATERIAL.print,
      params: artUv(art),
      density: 1500,
      shade: 1,
      origin: [min[0] + 0.003, max[1], min[2] + 0.003],
      u: [0, 0, max[2] - min[2] - 0.006],
      v: [max[0] - min[0] - 0.006, 0, 0],
    });
  };
  lie([2.21, 0.486, -0.935], [2.41, 0.5, -0.785], ART.coverEngineer);
  lie([2.215, 0.237, 0.192], [2.405, 0.251, 0.327], ART.coverKingdom);
  lie([2.213, 0.061, 0.25], [2.407, 0.075, 0.39], ART.coverBricks);
}
