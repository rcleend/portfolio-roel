import { Camera2D } from '@/engine/gfx/Camera2D';
import { approach, clamp } from '@/engine/math/scalar';

/** What the camera follows: a point and the direction it is heading. */
export interface CameraTarget {
  readonly x: number;
  readonly facing: -1 | 1;
  /** Horizontal speed in px/s; look-ahead only builds up while moving. */
  readonly vx: number;
}

const LOOK_AHEAD = 48;
/** How fast the look-ahead swings to the other side when the player turns, px/s. */
const LOOK_AHEAD_SPEED = 110;
/** Fraction of the remaining gap closed per second (exponential smoothing). */
const CATCH_UP = 9;

/**
 * Side-scroller camera: keeps the player a little behind centre so more of
 * the level ahead is visible, eases instead of snapping, clamps to the level
 * (or the locked arena), and only ever scrolls in whole pixels. The world is
 * exactly one screen tall, so it never scrolls vertically.
 */
export class CameraFollow {
  readonly #camera: Camera2D;
  readonly #levelWidth: number;
  #minX = 0;
  #lookAhead = LOOK_AHEAD;

  constructor(width: number, height: number, levelWidth: number) {
    this.#camera = new Camera2D(width, height);
    this.#levelWidth = levelWidth;
  }

  get width(): number {
    return this.#camera.width;
  }

  get height(): number {
    return this.#camera.height;
  }

  /** Whole-pixel top edge, without shake: the world row under the screen's top. */
  get top(): number {
    return Math.round(this.#camera.y);
  }

  /** Whole-pixel top-left including shake. */
  get view(): { readonly x: number; readonly y: number } {
    return this.#camera.view;
  }

  /** Left edge the camera may not scroll past, e.g. the arena wall. */
  get minX(): number {
    return this.#minX;
  }

  /** Locks the camera's left edge at `minX` (it can still scroll right). */
  lockLeft(minX: number): void {
    this.#minX = minX;
  }

  /** Jumps straight to the target, e.g. on level start or respawn. */
  snapTo(target: CameraTarget): void {
    this.#lookAhead = LOOK_AHEAD * target.facing;
    this.#camera.x = this.#clamp(this.#desiredX(target));
  }

  update(target: CameraTarget, dt: number): void {
    if (Math.abs(target.vx) > 1) {
      this.#lookAhead = approach(this.#lookAhead, LOOK_AHEAD * target.facing, LOOK_AHEAD_SPEED * dt);
    }
    const desired = this.#clamp(this.#desiredX(target));
    const blend = 1 - Math.exp(-CATCH_UP * dt);
    const next = this.#camera.x + (desired - this.#camera.x) * blend;
    // A freshly locked wall is eased into rather than snapped to; once inside, the camera stays inside.
    const floor = this.#camera.x >= this.#minX ? this.#minX : 0;
    this.#camera.x = clamp(next, floor, Math.max(floor, this.#levelWidth - this.#camera.width));
    this.#camera.update(dt);
  }

  shake(intensity: number, seconds: number): void {
    this.#camera.shake(intensity, seconds);
  }

  #desiredX(target: CameraTarget): number {
    return target.x + this.#lookAhead - this.#camera.width / 2;
  }

  #clamp(x: number): number {
    return clamp(x, this.#minX, Math.max(this.#minX, this.#levelWidth - this.#camera.width));
  }
}
