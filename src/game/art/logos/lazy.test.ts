import { describe, expect, it, vi } from 'vitest';
import { lazy } from './lazy';

describe('lazy', () => {
  it('builds once, on first use, and returns the same value afterwards', () => {
    const build = vi.fn(() => ({ pixels: 1 }));
    const get = lazy(build);
    expect(build).not.toHaveBeenCalled();
    const first = get();
    expect(get()).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
