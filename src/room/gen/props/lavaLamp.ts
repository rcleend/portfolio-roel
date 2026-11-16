import type { Rgb, Vec3 } from '../kit/vec';
import { LAVA } from './lavaWax';
import type { Prop } from './types';

/**
 * The lava lamp on the dresser: an hourglass foot, a tapered bottle and a cone of a cap, all turned about one upright
 * axis. Its measurements and its wax, which the room's main thread moves (LavaWax.ts), are props/lavaWax.ts: a module
 * the room's chunk reads must not carry a generator.
 */
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
