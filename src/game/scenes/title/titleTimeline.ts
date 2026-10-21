import { easeOutExpo } from '@/engine/motion/easing';
import { frames, segment } from '@/engine/motion/progress';

/**
 * The title intro as pure functions of intro time, following the Metal Slug
 * title frame by frame (docs/ART-DIRECTION.md › Title). Times are seconds
 * from the start of the intro, which restarts for the attract loop.
 */
export const TITLE_TIMES = {
  /** The fireball has collapsed to nothing… */
  fireballEnd: 0.3,
  /** …and the crater is there. */
  crater: 0.3,
  slideStart: 0.9,
  /** Both words have arrived and lock together. */
  slideEnd: 1.2,
  flashStart: 1.25,
  /** The settled title: prompt and copyright appear. */
  settled: 1.45,
} as const;

/** Fireball radius on the first frame — big enough to fill most of the screen. */
export const FIREBALL_RADIUS = 92;
/** How far off-screen the words start, in pixels. */
export const SLIDE_DISTANCE = 340;
/** Settled and untouched for this long, the title replays its intro. */
export const ATTRACT_AFTER_SECONDS = 25;
/** After a button press the prompt blinks fast for this long before the screen changes. */
export const CONFIRM_SECONDS = 0.5;

const FIREBALL_GLOW_STEPS = 3;

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

export function fireballRadius(time: number): number {
  if (time >= TITLE_TIMES.fireballEnd) return 0;
  return Math.round(FIREBALL_RADIUS * (1 - segment(time, 0, TITLE_TIMES.fireballEnd)));
}

/** How brightly the fireball lights the card, 0–1 in flat steps. */
export function fireballGlow(time: number): number {
  return Math.ceil((fireballRadius(time) / FIREBALL_RADIUS) * FIREBALL_GLOW_STEPS) / FIREBALL_GLOW_STEPS;
}

export function craterVisible(time: number): boolean {
  return time >= TITLE_TIMES.crater;
}

/** How far the words still have to travel, 1 → 0, decelerating hard. */
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
