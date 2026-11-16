import { place, type Rgb, type Ring, spline, type Vec3 } from '../kit/builder';
import { seeded } from '../kit/hash';
import {
  circle,
  clamp01,
  lerp,
  lid,
  mottled,
  noise3,
  segments,
  skin,
  slab,
  smooth,
  type Tone,
  tint,
  turned,
} from './form';
import type { PropSink } from './types';

/** Petrol-blue wool cloth, its piping a shade deeper; the frame's black nylon, and the lift's bright steel. */
const CLOTH: Rgb = [0.062, 0.15, 0.285];
const NYLON: Rgb = [0.022, 0.024, 0.03];
const STEEL: Rgb = [0.3, 0.31, 0.33];

/** Where the seat's middle stands, and how the chair is turned (10.3° off the desk). */
const SEAT: Vec3 = [-1.2846, 0, -1.0034];
const YAW = -0.1798;
/** The column's axis, behind the seat's middle; the seat's underside and top; the casters' circle. */
const COLUMN = 0.07;
const [SEAT_LOW, SEAT_TOP] = [0.4813, 0.568];
const REACH = 0.311;

/** Cloth: a nap that is never one tone, a little paler where it is rubbed (`wear`, 0–1). */
const cloth = (point: Vec3, wear = 0): Rgb => {
  // Only slow unevenness: a nap finer than the mesh would show as specks a vertex wide.
  const nap = 0.93 + 0.14 * noise3(point[0] * 14, point[1] * 14, point[2] * 14, 51);
  return tint(CLOTH, nap * (1 + 0.22 * wear));
};
const nylon: Tone = (point) => mottled(NYLON, point, 0.12, 0.01, 53);

/** A rounded oblong (a superellipse) as (x, z) pairs: half its width, its reach to the front (-z) and to the back. */
function oblong(halfX: number, front: number, back: number, power: number, count: number): [number, number][] {
  return Array.from({ length: count }, (_, i): [number, number] => {
    const angle = (i / count) * Math.PI * 2;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    return [
      Math.sign(c) * Math.abs(c) ** (2 / power) * halfX,
      Math.sign(s) * Math.abs(s) ** (2 / power) * (s < 0 ? front : back),
    ];
  });
}

/**
 * The swivel chair, turned a little from the desk (the modelled room's measurements): a cloth seat with a soft rolled
 * edge and piping on a black pan, a shield-shaped back on a flared stem, the mechanism with its two levers, a
 * telescoping lift over its steel piston, and a five-star base on twin-wheel casters.
 */
