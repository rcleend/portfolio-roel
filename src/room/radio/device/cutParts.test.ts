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

const indices = (geometry: BufferGeometry | undefined): number[] => [...(geometry?.getIndex()?.array ?? [])];

describe('cutTriangles', () => {
  it('moves exactly the listed triangles into a child sharing every attribute, once committed', () => {
    const geometry = grid();
    const attributes = { ...geometry.attributes };
    const cut = cutTriangles(geometry, [[2, 3]]);
    expect(indices(cut.parts[0])).toEqual([1, 4, 5, 1, 5, 2]);
    // Planning changes nothing.
    expect(indices(geometry)).toEqual([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2]);
    cut.commit();
    expect(indices(geometry)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(cut.parts[0]?.getAttribute('position')).toBe(attributes.position);
    expect(cut.parts[0]?.getAttribute('uv')).toBe(attributes.uv);
    expect(geometry.getAttribute('position')).toBe(attributes.position);
  });

  it('reads every list against the original numbering, however many parts share the geometry', () => {
    // The rocker's halves and both side keys come from one mesh: a cut must not renumber the next one's list.
    const geometry = grid();
    const cut = cutTriangles(geometry, [[1], [3], [0]]);
    expect(cut.parts.map(indices)).toEqual([
      [0, 2, 3],
      [1, 5, 2],
      [0, 1, 2],
    ]);
    cut.commit();
    expect(indices(geometry)).toEqual([1, 4, 5]);
  });

  it('gives the parent back its original index on restore', () => {
    const geometry = grid();
    const original = geometry.getIndex();
    const cut = cutTriangles(geometry, [[0, 1]]);
    cut.commit();
    cut.commit();
    expect(geometry.getIndex()).not.toBe(original);
    cut.restore();
    expect(geometry.getIndex()).toBe(original);
    expect(geometry.boundingBox?.max.x).toBe(2);
  });

  it('bounds each child by the vertices it uses, not the shared buffer', () => {
    const [child] = cutTriangles(grid(), [[2, 3]]).parts;
    expect(child?.boundingBox?.min.toArray()).toEqual([1, 0, 0]);
    expect(child?.boundingBox?.max.toArray()).toEqual([2, 1, 0]);
    expect(child && indexedBounds(child).min.x).toBe(1);
  });

  it('refuses a triangle the geometry does not have, or one listed twice, before changing anything', () => {
    const geometry = grid();
    expect(() => cutTriangles(geometry, [[4]])).toThrow(RangeError);
    expect(() => cutTriangles(geometry, [[1, 1]])).toThrow();
    expect(() => cutTriangles(geometry, [[1], [1]])).toThrow();
    expect(indices(geometry)).toHaveLength(12);
  });
});
