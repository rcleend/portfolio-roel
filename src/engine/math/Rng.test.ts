import { describe, expect, it } from 'vitest';
import { Rng } from './Rng';

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng(1996);
    const b = new Rng(1996);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    expect(new Rng(1).next()).not.toEqual(new Rng(2).next());
  });

  it('matches the canonical mulberry32 reference output', () => {
    // Golden values guard against accidental changes to the algorithm, which would silently change every level.
    const rng = new Rng(42);
    expect([rng.next(), rng.next(), rng.next()].map((v) => v.toFixed(8))).toEqual([
      '0.60110375',
      '0.44829056',
      '0.85246579',
    ]);
  });

  it('keeps int() within inclusive bounds and hits both ends', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(1, 4);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('forks reproducible, independent streams', () => {
    const a = new Rng(3).fork();
    const b = new Rng(3).fork();
    expect(a.next()).toEqual(b.next());
  });

  it('refuses to pick from an empty list', () => {
    expect(() => new Rng(1).pick([])).toThrow(RangeError);
  });
});
