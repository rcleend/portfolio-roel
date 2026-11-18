import { context2d, onCanvasesRepainted, onCanvasRestored } from '../gfx/canvas';
import { Gfx } from '../gfx/Gfx';
import type { InputManager } from '../input/InputManager';
import { FixedLoop, STEP_SECONDS } from './FixedLoop';
import type { GameCursor, GameSurface, PointerSink } from './GameSurface';
import type { GameRoot } from './Scene';

/** Abstraction over `requestAnimationFrame`, so tests can drive the loop by hand. */
export interface FrameScheduler {
  request(callback: (timeMs: number) => void): number;
  cancel(handle: number): void;
}

export interface GameOptions<A extends string> {
  readonly canvas: HTMLCanvasElement;
  readonly input: InputManager<A>;
  readonly root: GameRoot<A>;
  /** Defaults to the canvas's own 2D context; injectable for headless tests. */
  readonly context?: CanvasRenderingContext2D;
  readonly scheduler?: FrameScheduler;
  /** Source of visibility changes; defaults to `document`. Pass `null` to never auto-pause. */
  readonly visibility?: Document | null;
  readonly maxCatchUpSteps?: number;
}

const animationFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * The runtime: a fixed 60 Hz simulation driven by animation frames, rendering
 * once per frame in which the simulation advanced. Implements `GameSurface`,
 * the only thing hosts see.
 */
export class Game<A extends string> implements GameSurface {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly gfx: Gfx;
  readonly input: InputManager<A>;
  readonly #root: GameRoot<A>;
  readonly #loop: FixedLoop;
  readonly #scheduler: FrameScheduler;
  readonly #visibility: Document | null;
  readonly #frameListeners = new Set<() => void>();
  readonly #cursorListeners = new Set<(cursor: GameCursor) => void>();
  #cursor: GameCursor = 'arrow';
  /** The last step's hit tests found something clickable under the pointer (`InputSnapshot.clickable`). */
  #overClickable = false;
  #frame = 0;
  #handle: number | null = null;
  #lastTime: number | null = null;
  #paused = false;
  #hidden = false;
  /** Between `start` and `stop`. */
  #running = false;
  /** A lost context wiped the frame or the caches it is drawn from: the next animation frame renders, paused or not. */
  #redrawDue = false;
  #stopRestore: (() => void) | null = null;

  constructor(options: GameOptions<A>) {
    this.canvas = options.canvas;
    this.width = options.canvas.width;
    this.height = options.canvas.height;
    this.gfx = new Gfx(options.context ?? context2d(options.canvas), this.width, this.height);
    this.input = options.input;
    this.#root = options.root;
    this.#loop = new FixedLoop(options.maxCatchUpSteps ?? 5);
    this.#scheduler = options.scheduler ?? animationFrames;
    this.#visibility = options.visibility === undefined ? document : options.visibility;
  }

  get pointer(): PointerSink {
    return this.input.pointer;
  }

  /** Steps simulated since the game was created. */
  get frame(): number {
    return this.#frame;
  }

  get running(): boolean {
    return this.#handle !== null;
  }

  /** Paused by the host or harness. Hidden-tab pausing is tracked separately and never reported here. */
  get paused(): boolean {
    return this.#paused;
  }

  /** Begins the animation-frame loop. Idempotent. */
  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#visibility?.addEventListener('visibilitychange', this.#onVisibilityChange);
    this.#hidden = this.#visibility?.hidden ?? false;
    this.#lastTime = null;
    this.#schedule(true);
    // A GPU reset (a laptop's sleep, a display change) gives the canvas back blank with its context's state reset, and
    // a paused game drew nothing more: the TV showed a blank picture until the game resumed.
    const restored = onCanvasRestored(this.canvas, () => {
      this.gfx.ctx.imageSmoothingEnabled = false;
      this.#redrawDue = true;
      this.#schedule(true);
    });
    const repainted = onCanvasesRepainted(() => {
      this.#redrawDue = true;
      this.#schedule(true);
    });
    this.#stopRestore = () => {
      restored();
      repainted();
    };
  }

  /** Stops the loop and detaches listeners; the game can be started again. */
  stop(): void {
    this.#running = false;
    if (this.#handle !== null) this.#scheduler.cancel(this.#handle);
    this.#handle = null;
    this.#visibility?.removeEventListener('visibilitychange', this.#onVisibilityChange);
    this.#stopRestore?.();
    this.#stopRestore = null;
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    if (!this.#paused) return;
    this.#paused = false;
    // Without this the time spent paused would be replayed as catch-up steps.
    this.#lastTime = null;
    this.#loop.reset();
    this.#schedule();
  }

  setInputEnabled(enabled: boolean): void {
    this.input.setEnabled(enabled);
  }

  /**
   * Advances exactly `count` steps synchronously and renders once, whether or
   * not the loop is running or paused. The basis of deterministic screenshots.
   */
  step(count = 1): void {
    for (let i = 0; i < count; i++) this.#simulate();
    this.render();
  }

  /**
   * The cursor over the picture, as of the last rendered frame: the root's own if it names one, else the hand over
   * anything the last step's hit tests found clickable and the arrow elsewhere.
   */
  get cursor(): GameCursor {
    return this.#cursor;
  }

  /** Renders the current state and notifies frame listeners, and cursor listeners when the cursor changed. */
  render(): void {
    this.#root.render(this.gfx);
    for (const listener of this.#frameListeners) listener();
    const cursor = this.#root.cursor?.() ?? (this.#overClickable ? 'hand' : 'arrow');
    if (cursor === this.#cursor) return;
    this.#cursor = cursor;
    for (const listener of this.#cursorListeners) listener(cursor);
  }

  onFrame(listener: () => void): () => void {
    this.#frameListeners.add(listener);
    return () => this.#frameListeners.delete(listener);
  }

  onCursorChange(listener: (cursor: GameCursor) => void): () => void {
    this.#cursorListeners.add(listener);
    return () => this.#cursorListeners.delete(listener);
  }

  /**
   * Asks for the next animation frame while the game runs: not while it is paused or the page hidden, where it draws
   * nothing and nothing should wake the page for it (`resume`, the page shown again or a redraw due ask again).
   * `once`: one frame whatever (the first, a redraw).
   */
  #schedule(once = false): void {
    if (!this.#running || this.#handle !== null) return;
    if (once || this.#redrawDue || (!this.#paused && !this.#hidden)) this.#handle = this.#scheduler.request(this.#tick);
  }

  readonly #tick = (timeMs: number): void => {
    this.#handle = null;
    const last = this.#lastTime;
    this.#lastTime = timeMs;
    const redraw = this.#redrawDue;
    this.#redrawDue = false;
    this.#schedule();
    const steps = last === null || this.#paused || this.#hidden ? 0 : this.#loop.advance(timeMs - last);
    for (let i = 0; i < steps; i++) this.#simulate();
    if (steps > 0 || redraw) this.render();
  };

  #simulate(): void {
    const input = this.input.poll();
    this.#root.update({ dt: STEP_SECONDS, frame: this.#frame, input });
    this.#overClickable = input.overClickable;
    this.#frame++;
  }

  readonly #onVisibilityChange = (): void => {
    this.#hidden = this.#visibility?.hidden ?? false;
    if (!this.#hidden) {
      this.#lastTime = null;
      this.#loop.reset();
      this.#schedule();
    }
  };
}
