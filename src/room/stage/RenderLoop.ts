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
 * frames the room's quality is governed for, and never asks the GPU for twice as many.
 *
 * A paced loop may rest (`pace`'s second argument): the frames nothing asked for then come only as often as what
 * moves by itself needs (`ambient`: the rain, the lava, the radio's floating discs), a whole number of display frames
 * apart so they stay evenly spaced, and not at all while nothing moves. Whatever is asked for (a flight, a pointer's
 * move, the game's frame) is drawn by the next full-pace frame all the same: resting delays nothing.
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
/** How often a paced loop that draws nothing (the canvas off screen, the tab hidden, nothing moving) looks whether it should again (ms). */
const UNWANTED_POLL_MS = 250;
/** A rest frame comes this fraction of a display frame early rather than a whole one late: 59.94 Hz is sixty. */
const REST_SLACK = 0.1;

/** Something that moves by itself: its name (for the readout) and the frames a second it needs now, 0 while still. */
interface Ambient {
  readonly name: string;
  readonly rate: () => number;
}

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
  /** Paced: whether the frames nothing asked for may come only as often as what moves by itself needs. */
  private rest: (() => boolean) | null = null;
  private readonly ambients = new Set<Ambient>();
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

  /**
   * What the loop draws of its own accord right now, for the readout: `full` (every paced frame), `rest` (only what
   * moves by itself needs, `moving`, at about `rate` a second) or `still` (nothing).
   */
  get pacing(): {
    readonly pace: 'full' | 'rest' | 'still';
    readonly moving: readonly string[];
    readonly rate: number;
  } {
    const moving = [...this.ambients].filter((ambient) => ambient.rate() > 0).map((ambient) => ambient.name);
    const rate = this.restRate();
    if (this.wanted !== null && !this.wanted()) return { pace: 'still', moving, rate: 0 };
    if (this.wanted !== null && !this.rest?.()) return { pace: 'full', moving, rate };
    return { pace: rate > 0 ? 'rest' : 'still', moving, rate };
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
   *
   * While `rest()` the loop draws of its own accord only for what moves by itself (`ambient`), as often as that needs
   * and never as a run (those intervals say nothing of the device), and nothing at all while nothing moves.
   */
  pace(wanted: () => boolean, rest: () => boolean = never): () => void {
    this.wanted = wanted;
    this.rest = rest;
    this.request();
    return () => {
      if (this.wanted !== wanted) return;
      this.wanted = null;
      this.rest = null;
      this.stopPoll();
    };
  }

  /**
   * Something moves by itself and needs `rate()` frames a second to look alive (0 while it is still), until the
   * returned stop is called. A resting loop draws the most any of them needs, rounded up to a whole number of display
   * frames apart: thirty asked for are thirty on a 60, a 90 and a 120 Hz display, and 36 at 144 Hz. What moves must
   * move by the time its frame is given, never by a count of frames. Something that starts to move while nothing is
   * drawn asks for a frame (`invalidate`), or is found within a quarter of a second by a paced loop.
   */
  ambient(name: string, rate: () => number): () => void {
    const ambient = { name, rate };
    this.ambients.add(ambient);
    this.request();
    return () => {
      this.ambients.delete(ambient);
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

  /** Paced and drawing nothing: no display frame is watched; a timer looks whether frames are due again. */
  private waitUntilWanted(): void {
    this.previousTick = null;
    if (this.poll !== null) return;
    this.poll = setTimeout(() => {
      this.poll = null;
      if (this.disposed || this.wanted === null) return;
      if (this.wanted() && (!this.rest?.() || this.restRate() > 0)) this.request();
      else this.waitUntilWanted();
    }, UNWANTED_POLL_MS);
  }

  /** The display's frame interval (ms), as the loop has seen it. */
  private display(): number {
    const sorted = [...this.displayIntervals].sort((a, b) => a - b);
    return Math.max(MIN_DISPLAY_MS, sorted[sorted.length >> 1] ?? ASSUMED_DISPLAY_MS);
  }

  /** The shortest time since the last frame at which a paced one is drawn: a whole number of display frames, less half. */
  private pacedGap(): number {
    const display = this.display();
    return (Math.ceil(PACED_MIN_INTERVAL_MS / display) - 0.5) * display;
  }

  /** The frames a second what moves by itself needs: the most any of it asks for. */
  private restRate(): number {
    let rate = 0;
    for (const ambient of this.ambients) rate = Math.max(rate, ambient.rate());
    return rate;
  }

  /** As `pacedGap`, for a frame nothing asked for of a loop at rest; infinite while nothing moves. */
  private restGap(): number {
    const rate = this.restRate();
    if (!(rate > 0)) return Number.POSITIVE_INFINITY;
    const display = this.display();
    const every = Math.max(Math.ceil(PACED_MIN_INTERVAL_MS / display), Math.floor(1000 / rate / display + REST_SLACK));
    return (every - 0.5) * display;
  }

  /** Not this display frame: the next is looked at. */
  private watch(now: number): void {
    this.previousTick = now;
    this.request();
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
    let resting = false;
    if (this.steps.size > 0 || this.demanded || (pacing && !this.rest?.())) {
      // A fast display's frame in between: whatever was asked for, an animation's step too, is drawn by the next.
      if (pacing && now - this.lastFrame < this.pacedGap()) {
        this.watch(now);
        return;
      }
    } else if (this.wanted !== null && !pacing) {
      // The paced loop's own look at a display frame, and frames are not wanted (any more).
      this.waitUntilWanted();
      return;
    } else {
      // Nothing asked for this frame: it is drawn for what moves by itself, as often as that needs.
      const gap = this.restGap();
      if (gap === Number.POSITIVE_INFINITY) {
        if (this.wanted !== null) this.waitUntilWanted();
        return;
      }
      if (now - this.lastFrame < gap) {
        this.watch(now);
        return;
      }
      resting = true;
    }
    this.demanded = false;
    for (const step of [...this.steps]) {
      if (!step(now)) this.steps.delete(step);
    }
    for (const step of [...this.riders]) {
      if (!step(now)) this.riders.delete(step);
    }
    // A frame drawn at the rest's pace came when it was due, not when the device was through with the one before.
    this.interval = this.inRun && !resting && now > this.lastFrame ? now - this.lastFrame : null;
    this.inRun = false;
    this.draw(now);
    this.rendered++;
    this.lastFrame = now;
    if (this.steps.size > 0) {
      this.inRun = true;
      this.demanded = true;
      this.watch(now);
    } else if (this.wanted !== null && !this.wanted()) {
      this.waitUntilWanted();
    } else if (this.wanted !== null && !this.rest?.()) {
      this.inRun = true;
      this.watch(now);
    } else if (this.restRate() > 0) {
      this.watch(now);
    } else if (this.wanted !== null) {
      this.waitUntilWanted();
    }
  };
}

const never = (): boolean => false;
