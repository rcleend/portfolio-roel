import { STEP_SECONDS } from '@/engine/core/FixedLoop';

/** A moment worth jumping to, in frames from the start of the scene. */
export interface Beat {
  readonly frame: number;
  readonly label: string;
}

/** The stretch of a scene the scrubber covers, and its beats. */
export interface Timeline {
  readonly frames: number;
  /** The scene starts over every `frames`, as the showcase's demos do, so the scrubber wraps with it. */
  readonly loops: boolean;
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

/** Where the clock's `frame` falls on the timeline: wrapped for a loop, held at the end otherwise. */
export function positionOn(timeline: Timeline, frame: number): number {
  return timeline.loops ? frame % timeline.frames : Math.min(frame, timeline.frames);
}

/** The beat the clock's `frame` falls in, or `null` past the end of a timeline that does not loop. */
export function beatAt(timeline: Timeline, frame: number): Beat | null {
  if (!timeline.loops && frame > timeline.frames) return null;
  const position = positionOn(timeline, frame);
  return timeline.beats.findLast((beat) => beat.frame <= position) ?? null;
}
