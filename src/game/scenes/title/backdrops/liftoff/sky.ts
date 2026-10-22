import type { Rgba } from '@/engine/gfx/color';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { bandColor } from './bands';
import type { CloudDeck } from './clouds';
import { CLOUD, GROUND, SKY } from './colors';
import { STAGE } from './layout';

/** Ignition light levels the backdrop is painted at: 0 is the plain evening, the last the first frame of the bloom. */
export const LIGHT_LEVELS = 5;

/**
 * The dusk gradient as `[row, ramp position]` keys, top to bottom. Night at
 * the top for the stars; twilight's purple light right behind the logo, a
 * mid tone its dark extrusion and outline read against; and the warm bands
 * crowded low, under the logo and the prompt, so they never fight the
 * orange face.
 */
const DUSK = [
  [0, 0.5],
  [22, 2.8],
  [48, 6],
  [80, 8],
  [120, 9.4],
  [150, 10.6],
  [176, 12.8],
  [199, 15.2],
] as const;
/** The glow is warmest in the middle of the horizon, behind the pad, and fades upwards and to the sides. */
const PAD_GLOW = { strength: 1.3, width: 150, height: 22 } as const;
/** Ground ramp positions on the horizon (distant haze) and at the bottom edge (the dark foreground under the copyright). */
const GROUND_FAR = 5.2;
const GROUND_NEAR = 0.6;
/**
 * The ignition light: how far it reaches from the pad (an ellipse, wider
 * than tall), how sharply it falls off, and how many ramp steps each level
 * adds at the pad, per surface. Cloud undersides catch it best.
 */
const IGNITION = { reach: 360, widen: 1.5, falloff: 1.4, sky: 1.9, cloud: 1.7, ground: 2 } as const;

/**
 * Everything static behind the skyline, once per ignition light level: the
 * dusk gradient, the cloud deck and the dark plain. Level 0 is the plain
 * evening; each level above is the same picture flooded by the ignition,
 * brightest at the pad, a whole number of ramp steps lighter rather than a
 * translucent wash (docs/ART-DIRECTION.md › Title › Liftoff).
 */
export function paintBackdrops(clouds: CloudDeck): Bitmap[] {
  const { width, height } = STAGE;
  // What lies at each pixel is the same at every level; only the light added to it changes.
  const surfaces = Array.from({ length: width * height }, (_, i) =>
    surfaceAt(clouds, i % width, Math.floor(i / width)),
  );
  return Array.from({ length: LIGHT_LEVELS }, (_, level) => {
    const bitmap = new Bitmap(width, height);
    surfaces.forEach(({ ramp, shade, lit }, i) => {
      const x = i % width;
      const y = Math.floor(i / width);
      bitmap.set(x, y, bandColor(ramp, shade + level * lit, x, y));
    });
    return bitmap;
  });
}

/** The dusk sky's ramp position at (x, y), above the horizon. */
export function skyShade(x: number, y: number): number {
  const { horizon, pad } = STAGE;
  const gradient = interpolate(DUSK, y);
  const glow =
    PAD_GLOW.strength *
    Math.exp(-(((x - pad.x) / PAD_GLOW.width) ** 2)) *
    Math.exp(-(horizon - 1 - y) / PAD_GLOW.height);
  return gradient + glow;
}

/** Piecewise-linear lookup in ascending `[x, value]` keys, held flat beyond both ends. */
function interpolate(keys: readonly (readonly [x: number, value: number])[], x: number): number {
  let [x0, v0] = keys[0] ?? [0, 0];
  for (const [x1, v1] of keys) {
    if (x <= x1) return x1 === x0 ? v1 : v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
    [x0, v0] = [x1, v1];
  }
  return v0;
}

/** 1 at the pad, falling to 0 at the edge of the ignition's reach. */
function ignitionReach(x: number, y: number): number {
  const { pad } = STAGE;
  const distance = Math.hypot((x - pad.x) / IGNITION.widen, y - pad.y);
  return Math.max(0, 1 - distance / IGNITION.reach) ** IGNITION.falloff;
}

/** What a pixel of the backdrop shows: a ramp, its position on it, and the ramp steps each ignition level adds there. */
interface Surface {
  readonly ramp: readonly Rgba[];
  readonly shade: number;
  readonly lit: number;
}

function surfaceAt(clouds: CloudDeck, x: number, y: number): Surface {
  const { horizon, height } = STAGE;
  const reach = ignitionReach(x, y);
  if (y >= horizon) {
    const near = (y - horizon) / (height - 1 - horizon);
    const shade = GROUND_NEAR + (GROUND_FAR - GROUND_NEAR) * (1 - near) ** 2.2;
    return { ramp: GROUND, shade, lit: IGNITION.ground * reach };
  }
  const cloud = clouds.shade(x, y);
  if (cloud !== null) return { ramp: CLOUD, shade: cloud, lit: IGNITION.cloud * reach };
  return { ramp: SKY, shade: skyShade(x, y), lit: IGNITION.sky * reach };
}
