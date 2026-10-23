import { describe, expect, it } from 'vitest';
import * as easing from './easing';
import { blink, shake } from './oscillators';
import { frames, segment, within } from './progress';

const curves = Object.entries(easing).filter(
  (entry): entry is [string, easing.Easing] =>
    typeof entry[1] === 'function' && entry[1].length === 1 && entry[0] !== 'steps' && entry[0] !== 'easeOutBackWith',
);

describe('easing', () => {
  it.each(curves)('%s starts at 0 and ends at 1', (_name, curve) => {
    expect(curve(0)).toBeCloseTo(0, 10);
    expect(curve(1)).toBeCloseTo(1, 10);
  });

  it('overshoots with easeOutBack', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easing.easeOutBack(i / 100)));
    expect(peak).toBeGreaterThan(1.05);
  });

  it('quantises with steps(n)', () => {
    const s = easing.steps(4);
    expect([0, 0.2, 0.25, 0.49, 0.5, 0.99, 1].map(s)).toEqual([0, 0, 0.25, 0.25, 0.5, 0.75, 1]);
    expect(() => easing.steps(0)).toThrow(RangeError);
  });
});

describe('segment', () => {
  it('clamps outside the window and eases inside it', () => {
    expect(segment(0, 1, 2)).toBe(0);
    expect(segment(1.5, 1, 2)).toBe(0.5);
    expect(segment(3, 1, 2)).toBe(1);
    expect(segment(1.5, 1, 2, easing.easeInQuad)).toBe(0.25);
  });

  it('treats an empty window as complete', () => {
    expect(segment(1, 1, 1)).toBe(1);
  });

  it('reports membership with within()', () => {
    expect(within(1, 1, 2)).toBe(true);
    expect(within(2, 1, 2)).toBe(false);
  });
});

describe('oscillators', () => {
  it('blinks 32 frames on, 16 off', () => {
    expect(blink(frames(0), frames(32), frames(16))).toBe(true);
    expect(blink(frames(31), frames(32), frames(16))).toBe(true);
    expect(blink(frames(33), frames(32), frames(16))).toBe(false);
    expect(blink(frames(49), frames(32), frames(16))).toBe(true);
  });

  it('shakes deterministically and settles', () => {
    expect(shake(1.01, 1, 0.1, 3)).toEqual(shake(1.01, 1, 0.1, 3));
    expect(shake(1.2, 1, 0.1, 3)).toEqual({ x: 0, y: 0 });
    expect(shake(0.5, 1, 0.1, 3)).toEqual({ x: 0, y: 0 });
  });
});