export function swivelChair(sink: PropSink): void {
  const b = sink.mesh('desk');
  const { detail } = sink;
  const fine = detail >= 0.8;
  b.placed(place(SEAT, YAW), () => {
    // The seat: rings from the pan's middle out and up over the roll to the crown.
    const around = segments(44, detail, 20);
    const seatRing = (inset: number, y: number): Ring =>
      oblong(0.32 - inset, 0.2443 - inset, 0.2659 - inset, 3.3, around).map(([x, z]): Vec3 => [x, y, z]);
    // Inset from the outline and height: the pan, the roll, the top's edge.
    const profile: readonly (readonly [number, number, number])[] = [
      [0.07, SEAT_LOW, 0],
      [0.022, SEAT_LOW + 0.0012, 0],
      [0.01, SEAT_LOW + 0.007, 0],
      [0.008, SEAT_LOW + 0.0165, 0],
      [0.0072, SEAT_LOW + 0.0178, 1],
      [0.0015, SEAT_LOW + 0.03, 1],
      [0, SEAT_LOW + 0.045, 1],
      [0.003, SEAT_LOW + 0.06, 1],
      [0.011, SEAT_LOW + 0.0725, 1],
      [0.024, SEAT_LOW + 0.0812, 1],
      [0.044, SEAT_LOW + 0.0858, 1],
      [0.075, SEAT_TOP, 1],
    ];
    const seat = profile.map(([inset, y]) => seatRing(inset, y));
    const seatTone: Tone = (point, ring) => {
      if (((profile[ring] as readonly number[])[2] as number) === 0) return nylon(point, 0, 0);
      // Rubbed along the front edge, where legs go over it.
      const front = smooth(-0.12, -0.23, point[2]) * smooth(SEAT_LOW + 0.04, SEAT_TOP, point[1]);
      return cloth(point, front);
    };
    skin(b, seat, seatTone, { facing: { along: [0, -1, 0] }, shade: (_, ring) => (ring < 4 ? 0.45 : 1) });
    lid(b, seat[0] as Ring, 2, nylon, { along: [0, -1, 0] });
    // The top, sat in: a shallow dip towards the back of the middle.
    const crown = seat[seat.length - 1] as Ring;
    const steps = segments(8, detail, 3);
    const top: Ring[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      top.push(
        crown.map((p): Vec3 => {
          const [x, z] = [p[0] * (1 - t), p[2] * (1 - t) + 0.03 * t];
          return [x, SEAT_TOP - 0.0075 * (1 - (1 - t) ** 2), z];
        }),
      );
    }
    skin(b, top, (point) => cloth(point, 0.5 * (1 - clamp01(Math.hypot(point[0], point[2] - 0.03) / 0.2))), {
      facing: { along: [0, 1, 0] },
    });
    // The piping, sewn round the top's edge.
    if (fine) {
      const welt = seatRing(0.036, SEAT_TOP - 0.0024);
      b.tube([...welt, welt[0] as Vec3, welt[1] as Vec3], 0.0024, 4, tint(CLOTH, 0.62), 0.8, false);
    }

    // The back: a shield, leaning away, its face a soft pillow and its rim rolled, on rings from the rear to the front.
    const lean = 0.148;
    const backAt = (x: number, up: number, out: number): Vec3 => [
      x,
      0.8625 + up * Math.cos(lean) + out * Math.sin(lean),
      0.371 + up * Math.sin(lean) - out * Math.cos(lean),
    ];
    const shield = (inset: number): [number, number][] =>
      Array.from({ length: around }, (_, i): [number, number] => {
        const angle = (i / around) * Math.PI * 2;
        const [c, s] = [Math.cos(angle), Math.sin(angle)];
        // Squarer shoulders than hips, and drawn in towards the bottom.
        const power = s > 0 ? 4.2 : 2.7;
        const y = Math.sign(s) * Math.abs(s) ** (2 / power) * (0.2125 - inset);
        const narrow = 1 - 0.2 * clamp01(-y / 0.2125) ** 1.6;
        return [Math.sign(c) * Math.abs(c) ** (2 / power) * (0.2545 - inset) * narrow, y];
      });
    const backProfile: readonly (readonly [number, number])[] = [
      [0.07, -0.024],
      [0.03, -0.0262],
      [0.013, -0.022],
      [0.004, -0.012],
      [0, 0.002],
      [0.004, 0.016],
      [0.014, 0.028],
      [0.032, 0.036],
      [0.062, 0.0395],
    ];
    const back = backProfile.map(([inset, out]) => shield(inset).map(([x, y]) => backAt(x, y, out)));
    const backTone: Tone = (point) => cloth(point);
    skin(b, back, backTone, { facing: { along: [0, 0, 1] } });
    lid(b, back[0] as Ring, 2, backTone, { along: [0, 0.15, 1] });
    // The face: fuller across the small of the back.
    const pillow: Ring[] = [];
    const rim = shield(0.062);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      pillow.push(
        rim.map(([x, y]): Vec3 => {
          const swell = 0.0395 + 0.011 * (1 - (1 - t) ** 2) * (1 + 0.5 * smooth(0.1, -0.1, y * (1 - t)));
          return backAt(x * (1 - t), y * (1 - t) - 0.02 * t, swell);
        }),
      );
    }
    skin(b, pillow, (point) => cloth(point, 0.35 * smooth(0.12, 0, Math.abs(point[0]))), {
      facing: { along: [0, 0, -1] },
    });
    if (fine) {
      const welt = shield(0.046).map(([x, y]) => backAt(x, y, 0.0372));
      b.tube([...welt, welt[0] as Vec3, welt[1] as Vec3], 0.0022, 4, tint(CLOTH, 0.62), 0.8, false);
    }

    // The stem: a flat blade from under the seat, round a bend and up the back, waisted like a vase.
    const stations = segments(26, detail, 12);
    const path = spline(
      [
        [0, 0.471, 0.02],
        [0, 0.471, 0.2],
        [0, 0.472, 0.262],
        [0, 0.486, 0.298],
        [0, 0.53, 0.313],
        [0, 0.62, 0.329],
        [0, 0.76, 0.352],
        [0, 0.905, 0.376],
      ],
      Math.max(2, Math.round(stations / 7)),
    );
    const width = (y: number, z: number): number => {
      if (z < 0.262) return 0.065;
      if (y < 0.5) return lerp(0.065, 0.09, smooth(0.472, 0.5, y));
      if (y < 0.6) return lerp(0.09, 0.036, smooth(0.5, 0.585, y));
      return lerp(0.036, 0.105, smooth(0.6, 0.8, y)) * (1 - 0.5 * smooth(0.885, 0.905, y) ** 2);
    };
    const blade: Ring[] = path.map((p, i): Ring => {
      const [before, after] = [path[Math.max(0, i - 1)] as Vec3, path[Math.min(path.length - 1, i + 1)] as Vec3];
      const [ty, tz] = [after[1] - before[1], after[2] - before[2]];
      const l = Math.hypot(ty, tz) || 1;
      // Its thickness is across its own run: out behind, in towards the cushions.
      const [ny, nz] = [-tz / l, ty / l];
      const half = width(p[1], p[2]);
      const thick = 0.0065;
      const edge = 0.004;
      return [
        [-half, p[1] + ny * thick, p[2] + nz * thick],
        [-half - edge, p[1], p[2]],
        [-half, p[1] - ny * thick, p[2] - nz * thick],
        [half, p[1] - ny * thick, p[2] - nz * thick],
        [half + edge, p[1], p[2]],
        [half, p[1] + ny * thick, p[2] + nz * thick],
      ];
    });
    skin(b, blade, nylon, { facing: { from: [0, 0.47, 0.1] } });
    lid(b, blade[blade.length - 1] as Ring, 1, nylon, { along: [0, 1, 0.2] });
    // Two screw bosses fix the back to it, and a knob sets its height.
    for (const y of [0.78, 0.86]) {
      const at: Vec3 = [0, y, lerp(0.352, 0.376, (y - 0.76) / 0.145) + 0.0065];
      turned(
        b,
        at,
        [0, -0.15, 1],
        [1, 0, 0],
        [
          [0.011, 0],
          [0.011, 0.003],
          [0.007, 0.0045],
          [0, 0.0048],
        ],
        segments(10, detail, 6),
        (p) => tint(nylon(p, 0, 0), 1.5),
      );
    }
    turned(
      b,
      [0, 0.6, 0.3325],
      [0, -0.16, 1],
      [1, 0, 0],
      [
        [0.006, 0],
        [0.006, 0.012],
        [0.017, 0.013],
        [0.019, 0.02],
        [0.017, 0.027],
        [0, 0.0285],
      ],
      segments(14, detail, 8),
      (p) => tint(nylon(p, 0, 0), 1.35),
    );

    // The mechanism under the seat: its plate and housing, and the two levers on the right.
    slab(b, [-0.12, 0.4655, -0.19], [0.12, SEAT_LOW + 0.002, 0.2], 1, 0.02, nylon, {
      corner: 2,
      ease: 0.003,
      turns: 1,
    });
    slab(b, [-0.075, 0.432, COLUMN - 0.085], [0.075, 0.4665, COLUMN + 0.075], 1, 0.016, nylon, {
      corner: 2,
      ease: 0.006,
      turns: 1,
    });
    for (const [z, droop] of [
      [COLUMN - 0.045, 0.012],
      [COLUMN + 0.035, 0.02],
    ] as const) {
      b.cylinder(
        [0.07, 0.452, z],
        [0.262, 0.452 - droop, z + 0.012],
        0.0045,
        0.0042,
        segments(8, detail, 5),
        STEEL,
        0.7,
        false,
      );
      b.placed(place([0.262, 0.452 - droop, z + 0.012], 0.06, 0, -droop / 0.19), () =>
        slab(b, [0, -0.0048, -0.0165], [0.062, 0.0048, 0.0165], 0, 0.0045, nylon, { corner: 2, ease: 0.003, turns: 1 }),
      );
    }

    // The lift: the piston's bright steel shows between three telescoping sleeves, down into the hub.
    const liftTone: Tone = (point, ring) =>
      ring >= 13 && ring <= 14 ? mottled(STEEL, point, 0.1, 0.01, 54) : nylon(point, 0, 0);
    turned(
      b,
      [0, 0, COLUMN],
      [0, 1, 0],
      [1, 0, 0],
      [
        [0.05, 0.098],
        [0.056, 0.104],
        [0.056, 0.168],
        [0.05, 0.183],
        [0.036, 0.19],
        [0.036, 0.262],
        [0.0385, 0.264],
        [0.0385, 0.27],
        [0.0318, 0.2715],
        [0.0318, 0.33],
        [0.034, 0.332],
        [0.034, 0.3375],
        [0.0262, 0.339],
        [0.0262, 0.3675],
        [0.0262, 0.385],
        [0.045, 0.39],
        [0.045, 0.433],
      ],
      segments(22, detail, 10),
      liftTone,
    );
    lid(b, circle([0, 0.098, COLUMN], [0, 1, 0], [1, 0, 0], 0.05, segments(22, detail, 10)), 1, nylon, {
      along: [0, -1, 0],
    });

    // The five arms, each a tapered rib curving down to its caster, and the casters, each turned its own way.
    const random = seeded(77);
    for (let i = 0; i < 5; i++) {
      const angle = 1.196 - YAW - (i * Math.PI * 2) / 5;
      const out: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
      const side: Vec3 = [-out[2], 0, out[0]];
      const stationsArm = segments(7, detail, 3);
      const arm: Ring[] = [];
      for (let s = 0; s <= stationsArm; s++) {
        const t = s / stationsArm;
        const r = lerp(0.04, REACH + 0.012, t);
        const y = lerp(0.158, 0.079, t ** 1.7);
        const half = lerp(0.021, 0.0125, t);
        const deep = lerp(0.024, 0.011, t);
        const centre: Vec3 = [out[0] * r, y, COLUMN + out[2] * r];
        const at = (across: number, down: number): Vec3 => [
          centre[0] + side[0] * across,
          y - down,
          centre[2] + side[2] * across,
        ];
        // A rib: a rounded back, flat flanks, an open channel underneath closed by its floor.
        arm.push([
          at(-half, deep),
          at(-half, 0.006),
          at(-half * 0.55, 0),
          at(half * 0.55, 0),
          at(half, 0.006),
          at(half, deep),
        ]);
      }
      skin(b, arm, (p) => tint(nylon(p, 0, 0), p[1] > 0.1 ? 1.25 : 1), {
        facing: { from: [out[0] * 0.15, 0.05, COLUMN + out[2] * 0.15] },
      });
      lid(b, arm[arm.length - 1] as Ring, 1, nylon, { along: out });
      const tip: Vec3 = [out[0] * REACH, 0, COLUMN + out[2] * REACH];
      caster(sink, tip, random() * Math.PI * 2);
    }
  });
}

