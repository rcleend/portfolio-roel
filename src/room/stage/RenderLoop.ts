/**
 * Render-on-demand scheduler. Nothing draws unless something asked for it: a game frame, a
 * camera move, the lava tick or a resize. Animations register a step function that keeps
 * the loop alive for as long as it returns `true`; one-off changes call `invalidate()`.
 * Several requests within one frame coalesce into a single draw.
 *
 * A room that draws all the time (the generated room, docs/ROOM.md › Frames) asks for that with `pace`: the loop then
 * follows the display's own frames and draws on every one of them, or on every second (third) of a display faster
 * than 95 Hz, so the frames are evenly spaced whatever the display. One-off requests are drawn by the next of those
 * frames rather than by one of their own in between, and so is an animation's every step: a flight moves on the
 * frames the room draws at rest, the ones its quality is governed for, and never asks the GPU for twice as many.
 */
export type AnimationStep = (now: number) => boolean;

export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * A run is frames drawn as fast as they come (or, of a paced loop, as fast as it draws): an animation's (a flight, the
 * tube's turn-on), each asked for as the one before it ends, the paced room's, and the game's, each asked for (`invalidate(true)`) within this long of the one
 * before it. The time between a run's frames is what the device took over one. A frame the lava or the air asked for
 * of a loop that is not paced was only waited for, however soon it came.
 */
const RUN_REQUEST_MS = 25;
/**
 * Paced frames are at least this far apart (ms): a display up to 95 Hz draws every frame (60 Hz: sixty a second), a
 * faster one every second or third (120 Hz: sixty, 144 Hz: 72, 240 Hz: 80). Always a whole number of display frames,
 * so the spacing is even: a timer's sixty a second on a 120 Hz display is a mix of one- and two-frame gaps.
 */
export const PACED_MIN_INTERVAL_MS = 10.5;
/** The display's frame interval is the median of this many of the latest; before any, and its bounds (ms). */
const DISPLAY_SAMPLES = 9;
const ASSUMED_DISPLAY_MS = 1000 / 60;
const MIN_DISPLAY_MS = 1000 / 240;
/** How often a paced loop that is not wanted (the canvas off screen, the tab hidden) looks whether it is again (ms). */
const UNWANTED_POLL_MS = 250;

export class RenderLoop {
  private readonly steps = new Set<AnimationStep>();
  private handle: number | null = null;
  private disposed = false;
  private rendered = 0;
  private lastFrame = Number.NEGATIVE_INFINITY;
  private inRun = false;
  private interval: number | null = null;
  /** Steps that ride the frames drawn without asking for any. */
  private readonly riders = new Set<AnimationStep>();
  /** A frame was asked for (`invalidate`) and is not drawn yet. */
  private demanded = false;
  /** Paced: whether frames are wanted right now. */
  private wanted: (() => boolean) | null = null;
  private poll: ReturnType<typeof setTimeout> | null = null;
  /** The loop's previous display frame, when it asked for this one itself: the two are neighbours. */
  private previousTick: number | null = null;
  private readonly displayIntervals: number[] = [];

