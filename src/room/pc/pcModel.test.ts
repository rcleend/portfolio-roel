import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { locatePc } from './pcModel';

/**
 * A stand-in for pc-base.glb: the glass, the CRT shell and the keyboard at their measured places
 * (geometry is float32, hence the 1e-6 comparisons).
 */
function fakePc() {
  const root = new Group();
  const material = new MeshBasicMaterial();
  const glass = new Mesh(new PlaneGeometry(0.356, 0.284), material);
  glass.name = 'PC_Interactive_Screen_base';
  glass.userData = { interaction_id: 'pc-screen', replaceable_screen: true };
  glass.position.set(-1.34, 1.071, -1.679);
  const crt = new Mesh(new BoxGeometry(0.46, 0.483, 0.432), material);
  crt.name = 'PC_Imported_CRT_base';
  crt.position.set(-1.34, 1.0265, -1.87);
  const keyboard = new Mesh(new BoxGeometry(0.49, 0.04, 0.2), material);
  keyboard.name = 'PC_Imported_Keyboard_base';
  keyboard.position.set(-1.345, 0.805, -1.505);
  root.add(glass, crt, keyboard);
  return { root, glass };
}

describe('locatePc', () => {
  it('finds the glass, which way it faces and the plane its rim sits on', () => {
    const { root, glass } = fakePc();
    const desk = new Group();
    const model = locatePc(root, desk);
    expect(model.glass).toBe(glass);
    expect(model.root).toBe(root);
    expect(model.desk).toBe(desk);
    expect(model.facing.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-9);
    expect(model.rim.minX).toBeCloseTo(-1.518, 6);
    expect(model.rim.maxX).toBeCloseTo(-1.162, 6);
    expect(model.rim.minY).toBeCloseTo(0.929, 6);
    expect(model.rim.maxY).toBeCloseTo(1.213, 6);
    expect(model.rim.z).toBeCloseTo(-1.679, 6);
  });

  it('insets the picture by the 10 mm tube border', () => {
    const { picture, rim } = locatePc(fakePc().root, new Group());
    expect(picture.minX - rim.minX).toBeCloseTo(0.01, 6);
    expect(rim.maxY - picture.maxY).toBeCloseTo(0.01, 6);
    expect(picture.z).toBe(rim.z);
  });

  it('measures the shell front and the keyboard for the light spill', () => {
    const model = locatePc(fakePc().root, new Group());
    expect(model.shellFrontZ).toBeCloseTo(-1.654, 6);
    expect(model.keyboardBounds.min.z).toBeCloseTo(-1.605, 6);
    expect(model.keyboardBounds.max.y).toBeCloseTo(0.825, 6);
  });

  it('refuses an asset without its interactive glass', () => {
    const { root, glass } = fakePc();
    glass.userData = {};
    expect(() => locatePc(root, new Group())).toThrow(/pc-screen/);
  });
});
