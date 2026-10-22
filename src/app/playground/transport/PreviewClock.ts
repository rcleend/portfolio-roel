import { FixedLoop } from '@/engine/core/FixedLoop';

/** Playback speeds on offer, slowest first. */
export const SPEEDS = [0.25, 0.5, 1] as const;
export type Speed = (typeof SPEEDS)[number];

/** Where the transport stands; a new object after every change, so it compares by identity. */
export interface ClockState {
  /** Fixed 60 Hz steps since the previews started. */
  readonly frame: number;
  readonly playing: boolean;
  readonly speed: Speed;
}

/** As in the game: after a stall the previews slow down rather than leap ahead. */
const MAX_CATCH_UP_STEPS = 5;

/**
 * The playground's transport: one fixed 60 Hz clock that every preview
 * follows frame for frame. It only counts; whoever drives the previews
 * asks it how far to move on each animation frame (`tick`) and moves them.
 */
export class PreviewClock {
  readonly #loop = new FixedLoop(MAX_CATCH_UP_STEPS);
  readonly #listeners = new Set<() => void>();
  #state: ClockState = { frame: 0, playing: true, speed: 1 };

  get state(): ClockState {
    return this.#state;
  }

  /** Calls `listener` after every change and returns an unsubscribe function, as useSyncExternalStore wants. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Takes the wall time since the last tick and returns how many frames it moved, at the current speed. */
  tick(elapsedMs: number): number {
    if (!this.#state.playing) return 0;
    const steps = this.#loop.advance(elapsedMs * this.#state.speed);
    if (steps > 0) this.#set({ frame: this.#state.frame + steps });
    return steps;
  }

  play(): void {
    if (this.#state.playing) return;
    // Time that passed while paused must not come back as catch-up steps.
    this.#loop.reset();
    this.#set({ playing: true });
  }

  pause(): void {
    this.#set({ playing: false });
  }

  toggle(): void {
    if (this.#state.playing) this.pause();
    else this.play();
  }

  setSpeed(speed: Speed): void {
    this.#set({ speed });
  }

  /** Jumps to a whole frame, never before the first. */
  seek(frame: number): void {
    this.#loop.reset();
    this.#set({ frame: Math.max(0, Math.round(frame)) });
  }

  /** Pauses and moves `delta` frames, e.g. -1 for the frame before. */
  step(delta: number): void {
    this.#loop.reset();
    this.#set({ playing: false, frame: Math.max(0, this.#state.frame + Math.round(delta)) });
  }

  /** Back to the first frame, playing. */
  replay(): void {
    this.#loop.reset();
    this.#set({ frame: 0, playing: true });
  }

  #set(change: Partial<ClockState>): void {
    const next = { ...this.#state, ...change };
    const current = this.#state;
    if (next.frame === current.frame && next.playing === current.playing && next.speed === current.speed) return;
    this.#state = next;
    for (const listener of this.#listeners) listener();
  }
}
