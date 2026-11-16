import type { Surface } from './layout';

/*
 * The night on the walls. The shipped atlas carried the Blender bake's light on every sheet; here it is a small
 * analytic model matched to that bake by eye and by sampled values (white paper read about (0.62, 0.48, 0.58) of full
 * over the radio and (0.36, 0.28, 0.35) on the slope): a dim mauve fill that turns bluer and darker towards the
 * window's far side, the lava lamp's amber pool under the cluster, and the slope fading from the ridge down. It is
 * multiplied into each island as it is painted, so the cards keep the room's unlit program and cost nothing per frame.
 * The generated room's rig (gen/rig.ts) is not used: it is baked on the GPU into that room's own charts, and its
 * tables live in another lazy chunk.
 */
export type Rgb = readonly [number, number, number];

/** The fill right of the window and left of it (the desk's side, in the window's blue). */
const FILL_RIGHT: Rgb = [0.56, 0.44, 0.54];
const FILL_LEFT: Rgb = [0.3, 0.31, 0.43];
/** The slope's fill at the ridge; it falls to SLOPE_FOOT of that at the knee wall. */
const FILL_SLOPE: Rgb = [0.38, 0.29, 0.37];
const SLOPE_FOOT = 0.72;
const SLOPE_LENGTH = 2.32;
/** The lava lamp on the radio's shelf: where its glow is, how far it reaches and what it adds. */
const LAVA = { at: [0.95, 1.12, -2.2], reach: 0.55, color: [0.5, 0.2, 0.1] } as const;

const smooth = (from: number, to: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** What a white sheet shows at a point of the room (three.js space), as a factor per channel. */
export function nightLight(surface: Surface, [x, y, z]: readonly [number, number, number]): Rgb {
  if (surface === 'slope') {
    // Metres down the slope from the ridge (x = 0.95), along (0.797, -0.603).
    const down = (x - 0.95) / 0.797;
    const fall = 1 - (1 - SLOPE_FOOT) * Math.min(1, Math.max(0, down / SLOPE_LENGTH));
    // The window's side of the slope is a touch cooler.
    const cool = smooth(0.2, -1, z) * 0.06;
    return [FILL_SLOPE[0] * (fall - cool), FILL_SLOPE[1] * fall, FILL_SLOPE[2] * (fall + cool)];
  }
  const right = smooth(-1.6, -0.2, x);
  // Up the wall the fill thins a little: the lamps are low.
  // And under the desk lamp's shade, by the corkboard, less of it arrives.
  const height = (1 - 0.12 * smooth(1.6, 3.2, y)) * (1 - 0.22 * (1 - right) * smooth(2, 1.3, y));
  const d2 = ((x - LAVA.at[0]) ** 2 + (y - LAVA.at[1]) ** 2 + (z - LAVA.at[2]) ** 2) / LAVA.reach ** 2;
  const glow = 1 / (1 + d2 * d2);
  return [0, 1, 2].map(
    (i) =>
      ((FILL_LEFT[i] as number) + ((FILL_RIGHT[i] as number) - (FILL_LEFT[i] as number)) * right) * height +
      (LAVA.color[i] as number) * glow,
  ) as unknown as Rgb;
}
