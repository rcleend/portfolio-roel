import { clamp01 } from '../../motion/easing';
import type { RadioKey } from '../RadioDeck';
import { springAt } from './springs';

/**
 * The transport keys as pure functions of time (docs/ROOM.md › The CD player): ▷II and ■ are one rocker that
 * tilts about its pivot, ⏮ and ⏭ push straight in. A press goes down quickly, holds while the pointer does (at least
 * 140 ms), and springs back with a little overshoot; the pressed face darkens as it sinks into its recess, because
 * the bake cannot shade a key that moves.
 */

export const KEYS = {
  rockerDegrees: 6,
  rockerInMs: 50,
  sideTravel: 0.0025,
  sideInMs: 35,
  sideOutMs: 110,
  /** A press holds this long however short the tap: long enough to be seen (50 ms went unnoticed). */
  minHoldMs: 140,
  releaseZeta: 0.45,
  releaseHz: 9,
  /**
   * Colour factors at full travel: the pressed half, the rocker's other half, a side key. From the front a press is
   * hardly seen moving (the travel runs along the view), so the light does the telling: a key going into its
   * recess loses most of the light on it, and the rocker's other half tips out into more.
   */
  pressedShade: 0.55,
  otherShade: 1.18,
  sideShade: 0.55,
} as const;

/** One press of one key: when it went down and, once known, when it was let go. */
export interface KeyPress {
  readonly key: RadioKey;
  readonly down: number;
  readonly up: number | null;
  /** Drawn fully pressed from `down` to `up` without travel (reduced motion). */
  readonly instant?: boolean;
  /** Shortest hold before it comes back up (ms); a pointer's press holds at least KEYS.minHoldMs. */
  readonly minHold?: number;
  /** How long it takes to go all the way down (ms); a finger's press is quicker than the radio's own. */
  readonly inMs?: number;
}

const outQuad = (u: number): number => 1 - (1 - u) * (1 - u);
const outCubic = (u: number): number => 1 - (1 - u) ** 3;

/** When a press actually starts to come back up: never before the minimum hold. */
export function releaseStart(press: KeyPress): number | null {
  return press.up === null ? null : Math.max(press.up, press.down + (press.minHold ?? KEYS.minHoldMs));
}

/** How far down a key is at `t`: 0 up, 1 fully pressed; the rocker overshoots slightly below 0 on release. */
export function keyTravel(press: KeyPress, t: number): number {
  if (press.instant) return t >= press.down && (press.up === null || t < press.up) ? 1 : 0;
  const side = press.key === 'previous' || press.key === 'next';
  const inMs = press.inMs ?? (side ? KEYS.sideInMs : KEYS.rockerInMs);
  const going = (from: number) => (from - press.down) / inMs;
  const release = releaseStart(press);
  if (t < press.down) return 0;
  if (release === null || t < release) return outQuad(clamp01(going(t)));
  const atRelease = outQuad(clamp01(going(release)));
  const elapsed = t - release;
  if (side) return atRelease * (1 - outCubic(clamp01(elapsed / KEYS.sideOutMs)));
  return springAt(atRelease, 0, KEYS.releaseZeta, KEYS.releaseHz, elapsed / 1000).x;
}

/** True while the press still moves (or holds): a frame is needed. */
export function keyMoving(press: KeyPress, t: number): boolean {
  if (press.instant) return press.up === null || t < press.up;
  const release = releaseStart(press);
  if (release === null || t < release) return true;
  const side = press.key === 'previous' || press.key === 'next';
  if (side) return t - release < KEYS.sideOutMs;
  return t - release < 220;
}

/** The rocker's tilt in degrees for a travel: positive leans ▷II in, negative leans ■ in. */
export function rockerDegrees(key: 'play-pause' | 'stop', travel: number): number {
  return (key === 'play-pause' ? 1 : -1) * KEYS.rockerDegrees * travel;
}

/** A side key's push along its travel axis (m). */
export function sideKeyTravel(travel: number): number {
  return KEYS.sideTravel * travel;
}

/** The colour factor of a key face: the pressed rocker half darkens, its other half catches a little light. */
export function keyShade(face: RadioKey, pressed: RadioKey | null, travel: number): number {
  const amount = clamp01(travel);
  if (pressed === null || amount === 0) return 1;
  const rocker = (key: RadioKey) => key === 'play-pause' || key === 'stop';
  if (face === pressed) {
    return 1 - (1 - (rocker(face) ? KEYS.pressedShade : KEYS.sideShade)) * amount;
  }
  if (rocker(face) && rocker(pressed)) return 1 + (KEYS.otherShade - 1) * amount;
  return 1;
}
