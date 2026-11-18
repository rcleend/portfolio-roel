import type { GameCursor, GameSurface, PointerSink } from '@/engine/core/GameSurface';

/**
 * A `GameSurface` whose keyboard and gamepad input is gated by DOM focus.
 *
 * The room decides when the game may take input (on the TV, not mid-flight);
 * the page decides whether the visitor is actually "at" the TV — tabbing to
 * the sound toggle or the résumé must not steer the character. Input reaches
 * the game only when both agree.
 */
export class FocusGatedSurface implements GameSurface {
  readonly #inner: GameSurface;
  #requested = false;
  #focused = false;

  constructor(inner: GameSurface) {
    this.#inner = inner;
  }

  get canvas(): HTMLCanvasElement {
    return this.#inner.canvas;
  }

  get width(): number {
    return this.#inner.width;
  }

  get height(): number {
    return this.#inner.height;
  }

  get paused(): boolean {
    return this.#inner.paused;
  }

  get untouched(): number {
    return this.#inner.untouched;
  }

  get pointer(): PointerSink {
    return this.#inner.pointer;
  }

  get cursor(): GameCursor {
    return this.#inner.cursor;
  }

  onFrame(listener: () => void): () => void {
    return this.#inner.onFrame(listener);
  }

  onCursorChange(listener: (cursor: GameCursor) => void): () => void {
    return this.#inner.onCursorChange(listener);
  }

  pause(): void {
    this.#inner.pause();
  }

  resume(): void {
    this.#inner.resume();
  }

  /** What the presenter (the room) wants. */
  setInputEnabled(enabled: boolean): void {
    this.#requested = enabled;
    this.#apply();
  }

  /** Whether the stage element holds keyboard focus. */
  setFocused(focused: boolean): void {
    this.#focused = focused;
    this.#apply();
  }

  #apply(): void {
    this.#inner.setInputEnabled(this.#requested && this.#focused);
  }
}
