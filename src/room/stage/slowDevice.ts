/**
 * Whether the device is slow, decided from facts, never guessed: a software renderer, or a first flight that could not
 * keep up. The room's one rule for it, so the radio's slow tier (docs/ROOM.md › The CD player) and the posters'
 * (docs/ROOM.md › Posters) agree, and in the room's chunk rather than the radio's lazy one.
 */

/** The median frame interval of the first flight above which the device is slow (ms). */
export const SLOW_FRAME_MS = 34;
/** Frames needed (after the first) before a flight says anything about the device. */
export const SLOW_MIN_FRAMES = 10;

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
