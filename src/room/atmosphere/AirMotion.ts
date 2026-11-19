import type { RenderLoop } from '../stage/RenderLoop';

/**
 * The air's clock (the rain, the dust, the lightning): it runs while the air moves and says how many frames a second
 * that needs (`RenderLoop.ambient`); it asks for none itself. Hidden or reduced-motion air is still.
 */
export class AirMotion {
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly stop: () => void;
  private last = 0;
  private elapsed = 0;
  private speed = 0;
  private was = false;

  /** `rate`: the frames a second the air needs while it moves (the rain more than the dust alone). */
  constructor(
    private readonly loop: RenderLoop,
    private readonly visible: () => boolean,
    rate: () => number,
  ) {
    this.reducedMotion.addEventListener('change', this.onReducedMotion);
    this.stop = loop.ambient('air', () => (this.moving ? rate() : 0));
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

  /** Something the air's motion depends on may have changed: air that starts to move asks for its first frame. */
  readonly sync = (): void => {
    const moving = this.moving;
    if (!moving) this.last = 0;
    else if (!this.was) this.loop.invalidate();
    this.was = moving;
  };

  dispose(): void {
    this.speed = 0;
    this.sync();
    this.stop();
    this.reducedMotion.removeEventListener('change', this.onReducedMotion);
  }

  private get moving(): boolean {
    return this.speed > 0 && !this.reducedMotion.matches && this.visible();
  }
}
