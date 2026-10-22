import { mod } from '@/engine/math/scalar';
import { easeOutBackWith, easeOutQuad } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';
import { ATTRACT_AFTER_SECONDS, type TitleBeats } from '../../titleTimeline';
import { INK } from './inks';

/**
 * The blueprint's choreography as pure functions of whole frames at 60 fps
 * (docs/ART-DIRECTION.md › Title › Blueprint). Frame 0 is the opening
 * strike; everything later plays to the scene's beats, which arrive with
 * every frame.
 */

/** Whole frames since `from` seconds, rounded like the scene's blink so float drift never moves an edge. */
export function framesSince(time: number, from = 0): number {
  // Adding zero turns the -0 a hair-early time rounds to into a plain 0.
  return Math.round((time - from) * 60) + 0;
}

function beatFrame(seconds: number): number {
  return Math.round(seconds * 60);
}

// ── Opening strike: 0 – 18 ────────────────────────────────────────────────

/**
 * Compass rings struck around the plot point, one every `every` frames,
 * flung far at first and slowing like a shockwave. The light table switches
 * on behind the newest ring, so the sheet boots outwards from the strike.
 */
export const RINGS = { radii: [6, 42, 76, 106, 133, 157, 178, 197, 214], every: 2 } as const;
/** Ring ink by age in frames: white-hot, then cooling a step every two frames. */
const RING_COOLING: readonly number[] = [
  INK.hot,
  INK.hot,
  INK.white,
  INK.white,
  INK.pale,
  INK.pale,
  INK.mid,
  INK.mid,
  INK.ghost,
  INK.ghost,
];

/** Frames until the light table covers the whole sheet. */
export const BOOT_FRAMES = RINGS.radii.length * RINGS.every;
/** Frames until the last ring has cooled away, overlapping the first measurements as follow-through. */
export const STRIKE_FRAMES = (RINGS.radii.length - 1) * RINGS.every + RING_COOLING.length;

/** Ink of compass ring `ring` at `frame`, or null before it is struck and after it has cooled away. */
export function ringInk(frame: number, ring: number): number | null {
  const age = frame - ring * RINGS.every;
  return age < 0 ? null : (RING_COOLING[age] ?? null);
}

/** Radius of the lit disc around the strike: the newest ring's, and the whole sheet once the rings are spent. */
export function litRadius(frame: number): number {
  if (frame >= BOOT_FRAMES) return Number.POSITIVE_INFINITY;
  return RINGS.radii[Math.max(0, Math.floor(frame / RINGS.every))] ?? 0;
}

/** The strike's cross flare: how far it reaches each way and its ink, retracting into the plot point. */
export interface Flare {
  readonly x: number;
  readonly y: number;
  /** How far each way the flare is three pixels thick, tapering to one beyond. */
  readonly core: number;
  readonly ink: number;
}

const FLARES: readonly Flare[] = [
  { x: 320, y: 240, core: 36, ink: INK.hot },
  { x: 320, y: 240, core: 36, ink: INK.hot },
  { x: 96, y: 64, core: 14, ink: INK.white },
  { x: 96, y: 64, core: 14, ink: INK.white },
  { x: 44, y: 30, core: 0, ink: INK.pale },
  { x: 44, y: 30, core: 0, ink: INK.pale },
  { x: 18, y: 12, core: 0, ink: INK.mid },
  { x: 18, y: 12, core: 0, ink: INK.mid },
];

export function flare(frame: number): Flare | null {
  return frame < 0 ? null : (FLARES[frame] ?? null);
}

/**
 * The white-hot plot point's radius: a fat strike that settles into a
 * pin-prick, or a still dot under reduced motion; gone once the
 * registration mark lands on it.
 */
export function plotPointRadius(frame: number, reducedMotion: boolean): number | null {
  if (frame < 0 || frame >= BOOT_FRAMES) return null;
  if (reducedMotion) return 1;
  if (frame < 2) return 4;
  if (frame < 4) return 3;
  return frame < 8 ? 2 : 1;
}

/** The reduced-motion warm-up, in exposures below fully lit, a step every few frames. */
export const WARM_UP: readonly number[] = [-4, -3, -2, -1];

/**
 * Under reduced motion there is no strike to spread from: the light table
 * warms up in even steps instead. Its exposure, in ramp steps below fully
 * lit, at `frame`.
 */
