import { STEP_SECONDS } from '@/engine/core/FixedLoop';

/** A moment worth jumping to, in frames from the start of the scene. */
export interface Beat {
  readonly frame: number;
  readonly label: string;
}

/** The stretch of a scene the scrubber covers, and its beats. */
export interface Timeline {
  readonly frames: number;
  /** In time order; the first one starts at frame 0. */
  readonly beats: readonly Beat[];
}

/**
 * The first frame at which a scene's clock has reached `seconds`. Scenes
 * add up 1/60 s steps, and the sum drifts: 87 steps make 1.4499999… s, so a
 * cue at 1.45 s lands on frame 88, not on the 87 that rounding suggests.
 */
export function framesUntil(seconds: number): number {
  let time = 0;
  let frame = 0;
  while (time < seconds) {
    time += STEP_SECONDS;
    frame++;
  }
  return frame;
}

/** The beat `frame` falls in, or `null` past the end of the timeline. */
export function beatAt(timeline: Timeline, frame: number): Beat | null {
  if (frame > timeline.frames) return null;
  return timeline.beats.findLast((beat) => beat.frame <= frame) ?? null;
}
