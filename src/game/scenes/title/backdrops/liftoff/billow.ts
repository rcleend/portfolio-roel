import { Rng } from '@/engine/math/Rng';
import { easeOutBackWith, easeOutCubic } from '@/engine/motion/easing';
import { valueNoise } from '../../../../art/logos/raster/noise';
import { STAGE } from './layout';

/**
 * The launch-pad billow, the backdrop's answer to the classic's crater.
 * Exhaust erupts from the flame trench at ignition and rolls out along the
 * ground to both sides in staggered puffs: each swells past its size and
 * settles back (overshoot), billows up on an arc and comes down as it
 * slows (easeOut). The first puffs out travel furthest, pushed on by the
 * exhaust behind them. Every puff is at rest before the title settles: a
 * mound around the pad thinning into a low bank along the horizon, which
 * from then on only rolls, by palette cycling.
 */
export interface BillowPuff {
  /** Where it bursts out: a trench mouth, or the foot of the rocket. */
  readonly fromX: number;
  readonly fromY: number;
  /** Where it comes to rest. */
  readonly toX: number;
  readonly toY: number;
  readonly radius: number;
  /** How high it billows on the way, in pixels above its straight path. */
  readonly rise: number;
  /** When it bursts out and how long it takes to roll to rest, in seconds of intro time. */
  readonly start: number;
  readonly travel: number;
  /** Offset into the palette cycle, so neighbours do not roll in step. */
  readonly phase: number;
  /** Drawn in front of the pad, so the rocket rises out of the smoke and the tower stands in it. */
  readonly front: boolean;
}

/** A puff's pose on one frame; written in place, so posing a whole bank allocates nothing. */
export interface PuffPose {
  x: number;
  y: number;
  radius: number;
}

/** The flame trench's mouths either side of the pad, where the exhaust comes out. */
export const TRENCH_MOUTH = { offset: 23, y: STAGE.pad.y + 3 } as const;
/** No puff hangs below this row, so the copyright line underneath stays on clean, dark ground. */
const FLOOR = STAGE.pad.y + 8;
/** Every puff is at rest by this time, before the title settles, so nothing jumps once it has. */
export const BILLOW_AT_REST = 1.4;
/** A puff reaches full size this far into its travel, swelling a little past it first. */
const SWELL = 0.55;
const swellEase = easeOutBackWith(2.2);
const SEED = 0x5a0e;

/** Poses `puff` at `time` into `pose`; false while it has not burst out yet. */
export function poseBillowPuff(puff: BillowPuff, time: number, pose: PuffPose): boolean {
  const progress = (time - puff.start) / puff.travel;
  if (progress < 0) return false;
  const t = Math.min(1, progress);
  const along = easeOutCubic(t);
  // Up early, then settling: (27 / 4)·t·(1 − t)² peaks at a third of the way and lands flat.
  const billow = puff.rise * 6.75 * t * (1 - t) ** 2;
  pose.x = Math.round(puff.fromX + (puff.toX - puff.fromX) * along);
  pose.y = Math.round(puff.fromY + (puff.toY - puff.fromY) * along - billow);
  pose.radius = Math.round(3 + (puff.radius - 3) * swellEase(Math.min(1, t / SWELL)));
  return true;
}

/** The bank's crest at rest: a mound over the pad thinning out to both sides, with soft lumps. */
function crest(x: number): number {
  const mound = 11 * Math.exp(-(((x - STAGE.pad.x) / 44) ** 2));
  const lumps = 3 * valueNoise(x, 0, 19, 1, SEED);
  return STAGE.horizon - 2 - mound - lumps;
}

/**
 * Every puff, back to front: the bank's body low along the ground and its
 * crest, both behind the pad and each from the far ends inwards, then the
 * pile at the rocket's foot in front of the pad. Seeded; lay it out once,
 * while the backdrop paints.
 */
export function layoutBillow(): BillowPuff[] {
  const rng = new Rng(SEED);
  const { x: padX } = STAGE.pad;
  const puff = (toX: number, toY: number, radius: number, rise: number, front: boolean): BillowPuff => {
    const reach = Math.min(1, Math.abs(toX - padX) / 150);
    const centre = Math.abs(toX - padX) < 12;
    return {
      fromX: centre ? padX : padX + Math.sign(toX - padX) * TRENCH_MOUTH.offset,
      fromY: TRENCH_MOUTH.y,
      toX,
      toY: Math.min(toY, FLOOR - radius),
      radius,
      rise,
      start: 0.02 + 0.35 * (1 - reach) + rng.range(0, 0.05),
      travel: 0.5 + 0.55 * reach,
      phase: rng.int(0, 5),
      front,
    };
  };
  const nearness = (x: number): number => Math.max(0, 1 - Math.abs(x - padX) / 150);
  const body: BillowPuff[] = [];
  for (let x = 2; x <= STAGE.width - 2; x += rng.range(9, 15)) {
    const radius = Math.round(5 + 5 * nearness(x) + rng.range(-1.5, 2.5));
    body.push(puff(x, FLOOR - radius, radius, 3 + 6 * nearness(x), false));
  }
  const crestPuffs: BillowPuff[] = [];
  for (let x = 6; x <= STAGE.width - 6; x += rng.range(5, 10)) {
    // Mostly small lumps along the crest, now and then a big one bulging over it.
    const bulge = rng.chance(0.25) ? rng.range(2, 4) : 0;
    const radius = Math.round(3 + 5 * nearness(x) + bulge + rng.range(-1, 1));
    crestPuffs.push(puff(x, crest(x) + radius - bulge, radius, 4 + 12 * nearness(x), false));
  }
  const foot: BillowPuff[] = Array.from({ length: 7 }, (_, i) =>
    puff(padX + (i - 3) * 6 + rng.range(-2, 2), FLOOR - 3 - (i % 2) * 3, rng.int(5, 8), 6, true),
  );
  const farFirst = (a: BillowPuff, b: BillowPuff): number => Math.abs(b.toX - padX) - Math.abs(a.toX - padX);
  return [...body.sort(farFirst), ...crestPuffs.sort(farFirst), ...foot.sort(farFirst)];
}
