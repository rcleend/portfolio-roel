import { describe, expect, it } from 'vitest';
import { TICKS_PER_BEAT, tickToSeconds, timing } from './timing';

describe('timing', () => {
  it('maps ticks to seconds at the tempo', () => {
    const straight = timing(120);
    expect(tickToSeconds(straight, TICKS_PER_BEAT)).toBeCloseTo(0.5);
    expect(tickToSeconds(straight, 4 * TICKS_PER_BEAT)).toBeCloseTo(2);
  });

  it('pushes every second 16th late under swing but keeps beats on the grid', () => {
    const shuffle = timing(120, 1 / 3);
    const sixteenth = 0.125;
    expect(tickToSeconds(shuffle, 6)).toBeCloseTo(sixteenth * (4 / 3));
    expect(tickToSeconds(shuffle, 12)).toBeCloseTo(2 * sixteenth);
    expect(tickToSeconds(shuffle, 18)).toBeCloseTo(sixteenth * (2 + 4 / 3));
    expect(tickToSeconds(shuffle, 24)).toBeCloseTo(0.5);
  });

  it('stays monotonic between grid points', () => {
    const shuffle = timing(97, 0.2);
    for (let tick = 1; tick < 200; tick++) {
      expect(tickToSeconds(shuffle, tick)).toBeGreaterThan(tickToSeconds(shuffle, tick - 1));
    }
  });

  it('rejects impossible settings', () => {
    expect(() => timing(0)).toThrow(RangeError);
    expect(() => timing(120, 0.5)).toThrow(RangeError);
  });
});
