import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { attachTvLamp, createTvLampUniforms, TV_LAMP_LIGHT } from './tvLamp';

/** The lamp as GLTFLoader builds it from room.glb: a node with the light in its extras, base and globe below it. */
function room(): { root: Group; base: MeshBasicMaterial; globe: MeshBasicMaterial } {
  const root = new Group();
  const lamp = new Group();
  lamp.userData = {
    supplied_asset: 'tv-lamp',
    light: { center: [2.33, 0.6014, 0.46], radius: 0.08, color: [1, 0.72, 0.46], glow: 2.8 },
  };
  const base = new MeshBasicMaterial({ name: '01_TV_lamp_metal_BAKED_UNLIT', color: 0x080808 });
  const globe = new MeshBasicMaterial({ name: '01_TV_lamp_opaline_BAKED_UNLIT' });
  lamp.add(new Mesh(new BoxGeometry(), base), new Mesh(new BoxGeometry(), globe));
  root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: '01_TV_surfaces_BAKED_UNLIT' })), lamp);
  return { root, base, globe };
}

describe('attachTvLamp', () => {
  it('reads the light from the lamp in the room and puts its centre in the uniforms', () => {
    const uniforms = createTvLampUniforms();
    const light = attachTvLamp(room().root, uniforms);
    expect(light?.glow).toBe(2.8);
    expect(uniforms.uTvLamp.value.toArray()).toEqual([2.33, 0.6014, 0.46]);
    // The colour stays dark until the finish turns the light on.
    expect(uniforms.uTvLampColor.value.toArray()).toEqual([0, 0, 0]);
  });

  it('turns the globe into light past white and leaves the base and the room as baked', () => {
    const { root, base, globe } = room();
    attachTvLamp(root, createTvLampUniforms());
    expect(globe.color.r).toBeCloseTo(2.8);
    expect(globe.color.g).toBeCloseTo(0.72 * 2.8);
    expect(globe.color.b).toBeCloseTo(0.46 * 2.8);
    expect(base.color.getHex()).toBe(0x080808);
  });

  it('finds nothing in a room without the lamp', () => {
    const uniforms = createTvLampUniforms();
    expect(attachTvLamp(new Group().add(new Mesh()), uniforms)).toBeNull();
    expect(uniforms.uTvLamp.value.toArray()).toEqual([0, 0, 0]);
  });
});

describe('TV_LAMP_LIGHT', () => {
  it('shadows the light with the set and the cabinet, and stays off without the lamp', () => {
    expect(TV_LAMP_LIGHT.match(/tvLampChord\(position/g)).toHaveLength(2);
    expect(TV_LAMP_LIGHT).toContain('uTvLampColor.r <= 0.0');
  });
});
