import { ATTRACT_AFTER_SECONDS, GLINT, promptLit } from '../../titleTimeline';
import { FPS, type GrowthCues } from './timeline';

/**
 * The settled title's idle loop, as pure functions of the intro frame. It
 * is slow and takes turns with the scene: the bars tick halfway between
 * the glints that sweep the logo, so only one thing moves at a time, and
 * everything that cycles comes back to where it started within the
 * 25-second loop.
 */

/** Frames the idle loop lasts before the attract loop replays the intro. */
export const LOOP_FRAMES = ATTRACT_AFTER_SECONDS * FPS;

/** Frames since the title settled, or `null` during the intro. */
export function idleFrame(frame: number, cues: GrowthCues): number | null {
  return frame >= cues.settled ? frame - cues.settled : null;
}

/**
 * Whether the head's cursor is lit: once settled it blinks in step with
 * the prompt, so the screen has one pulse rather than two; under reduced
 * motion it holds steady.
 */
export function cursorLit(frame: number, cues: GrowthCues, reducedMotion: boolean): boolean {
  if (idleFrame(frame, cues) === null || reducedMotion) return true;
  return promptLit(frame / FPS, null);
}

/** The tape scrolls a pixel every other frame (30 px/s), or every fourth under reduced motion. */
export function tickerScroll(frame: number, cues: GrowthCues, reducedMotion: boolean): number {
  const idle = idleFrame(frame, cues) ?? 0;
  return Math.floor(idle / (reducedMotion ? 4 : 2));
}

/** The tape is exactly as long as one loop of scrolling, so it wraps where the loop does. */
export const TAPE_LENGTH = LOOP_FRAMES / 2;

/** The bars tick this many times per loop, then are back where they started. */
export const TICKS = 5;
/** A tick ripples across the bars left to right, one bar per frame. */
const TICK_STAGGER = 1;
/** Each bar steps a pixel every other frame towards its new value. */
const TICK_STEP_FRAMES = 2;

/** The idle frame of tick `index`: halfway between two glints, when the logo is quiet. */
export function tickFrame(index: number): number {
  return Math.round((GLINT.firstAfter + GLINT.every * (index + 0.5)) * FPS);
}

/**
 * A bar's height in the idle loop. `states[s][bar]` is bar `bar` after `s`
 * ticks (mod `TICKS`); between ticks it holds, and during one it steps a
 * pixel at a time from the old value to the new, later the further right
 * it stands. Reduced motion ripples at half the pace.
 */
export function idleBarHeight(
  states: readonly (readonly number[])[],
  bar: number,
  idle: number,
  reducedMotion: boolean,
): number {
  const pace = reducedMotion ? 2 : 1;
  let ticks = 0;
  while (ticks < TICKS && idle >= tickFrame(ticks) + bar * TICK_STAGGER * pace) ticks++;
  const to = heightAfter(states, bar, ticks);
  if (ticks === 0) return to;
  const from = heightAfter(states, bar, ticks - 1);
  const steps = Math.floor((idle - tickFrame(ticks - 1) - bar * TICK_STAGGER * pace) / (TICK_STEP_FRAMES * pace));
  return from + Math.sign(to - from) * Math.min(Math.abs(to - from), steps + 1);
}

function heightAfter(states: readonly (readonly number[])[], bar: number, ticks: number): number {
  return states[ticks % TICKS]?.[bar] ?? 0;
}

/** The ticks after which the live value tops its record and the "NEW HIGH" badge pops. */
export const RECORD_TICKS: readonly number[] = [1, 3];
/** The badge waits for the ripple to reach the last bar, then stays up this long. */
const BADGE = { delay: 24, hold: 100, steps: 4 } as const;

/**
 * How open the "▲ NEW HIGH" badge is, 0 (shut) to 1, in whole steps: it
 * pops open over four frames, overshooting a step, holds, then snaps shut
 * in reverse. Reduced motion shows it without the pop.
 */
export function badgeOpen(idle: number | null, reducedMotion: boolean): number {
  if (idle === null) return 0;
  for (const tick of RECORD_TICKS) {
    const age = idle - tickFrame(tick) - BADGE.delay;
    if (age < 0 || age >= BADGE.hold) continue;
    if (reducedMotion) return 1;
    const closing = BADGE.hold - 1 - age;
    const opening = Math.min(age, closing);
    if (opening >= BADGE.steps) return 1;
    // Opening steps 1/4, 2/4, 5/4 (the overshoot) and back to 1; closing takes the same steps backwards.
    return [0.25, 0.5, 1.25, 1][opening] ?? 1;
  }
  return 0;
}
