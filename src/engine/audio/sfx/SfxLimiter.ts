export interface SfxLimits {
  /** Minimum seconds between two starts of the same effect. */
  readonly cooldown: number;
  /** Most overlapping instances of the same effect. */
  readonly maxInstances: number;
}

interface Instance<T> {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly handle: T;
}

/**
 * Decides which effect triggers may sound, independent of any audio API:
 * per-effect cooldowns and instance caps, plus a global polyphony cap. When a
 * cap is hit the oldest instance is evicted, because the newest trigger is
 * the one that matches what is on screen.
 */
export class SfxLimiter<T> {
  readonly #polyphony: number;
  #active: Instance<T>[] = [];
  readonly #lastStart = new Map<string, number>();

  constructor(polyphony: number) {
    this.#polyphony = polyphony;
  }

  get active(): number {
    return this.#active.length;
  }

  /**
   * Whether `id` may start at `now`. Returns `null` to drop the trigger, or
   * the handles of instances that must be cut to make room (often none).
   */
  request(id: string, now: number, limits: SfxLimits): T[] | null {
    const last = this.#lastStart.get(id);
    if (last !== undefined && now - last < limits.cooldown) return null;
    const evicted: Instance<T>[] = [];
    const same = this.#active.filter((instance) => instance.id === id);
    evicted.push(...same.slice(0, Math.max(0, same.length - limits.maxInstances + 1)));
    const remaining = this.#active.filter((instance) => !evicted.includes(instance));
    evicted.push(...remaining.slice(0, Math.max(0, remaining.length - this.#polyphony + 1)));
    this.#active = this.#active.filter((instance) => !evicted.includes(instance));
    return evicted.map((instance) => instance.handle);
  }

  /** Records an admitted instance. Call right after a successful `request`. */
  add(id: string, start: number, end: number, handle: T): void {
    this.#lastStart.set(id, start);
    this.#active.push({ id, start, end, handle });
  }

  /** Forgets instances that have finished by `now` and returns their handles for clean-up. */
  prune(now: number): T[] {
    const finished = this.#active.filter((instance) => instance.end <= now);
    if (finished.length > 0) this.#active = this.#active.filter((instance) => instance.end > now);
    return finished.map((instance) => instance.handle);
  }
}
