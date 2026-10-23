import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PICK_CHUNK_TRIANGLES, PICK_CUT_TRIANGLES, pickedMesh, pickMeshes } from './pickMeshes';

function triangles(mesh: Mesh): number[][] {
  const index = mesh.geometry.getIndex();
  if (!index) throw new Error('Expected an indexed geometry');
  const result: number[][] = [];
  for (let i = 0; i < index.count; i += 3) result.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
  return result;
}

describe('pick meshes', () => {
  const material = new MeshBasicMaterial();

  it('keeps meshes up to the cutting size as they are', () => {
    const box = new Mesh(new BoxGeometry(), material);
    const sphere = new Mesh(new SphereGeometry(1, 64, 64), material);
    expect(sphere.geometry.index?.count).toBeLessThanOrEqual(PICK_CUT_TRIANGLES * 3);
    const root = new Group().add(box, sphere);
    expect(pickMeshes(root)).toEqual([box, sphere]);
    expect(pickedMesh(box)).toBe(box);
  });

  it('cuts a large mesh into chunks that cover each triangle exactly once', () => {
    const sphere = new Mesh(new SphereGeometry(1, 96, 64), material);
    const chunks = pickMeshes(sphere);
    expect(chunks.length).toBeGreaterThan(1);
    const all = chunks.flatMap(triangles);
    for (const chunk of chunks) {
      expect(triangles(chunk).length).toBeLessThanOrEqual(PICK_CHUNK_TRIANGLES);
      expect(chunk.geometry.getAttribute('position')).toBe(sphere.geometry.getAttribute('position'));
      expect(pickedMesh(chunk)).toBe(sphere);
    }
    const key = (triangle: number[]) => triangle.join(',');
    expect(all.map(key).sort()).toEqual(triangles(sphere).map(key).sort());
  });

  it('finds exactly the hits the whole mesh gives, where the mesh is now', () => {
    const sphere = new Mesh(new SphereGeometry(1, 96, 64), material);
    const chunks = pickMeshes(sphere);
    // Moved after the chunks were cut: they share the mesh's world matrix.
    sphere.position.set(0.3, -0.2, 0.1);
    sphere.rotation.set(0.4, 1.1, 0);
    sphere.updateMatrixWorld();
    const raycaster = new Raycaster();
    const origin = new Vector3(0, 0, 5);
    for (let x = -1.4; x <= 1.4; x += 0.2) {
      for (let y = -1.4; y <= 1.4; y += 0.2) {
        raycaster.set(origin, new Vector3(x, y, -5).normalize());
        const whole = raycaster.intersectObject(sphere, false)[0];
        const cut = raycaster.intersectObjects(chunks, false)[0];
        expect(cut === undefined).toBe(whole === undefined);
        if (!whole || !cut) continue;
        expect(cut.distance).toBeCloseTo(whole.distance, 9);
        expect(cut.point.distanceTo(whole.point)).toBeLessThan(1e-9);
        expect(cut.uv?.distanceTo(whole.uv ?? cut.uv)).toBeLessThan(1e-9);
      }
    }
  });
});
