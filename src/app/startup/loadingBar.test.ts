import { describe, expect, it } from 'vitest';
import { BAR_SEGMENTS, litSegments, percentLabel } from './loadingBar';

describe('litSegments', () => {
  it('lights whole segments and saves the last one for done', () => {
    expect(litSegments(0)).toBe(0);
    expect(litSegments(0.049)).toBe(0);
    expect(litSegments(0.05)).toBe(1);
    expect(litSegments(0.999)).toBe(BAR_SEGMENTS - 1);
    expect(litSegments(1)).toBe(BAR_SEGMENTS);
  });

  it('treats junk as empty', () => {
    expect(litSegments(Number.NaN)).toBe(0);
    expect(litSegments(-1)).toBe(0);
  });
});

describe('percentLabel', () => {
  it('pads and floors', () => {
    expect(percentLabel(0)).toBe('000%');
    expect(percentLabel(0.075)).toBe('007%');
    expect(percentLabel(0.999)).toBe('099%');
    expect(percentLabel(1)).toBe('100%');
    expect(percentLabel(4)).toBe('100%');
  });
});
