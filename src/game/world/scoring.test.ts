import { describe, expect, it } from 'vitest';
import { formatEuros, formatMrrGain, formatScore, MRR } from './scoring';

describe('scoring', () => {
  it('formats euros with thousands separators', () => {
    expect(formatEuros(0)).toBe('€0');
    expect(formatEuros(99)).toBe('€99');
    expect(formatEuros(2_500)).toBe('€2,500');
    expect(formatEuros(1_234_567)).toBe('€1,234,567');
    expect(formatEuros(-5)).toBe('€0');
    expect(formatEuros(99.9)).toBe('€99');
  });

  it('formats MRR gains and padded scores', () => {
    expect(formatMrrGain(MRR.customer)).toBe('+€99');
    expect(formatScore(2_698)).toBe('0002698');
    expect(formatScore(123_456_789, 7)).toBe('9999999');
  });

  it('values the escalated customer far above a regular one', () => {
    expect(MRR.escalated).toBeGreaterThan(MRR.customer * 10);
  });
});
