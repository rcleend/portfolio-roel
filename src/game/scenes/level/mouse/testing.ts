import { IDLE_POINTER, InputSnapshot, type PointerKind } from '@/engine/input/InputSnapshot';
import type { Action } from '../../../input/bindings';

/**
 * A mouse for tests, driven a step at a time like the host's pointer: moves, presses and releases between steps
 * come out as one snapshot's edges. Lives next to the code so the level's tests can share it; never imported by
 * production code.
 */
export class TestMouse {
  x = 0;
  y = 0;
  kind: PointerKind = 'mouse';
  #down = false;
  #pressed = false;
  #released = false;

  move(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  press(): this {
    this.#down = true;
    this.#pressed = true;
    return this;
  }

  release(): this {
    if (this.#down) this.#released = true;
    this.#down = false;
    return this;
  }

  /** This step's input: the pointer over the screen, edges since the last snapshot, no keys. */
  snapshot(): InputSnapshot<Action> {
    const pointer = {
      ...IDLE_POINTER,
      x: this.x,
      y: this.y,
      over: true,
      down: this.#down,
      pressed: this.#pressed,
      released: this.#released,
      kind: this.kind,
    };
    this.#pressed = false;
    this.#released = false;
    return new InputSnapshot<Action>(new Map(), pointer, 'pointer', true);
  }
}
