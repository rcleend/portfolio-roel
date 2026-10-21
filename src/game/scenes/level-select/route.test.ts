import { describe, expect, it } from 'vitest';
import { ROUTE_LOOP_SECONDS, routePose, stopToX } from './route';

describe('routePose', () => {
  it('parks at the first stop, flies forward in career order and ends at the open stop', () => {
    expect(routePose(0)).toEqual({ position: 0, flying: false });
    const samples = Array.from({ length: 200 }, (_, i) => routePose((i / 200) * ROUTE_LOOP_SECONDS).position);
    samples.forEach((position, i) => {
      expect(position).toBeGreaterThanOrEqual(samples[i - 1] ?? 0);
    });
    expect(routePose(ROUTE_LOOP_SECONDS - 0.01)).toEqual({ position: 2, flying: false });
  });

  it('loops', () => {
    expect(routePose(ROUTE_LOOP_SECONDS + 1.5)).toEqual(routePose(1.5));
  });

  it('reports flying only between stops', () => {
    expect(routePose(2).flying).toBe(true);
    expect(routePose(2).position).toBeGreaterThan(0);
    expect(routePose(2).position).toBeLessThan(1);
  });
});

describe('stopToX', () => {
  const stops = [10, 110, 210];

  it('maps whole stops to their x and interpolates between them', () => {
    expect(stopToX(0, stops)).toBe(10);
    expect(stopToX(1.5, stops)).toBe(160);
    expect(stopToX(2, stops)).toBe(210);
  });

  it('clamps outside the route', () => {
    expect(stopToX(-1, stops)).toBe(10);
    expect(stopToX(5, stops)).toBe(210);
  });
});
