/**
 * How much the room draws (docs/ROOM.md › Quality): a tier, which fixes what a frame is made of, and a scale, which the
 * governor moves within a tier from measured frame times. The look is the same on every tier: fewer
 * pixels, no multisampling and a narrower bloom filter are all a lower one gives up.
 */
export type QualityTier = 'high' | 'medium' | 'low';

export interface TierSettings {
  /** Upper bound for devicePixelRatio. */
  readonly maxPixelRatio: number;
  /** Upper bound for drawing-buffer pixels (width × height) at scale 1. */
  readonly maxPixels: number;
  /** Samples of the scene's render target (0: none; edges then rely on the pixel density). */
  readonly samples: number;
  /** The composite's bloom: five taps a level (true) or one for the near and far levels (false). */
  readonly wideBloom: boolean;
}

export const QUALITY_TIERS: Readonly<Record<QualityTier, TierSettings>> = {
  // 3 MP keeps the CRT's scanlines crisp on retina laptops while bounding fill cost on 4K.
  high: { maxPixelRatio: 2, maxPixels: 3_000_000, samples: 2, wideBloom: true },
  // A phone at 2×: the picture `high` draws there, from smaller baked pages (gen/tiers.ts); a laptop that dropped here
  // draws half its pixels.
  medium: { maxPixelRatio: 2, maxPixels: 1_600_000, samples: 2, wideBloom: true },
  low: { maxPixelRatio: 1.5, maxPixels: 900_000, samples: 0, wideBloom: false },
};

/**
 * The scales a tier is drawn at, as fractions of its pixel ratio. The last is the floor of the lowest tier alone: a
 * tier above it stops one short (`scalesOf`), since what it would draw there, the tier below draws for less with more
 * pixels (docs/ROOM.md › Quality › An overloaded device), and a device that needs so little belongs on that tier.
 */
export const QUALITY_SCALES: readonly number[] = [1, 0.85, 0.7, 0.6];
/** The scale a tier starts at when the governor drops to it without knowing its pixels: about where the one above left off. */
const DROPPED_SCALE = 0.7;

export interface Quality {
  readonly tier: QualityTier;
  readonly scale: number;
}

export interface DeviceFacts {
  /** A software renderer (stage/softwareGpu.ts). */
  readonly software: boolean;
  /** The primary pointer is a finger. */
  readonly coarse: boolean;
  /** The screen's shorter side, CSS px. */
  readonly shortSide: number;
}

/**
 * The tier a device starts on, from what it is rather than what it calls itself: a software renderer draws the least,
 * a phone (a finger for a pointer, a screen under 600 CSS px across) starts on the middle tier, anything else at full
 * quality. The governor corrects it from there, downwards only.
 */
export function startingTier(facts: DeviceFacts): QualityTier {
  if (facts.software) return 'low';
  return facts.coarse && facts.shortSide < 600 ? 'medium' : 'high';
}

/** The pixel ratio a quality draws a `width` × `height` (CSS px) canvas at on a display of `devicePixelRatio`. */
export function pixelRatioFor(quality: Quality, width: number, height: number, devicePixelRatio: number): number {
  const tier = QUALITY_TIERS[quality.tier];
  return Math.min(devicePixelRatio, tier.maxPixelRatio, Math.sqrt(tier.maxPixels / (width * height))) * quality.scale;
}

/** The interval frames are meant to come at unless the display says otherwise: a 60 Hz frame (ms). */
export const FRAME_MS = 1000 / 60;
/**
 * A run's mean frame interval above which the scale steps down: under about 47 frames a second. This and the two
 * below are for frames meant to come sixty a second; where they are meant to come slower (`QualityGovernor.expect`)
 * all three stretch with them.
 */
