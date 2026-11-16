import { place, type Rgb, type Ring, spline, type Vec3 } from '../kit/builder';
import { seeded } from '../kit/hash';
import { MATERIAL } from '../materials';
import { circle, lerp, mottled, noise3, segments, skin, slab, type Tone, tint, turned } from './form';
import { DESK_TOP } from './monitor';
import { GROUP, PAGE, type PropSink } from './types';

const STONEWARE: Rgb = [0.55, 0.54, 0.5];
const BISCUIT: Rgb = [0.36, 0.2, 0.08];

/**
 * What lies on the desk (each where the shipped room had it): the mouse's mat, a sheet
 * of paper, a mug of coffee with its handle, a cup of pencils behind the books, and a plate of three biscuits.
 */
export function deskThings(sink: PropSink): void {
  const b = sink.mesh('desk');
  const { detail } = sink;
  // The mat under the mouse: foam under blue cloth, its corners rounded.
  slab(
    b,
    [-1, DESK_TOP, -1.685],
    [-0.82, DESK_TOP + 0.0056, -1.465],
    1,
    0.012,
    (p) => mottled([0.03, 0.085, 0.17], p, 0.1, 0.04, 71),
    {
      corner: segments(4, detail, 2),
      cuts: [3, 1, 3],
      ease: 0.0018,
      turns: 1,
      open: -1,
    },
  );
  // A printed sheet, on the desk's own page so the lamp's pool crosses it.
  sink.chart({
    page: PAGE.furniture,
    group: GROUP.desk,
    material: MATERIAL.paper,
    params: [0.74, 0.74, 0.72, 0],
    density: 420,
    shade: 1,
    origin: [-0.775, DESK_TOP + 0.0012, -1.695],
    u: [0.23, 0, 0],
    v: [0, 0, -0.19],
  });

  // The mug: thrown stoneware, a rolled lip, coffee a centimetre down, and a handle to the right.
  const mug: Vec3 = [-0.6204, DESK_TOP, -1.565];
  const glazed: Tone = (point, ring) =>
    tint(mottled(STONEWARE, point, 0.05, 0.015, 72), ring >= 8 ? 0.6 : ring === 0 ? 0.7 : 1);
  turned(
    b,
    mug,
    [0, 1, 0],
    [1, 0, 0],
    [
      [0.033, 0.0002],
      [0.0375, 0.002],
      [0.039, 0.006],
      [0.04, 0.03],
      [0.04, 0.0915],
      [0.0392, 0.0942],
      [0.0378, 0.095],
      [0.0364, 0.0942],
      [0.036, 0.091],
      [0.0356, 0.084],
    ],
    segments(32, detail, 14),
    glazed,
    0,
    0,
    (_, ring) => (ring >= 8 ? 0.6 : 1),
  );
  const coffee: Ring[] = [1, 0.5, 0].map((t) =>
    circle([mug[0], mug[1] + 0.084, mug[2]], [0, 1, 0], [1, 0, 0], 0.0356 * t, segments(16, detail, 10)),
  );
  skin(b, coffee, () => [0.035, 0.016, 0.006], { facing: { along: [0, 1, 0] }, shade: () => 0.7 });
  const handle = spline(
    [
      [mug[0] + 0.038, mug[1] + 0.079, mug[2]],
      [mug[0] + 0.058, mug[1] + 0.08, mug[2]],
      [mug[0] + 0.068, mug[1] + 0.06, mug[2]],
      [mug[0] + 0.064, mug[1] + 0.036, mug[2]],
      [mug[0] + 0.05, mug[1] + 0.022, mug[2]],
      [mug[0] + 0.038, mug[1] + 0.021, mug[2]],
    ],
    segments(4, detail, 2),
  );
  b.tube(handle, 0.0052, segments(8, detail, 5), STONEWARE, 0.9);

  // The pencil cup behind the books: a black can, six pencils leaning in it, each a hexagon with a cut point.
  const cup: Vec3 = [-0.49, DESK_TOP, -2.17];
  turned(
    b,
    cup,
    [0, 1, 0],
    [1, 0, 0],
    [
      [0.04, 0.0002],
      [0.042, 0.002],
      [0.042, 0.1485],
      [0.0412, 0.15],
      [0.0398, 0.1485],
      [0.0398, 0.05],
      [0, 0.05],
    ],
    segments(28, detail, 12),
    (point, ring) => tint(mottled([0.035, 0.036, 0.04], point, 0.15, 0.01, 73), ring >= 4 ? 0.5 : 1),
    0,
    0,
    (_, ring) => (ring >= 4 ? 0.4 : 1),
  );
  const random = seeded(74);
  const paints: readonly Rgb[] = [
    [0.55, 0.36, 0.03],
    [0.4, 0.05, 0.04],
    [0.05, 0.14, 0.3],
    [0.55, 0.36, 0.03],
    [0.06, 0.22, 0.1],
    [0.3, 0.3, 0.3],
  ];
  paints.forEach((paint, i) => {
    const angle = (i / paints.length) * Math.PI * 2 + random();
    const foot: Vec3 = [cup[0] + Math.cos(angle) * 0.02, cup[1] + 0.052, cup[2] + Math.sin(angle) * 0.02];
    const lean = 0.04 + random() * 0.04;
    const top: Vec3 = [
      foot[0] + Math.cos(angle) * lean * 0.9,
      DESK_TOP + lerp(0.2, 0.243, random()),
      foot[2] + Math.sin(angle) * lean * 0.9,
    ];
    const tip = (t: number): Vec3 => [lerp(foot[0], top[0], t), lerp(foot[1], top[1], t), lerp(foot[2], top[2], t)];
    b.cylinder(foot, tip(0.9), 0.0036, 0.0036, 6, paint, 0.8, false);
    b.cylinder(tip(0.9), tip(0.975), 0.0036, 0.0012, 6, [0.5, 0.36, 0.2], 1, false);
    b.cylinder(tip(0.975), top, 0.0012, 0.0002, 6, [0.03, 0.03, 0.035], 1, false);
  });

  // A plate with three biscuits, chocolate in each.
  const plate: Vec3 = [-1.98, DESK_TOP, -1.62];
  turned(
    b,
    plate,
    [0, 1, 0],
    [1, 0, 0],
    [
      [0.06, 0.0002],
      [0.064, 0.0025],
      [0.098, 0.0092],
      [0.105, 0.0118],
      [0.1035, 0.0128],
      [0.096, 0.011],
      [0.066, 0.0052],
      [0.058, 0.0042],
      [0, 0.0042],
    ],
    segments(40, detail, 16),
    (point) => mottled(tint(STONEWARE, 1.08), point, 0.04, 0.03, 75),
  );
  for (const [dx, dz, turn] of [
    [-0.035, 0, 0.3],
    [0.025, -0.027, 1.4],
    [0.024, 0.036, 2.6],
  ] as const) {
    const centre: Vec3 = [plate[0] + dx, plate[1] + 0.0046, plate[2] + dz];
    b.placed(place(centre, turn, 0.04, 0.03), () => {
      // A biscuit is never round: its rim wanders, its top is cracked into low hummocks.
      const around = segments(18, detail, 10);
      const rings: Ring[] = [
        [0.03, 0],
        [0.0335, 0.004],
        [0.033, 0.011],
        [0.027, 0.0165],
        [0.014, 0.0182],
        [0, 0.0186],
      ].map(([radius, height]) =>
        circle([0, height as number, 0], [0, 1, 0], [1, 0, 0], radius as number, around).map((p): Vec3 => {
          const wobble = 1 + 0.07 * (noise3(p[0] * 60 + turn * 9, 0, p[2] * 60, 76) - 0.5) * 2;
          const hummock = (radius as number) < 0.03 ? (noise3(p[0] * 130, turn * 5, p[2] * 130, 77) - 0.5) * 0.0028 : 0;
          return [p[0] * wobble, p[1] + hummock, p[2] * wobble];
        }),
      );
      skin(b, rings, (point) => tint(mottled(BISCUIT, point, 0.22, 0.008, 78), 0.8 + 12 * point[1]), {
        facing: { from: [0, 0.006, 0] },
      });
      const chips = seeded(Math.round(turn * 100));
      const count = detail >= 0.8 ? 6 : 3;
      for (let i = 0; i < count; i++) {
        const [angle, out] = [chips() * Math.PI * 2, 0.006 + chips() * 0.017];
        b.blob([Math.cos(angle) * out, 0.0175, Math.sin(angle) * out], 0.0034, 6, 0.25, i, [0.03, 0.014, 0.008], 0.9);
      }
    });
  }
}

/** A drawer's pull: a lip moulded along the front, to hook fingers under. */
export function pull(sink: PropSink, x0: number, x1: number, y: number, face: number): void {
  const b = sink.mesh('desk');
  const enamel: Tone = (point) => mottled([0.62, 0.6, 0.57], point, 0.04, 0.05, 79);
  // A wedge: full depth along its top, drawn back underneath.
  const sections: Ring[] = [];
  const pieces = segments(6, sink.detail, 3);
  for (let i = 0; i <= pieces; i++) {
    const x = lerp(x0, x1, i / pieces);
    // Its ends run out to nothing, as the shipped pulls' blades do.
    const end = Math.min(1, Math.min(i, pieces - i) / 1.2);
    const out = lerp(0.006, 0.0255, end);
    sections.push([
      [x, y + 0.0166, face],
      [x, y + 0.0166, face + out],
      [x, y + 0.0125, face + out],
      [x, y, face + 0.004 * end],
      [x, y, face],
    ]);
  }
  skin(b, sections, enamel, {
    facing: { from: [(x0 + x1) / 2, y + 0.01, face + 0.008] },
    shade: (p) => (p[1] < y + 0.006 ? 0.6 : 1),
  });
}
