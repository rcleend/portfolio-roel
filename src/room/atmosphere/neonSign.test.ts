import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { attachNeonSign, createNeonSignUniforms, NEON_SIGN_LIGHT } from './neonSign';

const LIGHT = {
  center: [2.7582, 0.6709, -0.9274],
  right: [0, 0, 1],
  up: [0.1736, 0.9848, 0],
  letter: { half: [0.0692, 0.1005], color: [1, 0.1, 0.035], glow: 2.6 },
  border: { half: [0.1362, 0.1764], color: [0.05, 0.24, 1], glow: 2.6 },
};

/** The sign as GLTFLoader builds it from room.glb: a node with the light in its extras, the two tubes below it. */
function room(): { root: Group; border: MeshBasicMaterial; letter: MeshBasicMaterial; wall: MeshBasicMaterial } {
  const root = new Group();
  const sign = new Group();
  sign.userData = { supplied_asset: 'neon-sign', light: LIGHT };
  const border = new MeshBasicMaterial({ name: '01_TV_neon_blue_BAKED_UNLIT' });
  const letter = new MeshBasicMaterial({ name: '01_TV_neon_red_BAKED_UNLIT' });
  const wall = new MeshBasicMaterial({ name: '01_TV_surfaces_BAKED_UNLIT', color: 0x101010 });
  sign.add(new Mesh(new BoxGeometry(), border), new Mesh(new BoxGeometry(), letter));
  root.add(new Mesh(new BoxGeometry(), wall), sign);
  return { root, border, letter, wall };
}

describe('attachNeonSign', () => {
  it("reads the sign's plane and its tubes' extents into the uniforms", () => {
    const uniforms = createNeonSignUniforms();
    expect(attachNeonSign(room().root, uniforms)?.letter.glow).toBe(2.6);
    expect(uniforms.uNeon.value.toArray()).toEqual(LIGHT.center);
    expect(uniforms.uNeonUp.value.toArray()).toEqual(LIGHT.up);
    expect(uniforms.uNeonHalf.value.toArray()).toEqual([...LIGHT.letter.half, ...LIGHT.border.half]);
    // The light stays off until the finish turns it on.
    expect(uniforms.uNeonRed.value.toArray()).toEqual([0, 0, 0]);
    expect(uniforms.uNeonBlue.value.toArray()).toEqual([0, 0, 0]);
  });

  it('turns each tube into light of its own colour past white and leaves the room as baked', () => {
    const { root, border, letter, wall } = room();
    attachNeonSign(root, createNeonSignUniforms());
    expect(letter.color.toArray().map((value) => +value.toFixed(4))).toEqual([2.6, 0.26, 0.091]);
    expect(border.color.toArray().map((value) => +value.toFixed(4))).toEqual([0.13, 0.624, 2.6]);
    expect(wall.color.getHex()).toBe(0x101010);
  });

  it('finds nothing in a room without the sign', () => {
    const uniforms = createNeonSignUniforms();
    expect(attachNeonSign(new Group().add(new Mesh()), uniforms)).toBeNull();
    expect(uniforms.uNeon.value.toArray()).toEqual([0, 0, 0]);
  });
});

describe('NEON_SIGN_LIGHT', () => {
  it("shadows both tubes with the lamp's boxes for the set and the cabinet, and stays off without the sign", () => {
    expect(NEON_SIGN_LIGHT.match(/tvLampChord\(position/g)).toHaveLength(2);
    expect(NEON_SIGN_LIGHT.match(/neonTube\(position/g)).toHaveLength(2);
    expect(NEON_SIGN_LIGHT).toContain('uNeonRed.r <= 0.0');
  });
});
