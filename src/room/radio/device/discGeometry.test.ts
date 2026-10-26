import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DISC_HOLE_RADIUS, DISC_RADIUS, DISC_THICKNESS } from '../discLayout';
import { discGeometry } from './discGeometry';

describe('discGeometry', () => {
  it('is a 120 mm disc with a 15 mm hole, 1.2 mm thick, in 512 triangles', () => {
    const geometry = discGeometry();
    expect((geometry.getIndex()?.count ?? 0) / 3).toBe(512);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.x).toBeCloseTo(DISC_RADIUS, 6);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(DISC_THICKNESS / 2, 6);
    const position = geometry.getAttribute('position');
    const radii = Array.from({ length: position.count }, (_, i) => Math.hypot(position.getX(i), position.getY(i)));
    expect(Math.min(...radii)).toBeCloseTo(DISC_HOLE_RADIUS, 6);
  });

  it('winds every face outwards, with matching normals and uv on the 120 mm square', () => {
    const geometry = discGeometry();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const index = geometry.getIndex();
    if (!index) throw new Error('indexed');
    const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
    for (let t = 0; t < index.count; t += 3) {
      a.fromBufferAttribute(position, index.getX(t));
      b.fromBufferAttribute(position, index.getX(t + 1));
      c.fromBufferAttribute(position, index.getX(t + 2));
      const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const n = new Vector3().fromBufferAttribute(normal, index.getX(t));
      expect(face.dot(n)).toBeGreaterThan(0.9);
    }
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(position.getX(i) / (2 * DISC_RADIUS) + 0.5, 6);
      expect(uv.getY(i)).toBeCloseTo(position.getY(i) / (2 * DISC_RADIUS) + 0.5, 6);
    }
  });
});
