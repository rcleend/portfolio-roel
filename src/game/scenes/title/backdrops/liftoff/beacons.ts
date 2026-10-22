import type { Gfx } from '@/engine/gfx/Gfx';
import { containsPoint, type Rect } from '@/engine/math/Rect';
import { mod } from '@/engine/math/scalar';
import { BEACON_ON } from './colors';
import { BEACONS } from './skyline';

/** Seconds per blink and how long each stays lit: slow, like the real thing. */
const PERIOD = 1.6;
const LIT = 0.3;
/** Where each light is in its blink when the intro starts: the bridge answers the tower half a beat later. */
const OFFSETS = [0, 0.5, 0.5, 0.25] as const;

/**
 * The skyline's aviation lights blinking red. Reduced motion halves the
 * pace; a light that falls inside the lockup's box stays dark, so nothing
 * blinks between the letters.
 */
export function drawBeacons(gfx: Gfx, time: number, reducedMotion: boolean, lockup: Rect): void {
  const period = reducedMotion ? PERIOD * 2 : PERIOD;
  for (let i = 0; i < BEACONS.length; i++) {
    const beacon = BEACONS[i];
    if (!beacon || containsPoint(lockup, beacon.x, beacon.y)) continue;
    if (mod(time / period + (OFFSETS[i] ?? 0), 1) * period < LIT) gfx.pixel(beacon.x, beacon.y, BEACON_ON);
  }
}