  constructor(
    private readonly draw: (now: number) => void,
    private readonly scheduler: FrameScheduler = browserScheduler,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** While a frame is drawn: the time since the frame before it when both belong to one run, else null. */
  get runInterval(): number | null {
    return this.interval;
  }

  /** Number of frames drawn so far; lets tests and the lab verify the loop really idles. */
  get framesRendered(): number {
    return this.rendered;
  }

  /** Nothing has asked for a frame: a paced loop goes on drawing regardless. */
  get idle(): boolean {
    return this.handle === null || (!this.demanded && this.steps.size === 0);
  }

  /** The loop draws frames of its own accord (`pace`), wanted or not at this moment. */
  get paced(): boolean {
    return this.wanted !== null;
  }

  /** An animation (a flight, the tube's turn-on) is asking for frames. */
  get animating(): boolean {
    return this.steps.size > 0;
  }

  /** The frame timestamp of the last draw, for anything pacing itself against frames of every cause. */
  get lastFrameTime(): number {
    return this.lastFrame;
  }

  /** Asks for a frame. `paced`: it is the next of frames that come as fast as the device draws them (the game's). */
  invalidate(paced = false): void {
    if (this.disposed) return;
    if (paced && this.clock() - this.lastFrame < RUN_REQUEST_MS) this.inRun = true;
    this.demanded = true;
    this.request();
  }

  /**
   * Draws all the time while `wanted()`, as one run of frames (so the quality governor judges them), until the returned
   * stop is called: on the display's own frames, evenly spaced and at least `PACED_MIN_INTERVAL_MS` apart. While it is
   * not wanted the loop draws on demand as ever, and looks four times a second whether it is wanted again.
   */
  pace(wanted: () => boolean): () => void {
    this.wanted = wanted;
    this.request();
    return () => {
      if (this.wanted !== wanted) return;
      this.wanted = null;
      this.stopPoll();
    };
  }

  /**
   * Runs `step` before every frame drawn, whatever it is drawn for, until it returns `false` or the returned stop is
   * called. It asks for no frame: for motion that should show in the frames a paced room draws anyway.
   */
  ride(step: AnimationStep): () => void {
    this.riders.add(step);
    return () => {
      this.riders.delete(step);
    };
  }

  /**
   * Runs `step` before every draw until it returns `false` or the returned stop is called. A paced loop draws those
   * frames at its own pace, so `step` must move by the time it is given, never by a count of frames.
   */
  animate(step: AnimationStep): () => void {
    this.steps.add(step);
    this.invalidate();
    return () => {
      this.steps.delete(step);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.steps.clear();
    this.riders.clear();
    this.wanted = null;
    this.stopPoll();
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  private request(): void {
    if (this.handle === null) this.handle = this.scheduler.request(this.frame);
  }

  private stopPoll(): void {
    if (this.poll !== null) clearTimeout(this.poll);
    this.poll = null;
  }

  /** Paced and not wanted: no display frame is watched; a timer looks whether frames are wanted again. */
  private waitUntilWanted(): void {
    this.previousTick = null;
    if (this.poll !== null) return;
    this.poll = setTimeout(() => {
      this.poll = null;
      if (this.disposed || this.wanted === null) return;
      if (this.wanted()) this.request();
      else this.waitUntilWanted();
    }, UNWANTED_POLL_MS);
  }

  /** The shortest time since the last frame at which a paced one is drawn: a whole number of display frames, less half. */
  private pacedGap(): number {
    const sorted = [...this.displayIntervals].sort((a, b) => a - b);
    const display = Math.max(MIN_DISPLAY_MS, sorted[sorted.length >> 1] ?? ASSUMED_DISPLAY_MS);
    return (Math.ceil(PACED_MIN_INTERVAL_MS / display) - 0.5) * display;
  }

  private readonly frame = (now: number): void => {
    this.handle = null;
    if (this.disposed) return;
    if (this.previousTick !== null && now > this.previousTick) {
      this.displayIntervals.push(now - this.previousTick);
      if (this.displayIntervals.length > DISPLAY_SAMPLES) this.displayIntervals.shift();
    }
    this.previousTick = null;
    const pacing = this.wanted?.() ?? false;
    if (pacing) {
      if (now - this.lastFrame < this.pacedGap()) {
        // A fast display's frame in between: whatever was asked for, an animation's step too, is drawn by the next.
        this.previousTick = now;
        this.request();
        return;
      }
    } else if (this.steps.size === 0 && !this.demanded) {
      // The paced loop's own look at a display frame, and frames are not wanted (any more).
      if (this.wanted !== null) this.waitUntilWanted();
      return;
    }
    this.demanded = false;
    for (const step of [...this.steps]) {
      if (!step(now)) this.steps.delete(step);
    }
    for (const step of [...this.riders]) {
      if (!step(now)) this.riders.delete(step);
    }
    this.interval = this.inRun && now > this.lastFrame ? now - this.lastFrame : null;
    this.inRun = false;
    this.draw(now);
    this.rendered++;
    this.lastFrame = now;
    if (this.steps.size > 0) {
      this.inRun = true;
      this.previousTick = now;
      this.demanded = true;
      this.request();
    } else if (this.wanted?.()) {
      this.inRun = true;
      this.previousTick = now;
      this.request();
    } else if (this.wanted !== null) {
      this.waitUntilWanted();
    }
  };
}
