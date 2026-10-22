import { easeOutExpo } from '@/engine/motion/easing';
import { frames, segment } from '@/engine/motion/progress';

/** The beats the scene acts on, in seconds of intro time; backdrops receive them to play along (`TitleFrame.beats`). */
export interface TitleBeats {
  /** The lockup starts sliding in, decelerating hard… */
  readonly slideStart: number;
  /** …and arrives, locking with a two-frame screen shake. */
  readonly slideEnd: number;
  /** The screen whites out (never under reduced motion)… */
  readonly flashStart: number;
  /** …and clears on the settled title: the prompt and copyright appear and glints begin. */
  readonly settled: number;
}

/**
 * The title intro as pure functions of intro time, following the Metal Slug
 * title frame by frame (docs/ART-DIRECTION.md › Title). Times are seconds
 * from the start of the intro, which restarts for the attract loop; intro
 * time 0 is the opening hit, when the explosion sounds.
 */
export const TITLE_TIMES: TitleBeats = {
  slideStart: 0.9,
  slideEnd: 1.2,
  flashStart: 1.25,
  settled: 1.45,
};

/** How far the lockup travels as it slides in, in pixels: from off-screen to settled. */
export const SLIDE_DISTANCE = 340;
/** Settled and untouched for this long, the title replays its intro. */
export const ATTRACT_AFTER_SECONDS = 25;
/** After a button press the prompt blinks fast for this long before the screen changes. */
export const CONFIRM_SECONDS = 0.5;

/** A shine sweeps across the settled logo now and then, so the screen never looks frozen. */
export const GLINT = { firstAfter: 0.5, every: 4.5, duration: 0.4 } as const;

/** The lock-in shake: two frames, then still. */
const LOCK_SHAKE = [
  { x: 2, y: 1 },
  { x: -2, y: -1 },
] as const;
const STILL = { x: 0, y: 0 } as const;

export interface Offset {
  readonly x: number;
  readonly y: number;
}

/** How much of its slide the lockup still has to travel, 1 → 0, decelerating hard. */
export function slideRemaining(time: number): number {
  return 1 - segment(time, TITLE_TIMES.slideStart, TITLE_TIMES.slideEnd, easeOutExpo);
}

export function logoVisible(time: number): boolean {
  return time >= TITLE_TIMES.slideStart;
}

/** Whole-screen offset for the two frames after the words lock; none under reduced motion. */
export function lockShake(time: number, reducedMotion: boolean): Offset {
  if (reducedMotion) return STILL;
  const frame = Math.round((time - TITLE_TIMES.slideEnd) * 60);
  return LOCK_SHAKE[frame] ?? STILL;
}

/** White flash coverage: full, then one half-strength step before the settled title; never under reduced motion. */
export function flashCoverage(time: number, reducedMotion: boolean): number {
  if (reducedMotion || time < TITLE_TIMES.flashStart || time >= TITLE_TIMES.settled) return 0;
  return time < TITLE_TIMES.settled - frames(3) ? 1 : 0.5;
}

export function isSettled(time: number): boolean {
  return time >= TITLE_TIMES.settled;
}

/**
 * Whether "PRESS ANY BUTTON" is lit: the classic 32-on / 16-off blink once
 * settled, and a frantic 3 / 3 for the moment after a press.
 */
export function promptLit(time: number, confirmedFor: number | null): boolean {
  if (confirmedFor !== null) return blinkFrames(confirmedFor, 3, 3);
  return isSettled(time) && blinkFrames(time - TITLE_TIMES.settled, 32, 16);
}

/** On/off blinking counted in whole frames, so float drift in scene time never shifts an edge. */
function blinkFrames(seconds: number, on: number, off: number): boolean {
  return Math.round(seconds * 60) % (on + off) < on;
}

/** True once `time` has passed `cue` during the step that ended at `time`. */
export function crossed(previous: number, time: number, cue: number): boolean {
  return previous < cue && time >= cue;
}

/** Whether an untouched, settled title should replay its intro. */
export function attractDue(time: number): boolean {
  return time >= TITLE_TIMES.settled + ATTRACT_AFTER_SECONDS;
}

/** Progress 0 → 1 of the current glint sweep, or `null` between sweeps. */
export function glintProgress(time: number): number | null {
  const since = time - TITLE_TIMES.settled - GLINT.firstAfter;
  if (since < 0) return null;
  const phase = since % GLINT.every;
  return phase < GLINT.duration ? phase / GLINT.duration : null;
}
