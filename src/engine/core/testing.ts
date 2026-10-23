import type { Gfx } from '../gfx/Gfx';
import { InputSnapshot } from '../input/InputSnapshot';
import type { FrameScheduler } from './Game';
import type { Scene, Step } from './Scene';

/**
 * Shared test doubles for the core loop. Lives next to the code (not in a
 * test file) so other modules' tests can reuse it; it is never imported by
 * production code.
 */

/** A scheduler driven by hand: `frame(t)` runs the pending callback at time `t`. */
export class ManualScheduler implements FrameScheduler {
  #next: ((time: number) => void) | null = null;
  #handle = 0;

  request(callback: (time: number) => void): number {
    this.#next = callback;
    return ++this.#handle;
  }

  cancel(): void {
    this.#next = null;
  }

  get pending(): boolean {
    return this.#next !== null;
  }

  frame(timeMs: number): void {
    const callback = this.#next;
    this.#next = null;
    callback?.(timeMs);
  }
}

/** A 2D context that accepts every call and draws nothing; `createImageData` hands out blank pixels to fill. */
export function nullContext(width = 320, height = 240): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = {
    canvas: { width, height },
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  };
  return new Proxy(target, {
    get: (object, key) => (key in object ? object[key] : () => undefined),
    set: (object, key, value) => {
      object[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

export function stepWith<A extends string>(input: InputSnapshot<A> = InputSnapshot.empty<A>(), frame = 0): Step<A> {
  return { dt: 1 / 60, frame, input };
}

/** A scene that records its lifecycle so tests can assert on ordering. */
export class RecordingScene<P = void, A extends string = string> implements Scene<P, A> {
  readonly log: string[];
  readonly name: string;
  updates = 0;
  lastStep: Step<A> | null = null;
  onUpdate: ((step: Step<A>) => void) | null = null;

  constructor(name: string, log: string[]) {
    this.name = name;
    this.log = log;
  }

  enter(params: P): void {
    this.log.push(`${this.name}.enter(${JSON.stringify(params) ?? ''})`);
  }

  exit(): void {
    this.log.push(`${this.name}.exit`);
  }

  update(step: Step<A>): void {
    this.updates++;
    this.lastStep = step;
    this.onUpdate?.(step);
  }

  render(_gfx: Gfx): void {}
}
