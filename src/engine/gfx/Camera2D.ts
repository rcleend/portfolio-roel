import type { Rect } from '../math/Rect';
import { clamp } from '../math/scalar';
import { shake } from '../motion/oscillators';

/**
 * A side-scroller camera: follows a target, stays inside the level bounds and
 * shakes on impact. Positions are fractional internally; `view` is what you
 * draw with and is always whole pixels.
 */
export class Camera2D {
  x = 0;
  y = 0;
  readonly width: number;
  readonly height: number;
  bounds: Rect | null;
  #time = 0;
  #shake = { start: Number.NEGATIVE_INFINITY, duration: 0, intensity: 0 };

  constructor(width: number, height: number, bounds: Rect | null = null) {
    this.width = width;
    this.height = height;
    this.bounds = bounds;
  }

  /** Advance internal time; call once per fixed step. */
  update(dt: number): void {
    this.#time += dt;
  }

  centerOn(x: number, y: number): void {
    this.x = x - this.width / 2;
    this.y = y - this.height / 2;
    this.clampToBounds();
  }

  /**
   * Eases towards centring (x, y). `smoothing` is the fraction of the gap
   * closed per step (1 = snap). A dead zone keeps small movements from
   * scrolling the screen, as in classic platformers.
   */
  follow(x: number, y: number, smoothing = 0.15, deadZone = { x: 16, y: 24 }): void {
    const dx = x - (this.x + this.width / 2);
    const dy = y - (this.y + this.height / 2);
    if (Math.abs(dx) > deadZone.x) this.x += (dx - Math.sign(dx) * deadZone.x) * smoothing;
    if (Math.abs(dy) > deadZone.y) this.y += (dy - Math.sign(dy) * deadZone.y) * smoothing;
    this.clampToBounds();
  }

  clampToBounds(): void {
    if (!this.bounds) return;
    const { x, y, w, h } = this.bounds;
    this.x = w <= this.width ? x + (w - this.width) / 2 : clamp(this.x, x, x + w - this.width);
    this.y = h <= this.height ? y + (h - this.height) / 2 : clamp(this.y, y, y + h - this.height);
  }

  /** Starts a shake that decays linearly to rest over `durationSeconds`. */
  shake(intensity: number, durationSeconds: number): void {
    this.#shake = { start: this.#time, duration: durationSeconds, intensity };
  }

  /** Whole-pixel top-left to render with, including any active shake. */
  get view(): { readonly x: number; readonly y: number } {
    const offset = shake(this.#time, this.#shake.start, this.#shake.duration, this.#shake.intensity);
    return { x: Math.round(this.x) + offset.x, y: Math.round(this.y) + offset.y };
  }

  worldToScreen(x: number, y: number): { readonly x: number; readonly y: number } {
    const view = this.view;
    return { x: Math.round(x) - view.x, y: Math.round(y) - view.y };
  }
}
