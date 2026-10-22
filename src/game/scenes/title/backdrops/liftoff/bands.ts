import type { Rgba } from '@/engine/gfx/color';
import { bayerThreshold } from '@/engine/gfx/dither';

/** The first part of every band stays flat; only its far end dithers into the next. */
const FLAT = 0.45;
/** Dither coverage steps: a quarter, a half and three quarters, like hand-placed Bayer rows. */
const STEPS = 4;

/**
 * The band a fractional ramp position falls in at pixel (x, y): flat bands
 * joined by a short ordered-dither ramp (docs/ART-DIRECTION.md › Global
 * rules), rather than rounding to the nearest band or blending.
 */
export function bandIndex(value: number, x: number, y: number): number {
  const band = Math.floor(value);
  const coverage = Math.floor(((value - band - FLAT) / (1 - FLAT)) * STEPS) / STEPS;
  return coverage > bayerThreshold('bayer4', x, y) ? band + 1 : band;
}

/** The ramp colour for a fractional position, banded and dithered as `bandIndex`, clamped to the ramp's ends. */
export function bandColor(ramp: readonly Rgba[], value: number, x: number, y: number): Rgba {
  const index = bandIndex(value, x, y);
  return ramp[Math.min(ramp.length - 1, Math.max(0, index))] as Rgba;
}
