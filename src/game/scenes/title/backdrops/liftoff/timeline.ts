import { hash2 } from '../../../../art/logos/raster/noise';
import type { TitleBeats } from '../../titleTimeline';
import { STAGE } from './layout';

/**
 * Liftoff's choreography as pure functions of intro time, played to the
 * scene's beats (docs/ART-DIRECTION.md › Title › Liftoff). Everything is
 * counted in whole frames at 60 fps and comes out in whole steps or pixels:
 *
 * - 0.00 s, the opening hit: ignition. A white bloom at the pad floods the
 *   sky with light in steps, and the flame catches.
 * - 0.30 s, anticipation: the hold-down lets go. Smoke rolls out along the
 *   ground, the pad rumbles and the rocket creeps up, accelerating…
 * - the slide: …up and away behind the incoming words…
 * - the flash: …clearing the top of the screen just as the flash hits.
 * - settled: a distant sonic boom rings, then the plume drifts in the wind,
 *   the smoke banks roll and, now and then, another rocket goes up far away.
 */

/** Frame index at 60 fps; rounding keeps float drift in scene time off the edges of every step. */
export function frameOf(seconds: number): number {
  return Math.round(seconds * 60);
}

/**
 * A stepped track: `[frame, value]` keys in ascending frame order, each
 * holding until the next. Before the first key it is `before`.
 */
function stepped(keys: readonly (readonly [frame: number, value: number])[], frame: number, before = 0): number {
  let value = before;
  for (const [at, held] of keys) {
    if (frame < at) break;
    value = held;
  }
  return value;
}

/** Ignition light, as a level of the pre-lit backdrop: brightest on the first frame, then burning down. */
const IGNITION_LIGHT = [
  [0, 4],
  [3, 3],
  [6, 2],
  [10, 1],
  [15, 0],
] as const;
/** Under reduced motion the ignition only warms the sky a step, and lets it go just as gently: no flash. */
const IGNITION_LIGHT_REDUCED = [
  [0, 1],
  [24, 0],
] as const;

/** How much ignition light reaches the sky and the ground: 0 is the plain evening. */
export function ignitionLight(time: number, reducedMotion: boolean): number {
  return stepped(reducedMotion ? IGNITION_LIGHT_REDUCED : IGNITION_LIGHT, frameOf(time));
}

/**
 * The light floods out from the pad over the first frames, a stepped dome
 * reaching this far; from the third frame it fills the sky.
 */
const FLOOD_REACH = [92, 170] as const;

/** How far the ignition light has spread from the pad, in pixels; infinite once it fills the sky. */
export function floodReach(time: number): number {
  return FLOOD_REACH[frameOf(time)] ?? Number.POSITIVE_INFINITY;
}

/** The flare streak's half-width: the whole screen on the first frames, then pulling in. */
const FLARE = [
  [0, 190],
  [2, 150],
  [4, 104],
  [6, 62],
  [8, 30],
  [10, 0],
] as const;

/** Half-width of the lens flare through the bloom; never under reduced motion. */
export function flareHalfWidth(time: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : stepped(FLARE, frameOf(time));
}

/** The ignition bloom's radius: it swells for a frame, then burns down to the flame in steps. */
const BLOOM = [
  [0, 44],
  [1, 52],
  [3, 47],
  [5, 40],
  [7, 32],
  [9, 24],
  [11, 17],
  [13, 11],
  [15, 7],
  [17, 4],
  [20, 0],
] as const;
/** Reduced motion: a small warm glow, never white, that grows and shrinks slowly. */
const BLOOM_REDUCED = [
  [0, 7],
  [6, 9],
  [18, 7],
  [30, 0],
] as const;

/** The ignition bloom's radius at the pad, in pixels; 0 once it has burnt down. */
export function bloomRadius(time: number, reducedMotion: boolean): number {
  return stepped(reducedMotion ? BLOOM_REDUCED : BLOOM, frameOf(time));
}

/** Fire jets out of the flame trench: they shoot out with the bloom, then the smoke swallows them. */
const JETS = [
  [0, 9],
  [2, 15],
  [4, 19],
  [7, 17],
  [10, 13],
  [13, 9],
  [16, 5],
  [18, 0],
] as const;
/** Reduced motion: shorter jets that come and go without the burst. */
const JETS_REDUCED = [
  [0, 5],
  [6, 8],
  [14, 5],
  [18, 0],
] as const;

/** How far each trench's fire jet reaches along the ground, in pixels. */
export function jetLength(time: number, reducedMotion: boolean): number {
  return stepped(reducedMotion ? JETS_REDUCED : JETS, frameOf(time));
}

