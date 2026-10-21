import { describe, expect, it } from 'vitest';
import { placeTooltip } from './tooltipPlacement';

const SCREEN = { x: 0, y: 0, w: 320, h: 240 };
const SIZE = { w: 140, h: 60 };

describe('placeTooltip', () => {
  it('sits above the anchor, left-aligned with it', () => {
    expect(placeTooltip({ x: 170, y: 132, w: 140, h: 24 }, SIZE, SCREEN)).toEqual({ x: 170, y: 69 });
  });

  it('flips below the anchor when there is no room above', () => {
    expect(placeTooltip({ x: 40, y: 20, w: 10, h: 12 }, SIZE, SCREEN)).toEqual({ x: 40, y: 35 });
  });

  it('slides left rather than running off the right edge', () => {
    expect(placeTooltip({ x: 300, y: 150, w: 1, h: 12 }, SIZE, SCREEN).x).toBe(180);
  });

  it.each([
    [0, 0],
    [319, 0],
    [0, 239],
    [319, 239],
    [160, 120],
  ])('stays fully on screen for a pointer at (%i, %i)', (x, y) => {
    const { x: left, y: top } = placeTooltip({ x, y, w: 1, h: 12 }, SIZE, SCREEN);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left + SIZE.w).toBeLessThanOrEqual(SCREEN.w);
    expect(top + SIZE.h).toBeLessThanOrEqual(SCREEN.h);
  });
});
