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
  // A phone at 2×: the picture `high` draws there, from smaller atlases; a laptop that dropped here draws half its pixels.
  medium: { maxPixelRatio: 2, maxPixels: 1_600_000, samples: 2, wideBloom: true },
  low: { maxPixelRatio: 1.5, maxPixels: 900_000, samples: 0, wideBloom: false },
};

/** The scales a tier is drawn at, as fractions of its pixel ratio. The last is the floor. */
export const QUALITY_SCALES: readonly number[] = [1, 0.85, 0.7, 0.6];
/** The scale a tier starts at when the governor drops to it: about where the one above left off. */
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

/** A run's mean frame interval above which the scale steps down: under about 47 frames a second. */
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
/** Slow windows at the floor before the tier drops. */
const FLOOR_HITS = 2;

const TIERS: readonly QualityTier[] = ['high', 'medium', 'low'];

/**
 * Moves the quality with the measured frame intervals of runs of frames (the game on the TV, a flight), the way a
 * console game's dynamic resolution does. Slower than 21 ms a frame, the scale steps down far enough to reach 15 ms,
 * pixels being what a frame's GPU time is mostly made of; at the floor and still slow twice, the tier drops, and never
 * comes back this page load. While every frame is on time the scale tries a step back up, after a wait every step
 * down doubles, so a device on the edge settles instead of pumping. A step down that does not shorten the frames
 * undoes itself and rests the governor a minute: whatever was slow was not the pixels (a busy main thread).
 */
export class QualityGovernor {
  private current: Quality;
  private readonly samples: number[] = [];
  private settledAt = 0;
  private upDelay = UP_DELAY_MS;
  private upAt = UP_DELAY_MS;
  private floorHits = 0;
  /** The step down under trial: where it came from and the interval it has to beat. */
  private trial: { readonly from: Quality; readonly ms: number } | null = null;

  constructor(
    start: Quality,
    private readonly fixed = false,
  ) {
    this.current = start;
  }

  get quality(): Quality {
    return this.current;
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
    if (trial && mean > trial.ms * RESPONDS) {
      this.upAt = now + REST_MS;
      return this.change(trial.from, now + REST_MS);
    }
    const step = QUALITY_SCALES.indexOf(this.current.scale);
    if (mean > SLOW_FRAME_MS) {
      this.upDelay = Math.min(UP_DELAY_CAP_MS, this.upDelay * 2);
      this.upAt = now + this.upDelay;
      if (step < QUALITY_SCALES.length - 1) {
        // A frame's time goes with its pixels, the square of the scale.
        const wanted = this.current.scale * Math.sqrt(TARGET_FRAME_MS / mean);
        let next = step + 1;
        while (next < QUALITY_SCALES.length - 1 && (QUALITY_SCALES[next] ?? 0) > wanted) next++;
        this.floorHits = 0;
        this.trial = { from: this.current, ms: mean };
        return this.change({ tier: this.current.tier, scale: QUALITY_SCALES[next] ?? this.current.scale }, now);
      }
      const lower = TIERS[TIERS.indexOf(this.current.tier) + 1];
      if (lower && ++this.floorHits >= FLOOR_HITS) {
        this.floorHits = 0;
        return this.change({ tier: lower, scale: DROPPED_SCALE }, now);
      }
      return null;
    }
    this.floorHits = 0;
    if (mean <= FAST_FRAME_MS && step > 0 && now >= this.upAt) {
      this.upAt = now + this.upDelay;
      return this.change({ tier: this.current.tier, scale: QUALITY_SCALES[step - 1] ?? 1 }, now);
    }
    return null;
  }

  private change(next: Quality, now: number): Quality {
    this.current = next;
    this.settledAt = now + SETTLE_MS;
    return next;
  }
}
