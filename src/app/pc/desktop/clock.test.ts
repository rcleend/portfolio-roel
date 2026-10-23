import { describe, expect, it } from 'vitest';
import { formatClock, msToNextMinute } from './clock';

describe('formatClock', () => {
  const evening = new Date(2026, 9, 23, 21, 7, 42);

  it('shows hours and minutes in the locale’s own form', () => {
    expect(formatClock(evening, 'en-US')).toMatch(/^9:07\s?PM$/);
    expect(formatClock(evening, 'nl-NL')).toBe('21:07');
  });

  it('never shows seconds', () => {
    expect(formatClock(evening, 'en-GB')).toBe('21:07');
  });
});

describe('msToNextMinute', () => {
  it('counts down to the next minute boundary', () => {
    expect(msToNextMinute(Date.UTC(2026, 9, 23, 21, 7, 42, 500))).toBe(17_500);
    expect(msToNextMinute(Date.UTC(2026, 9, 23, 21, 7, 59, 999))).toBe(1);
  });

  it('waits a whole minute when it lands exactly on a boundary', () => {
    expect(msToNextMinute(Date.UTC(2026, 9, 23, 21, 8))).toBe(60_000);
  });
});
