import type { Vec2 } from '@/engine/math/Vec2';
import { type Easing, easeInCubic, easeInOutQuad, easeOutBack, easeOutCubic } from '@/engine/motion/easing';
import { hash2 } from '../../../../art/logos/raster/noise';
import type { TitleBeats } from '../../titleTimeline';
import type { Spike } from './flare';

/**
 * The backdrop's choreography as pure functions of the intro frame, laid
 * over the scene's beats (docs/ART-DIRECTION.md › Title › Up and to the
 * right). Everything counts whole frames at 60 fps, so a float drift in
 * scene time never shifts an edge.
 */
export const FPS = 60;

/** The whole frame `time` falls on. */
export function frameAt(time: number): number {
  return Math.round(time * FPS);
}

/** The backdrop's own beats, in frames of intro time. */
export interface GrowthCues {
  /** The tube is lit and the line starts drawing from the y axis… */
  readonly draw: number;
  /** …reaches the turn and holds there… */
  readonly turn: number;
  /** …rockets as the words start sliding… */
  readonly rocket: number;
  /** …and breaks through the ceiling as they lock. */
  readonly breach: number;
  /** The settled title: the idle loop's origin. */
  readonly settled: number;
}

/** The opening hit and power-up last this long, as the classic's fireball did. */
const POWER_UP_FRAMES = 18;
/** The head rests at the turn for a beat before it rockets: the anticipation pose. */
const HOLD_FRAMES = 2;

export function growthCues(beats: TitleBeats): GrowthCues {
  const rocket = frameAt(beats.slideStart);
  return {
    draw: POWER_UP_FRAMES,
    turn: rocket - HOLD_FRAMES,
    rocket,
    breach: frameAt(beats.slideEnd),
    settled: frameAt(beats.settled),
  };
}

/** Progress of `frame` through [start, end], eased; 0 before and 1 after. */
function progress(frame: number, start: number, end: number, ease: Easing): number {
  if (frame <= start) return ease(0);
  if (frame >= end) return ease(1);
  return ease((frame - start) / (end - start));
}

// ── The opening hit ─────────────────────────────────────────────────────────

/**
 * The spike of light that opens the title, frame by frame: biggest on the
 * first frame, a little bigger still on the second (follow-through), then
 * retracting in steps. Its horizontal rays span the screen at first, the
 * beam line the raster opens from.
 */
const OPENING_SPIKE: readonly Spike[] = [
  { core: 12, glow: 26, across: 170, up: 104, diagonal: 60 },
  { core: 10, glow: 30, across: 170, up: 120, diagonal: 70 },
  { core: 7, glow: 18, across: 120, up: 84, diagonal: 46 },
  { core: 5, glow: 11, across: 90, up: 60, diagonal: 32 },
  { core: 4, glow: 8, across: 70, up: 46, diagonal: 24 },
  { core: 3, glow: 6, across: 54, up: 36, diagonal: 18 },
  { core: 3, glow: 5, across: 40, up: 28, diagonal: 14 },
  { core: 2, glow: 4, across: 30, up: 20, diagonal: 10 },
  { core: 2, glow: 3, across: 22, up: 14, diagonal: 7 },
  { core: 2, glow: 3, across: 16, up: 10, diagonal: 5 },
  { core: 1, glow: 2, across: 10, up: 6, diagonal: 3 },
  { core: 1, glow: 2, across: 6, up: 4, diagonal: 2 },
];
/** Reduced motion: no rays and no flare, just the beam spot glowing at the impact point. */
const CALM_SPIKE: Spike = { core: 1, glow: 3, across: 0, up: 0, diagonal: 0 };

/** The opening spike at `frame`, or `null` once it has retracted into the beam spot. */
export function openingSpike(frame: number, reducedMotion: boolean): Spike | null {
  const spike = OPENING_SPIKE[frame];
  if (frame < 0 || !spike) return null;
  return reducedMotion ? CALM_SPIKE : spike;
}

/** Frames the beam spot takes to travel from the impact point to where the line starts. */
const BEAM_FRAMES = POWER_UP_FRAMES - OPENING_SPIKE.length;

/**
 * Where the beam spot is while it travels to the line's first point, so
 * the eye follows it from the centre to the y axis just as the line starts
 * writing; `null` outside the trip, and always under reduced motion, where
 * the line simply starts.
 */
