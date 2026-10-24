import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { PoseSegment } from './discMotion';
import { hurry, hurryWithin, peakSpeed, warpSegments } from './timeWarp';

describe('hurry', () => {
  it('plays the span in the duration, at the film’s own speed at both ends', () => {
    const warp = hurry(1000, 5000, 800, 200);
    expect(warp.film(1000)).toBe(5000);
    expect(warp.film(1200)).toBeCloseTo(5800, 9);
    expect(warp.realEnd).toBe(1200);
    const speed = (t: number) => (warp.film(t + 0.01) - warp.film(t - 0.01)) / 0.02;
    expect(speed(1000.01)).toBeCloseTo(1, 2);
    expect(speed(1199.99)).toBeCloseTo(1, 2);
    expect(speed(1100)).toBeGreaterThan(4);
    // Outside the warp the film runs on in step.
    expect(warp.film(900)).toBe(4900);
    expect(warp.film(1300)).toBeCloseTo(5900, 9);
  });

  it('is monotone and inverts exactly', () => {
    const warp = hurry(0, 0, 1400, 250);
    let last = Number.NEGATIVE_INFINITY;
    for (let t = -50; t <= 400; t += 1) {
      const f = warp.film(t);
      expect(f).toBeGreaterThan(last);
      expect(warp.real(f)).toBeCloseTo(t, 6);
      last = f;
    }
  });

  it('never slows the film down: a span shorter than the duration plays as it is', () => {
    const warp = hurry(100, 100, 120, 200);
    expect(warp.realEnd).toBe(220);
    for (const t of [100, 150, 219]) expect(warp.film(t)).toBeCloseTo(t, 9);
  });
});

describe('warpSegments', () => {
  const along = (start: number, end: number, x0: number, x1: number): PoseSegment & { phase: string } => ({
    start,
    end,
    phase: 'test',
    at: (t) => ({
      position: new Vector3(x0 + ((x1 - x0) * (t - start)) / (end - start), 0, 0),
      orientation: new Quaternion(),
      scale: 1,
    }),
  });

  it('keeps the paths, clipped to the film, in real time, and carries the rest of each segment', () => {
    const segments = [along(0, 400, 0, 4), along(400, 800, 4, 6), along(800, 1000, 6, 7)];
    const warp = hurry(200, 200, 600, 150);
    const warped = warpSegments(segments, warp);
    expect(warped.map((segment) => segment.phase)).toEqual(['test', 'test']);
    expect(warped[0]?.start).toBe(200);
    expect(warped[1]?.end).toBeCloseTo(350, 9);
    // Continuous where the hurry starts and across the joint, and the same places as the film.
    expect(warped[0]?.at(200).position.x).toBeCloseTo(2, 9);
    expect(warped[0]?.at(warped[0].end).position.x).toBeCloseTo(4, 6);
    expect(warped[1]?.at(warped[1].start).position.x).toBeCloseTo(4, 6);
    expect(warped[1]?.at(350).position.x).toBeCloseTo(6, 6);
  });
});

describe('hurryWithin', () => {
  // A film that crosses a metre at a steady 1 mm/ms.
  const path = (f: number) => new Vector3(Math.min(1, Math.max(0, f / 1000)), 0, 0);

  it('hurries as asked while the path stays under the speed', () => {
    const warp = hurryWithin(path, 0, 0, 1000, 500, 0.01);
    expect(warp.realEnd).toBe(500);
    expect(peakSpeed(path, warp, 4)).toBeLessThanOrEqual(0.01);
  });

  it('takes longer rather than move the path faster than the speed', () => {
    const warp = hurryWithin(path, 0, 0, 1000, 200, 0.003);
    expect(warp.realEnd).toBeGreaterThan(200);
    expect(peakSpeed(path, warp, 4)).toBeLessThanOrEqual(0.003);
    // The shortest that does: a little quicker breaks the speed.
    expect(peakSpeed(path, hurry(0, 0, 1000, warp.realEnd - 8), 4)).toBeGreaterThan(0.003);
  });

  it('plays the film as it is when even that is too fast, and an empty span at once', () => {
    expect(hurryWithin(path, 0, 0, 1000, 100, 0.0001).realEnd).toBe(1000);
    const none = hurryWithin(path, 50, 50, 0, 100, 0.001);
    expect(none.realEnd).toBe(50);
    expect(peakSpeed(path, none, 4)).toBe(0);
  });
});
