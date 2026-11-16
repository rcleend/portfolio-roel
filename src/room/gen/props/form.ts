import {
  add,
  cross,
  dot,
  type Facing,
  type MeshBuilder,
  normalize,
  type Rgb,
  type Ring,
  scale,
  sub,
  type Vec3,
} from '../kit/builder';
import { hash32 } from '../kit/hash';

/**
 * Forms for the finely made props: skins and patches whose colour is given a vertex at a time (so a tone can change
 * across one surface), outlines with points along their straight sides (so light baked at the vertices can change
 * along a face), and the small arithmetic they share. Everything here adds to a MeshBuilder; nothing is drawn.
 */

/** A colour for a vertex: where it is, and which ring (or row) and point (or column) of its form it is. */
export type Tone = (point: Vec3, ring: number, index: number) => Rgb;

/**
 * Segments for a form at this detail (PropSink.detail): `full` on the top tier, fewer below it, never under `least`.
 * A surface has two directions, so its triangles fall faster than the detail: to a half at 0.6, a third at 0.45.
 */
export const segments = (full: number, detail: number, least = 3): number =>
  Math.max(least, Math.round(full * detail ** 0.75));

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const tint = (a: Rgb, s: number): Rgb => [a[0] * s, a[1] * s, a[2] * s];
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
export const smooth = (a: number, b: number, t: number): number => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Hex sRGB (`d0c8b4`) as linear albedo. */
export function srgb(hex: string): Rgb {
  const channel = (i: number): number => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v < 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(2), channel(4)];
}

const lattice = (x: number, y: number, z: number, seed: number): number =>
  hash32(
    Math.imul(x | 0, 0x9e3779b1) ^ hash32(Math.imul(y | 0, 0x85ebca6b) ^ hash32((z | 0) ^ Math.imul(seed, 0xc2b2ae35))),
  ) / 4294967296;

/** Smooth value noise in space, 0–1: the same at a point on every device (integer hashes, kit/hash.ts). */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const ease = (t: number): number => t * t * (3 - 2 * t);
  const [fx, fy, fz] = [ease(x - ix), ease(y - iy), ease(z - iz)];
  const at = (dx: number, dy: number, dz: number): number => lattice(ix + dx, iy + dy, iz + dz, seed);
  const along = (dy: number, dz: number): number => lerp(at(0, dy, dz), at(1, dy, dz), fx);
  return lerp(lerp(along(0, 0), along(1, 0), fy), lerp(along(0, 1), along(1, 1), fy), fz);
}

/** `color` made uneven: ± `amount` of it in blotches `size` metres across (a moulding's age, a cloth's nap). */
export function mottled(color: Rgb, point: Vec3, amount: number, size: number, seed = 0): Rgb {
  const n = noise3(point[0] / size, point[1] / size, point[2] / size, seed);
  return tint(color, 1 + (n - 0.5) * 2 * amount);
}

/**
 * A rounded rectangle about the origin as (a, b) pairs, counter-clockwise from the middle of its right side's lower
 * corner: `corner` segments an arc, and `edgeA` / `edgeB` segments along the straight sides that run along a and b.
 * Two outlines made with the same three counts match point for point, whatever their sizes.
 */
export function outline(
  halfA: number,
  halfB: number,
  radius: number,
  corner: number,
  edgeA: number,
  edgeB: number,
): [number, number][] {
  const r = Math.max(0, Math.min(radius, halfA, halfB));
  const points: [number, number][] = [];
  const arc = (ca: number, cb: number, start: number): void => {
    for (let i = 0; i <= corner; i++) {
      const angle = start + (i / corner) * (Math.PI / 2);
      points.push([ca + Math.cos(angle) * r, cb + Math.sin(angle) * r]);
    }
  };
  const side = (from: [number, number], to: [number, number], pieces: number): void => {
    for (let i = 1; i < pieces; i++) points.push([lerp(from[0], to[0], i / pieces), lerp(from[1], to[1], i / pieces)]);
  };
  const [a, b] = [halfA - r, halfB - r];
  arc(a, -b, -Math.PI / 2);
  side([halfA, -b], [halfA, b], edgeB);
  arc(a, b, 0);
  side([a, halfB], [-a, halfB], edgeA);
  arc(-a, b, Math.PI / 2);
  side([-halfA, b], [-halfA, -b], edgeB);
  arc(-a, -b, Math.PI);
  side([-a, -halfB], [a, -halfB], edgeA);
  return points;
}

