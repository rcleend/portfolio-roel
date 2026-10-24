import { isSoftwareRenderer } from '../rendererInfo';

/**
 * What the radio spends on a device (docs/ROOM.md › The CD player), decided from facts, never guessed: the 2K
 * skin where it shows and fits, and a slow tier (no ambient float, short arrivals, the smallest labels) for
 * software renderers and machines that could not keep up with the first flight to the radio.
 */

/** Below this many device pixels across the radio body the 1K atlas is already as sharp as the screen. */
export const SKIN_MIN_RENDER_WIDTH = 900;
/** The median frame interval of the first flight above which the device is slow (ms). */
export const SLOW_FRAME_MS = 34;
/** Frames needed (after the first) before a flight says anything about the device. */
export const SLOW_MIN_FRAMES = 10;

export interface SkinTierFacts {
  /** The radio body's width at the radio pose in CSS px. */
  readonly bodyWidthCss: number;
  readonly pixelRatio: number;
  /** `navigator.deviceMemory` (GB), undefined where unknown. */
  readonly deviceMemory: number | undefined;
  readonly saveData: boolean;
  readonly slow: boolean;
}

/** The 2K skin is worth its 16.8 MB of GPU memory only where it is seen bigger than the 1K atlas resolves. */
export function wantsSkin(facts: SkinTierFacts): boolean {
  return (
    facts.bodyWidthCss * facts.pixelRatio > SKIN_MIN_RENDER_WIDTH &&
    (facts.deviceMemory === undefined || facts.deviceMemory > 2) &&
    !facts.saveData &&
    !facts.slow
  );
}

/** The median of a flight's frame intervals from the second on, or null when there were too few. */
export function flightMedian(frameTimes: readonly number[]): number | null {
  const intervals: number[] = [];
  for (let i = 2; i < frameTimes.length; i++) intervals.push((frameTimes[i] ?? 0) - (frameTimes[i - 1] ?? 0));
  if (intervals.length < SLOW_MIN_FRAMES) return null;
  intervals.sort((a, b) => a - b);
  const middle = intervals.length / 2;
  return intervals.length % 2 === 1
    ? (intervals[Math.floor(middle)] ?? 0)
    : ((intervals[middle - 1] ?? 0) + (intervals[middle] ?? 0)) / 2;
}

/** Slow: a software renderer, or a first flight whose median frame took longer than 34 ms. Sticky per page load. */
export function isSlow(rendererName: string | null, firstFlight: readonly number[] | null): boolean {
  if (isSoftwareRenderer(rendererName)) return true;
  if (!firstFlight) return false;
  const median = flightMedian(firstFlight);
  return median !== null && median > SLOW_FRAME_MS;
}
