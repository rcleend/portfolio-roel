import { BufferAttribute, BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { cutTriangles, indexedBounds } from './cutParts';

function grid(): BufferGeometry {
  // Four triangles side by side along x, two per unit square.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0, 0, 2, 1, 0]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(12), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2]);
  return geometry;
}

describe('cutTriangles', () => {
  it('moves exactly the listed triangles into a child sharing every attribute', () => {
    const geometry = grid();
    const attributes = { ...geometry.attributes };
    const child = cutTriangles(geometry, [2, 3]);
    expect([...(child.getIndex()?.array ?? [])]).toEqual([1, 4, 5, 1, 5, 2]);
    expect([...(geometry.getIndex()?.array ?? [])]).toEqual([0, 1, 2, 0, 2, 3]);
    expect(child.getAttribute('position')).toBe(attributes.position);
    expect(child.getAttribute('uv')).toBe(attributes.uv);
    expect(geometry.getAttribute('position')).toBe(attributes.position);
  });

  it('bounds the child by the vertices it uses, not the shared buffer', () => {
    const child = cutTriangles(grid(), [2, 3]);
    expect(child.boundingBox?.min.toArray()).toEqual([1, 0, 0]);
    expect(child.boundingBox?.max.toArray()).toEqual([2, 1, 0]);
    expect(indexedBounds(child).min.x).toBe(1);
  });

  it('refuses a triangle the geometry does not have, or one listed twice', () => {
    expect(() => cutTriangles(grid(), [4])).toThrow(RangeError);
    expect(() => cutTriangles(grid(), [1, 1])).toThrow();
  });
});
