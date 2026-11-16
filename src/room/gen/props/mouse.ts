import type { Ring, Vec3 } from '../kit/builder';
import { circle, lerp, segments, skin, type Tone, tint } from './form';
import { aged, IVORY, REAR, RECESS, RUBBER } from './monitor';
import type { PropSink } from './types';

/** The mouse's middle on its mat, and the mat's top it stands on. */
const X = -0.91;
const Z = -1.575;
const BASE = 0.7912;
/** Half its length and half its width; the height of the band round its foot and of its back's highest point. */
const LENGTH = 0.051;
const WIDTH = 0.034;
const BAND = 0.0062;
const HEIGHT = 0.0345;
/** Where the buttons begin, forward of the middle (its nose points away from the hand, at the monitor). */
const SHOULDER = 0.008;

/** Half the body's width at `v` forward of its middle: a rounded oblong, a little narrower at the nose. */
const halfWidth = (v: number): number => {
  const t = Math.min(1, Math.abs(v / LENGTH));
  return WIDTH * (1 - t ** 2.5) ** (1 / 2.5) * (1 - Math.max(0, v) * 1.4);
};
/** The back's height over the desk along the spine: highest under the palm, falling long to the nose. */
const spine = (v: number): number => {
  const t = v / LENGTH;
  const peak = -0.2;
  const along = t > peak ? (t - peak) / (1 - peak) : (peak - t) / (1 + peak);
  const fall = t > peak ? (1 - along ** 2.1) ** 0.82 : (1 - along ** 2.7) ** 0.62;
  return BAND + (HEIGHT - BAND) * Math.max(0, fall);
};
/** The back's surface `across` (-1 at the left foot to 1 at the right) at `v`: an arch over the band. */
const back = (across: number, v: number): Vec3 => {
  const angle = ((across + 1) / 2) * Math.PI;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [
    X - halfWidth(v) * Math.sign(c) * Math.abs(c) ** 0.78,
    BASE + BAND + (spine(v) - BAND) * Math.abs(s) ** 0.96,
    Z - v,
  ];
};

/**
 * The mouse: a body lofted along its spine (an arch a section, so its side and its plan are each drawn as a curve),
 * a darker band round its foot under the parting line, two buttons parted by fine seams, and a ribbed rubber wheel in
 * its slot. It stands on its mat and points at the monitor.
 */