export const SLOW_FRAME_MS = 21;
/** The interval a step down aims for: a 60 Hz frame, with some room. */
const TARGET_FRAME_MS = 15;
/** At or under this, every frame of a 60 Hz display arrived on time, and the scale may try a step back up. */
export const FAST_FRAME_MS = 17.4;
/** Frames judged together, by their mean without the two longest: an upload or a collection says nothing. */
export const GOVERNOR_WINDOW = 30;
/** An interval this long is a pause (a hidden tab, a debugger), not a frame. */
const PAUSE_MS = 250;
/** After a change, the frames of this long are not judged: the new targets' first frames are not typical. */
const SETTLE_MS = 400;
/** The wait before a step back up, doubled by every step down, up to the cap. */
const UP_DELAY_MS = 15_000;
const UP_DELAY_CAP_MS = 240_000;
/** A step down must shorten the frames by this much, or they were never waiting for pixels. */
const RESPONDS = 0.92;
/** The governor's rest after a step down that did not help. */
const REST_MS = 60_000;
/** Slow windows in a row, the last of them at the tier's floor, before the tier drops. */
const FLOOR_HITS = 2;
/** Frames this much quicker than they were expected to come say the display ticks faster again (a cap that went). */
const UNCAPPED = 0.75;
/** A display whose frames come within this of sixty a second is taken to tick at sixty. */
const SIXTY_MARGIN = 1.2;

/**
 * The interval the room's frames are meant to come at on a display whose own frames come `tickMs` apart (the quickest
 * seen before the room draws anything): a 60 Hz frame for anything about that fast or faster (the loop paces a faster
 * display down, RenderLoop.pace), the display's own for one that ticks slower. Safari in Low Power Mode hands out
 * thirty frames a second, on a phone or a laptop, however quick its GPU.
 */
export function expectedFrameMs(tickMs: number): number {
  return ticksAtSixty(tickMs) ? FRAME_MS : tickMs;
}

/** Whether frames `tickMs` apart are those of a display that hands out sixty a second or more. */
export function ticksAtSixty(tickMs: number): boolean {
  return tickMs < FRAME_MS * SIXTY_MARGIN;
}

const TIERS: readonly QualityTier[] = ['high', 'medium', 'low'];

/** The scales `tier` is drawn at, best first: every scale on the lowest tier, all but the last on the others. */
export function scalesOf(tier: QualityTier): readonly number[] {
  return tier === TIERS[TIERS.length - 1] ? QUALITY_SCALES : QUALITY_SCALES.slice(0, -1);
}

/**
 * The first quality from `from` down (its own tier's scales first if `sameTier`, then the tiers below, each from its
 * best scale) whose pixels (`pixelsOf`) are within `budget`; the last looked at when none is.
 */
function fitting(from: Quality, budget: number, pixelsOf: (quality: Quality) => number, sameTier: boolean): Quality {
  let last = from;
  for (const tier of TIERS.slice(TIERS.indexOf(from.tier) + (sameTier ? 0 : 1)))
    for (const scale of scalesOf(tier)) {
      if (tier === from.tier && scale > from.scale) continue;
      last = { tier, scale };
      if (pixelsOf(last) <= budget) return last;
    }
  return last;
}

/** A frame measured before the room is shown is too slow only past this many 60 Hz frames: no quick GPU steps down. */
export const FIT_MARGIN = 1.5;

/**
 * The quality a device should start on when one frame at `start` took its GPU `frameMs` (the quickest of a few, timed
 * before the room is shown: docs/ROOM.md › Quality): `start` unless the frame is clearly over a 60 Hz frame, else the
 * first step down the scales and tiers whose pixels (`pixelsOf`) would bring it to the governor's target, pixels
 * being what a frame's GPU time is mostly made of; the floor when none does. The governor goes on from there.
 */
export function fittingQuality(start: Quality, frameMs: number, pixelsOf: (quality: Quality) => number): Quality {
  if (!(frameMs > (1000 / 60) * FIT_MARGIN)) return start;
  return fitting(start, (pixelsOf(start) * TARGET_FRAME_MS) / frameMs, pixelsOf, true);
}

