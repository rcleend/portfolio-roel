import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { GlowPatch } from '../tv/ScreenGlow';
import { type GlassPlane, insetPlane } from './glassPlane';
import { bezelEmitter, monitorGlowPatches } from './monitorGlow';
import { pcViewpoint } from './pcFraming';

const RIM: GlassPlane = { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, z: -1.679 };
/** A CRT shell around it, about the monitor's (gen/roomSpec.ts › PC_SPEC). */
const SHELL = new Box3(new Vector3(-1.57, 0.785, -2.086), new Vector3(-1.11, 1.268, -1.654));
const MODEL = {
  picture: insetPlane(RIM, 0.01),
  shellFrontZ: -1.654,
  keyboardBounds: new Box3(new Vector3(-1.59, 0.785, -1.605), new Vector3(-1.1, 0.825, -1.405)),
};
const EYE = pcViewpoint({ facing: new Vector3(0, 0, 1), rim: RIM, shellBounds: SHELL }, 1440 / 900).position;

/** How far a patch's lit side is from facing `direction`. */
const facingError = (patch: GlowPatch, direction: Vector3) =>
  new Vector3().crossVectors(patch.right, patch.up).distanceTo(direction);

describe('monitorGlowPatches', () => {
  const patches = monitorGlowPatches(MODEL, EYE);
  const [bezel, desk, keyboard] = patches as [GlowPatch, GlowPatch, GlowPatch];

  it('makes three patches: bezel lip, desk top and keyboard deck', () => {
    expect(patches).toHaveLength(3);
  });

  it('lays the bezel halo on the shell front, facing the viewer, dark over the picture itself', () => {
    expect(bezel.centre.z).toBeCloseTo(-1.651, 9);
    expect(facingError(bezel, new Vector3(0, 0, 1))).toBe(0);
    expect(bezel.centre.x).toBeCloseTo(-1.34, 9);
    expect(bezel.fillEmitter).toBe(false);
    expect([bezel.falloff, bezel.strength]).toEqual([0.012, 0.3]);
    // Larger than the picture, so the halo has room to fade.
    expect(bezel.size.x).toBeGreaterThan(0.336 + 0.1);
  });

  it('lays the desk pool on the desk top, from the monitor towards the viewer', () => {
    expect(desk.centre.y).toBeCloseTo(0.786, 9);
    expect(facingError(desk, new Vector3(0, 1, 0))).toBe(0);
    expect(desk.size.toArray()).toEqual([1, 0.7]);
    // Its near edge is 0.6 m in front of the shell; its emitter sits at the monitor's foot.
    expect(desk.centre.z + 0.35).toBeCloseTo(-1.654 + 0.6, 9);
    expect(desk.centre.z - desk.emitterCentre.y).toBeCloseTo(-1.654, 9);
    expect(desk.fillEmitter).toBe(true);
    expect([desk.falloff, desk.strength]).toEqual([0.25, 0.3]);
  });

  it('lays the keyboard light just above its keys, over its footprint plus a margin', () => {
    expect(keyboard.centre.y).toBeCloseTo(0.826, 9);
    expect(facingError(keyboard, new Vector3(0, 1, 0))).toBe(0);
    expect(keyboard.size.x).toBeCloseTo(0.49 + 0.1, 9);
    expect(keyboard.size.y).toBeCloseTo(0.2 + 0.1, 9);
    expect(keyboard.centre.x).toBeCloseTo(-1.345, 9);
    // Brightest along the back edge, under the screen.
    expect(keyboard.centre.z - keyboard.emitterCentre.y).toBeCloseTo(-1.605, 9);
    expect([keyboard.falloff, keyboard.strength]).toEqual([0.15, 0.25]);
  });
});

describe('bezelEmitter', () => {
  it('is the picture as the settled eye sees it on the bezel plane, rounded corners included', () => {
    const { centre, halfSize, radius } = bezelEmitter(MODEL, EYE);
    const scale = (-1.651 - EYE.z) / (-1.679 - EYE.z);
    expect(halfSize.x).toBeCloseTo(0.168 * scale, 9);
    expect(halfSize.y).toBeCloseTo(0.132 * scale, 9);
    expect(radius).toBeCloseTo(0.006 * scale, 9);
    // The eye looks at the glass from just below its middle (the chin is framed too).
    expect(centre.x).toBeCloseTo(0, 9);
    expect(centre.y).toBeCloseTo((EYE.y - 1.071) * (1 - scale), 9);
  });

  it('projects a picture corner onto the bezel plane along the eye ray', () => {
    const { centre, halfSize } = bezelEmitter(MODEL, EYE);
    const corner = new Vector3(MODEL.picture.maxX, MODEL.picture.maxY, MODEL.picture.z);
    const onBezel = EYE.clone().lerp(corner, (-1.651 - EYE.z) / (corner.z - EYE.z));
    expect(-1.34 + centre.x + halfSize.x).toBeCloseTo(onBezel.x, 9);
    expect(1.071 + centre.y + halfSize.y).toBeCloseTo(onBezel.y, 9);
  });
});