export function warmUpExposure(frame: number): number {
  return WARM_UP[Math.floor((Math.max(0, frame) * WARM_UP.length) / BOOT_FRAMES)] ?? 0;
}

// ── Anticipation: the engineer measures the spot, 18 – slide ─────────────

/** The registration mark lands big and settles to its radius, a pixel a frame. */
export const MARK_LANDING = [9, 8, 7] as const;
export const MARK_RADIUS = 6;

/** The registration mark at the strike: it lands a little big and settles, then holds until the lock. */
export function registrationRadius(frame: number, reducedMotion: boolean): number | null {
  const age = frame - BOOT_FRAMES;
  if (age < 0) return null;
  return reducedMotion ? MARK_RADIUS : (MARK_LANDING[age] ?? MARK_RADIUS);
}

/** The four dimension arms, shot from the strike to the frame one after another. */
export const ARMS = ['right', 'left', 'up', 'down'] as const;
export type Arm = (typeof ARMS)[number];

const ARM_START = BOOT_FRAMES + 2;
const ARM_STAGGER = 2;
const ARM_FRAMES = 10;
/** Arms shoot past the frame by about 2 % and settle back onto it, as if they hit it. */
const ARM_SHOT = easeOutBackWith(0.8);
/** Calmer arms all draw together, over longer, and stop dead. */
const ARM_FRAMES_REDUCED = 20;

/** How far an arm has shot out: 0 → 1, overshooting a little on the way under full motion. */
export function armReach(frame: number, arm: Arm, reducedMotion: boolean): number {
  if (reducedMotion) return segment(frame, ARM_START, ARM_START + ARM_FRAMES_REDUCED, easeOutQuad);
  const start = ARM_START + ARMS.indexOf(arm) * ARM_STAGGER;
  return segment(frame, start, start + ARM_FRAMES, ARM_SHOT);
}

/** Construction boxes blink in this many frames before the slide, so they hold still while the words arrive. */
const BOXES_LEAD = 20;
/** On-off pairs of frames as the boxes blink in, then steady. */
const BOX_BLINK = [true, true, false, false, true, true, false, false] as const;
/** The lock's two shake frames, when the satisfied construction flares white. */
const SATISFIED_FRAMES = 2;
/** Under reduced motion the measurements step down the ramp after the lock instead of flaring. */
const QUIET_RETIREMENT: readonly number[] = [
  INK.pale,
  INK.pale,
  INK.pale,
  INK.mid,
  INK.mid,
  INK.mid,
  INK.ghost,
  INK.ghost,
  INK.ghost,
];

/**
 * Ink of the measuring geometry (the registration mark, the dimension arms
 * and the construction boxes) at `frame`, or null where it is not drawn.
 * At the lock the words satisfy it: it flares white for the two shake
 * frames and is gone before the flash, or steps down quietly under reduced
 * motion.
 */
export function constructionInk(frame: number, beats: TitleBeats, reducedMotion: boolean): number | null {
  if (frame < BOOT_FRAMES) return null;
  const lock = frame - beatFrame(beats.slideEnd);
  if (lock < 0) return INK.pale;
  if (reducedMotion) return QUIET_RETIREMENT[lock] ?? null;
  return lock < SATISFIED_FRAMES ? INK.hot : null;
}

/** Whether the construction boxes are drawn at `frame`: blinking in, then held until the lock. */
export function boxesShown(frame: number, beats: TitleBeats, reducedMotion: boolean): boolean {
  const since = frame - (beatFrame(beats.slideStart) - BOXES_LEAD);
  if (since < 0 || constructionInk(frame, beats, reducedMotion) === null) return false;
  return reducedMotion || (BOX_BLINK[since] ?? true);
}

/** The datum line the words slide in along: drawn, still, from the slide until the lock. */
export function datumShown(frame: number, beats: TitleBeats, reducedMotion: boolean): boolean {
  return frame >= beatFrame(beats.slideStart) && constructionInk(frame, beats, reducedMotion) !== null;
}

// ── Lock: a ripple through the grid ───────────────────────────────────────

export interface Ripple {
  /** How far the ripple's front has travelled from the middle of the lockup. */
  readonly radius: number;
  /** The ink the fine grid lines in its band light up in; the heavy ones go a step brighter. */
  readonly ink: number;
}

