/**
 * Event-driven button state that remembers edges between polls, so a key
 * tapped and released within one 16 ms step still registers as a press.
 */
export class EdgeTracker<K> {
  readonly #down = new Set<K>();
  readonly #pressed = new Set<K>();
  readonly #released = new Set<K>();

  press(key: K): void {
    if (this.#down.has(key)) return;
    this.#down.add(key);
    this.#pressed.add(key);
  }

  release(key: K): void {
    if (!this.#down.delete(key)) return;
    this.#released.add(key);
  }

  /** Releases everything, e.g. when the window loses focus and key-ups would be missed. */
  releaseAll(): void {
    for (const key of [...this.#down]) this.release(key);
  }

  /** Forgets all state without reporting releases (used when input is disabled). */
  reset(): void {
    this.#down.clear();
    this.#pressed.clear();
    this.#released.clear();
  }

  isDown(key: K): boolean {
    return this.#down.has(key);
  }

  /** Returns edges since the previous drain and clears them. */
  drain(): { readonly down: ReadonlySet<K>; readonly pressed: ReadonlySet<K>; readonly released: ReadonlySet<K> } {
    const result = { down: new Set(this.#down), pressed: new Set(this.#pressed), released: new Set(this.#released) };
    this.#pressed.clear();
    this.#released.clear();
    return result;
  }
}
