import type { Gfx } from '@/engine/gfx/Gfx';
import { drawHalo, drawPuff, PUFF_PHASES } from './puffs';

/**
 * One mass of smoke for one frame: its puffs are collected first, then
 * drawn in two passes, every halo and then every body, so backlight rims
 * the mass's outline only. Puffs go into buffers sized once, so a frame
 * allocates nothing; `begin` empties them for the next frame.
 */
export class SmokeMass {
  readonly #x: Int16Array;
  readonly #y: Int16Array;
  readonly #radius: Uint8Array;
  readonly #lighting: Uint8Array;
  readonly #phase: Uint8Array;
  #count = 0;

  constructor(capacity: number) {
    this.#x = new Int16Array(capacity);
    this.#y = new Int16Array(capacity);
    this.#radius = new Uint8Array(capacity);
    this.#lighting = new Uint8Array(capacity);
    this.#phase = new Uint8Array(capacity);
  }

  begin(): void {
    this.#count = 0;
  }

  /** Adds a puff in drawing order, back to front; `phase` is its palette-cycle step. */
  add(x: number, y: number, radius: number, lighting: number, phase: number): void {
    const i = this.#count;
    if (i >= this.#x.length) throw new RangeError(`SmokeMass: more than ${this.#x.length} puffs`);
    this.#x[i] = x;
    this.#y[i] = y;
    this.#radius[i] = radius;
    this.#lighting[i] = lighting;
    this.#phase[i] = ((phase % PUFF_PHASES) + PUFF_PHASES) % PUFF_PHASES;
    this.#count = i + 1;
  }

  draw(gfx: Gfx, atlas: HTMLCanvasElement): void {
    for (let i = 0; i < this.#count; i++) this.#drawOne(gfx, atlas, i, drawHalo);
    for (let i = 0; i < this.#count; i++) this.#drawOne(gfx, atlas, i, drawPuff);
  }

  #drawOne(gfx: Gfx, atlas: HTMLCanvasElement, i: number, sprite: typeof drawPuff): void {
    sprite(
      gfx,
      atlas,
      this.#lighting[i] ?? 0,
      this.#phase[i] ?? 0,
      this.#radius[i] ?? 0,
      this.#x[i] ?? 0,
      this.#y[i] ?? 0,
    );
  }
}
