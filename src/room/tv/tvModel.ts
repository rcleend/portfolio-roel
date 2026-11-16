import { Box3, type Mesh, type Object3D, Vector3 } from 'three';
import { TV_SPEC } from '../gen/roomSpec';
import type { UvRect } from './screenMapping';

/**
 * Facts about the CRT television that the room relies on: the generated set (gen/props/tvSet.ts) as `TV_SPEC`
 * (gen/roomSpec.ts) measures it, and its glass (tvGlass.ts). Only the bezel's aperture over the glass is a constant of
 * its own (docs/ROOM.md › TV geometry contract).
 */

/**
 * The part of the screen mesh's 0–1 UV square that is not hidden behind the bezel when seen straight on; its corners
 * are additionally rounded. The generated lip's aperture (tvSet.ts › APERTURE) over the glass's square.
 */
export const TV_SCREEN_APERTURE: UvRect = { minU: 0.058, minV: 0.05, maxU: 0.942, maxV: 0.95 };

/** Extra inset inside the aperture, so the picture clears the bezel's rounded corners. */
export const TV_PICTURE_INSET = 0.02;

export interface TvModel {
  /** The set: its casing, its glass and its prints, as one node (what the spotlight lights and bounces). */
  readonly root: Object3D;
  /** The curved glass; UV v = 0 is its top edge. */
  readonly screen: Mesh;
  /** World-space unit vector the screen faces, i.e. towards the viewer. */
  readonly facing: Vector3;
  /** World-space bounds of the whole set, plinth and rear shell included. */
  readonly bounds: Box3;
  /** Physical width / height of the screen mesh's UV square. */
  readonly screenAspect: number;
  /** Where the power LED's lens sits on the front panel, beside the POWER button. */
  readonly led: Vector3;
}

/** The TV as the spec has it, around `root` (which holds `screen`). */
export function tvModelOf(root: Object3D, screen: Mesh): TvModel {
  const { bounds, facing, glass, led } = TV_SPEC;
  return {
    root,
    screen,
    facing: new Vector3(...facing),
    bounds: new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)),
    screenAspect: (glass.right - glass.left) / (glass.top - glass.bottom),
    led: new Vector3(...led),
  };
}
