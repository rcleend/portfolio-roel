import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { fovForAspect, interpolateViewpoint, type Viewpoint } from './cameraPath';

const from: Viewpoint = { position: new Vector3(0, 1, 0), target: new Vector3(1, 1, 0), fov: 30 };
const to: Viewpoint = { position: new Vector3(4, 1, 0), target: new Vector3(4, 0, -4), fov: 60 };

describe('interpolateViewpoint', () => {
  it('starts and ends exactly on the viewpoints', () => {
    const start = interpolateViewpoint(from, to, 0, 0.3);
    const end = interpolateViewpoint(from, to, 1, 0.3);
    expect(start.position.toArray()).toEqual(from.position.toArray());
    expect(end.position.distanceTo(to.position)).toBeLessThan(1e-9);
    expect(end.target.distanceTo(to.target)).toBeLessThan(1e-9);
    expect(end.fov).toBe(60);
  });

  it('arcs upwards by the lift at the midpoint', () => {
    const mid = interpolateViewpoint(from, to, 0.5, 0.3);
    expect(mid.position.x).toBeCloseTo(2);
    expect(mid.position.y).toBeCloseTo(1.3);
    expect(mid.fov).toBe(45);
  });

  it('does not mutate its inputs', () => {
    interpolateViewpoint(from, to, 0.5, 0.3);
    expect(from.position.toArray()).toEqual([0, 1, 0]);
  });
});

describe('fovForAspect', () => {
  it('keeps the base FOV on wide screens', () => {
    expect(fovForAspect(60, 80, 16 / 9, 90)).toBe(60);
  });

  it('widens on portrait screens to keep enough of the room in view, up to a cap', () => {
    const portrait = fovForAspect(60, 60, 0.5, 100);
    expect(portrait).toBeGreaterThan(60);
    const horizontal = 2 * Math.atan(Math.tan((portrait * Math.PI) / 360) * 0.5);
    expect((horizontal * 180) / Math.PI).toBeCloseTo(60);
    expect(fovForAspect(60, 80, 0.3, 85)).toBe(85);
  });
});