/**
 * A run of numbers (a moulding's sections: width, height, depth, radius...) with its corners eased: each inner
 * section becomes `pieces + 1` sections along a curve that leaves the straight run `radius` before the corner and
 * meets it again `radius` after, distances measured by `span`. `pieces` may differ by section (none: left as it is);
 * `sharp` names sections to leave as they are.
 */
export function eased(
  sections: readonly (readonly number[])[],
  radius: number,
  pieces: number | ((index: number) => number),
  span: (a: readonly number[], b: readonly number[]) => number,
  sharp: readonly number[] = [],
): number[][] {
  const out: number[][] = [];
  const blend = (a: readonly number[], b: readonly number[], t: number): number[] =>
    a.map((value, i) => lerp(value, b[i] as number, t));
  sections.forEach((section, i) => {
    const before = sections[i - 1];
    const after = sections[i + 1];
    const steps = typeof pieces === 'number' ? pieces : pieces(i);
    if (!before || !after || steps < 1 || sharp.includes(i)) {
      out.push([...section]);
      return;
    }
    const [inLength, outLength] = [span(before, section), span(section, after)];
    const reach = Math.min(radius, inLength * 0.45, outLength * 0.45);
    if (reach <= 0) {
      out.push([...section]);
      return;
    }
    const from = blend(section, before, reach / inLength);
    const to = blend(section, after, reach / outLength);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const [p, q, r] = [(1 - t) * (1 - t), 2 * t * (1 - t), t * t];
      out.push(section.map((value, k) => p * (from[k] as number) + q * value + r * (to[k] as number)));
    }
  });
  return out;
}

export interface SkinOptions {
  /** Which way the first band faces; every band after it keeps its side (the skin is one surface). */
  readonly facing: Facing;
  /** Rings are closed loops (the default), or open strips. */
  readonly closed?: boolean;
  /** Occlusion for a vertex (MeshData.shade); 1 where left out. */
  readonly shade?: (point: Vec3, ring: number, index: number) => number;
  /** Also the other side, in `back`'s tones: a sheet seen from both sides (a leaf). */
  readonly back?: Tone;
}

function agreement(a: Vec3, b: Vec3, c: Vec3, facing: Facing): number {
  const normal = cross(sub(b, a), sub(c, a));
  const centre = scale(add(add(a, b), c), 1 / 3);
  const wanted =
    'from' in facing ? sub(centre, facing.from) : 'towards' in facing ? sub(facing.towards, centre) : facing.along;
  return dot(normal, wanted);
}

/**
 * A skin over rings of one length, each vertex in its own tone: one continuous surface, so the side it shows is
 * decided once, on its first band, and kept round every bend after it (into a recess, over a lip, back out).
 */
export function skin(b: MeshBuilder, rings: readonly Ring[], tone: Tone, options: SkinOptions): void {
  if (rings.length < 2) return;
  const { closed = true, shade, back } = options;
  const n = (rings[0] as Ring).length;
  const last = closed ? n : n - 1;
  // The first band that has area decides.
  let sum = 0;
  for (let r = 0; r + 1 < rings.length && Math.abs(sum) < 1e-12; r++) {
    const [p, q] = [rings[r] as Ring, rings[r + 1] as Ring];
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      sum += agreement(p[i] as Vec3, q[i] as Vec3, q[j] as Vec3, options.facing);
      sum += agreement(p[i] as Vec3, q[j] as Vec3, p[j] as Vec3, options.facing);
    }
  }
  const flip = sum < 0;
  const colors = rings.map((ring, r) => ring.map((point, i) => tone(point, r, i)));
  const shades = shade ? rings.map((ring, r) => ring.map((point, i) => shade(point, r, i))) : null;
  const backs = back ? rings.map((ring, r) => ring.map((point, i) => back(point, r, i))) : null;
  const emit = (r0: number, i0: number, r1: number, i1: number, r2: number, i2: number): void => {
    const at = (r: number, i: number): Vec3 => (rings[r] as Ring)[i] as Vec3;
    const of = (table: Rgb[][], r: number, i: number): Rgb => (table[r] as Rgb[])[i] as Rgb;
    const dark = (r: number, i: number): number => (shades ? ((shades[r] as number[])[i] as number) : 1);
    const [a, bb, c] = flip ? [at(r0, i0), at(r2, i2), at(r1, i1)] : [at(r0, i0), at(r1, i1), at(r2, i2)];
    const order: [number, number][] = flip
      ? [
          [r0, i0],
          [r2, i2],
          [r1, i1],
        ]
      : [
          [r0, i0],
          [r1, i1],
          [r2, i2],
        ];
    const paint = order.map(([r, i]) => of(colors, r, i)) as [Rgb, Rgb, Rgb];
    const dim = order.map(([r, i]) => dark(r, i)) as [number, number, number];
    b.gradient(a, bb, c, paint, dim);
    if (backs) {
      const other = [order[0], order[2], order[1]] as [number, number][];
      b.gradient(
        a,
        c,
        bb,
        other.map(([r, i]) => of(backs, r, i)) as [Rgb, Rgb, Rgb],
        other.map(([r, i]) => dark(r, i)) as [number, number, number],
      );
    }
  };
  for (let r = 0; r + 1 < rings.length; r++)
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      emit(r, i, r + 1, i, r + 1, j);
      emit(r, i, r + 1, j, r, j);
    }
}

