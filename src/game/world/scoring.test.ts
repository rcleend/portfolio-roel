import { describe, expect, it } from 'vitest';
import { formatEuros, formatMrrGain, MRR } from './scoring';

describe('scoring', () => {
  it('formats euros with thousands separators', () => {
    expect(formatEuros(0)).toBe('€0');
    expect(formatEuros(99)).toBe('€99');
    expect(formatEuros(2_500)).toBe('€2,500');
    expect(formatEuros(1_234_567)).toBe('€1,234,567');
    expect(formatEuros(-5)).toBe('€0');
    expect(formatEuros(99.9)).toBe('€99');
  });

  it('formats MRR gains', () => {
    expect(formatMrrGain(MRR.customer)).toBe('+€99');
    expect(formatMrrGain(MRR.escalated)).toBe('+€2,500');
  });

  it('values the escalated customer far above a regular one', () => {
    expect(MRR.escalated).toBeGreaterThan(MRR.customer * 10);
  });
});
