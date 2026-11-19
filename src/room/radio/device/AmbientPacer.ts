/**
 * The floating discs' idle drift costs at most 30 frames a second (docs/ROOM.md › The CD player), paced by the
 * display itself: while it should run at all — settled at the radio, the stage on screen, the visitor attentive,
 * motion allowed, not the slow tier — it watches each display frame and asks for a drawn one when the frame it would
 * land on reaches the next slot of a 30-a-second grid. So a 60 Hz display draws every second frame and a 120 Hz one
 * every fourth; a display between (75 Hz, or the 62.5 Hz of a test's fake clock) mixes gaps of one and two frames and
 * still averages 30, never more. A frame drawn for something else (a spring, a key) already carries the drift, so the
 * grid starts again a full interval after it. When the float comes to rest it stops watching and the radio view
 * renders nothing.
 *
 * Only for a loop that draws on demand. Beside a loop that draws of its own accord (`RenderLoop.pace`, the generated
 * room) every one of that loop's frames is "a frame drawn for something else" and restarts the grid,
 * so this pacer's own frame never comes due and the discs stand still in the frames drawn: there the device has the
 * float ride the room's frames instead (RadioDevice › #syncAmbient).
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
  /** The grid's next slot: when the next ambient frame is due. */
  #due: number | null = null;
  /** The last frame drawn as of the previous display frame, and whether that one asked for the next. */
  #seen = Number.NEGATIVE_INFINITY;
  #asked = false;
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
    this.#reset();
  }

  #reset(): void {
    this.#previous = null;
    this.#due = null;
    this.#seen = Number.NEGATIVE_INFINITY;
    this.#asked = false;
  }

  readonly #tick = (now: number): void => {
    this.#handle = null;
    if (!this.#options.wanted()) {
      this.#reset();
      return;
    }
    const measured = this.#previous === null ? ASSUMED_FRAME_MS : now - this.#previous;
    const display = Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, measured));
    this.#previous = now;
    const last = this.#options.lastFrame();
    if (this.#due === null) this.#due = last + AMBIENT_INTERVAL_MS;
    // A frame this pacer did not ask for carries the drift: the next is due a full interval after it.
    if (last !== this.#seen && !this.#asked) this.#due = Math.max(this.#due, last + AMBIENT_INTERVAL_MS);
    this.#seen = last;
    this.#asked = false;
    // A frame asked for now is drawn on the next display frame: has that one reached the slot?
    const landing = now + display;
    if (landing >= this.#due - SLACK_MS) {
      this.#options.frame();
      this.#asked = true;
      // The next slot, on the grid; but after a stall (the grid far behind) never sooner than the interval allows,
      // less half a display frame, so a late frame is followed by one interval, not a burst catching up.
      this.#due = Math.max(this.#due + AMBIENT_INTERVAL_MS, landing + AMBIENT_INTERVAL_MS - display / 2);
    }
    this.#handle = this.#request(this.#tick);
  };
}
