/**
 * The floating discs' idle drift costs at most 30 frames a second (docs/ROOM.md › The CD player): a timer asks for
 * one frame every 33 ms, and only when no frame of any cause was drawn in the last 30 ms, and only while it should
 * run at all: settled at the radio, the stage on screen, the visitor attentive, motion allowed, not the slow tier.
 * When the float comes to rest the timer stops and the radio view renders nothing.
 */

export const AMBIENT_INTERVAL_MS = 33;
/** A frame drawn this recently for another reason already shows the drift. */
export const AMBIENT_MIN_GAP_MS = 30;

export interface AmbientPacerOptions {
  /** Whether ambient frames are wanted right now (every condition above). */
  readonly wanted: () => boolean;
  /** When the last frame of any cause was drawn (ms, the frame clock). */
  readonly lastFrame: () => number;
  readonly now: () => number;
  /** Ask for one frame that applies the drift. */
  readonly frame: () => void;
  readonly setTimer?: (run: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export class AmbientPacer {
  #timer: unknown = null;
  readonly #setTimer: (run: () => void, ms: number) => unknown;
  readonly #clearTimer: (handle: unknown) => void;

  readonly #options: AmbientPacerOptions;

  constructor(options: AmbientPacerOptions) {
    this.#options = options;
    this.#setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
    this.#clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** Ambient frames are being scheduled. */
  get running(): boolean {
    return this.#timer !== null;
  }

  /** Starts or stops ticking to match `wanted()`; call whenever a condition may have changed. */
  sync(): void {
    if (!this.#options.wanted()) {
      this.stop();
      return;
    }
    if (this.#timer === null) this.#timer = this.#setTimer(this.#tick, AMBIENT_INTERVAL_MS);
  }

  stop(): void {
    if (this.#timer !== null) this.#clearTimer(this.#timer);
    this.#timer = null;
  }

  readonly #tick = (): void => {
    this.#timer = null;
    if (!this.#options.wanted()) return;
    if (this.#options.now() - this.#options.lastFrame() >= AMBIENT_MIN_GAP_MS) this.#options.frame();
    this.#timer = this.#setTimer(this.#tick, AMBIENT_INTERVAL_MS);
  };
}
