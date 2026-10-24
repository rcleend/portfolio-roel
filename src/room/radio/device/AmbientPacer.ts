/**
 * The floating discs' idle drift costs at most 30 frames a second (docs/ROOM.md › The CD player), paced by the
 * display itself: while it should run at all — settled at the radio, the stage on screen, the visitor attentive,
 * motion allowed, not the slow tier — it watches each display frame and asks for a drawn one only when the frame it
 * would land on is a full interval after the last frame drawn for any cause. So a 60 Hz display draws every second
 * frame and a 120 Hz one every fourth, and frames drawn for something else (a spring, a key) already carry the drift.
 * When the float comes to rest it stops watching and the radio view renders nothing.
 *
 * (A timer cannot do this: it cannot see the display's frames, so against a 60 Hz display a 33 ms timer that
 * compares itself with the last frame's time misses most frames by a millisecond and the drift falls to 18 a second.)
 */

/** Ambient frames are at least this far apart (ms): 30 a second. */
export const AMBIENT_INTERVAL_MS = 1000 / 30;
/** The display frame interval assumed before two frames have been seen, and the bounds of any measured one (ms). */
const ASSUMED_FRAME_MS = 1000 / 60;
const MIN_FRAME_MS = 1000 / 240;
const MAX_FRAME_MS = 1000 / 20;
/** A gap this much short of the interval still counts as one: display frame times jitter by a fraction of this. */
const SLACK_MS = 3;

export interface AmbientPacerOptions {
  /** Whether ambient frames are wanted right now (every condition above). */
  readonly wanted: () => boolean;
  /** When the last frame of any cause was drawn (the frame clock's time). */
  readonly lastFrame: () => number;
  /** Ask for one frame that applies the drift: it is drawn on the next display frame. */
  readonly frame: () => void;
  /** Calls back on the next display frame with its time (`requestAnimationFrame`). */
  readonly request?: (callback: (now: number) => void) => unknown;
  readonly cancel?: (handle: unknown) => void;
}

export class AmbientPacer {
  #handle: unknown = null;
  /** The previous display frame seen, to know the display's interval. */
  #previous: number | null = null;
  readonly #request: (callback: (now: number) => void) => unknown;
  readonly #cancel: (handle: unknown) => void;

  readonly #options: AmbientPacerOptions;

  constructor(options: AmbientPacerOptions) {
    this.#options = options;
    this.#request = options.request ?? ((callback) => requestAnimationFrame(callback));
    this.#cancel = options.cancel ?? ((handle) => cancelAnimationFrame(handle as number));
  }

  /** Ambient frames are being scheduled. */
  get running(): boolean {
    return this.#handle !== null;
  }

  /** Starts or stops watching to match `wanted()`; call whenever a condition may have changed. */
  sync(): void {
    if (!this.#options.wanted()) {
      this.stop();
      return;
    }
    if (this.#handle === null) this.#handle = this.#request(this.#tick);
  }

  stop(): void {
    if (this.#handle !== null) this.#cancel(this.#handle);
    this.#handle = null;
    this.#previous = null;
  }

  readonly #tick = (now: number): void => {
    this.#handle = null;
    if (!this.#options.wanted()) {
      this.#previous = null;
      return;
    }
    const measured = this.#previous === null ? ASSUMED_FRAME_MS : now - this.#previous;
    const display = Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, measured));
    this.#previous = now;
    // A frame asked for now is drawn on the next display frame: is that one a full interval after the last?
    if (now + display - this.#options.lastFrame() >= AMBIENT_INTERVAL_MS - SLACK_MS) this.#options.frame();
    this.#handle = this.#request(this.#tick);
  };
}
