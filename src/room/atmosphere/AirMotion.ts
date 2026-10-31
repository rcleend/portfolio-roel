import type { RenderLoop } from '../stage/RenderLoop';

const FRAME_MS = 1000 / 24;

/** Low-rate ambient motion. Existing game/flight frames take priority; hidden/reduced-motion air is still. */
export class AirMotion {
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = 0;
  private elapsed = 0;
  private speed = 0;

  constructor(
    private readonly loop: RenderLoop,
    private readonly visible: () => boolean,
  ) {
    this.reducedMotion.addEventListener('change', this.onReducedMotion);
  }

  get reduced(): boolean {
    return this.reducedMotion.matches;
  }

  private readonly onReducedMotion = (): void => {
    this.sync();
    // Clear an in-flight lightning flash when the visitor enables reduced motion.
    this.loop.invalidate();
  };

  setSpeed(speed: number): void {
    this.speed = speed;
    this.sync();
  }

  get time(): number {
    const now = performance.now();
    if (this.moving && this.last) this.elapsed += Math.min((now - this.last) / 1000, 0.1) * this.speed;
    this.last = this.moving ? now : 0;
    return this.elapsed;
  }

  readonly sync = (): void => {
    if (!this.moving) {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      this.last = 0;
    } else if (this.timer === null) {
      this.timer = setTimeout(this.tick, FRAME_MS);
    }
  };

  dispose(): void {
    this.speed = 0;
    this.sync();
    this.reducedMotion.removeEventListener('change', this.onReducedMotion);
  }

  private get moving(): boolean {
    return this.speed > 0 && !this.reducedMotion.matches && this.visible();
  }

  private readonly tick = (): void => {
    this.timer = null;
    if (!this.moving) {
      this.last = 0;
      return;
    }
    if (performance.now() - this.loop.lastFrameTime >= FRAME_MS - 2) this.loop.invalidate();
    this.sync();
  };
}
