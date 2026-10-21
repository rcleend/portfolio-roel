import { describe, expect, it } from 'vitest';
import { softClipCurve } from './softClip';

describe('softClipCurve', () => {
  const curve = softClipCurve(2001, 0.8, 0.98);
  const at = (x: number): number => curve[Math.round(((x + 1) / 2) * 2000)] ?? Number.NaN;

  it('is transparent below the knee', () => {
    for (const x of [-0.8, -0.5, 0, 0.3, 0.8]) expect(at(x)).toBeCloseTo(x, 6);
  });

  it('stays under the ceiling, symmetric and monotonic', () => {
    expect(Math.max(...curve)).toBeLessThan(0.98);
    expect(at(-1)).toBeCloseTo(-at(1), 6);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] ?? 0);
  });
});
