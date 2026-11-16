import type { Rgb, Vec3 } from '../kit/builder';
import type { Prop } from './types';

/**
 * The lava lamp on the dresser, where the shipped one stands (room.glb › Imported_lava_*, and the housing baked into
 * 04_Drawer_surfaces): an hourglass foot, a tapered bottle and a cone of a cap, all turned about one upright axis.
 * The foot and cap are a millimetre or two wider than the shipped ones, which they cover for as long as that mesh is drawn.
 */
export const LAVA = {
  /** The axis (x, z) and the dresser's top. */
  x: 0.49,
  z: -1.97,
  floor: 0.887,
  /** The bottle: where its liquid starts and ends, and its outer radius there. */
  bottom: 1.104,
  top: 1.301,
  radius: [0.0635, 0.031] as readonly [number, number],
  /** Everything of the lamp, for whoever asks whether it is in view. */
  bounds: { min: [0.42, 0.887, -2.04], max: [0.56, 1.39, -1.9] } as const,
} as const;

const HEIGHT = LAVA.top - LAVA.bottom;
/** The glass is 2.5 mm thick; the wax stays another millimetre clear of it. */
const WALL = 0.0035;
const inner = (y: number): number => LAVA.radius[0] + (LAVA.radius[1] - LAVA.radius[0]) * (y / HEIGHT) - WALL;

/** Anodised aubergine metal: dark enough that the wax is the only bright thing about the lamp. */
const METAL: Rgb = [0.2, 0.15, 0.2];
const METAL_DARK: Rgb = [0.05, 0.035, 0.05];
const SEGMENTS = 20;

/** `rows` evenly spaced points from `a` to `b` (without `b`), so light baked at the vertices can change along a cone. */
function along(a: readonly [number, number], b: readonly [number, number], rows: number): [number, number][] {
  return Array.from({ length: rows }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / rows, a[1] + ((b[1] - a[1]) * i) / rows]);
}

const ring = (radius: number, y: number): Vec3[] =>
  Array.from({ length: SEGMENTS }, (_, i) => {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    return [LAVA.x + Math.cos(angle) * radius, y, LAVA.z + Math.sin(angle) * radius];
  });

export const lavaLamp: Prop = {
  name: 'lava-lamp',
  budget: 1200,
  build(sink) {
    const b = sink.mesh('props');
    const origin = [LAVA.x, 0, LAVA.z] as const;
    const up = [0, 1, 0] as const;
    // The foot: a wide cone up to a waist with a pressed band, a cup that opens to hold the bottle, its rolled lip.
    b.lathe(
      origin,
      up,
      [
        [0.0695, LAVA.floor],
        [0.0695, LAVA.floor + 0.003],
        ...along([0.0685, LAVA.floor + 0.004], [0.0335, 0.989], 3),
        [0.0335, 0.989],
        [0.0322, 0.9915],
        [0.0322, 0.9965],
        ...along([0.0335, 0.999], [0.0655, 1.1], 3),
        [0.0655, 1.1],
        [0.0662, 1.1025],
        [0.0655, 1.105],
      ],
      SEGMENTS,
      METAL,
    );
    // Inside the cup, down to the bulb's plate: all but dark, the wax's pool sits in it.
    b.loft(ring(0.0655, 1.105), ring(0.054, 1.09), { along: up }, METAL_DARK, 0.5);
    b.cap(ring(0.054, 1.09), up, METAL_DARK, 0.5);
    // The cap: a lip around the bottle's mouth, the cone, a flat crown with a turned edge.
    b.lathe(
      origin,
      up,
      [
        [0.0325, 1.299],
        [0.0346, 1.3],
        [0.0346, 1.3035],
        ...along([0.0339, 1.305], [0.021, 1.3845], 3),
        [0.021, 1.3845],
        [0.0195, 1.388],
      ],
      SEGMENTS,
      METAL,
    );
    b.cap(ring(0.0195, 1.388), up, METAL);
    // The bottle, a thin shell drawn as a film of light (GeneratedRoom gives it its colours): rows for the gradient.
    sink
      .mesh('glass')
      .lathe(
        origin,
        up,
        [...along([LAVA.radius[0], LAVA.bottom], [LAVA.radius[1], LAVA.top], 8), [LAVA.radius[1], LAVA.top]],
        16,
        [1, 1, 1],
      );
  },
};

