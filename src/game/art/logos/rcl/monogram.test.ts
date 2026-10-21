import { describe, expect, it } from 'vitest';
import { buildMonogram } from './monogram';

describe('RCL monogram', () => {
  const mask = buildMonogram();

  it('is a compact, wide mark cropped to its ink', () => {
    expect(mask.height).toBe(20);
    expect(mask.width).toBeGreaterThan(70);
    expect(mask.width).toBeLessThan(90);
    expect(mask.bounds()).toEqual({ x: 0, y: 0, w: mask.width, h: mask.height });
  });

  it('leans right: the top row starts further right than the bottom row', () => {
    const rows = mask.toRows();
    expect(rows[0]?.indexOf('#')).toBeGreaterThan(rows[rows.length - 1]?.indexOf('#') ?? 0);
  });

  it('is heavy: most of its box is ink', () => {
    expect(mask.count() / (mask.width * mask.height)).toBeGreaterThan(0.5);
  });
});
