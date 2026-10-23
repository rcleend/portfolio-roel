import { mod } from '@/engine/math/scalar';

/** A non-empty list, so picking from it can always return a value. */
export type NonEmpty<T> = readonly [T, ...T[]];

/** The item at `index`, wrapping around in both directions — for frame cycles and colour picks. */
export function cycle<T>(items: NonEmpty<T>, index: number): T {
  return items[mod(Math.floor(index), items.length)] ?? items[0];
}
