/**
 * Multi-touch bookkeeping: which actions each finger holds, turned into
 * press/release edges for the game's virtual buttons. An action stays down
 * while any finger holds it, so two thumbs on overlapping controls never
 * release each other's press.
 */
export class PadPresses<A extends string> {
  readonly #byPointer = new Map<number, ReadonlySet<A>>();
  readonly #sink: { press(action: A): void; release(action: A): void };

  constructor(sink: { press(action: A): void; release(action: A): void }) {
    this.#sink = sink;
  }

  /** Replaces what `pointerId` holds. Returns the actions that went down as a result. */
  set(pointerId: number, actions: Iterable<A>): A[] {
    const before = this.held();
    this.#byPointer.set(pointerId, new Set(actions));
    return this.#emit(before);
  }

  /** The finger lifted or was cancelled. */
  delete(pointerId: number): void {
    const before = this.held();
    this.#byPointer.delete(pointerId);
    this.#emit(before);
  }

  /** Lets go of everything, e.g. when the pad hides. */
  clear(): void {
    const before = this.held();
    this.#byPointer.clear();
    this.#emit(before);
  }

  held(): Set<A> {
    const all = new Set<A>();
    for (const actions of this.#byPointer.values()) for (const action of actions) all.add(action);
    return all;
  }

  #emit(before: ReadonlySet<A>): A[] {
    const after = this.held();
    for (const action of before) if (!after.has(action)) this.#sink.release(action);
    const pressed = [...after].filter((action) => !before.has(action));
    for (const action of pressed) this.#sink.press(action);
    return pressed;
  }
}