/** The farthest a ripple from anywhere behind the lockup needs to travel to leave the sheet. */
const RIPPLE_REACH = 260;

/** The 1 px grid ripple sent out by the lock: it runs on under the flash and is still spreading as it clears. */
export function ripple(frame: number, beats: TitleBeats, reducedMotion: boolean): Ripple | null {
  const age = frame - beatFrame(beats.slideEnd);
  const speed = reducedMotion ? 3 : 6;
  if (age < 0 || age * speed > RIPPLE_REACH) return null;
  return { radius: age * speed, ink: reducedMotion ? INK.ghost : INK.pale };
}

// ── Settled: the plotter's dope sheet ─────────────────────────────────────

/** Frames from the settled title until the attract loop replays the intro. */
export const SETTLED_FRAMES = ATTRACT_AFTER_SECONDS * 60;

/**
 * When the plotter draws each wireframe, in frames since the title settled.
 * Each finishes (and the revision climbs) between two of the logo's glints,
 * so the corner and the logo take turns; erasing ends before the next one
 * starts, and the last is gone before the intro replays.
 */
export const PLOTS = [
  { plot: 60, done: 273, erase: 420 },
  { plot: 480, done: 645, erase: 800 },
  { plot: 850, done: 973, erase: 1120 },
  { plot: 1170, done: 1280, erase: 1440 },
] as const;

/**
 * Erasing steps a finished drawing's ink down the ramp, a step every few
 * frames, through the brightest paper steps until the paper has it back.
 */
export const ERASE_STEPS: readonly number[] = [INK.mid, INK.ghost, 9, 7, 5];
const ERASE_STEP_FRAMES = 5;
export const ERASE_FRAMES = ERASE_STEPS.length * ERASE_STEP_FRAMES;

export type PlotPhase = 'plot' | 'hold' | 'erase';

export interface PlotterState {
  /** Index into the drawings. */
  readonly drawing: number;
  readonly phase: PlotPhase;
  /** Frames into the phase. */
  readonly at: number;
  /** Length of the phase in frames. */
  readonly of: number;
}

/** What the plotter is doing `settled` frames after the title settled, or null between drawings. */
export function plotterAt(settled: number): PlotterState | null {
  const frame = mod(settled, SETTLED_FRAMES);
  for (let drawing = 0; drawing < PLOTS.length; drawing++) {
    const { plot, done, erase } = PLOTS[drawing] as (typeof PLOTS)[number];
    if (frame < plot) return null;
    if (frame < done) return { drawing, phase: 'plot', at: frame - plot, of: done - plot };
    if (frame < erase) return { drawing, phase: 'hold', at: frame - done, of: erase - done };
    if (frame < erase + ERASE_FRAMES) return { drawing, phase: 'erase', at: frame - erase, of: ERASE_FRAMES };
  }
  return null;
}

/** The ink of a drawing `at` frames into being erased. */
export function eraseInk(at: number): number {
  return ERASE_STEPS[Math.floor(at / ERASE_STEP_FRAMES)] ?? (ERASE_STEPS.at(-1) as number);
}

export interface Revision {
  /** Drawings finished so far this loop: revision A plus this many. */
  readonly count: number;
  /** Frames since the last one finished, or null before the first. */
  readonly since: number | null;
}

/** The title block's revision: it climbs a letter whenever the plotter finishes a drawing. */
export function revisionAt(settled: number): Revision {
  const frame = mod(settled, SETTLED_FRAMES);
  let count = 0;
  let since: number | null = null;
  for (const { done } of PLOTS) {
    if (frame < done) break;
    count++;
    since = frame - done;
  }
  return { count, since };
}

/** One slow pass of the light table's scan line per loop, while the plotter rests between drawings. */
export const SCAN = { from: 668, frames: 120 } as const;

/** How far down the sheet the scan line is, 0 → 1, or null when it is not passing; never under reduced motion. */
export function scanProgress(settled: number, reducedMotion: boolean): number | null {
  if (reducedMotion) return null;
  const at = mod(settled, SETTLED_FRAMES) - SCAN.from;
  return at < 0 || at >= SCAN.frames ? null : at / SCAN.frames;
}