/** When the hold-down lets go and the rocket starts to rise. */
export const LIFTOFF_AT = 0.3;
/** How far the rocket climbs before the flash: from the pad until its flame has cleared the top of the screen. */
export const CLIMB = STAGE.pad.y + 52;
/**
 * The climb follows t⁴: the rocket barely moves while the smoke builds,
 * creeps out of it during the anticipation, then is gone in a rush during
 * the slide, behind the words.
 */
const CLIMB_POWER = 4;

/** Pixels the rocket has climbed off the pad; it stays on the pad until liftoff. */
export function rocketLift(time: number, beats: TitleBeats): number {
  return CLIMB * climbProgress(time, beats) ** CLIMB_POWER;
}

/** Climb speed in pixels per second, which stretches the flame. */
export function rocketSpeed(time: number, beats: TitleBeats): number {
  const progress = climbProgress(time, beats);
  if (progress <= 0 || progress >= 1) return 0;
  return (CLIMB * CLIMB_POWER * progress ** (CLIMB_POWER - 1)) / (beats.flashStart - LIFTOFF_AT);
}

/** When the rocket reaches `lift` pixels off the pad: the inverse of `rocketLift`, used to start the plume behind it. */
export function timeAtLift(lift: number, beats: TitleBeats): number {
  const progress = Math.min(1, Math.max(0, lift / CLIMB)) ** (1 / CLIMB_POWER);
  return LIFTOFF_AT + progress * (beats.flashStart - LIFTOFF_AT);
}

/** The rocket is on screen from ignition until the flash hits. */
export function rocketVisible(time: number, beats: TitleBeats): boolean {
  return time < beats.flashStart;
}

function climbProgress(time: number, beats: TitleBeats): number {
  return Math.min(1, Math.max(0, (time - LIFTOFF_AT) / (beats.flashStart - LIFTOFF_AT)));
}

/** The flame catching: a lick, then a full flame within a few frames. */
const FLAME_CATCH = [
  [0, 3],
  [2, 6],
  [4, 8],
  [7, 10],
] as const;
/** Length jitter per flicker step (30 per second), so the flame never holds still. */
const FLICKER = [0, 2, 1, 3, 0, 2, -1, 1] as const;
/** Faster means a longer, thinner exhaust: the flame doubles as the rocket's speed smear. */
const FLAME_STRETCH = 0.035;
const FLAME_MAX = 44;

/** Flame length in pixels below the nozzle. */
export function flameLength(time: number, beats: TitleBeats): number {
  const frame = frameOf(time);
  const flicker = FLICKER[Math.floor(frame / 2) % FLICKER.length] ?? 0;
  const stretch = rocketSpeed(time, beats) * FLAME_STRETCH;
  return Math.min(FLAME_MAX, stepped(FLAME_CATCH, frame) + flicker + Math.round(stretch));
}

/** The pad rumbles while the engine is close to it: from the ignition until the rocket is this high. */
const RUMBLE_UNTIL_LIFT = 60;
const RUMBLE_SEED = 0x2b7;

/** Sideways shake of the pad layer, in whole pixels; never under reduced motion. */
export function padRumble(time: number, beats: TitleBeats, reducedMotion: boolean): number {
  if (reducedMotion || time < 0 || rocketLift(time, beats) > RUMBLE_UNTIL_LIFT) return 0;
  // A new offset every other frame: a buzz, not a vibration blur.
  const step = Math.floor(frameOf(time) / 2);
  return Math.floor(hash2(step, 0, RUMBLE_SEED) * 3) - 1;
}

/** Distances from the flame, in pixels, inside which smoke glows three, two and one steps warm. */
const WARMTH_REACH = [80, 48, 26] as const;

/**
 * How warmly the exhaust lights smoke `distance` pixels from the flame, in
 * steps from 0 (none) to 3 (lit like embers), and never less than the
 * ignition light around it. The light goes with the rocket, so every puff
 * cools in steps as the rocket climbs away.
 */
export function exhaustWarmth(distance: number, ignition: number): number {
  let warmth = 0;
  for (const reach of WARMTH_REACH) if (distance < reach) warmth++;
  return Math.max(warmth, Math.min(WARMTH_REACH.length, ignition - 1));
}

/** The sonic boom rings out high above right after the flash, and is gone before the first glint. */
export const BOOM_SECONDS = 0.5;

/** Progress 0 → 1 of the sonic-boom ring, or `null` when there is none; never under reduced motion. */
export function boomProgress(time: number, beats: TitleBeats, reducedMotion: boolean): number | null {
  const since = time - beats.settled;
  if (reducedMotion || since < 0 || since >= BOOM_SECONDS) return null;
  return since / BOOM_SECONDS;
}