/**
 * Moves the quality with the measured frame intervals of runs of frames (the game on the TV, a flight), the way a
 * console game's dynamic resolution does. Slower than 21 ms a frame, the scale steps down far enough to reach 15 ms,
 * pixels being what a frame's GPU time is mostly made of; at its tier's floor and slow for the second window running,
 * the tier drops, straight to the tier and scale whose pixels the frames say fit (an overloaded device is on the
 * lowest tier two windows after it is found slow, not after a tour of every scale above it), and never comes back
 * this page load. While every frame is on time the scale tries a step back up, after a wait every step down doubles;
 * a step up that the very next window finds slow is taken back and that scale is not tried again, so a device on the
 * edge settles instead of pumping. A step down that does not shorten the frames
 * undoes itself and rests the governor a minute: whatever was slow was not the pixels (a busy main thread, a display
 * that ticks no faster), and from then on frames are expected to come as they did, so it is not tried again every
 * minute for as long as the page is open.
 *
 * All of it is measured against the interval frames are meant to come at (`expect`): a 60 Hz frame, or the display's
 * own where it ticks slower. A phone in Low Power Mode draws thirty frames a second whatever it is asked: judged
 * against sixty it looked slow for good, and the scale went to its floor and back, a resize each way, every minute.
 */
export class QualityGovernor {
  private current: Quality;
  private readonly samples: number[] = [];
  private settledAt = 0;
  private upDelay = UP_DELAY_MS;
  private upAt = UP_DELAY_MS;
  /** Slow windows in a row. */
  private slow = 0;
  /** The best scale still tried on this tier, as an index: a step up that did not hold is not made again. */
  private top = 0;
  /** The last change was a step up, and its first window is still to come. */
  private raised = false;
  /** The step down under trial: where it came from and the interval it has to beat. */
  private trial: { readonly from: Quality; readonly ms: number } | null = null;
  /** The interval frames are meant to come at (ms): what the display hands out, and no step of quality changes. */
  private expected = FRAME_MS;
  /** `expected` as the display said it (`expect`), or as quicker frames have since shown it. */
  private displayMs = FRAME_MS;
  private changed = 0;
  /** The quality as it stands has not had a window of its own yet, or its last one left a question open. */
  private open: boolean;

  /** `pixelsOf`: the pixels a quality draws here, so a tier is dropped to the scale that fits (else to a fixed one). */
  constructor(
    start: Quality,
    private readonly fixed = false,
    private readonly pixelsOf: ((quality: Quality) => number) | null = null,
  ) {
    this.current = start;
    this.open = !fixed;
  }

  /**
   * Whether the governor still has to see a window of frames at full pace before the room may rest: at the start,
   * after every change of quality (a step down is on trial, a step up may not hold) and while a floor is being
   * counted out. A resting room's frames say nothing of the device (they come when they are due), so it rests only
   * once its quality has been found to hold.
   */
  get judging(): boolean {
    return this.open;
  }

  get quality(): Quality {
    return this.current;
  }

  /** Starts over from `quality` at `now` (a frame was measured before the room was shown); not where it is fixed. */
  start(quality: Quality, now: number): void {
    if (!this.fixed) this.change(quality, now);
  }

  /** Whether the quality is fixed (a tier asked for, a software renderer, a browser under automation). */
  get isFixed(): boolean {
    return this.fixed;
  }

  /** The interval frames are meant to come at (ms), and judged against. */
  get frameMs(): number {
    return this.expected;
  }

  /** The display hands out fewer frames than sixty a second (Low Power Mode's thirty): nothing here can add any. */
  get capped(): boolean {
    return this.displayMs >= FRAME_MS * SIXTY_MARGIN;
  }

  /** How often the quality has changed this page load (each one a resize). */
  get changes(): number {
    return this.changed;
  }

  /** The display hands out a frame every `frameMs` (`expectedFrameMs`): what frames are judged against from now on. */
  expect(frameMs: number): void {
    this.displayMs = frameMs;
    this.expected = frameMs;
    this.samples.length = 0;
    this.open = !this.fixed;
  }

