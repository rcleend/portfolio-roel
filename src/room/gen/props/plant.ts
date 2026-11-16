import { add, cross, normalize, type Rgb, type Ring, scale, type Vec3 } from '../kit/builder';
import { seeded } from '../kit/hash';
import { circle, clamp01, lerp, mix, mottled, noise3, segments, skin, smooth, type Tone, tint, turned } from './form';
import type { Prop } from './types';

/**
 * The desk plant to the right of the set, 21 cm tall (the modelled room's pot and spread): a croton in a straight ivory
 * pot. Sixteen lance-shaped leaves leave a short stem in a spiral, the young ones standing, the old ones arching out
 * and down; each is folded along its midrib, ruffled at its margin, and veined in yellow on dark green, paler
 * underneath. It is grown from a seed, so it is the same plant on every visit, and no leaf reaches the set beside it.
 */
const POT: Vec3 = [2.268, 0.486, 0.121];
/** Nothing of the plant passes this plane: the set's side is 9 mm behind it. */
const SET_SIDE = -0.006;

const CERAMIC: Rgb = [0.5, 0.48, 0.44];
const SOIL: Rgb = [0.03, 0.022, 0.016];
const STEM: Rgb = [0.09, 0.12, 0.04];
const GREEN: Rgb = [0.02, 0.055, 0.018];
const LIME: Rgb = [0.1, 0.2, 0.035];
const VEIN: Rgb = [0.3, 0.27, 0.05];
const BRONZE: Rgb = [0.11, 0.045, 0.022];

