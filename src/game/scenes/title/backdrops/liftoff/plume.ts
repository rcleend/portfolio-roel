import { Rng } from '@/engine/math/Rng';
import { easeOutCubic } from '@/engine/motion/easing';
import type { TitleBeats } from '../../titleTimeline';
import type { PuffPose } from './billow';
import { STAGE } from './layout';
import { timeAtLift } from './timeline';

/**
 * The exhaust column the rocket leaves standing over the pad, the settled
 * title's one focal motion. Each puff forms as the rocket's nozzle passes
 * its altitude, swells out (easeOut), then keeps widening very slowly while
 * the wind carries it sideways. The wind turns with height, so the column
 * shears into a lazy S over the idle loop: about a pixel every two seconds
 * at the top, never a jump.
 */
export interface PlumePuff {
  /** Where it forms, in screen pixels. */
  readonly x: number;
  readonly y: number;
  /** How far the nozzle has climbed when it passes. */
  readonly lift: number;
  /** Radius once formed, then how fast it keeps widening, in pixels per second. */
  readonly radius: number;
  readonly widen: number;
  /** Sideways drift, in pixels per second: right low down, left high up. */
  readonly wind: number;
  /** Above the terminator the plume still catches the sun. */
  readonly sunlit: boolean;
}

/** How long a puff takes to swell out after the nozzle passes. */
const FORM_SECONDS = 0.45;
/** Rows between puffs along the column, bottom to top. */
const SPACING = 5;
const BOTTOM = STAGE.pad.y - 8;
const TOP = -10;
const SEED = 0x91c3;

/** Poses `puff` at `time` into `pose`; false until the rocket has passed it. */
export function posePlumePuff(puff: PlumePuff, time: number, beats: TitleBeats, pose: PuffPose): boolean {
  const age = time - timeAtLift(puff.lift, beats);
  if (age < 0) return false;
  const formed = easeOutCubic(Math.min(1, age / FORM_SECONDS));
  pose.x = Math.round(puff.x + puff.wind * age);
  pose.y = puff.y;
  pose.radius = Math.round(1 + (puff.radius - 1) * formed + puff.widen * Math.max(0, age - FORM_SECONDS));
  return true;
}

/**
 * Puffs from the pad to above the top of the screen, in a seeded drawing
 * order so the column reads as a tangle, not a stack. Lay it out once,
 * while the backdrop paints.
 */
export function layoutPlume(): PlumePuff[] {
  const rng = new Rng(SEED);
  const puffs: PlumePuff[] = [];
  for (let y = BOTTOM; y >= TOP; y -= SPACING) {
    const height = (BOTTOM - y) / (BOTTOM - TOP);
    // Thick where the rocket was slow near the ground, thinnest mid-air, spreading again in the thin air up high.
    const radius = 3.5 + 3.5 * Math.max(0, 1 - height / 0.12) + 3.5 * Math.max(0, (height - 0.55) / 0.45);
    puffs.push({
      x: STAGE.pad.x + Math.round(2 * Math.sin(Math.PI * height)) + rng.int(-1, 1),
      y,
      lift: STAGE.pad.y - y,
      radius: radius + rng.range(-0.6, 0.6),
      // Low down the column barely spreads, so it stays a slim silhouette behind the prompt.
      widen: 0.03 + 0.24 * height ** 1.5,
      wind: 0.55 * Math.sin(2 * Math.PI * (height * 0.85 + 0.05)) * (0.3 + height),
      sunlit: y < STAGE.terminator,
    });
  }
  return puffs
    .map((puff) => ({ puff, order: rng.next() }))
    .sort((a, b) => a.order - b.order)
    .map(({ puff }) => puff);
}