export function beamAt(frame: number, from: Vec2, to: Vec2, reducedMotion: boolean): Vec2 | null {
  const step = frame - OPENING_SPIKE.length;
  if (reducedMotion || step < 0 || step >= BEAM_FRAMES) return null;
  const travel = easeInOutQuad((step + 1) / BEAM_FRAMES);
  return { x: Math.round(from.x + (to.x - from.x) * travel), y: Math.round(from.y + (to.y - from.y) * travel) };
}

/** Rows the raster has opened per frame, each way from the impact row. */
const RASTER_SPEED = 10;

/**
 * How far the lit raster reaches above and below the impact row, like a
 * tube warming up from a line; `Infinity` while the whole screen is lit.
 * The hit's first frame pops the whole tube on for an instant (an impact
 * frame), then it opens from the beam line. Under reduced motion the whole
 * glass is there from the first frame and brightens in steps instead
 * (`glassBoost`).
 */
export function rasterReach(frame: number, reducedMotion: boolean): number {
  if (reducedMotion || frame === 0 || frame >= POWER_UP_FRAMES) return Number.POSITIVE_INFINITY;
  return Math.max(0, (frame - 1) * RASTER_SPEED);
}

/** The rows the raster opened on one frame, counted from the impact row: (from, to]. */
export interface RasterEdge {
  readonly from: number;
  readonly to: number;
}

/** The rows the raster opened on this very frame glow hotter than the rest, like a beam's leading edge. */
export function rasterEdge(frame: number, reducedMotion: boolean): RasterEdge | null {
  const to = rasterReach(frame, reducedMotion);
  if (!Number.isFinite(to) || to === 0) return null;
  return { from: rasterReach(frame - 1, reducedMotion), to };
}

/** How far a hit overdrives the glass, in levels. */
export const IMPACT_BOOST = 3;
/** Once the flash clears, the overdriven glass cools a level every this many frames. */
const COOL_FRAMES = 3;

/** Under reduced motion the glass powers up from this many levels below rest, two levels at a time. */
const CALM_POWER_UP = { from: -4, framesPerStep: 6 } as const;

/**
 * How many levels off rest the whole glass sits. The opening's impact
 * frame overdrives it; so does the break through the ceiling, which holds
 * under the scene's flash and then cools in steps, so the flash fades into
 * the settled screen through the tube's own afterglow. Under reduced motion
 * there is no flash to answer: the glass just powers up from dim in steps.
 */
export function glassBoost(frame: number, cues: GrowthCues, reducedMotion: boolean): number {
  if (reducedMotion) return Math.min(0, CALM_POWER_UP.from + 2 * Math.floor(frame / CALM_POWER_UP.framesPerStep));
  if (frame === 0) return IMPACT_BOOST;
  if (frame < cues.breach) return 0;
  if (frame < cues.settled) return IMPACT_BOOST;
  return Math.max(0, IMPACT_BOOST - Math.floor((frame - cues.settled) / COOL_FRAMES));
}

/** Grid strips, one grid row tall, light up outward from the strip holding the impact row, one per frame. */
export const STRIP = { top: 2, height: 12 } as const;
/** The first strip lights this many frames in, once the raster has opened past it. */
const STRIP_DELAY = 3;
/** Under reduced motion the strips wait for the glass to finish brightening. */
const CALM_STRIP_DELAY = 6;
const STRIP_SEED = 0x1996;

/** The strip that holds row `y`. */
export function stripOf(y: number): number {
  return Math.max(0, Math.floor((y - STRIP.top) / STRIP.height));
}

/**
 * Whether grid strip `strip` is lit: it comes on once the power-up reaches
 * it (one strip per frame, outward from the impact strip) and most strips
 * stutter once or twice like a tube catching. Reduced motion skips the
 * stutter.
 */
export function stripLit(strip: number, impactStrip: number, frame: number, reducedMotion: boolean): boolean {
  const on = STRIP_DELAY + Math.abs(strip - impactStrip) + (reducedMotion ? CALM_STRIP_DELAY : 0);
  if (frame < on) return false;
  if (reducedMotion) return true;
  // Seven strips in ten drop out on their second frame and three in ten again on their fourth.
  const stutter = hash2(strip, 0, STRIP_SEED);
  if (frame === on + 1) return stutter > 0.7;
  if (frame === on + 3) return stutter > 0.3;
  return true;
}

// ── The line ────────────────────────────────────────────────────────────────

/** The trace's two landmarks, as indices into its pixels. */
export interface TraceShape {
  /** The flat start's last pixel. */
  readonly elbow: number;
  /** The breach: the last pixel. */
  readonly last: number;
}