/** A surface over a grid: `at(u, v)` for u and v from 0 to 1, `nu` × `nv` quads, each vertex in its own tone. */
export function patch(
  b: MeshBuilder,
  nu: number,
  nv: number,
  at: (u: number, v: number) => Vec3,
  tone: Tone,
  options: Omit<SkinOptions, 'closed'>,
): void {
  const rings: Ring[] = [];
  for (let j = 0; j <= nv; j++) rings.push(Array.from({ length: nu + 1 }, (_, i) => at(i / nu, j / nv)));
  skin(b, rings, tone, { ...options, closed: false });
}

/** Closes a loop with rings drawn in towards its middle (`steps` of them): a face light can change across. */
export function lid(b: MeshBuilder, ring: Ring, steps: number, tone: Tone, facing: Facing, dome = 0): void {
  const centre = scale(
    ring.reduce<Vec3>((sum, p) => add(sum, p), [0, 0, 0]),
    1 / ring.length,
  );
  const direction = 'along' in facing ? normalize(facing.along) : ([0, 0, 0] as Vec3);
  const rings: Ring[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // A little crown where `dome` asks: the middle stands proud of the rim.
    const lift = dome * (1 - (1 - t) * (1 - t));
    rings.push(ring.map((p) => add(lerp3(p, centre, t), scale(direction, lift))));
  }
  skin(b, rings, tone, { facing });
}

/** Points of a circle about `centre` in the plane across `axis`, from `side` round towards `axis × side`. */
export function circle(centre: Vec3, axis: Vec3, side: Vec3, radius: number, count: number, squash = 1): Ring {
  const n = normalize(axis);
  const s = normalize(sub(side, scale(n, dot(side, n))));
  const up = cross(n, s);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return add(centre, add(scale(s, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius * squash)));
  });
}

/**
 * A turned part: `profile` is (radius, height) pairs along `axis` from `origin`, its corners eased over `ease` metres,
 * `count` points round. A radius of zero closes an end.
 */
export function turned(
  b: MeshBuilder,
  origin: Vec3,
  axis: Vec3,
  side: Vec3,
  profile: readonly (readonly [number, number])[],
  count: number,
  tone: Tone,
  ease = 0,
  easeSteps = 2,
  shade?: SkinOptions['shade'],
): void {
  const n = normalize(axis);
  const sections =
    ease > 0
      ? eased(profile, ease, easeSteps, (p, q) =>
          Math.hypot((q[0] as number) - (p[0] as number), (q[1] as number) - (p[1] as number)),
        )
      : profile.map((p) => [...p]);
  const rings = sections.map(([radius, height]) =>
    circle(add(origin, scale(n, height as number)), n, side, Math.max(0, radius as number), count),
  );
  // The first band with a slope decides the side: away from the axis at its own height.
  const first = sections.findIndex(
    (s, i) => i + 1 < sections.length && ((s[0] as number) > 0 || ((sections[i + 1] as number[])[0] as number) > 0),
  );
  const s0 = sections[Math.max(0, first)] as number[];
  const s1 = sections[Math.max(0, first) + 1] as number[];
  const flat = Math.abs((s1[1] as number) - (s0[1] as number)) < 1e-9;
  const facing: Facing = flat
    ? { along: scale(n, (s1[0] as number) < (s0[0] as number) ? 1 : -1) }
    : { from: add(origin, scale(n, ((s0[1] as number) + (s1[1] as number)) / 2)) };
  skin(b, rings.slice(Math.max(0, first)), (p, r, i) => tone(p, r + Math.max(0, first), i), { facing, shade });
}

