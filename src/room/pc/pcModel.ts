import { Box3, type Mesh, type Object3D, type Vector3 } from 'three';
import { averageNormal, meshesOf } from '../assets/modelQueries';
import { type GlassPlane, insetPlane } from './glassPlane';

/**
 * Facts about the computer on the desk (pc-base.glb and room.glb's `02_Desk`, room revision 6)
 * that the room relies on. Everything findable at runtime is found at runtime; only the
 * picture's border and corner radius are design constants.
 */

/** `userData.interaction_id` of the monitor's glass, exported from Blender. */
export const PC_SCREEN_INTERACTION_ID = 'pc-screen';

/** Uniform dark tube border between the glass rim and the picture, like the TV's thin border. */
export const PC_PICTURE_BORDER = 0.01;
/** Rounded raster corners of the picture. */
export const PC_PICTURE_RADIUS = 0.006;
/** The unlit tube: the TV's `TUBE` constant (crtShader.ts), sRGB-encoded. */
export const PC_TUBE_COLOR = '#070a09';

const CRT_NAME = 'PC_Imported_CRT_base';
const KEYBOARD_NAME = 'PC_Imported_Keyboard_base';

export interface PcModel {
  /** The device: CRT, glass, keyboard and mouse. */
  readonly root: Object3D;
  /** The desk with its chair, lamp, tower and clutter (`02_Desk`). */
  readonly desk: Object3D;
  /** The monitor's curved glass; its UVs are a planar projection with v = 0 at the top. */
  readonly glass: Mesh;
  /** World-space unit vector the glass faces, i.e. towards the viewer. */
  readonly facing: Vector3;
  /** The plane the glass rim sits on (the glass's back-most z); the picture is registered to it. */
  readonly rim: GlassPlane;
  /** The picture: the rim inset by the tube border. */
  readonly picture: GlassPlane;
  /** World z of the CRT shell's front face, where the bezel lip catches the screen's light. */
  readonly shellFrontZ: number;
  /** The CRT shell: the computer's outline, beyond which a click is a click on the room. */
  readonly shellBounds: Box3;
  readonly keyboardBounds: Box3;
}

export function locatePc(root: Object3D, desk: Object3D): PcModel {
  root.updateMatrixWorld(true);
  const glass = meshesOf(root).find(
    (mesh) => mesh.userData.replaceable_screen === true && mesh.userData.interaction_id === PC_SCREEN_INTERACTION_ID,
  );
  const crt = root.getObjectByName(CRT_NAME);
  const keyboard = root.getObjectByName(KEYBOARD_NAME);
  if (!glass || !crt || !keyboard) {
    throw new Error(`PC asset is missing its "${PC_SCREEN_INTERACTION_ID}" glass, CRT or keyboard`);
  }

  const glassBounds = new Box3().setFromObject(glass);
  const shellBounds = new Box3().setFromObject(crt);
  const rim: GlassPlane = {
    minX: glassBounds.min.x,
    maxX: glassBounds.max.x,
    minY: glassBounds.min.y,
    maxY: glassBounds.max.y,
    z: glassBounds.min.z,
  };
  return {
    root,
    desk,
    glass,
    facing: averageNormal(glass.geometry).transformDirection(glass.matrixWorld),
    rim,
    picture: insetPlane(rim, PC_PICTURE_BORDER),
    shellFrontZ: shellBounds.max.z,
    shellBounds,
    keyboardBounds: new Box3().setFromObject(keyboard),
  };
}
