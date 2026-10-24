/**
 * What the radio spends on a device (docs/ROOM.md › The CD player), decided from facts, never guessed: the 2K
 * skin where it shows and fits, and a slow tier (no ambient float, short arrivals, the smallest labels) for
 * software renderers and machines that could not keep up with the first flight to the radio.
 */

/**
 * Texels the shipped 1K atlas spends across the radio's front panel (its island, measured in the baked atlas): the
 * panel's mark, scale and key glyphs resolve only this finely, whatever the screen.
 */
export const ATLAS_1K_PANEL_TEXELS = 158;
/**
 * From this many device pixels across the radio body the 1K atlas is magnified more than twofold and its panel
 * smears (a 1366 × 768 laptop at DPR 1 is well past it); the 2K skin doubles the panel's texels.
 */
export const SKIN_MIN_RENDER_WIDTH = 2 * ATLAS_1K_PANEL_TEXELS;
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

/** The 2K skin is worth its 16.8 MB of GPU memory wherever the 1K atlas is visibly magnified, and it fits. */
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

/**
 * Slow: a software renderer (the stage's `softwareGpu`, read once when the renderer was made), or a first flight whose
 * median frame took longer than 34 ms. Sticky per page load.
 */
export function isSlow(software: boolean, firstFlight: readonly number[] | null): boolean {
  if (software) return true;
  if (!firstFlight) return false;
  const median = flightMedian(firstFlight);
  return median !== null && median > SLOW_FRAME_MS;
}
