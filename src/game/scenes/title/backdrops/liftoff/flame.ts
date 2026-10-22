import type { Gfx } from '@/engine/gfx/Gfx';
import { hash2 } from '../../../../art/logos/raster/noise';
import { FLAME } from './colors';

/** Half-width of a slow flame at its bulge, just below the nozzle. */
const BULGE = 3.4;
/** Where the bulge sits, as a fraction of the flame's length. */
const BULGE_AT = 0.2;
/** A flame longer than this is a fast one, and thins into a streak. */
const SLIM_FROM = 14;
/** Rings from the outside in: colour, share of the half-width, and how far down the flame it reaches. */
const RINGS: readonly (readonly [color: string, share: number, reach: number])[] = [
  [FLAME[5], 1, 1],
  [FLAME[4], 0.78, 0.9],
  [FLAME[3], 0.56, 0.72],
  [FLAME[2], 0.38, 0.56],
  [FLAME[1], 0.22, 0.42],
  [FLAME[0], 0.1, 0.3],
];
const SEED = 0x7f1;

/** A jet's bands from the tip in: share of its length, and whether it shows in the outer rows too. */
const JET_BANDS: readonly (readonly [color: string, share: number, outer: boolean])[] = [
  [FLAME[5], 1, true],
  [FLAME[4], 0.8, true],
  [FLAME[3], 0.6, true],
  [FLAME[2], 0.42, false],
  [FLAME[1], 0.26, false],
];
/** Rows of a jet either side of its centre line; each row away from it is shorter. */
const JET_HALF_HEIGHT = 2;

/**
 * Fire shooting out of a flame-trench mouth at (x, y) along the ground,
 * `direction` -1 to the left or 1 to the right: a flat cone of bands, the
 * hottest nearest the mouth, ragged differently on every frame.
 */
export function drawJet(gfx: Gfx, x: number, y: number, direction: number, length: number, frame: number): void {
  for (let row = -JET_HALF_HEIGHT; row <= JET_HALF_HEIGHT; row++) {
    const outer = Math.abs(row) === JET_HALF_HEIGHT;
    const reach = length * (1 - Math.abs(row) * 0.3) + (hash2(row, frame, SEED + 1) - 0.5) * 3;
    for (const [color, share, showsOuter] of JET_BANDS) {
      if (outer && !showsOuter) continue;
      const span = Math.round(reach * share);
      if (span > 0) gfx.fillRect(direction < 0 ? x - span + 1 : x, y + row, span, 1, color);
    }
  }
}

/**
 * The exhaust hanging below the nozzle at (x, y), `length` pixels long: a
 * teardrop of flat rings, white-hot inside to red-orange at the rim and
 * tip, its edges ragged differently on every frame so it flickers. Each row
 * is a few spans drawn from the outside in.
 */
export function drawFlame(gfx: Gfx, x: number, y: number, length: number, frame: number): void {
  const slim = Math.min(1, SLIM_FROM / length) ** 0.5;
  for (let row = 0; row < length; row++) {
    const t = row / length;
    const shape = t < BULGE_AT ? 0.7 + 0.3 * (t / BULGE_AT) : (1 - (t - BULGE_AT) / (1 - BULGE_AT)) ** 0.75;
    const half = BULGE * slim * shape + (hash2(row, frame, SEED) - 0.5) * 0.9;
    for (const [color, share, reach] of RINGS) {
      if (t > reach) continue;
      const span = Math.max(0, Math.round(half * share));
      gfx.fillRect(x - span, y + row, span * 2 + 1, 1, color);
    }
  }
}