/**
 * The wax, as a function of time. Blobs ride up and down the bottle's axis on their own slow clocks (none a multiple
 * of another, so the lamp never repeats within a visit), stretched along their way while they move. Each is a soft
 * kernel; the wax's surface is where their sum crosses a threshold, so two that come close grow a neck and become
 * one, and a blob leaving the pool pulls a thread behind it until it snaps. Around the axis the surface is a circle
 * whose centre leans with the blobs' own sideways drift: a lathe with moving rings, {@link WAX}.rings × segments
 * vertices and nothing else to compute.
 */
export const WAX = { rings: 56, segments: 10 } as const;
export const WAX_TRIANGLES = (WAX.rings - 1) * WAX.segments * 2;

interface Blob {
  /** Its radius at rest (m), its trip's period (s) and where in it it starts (0–1). */
  readonly size: number;
  readonly period: number;
  readonly phase: number;
}

const BLOBS: readonly Blob[] = [
  { size: 0.0185, period: 67, phase: 0.42 },
  { size: 0.0145, period: 53, phase: 0.05 },
  { size: 0.012, period: 41, phase: 0.7 },
  { size: 0.0095, period: 31, phase: 0.28 },
  { size: 0.0075, period: 23, phase: 0.87 },
  { size: 0.013, period: 79, phase: 0.58 },
];
const KERNELS = BLOBS.length + 1;
/** The kernel's value on a lone blob's surface. */
const THRESHOLD = Math.exp(-1);
const TAU = Math.PI * 2;

/** One pose of the wax: for every ring its height, its radius and its centre's lean, in the lamp's own frame. */
export interface WaxPose {
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly cx: Float32Array;
  readonly cz: Float32Array;
}

export function createWaxPose(): WaxPose {
  const make = () => new Float32Array(WAX.rings);
  return { y: make(), radius: make(), cx: make(), cz: make() };
}

// Scratch for one pose: each kernel's height, its two half-axes squared and its lean.
const ky = new Float64Array(KERNELS);
const ksy = new Float64Array(KERNELS);
const ksr = new Float64Array(KERNELS);
const kx = new Float64Array(KERNELS);
const kz = new Float64Array(KERNELS);
const weight = new Float64Array(KERNELS);

/** The kernels' sum on the axis at height `y`. */
function onAxis(y: number): number {
  let sum = 0;
  for (let i = 0; i < KERNELS; i++) {
    const d = y - (ky[i] as number);
    sum += Math.exp(-(d * d) / (ksy[i] as number));
  }
  return sum;
}

