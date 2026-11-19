import type { Surface } from './layout';

/*
 * The night on the walls: a small analytic model of the room's light, matched by eye to what the rig (gen/rig.ts) bakes
 * onto the wall beside each sheet, so paper sits in the wall's light and no sheet is a light of its own
 * (docs/ROOM-ART-DIRECTION.md › Posters). In the room's two families: a dim warm fill right of the window, where the
 * lamps' bounce reaches, that turns bluer and darker towards the window's far side, the lava lamp's amber pool under
 * the cluster, and the slope fading from the ridge down. It is multiplied into each island as it is painted, so the
 * cards keep the room's unlit program and cost nothing per frame. The rig itself is not used: it is baked on the GPU
 * into the room's own charts, and the posters are painted in their own worker.
 */
export type Rgb = readonly [number, number, number];

/** The fill right of the window and left of it (the desk's side, in the window's blue). */
const FILL_RIGHT: Rgb = [0.47, 0.42, 0.39];
const FILL_LEFT: Rgb = [0.25, 0.3, 0.4];
/** The slope's fill at the ridge; it falls to SLOPE_FOOT of that at the knee wall. */
const FILL_SLOPE: Rgb = [0.31, 0.265, 0.23];
const SLOPE_FOOT = 0.72;
const SLOPE_LENGTH = 2.32;
/** The lava lamp on the radio's shelf: where its glow is, how far it reaches and what it adds. */
const LAVA = { at: [0.95, 1.12, -2.2], reach: 0.55, color: [0.5, 0.26, 0.08] } as const;

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