/**
 * Index of the line's head along the trace, or −1 before it starts. It
 * eases along the flat start, crawling into the trough of sorrow, rests at
 * the turn, then rockets up the blade, accelerating, to land on the ceiling
 * exactly as the words lock. Reduced motion rockets less violently.
 */
export function headIndex(frame: number, cues: GrowthCues, shape: TraceShape, reducedMotion: boolean): number {
  if (frame < cues.draw) return -1;
  if (frame < cues.turn) return Math.round(progress(frame, cues.draw, cues.turn, easeInOutQuad) * shape.elbow);
  if (frame < cues.rocket) return shape.elbow;
  const rocket = progress(frame, cues.rocket, cues.breach, reducedMotion ? easeInOutQuad : easeInCubic);
  return shape.elbow + Math.round(rocket * (shape.last - shape.elbow));
}

/** Frames the phosphor takes to cool from white-hot to rest, one shade per frame. */
export const AFTERGLOW_FRAMES = 3;

// ── The scale and the bars ──────────────────────────────────────────────────

/** The count lands this many frames before the turn, so the scale is still by the time the line holds. */
const COUNT_LEAD = 4;

/** The top tick label counts up from zero while the line draws, like a terminal sizing its scale. */
export function scaleCount(frame: number, cues: GrowthCues, top: number): number {
  return Math.round(progress(frame, cues.draw, cues.turn - COUNT_LEAD, easeOutCubic) * top);
}

const BAR_RISE_FRAMES = 6;

/**
 * A bar's height while it rises: it springs up from the floor with an
 * overshoot (none under reduced motion, and slower) from frame `start`.
 */
export function risingHeight(target: number, start: number, frame: number, reducedMotion: boolean): number {
  const frames = reducedMotion ? BAR_RISE_FRAMES * 2 : BAR_RISE_FRAMES;
  return Math.round(target * progress(frame, start, start + frames, reducedMotion ? easeOutCubic : easeOutBack));
}

/** The bars past the turn start surging this many frames before the head gets there. */
const SURGE_LEAD = 2;

/**
 * When each bar starts to rise: as the head passes over it, so the bars
 * fill in behind the line, and the ones past the turn pop up one per frame
 * as the head arrives and holds, pointing the way up.
 */
export function barRiseStarts(
  centers: readonly number[],
  headX: (frame: number) => number,
  cues: GrowthCues,
): number[] {
  let surge = 0;
  return centers.map((center) => {
    for (let frame = cues.draw; frame < cues.turn; frame++) {
      if (headX(frame) >= center) return frame;
    }
    return cues.turn - SURGE_LEAD + surge++;
  });
}

// ── The breach ──────────────────────────────────────────────────────────────

/** Frames since the line broke the ceiling, or `null` before. */
export function burstAge(frame: number, cues: GrowthCues): number | null {
  return frame >= cues.breach ? frame - cues.breach : null;
}

/** The smaller spike that lights the breach, frame by frame from the break; its horizontal rays run along the ceiling. */
const BREACH_SPIKE: readonly Spike[] = [
  { core: 3, glow: 8, across: 48, up: 40, diagonal: 26 },
  { core: 3, glow: 9, across: 56, up: 46, diagonal: 30 },
  { core: 2, glow: 6, across: 36, up: 30, diagonal: 18 },
  { core: 2, glow: 4, across: 22, up: 18, diagonal: 10 },
  { core: 1, glow: 2, across: 12, up: 10, diagonal: 6 },
  { core: 1, glow: 1, across: 6, up: 4, diagonal: 3 },
];

/** The breach's spike at `frame`, or `null`: none before the break, after it has faded, or under reduced motion. */
export function breachSpike(frame: number, cues: GrowthCues, reducedMotion: boolean): Spike | null {
  const age = burstAge(frame, cues);
  if (age === null || reducedMotion) return null;
  return BREACH_SPIKE[age] ?? null;
}

/** How far above the ceiling the head pokes, frame by frame from the break: it punches through, overshoots and settles. */
const TIP_RISE = [9, 11, 9, 7] as const;
/** Where it then rests and blinks as the cursor. */
export const TIP_REST = 6;

/** How far above the ceiling the head pokes at `frame`; reduced motion puts it straight at rest. */
export function tipRise(frame: number, cues: GrowthCues, reducedMotion: boolean): number {
  const age = burstAge(frame, cues);
  if (age === null) return 0;
  if (reducedMotion) return TIP_REST;
  return TIP_RISE[age] ?? TIP_REST;
}
