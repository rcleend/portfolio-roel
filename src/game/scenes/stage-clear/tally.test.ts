import { describe, expect, it } from 'vitest';
import { countUp, formatClock, formatMrr } from './tally';

describe('formatMrr', () => {
  it('groups thousands with commas and prefixes a dollar sign', () => {
    expect(formatMrr(0)).toBe('$0');
    expect(formatMrr(999)).toBe('$999');
    expect(formatMrr(12340)).toBe('$12,340');
    expect(formatMrr(1234567.9)).toBe('$1,234,567');
  });

  it('never shows a negative amount', () => {
    expect(formatMrr(-50)).toBe('$0');
  });
});

describe('formatClock', () => {
  it('shows minutes and zero-padded seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
  });
});

describe('countUp', () => {
  it('is 0 before the window, exact after it, and never decreases in between', () => {
    expect(countUp(5000, 0.9, 1, 2)).toBe(0);
    expect(countUp(5000, 3, 1, 2)).toBe(5000);
    let previous = 0;
    for (let t = 1; t <= 3; t += 1 / 60) {
      const value = countUp(5000, t, 1, 2);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('front-loads the count like an arcade bonus tally', () => {
    expect(countUp(1000, 1.5, 1, 2)).toBeGreaterThan(500);
  });
});
