/**
 * Seeded pseudo-random numbers (mulberry32).
 *
 * The game never calls `Math.random`: every random choice flows through an
 * `Rng`, so a seed reproduces a run exactly — which is what makes screenshots
 * and tests deterministic.
 */
export class Rng {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: cannot pick from an empty list');
    // The index is in range by construction; the guard above rules out the only undefined case.
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /**
   * An independent generator derived from this one. Systems that fork their
   * own stream stay reproducible even when another system draws more numbers.
   */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}
