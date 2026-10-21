import { describe, expect, it, vi } from 'vitest';
import { LoadProgress } from './loadProgress';

describe('LoadProgress', () => {
  it('weights files by their expected size', () => {
    const progress = new LoadProgress({ big: 300, small: 100 }, () => {});
    progress.complete('small');
    expect(progress.fraction).toBeCloseTo(0.25);
  });

  it('switches to the real size once it is known', () => {
    const progress = new LoadProgress({ a: 100, b: 100 }, () => {});
    progress.update('a', 50, 200);
    expect(progress.fraction).toBeCloseTo(50 / 300);
  });

  it('never reports more than a file’s size and notifies on every update', () => {
    const onChange = vi.fn();
    const progress = new LoadProgress({ a: 100 }, onChange);
    progress.update('a', 150);
    expect(progress.fraction).toBe(1);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('rejects unknown files', () => {
    expect(() => new LoadProgress({}, () => {}).update('x', 1)).toThrow(/Unknown file/);
  });
});
