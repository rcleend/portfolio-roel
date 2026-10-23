import { describe, expect, it } from 'vitest';
import { flipTransform } from './flip';

const viewport = { left: 0, top: 0, width: 390, height: 844 };

describe('flipTransform', () => {
  it('maps the full-viewport reader onto the in-glass window', () => {
    const glass = { left: 34.5, top: 296, width: 321, height: 222 };
    expect(flipTransform(glass, viewport)).toBe('translate(34.5px, 296px) scale(0.8231, 0.263)');
  });

  it('is the identity for the same box', () => {
    expect(flipTransform(viewport, viewport)).toBe('translate(0px, 0px) scale(1, 1)');
  });

  it('works against an offset final box', () => {
    expect(
      flipTransform({ left: 10, top: 20, width: 50, height: 50 }, { left: 20, top: 40, width: 100, height: 200 }),
    ).toBe('translate(-10px, -20px) scale(0.5, 0.25)');
  });

  it('never divides by zero for an unlaid-out element', () => {
    expect(flipTransform(viewport, { left: 0, top: 0, width: 0, height: 0 })).toBe('translate(0px, 0px) scale(1, 1)');
  });
});