/** A twin-wheel caster under an arm's tip at `foot` (on the floor), trailing along `turn`. */
function caster(sink: PropSink, foot: Vec3, turn: number): void {
  const b = sink.mesh('desk');
  const { detail } = sink;
  const floor = 0.006;
  // The swivel pin up into the arm.
  b.cylinder(
    [foot[0], 0.052, foot[2]],
    [foot[0], 0.082, foot[2]],
    0.0058,
    0.0058,
    segments(8, detail, 5),
    STEEL,
    0.6,
    false,
  );
  b.placed(place([foot[0], 0, foot[2]], turn), () => {
    const axle: Vec3 = [0, floor + 0.0265, -0.017];
    const round = segments(14, detail, 8);
    // The hood between the wheels, over the axle.
    const hood: Ring[] = [];
    const arc = segments(7, detail, 4);
    for (const x of [-0.0052, 0.0052])
      hood.push(
        Array.from({ length: arc + 1 }, (_, i): Vec3 => {
          const angle = lerp(-0.35, Math.PI * 0.95, i / arc);
          return [x, axle[1] + Math.sin(angle) * 0.0305, axle[2] + Math.cos(angle) * 0.0305];
        }),
      );
    skin(b, hood, nylon, { facing: { from: axle }, closed: false });
    for (const side of [-1, 1]) {
      const ring = hood[side < 0 ? 0 : 1] as Ring;
      skin(b, [ring, ring.map(() => [side * 0.0052, axle[1], axle[2]] as Vec3)], nylon, {
        facing: { along: [side, 0, 0] },
        closed: false,
      });
      // A wheel: a tyre with an eased tread, a dished hub.
      turned(
        b,
        [side * 0.0058, axle[1], axle[2]],
        [side, 0, 0],
        [0, 1, 0],
        [
          [0.0262, 0],
          [0.0265, 0.0035],
          [0.0265, 0.0092],
          [0.0238, 0.0118],
          [0.012, 0.0112],
          [0.009, 0.0128],
          [0, 0.013],
        ],
        round,
        (p, r) => tint(nylon(p, 0, 0), r >= 4 ? 1.6 : 1.1),
      );
    }
  });
}
