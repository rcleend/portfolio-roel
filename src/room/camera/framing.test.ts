import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { boxCorners, frameSubject, regionFromInsets } from './framing';

const square = [new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(1, 1, 0), new Vector3(-1, 1, 0)];
const lookDown = { direction: new Vector3(0, 0, -1), up: new Vector3(0, 1, 0) };

function projectedExtent(points: Vector3[], eye: Vector3, fovY: number, aspect: number) {
  const tanY = Math.tan((fovY * Math.PI) / 360);
  const xs = points.map((p) => (p.x - eye.x) / ((eye.z - p.z) * tanY * aspect));
  const ys = points.map((p) => (p.y - eye.y) / ((eye.z - p.z) * tanY));
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('frameSubject', () => {
  it('backs off exactly far enough for a flat square at 90°', () => {
    const pose = frameSubject({ points: square, ...lookDown, fovY: 90, aspect: 1, margin: 0 });
    expect(pose.position.x).toBeCloseTo(0);
    expect(pose.position.y).toBeCloseTo(0);
    expect(pose.position.z).toBeCloseTo(1, 4);
    expect(pose.target.z).toBeCloseTo(0, 4);
  });

  it('is limited by width on a portrait viewport', () => {
    const pose = frameSubject({ points: square, ...lookDown, fovY: 90, aspect: 0.5, margin: 0 });
    const extent = projectedExtent(square, pose.position, 90, 0.5);
    expect(extent.maxX).toBeCloseTo(1, 3);
    expect(extent.maxY).toBeLessThan(0.6);
  });

  it('keeps the requested margin free', () => {
    const pose = frameSubject({ points: square, ...lookDown, fovY: 60, aspect: 16 / 9, margin: 0.1 });
    const extent = projectedExtent(square, pose.position, 60, 16 / 9);
    expect(extent.maxY).toBeCloseTo(0.8, 3);
    expect(extent.minY).toBeCloseTo(-0.8, 3);
  });

  it('centres a deep box in projection, not in 3D', () => {
    const corners = boxCorners(new Vector3(-1, 0, -2), new Vector3(1, 1, 0));
    const pose = frameSubject({ points: corners, ...lookDown, fovY: 50, aspect: 1.5, margin: 0.05 });
    const extent = projectedExtent(corners, pose.position, 50, 1.5);
    expect((extent.minX + extent.maxX) / 2).toBeCloseTo(0, 3);
    expect((extent.minY + extent.maxY) / 2).toBeCloseTo(0, 3);
  });

  it('frames into a sub-region of the viewport', () => {
    const region = regionFromInsets({ width: 400, height: 800 }, { top: 0, right: 0, bottom: 400, left: 0 });
    expect(region).toEqual({ left: -1, right: 1, top: 1, bottom: 0 });
    const pose = frameSubject({ points: square, ...lookDown, fovY: 70, aspect: 0.5, region, margin: 0 });
    const extent = projectedExtent(square, pose.position, 70, 0.5);
    expect((extent.minY + extent.maxY) / 2).toBeCloseTo(0.5, 3);
    expect(Math.max(extent.maxX, extent.maxY - 0.5)).toBeLessThanOrEqual(1.0001);
  });
});
