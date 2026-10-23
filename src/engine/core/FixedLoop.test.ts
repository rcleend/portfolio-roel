import { describe, expect, it } from 'vitest';
import { FixedLoop } from './FixedLoop';

describe('FixedLoop', () => {
  it('runs one step per 60 Hz frame, including slightly short frames', () => {
    const loop = new FixedLoop();
    const counts = [16.6, 16.7, 16.8, 16.6, 16.7].map((ms) => loop.advance(ms));
    expect(counts).toEqual([1, 1, 1, 1, 1]);
  });

  it('alternates steps on a 120 Hz display', () => {
    const loop = new FixedLoop();
    const counts = Array.from({ length: 6 }, () => loop.advance(1000 / 120));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(Math.max(...counts)).toBe(1);
  });

  it('catches up after a slow frame', () => {
    const loop = new FixedLoop();
    expect(loop.advance(50)).toBe(3);
  });

  it('caps catch-up at 5 steps and drops the rest', () => {
    const loop = new FixedLoop();
    expect(loop.advance(1000)).toBe(5);
    expect(loop.advance(16.7)).toBe(1);
  });

  it('carries remainders between frames', () => {
    const loop = new FixedLoop();
    expect(loop.advance(10)).toBe(0);
    expect(loop.advance(10)).toBe(1);
    expect(loop.advance(10)).toBe(0);
    expect(loop.advance(13.4)).toBe(1);
  });

  it('ignores negative time and resets cleanly', () => {
    const loop = new FixedLoop();
    expect(loop.advance(-5)).toBe(0);
    loop.advance(10);
    loop.reset();
    expect(loop.advance(10)).toBe(0);
  });
});
