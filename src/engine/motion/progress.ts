import { type Easing, linear } from './easing';

/**
 * Eased progress of `time` through the window [start, end]: 0 before the
 * window, 1 after it. This is the building block of all scene choreography:
 *
 *   const slide = segment(this.time, 0.9, 1.25, easeOutExpo);
 *   const x = lerp(320, 96, slide);
 */
export function segment(time: number, start: number, end: number, ease: Easing = linear): number {
  if (time >= end) return ease(1);
  if (time <= start) return ease(0);
  return ease((time - start) / (end - start));
}

/** True while `time` lies in [start, end). */
export function within(time: number, start: number, end: number): boolean {
  return time >= start && time < end;
}

/** Converts a frame count at the 60 Hz simulation rate into seconds. */
export function frames(count: number): number {
  return count / 60;
}