  /** A frame of a run came `ms` after the one before it, at `now`. Returns the new quality when it changes it. */
  sample(ms: number, now: number): Quality | null {
    if (this.fixed || now < this.settledAt || ms > PAUSE_MS) return null;
    this.samples.push(ms);
    if (this.samples.length < GOVERNOR_WINDOW) return null;
    const kept = this.samples.sort((a, b) => a - b).slice(0, -2);
    const mean = kept.reduce((sum, value) => sum + value, 0) / kept.length;
    this.samples.length = 0;

    const trial = this.trial;
    this.trial = null;
    // This window answers what was open; a change below opens it again.
    this.open = false;
    if (trial && mean > trial.ms * RESPONDS) {
      this.upAt = now + REST_MS;
      // Whatever the frames wait for, it is not their pixels: this is how they come.
      this.expected = Math.max(this.expected, mean);
      const back = this.change(trial.from, now + REST_MS);
      // Nothing is judged for a minute, and nothing waits for it.
      this.open = false;
      return back;
    }
    // A display's tick is the one thing no frame beats. Four frames of the window well ahead of it: the display hands
    // out frames faster than was taken (Low Power Mode switched off, a first look at the display that a busy page
    // made too slow), whatever the others waited for. The quickest frames say how fast, never the mean: a GPU that
    // misses frames of a 60 Hz display is slow, not capped.
    const quick = Math.min(mean, kept[3] ?? mean);
    if (quick < this.displayMs * UNCAPPED) {
      this.displayMs = expectedFrameMs(quick);
      this.expected = this.displayMs;
    } else if (mean < this.expected * UNCAPPED) {
      // Frames well ahead of how they came when a step down changed nothing (a main thread that is free again): the
      // display's own are what to expect again.
      this.expected = this.displayMs;
    }
    // What a 60 Hz frame's limits are for the frames expected here.
    const stretch = this.expected / FRAME_MS;
    const scales = scalesOf(this.current.tier);
    const at = scales.indexOf(this.current.scale);
    // A scale the tier does not have (one it was started on) is its floor.
    const step = at < 0 ? scales.length - 1 : at;
    const raised = this.raised;
    this.raised = false;
    if (mean > SLOW_FRAME_MS * stretch) {
      this.slow++;
      this.upDelay = Math.min(UP_DELAY_CAP_MS, this.upDelay * 2);
      this.upAt = now + this.upDelay;
      if (raised) {
        // The step up this window followed did not hold: back to the scale that did, and never above it again.
        this.top = step + 1;
        return this.change({ tier: this.current.tier, scale: scales[step + 1] ?? this.current.scale }, now);
      }
      if (step < scales.length - 1) {
        // A frame's time goes with its pixels, the square of the scale.
        const wanted = this.current.scale * Math.sqrt((TARGET_FRAME_MS * stretch) / mean);
        let next = step + 1;
        while (next < scales.length - 1 && (scales[next] ?? 0) > wanted) next++;
        this.trial = { from: this.current, ms: mean };
        return this.change({ tier: this.current.tier, scale: scales[next] ?? this.current.scale }, now);
      }
      const lower = TIERS[TIERS.indexOf(this.current.tier) + 1];
      if (lower && this.slow >= FLOOR_HITS) {
        this.slow = 0;
        this.top = 0;
        const budget = this.pixelsOf ? (this.pixelsOf(this.current) * TARGET_FRAME_MS * stretch) / mean : 0;
        return this.change(
          this.pixelsOf ? fitting(this.current, budget, this.pixelsOf, false) : { tier: lower, scale: DROPPED_SCALE },
          now,
        );
      }
      // A floor that is slow once more drops the tier: the next window says.
      this.open = lower !== undefined;
      return null;
    }
    this.slow = 0;
    if (mean <= FAST_FRAME_MS * stretch && step > this.top && now >= this.upAt) {
      this.upAt = now + this.upDelay;
      this.raised = true;
      return this.change({ tier: this.current.tier, scale: scales[step - 1] ?? 1 }, now);
    }
    return null;
  }

  private change(next: Quality, now: number): Quality {
    if (next.tier !== this.current.tier || next.scale !== this.current.scale) this.changed++;
    this.current = next;
    this.settledAt = now + SETTLE_MS;
    this.open = !this.fixed;
    return next;
  }
}
