import { IDLE_INTENT, type PlayerIntent } from '../../entities/player/Player';
import type { World } from '../../world/World';

/** The fixed step the showcase runs at; beats land on whole steps. */
const STEPS_PER_SECOND = 60;

/** One beat of a demo, timed in seconds into its loop. */
export type Beat =
  /** Input held over a span, e.g. running right or holding attack. */
  | { readonly from: number; readonly to: number; readonly hold: Partial<PlayerIntent> }
  /** A button pressed on one step. */
  | { readonly at: number; readonly press: 'jump' | 'skill1' | 'skill2' }
  /** Something no button does, e.g. stunning every customer at once. */
  | { readonly at: number; readonly act: (world: World) => void };

/**
 * Plays a list of beats as the hero's input, in the spirit of the autopilot:
 * everything scripted stays out here, and the world plays it like any other
 * input. Steps are counted, not timed, so every loop lands on the same frames.
 */
export class ScriptedInput {
  readonly #beats: readonly Beat[];

  constructor(beats: readonly Beat[]) {
    this.#beats = beats;
  }

  /** Fires the beats due on step `step` (1 is the loop's first) and returns the hero's input for it. */
  step(world: World, step: number): PlayerIntent {
    const on = (seconds: number) => Math.round(seconds * STEPS_PER_SECOND);
    let intent: PlayerIntent = IDLE_INTENT;
    for (const beat of this.#beats) {
      if ('hold' in beat) {
        if (step >= on(beat.from) && step < on(beat.to)) intent = { ...intent, ...beat.hold };
      } else if (step === on(beat.at)) {
        if ('act' in beat) beat.act(world);
        else if (beat.press === 'jump') intent = { ...intent, jumpPressed: true, jumpHeld: true };
        else intent = { ...intent, [beat.press === 'skill1' ? 'skill1Pressed' : 'skill2Pressed']: true };
      }
    }
    return intent;
  }
}
