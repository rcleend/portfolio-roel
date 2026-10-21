export const STEP_HZ = 60;
export const STEP_SECONDS = 1 / STEP_HZ;
const STEP_MS = 1000 / STEP_HZ;

/**
 * Fixed-timestep accumulator. Converts irregular animation-frame timings into
 * a whole number of 60 Hz steps, so simulation never depends on display rate.
 */
export class FixedLoop {
  readonly maxSteps: number;
  readonly #stepMs: number;
  readonly #tolerance: number;
  #accumulator = 0;

  /**
   * @param maxSteps Upper bound on catch-up steps per frame. Time beyond it is
   *   dropped: after a long stall the game slows down instead of spiralling.
   */
  constructor(maxSteps = 5, stepMs = STEP_MS) {
    this.maxSteps = maxSteps;
    this.#stepMs = stepMs;
    // Displays deliver 16.6–16.8 ms frames; a small tolerance stops 60 Hz screens from alternating 0 and 2 steps.
    this.#tolerance = stepMs * 0.05;
  }

  /** Adds elapsed wall time and returns how many steps to run now. */
  advance(elapsedMs: number): number {
    this.#accumulator += Math.max(0, elapsedMs);
    let steps = Math.floor((this.#accumulator + this.#tolerance) / this.#stepMs);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      this.#accumulator = 0;
      return steps;
    }
    this.#accumulator -= steps * this.#stepMs;
    return steps;
  }

  /** Forgets accumulated time, e.g. after a pause, so resuming does not fast-forward. */
  reset(): void {
    this.#accumulator = 0;
  }
}