export const plant: Prop = {
  name: 'desk-plant',
  budget: 7000,
  build(sink) {
    const b = sink.mesh('props');
    const { detail } = sink;
    const fine = detail >= 0.8;

    // The pot: a foot ring, the straight wall, a rounded lip, and the inside down to the soil.
    const glaze: Tone = (point, ring) => {
      const drip = mottled(CERAMIC, point, 0.05, 0.02, 61);
      return tint(drip, ring <= 1 ? 0.72 : ring >= 9 ? 0.55 : 1);
    };
    turned(
      b,
      POT,
      [0, 1, 0],
      [1, 0, 0],
      [
        [0.04, 0.0002],
        [0.0445, 0.0012],
        [0.046, 0.004],
        [0.0468, 0.012],
        [0.0484, 0.07],
        [0.049, 0.0775],
        [0.0484, 0.0802],
        [0.0468, 0.081],
        [0.0452, 0.0802],
        [0.0446, 0.0775],
        [0.0442, 0.0685],
      ],
      segments(40, detail, 16),
      glaze,
      0,
      0,
      (_, ring) => (ring >= 9 ? 0.5 : 1),
    );
    // The soil, a little heaped and never level.
    const soilRings = segments(4, detail, 2);
    const soilAround = segments(20, detail, 10);
    const soil: Ring[] = [];
    for (let s = 0; s <= soilRings; s++) {
      const t = s / soilRings;
      soil.push(
        circle([POT[0], POT[1] + 0.0685, POT[2]], [0, 1, 0], [1, 0, 0], 0.0442 * (1 - t), soilAround).map((p): Vec3 => {
          const lump = (noise3(p[0] * 260, 0, p[2] * 260, 62) - 0.5) * 0.004 * Math.min(1, t * 3);
          return [p[0], p[1] + 0.004 * t + lump, p[2]];
        }),
      );
    }
    skin(b, soil, (point) => mottled(SOIL, point, 0.35, 0.006, 63), {
      facing: { along: [0, 1, 0] },
      shade: () => 0.55,
    });

    // The stem the leaves leave: short, a little off plumb.
    const crown: Vec3 = [POT[0] + 0.003, POT[1] + 0.0715, POT[2] - 0.002];
    const lean: Vec3 = normalize([0.06, 1, -0.04]);
    b.cylinder(crown, add(crown, scale(lean, 0.034)), 0.0052, 0.0036, segments(8, detail, 5), STEM, 0.6, false);

    const random = seeded(2011);
    const leaves = 16;
    const rows = fine ? 16 : detail >= 0.55 ? 10 : 7;
    const halfColumns = fine ? 2 : 1;
    for (let i = 0; i < leaves; i++) {
      // Oldest first: low on the stem, long, leaning far out; the youngest stand at its tip.
      const age = 1 - i / (leaves - 1);
      const turn = i * 2.39996 + (random() - 0.5) * 0.5;
      const out: Vec3 = [Math.cos(turn), 0, Math.sin(turn)];
      const root = add(crown, scale(lean, 0.004 + 0.03 * (1 - age)));
      let length = lerp(0.062, 0.125, age ** 0.8) * (0.88 + random() * 0.24);
      const tilt = lerp(0.22, 1.12, age ** 1.25) + (random() - 0.5) * 0.2;
      // Never past a little under level: an old leaf lies out over the rim, it does not hang down the pot.
      const droop = Math.min(1.82 - tilt, lerp(0.25, 0.85, age) * (0.8 + random() * 0.5));
      const width = length * lerp(0.34, 0.42, random());
      const twist = (random() - 0.5) * 0.9;
      const ruffle = 5 + random() * 3;
      const phase = random() * 6.28;
      const tone = 0.82 + random() * 0.36;
      const petiole = lerp(0.008, 0.02, age) * (0.8 + random() * 0.4);
      const side = normalize(cross([0, 1, 0], out));
      /** The leaf's run: from the stem along its stalk, then the blade, turning down as it goes. */
      const spine = (reach: number): { points: Vec3[]; tangents: Vec3[] } => {
        const steps = rows * 2;
        const points: Vec3[] = [];
        const tangents: Vec3[] = [];
        let at = root;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const angle = tilt + droop * t ** 1.6;
          const tangent: Vec3 = [out[0] * Math.sin(angle), Math.cos(angle), out[2] * Math.sin(angle)];
          points.push(at);
          tangents.push(tangent);
          at = add(at, scale(tangent, (petiole + reach) / steps));
        }
        return { points, tangents };
      };
      // A leaf that would touch the set beside the plant grows shorter instead.
      for (let attempt = 0; attempt < 6; attempt++) {
        const tip = spine(length).points;
        const nearest = Math.min(...tip.map((p) => p[2])) - width * 0.5 * Math.abs(side[2]);
        if (nearest >= SET_SIDE) break;
        length *= 0.86;
      }
      const run = spine(length);
      const steps = rows * 2;
      const along = (t: number): { at: Vec3; tangent: Vec3 } => {
        const f = clamp01(t) * steps;
        const k = Math.min(steps - 1, Math.floor(f));
        return {
          at: add(
            run.points[k] as Vec3,
            scale(add(run.points[k + 1] as Vec3, scale(run.points[k] as Vec3, -1)), f - k),
          ),
          tangent: run.tangents[k] as Vec3,
        };
      };
      const start = petiole / (petiole + length);
      // The stalk.
      const stalk = Math.max(2, Math.round(rows / 5));
      for (let s = 0; s < stalk; s++)
        b.cylinder(
          along((s / stalk) * start).at,
          along(((s + 1) / stalk) * start).at,
          0.0019,
          0.0017,
          fine ? 5 : 4,
          mix(STEM, LIME, 0.3 * (1 - age)),
          0.7,
          false,
        );

      // The blade, as rings across it from stalk to tip: margin, flank, midrib, flank, margin.
      const columns = halfColumns * 2;
      const blade: Ring[] = [];
      const tones: Rgb[][] = [];
      const base = mix(LIME, GREEN, smooth(0, 0.45, age));
      for (let r = 0; r <= rows; r++) {
        const t = r / rows;
        // Widest two fifths along, drawn out to a point.
        const half = (width / 2) * 2.72 * t ** 0.6 * (1 - t) ** 0.92;
        const ring: Vec3[] = [];
        const ringTones: Rgb[] = [];
        for (let c = 0; c <= columns; c++) {
          const across = (c / columns) * 2 - 1;
          // The veins run forward from the midrib: a flank's vertices stand further along the leaf than its middle's.
          const lead = Math.abs(across) * 0.045;
          const here = along(start + (1 - start) * clamp01(t + lead * (1 - t)));
          const spin = twist * t;
          const sideways = normalize(
            add(scale(side, Math.cos(spin)), scale(cross(here.tangent, side), Math.sin(spin))),
          );
          const up = normalize(cross(sideways, here.tangent));
          // Folded up along the midrib, and ruffled at the margin.
          const fold = Math.abs(across) * half * 0.42;
          const wave = Math.sin(t * ruffle * Math.PI + phase + (across > 0 ? 1.3 : 0)) * half * 0.2 * across * across;
          ring.push(add(here.at, add(scale(sideways, across * half), scale(up, fold + wave))));
          // Yellow along the midrib and out along every other row's veins; bronze creeping in from an old leaf's margin.
          const rib = 1 - Math.min(1, Math.abs(across) * 2.2);
          const veined = r % 2 === 1 ? 0.24 * (1 - Math.abs(across)) ** 0.7 : 0;
          const yellow = clamp01(rib * 0.7 + veined) * (0.4 + 0.4 * (1 - age) + 0.2 * (1 - t));
          const green = mix(base, VEIN, yellow);
          const edge = mix(green, BRONZE, 0.55 * age * smooth(0.45, 1, Math.abs(across)));
          ringTones.push(
            tint(edge, tone * (0.92 + 0.16 * noise3(here.at[0] * 90, here.at[1] * 90, here.at[2] * 90, 64))),
          );
        }
        blade.push(ring);
        tones.push(ringTones);
      }
      // Leaves deep in the plant see less of the room.
      const shelter = (point: Vec3): number =>
        0.45 +
        0.55 * smooth(0.01, 0.09, Math.hypot(point[0] - crown[0], point[2] - crown[2]) + (point[1] - crown[1]) * 0.6);
      skin(b, blade, (_, r, c) => (tones[r] as Rgb[])[c] as Rgb, {
        facing: { along: [out[0] * 0.3, 1, out[2] * 0.3] },
        closed: false,
        shade: shelter,
        // Underneath: paler, duller, the veins standing out less.
        back: (_, r, c) => {
          const top = (tones[r] as Rgb[])[c] as Rgb;
          return mix(tint(top, 0.72), [0.07, 0.1, 0.045], 0.45);
        },
      });
    }
  },
};