/** A flat face a–b–c–d (round its rim), cut into `nu` × `nv` quads so baked light can change across it, facing `along`. */
export function face(
  b: MeshBuilder,
  corners: readonly [Vec3, Vec3, Vec3, Vec3],
  along: Vec3,
  tone: Tone | Rgb,
  nu = 1,
  nv = 1,
  shade = 1,
): void {
  const [p, q, r, s] = corners;
  const paint: Tone = typeof tone === 'function' ? tone : () => tone;
  patch(b, nu, nv, (u, v) => lerp3(lerp3(p, q, u), lerp3(s, r, u), v), paint, {
    facing: { along },
    shade: shade === 1 ? undefined : () => shade,
  });
}

/**
 * A box with eased edges, every face cut for the light: its outline across `axis` has corners of `radius`, its two
 * ends are rounded over `ease`, and `cuts` says into how many pieces each of its three directions is cut.
 */
export function slab(
  b: MeshBuilder,
  min: Vec3,
  max: Vec3,
  axis: 0 | 1 | 2,
  radius: number,
  tone: Tone,
  options: {
    readonly corner?: number;
    readonly cuts?: readonly [number, number, number];
    readonly ease?: number;
    readonly shade?: SkinOptions['shade'];
    /** Leave an end open: the one at `min` (-1) or at `max` (1) stands against something. */
    readonly open?: -1 | 1;
    /** Pieces an end's quarter turn is made of (2). */
    readonly turns?: number;
  } = {},
): void {
  const { corner = 3, cuts = [1, 1, 1], shade, open, turns = 2 } = options;
  const u = ((axis + 1) % 3) as 0 | 1 | 2;
  const v = ((axis + 2) % 3) as 0 | 1 | 2;
  const [halfU, halfV] = [(max[u] - min[u]) / 2, (max[v] - min[v]) / 2];
  const ease = Math.min(options.ease ?? radius, halfU, halfV, (max[axis] - min[axis]) / 2);
  const run: number[][] = [
    [ease, min[axis]],
    [0, min[axis] + ease],
    [0, max[axis] - ease],
    [ease, max[axis]],
  ];
  const pieces = ease > 0 ? turns : 0;
  const sections: number[][] = [];
  // A quarter turn at each end, then the straight run cut into its pieces.
  const turn = (from: number[], to: number[], rising: boolean): void => {
    for (let s = 0; s <= pieces; s++) {
      const angle = (s / Math.max(1, pieces)) * (Math.PI / 2);
      const [inset, along] = rising
        ? [ease * (1 - Math.sin(angle)), (from[1] as number) + ease * (1 - Math.cos(angle))]
        : [ease * (1 - Math.cos(angle)), (to[1] as number) - ease * (1 - Math.sin(angle))];
      sections.push([inset, along]);
    }
  };
  if (pieces) turn(run[0] as number[], run[1] as number[], true);
  else sections.push([0, min[axis]]);
  const straight = cuts[axis];
  for (let k = 1; k < straight; k++)
    sections.push([0, lerp((run[1] as number[])[1] as number, (run[2] as number[])[1] as number, k / straight)]);
  if (pieces) turn(run[2] as number[], run[3] as number[], false);
  else sections.push([0, max[axis]]);
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const rings = sections.map(
    ([inset, along]): Ring =>
      outline(
        halfU - (inset as number),
        halfV - (inset as number),
        Math.max(radius - (inset as number), radius * 0.25),
        corner,
        cuts[u],
        cuts[v],
      ).map(([p, q]) => {
        const point: [number, number, number] = [0, 0, 0];
        point[axis] = along as number;
        point[u] = centre[u] + p;
        point[v] = centre[v] + q;
        return point;
      }),
  );
  skin(b, rings, tone, { facing: { from: centre }, shade });
  const direction = (sign: number): Vec3 => {
    const d: [number, number, number] = [0, 0, 0];
    d[axis] = sign;
    return d;
  };
  const steps = Math.max(1, Math.min(cuts[u], cuts[v]) > 2 ? 2 : 1);
  if (open !== -1) lid(b, rings[0] as Ring, steps, tone, { along: direction(-1) });
  if (open !== 1) lid(b, rings[rings.length - 1] as Ring, steps, tone, { along: direction(1) });
}
