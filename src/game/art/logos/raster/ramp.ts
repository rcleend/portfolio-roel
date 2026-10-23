import type { Rgba } from '@/engine/gfx/color';

/**
 * The colour at a fractional position in a palette ramp, rounded to the
 * nearest entry and clamped to its ends — how procedural painters turn
 * "a bit darker here" into a flat palette colour.
 */
export function rampAt(ramp: readonly Rgba[], index: number): Rgba {
  if (ramp.length === 0) throw new RangeError('rampAt: the ramp is empty');
  const clamped = Math.min(ramp.length - 1, Math.max(0, Math.round(index)));
  return ramp[clamped] as Rgba;
}