/** Fills `pose` with the wax at `seconds`. Pure: the same time gives the same wax, on any thread. */
export function poseWax(seconds: number, pose: WaxPose): void {
  // The pool on the bulb's plate: wide, flat, breathing a little.
  const breath = 1 + 0.06 * Math.sin(seconds * 0.23);
  ky[0] = 0.001;
  ksy[0] = (0.015 * breath) ** 2;
  ksr[0] = (0.041 / Math.sqrt(breath)) ** 2;
  kx[0] = 0;
  kz[0] = 0;
  BLOBS.forEach((blob, index) => {
    const i = index + 1;
    const turn = seconds / blob.period + blob.phase;
    // Up a little faster than down: warm wax leaves the pool with more will than cooled wax comes back.
    const phase = TAU * (turn - Math.floor(turn));
    const eased = phase + 0.35 * Math.sin(phase);
    const lift = 0.5 - 0.5 * Math.cos(eased);
    const speed = Math.abs(Math.sin(eased)) * (1 + 0.35 * Math.cos(phase));
    // Stretched along its way while it moves, with the volume kept; a slow wobble of its own on top.
    const stretch = (1 + 0.4 * speed) * (1 + 0.12 * Math.sin(seconds * (0.31 + 0.07 * index) + index * 2.1));
    const tall = blob.size * stretch;
    const wide = blob.size / Math.sqrt(stretch);
    // From inside the pool to under the cap, where it rests against the bottle's narrow end.
    const y = 0.008 + (HEIGHT - blob.size - 0.012) * lift;
    const room = Math.max(0, inner(y) - wide - 0.002) * 0.5;
    ky[i] = y;
    ksy[i] = tall * tall;
    ksr[i] = wide * wide;
    kx[i] = room * lift * Math.sin(seconds * (0.11 + 0.023 * index) + index * 1.7);
    kz[i] = room * lift * Math.cos(seconds * (0.093 + 0.031 * index) + index * 2.9);
  });

  const last = WAX.rings - 1;
  for (let k = 0; k <= last; k++) {
    const y = (HEIGHT * k) / last;
    let sum = 0;
    let x = 0;
    let z = 0;
    // The radius² a kernel would have alone is a floor for the sum's: Newton starts from the largest and climbs.
    let u = 0;
    for (let i = 0; i < KERNELS; i++) {
      const d = y - (ky[i] as number);
      const w = Math.exp(-(d * d) / (ksy[i] as number));
      weight[i] = w;
      sum += w;
      x += w * (kx[i] as number);
      z += w * (kz[i] as number);
      if (w > THRESHOLD) u = Math.max(u, (ksr[i] as number) * Math.log(w / THRESHOLD));
    }
    pose.y[k] = y;
    if (sum <= THRESHOLD) {
      pose.radius[k] = 0;
      pose.cx[k] = 0;
      pose.cz[k] = 0;
      continue;
    }
    for (let step = 0; step < 4; step++) {
      let value = -THRESHOLD;
      let slope = 0;
      for (let i = 0; i < KERNELS; i++) {
        const term = (weight[i] as number) * Math.exp(-u / (ksr[i] as number));
        value += term;
        slope -= term / (ksr[i] as number);
      }
      u -= value / slope;
    }
    const cx = x / sum;
    const cz = z / sum;
    // The glass stops it: wax pressed against the bottle flattens there.
    pose.radius[k] = Math.max(0, Math.min(Math.sqrt(Math.max(u, 0)), inner(y) - Math.hypot(cx, cz)));
    pose.cx[k] = cx;
    pose.cz[k] = cz;
  }
  // A blob ends between two rings: the empty ring next to it moves to the tip, so a blob has a point, not a flat end.
  for (let k = 0; k <= last; k++) {
    if ((pose.radius[k] as number) > 0) continue;
    const below = k > 0 && (pose.radius[k - 1] as number) > 0;
    const above = k < last && (pose.radius[k + 1] as number) > 0;
    if (below === above) continue;
    const from = below ? k - 1 : k + 1;
    let inside = (HEIGHT * from) / last;
    let outside = (HEIGHT * k) / last;
    for (let step = 0; step < 6; step++) {
      const middle = (inside + outside) / 2;
      if (onAxis(middle) > THRESHOLD) inside = middle;
      else outside = middle;
    }
    pose.y[k] = (inside + outside) / 2;
    pose.cx[k] = pose.cx[from] as number;
    pose.cz[k] = pose.cz[from] as number;
  }
}

const COS = Float32Array.from({ length: WAX.segments }, (_, j) => Math.cos((j / WAX.segments) * TAU));
const SIN = Float32Array.from({ length: WAX.segments }, (_, j) => Math.sin((j / WAX.segments) * TAU));

/** Writes a pose's vertices, in the room's coordinates: ring after ring, {@link WAX}.segments each. */
export function waxPositions(pose: WaxPose, out: Float32Array): void {
  let o = 0;
  for (let k = 0; k < WAX.rings; k++) {
    const r = pose.radius[k] as number;
    const x = LAVA.x + (pose.cx[k] as number);
    const y = LAVA.bottom + (pose.y[k] as number);
    const z = LAVA.z + (pose.cz[k] as number);
    for (let j = 0; j < WAX.segments; j++) {
      out[o++] = x + r * (COS[j] as number);
      out[o++] = y;
      out[o++] = z + r * (SIN[j] as number);
    }
  }
}

/** The lathe's triangles, facing outwards: two between every pair of neighbours on neighbouring rings. */
export function waxIndices(): Uint16Array {
  const indices = new Uint16Array(WAX_TRIANGLES * 3);
  let o = 0;
  for (let k = 0; k + 1 < WAX.rings; k++)
    for (let j = 0; j < WAX.segments; j++) {
      const a = k * WAX.segments + j;
      const b = k * WAX.segments + ((j + 1) % WAX.segments);
      const c = a + WAX.segments;
      const d = b + WAX.segments;
      indices.set([a, c, d, a, d, b], o);
      o += 6;
    }
  return indices;
}
