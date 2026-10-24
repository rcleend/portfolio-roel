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

export class RenderLoop {
  private readonly steps = new Set<AnimationStep>();
  private handle: number | null = null;
  private disposed = false;
  private rendered = 0;
  private lastFrame = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly draw: (now: number) => void,
    private readonly scheduler: FrameScheduler = browserScheduler,
  ) {}

  /** Number of frames drawn so far; lets tests and the lab verify the loop really idles. */
  get framesRendered(): number {
    return this.rendered;
  }

  get idle(): boolean {
    return this.handle === null;
  }

  /** The frame timestamp of the last draw, for anything pacing itself against frames of every cause. */
  get lastFrameTime(): number {
    return this.lastFrame;
  }

  invalidate(): void {
    if (this.disposed || this.handle !== null) return;
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
    this.draw(now);
    this.rendered++;
    this.lastFrame = now;
    if (this.steps.size > 0) this.invalidate();
  };
}