export function mouse(sink: PropSink): void {
  const b = sink.mesh('desk');
  const { detail } = sink;
  const rows = segments(26, detail, 12);
  const columns = segments(18, detail, 8) & ~1;
  // Sections crowd towards both ends, where the body turns in.
  const station = (i: number): number => -Math.cos((i / rows) * Math.PI) * LENGTH * 0.9985;
  const body: Tone = (point) => {
    const forward = Z - point[2];
    // The buttons are the same plastic, worn a shade lighter by fingers.
    const worn = forward > SHOULDER ? 1.035 : 1;
    return tint(aged(IVORY, point, 21), worn);
  };
  const rings: Ring[] = [];
  for (let i = 0; i <= rows; i++) {
    const v = station(i);
    rings.push(Array.from({ length: columns + 1 }, (_, j) => back((j / columns) * 2 - 1, v)));
  }
  skin(b, rings, body, { facing: { from: [X, BASE, Z] }, closed: false });
  // The band round the foot, in the rear's warmer plastic, drawn in a little under the parting line.
  const outline = (inset: number, height: number): Ring => {
    const ring: Vec3[] = [];
    for (let i = 0; i <= rows; i++) {
      const v = station(i);
      ring.push([X - Math.max(0, halfWidth(v) - inset), BASE + height, Z - v]);
    }
    for (let i = rows - 1; i > 0; i--) {
      const v = station(i);
      ring.push([X + Math.max(0, halfWidth(v) - inset), BASE + height, Z - v]);
    }
    return ring;
  };
  const band: Tone = (point, ring) => tint(aged(REAR, point, 22), ring === 2 ? 0.55 : ring === 0 ? 0.8 : 1);
  skin(b, [outline(0.0012, 0.0003), outline(0.0004, 0.0016), outline(0.0005, BAND - 0.0006), outline(0, BAND)], band, {
    facing: { from: [X, BASE + BAND / 2, Z] },
    shade: (_, ring) => (ring === 0 ? 0.5 : ring === 2 ? 0.6 : 1),
  });

  // The seams: across the back where the buttons begin, and between the two buttons down to the nose.
  const dark = tint(RECESS, 0.38);
  const lift = 0.00012;
  const strip = (points: readonly Vec3[], half: number, side: Vec3): void => {
    for (let i = 0; i + 1 < points.length; i++) {
      const [p, q] = [points[i] as Vec3, points[i + 1] as Vec3];
      const corners: [Vec3, Vec3, Vec3, Vec3] = [
        [p[0] - side[0] * half, p[1] + lift, p[2] - side[2] * half],
        [p[0] + side[0] * half, p[1] + lift, p[2] + side[2] * half],
        [q[0] + side[0] * half, q[1] + lift, q[2] + side[2] * half],
        [q[0] - side[0] * half, q[1] + lift, q[2] - side[2] * half],
      ];
      skin(
        b,
        [
          [corners[0], corners[1]],
          [corners[3], corners[2]],
        ],
        () => dark,
        { facing: { along: [0, 1, 0] }, closed: false },
      );
    }
  };
  const fine = segments(16, detail, 8);
  strip(
    Array.from({ length: fine + 1 }, (_, i) => back(lerp(-0.86, 0.86, i / fine), SHOULDER)),
    0.00028,
    [0, 0, 1],
  );
  strip(
    Array.from({ length: fine + 1 }, (_, i) => back(0, lerp(SHOULDER, LENGTH * 0.985, i / fine))),
    0.00028,
    [1, 0, 0],
  );

  // The wheel in its slot: a dark well in the back, and a ribbed rubber tyre standing out of it.
  const wheelV = 0.026;
  const hub: Vec3 = [X, BASE + spine(wheelV) - 0.0041, Z - wheelV];
  const slot = (v: number, across: number): Vec3 => {
    const p = back(0, v);
    return [X + across, p[1] + lift * 1.5, p[2]];
  };
  skin(
    b,
    [
      [slot(wheelV - 0.0095, -0.0036), slot(wheelV - 0.0095, 0.0036)],
      [slot(wheelV, -0.0036), slot(wheelV, 0.0036)],
      [slot(wheelV + 0.0095, -0.0036), slot(wheelV + 0.0095, 0.0036)],
    ],
    () => tint(RUBBER, 0.35),
    { facing: { along: [0, 1, 0] }, closed: false },
  );
  const teeth = segments(28, detail, 12) & ~1;
  const tyre = (across: number, radius: number): Ring =>
    circle([hub[0] + across, hub[1], hub[2]], [1, 0, 0], [0, 1, 0], radius, teeth).map((p, i): Vec3 => {
      // Every other point stands a little prouder: the tyre's ribs.
      const rib = i % 2 === 0 ? 1 : 0.94;
      return [p[0], hub[1] + (p[1] - hub[1]) * rib, hub[2] + (p[2] - hub[2]) * rib];
    });
  const rubber: Tone = (_, ring) => tint(RUBBER, ring === 0 || ring === 3 ? 0.8 : 1.25);
  skin(b, [tyre(-0.003, 0.0058), tyre(-0.0024, 0.0071), tyre(0.0024, 0.0071), tyre(0.003, 0.0058)], rubber, {
    facing: { from: hub },
  });
  for (const side of [-1, 1]) {
    const edge = tyre(side * 0.003, 0.0058);
    const centre: Vec3 = [hub[0] + side * 0.003, hub[1], hub[2]];
    skin(b, [edge, edge.map(() => centre)], () => tint(RUBBER, 0.7), { facing: { along: [side, 0, 0] } });
  }
}
