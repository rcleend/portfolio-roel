import { parseHex } from '@/engine/gfx/color';
import type { Gfx } from '@/engine/gfx/Gfx';
import { containsPoint, type Rect } from '@/engine/math/Rect';
import { Rng } from '@/engine/math/Rng';
import { mod } from '@/engine/math/scalar';
import type { Bitmap } from '../../../../art/logos/raster/Bitmap';
import type { CloudDeck } from './clouds';
import { STAR } from './colors';
import { STAGE } from './layout';
import { skyShade } from './sky';

/**
 * Stars at three depths. Far ones are faint dots painted into the sky once;
 * nearer ones twinkle in whole palette steps and drift west, the nearer the
 * faster, so the sky turns with a hint of parallax. Only stars whose whole
 * drift stays in clear, dark sky are kept, so none slips behind a cloud.
 */
export interface Star {
  readonly x: number;
  readonly y: number;
  /** 0 far (painted once, faint), 1 middle (a twinkling dot), 2 near (a dot that flares into a cross). */
  readonly depth: number;
  /** Seconds per twinkle, and where in it the star starts. */
  readonly period: number;
  readonly offset: number;
}

/** Drift in pixels per second by depth: the far field holds still. */
const DRIFT = [0, 0.05, 0.11] as const;
/** The longest a frame's time runs: the settled title's 25 s, plus a margin for a button press just before the replay. */
const LONGEST_SHOWN = 28;
/** Below this the sky is too bright for stars. */
const DARK_ENOUGH = 8.5;
const COUNTS = [90, 26, 7] as const;
const SEED = 0x57a2;

/**
 * Twinkle levels across one period, as indices into `STAR`: a slow, stepped
 * swell and fall that never moves more than one step at a time, never an
 * on/off strobe.
 */
const TWINKLE = [1, 1, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1] as const;
/** How a star behind the lockup shows: one dim, steady step, so nothing flickers between the letters. */
const STEADY = 1;
const FAR_STAR = [parseHex(STAR[0]), parseHex(STAR[1])] as const;

/** The far field, painted once into the backdrop levels dim enough to show it. */
export function paintFarStars(bitmap: Bitmap, stars: readonly Star[]): void {
  for (const star of stars) {
    if (star.depth === 0) bitmap.set(star.x, star.y, FAR_STAR[(star.x + star.y) % 2] ?? FAR_STAR[0]);
  }
}

/**
 * The middle and near stars at `time`. Stars behind the lockup hold one
 * dim, steady step in place, so nothing moves or flickers between the
 * letters.
 */
export function drawStars(gfx: Gfx, stars: readonly Star[], time: number, reducedMotion: boolean, lockup: Rect): void {
  for (const star of stars) {
    if (star.depth === 0) continue;
    if (containsPoint(lockup, star.x, star.y)) {
      gfx.pixel(star.x, star.y, STAR[STEADY]);
      continue;
    }
    const x = starX(star, time, reducedMotion);
    const level = twinkleLevel(star, time, reducedMotion);
    gfx.pixel(x, star.y, STAR[level] ?? STAR[STEADY]);
    if (star.depth === 2 && level >= 3) {
      // A near star at its brightest flares into a small cross.
      const arm = STAR[level - 2] ?? STAR[STEADY];
      gfx.pixel(x - 1, star.y, arm);
      gfx.pixel(x + 1, star.y, arm);
      gfx.pixel(x, star.y - 1, arm);
      gfx.pixel(x, star.y + 1, arm);
    }
  }
}

/** A star's column at `time`: the sky turns west, the nearer stars faster; reduced motion halves the pace. */
export function starX(star: Star, time: number, reducedMotion: boolean): number {
  return Math.round(star.x - (DRIFT[star.depth] ?? 0) * pace(reducedMotion) * time);
}

/** A star's brightness at `time`, as an index into `STAR`: it never moves more than a step from one frame to the next. */
export function twinkleLevel(star: Star, time: number, reducedMotion: boolean): number {
  const phase = mod((time * pace(reducedMotion)) / star.period + star.offset, 1);
  return (TWINKLE[Math.floor(phase * TWINKLE.length)] ?? STEADY) + (star.depth === 2 ? 1 : 0);
}

function pace(reducedMotion: boolean): number {
  return reducedMotion ? 0.5 : 1;
}

/** Seeded positions in the clear, dark sky, nearer stars fewer; lay them out once, while the backdrop paints. */
export function layoutStars(clouds: CloudDeck): Star[] {
  const rng = new Rng(SEED);
  const stars: Star[] = [];
  COUNTS.forEach((count, depth) => {
    const drift = Math.ceil((DRIFT[depth] ?? 0) * LONGEST_SHOWN);
    for (let placed = 0, tries = 0; placed < count && tries < count * 40; tries++) {
      const x = rng.int(drift + 1, STAGE.width - 2);
      const y = rng.int(1, STAGE.terminator);
      const crowded = stars.some((other) => Math.abs(other.x - x) + Math.abs(other.y - y) < 4);
      if (crowded || !clearPath(clouds, x, y, drift)) continue;
      stars.push({ x, y, depth, period: rng.range(2.5, 6), offset: rng.next() });
      placed++;
    }
  });
  return stars;
}

/** True when a star at (x, y) drifting `drift` pixels west stays in dark, clear sky, with room for a near star's cross. */
function clearPath(clouds: CloudDeck, x: number, y: number, drift: number): boolean {
  for (let dx = -drift - 1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (clouds.shade(x + dx, y + dy) !== null || skyShade(x + dx, y + dy) > DARK_ENOUGH) return false;
    }
  }
  return true;
}
