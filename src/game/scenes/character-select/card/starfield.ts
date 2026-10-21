import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rng } from '@/engine/math/Rng';
import { mod } from '@/engine/math/scalar';

/**
 * Twinkling stars behind the character. Each star rests at a dim or mid
 * brightness and, once per its own period, flares up through brighter steps
 * to a little cross and back — stepped, never faded. Pure in time, so a
 * given frame always looks the same.
 */
export interface Star {
  readonly x: number;
  readonly y: number;
  /** Resting brightness level. */
  readonly base: 0 | 1;
  readonly period: number;
  readonly phase: number;
  /** Bright stars flare all the way to a cross. */
  readonly flare: boolean;
}

const COLORS = ['#3f3590', '#8476d6', '#d9d0ff', '#ffffff'] as const;
const SECONDS_PER_STEP = 4 / 60;
const FLARE = [1, 2, 3, 3, 2, 1] as const;
const GLINT = [1, 2, 1] as const;

export function createStars(rng: Rng, width: number, height: number, count: number): Star[] {
  return Array.from({ length: count }, () => ({
    x: rng.int(1, width - 2),
    y: rng.int(1, height - 2),
    base: rng.chance(0.35) ? 1 : 0,
    period: rng.range(1.6, 4.2),
    phase: rng.range(0, 4.2),
    flare: rng.chance(0.25),
  }));
}

/** Brightness 0–3 at `time`; 3 draws as a cross. */
export function starLevel(star: Star, time: number): number {
  const curve = star.flare ? FLARE : GLINT;
  const step = Math.floor(mod(time + star.phase, star.period) / SECONDS_PER_STEP);
  return Math.max(star.base, curve[step] ?? star.base);
}

export function drawStars(gfx: Gfx, stars: readonly Star[], originX: number, originY: number, time: number): void {
  for (const star of stars) {
    const level = starLevel(star, time);
    const x = originX + star.x;
    const y = originY + star.y;
    if (level === 3) {
      gfx.fillRect(x - 1, y, 3, 1, COLORS[1]);
      gfx.fillRect(x, y - 1, 1, 3, COLORS[1]);
    }
    gfx.pixel(x, y, COLORS[level as 0 | 1 | 2 | 3]);
  }
}
