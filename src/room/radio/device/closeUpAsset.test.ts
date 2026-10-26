import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { assembleParts, type CloseUpExtras, type TriangleList } from './closeUpAsset';
import { indexedBounds } from './cutParts';

/** A strip of `count` unit-square-ish triangles along x, triangle t spanning x t…t + 1. */
function strip(count: number): BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (let t = 0; t < count; t++) {
    positions.push(t, 0, 0, t + 1, 0, 0, t, 1, 0);
    index.push(3 * t, 3 * t + 1, 3 * t + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(index);
  return geometry;
}

function list(mesh: string, triangles: readonly number[]): TriangleList {
  // Each triangle t spans x t…t + 1, y 0…1, z 0.
  const min = Math.min(...triangles);
  const max = Math.max(...triangles) + 1;
  return {
    mesh,
    ranges: triangles.map((t) => [t, 1] as const),
    bounds: [
      [min, 0, 0],
      [max, 1, 0],
    ],
  };
}

function radio(parts: CloseUpExtras['parts'] = defaultParts()) {
  const meshes = new Map<string, Mesh>([
    ['Lid', new Mesh(strip(4), new MeshBasicMaterial())],
    ['Keys', new Mesh(strip(10), new MeshBasicMaterial())],
  ]);
  for (const [name, mesh] of meshes) mesh.name = name;
  const extras = {
    radioCloseup: 1,
    base: {
      file: 'radio-base.glb',
      geometrySha256: '',
      meshes: { Lid: { vertices: 12, triangles: 4 }, Keys: { vertices: 30, triangles: 10 } },
    },
    parts,
    hinge: { point: [0, 0, 0], axis: [1, 0, 0], openDegrees: 84 },
    rocker: { pivot: [5, 0.5, 0], axis: [1, 0, 0], tiltDegrees: 4 },
    keyTravel: { axis: [0, 0, -1], metres: 0.0015 },
  } as unknown as CloseUpExtras;
  const scene = new Group();
  scene.userData = extras;
  for (const name of ['Radio_CD_Well', 'Radio_CD_LidInner']) {
    const mesh = new Mesh(strip(1), new MeshBasicMaterial());
    mesh.name = name;
    scene.add(mesh);
  }
  const before = new Map([...meshes].map(([name, mesh]) => [name, mesh.geometry.getIndex()]));
  return { gltf: { scene } as unknown as GLTF, meshes, before, root: new Group() };
}

function defaultParts(): CloseUpExtras['parts'] {
  // The key lists interleave in one mesh, as the shipped rocker's halves and side keys do.
  return {
    lid: list('Lid', [1, 2]),
    rockerTop: list('Keys', [6, 7]),
    rockerBottom: list('Keys', [4, 5]),
    previous: list('Keys', [1, 2]),
    next: list('Keys', [8]),
    wellFloor: list('Lid', [3]),
  };
}

const triangleXs = (geometry: BufferGeometry): number[] => {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const xs: number[] = [];
  for (let i = 0; index && i < index.count; i += 3) xs.push(position.getX(index.getX(i)));
  return xs;
};

describe('assembleParts', () => {
  it('cuts every part from its own list, however the lists of one mesh interleave', () => {
    const { gltf, meshes, root } = radio();
    const parts = assembleParts(gltf, meshes, root);
    expect(triangleXs(parts.lid.geometry)).toEqual([1, 2]);
    expect(triangleXs(parts.rockerTop.geometry)).toEqual([6, 7]);
    expect(triangleXs(parts.rockerBottom.geometry)).toEqual([4, 5]);
    expect(triangleXs(parts.previous.geometry)).toEqual([1, 2]);
    expect(triangleXs(parts.next.geometry)).toEqual([8]);
    expect(triangleXs(parts.wellFloor.geometry)).toEqual([3]);
    expect(parts.wellFloor.parent).toBe(root);
    const lid = meshes.get('Lid');
    expect(lid && triangleXs(lid.geometry)).toEqual([0]);
    const keys = meshes.get('Keys');
    expect(keys && triangleXs(keys.geometry)).toEqual([0, 3, 9]);
  });

  it('restores the shipped meshes exactly, and leaves their shared attributes alone', () => {
    const { gltf, meshes, before, root } = radio();
    const position = meshes.get('Keys')?.geometry.getAttribute('position');
    const parts = assembleParts(gltf, meshes, root);
    parts.restore();
    parts.restore();
    for (const [name, mesh] of meshes) expect(mesh.geometry.getIndex()).toBe(before.get(name));
    expect(meshes.get('Keys')?.geometry.getAttribute('position')).toBe(position);
    expect(root.children).toHaveLength(0);
  });

  it('changes nothing of the shipped radio when a part is not where the close-up measured it', () => {
    const shifted = defaultParts();
    const next = shifted.next;
    const moved: CloseUpExtras['parts'] = {
      ...shifted,
      next: {
        ...next,
        bounds: [
          [8.004, 0, 0],
          [9.004, 1, 0],
        ],
      },
    };
    const { gltf, meshes, before, root } = radio(moved);
    expect(() => assembleParts(gltf, meshes, root)).toThrow(/next/);
    for (const [name, mesh] of meshes) expect(mesh.geometry.getIndex()).toBe(before.get(name));
    const lid = meshes.get('Lid');
    expect(lid && indexedBounds(lid.geometry).max.x).toBe(4);
  });

  it('changes nothing when the close-up lacks one of its own meshes', () => {
    const { gltf, meshes, before, root } = radio();
    gltf.scene.getObjectByName('Radio_CD_Well')?.removeFromParent();
    expect(() => assembleParts(gltf, meshes, root)).toThrow(/Radio_CD_Well/);
    for (const [name, mesh] of meshes) expect(mesh.geometry.getIndex()).toBe(before.get(name));
  });
});
