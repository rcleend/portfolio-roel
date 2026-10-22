import { Rng } from '@/engine/math/Rng';
import { valueNoise } from '../../../../art/logos/raster/noise';

/** A long, flat-bottomed streak of cloud; the set sun lights its underside from below the horizon. */
interface Streak {
  readonly left: number;
  readonly right: number;
  /** The row of its sunlit underside. */
  readonly base: number;
  /** Thickness at its fattest, in pixels. */
  readonly depth: number;
  readonly seed: number;
}

/** A drift of streaks stacked loosely in one patch of sky. */
interface Drift {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Three drifts of cloud streaks across the logo's stretch of sky, the
 * classic 16-bit dusk, with open sky between them for the stars. Their job
 * is value as much as weather: a mid-tone field behind the lettering, so
 * the logo's dark-red extrusion and near-black outline read against it
 * instead of sinking into the night. The sky above them stays clear for the
 * sonic boom, and below them for the skyline and the prompt.
 */
const DRIFTS: readonly Drift[] = [
  { left: -40, right: 196, top: 30, bottom: 74 },
  { left: 132, right: 360, top: 48, bottom: 104 },
  { left: -30, right: 262, top: 90, bottom: 136 },
];
const SEED = 0x11f7;

/** The laid-out cloud deck. Build it with `layoutClouds`, once, while the backdrop paints. */
export interface CloudDeck {
  /**
   * Shade of the cloud at (x, y) as a position on the `CLOUD` ramp, or
   * `null` in clear sky. Each streak is shaded from a softly lit underside
   * up through its violet body to a dark top edge, with grain along it.
   * Lower streaks are nearer and overlap the ones above.
   */
  shade(x: number, y: number): number | null;
}

export function layoutClouds(): CloudDeck {
  // The streaks crossing each row, top streaks first, so shading a pixel only looks at its own row's few.
  const rows = new Map<number, Streak[]>();
  for (const streak of layoutStreaks()) {
    for (let y = streak.base - streak.depth - 1; y <= streak.base + 1; y++) {
      const row = rows.get(y);
      if (row) row.push(streak);
      else rows.set(y, [streak]);
    }
  }
  return {
    shade(x: number, y: number): number | null {
      let shade: number | null = null;
      for (const streak of rows.get(y) ?? NO_STREAKS) shade = streakShade(streak, x, y) ?? shade;
      return shade;
    },
  };
}

const NO_STREAKS: readonly Streak[] = [];

/** Streaks stacked down each drift at uneven gaps, longest in its middle rows, staggered left and right. */
function layoutStreaks(): Streak[] {
  const rng = new Rng(SEED);
  const streaks: Streak[] = [];
  for (const drift of DRIFTS) {
    const width = drift.right - drift.left;
    for (let base = drift.top + 4; base <= drift.bottom; base += rng.int(5, 11)) {
      const middle = 1 - Math.abs((base - drift.top) / (drift.bottom - drift.top) - 0.5) * 2;
      const length = width * (0.35 + 0.55 * middle) * rng.range(0.7, 1.1);
      const left = drift.left + rng.range(0, width - length);
      streaks.push({
        left,
        right: left + length,
        base,
        depth: rng.int(3, 4 + Math.round(6 * middle)),
        seed: rng.int(0, 0xffff),
      });
    }
  }
  return streaks.sort((a, b) => a.base - b.base);
}

function streakShade(streak: Streak, x: number, y: number): number | null {
  if (x < streak.left || x >= streak.right || y > streak.base + 1 || y < streak.base - streak.depth - 1) return null;
  const along = (x - streak.left) / (streak.right - streak.left);
  // Tapered ends with a lumpy top: a lens, not a bar.
  const taper = Math.sin(Math.PI * along) ** 0.5;
  const lumps = 0.45 + 0.55 * valueNoise(x, 0, 8, 1, streak.seed);
  const thickness = Math.round(streak.depth * taper * lumps);
  if (thickness < 1) return null;
  const bottom = streak.base + Math.round(valueNoise(x, 0, 23, 1, streak.seed + 1) - 0.5);
  const fromBottom = bottom - y;
  if (fromBottom < 0 || fromBottom >= thickness) return null;
  const grain = (valueNoise(x, y, 11, 2, streak.seed + 2) - 0.5) * 1.2;
  if (thickness <= 2) return 4.6 + grain;
  if (fromBottom === 0) return 8.2 + grain * 0.4;
  if (fromBottom === thickness - 1) return 3.6 + grain * 0.5;
  return 6.6 - 2 * (fromBottom / thickness) + grain;
}
