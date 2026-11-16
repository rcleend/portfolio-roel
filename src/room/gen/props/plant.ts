import { add, cross, normalize, type Rgb, scale, sub, type Vec3 } from '../kit/builder';
import { seeded } from '../kit/hash';
import type { Prop } from './types';

/**
 * The desk plant to the right of the set, 21 cm tall: a tapered ivory pot and a dozen broad leaves on arching stems,
 * dark green with a paler midrib and margin. Parametric, so stylised: each leaf is a curved, slightly folded blade
 * grown from a seeded direction (the same plant on every visit).
 */
const POT: Vec3 = [2.256, 0.486, 0.117];
const CERAMIC: Rgb = [0.42, 0.4, 0.37];
const SOIL: Rgb = [0.03, 0.022, 0.016];
const STEM: Rgb = [0.07, 0.11, 0.04];
const LEAF: Rgb = [0.032, 0.058, 0.02];
const MARGIN: Rgb = [0.085, 0.105, 0.04];
const MIDRIB: Rgb = [0.1, 0.12, 0.05];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const plant: Prop = {
  name: 'desk-plant',
  budget: 3400,
  build(sink) {
    const b = sink.mesh('props');
    b.lathe(
      POT,
      [0, 1, 0],
      [
        [0, 0],
        [0.035, 0],
        [0.038, 0.004],
        [0.047, 0.083],
        [0.0465, 0.087],
        [0.043, 0.087],
        [0.042, 0.078],
      ],
      28,
      CERAMIC,
    );
    b.lathe(
      POT,
      [0, 1, 0],
      [
        [0.042, 0.078],
        [0, 0.08],
      ],
      28,
      SOIL,
      0.5,
    );

    const random = seeded(2007);
    const leaves = 17;
    for (let i = 0; i < leaves; i++) {
      // Leaves leave the pot all round, the inner ones steeper and shorter.
      const inner = i % 3 === 0;
      const angle = (i / leaves) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const out: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
      const reach = inner ? 0.035 + random() * 0.02 : 0.06 + random() * 0.035;
      const rise = inner ? 0.085 + random() * 0.03 : 0.045 + random() * 0.045;
      const base: Vec3 = add(POT, [out[0] * 0.012, 0.079, out[2] * 0.012]);
      const tip: Vec3 = add(base, [out[0] * reach, rise, out[2] * reach]);
      const bend: Vec3 = add(base, [out[0] * reach * 0.25, rise * 0.85, out[2] * reach * 0.25]);
      const along = (t: number): Vec3 => {
        const [p, q, r] = [(1 - t) * (1 - t), 2 * t * (1 - t), t * t];
        return [
          p * base[0] + q * bend[0] + r * tip[0],
          p * base[1] + q * bend[1] + r * tip[1],
          p * base[2] + q * bend[2] + r * tip[2],
        ];
      };
      const steps = 4;
      for (let s = 0; s < steps; s++)
        b.cylinder(along(s / steps), along((s + 1) / steps), 0.0022, 0.002, 5, STEM, 0.8, false);

      // The blade: from the stem's end outwards, drooping towards its tip, folded a little along the midrib.
      const length = (inner ? 0.075 : 0.1) + random() * 0.035;
      const width = length * (0.55 + random() * 0.12);
      const droop = 0.25 + random() * 0.5;
      const side = normalize(cross([0, 1, 0], out));
      const rows = 6;
      const columns = 4;
      const point = (r: number, c: number): Vec3 => {
        const t = r / rows;
        const w = (c / columns - 0.5) * 2;
        // An ovate outline, widest a third along, pointed at the tip.
        const half = (width / 2) * Math.sin(Math.PI * t ** 0.75) ** 0.8;
        const forward = length * t;
        const fall = -droop * length * t * t;
        const fold = Math.abs(w) * half * 0.35;
        return add(
          tip,
          add(add(scale(out, forward * Math.cos(droop * t)), [0, fall * 0.6 + fold, 0]), scale(side, w * half)),
        );
      };
      const tone = 0.8 + random() * 0.4;
      const color = (c: number): Rgb => {
        const w = Math.abs(c / columns - 0.5) * 2;
        const body = mix(MIDRIB, LEAF, Math.min(1, w * 3));
        const edged = mix(body, MARGIN, Math.max(0, (w - 0.72) / 0.28) ** 1.5);
        return [edged[0] * tone, edged[1] * tone, edged[2] * tone];
      };
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < columns; c++) {
          const [p00, p01, p10, p11] = [point(r, c), point(r, c + 1), point(r + 1, c), point(r + 1, c + 1)];
          const shade = color(c + 0.5);
          // Both faces: a leaf is seen from above and from below.
          const up = cross(sub(p01, p00), sub(p10, p00))[1] >= 0;
          const front: [Vec3, Vec3, Vec3, Vec3] = up ? [p00, p01, p11, p10] : [p00, p10, p11, p01];
          b.quad(front[0], front[1], front[2], front[3], shade, 1);
          b.quad(front[0], front[3], front[2], front[1], [shade[0] * 0.7, shade[1] * 0.75, shade[2] * 0.7], 0.8);
        }
    }
  },
};
