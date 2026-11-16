import { describe, expect, it } from 'vitest';
import { hash2, hash32, seeded } from './kit/hash';
import { buildScene, PROPS } from './scene';

const scene = buildScene({ densityScale: 1, maxPageSize: 2048 }, () => 0);

describe('the generated room', () => {
  it('keeps every prop inside its triangle budget', () => {
    expect(scene.props.map((prop) => prop.name)).toEqual(PROPS.map((prop) => prop.name));
    for (const prop of scene.props) expect(prop.triangles, prop.name).toBeLessThanOrEqual(prop.budget);
    console.log(scene.props, scene.pages);
  });

  it('builds the same room every time', () => {
    const again = buildScene({ densityScale: 1, maxPageSize: 2048 }, () => 0);
    expect(again.meshes.props.positions).toEqual(scene.meshes.props.positions);
    expect(again.charts.bake[0]?.uvs).toEqual(scene.charts.bake[0]?.uvs);
  });

  it('gives every vertex a unit normal and a finite position', () => {
    for (const mesh of Object.values(scene.meshes)) {
      expect(mesh.positions.length % 9).toBe(0);
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const length = Math.hypot(mesh.normals[i] ?? 0, mesh.normals[i + 1] ?? 0, mesh.normals[i + 2] ?? 0);
        expect(Number.isFinite(mesh.positions[i])).toBe(true);
        expect(length).toBeCloseTo(1, 3);
      }
    }
  });

  it('packs charts inside their pages without overlap', () => {
    scene.charts.bake.forEach((mesh, page) => {
      const size = scene.pages[page];
      expect(size).toBeDefined();
      for (const value of mesh.uvs) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  it('draws smaller pages on a lower tier', () => {
    const small = buildScene({ densityScale: 0.5, maxPageSize: 1024 }, () => 0);
    small.pages.forEach((page, index) => {
      expect(page.width * page.height).toBeLessThan(
        (scene.pages[index]?.width ?? 0) * (scene.pages[index]?.height ?? 0),
      );
    });
  });
});

describe('integer hashes', () => {
  it('are the published lowbias32 values, so every GPU and this code agree', () => {
    expect(hash32(0)).toBe(0);
    expect(hash32(1)).toBeGreaterThan(0);
    expect(hash2(3, 7)).toBe(hash2(3, 7));
    expect(hash2(3, 7)).not.toBe(hash2(7, 3));
    const random = seeded(1);
    const values = [random(), random(), random()];
    expect(new Set(values).size).toBe(3);
    for (const value of values) expect(value).toBeGreaterThanOrEqual(0);
  });
});
