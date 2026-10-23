import { describe, expect, it } from 'vitest';
import { rampAt } from './ramp';

const ramp = [
  { r: 0, g: 0, b: 0, a: 255 },
  { r: 128, g: 128, b: 128, a: 255 },
  { r: 255, g: 255, b: 255, a: 255 },
];

describe('rampAt', () => {
  it('rounds to the nearest entry and clamps to the ends', () => {
    expect(rampAt(ramp, 0.6)).toBe(ramp[1]);
    expect(rampAt(ramp, -3)).toBe(ramp[0]);
    expect(rampAt(ramp, 9)).toBe(ramp[2]);
    expect(() => rampAt([], 0)).toThrow(RangeError);
  });
});
