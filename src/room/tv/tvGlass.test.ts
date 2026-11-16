import { Box3, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TV_SPEC } from '../gen/roomSpec';
import { createTvGlass, TV_SCREEN_INTERACTION_ID } from './tvGlass';

const glass = createTvGlass();
glass.updateMatrixWorld(true);
const { left, right, top, bottom, front, bulge, columns, rows } = TV_SPEC.glass;

describe("the TV's glass", () => {
  it('is the screen the room looks for', () => {
    expect(glass.userData.interaction_id).toBe(TV_SCREEN_INTERACTION_ID);
    expect(glass.userData.replaceable_screen).toBe(true);
    expect(glass.geometry.getAttribute('position').count).toBe((columns + 1) * (rows + 1));
    expect(glass.geometry.getIndex()?.count).toBe(columns * rows * 6);
  });

  it("spans the spec's rectangle, bulging towards the viewer at its middle", () => {
    const box = new Box3().setFromObject(glass);
    expect(box.min.z).toBeCloseTo(left, 6);
    expect(box.max.z).toBeCloseTo(right, 6);
    expect(box.min.y).toBeCloseTo(bottom, 6);
    expect(box.max.y).toBeCloseTo(top, 6);
    expect(box.min.x).toBeCloseTo(front, 6);
    // The corners are the furthest back: both parabolas at their ends.
    expect(box.max.x).toBeCloseTo(front + bulge[0] + bulge[1], 6);
  });

  it('maps its UV square across the tube: u left to right for the viewer (+z), v = 0 at the top', () => {
    const position = glass.geometry.getAttribute('position');
    const uv = glass.geometry.getAttribute('uv');
    const normal = glass.geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      expect(uv.getX(i)).toBeCloseTo((position.getZ(i) - left) / (right - left), 6);
      expect(uv.getY(i)).toBeCloseTo((top - position.getY(i)) / (top - bottom), 6);
      // Unit normals into the room (−x).
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
      expect(normal.getX(i)).toBeLessThan(-0.9);
    }
  });

  it('faces the viewer: a ray from the room hits it, with the UV under the ray; one from behind does not', () => {
    const target = new Vector3(front, top - (top - bottom) * 0.25, left + (right - left) * 0.75);
    const eye = target.clone().add(new Vector3(-1.5, 0, 0));
    const hit = new Raycaster(eye, new Vector3(1, 0, 0)).intersectObject(glass)[0];
    expect(hit?.uv?.x).toBeCloseTo(0.75, 3);
    expect(hit?.uv?.y).toBeCloseTo(0.25, 3);
    const behind = new Raycaster(target.clone().add(new Vector3(1.5, 0, 0)), new Vector3(-1, 0, 0));
    expect(behind.intersectObject(glass)).toHaveLength(0);
  });
});
