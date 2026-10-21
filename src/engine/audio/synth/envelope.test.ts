import { describe, expect, it } from 'vitest';
import { type Envelope, envelopeLength, envelopeLevel, envelopePoints, SILENCE } from './envelope';

const pluck: Envelope = { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.1 };

describe('envelope', () => {
  it('rises linearly, decays exponentially to the sustain level and holds it', () => {
    expect(envelopeLevel(pluck, 1, 1, 0)).toBe(0);
    expect(envelopeLevel(pluck, 1, 1, 0.005)).toBeCloseTo(0.5);
    expect(envelopeLevel(pluck, 1, 1, 0.01)).toBeCloseTo(1);
    // Halfway through an exponential decay from 1 to 0.5 is the geometric mean.
    expect(envelopeLevel(pluck, 1, 1, 0.11)).toBeCloseTo(Math.SQRT1_2);
    expect(envelopeLevel(pluck, 1, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('releases from wherever the note was let go', () => {
    expect(envelopeLevel(pluck, 1, 0.005, 0.005)).toBeCloseTo(0.5);
    expect(envelopeLevel(pluck, 1, 0.005, 0.055)).toBeCloseTo(0.5 * Math.sqrt(SILENCE), 6);
    expect(envelopeLevel(pluck, 1, 0.005, 0.2)).toBe(0);
    expect(envelopeLength(pluck, 0.5)).toBeCloseTo(0.6);
  });

  it('scales with the peak', () => {
    expect(envelopeLevel(pluck, 0.25, 1, 0.5)).toBeCloseTo(0.125);
  });

  it('emits points that agree with the level function at every breakpoint', () => {
    for (const hold of [0, 0.004, 0.1, 0.6]) {
      const points = envelopePoints(pluck, 0.8, 2, hold);
      for (const point of points.slice(1, -1)) {
        // Sampled a hair early: each point is the value a ramp reaches as it *arrives* at that time.
        expect(point.value).toBeCloseTo(envelopeLevel(pluck, 0.8, hold, point.time - 2 - 1e-9), 6);
      }
      const times = points.map((point) => point.time);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(points.at(-1)).toEqual({ kind: 'set', value: 0, time: 2 + hold + pluck.release });
    }
  });

  it('never asks for an exponential ramp to zero or below', () => {
    const percussive: Envelope = { attack: 0, decay: 0.3, sustain: 0, release: 0.05 };
    for (const point of envelopePoints(percussive, 1, 0, 0.2)) {
      if (point.kind === 'exp') expect(point.value).toBeGreaterThan(0);
    }
  });
});
