import { easeOutExpo } from '@/engine/motion/easing';
import { frames, segment } from '@/engine/motion/progress';

/**
 * Timing of every animated beat on the select screen, as pure functions of
 * the seconds elapsed since the beat started. Keeping them here (and out of
 * the drawing code) makes the motion easy to tune and to test.
 */

/** The card's horizontal wipe when switching characters. Quick: the player is browsing. */
export const SWITCH_SECONDS = frames(12);

/** How long an arrow stays lit after it is pressed. */
export const ARROW_FLASH_SECONDS = frames(9);

/** After choosing: when the READY! stamp lands and when the screen leaves. */
export const STAMP_AT = frames(8);
export const LEAVE_AT = frames(54);

/**
 * Horizontal offsets of the incoming and outgoing card content during a
 * switch. `delta` +1 (next) brings the new character in from the right.
 */
export function switchOffsets(
  elapsed: number,
  delta: -1 | 1,
  width: number,
): { readonly incoming: number; readonly outgoing: number; readonly done: boolean } {
  const progress = segment(elapsed, 0, SWITCH_SECONDS, easeOutExpo);
  const incoming = Math.round(delta * width * (1 - progress));
  return { incoming, outgoing: incoming - delta * width, done: elapsed >= SWITCH_SECONDS };
}

/** The name heading settles from a few pixels off in the switch direction. */
export function nameOffset(elapsed: number, delta: -1 | 1): number {
  return Math.round(delta * 10 * (1 - segment(elapsed, 0, SWITCH_SECONDS, easeOutExpo)));
}

/**
 * Opacity of the white flash over the card after choosing: full for three
 * frames, then down in flat steps — a hard arcade flash, never a smooth fade.
 */
export function cardFlashAlpha(elapsed: number): number {
  const frame = Math.floor(elapsed * 60 + 1e-9);
  if (frame < 0) return 0;
  const levels = [1, 1, 1, 0.75, 0.75, 0.5, 0.5, 0.25, 0.25];
  return levels[frame] ?? 0;
}

/**
 * Height of the READY! banner as a fraction of its final height, frame by
 * frame after it lands: it snaps open, overshoots by a pixel or two and
 * settles. `null` before it lands.
 */
export function stampOpening(elapsed: number): number | null {
  const frame = Math.floor((elapsed - STAMP_AT) * 60 + 1e-9);
  if (frame < 0) return null;
  const opening = [0.12, 0.55, 1.12, 1];
  return opening[frame] ?? 1;
}

/** The card jolts by a pixel on the two frames after the stamp lands. */
export function stampJolt(elapsed: number): number {
  const frame = Math.floor((elapsed - STAMP_AT) * 60 + 1e-9);
  return frame === 2 ? 2 : frame === 3 ? -1 : 0;
}
