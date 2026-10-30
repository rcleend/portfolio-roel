import type { PointerSink } from '../core/GameSurface';
import type { PointerSnapshot } from './InputSnapshot';

/** Receives host-mapped pointer events and turns them into per-step snapshots with edges. */
export class PointerState implements PointerSink {
  #x = 0;
  #y = 0;
  #over = false;
  #down = false;
  #pressed = false;
  #released = false;
  #active = false;

  move(x: number, y: number): void {
    const px = Math.floor(x);
    const py = Math.floor(y);
    // The same pixel again (a host re-sending a resting pointer's place) is no activity.
    if (this.#over && px === this.#x && py === this.#y) return;
    this.#x = px;
    this.#y = py;
    this.#over = true;
    this.#active = true;
  }

  leave(): void {
    this.#over = false;
    if (this.#down) this.up();
  }

  down(): void {
    if (this.#down) return;
    this.#down = true;
    this.#pressed = true;
    this.#active = true;
  }

  up(): void {
    if (!this.#down) return;
    this.#down = false;
    this.#released = true;
  }

  /** Returns the snapshot for this step and clears edges; `active` reports any pointer activity since the last drain. */
  drain(): { readonly snapshot: PointerSnapshot; readonly active: boolean } {
    const snapshot: PointerSnapshot = {
      x: this.#x,
      y: this.#y,
      over: this.#over,
      down: this.#down,
      pressed: this.#pressed,
      released: this.#released,
    };
    const active = this.#active;
    this.#pressed = false;
    this.#released = false;
    this.#active = false;
    return { snapshot, active };
  }
}
