import { describe, expect, it } from 'vitest';
import { hash2, valueNoise } from './noise';

describe('noise', () => {
  it('hashes deterministically into [0, 1) and varies with every input', () => {
    expect(hash2(3, 4, 1)).toBe(hash2(3, 4, 1));
    const values = [hash2(3, 4, 1), hash2(4, 3, 1), hash2(3, 4, 2)];
    expect(new Set(values).size).toBe(3);
    for (let i = 0; i < 200; i++) {
      const value = hash2(i, i * 7, 9);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('interpolates between lattice values', () => {
    expect(valueNoise(0, 0, 8, 8, 5)).toBeCloseTo(hash2(0, 0, 5), 10);
    expect(valueNoise(8, 0, 8, 8, 5)).toBeCloseTo(hash2(1, 0, 5), 10);
    const mid = valueNoise(4, 0, 8, 8, 5);
    const [a, b] = [hash2(0, 0, 5), hash2(1, 0, 5)];
    expect(mid).toBeGreaterThanOrEqual(Math.min(a, b));
    expect(mid).toBeLessThanOrEqual(Math.max(a, b));
  });
});
