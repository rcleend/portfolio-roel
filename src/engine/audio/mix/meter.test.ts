import { describe, expect, it } from 'vitest';
import { measure, toDb } from './meter';

const RATE = 8000;

function sine(seconds: number, amplitude: number): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * 440 * i) / RATE),
  );
}

describe('measure', () => {
  it('reports peak and RMS of a sine', () => {
    const result = measure([sine(1, 0.5), sine(1, 0.5)], RATE);
    expect(result.seconds).toBe(1);
    expect(result.peakDb).toBeCloseTo(toDb(0.5), 1);
    expect(result.rmsDb).toBeCloseTo(toDb(0.5 / Math.SQRT2), 1);
    expect(result.loudnessDb).toBeCloseTo(result.rmsDb, 1);
    expect(result.nonFinite).toBe(0);
  });

  it('gates silence out of the loudness figure but not out of the RMS', () => {
    // 1.2 s of tone then 1.2 s of silence: three loud 400 ms blocks, three silent ones.
    const half = new Float32Array(2.4 * RATE);
    half.set(sine(1.2, 0.5));
    const result = measure([half], RATE);
    expect(result.loudnessDb).toBeCloseTo(toDb(0.5 / Math.SQRT2), 1);
    expect(result.rmsDb).toBeCloseTo(toDb(0.5 / Math.SQRT2) - 3, 0);
    expect(result.tailPeakDb).toBe(Number.NEGATIVE_INFINITY);
  });

  it('counts NaN and infinite samples', () => {
    const broken = Float32Array.from([0, Number.NaN, 0.1, Number.POSITIVE_INFINITY]);
    expect(measure([broken], RATE).nonFinite).toBe(2);
  });
});
