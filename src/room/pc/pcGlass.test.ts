import { Box3, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PC_SPEC } from '../gen/roomSpec';
import { createPcGlass, PC_SCREEN_INTERACTION_ID } from './pcGlass';

const glass = createPcGlass();
glass.updateMatrixWorld(true);
const { minX, maxX, minY, maxY, rimZ, bulge, columns, rows } = PC_SPEC.glass;

describe("the monitor's glass", () => {
  it('is the screen the room looks for, with a white material for the still', () => {
    expect(glass.userData.interaction_id).toBe(PC_SCREEN_INTERACTION_ID);
    expect(glass.userData.replaceable_screen).toBe(true);
    expect(glass.material.isMeshBasicMaterial).toBe(true);
    expect(glass.material.color.getHex()).toBe(0xffffff);
    expect(glass.geometry.getAttribute('position').count).toBe((columns + 1) * (rows + 1));
  });

  it("spans the spec's rectangle, its rim flat on the rim's plane and its middle nearer the viewer", () => {
    const box = new Box3().setFromObject(glass);
    expect(box.min.x).toBeCloseTo(minX, 6);
    expect(box.max.x).toBeCloseTo(maxX, 6);
    expect(box.min.y).toBeCloseTo(minY, 6);
    expect(box.max.y).toBeCloseTo(maxY, 6);
    expect(box.min.z).toBeCloseTo(rimZ, 6);
    expect(box.max.z).toBeCloseTo(rimZ + bulge, 6);
    const position = glass.geometry.getAttribute('position');
    const uv = glass.geometry.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      const onRim = [0, 1].includes(uv.getX(i)) || [0, 1].includes(uv.getY(i));
      if (onRim) expect(position.getZ(i)).toBeCloseTo(rimZ, 6);
    }
  });

  it('has planar UVs with v = 0 at the top, and unit normals towards the viewer (+z)', () => {
    const position = glass.geometry.getAttribute('position');
    const uv = glass.geometry.getAttribute('uv');
    const normal = glass.geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      expect(uv.getX(i)).toBeCloseTo((position.getX(i) - minX) / (maxX - minX), 6);
      expect(uv.getY(i)).toBeCloseTo((maxY - position.getY(i)) / (maxY - minY), 6);
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
      expect(normal.getZ(i)).toBeGreaterThan(0.9);
    }
  });

  it('faces the viewer: a ray from the chair hits it, with the UV under the ray; one from behind does not', () => {
    const target = new Vector3(minX + (maxX - minX) * 0.25, maxY - (maxY - minY) * 0.75, rimZ);
    const hit = new Raycaster(target.clone().add(new Vector3(0, 0, 1)), new Vector3(0, 0, -1)).intersectObject(
      glass,
    )[0];
    expect(hit?.uv?.x).toBeCloseTo(0.25, 3);
    expect(hit?.uv?.y).toBeCloseTo(0.75, 3);
    const behind = new Raycaster(target.clone().add(new Vector3(0, 0, -1)), new Vector3(0, 0, 1));
    expect(behind.intersectObject(glass)).toHaveLength(0);
  });
});
