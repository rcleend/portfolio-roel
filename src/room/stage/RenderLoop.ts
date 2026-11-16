/**
 * Render-on-demand scheduler. Nothing draws unless something asked for it: a game frame, a
 * camera move, the lava tick or a resize. Animations register a step function that keeps
 * the loop alive for as long as it returns `true`; one-off changes call `invalidate()`.
 * Several requests within one frame coalesce into a single draw.
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
 * A run is frames drawn as fast as they come: an animation's (a flight, the tube's turn-on), each asked for as the one
 * before it ends, and the game's, each asked for (`invalidate(true)`) within this long of the one before it. The time
 * between a run's frames is what the device took over one. A frame the lava, the air or the radio's float asked for
 * was only waited for, however soon it came.
 */
const RUN_REQUEST_MS = 25;

export class RenderLoop {
  private readonly steps = new Set<AnimationStep>();
  private handle: number | null = null;
  private disposed = false;
  private rendered = 0;
  private lastFrame = Number.NEGATIVE_INFINITY;
  private inRun = false;
  private interval: number | null = null;

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

  get idle(): boolean {
    return this.handle === null;
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
    if (this.handle !== null) return;
    this.handle = this.scheduler.request(this.frame);
  }

  /** Runs `step` before every draw until it returns `false` or the returned stop is called. */
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
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  private readonly frame = (now: number): void => {
    this.handle = null;
    if (this.disposed) return;
    for (const step of [...this.steps]) {
      if (!step(now)) this.steps.delete(step);
    }
    this.interval = this.inRun && now > this.lastFrame ? now - this.lastFrame : null;
    this.inRun = false;
    this.draw(now);
    this.rendered++;
    this.lastFrame = now;
    if (this.steps.size > 0) {
      this.inRun = true;
      this.invalidate();
    }
  };
}
