import { describe, expect, it } from 'vitest';
import { metallicNoise, pulseHarmonics, whiteNoise } from './waves';

describe('waves', () => {
  it('builds a square (50% pulse) from odd harmonics only', () => {
    const { real, imag } = pulseHarmonics(0.5, 8);
    for (let n = 2; n <= 8; n += 2) {
      expect(real[n]).toBeCloseTo(0, 6);
      expect(imag[n]).toBeCloseTo(0, 6);
    }
    expect(imag[1]).toBeCloseTo(2 / Math.PI);
    expect(imag[3]).toBeCloseTo(2 / (3 * Math.PI));
  });

  it('gives narrow pulses a richer spectrum than squares', () => {
    const energy = (duty: number): number => {
      const { real, imag } = pulseHarmonics(duty, 32);
      let high = 0;
      for (let n = 2; n <= 32; n++) high += (real[n] ?? 0) ** 2 + (imag[n] ?? 0) ** 2;
      return high;
    };
    expect(energy(0.125)).toBeGreaterThan(energy(0.5));
    expect(() => pulseHarmonics(1, 4)).toThrow(RangeError);
  });

  it('loops the short LFSR noise every 93 steps', () => {
    const period = metallicNoise();
    expect(period.length).toBe(93);
    expect(new Set(period)).toEqual(new Set([1, -1]));
  });

  it('makes reproducible white noise in [-1, 1)', () => {
    const a = whiteNoise(1000, 7);
    expect(a).toEqual(whiteNoise(1000, 7));
    expect(Math.max(...a)).toBeLessThan(1);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(-1);
  });
});
